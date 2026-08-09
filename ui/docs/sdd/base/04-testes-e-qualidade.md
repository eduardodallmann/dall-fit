# Testes e qualidade da UI

## Ferramentas

- Vitest com ambiente JSDOM;
- Testing Library e `user-event`;
- `@testing-library/jest-dom` para matchers semânticos;
- Mock Service Worker para requests HTTP;
- Playwright com Chromium para testes integrados comportamentais;
- V8 para cobertura;
- ESLint type-aware com React Hooks e Fast Refresh configurados na raiz.

As duas unidades referenciadas pelo build da UI compilam com `strict: true`:
`tsconfig.app.json` cobre aplicação e testes, enquanto `tsconfig.node.json` cobre
as configurações de Vite e Playwright. Nenhuma delas desabilita individualmente
uma verificação da família estrita.

## Unitários e componentes

Testes usam `*.test.ts` ou `*.test.tsx` próximos ao código. O setup comum fica em
`tests/setup.ts`.

Preferir queries acessíveis (`role`, nome, label e texto) e interação realista com
`user-event`. Testar comportamento percebido pelo usuário, não estado interno ou
detalhes de implementação.

Quando o comportamento depender da API, o teste usa o servidor Node do MSW e o
mesmo handler disponível no desenvolvimento. Não mockar `fetch`, o cliente HTTP ou
o módulo de service diretamente em testes de rota. Overrides locais com
`mockServer.use(...)` são permitidos para erros e casos específicos e devem ser
restaurados após cada teste.

Vercel Analytics é isolado nos testes: a composição global substitui o componente
oficial para confirmar uma única montagem sem carregar coleta externa; testes da
fronteira substituem apenas `track` e validam schema, normalização, deduplicação,
privacidade e no-op em falha. Componentes e providers substituem a fronteira
interna para verificar os eventos produzidos por interações acessíveis. Valores de
campos, IDs, query e mensagens de erro não podem aparecer nos asserts de emissão.

Playwright mantém a integração real entre componentes e navegação, mas não cria
handler MSW, `page.route` ou implementação paralela para Analytics. Recebimento de
pageviews no dashboard da Vercel é uma verificação manual de implantação.

## Testes integrados

Playwright sobe a UI real com Vite, habilita o MSW no navegador e cobre:

- comportamento integrado de uma rota;
- interação entre componentes, hooks e cliente HTTP;
- estados retornados pelos handlers MSW;
- navegação e dados preservados entre rotas de um flow.

Specs de rota vivem em `tests/integration/routes/`; specs de jornada vivem em
`tests/integration/flows/`. Eles não acessam a API real, não geram cobertura e não
substituem os E2E do backend. Organização, configuração e comandos estão em
`07-testes-integrados-playwright.md`.

## Princípio de teste

Testes unitários, de componentes e integrados priorizam regras de negócio e
comportamentos observáveis. Cada teste deve proteger uma decisão, validação, estado,
caminho de navegação, resposta da API ou risco descrito no SDD.

Cobertura de linhas é um indicador de lacunas, não o objetivo do teste. Não criar
testes que apenas renderizem componentes, chamem funções triviais ou reproduzam
detalhes internos para aumentar a métrica sem validar uma regra.

## Cobertura mínima de comportamento

Cada rota deve receber cobertura proporcional entre Vitest e Playwright, quando
aplicável:

- render inicial e caminho feliz;
- loading, vazio, sucesso e erro;
- validações e bloqueio de avanço;
- navegação;
- interação por teclado e foco;
- respostas relevantes da API;
- regressões descritas no SDD da rota.

## Comandos

```bash
pnpm -C ui test
pnpm -C ui test:watch
pnpm -C ui test:coverage
pnpm -C ui test:coverage:ci
pnpm -C ui typecheck
```

Os gates completos são executados na raiz. Não excluir código testável apenas para
melhorar a métrica de cobertura e não criar testes sem comportamento relevante
apenas para aumentar essa métrica.

Configuração, handlers e política de requests não reconhecidas seguem
`05-mocks-de-api.md`.

Quando Playwright for adotado, os testes integrados executam separadamente por
`pnpm test:integration`, conforme `07-testes-integrados-playwright.md`. Eles não
fazem parte dos comandos de cobertura.

Referências de layout no SDD são opcionais. A comparação visual só é necessária
quando a pasta `routes/assets/<route-slug>/` contiver imagens e segue
`06-referencias-visuais-de-layout.md`. A ausência de imagens não representa falta de
cobertura e não cria um gate visual.
