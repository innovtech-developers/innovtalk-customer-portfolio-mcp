# Como contribuir

Obrigado pelo interesse! Correções, melhorias na documentação e novas ideias são bem-vindas.

## Antes de começar

- **Bug ou dúvida:** abra uma issue descrevendo o que aconteceu, o que esperava e como reproduzir.
  Nunca cole telefones reais, links de planilha ou a sua `API_KEY`.
- **Mudança de comportamento ou funcionalidade nova:** abra uma issue antes do PR para alinharmos a ideia.
  O projeto é propositalmente pequeno — sem dependências em produção e um único arquivo (`src/worker.ts`).

## Ambiente

Requisitos: Node.js 24+ e pnpm (o Corepack escolhe a versão certa pelo `package.json`).

```bash
pnpm install        # também instala os hooks de git (lefthook)
pnpm test           # testes
pnpm lint           # lint e formatação (Biome)
pnpm lint:fix       # corrige o que der automaticamente
pnpm typecheck      # checagem de tipos
```

Para testar contra uma planilha real, veja **Desenvolvimento** no [README](README.md).

## Padrões

### Commits

[Conventional Commits](https://www.conventionalcommits.org/) **em inglês** — o hook `commit-msg` recusa
mensagens fora do padrão:

```text
<tipo>(<escopo opcional>): <descrição>

feat(sheet): accept phone numbers with extension
fix(auth): reject empty bearer token
docs: explain sector matching rules
```

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
Use `!` para mudança incompatível (ex.: `feat!: rename tool`) — renomear a tool ou mudar as colunas da
planilha quebra a configuração de quem já usa.

### Código

- Formatação e lint pelo **Biome**: o hook `pre-commit` formata os arquivos alterados.
- Antes do push, o hook `pre-push` roda typecheck e testes.
- Sem dependências de produção: o Worker usa só APIs da plataforma (`fetch`, Web Crypto).
- Toda lógica nova vem com teste em `src/worker.test.ts`.
- Comentários e documentação em português; nomes de código em inglês.

## Pull requests

1. Faça um fork e crie um branch a partir da `main` (ex.: `fix/phone-with-extension`).
2. Mantenha o PR focado em uma mudança.
3. Atualize o README se a mudança afetar quem configura o MCP.
4. O CI (lint, typecheck e testes) precisa passar.

Ao contribuir, você concorda que sua contribuição seja licenciada sob a [licença MIT](LICENSE) do projeto.
