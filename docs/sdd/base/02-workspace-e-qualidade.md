# Workspace e qualidade

## Gerenciador

O monorepo usa pnpm. O workflow de pull requests fixa apenas sua versão major para
receber automaticamente atualizações compatíveis sem exigir mudanças recorrentes
no repositório.
Existe um único `pnpm-lock.yaml`, na raiz. Lockfiles e workspaces internos às
aplicações não são permitidos.

Dependências compartilhadas por tooling transversal, como ESLint e Prettier, ficam
na raiz. Dependências necessárias para executar ou testar uma aplicação permanecem
no `package.json` dessa aplicação.

## Desenvolvimento local

O comando abaixo, executado na raiz, inicia API, Workflow e UI simultaneamente:

```bash
pnpm dev
```

A raiz usa a execução recursiva e paralela do pnpm, filtrada explicitamente pelos
pacotes `dall-fit-api` e `dall-fit-app`. A UI inicia o Vite. O script `dev` da API
inicia sua infraestrutura local e o NestJS em watch mode com processos
coordenados. A saída mantém prefixos para identificar a origem de cada log, e
encerrar o processo da raiz encerra UI, API, MongoDB e Redis.

No desenvolvimento local:

- UI: `http://localhost:3000`;
- API: `http://localhost:4000`.
- Workflow: `http://localhost:5000`;
- MongoDB persistente local: `127.0.0.1:27017`, database `dall-fit`;
- Redis efêmero: `127.0.0.1:6379`.

Também é possível iniciar apenas a infraestrutura da API:

```bash
pnpm -C api dev:infra
```

### Desenvolvimento Android

O projeto Android Capacitor é versionado em `ui/android/`, mas não participa de
`pnpm dev`, `pnpm build` nem dos gates web. Para trabalhar nele, instalar Node 24,
pnpm, Android Studio 2025.2.1 ou mais recente e os Android SDK Tools com a platform
API 36; o JDK adequado é instalado e administrado pelo Android Studio. O produto
suporta dispositivos a partir da API 29.

Os comandos canônicos, executados na raiz, são:

```bash
pnpm android:sync
pnpm android:open
pnpm android:run
pnpm android:build:debug
```

`android:sync` sempre executa o build Vite antes de `cap sync android`.
`android:run` repete essa preparação e escolhe um dispositivo ou emulador pelo
Capacitor. `android:build:debug` usa o Gradle Wrapper versionado e produz o APK de
debug em `ui/android/app/build/outputs/apk/debug/`. `android:open` exige Android
Studio, mas não altera o bundle. Nenhum desses caminhos assina release ou exige
segredo.

MongoDB e Redis usam os binários reais gerenciados por `mongodb-memory-server` e
`redis-memory-server`, sem Docker. O MongoDB usa `wiredTiger` e conserva seus dados
entre sessões em `api/.data/mongodb/`, diretório local ignorado pelo Git; o Redis
continua efêmero e é descartado quando o processo de desenvolvimento termina.
Reloads do Nest não reiniciam nenhum dos bancos. As portas são fixas para
corresponder ao `.env.example`; uma porta já ocupada faz o comando falhar, sem
escolher silenciosamente outro endereço ou limpar o MongoDB persistente. Seeds
continuam explícitos e não são executados automaticamente no startup.

Cada aplicação possui um `.env.example` versionado com valores locais seguros. O
arquivo `.env` correspondente é local, ignorado pelo Git e deve ser criado a partir
do exemplo. O repositório pode fornecer esse arquivo local durante a estruturação,
mas credenciais e valores de ambientes reais nunca são versionados.

## Comandos agregadores

Todos os quality gates são iniciados na raiz:

| Comando                 | Responsabilidade                                                      |
| ----------------------- | --------------------------------------------------------------------- |
| `pnpm typecheck`        | Compila types e executa typecheck de API, Workflow e UI               |
| `pnpm android:sync`     | Gera o bundle Vite e sincroniza o projeto Android Capacitor            |
| `pnpm android:open`     | Abre o projeto nativo versionado no Android Studio                     |
| `pnpm android:run`      | Prepara e executa o aplicativo em dispositivo ou emulador             |
| `pnpm android:build:debug` | Prepara e compila o APK debug com o Gradle Wrapper                  |
| `pnpm lint`             | Executa typecheck e ESLint no monorepo                                |
| `pnpm lint:fix`         | Formata, faz typecheck e corrige violações seguras de ESLint          |
| `pnpm sonar`            | Executa análise SonarCloud nos quatro projetos                        |
| `pnpm test`             | Compila types e testa API, Workflow e UI                              |
| `pnpm test:coverage`    | Agrega cobertura local de API, Workflow e UI                          |
| `pnpm test:coverage:ci` | Agrega cobertura e relatórios para CI                                 |
| `pnpm test:integration` | Executa Playwright da UI após sua adoção                              |
| `pnpm capture:sdd`      | Gera candidatas locais de screenshots para curadoria documental da UI |
| `pnpm build`            | Compila types antes das aplicações consumidoras                       |

