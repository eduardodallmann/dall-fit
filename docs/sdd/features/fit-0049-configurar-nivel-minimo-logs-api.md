# Feature Spec: Configurar nível mínimo dos logs da API

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0049`](https://github.com/eduardodallmann/dall-fit/issues/49).
- Problema: a política vigente registra com nível `log` a entrada, as etapas, os
  retornos de dependências e a saída de todo método participante dos fluxos da
  API. Essa granularidade é útil durante investigação, mas gera grande volume no
  desenvolvimento local e nos deployments da Vercel mesmo quando o interesse
  operacional está restrito a avisos e falhas.
- Resultado: uma única variável de ambiente `LOG_LEVEL` define o nível mínimo
  emitido pelo logger global da API. O filtro usa a hierarquia nativa do NestJS,
  preserva os logs detalhados no código e permite alterar o volume de cada
  ambiente sem novo build ou lógica própria para enumerar níveis derivados.
- Referências locais:
  - `docs/sdd/base/05-documentacao-oficial-das-tecnologias.md`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/base/03-testes-e-qualidade.md`;
  - `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
  - `api/src/config/environment.ts`;
  - `api/src/observability/request-context.logger.ts`;
  - `api/src/configure-application.ts`;
  - `api/.env.example`.
- Referências oficiais consultadas:
  - [NestJS — Logger](https://docs.nestjs.com/techniques/logger), que define os
    níveis `verbose`, `debug`, `log`, `warn`, `error` e `fatal`, confirma que eles
    são hierárquicos e permite configurar `ConsoleLoggerOptions.logLevels`;
  - [Zod — Enums](https://zod.dev/api?id=enums), para validar a variável contra um
    conjunto fechado de strings.
- Versões confirmadas no workspace: `@nestjs/common` e `@nestjs/core` 11.1.28,
  `@nestjs/config` 4.0.4 e Zod 4.4.3. Os tipos e a implementação locais do NestJS
  confirmam que um array contendo somente o limiar habilita também os níveis de
  maior severidade.
- Features relacionadas: `FIT-0027` introduziu o logger global correlacionado por
  `requestId`; esta feature apenas configura seu limiar de emissão e preserva a
  correlação, a sanitização e o tratamento central de erros.

## Escopo

### Incluído

- adicionar `LOG_LEVEL` ao schema tipado e validado da API;
- aceitar exatamente os seis níveis nativos do NestJS: `verbose`, `debug`, `log`,
  `warn`, `error` e `fatal`;
- usar `log` como padrão quando a variável não estiver definida, preservando o
  comportamento funcional atual e habilitando `log`, `warn`, `error` e `fatal`;
- configurar o `RequestContextLogger`, que estende `ConsoleLogger`, com o único
  limiar escolhido e delegar ao NestJS a cascata de severidade;
- aplicar o mesmo limiar aos logs da aplicação, do framework e aos logs de
  bootstrap bufferizados que forem descarregados pelo logger global;
- manter a configuração independente por ambiente: `api/.env` no runtime local e
  `LOG_LEVEL` nos ambientes Development, Preview e Production da Vercel;
- documentar a variável e a tabela de comportamento no SDD vivo da API durante a
  implementação;
- cobrir validação, valor padrão, cascata, wiring global e preservação de
  `requestId` com testes proporcionais ao risco.

### Não incluído

- receber um array, lista separada por vírgulas ou combinação arbitrária de níveis
  na variável de ambiente;
- criar uma hierarquia, comparação de severidade ou tabela de expansão própria;
- remover chamadas de log existentes ou reduzir a instrumentação exigida por
  controller, command, service, repository e adapter;
- alterar prefixos, mensagens, metadados estruturados, sanitização, redaction,
  correlação por `requestId`, formato textual ou destino `stdout`/`stderr`;
- introduzir Pino, Winston, transporte externo, tracing distribuído, retenção,
  amostragem, métricas ou plataforma de observabilidade;
- permitir desabilitar totalmente os logs com `off`, `silent`, valor vazio ou
  booleano;
- criar endpoint ou controle em runtime para alterar o nível sem reiniciar uma
  instância;
- alterar comportamento HTTP, contratos públicos, UI, banco de dados ou Redis.

## Projetos e documentação afetados

- API e endpoints:
  - validar `LOG_LEVEL` em `api/src/config/environment.ts`;
  - injetar a configuração no `RequestContextLogger` e inicializar o
    `ConsoleLogger` com o limiar nativo;
  - preservar `bufferLogs`, a instalação por `app.useLogger()` e a descarga dos
    logs depois da composição da aplicação;
  - atualizar `api/.env.example`, `api/docs/sdd/base/01-arquitetura.md` e
    `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
  - nenhum documento em `api/docs/sdd/endpoints/` muda, pois não há alteração HTTP
    nem requisito funcional excepcional de um endpoint específico.
