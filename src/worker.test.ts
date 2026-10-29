import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { handleRpc, parseSheet, phoneKey, toTsvUrl } from "./worker.ts";

test("toTsvUrl converte o link de edição e preserva os demais", () => {
  assert.equal(
    toTsvUrl("https://docs.google.com/spreadsheets/d/AbC-12_x/edit?gid=987#gid=987"),
    "https://docs.google.com/spreadsheets/d/AbC-12_x/export?format=tsv&gid=987",
  );
  assert.equal(
    toTsvUrl("https://docs.google.com/spreadsheets/d/AbC-12_x/edit?usp=sharing"),
    "https://docs.google.com/spreadsheets/d/AbC-12_x/export?format=tsv&gid=0",
  );
  const published = "https://docs.google.com/spreadsheets/d/e/2PACX-1v/pub?output=tsv";
  assert.equal(toTsvUrl(published), published);
});

test("phoneKey casa variações do mesmo número", () => {
  const key = phoneKey("5511987654321");
  assert.equal(phoneKey("(11) 98765-4321"), key);
  assert.equal(phoneKey("11 8765-4321"), key); // sem nono dígito
  assert.equal(phoneKey("+55 11 8765-4321"), key);
  assert.notEqual(phoneKey("5521987654321"), key); // outro DDD
});

const sheet = [
  "telefone\tsetor\tatendente",
  "(11) 98765-4321\tComercial\tJoão",
  "5511987654321\tFinanceiro\tMaria",
  "21 99999-0000\tComercial\tPedro",
  "\tSuporte\tSem telefone",
].join("\n");

test("parseSheet ignora cabeçalho e linhas incompletas", () => {
  assert.equal(parseSheet(sheet).length, 3);
});

test("tools/call devolve os responsáveis do contato", async () => {
  const rows = async () => parseSheet(sheet);
  const out = await handleRpc(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "consultar_atendente_responsavel",
        arguments: { phone: "5511987654321" },
      },
    },
    rows,
  );
  // biome-ignore lint/suspicious/noExplicitAny: inspeção do payload
  const { responsaveis } = JSON.parse((out as any).result.content[0].text);
  assert.deepEqual(responsaveis, [
    { setor: "Comercial", atendente: "João" },
    { setor: "Financeiro", atendente: "Maria" },
  ]);

  const empty = await handleRpc(
    {
      id: 2,
      method: "tools/call",
      params: { name: "consultar_atendente_responsavel", arguments: {} },
    },
    rows,
  );
  // biome-ignore lint/suspicious/noExplicitAny: inspeção do payload
  assert.equal((empty as any).result.content[0].text, '{"responsaveis":[]}');
});

test("notificação não tem resposta e método desconhecido dá erro", async () => {
  const rows = async () => [];
  assert.equal(await handleRpc({ method: "notifications/initialized" }, rows), null);
  // biome-ignore lint/suspicious/noExplicitAny: inspeção do payload
  const out = (await handleRpc({ id: 3, method: "x" }, rows)) as any;
  assert.equal(out.error.code, -32601);
});

test("fetch do Worker: autentica e responde pela planilha", async () => {
  const env = {
    API_KEY: "segredo",
    SHEET_URL: `data:text/plain,${encodeURIComponent(sheet)}`,
  };
  const call = (headers: Record<string, string>, body: object, method = "POST") =>
    worker.fetch(
      new Request("https://mcp.test/", {
        method,
        headers,
        body: method === "POST" ? JSON.stringify(body) : undefined,
      }),
      env,
    );
  const toolCall = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "consultar_atendente_responsavel",
      arguments: { phone: "21999990000" },
    },
  };

  assert.equal((await call({}, toolCall)).status, 401);
  assert.equal((await call({ "x-api-key": "errado" }, toolCall)).status, 401);
  assert.equal((await call({}, {}, "GET")).status, 405);
  assert.equal(
    (await call({ "x-api-key": "segredo" }, { method: "notifications/initialized" })).status,
    202,
  );

  const res = await call({ authorization: "Bearer segredo" }, toolCall);
  assert.equal(res.status, 200);
  // biome-ignore lint/suspicious/noExplicitAny: inspeção do payload
  const out = (await res.json()) as any;
  assert.deepEqual(JSON.parse(out.result.content[0].text).responsaveis, [
    { setor: "Comercial", atendente: "Pedro" },
  ]);

  const misconfigured = await worker.fetch(new Request("https://mcp.test/", { method: "POST" }), {
    API_KEY: "",
    SHEET_URL: "",
  });
  assert.equal(misconfigured.status, 500);
});