Os comandos explícitos com `pnpm -C` tornam visível qual projeto falhou e preservam
a autonomia de configuração de cada suíte.

`pnpm sonar` agrega a execução do `sonar-scanner` nos quatro projetos
(`packages/types`, `api`, `workflow` e `ui`). Cada projeto possui seu próprio
`sonar-project.properties` e script `sonar`. Localmente, os scripts carregam
`SONAR_TOKEN` do `.env` da raiz via `dotenv-cli`; no workflow de pull request, o token é
proveniente dos environments do GitHub. A análise usa o LCOV gerado pelos testes
de cobertura e avalia code smells e duplicações; métricas de coverage não são
gates.

`test:integration` executa os cenários Playwright da UI. A adoção ocorreu com a
jornada de login e segue
`../../../ui/docs/sdd/base/07-testes-integrados-playwright.md`.

`capture:sdd` executa uma configuração Playwright isolada para gerar candidatas de
referências visuais em diretório ignorado pelo Git. O comando não integra os
quality gates e não altera automaticamente as referências curadas; seleção,
promoção e documentação seguem
`../../../ui/docs/sdd/base/06-referencias-visuais-de-layout.md`.

O pacote `@dall-fit/types` também é compilado em `postinstall`, garantindo suas
exportações de runtime após um clone novo. Os agregadores repetem o build para
incorporar mudanças locais feitas depois da instalação.

## Pull requests

O workflow
[`pull-request-quality.yml`](../../../.github/workflows/pull-request-quality.yml)
executa em todo `pull_request` e possui apenas permissão de leitura do conteúdo do
repositório. Uma nova atualização do mesmo pull request cancela a execução anterior.
As actions externas são fixadas por commit imutável. O workflow configura a versão
de Node declarada em `.nvmrc`, instala a major de pnpm declarada no próprio workflow
e as dependências com `--frozen-lockfile`, e executa, nesta ordem:

```bash
pnpm lint
pnpm test
pnpm test:coverage:ci
pnpm -C api test:e2e
pnpm -C ui test:integration:install:ci
pnpm test:integration
pnpm sonar
pnpm build
```

O checkout usa `fetch-depth: 0` para que o scanner envie o histórico completo ao
SonarCloud. O step `SonarCloud Analysis` usa `SONAR_TOKEN` e `GITHUB_TOKEN`
provenientes dos environments do repositório, além das variáveis
`SONAR_PULL_REQUEST_KEY`, `SONAR_PULL_REQUEST_BRANCH` e
`SONAR_PULL_REQUEST_BASE` derivadas do evento. O resultado é decorado no pull
request correspondente.

O workflow reutiliza os caches do pnpm e dos binários de MongoDB e Redis usados
pelos memory servers. Ele define a URL da API usada pelos handlers MSW nos testes
da UI. A instalação do Chromium e suas dependências antecede a suíte Playwright;
os E2E da API permanecem seriais conforme sua configuração.

## ESLint e formatação

`eslint.config.mjs` é a única entrada de ESLint. A pasta `eslint/` separa:

- `base.config.mjs`: TypeScript type-aware, Prettier e regras transversais;
- `api.config.mjs`: runtime Node e regras específicas do backend;
- `ui.config.mjs`: browser, React, hooks e Vite Fast Refresh.
- `workflow.config.mjs`: runtime Node da aplicação Nitro.

Aplicações não mantêm outro `eslint.config.*`. Uma exceção local deve ser o menor
override possível, entrar no arquivo de escopo correto e ter justificativa.

Prettier é configurado uma vez na raiz. Imports de tipos usam `import type`;
identificadores e arquivos usam inglês, salvo texto de produto.

## TypeScript estrito

Todas as unidades TypeScript da API, da aplicação UI e do tooling UI compilam com
`strict: true`. Nenhum projeto desabilita individualmente uma opção da família
`strict`; diagnósticos novos são resolvidos por tipos concretos, generics ou
`unknown` com narrowing, sem relaxar o compilador. A API mantém também
`noFallthroughCasesInSwitch: true`, pois essa verificação não pertence à família
estrita.

O preset type-aware comum aplica `@typescript-eslint/no-explicit-any` também à API.
Uma integração que realmente não possa ser representada por tipo seguro pode usar
somente uma exceção local, adjacente ao uso e acompanhada de justificativa
verificável; overrides amplos por projeto não são permitidos.

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
- o Workflow possui unitários Vitest, teste de runtime com `@workflow/vitest` e
  build Nitro `vercel` que confirma a descoberta de workflows e steps;
