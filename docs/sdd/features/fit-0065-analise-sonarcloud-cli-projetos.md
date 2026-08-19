# Feature Spec: Adotar análise SonarCloud via Sonar-Scanner CLI nos projetos

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0065`.
- Problema: a avaliação de viabilidade concluiu que o Sonar-Scanner CLI é
  tecnicamente compatível com o monorepo (TypeScript, Node 24, cobertura LCOV já
  gerada), mas o repositório não possui nenhuma configuração Sonar. O ESLint com
  `eslint-plugin-sonarjs` cobre parte das regras, porém não detecta todo o
  espectro de code smells e duplicações que a análise Sonar oferece.
- Resultado: os três projetos (`packages/types`, `api` e `ui`) passam a ser
  analisados no SonarCloud como projetos Sonar individuais, cada um com seu
  `sonar-project.properties`. Dois momentos de uso: script local de gate e
  step dedicado no workflow de pull request. O propósito declarado é eliminar
  duplicações e code smells; cobertura e demais métricas não são gates.
- Referências locais:
  - `docs/sdd/base/02-workspace-e-qualidade.md`;
  - `docs/sdd/base/01-arquitetura-do-monorepo.md`;
  - `.github/workflows/pull-request-quality.yml`;
  - `package.json` da raiz, `api/package.json` e `ui/package.json`;
  - `api/vitest.config.ts` e `ui/vitest.config.ts`;
  - `eslint.config.mjs`.
- Referências oficiais consultadas:
  - [SonarScanner CLI — Analysis parameters](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/analysis-parameters/),
    que define `sonar.projectKey`, `sonar.organization`, `sonar.sources`,
    `sonar.tests`, `sonar.exclusions`, `sonar.javascript.lcov.reportPaths` e
    `sonar.qualitygate.wait`;
  - [GitHub Integration — Pull Request analysis](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/pull-request-analysis/),
    que define `sonar.pullrequest.key` e `sonar.pullrequest.branch` para análise
    de pull request no SonarCloud.
- Versões confirmadas no workspace: Node 24 (`v24` no `.nvmrc`), TypeScript ~6.0.3,
  vitest 4.1.10 com provider `v8` e reporter `lcov` já configurados na API e na UI.
- Features relacionadas: `FIT-0053` introduziu o uso de binários reais dos memory
  servers sem Docker; esta feature segue a mesma restrição de não introduzir
  Docker em nenhuma etapa.

## Escopo

### Incluído

- criar um projeto Sonar individual no SonarCloud para cada pacote do monorepo
  (`packages/types`, `api` e `ui`);
- criar um `sonar-project.properties` dentro de cada projeto com `projectKey`,
  `organization`, `sources`, `tests`, `exclusions` e LCOV report path;
- instalar o pacote `sonarqube-scanner` como devDependency da raiz;
- adicionar scripts `sonar` em cada projeto e um agregador `pnpm sonar` na raiz;
- o script local de cada projeto executa `pnpm test:coverage:ci` seguido do
  scanner, reutilizando o LCOV gerado;
- adicionar um step `SonarCloud` ao workflow de pull request, após o step de
  `pnpm test:coverage:ci`, executando o agregador com as variáveis de ambiente
  que o usuário define manualmente nos environments do repositório GitHub;
- o workflow usa `fetch-depth: 0` e define `SONAR_TOKEN`,
  `GITHUB_TOKEN` (nativo) e as variáveis `SONAR_PULL_REQUEST_*` para análise de PR;
- documentar a configuração no SDD vivo da raiz durante a implementação.

### Não incluído

- pre-commit hooks, husky, lint-staged ou qualquer gate automático no cliente Git;
- usar cobertura de linhas, número de testes ou qualquer métrica de coverage como
  gate do Sonar; o propósito é exclusivamente duplicações e code smells;
- alterar regras do ESLint, do `eslint-plugin-sonarjs` ou de qualquer configuração
  de lint existente;
- criar novos tipos de teste, suíte ou comando de teste; nenhum projeto adiciona
  ou renomeia comandos `test:*`;
- excluir do escopo do Sonar a análise de produto ou de contrato de endpoint; a
  análise não altera nenhum documento em `endpoints/` nem `routes/`;
- provisionar o SonarCloud via código, Terraform ou semelhante; a organização, os
  projetos e os tokens são criados manualmente na interface do SonarCloud e do
  GitHub;
- modificar Docker, docker-compose, Vercel ou qualquer outra infraestrutura;
- alterar o runtime da API ou da UI; nenhum import de runtime é introduzido;
- remover ou renomear qualquer script ou arquivo existente.

## Projetos e documentação afetados

- API e endpoints:
  - nenhum documento em `api/docs/sdd/endpoints/` muda, pois não há alteração HTTP;
  - `api/package.json` recebe um script `sonar`;
  - `api/sonar-project.properties` é criado.
- UI e rotas:
  - nenhum documento em `ui/docs/sdd/routes/` muda, pois não há alteração de tela;
  - `ui/package.json` recebe um script `sonar`;
  - `ui/sonar-project.properties` é criado.
- Fluxos: não se aplica — nenhuma jornada ponta a ponta muda.
- Contratos em `@dall-fit/types`:
  - `packages/types/package.json` recebe um script `sonar`;
  - `packages/types/sonar-project.properties` é criado;
  - nenhuma exportação pública do pacote muda.
- Decisões arquiteturais: não criar ADR; a adoção é reversível, usa ferramenta
  suportada nativamente pelo ecossistema e não afeta a arquitetura de nenhum projeto.
- Handlers e fixtures MSW: não se aplica.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.
- Documentação viva da raiz:
  - `docs/sdd/base/02-workspace-e-qualidade.md` documenta os novos scripts e o
    step do workflow durante a implementação.

## Contrato pretendido

### Projetos Sonar individuais

| Projeto Sonar | Diretório | `sonar.projectKey` | Observação |
| ------------- | --------- | ------------------ | ---------- |
| types | `packages/types` | `dall-fit-types` | somente `src/` |
| api | `api` | `dall-fit-api` | `src/` + `test/` |
| ui | `ui` | `dall-fit-ui` | `src/` + testes |

Cada projeto é registrado separadamente no SonarCloud, sem composição de
multi-módulo. As keys e os nomes finais são definidos na interface do SonarCloud
e refletidos nos `sonar-project.properties`.

### Variáveis de ambiente

| Variável | Onde | Obrigatória | Finalidade |
| -------- | ---- | ----------- | ---------- |
| `SONAR_TOKEN` | `.env` local e environments do GitHub | Sim | Autenticação do scanner no SonarCloud |
| `SONAR_HOST_URL` | opcional | Não | Omitida em uso padrão do SonarCloud |
| `SONAR_PULL_REQUEST_KEY` | workflow, derivada do evento | Somente no CI | Número do pull request em análise |
| `SONAR_PULL_REQUEST_BRANCH` | workflow, derivada do evento | Somente no CI | Nome do branch em análise |
| `GITHUB_TOKEN` | workflow, nativo do Actions | Somente no CI | Permissão do SonarCloud para comentar no PR |

- O valor de `SONAR_TOKEN` nunca é versionado; local fica no `.env` da raiz
  ignorado pelo Git, e no CI é definido manualmente nos environments do
  repositório GitHub.
- Sem `SONAR_TOKEN` no ambiente local, o script falha com mensagem explícita
  antes de iniciar o scanner, sem fallback silencioso e sem ecoar o valor.

### Conteúdo de cada `sonar-project.properties`

Cada arquivo declara, no mínimo:

- `sonar.projectKey` e `sonar.organization`;
- `sonar.sources` apontando para os diretórios de código-fonte próprios;
- `sonar.tests` quando o projeto possuir diretório de testes próprio;
- `sonar.exclusions` para `node_modules`, `dist`, `coverage`, `playwright-report`
  e arquivos de configuração de tooling que não são código de aplicação;
- `sonar.javascript.lcov.reportPaths` apontando para o `lcov.info` gerado pelo
  `pnpm test:coverage:ci` do próprio projeto;
- `sonar.qualitygate.wait=true` para bloquear quando o quality gate do projeto
  falhar.

### Configuração do quality gate no SonarCloud

- O quality gate de cada projeto é configurado exclusivamente com condições de
  **duplicações** e **code smells**;
- cobertura de linhas, branches, testes ou qualquer outra métrica de coverage
  não é habilitada como condição de gate;
- o gate padrão `Sonar way` é aplicado sem alterações adicionais nesta feature;
  qualquer ajuste futuro exige uma feature própria.

## Requisitos funcionais

1. Cada projeto (`packages/types`, `api`, `ui`) deve possuir um
   `sonar-project.properties` próprio, sem composição de multi-módulo na raiz.
2. O script `pnpm sonar` de cada projeto deve executar `pnpm test:coverage:ci` e,
   em seguida, o scanner com o LCOV gerado, sem exigir intervenção manual.
3. O agregador `pnpm sonar` na raiz deve executar o script dos três projetos
   de forma sequencial, falhando visivelmente quando qualquer um falhar.
4. Sem `SONAR_TOKEN` definido, o script local deve falhar antes do scanner com
   mensagem que informe a variável esperada e aponte para a documentação, sem
   expor valor algum.
5. O scanner deve enviar ao SonarCloud os code smells e as duplicações detectados
   no código-fonte de cada projeto, sem nenhum erro de configuração.
6. No workflow de pull request, o scanner deve executar no modo de análise de PR,
   enviando a análise decorada para o pull request correspondente.
7. O workflow reutiliza o LCOV gerado no step de `pnpm test:coverage:ci` anterior,
   sem executar os testes duas vezes.
8. Uma falha de quality gate no scanner deve falhar o step do workflow, sem
   continuar para steps posteriores.
9. Nenhum script `sonar` deve executar testes cobertos por coverage quando o LCOV
   já existir e estiver atualizado; o passo de regenerate é sempre executado para
   garantir consistência e não é otimizado nesta feature.
10. Os scripts existentes (`lint`, `test`, `build`, `typecheck`) permanecem sem
    alteração.

## Requisitos não funcionais

- Acessibilidade: não se aplica — não há interface visual.
- Performance:
  - o scanner local executa análise completa do projeto; o tempo de execução
    esperado é de 1 a 3 minutos por projeto e não é otimizado nesta feature;
  - o workflow adquire ~1-3 minutos adicionais, sem paralelização nesta feature;
  - o passo de gerar LCOV antes do scanner é repetido no workflow porque o step
    de coverage é anterior e o arquivo é reutilizado, sem execução duplicada dos
    testes.
- Segurança e privacidade:
  - `SONAR_TOKEN` nunca é versionado; não pode ser ecoado, logado ou impresso por
    nenhum script ou configuração;
  - o workflow mantém `permissions: contents: read`; a decoração de PR usa
    `GITHUB_TOKEN` nativo do Actions somente para o step do scanner;
  - o scanner não envia ao SonarCloud nenhum segredo, credencial ou dado pessoal
    que não esteja já presente no código-fonte;
  - o `sonar-project.properties` é versionado e contém apenas chaves públicas e
    caminhos relativos.
- Observabilidade:
  - a saída do scanner indica claramente qual projeto falhou e qual condição do
    quality gate foi violada;
  - o resultado de cada projeto é visível individualmente no SonarCloud.

## Critérios de aceite

### Cenário 1 — Gate local por projeto

- Forma de validar: execução local com token e sem token. Reprodução HTTP não se
  aplica porque a análise é estática e não depende de runtime.
- Given: o desenvolvedor possui `SONAR_TOKEN` no `.env` e o código-fonte tem um
  code smell conhecido ou uma duplicação conhecida em um dos projetos.
- When: executa `pnpm -C api sonar` (ou `ui`, ou `packages/types`).
- Then: o script executa coverage, roda o scanner, exibe o resultado e indica
  falha ou sucesso conforme o quality gate do projeto no SonarCloud.

### Cenário 2 — Gate local ausente de token

- Forma de validar: execução local sem `SONAR_TOKEN`.
- Given: `SONAR_TOKEN` não está definido no ambiente.
- When: o desenvolvedor executa `pnpm sonar`.
- Then: o agregador falha no primeiro projeto com mensagem explícita sobre a
  variável ausente, sem executar o scanner e sem ecoar valor algum.

### Cenário 3 — Agregador da raiz

- Forma de validar: execução local com token.
- Given: o agregador `pnpm sonar` está definido na raiz.
- When: o desenvolvedor executa o comando.
- Then: os três projetos são analisados em sequência, e o comando falha se
  qualquer projeto falhar.

### Cenário 4 — Workflow de pull request

- Forma de validar: abrir um pull request real no repositório.
- Given: os environments do GitHub possuem `SONAR_TOKEN` e o workflow executado
  pelo evento `pull_request`.
- When: o workflow alcança o step SonarCloud.
- Then: o scanner executa no modo de análise de PR, o resultado é publicado e
  o status do quality gate de cada projeto é visível no pull request.

### Cenário 5 — Falha de quality gate no workflow

- Forma de validar: introduzir intencionalmente uma duplicação conhecida em um
  branch e abrir um pull request.
- Given: o projeto correspondente tem condição de duplicação configurada no gate.
- When: o workflow executa o scanner.
- Then: o step falha e o workflow é marcado como reprovado, sem executar steps
  posteriores desnecessariamente.

### Cenário 6 — LCOV reutilizado no workflow

- Forma de validar: inspecionar os logs do workflow.
- Given: o step `pnpm test:coverage:ci` precede o step SonarCloud.
- When: o step SonarCloud executa.
- Then: o scanner usa o `lcov.info` já gerado e não re-executa os testes.

## Estratégia de entrega e compatibilidade

- A mudança é aditiva: nenhum script, configuração ou arquivo de runtime existente
  é alterado. Fluxos, endpoints, rotas, contratos e testes permanecem intactos.
- O `sonar-project.properties` de cada projeto é versionado e faz parte do
  repositório. Nenhum valor sensível entra nesses arquivos.
- O usuário cria manualmente a organização, os três projetos e os tokens no
  SonarCloud, e registra `SONAR_TOKEN` nos environments do GitHub. Esta feature
  documenta os nomes esperados, mas a operação é fora do código.
- O step do workflow é inserido após `pnpm test:coverage:ci` para reutilizar o
  LCOV já gerado, preservando a ordem dos steps existentes.
- A feature não altera o quality gate padrão do SonarCloud. Caso a organização
  deseje condições customizadas, isso é feito na interface do SonarCloud como
  configuração operacional, fora do código.
- Os SDDs vivos são atualizados junto da implementação:
  `docs/sdd/base/02-workspace-e-qualidade.md` documenta os novos scripts e o
  novo step do workflow.
- Não há migração de dados, alteração de endpoint, ordem coordenada entre API e
  UI ou rollback especial. Remover os arquivos e scripts restaura o estado
  anterior sem efeito colateral.

## Plano de testes

Esta feature não adiciona código de produto, regra de negócio ou contrato de
endpoint. Testes automatizados unitários ou de integração não se aplicam. A
validação ocorre pelos critérios de aceite, executando manualmente:

- `pnpm sonar` na raiz com token definido;
- `pnpm sonar` na raiz sem token;
- `pnpm -C api sonar`, `pnpm -C ui sonar` e `pnpm -C packages/types sonar`
  individualmente;
- um pull request de verificação para observar o step do workflow.

Quality gates de código da fase de implementação:

- `pnpm lint`;
- `pnpm build`.

Os demais gates (`pnpm test`, `pnpm test:coverage:ci`, `pnpm -C api test:e2e`,
`pnpm test:integration`) não são exigidos porque nenhum código de produto,
runtime, teste ou mock é alterado. Quando o mesmo commit introduzir mudanças que
exijam esses gates, todos devem ser executados conforme a regra vigente.

## Riscos e decisões

- Decisão: três projetos Sonar individuais em vez de um projeto multi-módulo.
  Motivo: a estrutura de monorepo com workspaces pnpm não tem suporte nativo
  estável para multi-módulo no SonarScanner CLI; projetos individuais são
  mais simples de configurar, manter e interpretar no SonarCloud.
- Decisão: o scanner executa coverage antes de cada análise local. Motivo: o
  LCOV precisa ser atualizado para refletir o estado do código; reutilizar um
  LCOV desatualizado geraria dados inconsistentes no SonarCloud. No workflow, o
  LCOV é gerado pelo step anterior e reutilizado, sem duplicação.
- Decisão: o token fica no `.env` local e nos environments do GitHub, nunca
  versionado. Motivo: o token é credencial sensível; versioná-lo viola o padrão
  de segurança do repositório.
- Decisão: não criar pre-commit hook. Motivo: o tempo de análise do scanner é de
  1-3 minutos por projeto, o que impactaria a produtividade no commit. O uso é
  on-demand como gate local e automático no workflow.
- Decisão: o propósito do qualidade é exclusivamente duplicações e code smells.
  Motivo: a cobertura atual dos projetos não é o alvo desta feature; outras
  métricas podem ser introduzidas por feature própria quando pertinente.
- Risco: `sonar.javascript.lcov.reportPaths` incompatível com a estrutura de
  caminhos do projeto. Mitigação: validar manualmente o caminho relativo de cada
  `lcov.info` durante a implementação antes do primeiro envio.
- Risco: `packages/types` não possuir testes nem coverage. Mitigação: a análise
  de code smells e duplicações não depende de coverage; `sonar.tests` pode ser
  omitido ou apontado para nenhum diretório, e `sonar.javascript.lcov.reportPaths`
  pode ser omitido.
- Risco: o step do workflow falhar em pull requests de fork por ausência do
  token no ambiente do fork. Mitigação: documentar que a análise em fork não é
  suportada; o workflow é executado pelo evento `pull_request` do repositório
  base, que possui o token.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Três `sonar-project.properties` criados, um por projeto
- Três scripts `sonar` adicionados, um por projeto
- Agregador `pnpm sonar` na raiz
- Step SonarCloud no workflow de pull request
- `docs/sdd/base/02-workspace-e-qualidade.md` atualizado
- Nenhum arquivo de runtime, contrato, endpoint, rota ou teste alterado
- Quality gates da raiz aprovados (`pnpm lint` e `pnpm build`)