- UI e rotas: não se aplica — a UI não configura nem consome os logs da API.
- Fluxos: não se aplica — nenhuma jornada ponta a ponta muda.
- Contratos em `@dall-fit/types`: não se aplica — a configuração é interna ao
  runtime da API e não atravessa HTTP.
- Decisões arquiteturais: não criar ADR; trata-se de configuração local,
  reversível e suportada nativamente pelo logger já adotado.
- Handlers e fixtures MSW: não se aplica — requests e responses permanecem
  inalteradas.
- Mocks de repositories/caches nos unitários da API: não se aplica — ports e
  dependências de domínio não mudam.
- Fixtures MongoDB/Redis nos E2E: não se aplica — a configuração não acessa nem
  modifica persistência.

## Contrato pretendido

### Variável `LOG_LEVEL`

- nome: `LOG_LEVEL`;
- formato: uma única string em minúsculas;
- valores aceitos: `verbose | debug | log | warn | error | fatal`;
- padrão: `log` quando ausente;
- valor vazio ou diferente do enum é inválido e impede o bootstrap pela validação
  central de ambiente, identificando a chave sem registrar seu valor;
- a configuração é lida no bootstrap e uma alteração exige reinício ou novo
  deployment da instância;
- não existe precedência baseada em `NODE_ENV` ou `VERCEL_ENV`: quando presente,
  o valor explícito é usado igualmente em local, teste, preview e produção.

### Cascata nativa

| `LOG_LEVEL` | Níveis emitidos                                     |
| ----------- | --------------------------------------------------- |
| `verbose`   | `verbose`, `debug`, `log`, `warn`, `error`, `fatal` |
| `debug`     | `debug`, `log`, `warn`, `error`, `fatal`            |
| `log`       | `log`, `warn`, `error`, `fatal`                     |
| `warn`      | `warn`, `error`, `fatal`                            |
| `error`     | `error`, `fatal`                                    |
| `fatal`     | `fatal`                                             |

O valor representa o nível menos severo que ainda pode ser emitido. A aplicação
entrega ao NestJS somente esse limiar; a tabela documenta o comportamento nativo e
não deve ser reimplementada como mapeamento de arrays no código.

## Requisitos funcionais

1. Sem `LOG_LEVEL`, a API deve iniciar com limiar `log`.
2. Com `LOG_LEVEL=log`, devem ser emitidos `log`, `warn`, `error` e `fatal`,
   enquanto `debug` e `verbose` são suprimidos.
3. Com `LOG_LEVEL=warn`, devem ser emitidos somente `warn`, `error` e `fatal`.
4. Com `LOG_LEVEL=error`, devem ser emitidos somente `error` e `fatal`.
5. Os valores `verbose`, `debug` e `fatal` devem obedecer à mesma cascata nativa
   descrita no contrato.
6. Um nível suprimido não deve escrever a mensagem nem seus metadados no destino
   do `ConsoleLogger`.
7. Todo nível emitido durante uma request deve continuar recebendo o mesmo
   `requestId` nos metadados estruturados, sem alterar mensagem, argumentos,
   contexto ou stack.
8. Logs funcionais e técnicos continuam sendo chamados nos níveis definidos pela
   política vigente; a variável filtra a emissão e não muda a classificação de
   uma ocorrência.
9. Um valor inválido deve impedir a aplicação de iniciar por meio do validador de
   ambiente vigente, sem fallback silencioso para outro nível.
10. Development, Preview e Production da Vercel devem poder receber valores
    diferentes sem mudança de código; cada deployment usa o valor do próprio
    ambiente.

## Requisitos não funcionais

- Acessibilidade: não se aplica — não há interface visual ou interação de usuário.
- Performance:
  - níveis suprimidos não executam escrita no console, reduzindo volume e I/O;
  - a filtragem usa o mecanismo síncrono e nativo do `ConsoleLogger`, sem
    dependência, transporte ou consulta externa;
  - a feature não promete eliminar o custo anterior à chamada do logger, como a
    preparação de resumos sanitizados já exigida pela política vigente.
