export interface Env {
  SHEET_URL: string;
  API_KEY: string;
  CACHE_SECONDS?: string;
}

const MAX_BODY_BYTES = 64 * 1024;

export interface Row {
  phone: string;
  setor: string;
  atendente: string;
}

/** DDD + últimos 8 dígitos: casa o número com/sem 55 e com/sem o nono dígito. */
export function phoneKey(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.length >= 10 ? digits.slice(0, 2) + digits.slice(-8) : digits;
}

/** Aceita o link normal do Sheets (/d/<id>/edit#gid=N) e troca pelo export TSV da aba;
 *  qualquer outra URL (ex.: "Publicar na Web" em TSV) passa intacta. */
export function toTsvUrl(url: string): string {
  const id = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id || id === "e") return url;
  const gid = url.match(/gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=tsv&gid=${gid}`;
}

/** Planilha em TSV, colunas A=telefone, B=setor, C=atendente; 1ª linha é cabeçalho. */
export function parseSheet(tsv: string): Row[] {
  return tsv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter(([phone, setor, atendente]) => phone && setor && atendente)
    .map(([phone, setor, atendente]) => ({
      phone: phoneKey(phone),
      setor,
      atendente,
    }));
}

// ponytail: cache em memória por isolate do Worker — cada instância relê a
// planilha por conta própria; troque por Cache API/KV se o volume crescer.
let cache: { rows: Row[]; at: number } = { rows: [], at: 0 };

// Falha ao buscar a planilha mantém a última cópia boa — a IA só perde o
// atendente e segue transferindo para o setor.
async function getRows(env: Env): Promise<Row[]> {
  const cacheMs = Number(env.CACHE_SECONDS ?? 60) * 1000;
  if (Date.now() - cache.at < cacheMs) return cache.rows;
  try {
    const res = await fetch(toTsvUrl(env.SHEET_URL), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`planilha respondeu ${res.status}`);
    // Planilha privada: o Google redireciona para a tela de login (HTML, 200).
    if (res.headers.get("content-type")?.includes("text/html")) {
      throw new Error("planilha não está compartilhada com 'qualquer pessoa com o link'");
    }
    cache = { rows: parseSheet(await res.text()), at: Date.now() };
  } catch (error) {
    console.error("[sheet] falha ao atualizar, usando cópia anterior:", error);
  }
  return cache.rows;
}

const TOOL = {
  name: "consultar_atendente_responsavel",
  description:
    "Retorna o atendente responsável por este contato em cada setor. Chame ANTES de " +
    "transferir para um setor: se houver atendente para o setor escolhido, transfira " +
    "para esse atendente nesse setor; se não houver, transfira só para o setor.",
  inputSchema: {
    type: "object",
    properties: {
      phone: {
        type: "string",
        description: "Telefone do contato (preenchido automaticamente).",
      },
    },
    required: ["phone"],
  },
};

// biome-ignore lint/suspicious/noExplicitAny: mensagem JSON-RPC vinda da rede
export async function handleRpc(msg: any, rows: () => Promise<Row[]>) {
  const reply = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id: msg.id ?? null,
    error: { code, message },
  });

  switch (msg?.method) {
    case "initialize":
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "innovtalk-customer-portfolio-mcp", version: "1.0.0" },
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: [TOOL] });
    case "tools/call": {
      if (msg.params?.name !== TOOL.name) return fail(-32602, "Tool desconhecida");
      const key = phoneKey(String(msg.params?.arguments?.phone ?? ""));
      const responsaveis = key
        ? (await rows())
            .filter((row) => row.phone === key)
            .map(({ setor, atendente }) => ({ setor, atendente }))
        : [];
      return reply({
        content: [{ type: "text", text: JSON.stringify({ responsaveis }) }],
      });
    }
  }
  if (msg?.id === undefined) return null; // notificação: sem resposta
  return fail(-32601, "Método não suportado");
}

/** Compara os SHA-256 byte a byte sem parar no primeiro diferente: tempo
 *  constante e sem vazar o tamanho da chave. Web Crypto puro — roda igual
 *  no Workers e no Node, sem `nodejs_compat`. */
async function authorized(credential: string | null, apiKey: string): Promise<boolean> {
  if (!credential) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [credential, apiKey].map(
      async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
    ),
  );
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.SHEET_URL || !env.API_KEY) {
      return new Response("Defina SHEET_URL e API_KEY", { status: 500 });
    }
    if (request.method !== "POST") return new Response(null, { status: 405 });

    const credential =
      request.headers.get("x-api-key") ??
      request.headers.get("authorization")?.replace(/^Bearer /i, "") ??
      null;
    if (!(await authorized(credential, env.API_KEY))) {
      return new Response(null, { status: 401 });
    }

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

    let msg: unknown;
    try {
      msg = JSON.parse(body);
    } catch {
      return new Response(null, { status: 400 });
    }

    const out = await handleRpc(msg, () => getRows(env));
    if (!out) return new Response(null, { status: 202 });
    return Response.json(out);
  },
};
