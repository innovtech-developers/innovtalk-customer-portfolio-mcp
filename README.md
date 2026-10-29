# InnovTalk — Carteira de Clientes (MCP)

[![CI](https://github.com/innovtech-developers/innovtalk-customer-portfolio-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/innovtech-developers/innovtalk-customer-portfolio-mcp/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

**Carteirização de clientes** para o assistente virtual do **InnovTalk**: cada cliente tem o seu atendente
responsável em cada setor, definido numa **planilha do Google Sheets** que a sua equipe mantém.

Com este servidor [MCP](https://modelcontextprotocol.io), a transferência automática deixa de ser só "para o
setor" e passa a ser "para o setor **e** para o atendente da carteira daquele cliente" — sem configurar
contato por contato.

Roda de graça no plano gratuito do Cloudflare Workers.

## Como funciona

1. O cliente manda mensagem e o assistente virtual identifica o assunto (ex.: boleto → Financeiro).
2. Antes de transferir, o assistente consulta este MCP com o telefone do contato.
3. O MCP procura o telefone na planilha e devolve os responsáveis: `Financeiro → Maria`.
4. O assistente transfere o atendimento para o setor Financeiro, já atribuído à Maria. Se o contato não
   estiver na planilha, transfere só para o setor, como já fazia.

## O que você precisa

- InnovTalk com a integração **Zappy** e um assistente virtual respondendo.
- Uma conta no [Cloudflare](https://dash.cloudflare.com/sign-up) (o plano gratuito basta).
- Uma planilha no Google Sheets.
- Node.js 24+ no computador de onde for publicar.

---

## Passo 1 — Monte a planilha

Três colunas, **nesta ordem**: A = telefone, B = setor, C = atendente. A primeira linha é sempre tratada como
cabeçalho e ignorada — o texto dela não importa, mas não a apague, senão o primeiro contato é descartado.
Colunas a partir da D são ignoradas.

| telefone        | setor      | atendente   |
| --------------- | ---------- | ----------- |
| (11) 98765-4321 | Comercial  | João Silva  |
| (11) 98765-4321 | Financeiro | Maria Souza |
| 21 99999-0000   | Comercial  | Pedro Lima  |
- **Uma linha por contato e setor.** O mesmo contato pode ter um atendente diferente em cada setor.
- **Telefone em qualquer formato:** com ou sem `+55`, com ou sem o nono dígito, com ou sem pontuação.
- **Setor:** o nome do setor como está na Zappy. Acentos, maiúsculas e hífens não importam
  (`Atendimento Geral` = `Atendimento - Geral`), mas palavras a mais ou a menos sim
  (`Financeiro` ≠ `Financeiro Cobrança`).
- **Atendente:** de preferência o nome completo como está na Zappy. Só o primeiro nome funciona se não houver
  outro atendente com o mesmo primeiro nome.
- **O atendente precisa fazer parte daquele setor na Zappy.** Esse é o erro mais comum — veja
  [Como os nomes são comparados](#como-os-nomes-são-comparados).

Linhas com alguma coluna vazia são ignoradas. O MCP lê só a aba indicada no link (veja abaixo).

### Compartilhe a planilha

Em **Compartilhar → Acesso geral**, escolha **"Qualquer pessoa com o link"** como **Leitor** e copie o link
da barra do navegador, com a aba certa aberta (ex.: `https://docs.google.com/spreadsheets/d/1AbC.../edit#gid=0`).

O link de **Arquivo → Compartilhar → Publicar na Web** em formato `.tsv` também funciona.

> **Privacidade:** quem tiver o link consegue ver a planilha. Não coloque nada além das três colunas e
> não divulgue o link. Veja [Segurança e privacidade](#segurança-e-privacidade).

## Passo 2 — Publique no Cloudflare

```bash
git clone https://github.com/innovtech-developers/innovtalk-customer-portfolio-mcp.git
cd innovtalk-customer-portfolio-mcp

npx wrangler login                    # abre o navegador para entrar na sua conta Cloudflare
npx wrangler secret put SHEET_URL     # cole o link da planilha
npx wrangler secret put API_KEY       # cole uma chave secreta (veja abaixo)
npx wrangler deploy
```

O `deploy` mostra a URL do seu MCP, algo como `https://innovtalk-customer-portfolio-mcp.<sua-conta>.workers.dev`.
Guarde essa URL e a chave.

### Gerando a `API_KEY`

É uma senha que **você mesmo cria** — não é chave do Google nem do Cloudflare. Ela impede que alguém que
descubra a URL do MCP consulte os responsáveis dos seus contatos.

```bash
openssl rand -hex 32
```

Use o mesmo valor aqui e no InnovTalk (passo 3).

### Configurações opcionais

| Variável        | Padrão | O que faz                                                    |
| --------------- | ------ | ------------------------------------------------------------ |
| `CACHE_SECONDS` | `60`   | De quanto em quanto tempo, no máximo, o MCP relê a planilha. |

Para mudar, adicione ao `wrangler.toml` e publique de novo:

```toml
[vars]
CACHE_SECONDS = "120"
```

## Passo 3 — Configure o assistente virtual no InnovTalk

### 3.1 Adicione a ferramenta

Nas ferramentas do assistente virtual, clique em **Adicionar ferramenta**:

- **Tipo:** Servidor personalizado
- **URL:** a URL do passo 2
- **Autenticação:** Chave de API, com o valor da `API_KEY` (Token de acesso também funciona)

Use **Testar ferramenta** para confirmar a conexão. O telefone do contato é enviado automaticamente em toda
consulta — o assistente nunca pergunta ao cliente.

### 3.2 Ligue as duas transferências automáticas

Na integração Zappy do assistente, ative **Transferência automática para setor** e **Transferência
automática para usuário**. As duas são necessárias:

- Sem a de setor, o assistente não transfere pelo assunto.
- Sem a de usuário, o assistente não lê a regra do item 3.4 e o atendimento cai só no setor, sem o atendente.

### 3.3 Contexto de transferência para setor

O assistente **não recebe automaticamente a lista de setores** da Zappy e, sem instrução, só transfere
quando o cliente pede explicitamente ("quero falar com o financeiro"). Para transferir pelo assunto, o
contexto precisa listar os setores e dizer quando ir para cada um:

```text
Setores disponíveis (use exatamente estes nomes): Comercial, Financeiro, Suporte.

Identifique o assunto do cliente e transfira assim que ele estiver claro,
mesmo que o cliente não peça para ser transferido:
- Comercial: orçamento, preços, planos, contratação, proposta.
- Financeiro: boleto, 2ª via, nota fiscal, cobrança, pagamento.
- Suporte: erro, algo não funciona, dúvida de uso do sistema.

Se o assunto ainda não estiver claro, faça uma pergunta curta antes de transferir.
```

Troque setores e assuntos pelos da sua empresa.

### 3.4 Contexto de transferência para usuário

```text
Antes de transferir para um setor, chame consultar_atendente_responsavel.
Se vier um atendente para o setor escolhido, transfira para esse atendente nesse setor.
Se não vier, transfira só para o setor.
```

Pronto. Alterações na planilha passam a valer em até `CACHE_SECONDS` (1 minuto, por padrão). Setores e
atendentes novos ou renomeados na Zappy levam até 5 minutos para valer no InnovTalk.

---

## Resultado esperado

| Cliente diz                   | Na planilha                  | Transferência                             |
| ----------------------------- | ---------------------------- | ----------------------------------------- |
| "preciso da 2ª via do boleto" | Financeiro → Maria Souza     | Financeiro, para a Maria                  |
| "preciso da 2ª via do boleto" | contato sem linha Financeiro | Financeiro, sem atendente                 |
| "preciso da 2ª via do boleto" | contato não está na planilha | Financeiro, sem atendente                 |
| "oi, tudo bem?"               | —                            | nenhuma; o assistente conversa e pergunta |

## Como os nomes são comparados

O InnovTalk confere o setor e o atendente contra a Zappy antes de transferir — um nome errado nunca manda o
cliente para o lugar errado, mas pode impedir a transferência.

**Setor:** precisa ser igual ao da Zappy, ignorando acentos, maiúsculas e pontuação.

**Atendente:**

1. Nome completo igual ao da Zappy (ignorando acentos, maiúsculas e pontuação).
2. Se a planilha tiver só uma palavra (ex.: `Maria`), vale o primeiro nome — desde que só um atendente
   tenha esse primeiro nome.
3. Dois atendentes com o mesmo nome: o assistente pergunta ao cliente qual deles.

**Atendente + setor:**

| Na Zappy, o atendente está…                 | Resultado                                                          |
| ------------------------------------------- | ------------------------------------------------------------------ |
| no setor da planilha                        | ✅ vai para o atendente, nesse setor                               |
| em **um** outro setor só                    | ⚠️ vai para o atendente, mas no setor **dele**, não no da planilha |
| em **vários** setores, nenhum o da planilha | ❌ o assistente pergunta ao cliente qual setor — evite             |

Mantenha a planilha alinhada com os setores de cada atendente na Zappy.

## Problemas comuns

| Sintoma                                                | Causa provável                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Não transfere                                          | Contexto do item 3.3 não manda transferir pelo assunto, ou transferência para setor desligada.             |
| Vai para o setor, mas sem o atendente                  | Transferência para usuário desligada; telefone não está na planilha; nome do atendente diferente da Zappy. |
| Assistente diz ao cliente que não conseguiu transferir | Nome do setor no contexto ou na planilha diferente do da Zappy.                                            |
| Assistente pergunta ao cliente qual setor              | Atendente da planilha não pertence àquele setor na Zappy.                                                  |
| Nada da planilha é usado                               | Planilha não está compartilhada como "Qualquer pessoa com o link", ou link errado.                         |

Erros ao ler a planilha aparecem nos logs do Worker: painel do Cloudflare → **Workers** →
**innovtalk-customer-portfolio-mcp** → **Logs**. Se a planilha ficar fora do ar, o MCP continua usando a última
cópia que conseguiu ler.

## Segurança e privacidade

- **Chave de acesso:** toda requisição precisa da `API_KEY` (cabeçalho `X-Api-Key` ou
  `Authorization: Bearer`). Sem ela, a resposta é `401`. A comparação é feita em tempo constante.
- **HTTPS:** o Cloudflare só expõe o Worker por HTTPS.
- **O MCP só devolve setor e nome do atendente** — nunca telefones nem o restante da planilha.
- **A planilha fica acessível a quem tiver o link.** Ela contém telefones de clientes, que são dados pessoais
  (LGPD): restrinja quem conhece o link e mantenha só as três colunas necessárias.
- Guarde `SHEET_URL` e `API_KEY` só como secrets do Cloudflare (`wrangler secret put`), nunca no código.

## Limites e custos

O plano gratuito do Cloudflare Workers permite 100 mil requisições por dia. O InnovTalk faz poucas chamadas:
uma consulta por transferência, mais algumas por hora para checar as ferramentas disponíveis. A leitura da
planilha não conta como requisição.

Planilhas de até alguns milhares de linhas funcionam sem problema.

## Referência da ferramenta

**`consultar_atendente_responsavel`**

Entrada (preenchida pelo InnovTalk):

```json
{ "phone": "5511987654321" }
```

Saída:

```json
{ "responsaveis": [{ "setor": "Financeiro", "atendente": "Maria Souza" }] }
```

Lista vazia quando o contato não está na planilha.

## Desenvolvimento

```bash
pnpm install        # também instala os hooks de git
pnpm test           # testes com o test runner do Node, sem Cloudflare
pnpm lint           # Biome
pnpm typecheck
```

Para rodar localmente, crie um `.dev.vars` (já ignorado pelo git):

```text
SHEET_URL=https://docs.google.com/spreadsheets/d/.../edit#gid=0
API_KEY=uma-chave-local
```

e rode `npx wrangler dev`. Depois de mudar o `wrangler.toml`, gere os tipos de novo com `npx wrangler types`.

## Contribuindo

Contribuições são bem-vindas — leia o [guia de contribuição](CONTRIBUTING.md). Em resumo: commits no padrão
Conventional Commits em inglês, código formatado pelo Biome e CI verde.

## Licença

[MIT](LICENSE)