- Segurança e privacidade:
  - a variável não contém segredo e pode ser documentada no `.env.example`;
  - filtragem não relaxa sanitização nem autoriza dados pessoais, tokens, cookies,
    credenciais, payloads grandes ou binários em níveis ainda emitidos;
  - erros de validação informam o nome `LOG_LEVEL`, nunca ecoam o valor recebido.
- Observabilidade:
  - reduzir o limiar pode ocultar deliberadamente detalhes de fluxo; `warn`,
    `error` e `fatal` continuam disponíveis quando o limiar os incluir;
  - selecionar `fatal` suprime inclusive erros comuns por decisão operacional
    explícita;
  - falhas de inicialização anteriores à instalação do logger injetado podem ser
    emitidas pelo fallback de bootstrap do NestJS para evitar falha silenciosa;
  - a correlação por `requestId` permanece idêntica nos registros emitidos.

## Critérios de aceite

### Cenário 1 — Padrão compatível sem configuração explícita

- Forma de validar: unitários de `validateEnvironment` e do logger; reprodução
  HTTP não se aplica porque o nível de log é configuração interna, não contrato de
  endpoint.
- Given: `LOG_LEVEL` está ausente.
- When: o ambiente é validado e o logger global é construído.
- Then: o valor tipado é `log`; `log`, `warn`, `error` e `fatal` são emitidos, e
  `debug` e `verbose` são suprimidos.

### Cenário 2 — Somente avisos e falhas

- Forma de validar: unitário do logger e execução local da API com
  `LOG_LEVEL=warn`; seed e cURL não se aplicam porque qualquer fluxo seguro pode
  produzir logs e o comportamento validado pertence ao logger global.
- Given: a API inicia com `LOG_LEVEL=warn`.
- When: são realizadas chamadas em todos os seis níveis do logger.
- Then: somente `warn`, `error` e `fatal` chegam ao console; chamadas `verbose`,
  `debug` e `log` não produzem saída.

### Cenário 3 — Somente erros e falhas fatais

- Forma de validar: unitário do logger e execução local com `LOG_LEVEL=error`.
- Given: a API inicia com `LOG_LEVEL=error`.
- When: são realizadas chamadas em todos os níveis.
- Then: somente `error` e `fatal` chegam ao console.

### Cenário 4 — Maior detalhamento para investigação

- Forma de validar: testes parametrizados dos limiares `verbose`, `debug` e `log`.
- Given: cada limiar é configurado separadamente.
- When: os seis níveis são acionados.
- Then: o NestJS emite o limiar e todos os níveis de maior severidade exatamente
  conforme a tabela, sem array de expansão mantido pela aplicação.

### Cenário 5 — Correlação preservada após a filtragem

- Forma de validar: unitário do `RequestContextLogger`.
- Given: existe um contexto assíncrono com `requestId` e o nível chamado está
  habilitado.
- When: o logger recebe mensagem, metadados, contexto e, em `error`, stack.
- Then: a saída preserva a assinatura atual e contém o mesmo `requestId`; se o
  nível estiver abaixo do limiar, nenhuma saída é escrita.

### Cenário 6 — Configuração inválida falha cedo

- Forma de validar: unitário de `validateEnvironment`.
- Given: `LOG_LEVEL` contém valor vazio, capitalizado, lista ou string fora do
  enum.
- When: o ambiente é validado durante o bootstrap.
- Then: a aplicação rejeita a configuração mencionando `LOG_LEVEL`, sem expor o
  valor e sem escolher silenciosamente `log`.

### Cenário 7 — Configuração por ambiente na Vercel

- Forma de validar: smoke dos deployments Preview e Production, inspecionando
  somente mensagens técnicas fictícias ou de probes e sem registrar dados reais.
- Given: os ambientes da Vercel possuem valores diferentes de `LOG_LEVEL` e foram
  redeployados depois da configuração.
- When: cada deployment executa um fluxo que normalmente gera logs de múltiplos
  níveis.
- Then: cada ambiente emite somente seu limiar e níveis mais severos, preservando
  mensagens, sanitização e `requestId` dos registros restantes.

## Estratégia de entrega e compatibilidade

- A mudança é aditiva e compatível: a ausência de `LOG_LEVEL` resolve para `log`,
  que preserva todos os níveis atualmente usados pelos fluxos normais, funcionais
  e técnicos.
