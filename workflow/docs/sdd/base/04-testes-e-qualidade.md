# Testes e qualidade

O projeto usa TypeScript estrito, ESLint/Prettier únicos da raiz e Vitest. Unitários
substituem repository e Blob por ports tipados. O teste com `@workflow/vitest`
executa a runtime oficial e confirma descoberta das diretivas, steps e retomada.

Scripts proprietários: `typecheck`, `lint`, `test`, `test:workflow`,
`test:coverage`, `test:coverage:ci` e `build`. A cobertura CI gera LCOV e JUnit; o
Sonar usa `workflow/sonar-project.properties`. O build obrigatório usa
`nitro build --preset vercel` e deve gerar as rotas reservadas do Workflow.

Os agregadores da raiz incluem o projeto em lint, testes, cobertura e build. Não
existe `test:integration` aqui: esse nome permanece exclusivo do Playwright da UI.