- no backend, não existe nível, pasta ou comando `test:integration`.

A estratégia completa está registrada em
`../adr/ADR-0001-estrategia-de-mocks-e-bancos-de-teste.md`.

Configurações e contratos executáveis devem ser validados no projeto proprietário,
mesmo quando o comando é disparado pela raiz.

### Prioridade de cobertura

Testes unitários e integrados priorizam regras de negócio, decisões, caminhos
alternativos e erros observáveis. Cobertura de linhas é um indicador de lacunas,
não o motivo para criar testes.

No backend, "integrado" corresponde aos E2E da aplicação completa; não cria uma
suíte `test:integration`. No frontend, testes integrados usam Playwright para
renderizar a UI no Chromium e exercitar rotas e flows com MSW Browser. Eles não
validam o backend real nem geram cobertura.

A configuração, estrutura e comandos do frontend estão em
`../../../ui/docs/sdd/base/07-testes-integrados-playwright.md`.

Não escrever testes triviais apenas para executar getters, decorators, linhas de
composição ou branches sem significado de negócio. Cada teste deve apontar para uma
regra, cenário, contrato ou risco documentado.

## Consulta de issues do SonarCloud para IAs

Quando uma IA precisar analisar code smells do SonarCloud, ela deve:

1. Garantir que `SONAR_TOKEN` está definido no ambiente (local ou CI).
2. Executar `pnpm sonar:issues` na raiz.
3. O script retorna formato Markdown com:
   - Projeto
   - Arquivo e linha
   - Severidade (`BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO`)
   - Regra do Sonar
   - Mensagem descritiva
4. A IA pode então:
   - Ler o arquivo na linha indicada
   - Sugerir refatoração específica
   - Priorizar por severidade

### Exemplo de output

```
## dall-fit-api
Source: https://sonarcloud.io/project/issues?organization=dall-fit&project=dall-fit-api&types=CODE_SMELL
- [MAJOR] src/training-plan/services/training-plan.service.ts:45
  Rule: squid:S3776
  Cognitive Complexity of methods should not be too high
```

### Restrições de segurança

- Nunca expor `SONAR_TOKEN` em prompts ou contextos compartilhados.
- O token é de leitura e já está no `.env` local.

## Agendamento de tarefas de IA em ambiente Ubuntu

Algumas CLIs de IA, como o Codex, impõem janelas de limite de uso (por exemplo,
5 horas). Quando uma tarefa de implementação ou escrita precisa aguardar o reset
desse limite, ela pode ser agendada como um timer transitório do systemd em vez de
manter o desenvolvedor esperando com o terminal aberto.

Em máquinas Ubuntu com a CLI do Codex instalada, `systemd-run --user` cria um timer
que dispara `codex exec` no horário definido, dentro do diretório do repositório e
com uma instrução textual da tarefa:

```bash
systemd-run --user \
  --unit=codex-dall-fit-feature-81-20260913 \
  --description='Codex: implementar FIT-81 do dall-fit' \
  --on-calendar='2026-09-13 03:05:00 America/Sao_Paulo' \
  --timer-property=Persistent=false \
  --collect \
  --working-directory=/home/dallmann/Estudando/dall-fit \
  /home/dallmann/.local/bin/codex exec \
  --approve-for-me \
  -C /home/dallmann/Estudando/dall-fit \
  'Implemente integralmente a FIT-81 conforme docs/sdd/features/fit-0081-login-isolamento-conta-android.md. Siga os AGENTS.md, preserve alterações existentes, execute os testes cabíveis e não faça commit nem push.'
```

- `--unit` e `--description` identificam o agendamento nos logs e no
  `systemctl --user list-timers`;
- `--on-calendar` aceita data, hora e fuso horário explícitos;
- `--timer-property=Persistent=false` evita disparo retroativo caso a máquina
  esteja desligada no horário agendado;
- `--collect` remove a unidade transitória automaticamente após a execução;
- `--working-directory` e o `-C` do Codex devem apontar para o mesmo repositório.

A parte essencial, reaproveitável fora de um agendamento, é:

```bash
codex exec --approve-for-me -C /caminho/do/projeto 'instrução'
```

`--approve-for-me` e `--sandbox workspace-write` são mutuamente incompatíveis na
versão da CLI validada; não combinar as duas flags. A sintaxe foi confirmada por
`codex exec --help` instalado na máquina; a documentação oficial da OpenAI cobre
automações em nível de fluxo, mas não essa flag específica, então o `--help` local
prevalece como fonte de verdade da CLI instalada.

A instrução textual enviada ao Codex deve referenciar a feature ou o bugfix a
implementar e reforçar as regras deste `AGENTS.md`, incluindo a ausência de commit
ou push automático quando a validação humana ainda for necessária.
