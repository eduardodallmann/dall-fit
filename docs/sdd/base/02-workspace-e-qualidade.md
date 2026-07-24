# Workspace e qualidade

## Gerenciador

O monorepo usa pnpm.
Existe um único `pnpm-lock.yaml`, na raiz. Lockfiles e workspaces internos às
aplicações não são permitidos.

Dependências compartilhadas por tooling transversal, como ESLint e Prettier, ficam
na raiz. Dependências necessárias para executar ou testar uma aplicação permanecem
no `package.json` dessa aplicação.

## Desenvolvimento local

O comando abaixo, executado na raiz, inicia API e UI simultaneamente:

```bash
pnpm dev
```

A raiz usa a execução recursiva e paralela do pnpm, filtrada explicitamente pelos
pacotes `dall-fit-api` e `dall-fit-app`. Cada aplicação preserva seu próprio script
`dev`: NestJS em watch mode na API e Vite na UI. A saída mantém o prefixo do pacote
para identificar a origem de cada log, e encerrar o processo da raiz encerra os
dois servidores.

## Comandos agregadores

Todos os quality gates são iniciados na raiz:

| Comando                 | Responsabilidade                                             |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm typecheck`        | Compila types e executa o typecheck de API e UI              |
| `pnpm lint`             | Executa typecheck e ESLint no monorepo                       |
| `pnpm lint:fix`         | Formata, faz typecheck e corrige violações seguras de ESLint |
| `pnpm test`             | Compila types e chama os testes de API e UI                  |
| `pnpm test:coverage`    | Agrega cobertura local de API e UI                           |
| `pnpm test:coverage:ci` | Agrega cobertura e relatórios para CI                        |
| `pnpm test:integration` | Executa Playwright da UI após sua adoção                     |
| `pnpm build`            | Compila types antes das aplicações consumidoras              |

Os comandos explícitos com `pnpm -C` tornam visível qual projeto falhou e preservam
a autonomia de configuração de cada suíte.

`test:integration` ainda não existe no workspace porque Playwright não foi adotado.
Ele será criado na raiz e na UI junto do primeiro cenário integrado, conforme
`../../../ui/docs/sdd/base/07-testes-integrados-playwright.md`.

O pacote `@dall-fit/types` também é compilado em `postinstall`, garantindo suas
exportações de runtime após um clone novo. Os agregadores repetem o build para
incorporar mudanças locais feitas depois da instalação.

## ESLint e formatação

`eslint.config.mjs` é a única entrada de ESLint. A pasta `eslint/` separa:

- `base.config.mjs`: TypeScript type-aware, Prettier e regras transversais;
- `api.config.mjs`: runtime Node e regras específicas do backend;
- `ui.config.mjs`: browser, React, hooks e Vite Fast Refresh.

Aplicações não mantêm outro `eslint.config.*`. Uma exceção local deve ser o menor
override possível, entrar no arquivo de escopo correto e ter justificativa.

Prettier é configurado uma vez na raiz. Imports de tipos usam `import type`;
identificadores e arquivos usam inglês, salvo texto de produto.

## Revisão final de código sem uso

Ao final de toda implementação, antes da entrega, revisar tanto `api/` quanto
`ui/`, mesmo quando a mudança estiver concentrada em apenas um dos projetos. A
revisão verifica se a implementação ou o refactor deixou sem uso:

- componentes e wrappers React;
- funções, hooks e métodos;
- classes, helpers e adapters;
- imports, exports e arquivos que existiam somente para o código removido.

Código comprovadamente sem uso deve ser removido na mesma mudança, junto de testes,
exports e documentação que tenham se tornado obsoletos. ESLint e typecheck ajudam
a encontrar parte desses casos, mas não substituem a inspeção de referências e da
composição da aplicação.

Antes de remover um símbolo aparentemente sem consumidores, confirmar usos
indiretos por framework, decorators, injeção de dependência, configuração,
carregamento dinâmico ou API pública. Um ponto de extensão intencional pode
permanecer apenas quando sua finalidade vigente estiver explícita no código ou no
SDD proprietário.

## Testes

API e UI usam Vitest, mas mantêm ambientes e configurações independentes:

- API usa ambiente Node e SWC para preservar metadata de decorators do Nest;
- o script nativo de `@swc/core` é autorizado explicitamente em
  `pnpm-workspace.yaml`;
- unitários e componentes da UI usam JSDOM, Testing Library e MSW Node;
- integrados da UI usam Playwright, Chromium, Vite real e MSW Browser;
- cobertura usa o provider V8 e gera texto, HTML e LCOV;
- services da API substituem repositories por mocks nos testes unitários;
- E2E do backend permanece em comando próprio e usa MongoDB e Redis efêmeros,
  iniciados sem Docker;
- E2E do backend sempre executam de forma serial;
- no backend, não existe nível, pasta ou comando `test:integration`.

A estratégia completa está registrada em
`../adr/ADR-0001-estrategia-de-mocks-e-bancos-de-teste.md`.

Configurações e contratos executáveis devem ser validados no projeto proprietário,
mesmo quando o comando é disparado pela raiz.

### Prioridade de cobertura

Testes unitários e integrados priorizam regras de negócio, decisões, caminhos
alternativos e erros observáveis. Cobertura de linhas é um indicador de lacunas,
não o motivo para criar testes.

No backend, “integrado” corresponde aos E2E da aplicação completa; não cria uma
suíte `test:integration`. No frontend, testes integrados usam Playwright para
renderizar a UI no Chromium e exercitar rotas e flows com MSW Browser. Eles não
validam o backend real nem geram cobertura.

A configuração, estrutura e comandos do frontend estão em
`../../../ui/docs/sdd/base/07-testes-integrados-playwright.md`.

Não escrever testes triviais apenas para executar getters, decorators, linhas de
composição ou branches sem significado de negócio. Cada teste deve apontar para uma
regra, cenário, contrato ou risco documentado.
