# Feature Spec: Persistir MongoDB no desenvolvimento local

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0053`.
- Problema: o MongoDB iniciado por `pnpm dev` ou `pnpm -C api dev:infra` mantém os
  dados durante reloads do Nest, mas usa um diretório temporário criado pelo
  `mongodb-memory-server`. Encerrar a sessão de desenvolvimento remove esse
  diretório, e a próxima execução começa com o banco vazio. Isso obriga a repetir
  seeds e preparações locais entre sessões.
- Resultado: somente o MongoDB administrado pelo orquestrador de desenvolvimento
  usa um diretório local fixo e ignorado pelo Git. Um encerramento normal ou uma
  nova execução reutiliza os documentos existentes. Redis, testes unitários, E2E,
  Preview e Production preservam integralmente seus ciclos de vida atuais.
- Referências locais:
  - `docs/sdd/base/02-workspace-e-qualidade.md`;
  - `docs/sdd/base/05-documentacao-oficial-das-tecnologias.md`;
  - `docs/sdd/adr/ADR-0001-estrategia-de-mocks-e-bancos-de-teste.md`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/base/03-testes-e-qualidade.md`;
  - `api/docs/sdd/base/04-mocks-e-bancos-de-teste.md`;
  - `api/scripts/dev-infra.mjs`;
  - `api/test/seeds/cli.ts`.