- `api/.env.example` passa a declarar `LOG_LEVEL=log`; desenvolvedores podem usar
  outro limiar no `.env` local ignorado pelo Git.
- A configuração dos ambientes Vercel é operacional e independente do código. O
  valor desejado deve ser cadastrado em cada escopo e seguido por redeployment;
  sem configuração explícita, permanece o padrão `log`.
- O logger correlacionado existente continua sendo a única implementação global.
  A configuração entra em seu construtor pelo `ConfigService`; não criar segunda
  instância, client ou helper de severidade.
- O `RequestContextLogger` passa ao `ConsoleLogger` o array unitário
  `[LOG_LEVEL]`, formato exigido pela API do NestJS. Esse array não representa uma
  lista configurável nem expande manualmente a cascata.
- Não há migração de dados, alteração de endpoint, ordem coordenada entre API e UI
  ou rollback especial. Remover a variável restaura o padrão `log` no próximo
  início da instância.
- Os SDDs vivos são atualizados junto da implementação, não nesta fase de
  especificação.

## Plano de testes

- unitários de configuração:
  - padrão `log` quando ausente;
  - aceitação exata de cada um dos seis níveis;
  - rejeição de vazio, maiúsculas, lista e valor desconhecido sem vazamento do
    conteúdo recebido;
- unitários do `RequestContextLogger`:
  - teste parametrizado da cascata para os seis limiares;
  - nenhuma escrita para níveis suprimidos;
  - preservação de metadados, contexto, stack e `requestId` nos níveis emitidos;
- composição/wiring:
  - confirmar que o singleton instalado por `app.useLogger()` recebe o valor
    validado e filtra logs da aplicação, do framework e do buffer;
  - preservar funcionamento fora de contexto HTTP e o fallback de erro anterior à
    instalação do logger;
- E2E serial da API:
  - executar a suíte vigente para detectar regressão de bootstrap, injeção e
    wiring; não adicionar endpoint artificial somente para observar logs;
- smoke operacional:
  - iniciar localmente com `log`, `warn` e `error`;
  - validar Preview e Production após cadastrar o valor escolhido em cada ambiente
    Vercel;
- quality gates da fase de implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e` por alteração no wiring global da aplicação.

Testes de UI e `pnpm test:integration` não são necessários porque não há mudança
de rota, cenário integrado, request, response, handler ou fixture MSW.

## Riscos e decisões

- Decisão: usar uma variável singular de limiar, não um array. Motivo: o NestJS 11
  já implementa níveis em cascata; uma lista aumentaria a configuração e permitiria
  combinações difíceis de interpretar sem oferecer capacidade necessária.
- Decisão: aceitar todos os níveis nativos, embora os casos principais sejam
  `log`, `warn` e `error`. Isso preserva a API do framework para investigação
  detalhada e para o limiar estrito `fatal`, sem inventar valores proprietários.
- Decisão: usar `log` como padrão. Isso evita que um deployment sem a nova variável
  perca avisos ou falhas e mantém a entrega compatível; a redução na Vercel exige
  configuração operacional explícita.
- Decisão: validar com enum estrito e falhar no bootstrap. Corrigir uma configuração
  inválida é mais seguro do que produzir volume inesperado ou ocultar erros por
  fallback silencioso.
- Risco: `LOG_LEVEL=fatal` ocultar `error` e `warn`. Mitigação: comportamento
  explícito na tabela, enum sem aliases e smoke por ambiente antes de adotar o
  limiar em produção.
- Risco: considerar `log` como o nível mais detalhado. Mitigação: documentar que
  `debug` e `verbose` são menos severos e exigem seus próprios limiares.
- Risco: acreditar que a filtragem evita toda preparação de dados de logging.
  Mitigação: declarar que a feature reduz emissão e I/O, sem refatorar a
  sanitização calculada antes das chamadas.
- Risco: configurar somente um escopo da Vercel. Mitigação: validar Development,
  Preview e Production separadamente e realizar novo deployment após qualquer
  alteração.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- `LOG_LEVEL` validado, tipado e documentado com padrão `log`
- Cascata delegada ao NestJS sem expansão própria de níveis
- Logger global, correlação e sanitização preservados
- SDDs vivos da API atualizados
- Configuração e smoke dos ambientes alvo registrados no resumo da implementação
- Quality gates da raiz e E2E da API aprovados