- Referências oficiais consultadas:
  - [MongoDB Memory Server — API](https://typegoose.github.io/mongodb-memory-server/typedoc/classes/MongoMemoryServer.MongoMemoryServer.html),
    para o ciclo de vida de `MongoMemoryServer`, `stop` e `cleanup`;
  - [MongoDB Memory Server — FAQ](https://typegoose.github.io/mongodb-memory-server/versions/10.x/docs/guides/faq/),
    que distingue diretórios temporários de um `dbPath` informado manualmente e
    documenta a limpeza explícita do caminho persistente.
- Versões confirmadas no workspace: pacote `mongodb-memory-server` 11.2.0 e
  binário MongoDB 8.0.12. Os tipos locais dessa versão confirmam `instance.dbPath`
  e `stop({ doCleanup: false })`.
- Features relacionadas: não se aplica. A ADR-0001 continua proprietária da
  estratégia de bancos efêmeros nos E2E; esta feature altera somente a conveniência
  da infraestrutura de desenvolvimento.

## Escopo

### Incluído

- reservar `api/.data/mongodb/` como diretório local do banco de desenvolvimento;
- derivar o caminho absoluto a partir da localização de `api/scripts/dev-infra.mjs`,
  sem depender do diretório corrente usado para iniciar o comando;
- criar o diretório recursivamente antes de iniciar o MongoDB;
- fornecer esse caminho como `instance.dbPath` ao `MongoMemoryServer` já usado por
  `dev:infra`;
- manter `wiredTiger`, MongoDB 8.0.12, host `127.0.0.1`, porta `27017`, database
  `dall-fit` e proibição de troca silenciosa de porta;
- encerrar o processo `mongod` de forma graciosa sem remover o diretório
  persistente;
- informar nos logs do orquestrador que o MongoDB é persistente e que o Redis
  continua efêmero, sem imprimir documentos ou conteúdo do banco;
- ignorar todo `api/.data/` no Git para impedir o versionamento dos arquivos do
  WiredTiger, locks e metadados locais;
- preservar os seeds existentes como ações explícitas e idempotentes; nenhum seed
  será executado automaticamente ao subir a aplicação;
- atualizar, durante a implementação, os SDDs vivos transversais e da API que hoje
  descrevem o MongoDB de desenvolvimento como efêmero;
- validar por smoke local que um documento técnico persiste após parar e reiniciar
  `dev:infra`, e executar os gates aplicáveis, inclusive os E2E da API.

### Não incluído

- persistir Redis entre sessões de desenvolvimento;
- alterar qualquer `MongoMemoryServer` ou `RedisMemoryServer` criado pelas suítes
  E2E;
- compartilhar o banco de desenvolvimento com testes ou permitir que testes o
  limpem;
- usar o diretório persistente em CI, Preview, Production ou outro runtime que não
  seja o orquestrador local `dev:infra`;
- alterar `MONGODB_URI`, `REDIS_URL`, portas, nomes de database, schemas, índices,
  repositories, endpoints ou contratos HTTP;
- introduzir variável de ambiente para escolher o diretório, Docker, serviço
  MongoDB externo ou nova dependência;
- versionar snapshot, dump, fixture global ou qualquer documento local do MongoDB;
- executar seed, migração, backup, restore ou limpeza automática no startup ou no
  shutdown;
- criar comando de reset do banco nesta entrega;
- garantir compatibilidade automática dos arquivos persistidos após uma futura
  troca incompatível de versão do MongoDB ou de schema;
- alterar a UI, handlers MSW, Playwright ou fluxos ponta a ponta.

## Projetos e documentação afetados

- API e endpoints:
  - alterar apenas o lifecycle local em `api/scripts/dev-infra.mjs`;
  - atualizar `api/docs/sdd/base/01-arquitetura.md` e
    `api/docs/sdd/base/04-mocks-e-bancos-de-teste.md` para distinguir o MongoDB
    persistente de desenvolvimento dos bancos efêmeros de teste;
  - nenhum documento em `api/docs/sdd/endpoints/` muda, pois requests, responses,
    regras e efeitos HTTP permanecem iguais.
- Workspace:
  - atualizar `.gitignore` para ignorar `api/.data/`;
  - atualizar `docs/sdd/base/02-workspace-e-qualidade.md` com o lifecycle local
    vigente.
- UI e rotas: não se aplica — não há comportamento ou integração da UI alterados.
- Fluxos: não se aplica — nenhuma jornada ponta a ponta muda.
- Contratos em `@dall-fit/types`: não se aplica — nenhum valor novo atravessa a
  fronteira HTTP.
- Decisões arquiteturais: não criar ADR. A mudança é local, reversível e usa uma
  opção nativa da dependência já adotada; a decisão da ADR-0001 sobre isolamento e
  efemeridade dos E2E permanece intacta.
- Handlers e fixtures MSW: não se aplica — o frontend continua isolado da API real
  em seus testes.
- Mocks de repositories/caches nos unitários da API: não se aplica — testes
  unitários continuam sem iniciar MongoDB ou Redis.
- Fixtures MongoDB/Redis nos E2E: não se aplica — fixtures, limpeza, portas
  temporárias e lifecycle das suítes não mudam.

## Contrato pretendido da infraestrutura local

| Contexto                       | MongoDB                            | Redis                        |
| ------------------------------ | ---------------------------------- | ---------------------------- |
| `pnpm -C api dev:infra`        | persistente em `api/.data/mongodb` | efêmero                      |
| `pnpm -C api dev` e `pnpm dev` | reutiliza o mesmo diretório local  | efêmero                      |
| unitários da API               | não inicia banco                   | não inicia banco             |
| `pnpm -C api test:e2e`         | instância temporária por suíte     | instância temporária         |
| CI, Preview e Production       | configuração externa vigente       | configuração externa vigente |

O diretório é uma conveniência descartável do ambiente de cada pessoa
desenvolvedora, não uma fonte de verdade versionada. Na primeira execução ele está
vazio. Depois disso, documentos criados pela aplicação ou por seeds permanecem até
que a pessoa remova deliberadamente o diretório com a infraestrutura parada.

## Requisitos funcionais

1. A primeira execução de `dev:infra` deve criar `api/.data/mongodb/` quando ele
   não existir e iniciar o MongoDB normalmente em `127.0.0.1:27017/dall-fit`.
2. Quando o diretório já contiver um banco válido, `dev:infra` deve reutilizá-lo
   sem apagar collections, documentos, índices ou metadados do WiredTiger.
3. Encerrar `pnpm dev`, `pnpm -C api dev` ou `pnpm -C api dev:infra` por `SIGINT`
   ou `SIGTERM` deve parar MongoDB e Redis, preservando o diretório do MongoDB.
4. Um documento criado numa sessão de desenvolvimento deve continuar disponível
   depois de encerrar a infraestrutura, iniciá-la novamente e reconectar a API.
5. Reloads do Nest durante a mesma sessão devem continuar preservando os dados,
   como já ocorre hoje.
6. Redis deve continuar iniciando vazio a cada nova sessão e ser descartado no
   shutdown; esta feature não cria persistência para sessões, CSRF ou rate limits.
7. Os E2E devem continuar criando MongoDB e Redis próprios em portas temporárias,
   limpando somente seus datasets e removendo suas instâncias ao final.
8. Nenhuma suíte deve ler, gravar, reutilizar ou remover `api/.data/mongodb/`.
9. `pnpm -C api dev:infra`, `pnpm -C api dev` e `pnpm dev` devem resolver o mesmo
   diretório persistente independentemente do diretório corrente do processo.
10. O orquestrador deve continuar falhando quando `27017` ou `6379` estiver
    ocupada, sem selecionar outra porta e sem apagar o banco persistente ao tratar
    a falha.
11. O startup não deve executar seeds nem transformar os dados existentes. Seeds
    continuam sendo chamados explicitamente por `pnpm -C api seed -- <cenário>`.
12. O log de prontidão deve distinguir que MongoDB persiste e Redis é descartado,
    substituindo a afirmação atual de que todos os dados são efêmeros.
13. Os arquivos criados sob `api/.data/` não devem aparecer como alterações ou
    arquivos não rastreados no Git.

## Requisitos não funcionais

- Acessibilidade: não se aplica — não há interface visual ou interação nova.
- Performance:
  - reutilizar o banco não adiciona serviço externo, cópia ou restore no startup;
  - o diretório usa o mesmo `wiredTiger` e pode crescer conforme o uso local;
  - nenhum dado persistente de desenvolvimento entra em cache ou artefato do CI.
- Segurança e privacidade:
  - o diretório inteiro é ignorado pelo Git e não pode ser incluído em commits;
  - não persistir credenciais, tokens ou dados pessoais reais como fixtures;
  - logs podem informar o modo e o caminho relativo, mas nunca documentos,
    connection strings com credenciais ou conteúdo do banco;
  - a persistência local não autoriza copiar datasets de Preview ou Production.
- Observabilidade:
  - manter mensagens de startup, prontidão, sinais, shutdown e falha do
    orquestrador;
  - informar separadamente o lifecycle de MongoDB e Redis;
  - uma falha por diretório inacessível, lock vigente, dados incompatíveis ou
    processo em porta ocupada deve continuar terminando com código de erro e sem
    limpeza automática do diretório.
- Confiabilidade:
  - o caminho é derivado da URL do próprio módulo, não de `process.cwd()`;
  - o diretório deve existir antes de ser entregue ao `MongoMemoryServer`;
  - shutdown explícito deve desabilitar cleanup do MongoDB persistente e preservar
    a espera pelos dois processos com `Promise.allSettled`.

## Critérios de aceite

### Cenário 1 — Primeira inicialização cria armazenamento local

- Forma de validar: smoke local de `pnpm -C api dev:infra`; seed e cURL não se
  aplicam porque o cenário valida infraestrutura anterior ao HTTP.
- Given: `api/.data/mongodb/` ainda não existe e as portas locais estão livres.
- When: a infraestrutura de desenvolvimento é iniciada.
- Then: o diretório é criado, MongoDB 8.0.12 inicia com `wiredTiger` na porta
  `27017`, Redis inicia na porta `6379` e o log informa seus lifecycles distintos.

### Cenário 2 — Dados sobrevivem ao reinício do desenvolvimento

- Forma de validar: smoke em duas execuções de `dev:infra`, inserindo entre elas um
  documento técnico com identificador único por um client Mongoose local e
  removendo somente esse documento após a confirmação; não há endpoint, seed ou
  cURL específico afetado.
- Given: a primeira execução está pronta e um documento técnico foi gravado no
  database `dall-fit`.
- When: a infraestrutura é encerrada graciosamente e iniciada novamente.
- Then: o documento ainda pode ser lido com o mesmo identificador e os demais dados
  existentes permanecem intactos.

### Cenário 3 — Seeds permanecem explícitos e seus dados são reutilizados

- Forma de validar: executar um seed vigente, reiniciar `dev:infra` e confirmar o
  estado por leitura direta segura ou pelo cenário HTTP já documentado pelo seed.
- Given: um seed idempotente foi executado deliberadamente contra o MongoDB local.
- When: a sessão de desenvolvimento termina e uma nova sessão começa.
- Then: o estado criado pelo seed continua disponível, sem nova execução
  automática e sem duplicação introduzida pelo startup.

### Cenário 4 — Redis continua efêmero

- Forma de validar: smoke local do client Redis antes e depois de reiniciar
  `dev:infra`; endpoint e cURL não se aplicam porque o lifecycle da infraestrutura
  é o objeto da validação.
- Given: uma chave técnica sem segredo foi gravada no Redis de desenvolvimento.
- When: a infraestrutura é encerrada e iniciada novamente.
- Then: a chave não existe na nova sessão, enquanto o documento MongoDB do cenário
  persistente continua disponível.

### Cenário 5 — E2E permanecem isolados

- Forma de validar: `pnpm -C api test:e2e` e inspeção das configurações das suítes.
- Given: `api/.data/mongodb/` contém dados locais e a infraestrutura de
  desenvolvimento não está sendo compartilhada com os testes.
- When: os E2E da API são executados.
- Then: cada suíte usa suas instâncias temporárias, seus dados mínimos e seu
  teardown vigente; o conteúdo e os metadados do diretório persistente não mudam.

### Cenário 6 — Porta ou diretório indisponível falha sem perda de dados

- Forma de validar: smoke controlado com a porta ocupada e revisão da falha de
  acesso ao diretório, sem usar dados pessoais ou segredos.
- Given: a porta fixa está ocupada ou o diretório persistente não pode ser aberto.
- When: `dev:infra` tenta iniciar.
- Then: o comando termina com erro claro, encerra apenas os processos que iniciou,
  não seleciona outra porta e não remove nem recria automaticamente o diretório.

### Cenário 7 — Arquivos locais nunca entram no Git

- Forma de validar: iniciar e encerrar `dev:infra` e executar `git status --short`.
- Given: o MongoDB criou arquivos do WiredTiger sob `api/.data/mongodb/`.
- When: o estado do worktree é consultado.
- Then: nenhum arquivo sob `api/.data/` é listado pelo Git.

### Cenário 8 — Comandos agregados usam o mesmo banco

- Forma de validar: smoke separado de `pnpm -C api dev` e `pnpm dev`, preservando
  um documento técnico entre as execuções.
- Given: existe um documento no diretório persistente criado por `dev:infra`.
- When: a aplicação é iniciada pelo comando da API e depois pelo comando da raiz.
- Then: ambos conectam em `127.0.0.1:27017/dall-fit` e observam o mesmo documento,
  sem criar diretórios dependentes do diretório corrente.

## Estratégia de entrega e compatibilidade

- A mudança fica contida no orquestrador de desenvolvimento. O módulo Nest e sua
  `MONGODB_URI` continuam desconhecendo se o processo local usa diretório
  temporário ou persistente.
- `api/.data/mongodb/` é fixo, relativo ao projeto da API e convertido em caminho
  absoluto antes do startup. Não criar configuração adicional em `.env` ou no
  `package.json`.
- A primeira execução após a entrega começa vazia porque ainda não existe o novo
  diretório. Execuções posteriores o reutilizam.
- O shutdown chama `stop` sem cleanup para o MongoDB e mantém o encerramento atual
  do Redis. Nenhum caminho de erro força limpeza do `dbPath` manual.
- E2E não reutilizam helper, constante ou opção persistente do script de
  desenvolvimento. Suas chamadas atuais a `MongoMemoryServer.create` continuam
  sem `dbPath` fixo e preservam o cleanup temporário.
- Não há migração do banco efêmero atual, pois seu diretório já é removido ao fim
  da sessão. Também não há alteração de schema ou índice.
- O rollback de código remove o `dbPath` configurado e restaura o lifecycle
  efêmero. O diretório local já criado permanece ignorado e não é apagado
  automaticamente pelo rollback.
- Se uma futura atualização do binário não puder abrir os arquivos existentes, o
  startup deve falhar sem perda automática. A pessoa pode descartar manualmente o
  diretório com a infraestrutura parada; preservar esses dados não é garantia de
  migração ou backup.
- Os SDDs vivos são atualizados junto da implementação, nunca antecipadamente
  nesta fase de especificação.

## Plano de testes

- smoke de persistência do MongoDB:
  - iniciar `dev:infra` com o diretório disponível;
  - inserir um documento técnico de identificação única usando o client local;
  - encerrar por sinal suportado e aguardar o shutdown;
  - reiniciar e confirmar a leitura do mesmo documento;
  - remover somente o documento criado pelo smoke, preservando qualquer outro
    dado local;
- smoke de efemeridade do Redis com chave técnica criada e consultada antes e
  depois do reinício;
- smoke dos comandos `pnpm -C api dev` e `pnpm dev` para confirmar o mesmo caminho
  independente do diretório corrente;
- smoke de falha com porta ocupada para confirmar ausência de fallback e cleanup;
- executar `git status --short` depois da criação dos arquivos de banco para
  confirmar a regra de ignore;
- revisar `api/test/*.e2e-spec.ts` para confirmar que nenhuma instância recebeu o
  caminho persistente;
- executar `pnpm -C api test:e2e` para proteger isolamento, criação, limpeza e
  teardown dos bancos temporários;
- quality gates da fase de implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e` por alteração no lifecycle local de MongoDB.

Não criar teste unitário que apenas replique uma constante de caminho. Testes de UI
e `pnpm test:integration` não são necessários porque nenhuma rota, request,
response, fixture MSW ou jornada Playwright muda.

## Riscos e decisões

- Decisão: persistir somente MongoDB. Redis contém sessão, CSRF, rate limit e dados
  temporários cuja reutilização entre sessões não é requisito desta demanda.
- Decisão: usar `api/.data/mongodb/` fixo e ignorado, em vez de variável de
  ambiente. Há um único processo local proprietário e um caminho determinístico
  reduz divergência entre comandos e pessoas desenvolvedoras.
- Decisão: manter `wiredTiger`. O engine já é usado no desenvolvimento e suporta
  a persistência em disco esperada; não há razão para mudar a semântica junto desta
  demanda.
- Decisão: tornar o não cleanup explícito no shutdown. Embora a dependência não
  force por padrão a remoção de `dbPath` manual, a opção documenta a intenção e
  protege o comportamento de chamadas futuras no script.
- Decisão: não executar seed automático. Persistência deve conservar o estado
  escolhido pela pessoa desenvolvedora, sem transformar um seed específico em
  fixture global nem sobrescrever mudanças locais.
- Decisão: não criar reset automático ou comando novo. Remoção é excepcional,
  deliberada e só deve ocorrer com a infraestrutura parada.
- Risco: dados antigos divergirem dos schemas ou índices atuais. Mitigação: manter
  seeds idempotentes e permitir descarte manual do diretório; nunca apagar ou
  migrar silenciosamente no startup.
- Risco: crescimento do diretório local. Mitigação: restringir o armazenamento a
  uma pasta conhecida, ignorada e descartável, sem incluí-la em CI ou artefatos.
- Risco: arquivos incompatíveis após atualizar MongoDB. Mitigação: versão do
  binário continua fixada e incompatibilidade falha de forma visível, sem cleanup
  automático.
- Risco: uma suíte passar a depender acidentalmente do banco local. Mitigação:
  manter a configuração no script `dev-infra.mjs`, sem helper compartilhado com
  testes, e executar os E2E com seus próprios lifecycles temporários.
- Risco: encerramento abrupto deixar lock ou recuperação pendente. Mitigação:
  preservar handlers de `SIGINT`/`SIGTERM` e o shutdown gracioso; em crash, delegar
  a recuperação dos arquivos ao WiredTiger em vez de remover o diretório.
- Risco: versionar arquivos binários ou dados locais. Mitigação: ignorar todo
  `api/.data/` antes da primeira inicialização persistente e validar com Git.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- MongoDB local preservado entre sessões de desenvolvimento
- Redis de desenvolvimento mantido efêmero
- Unitários e E2E mantidos independentes do diretório persistente
- Nenhuma mudança em endpoint, contrato HTTP, UI, MSW ou Playwright
- Diretório `api/.data/` ignorado e sem dados versionados
- SDDs vivos transversal e da API atualizados
- Smokes locais de persistência, efemeridade, falha segura e ignore aprovados
- Quality gates da raiz e E2E da API aprovados
