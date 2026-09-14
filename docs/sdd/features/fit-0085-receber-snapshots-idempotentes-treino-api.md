# Feature Spec: Receber snapshots idempotentes de treino na API

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #85](https://github.com/eduardodallmann/dall-fit/issues/85).
- Problema: o Android persistirá cada ação de treino antes de confirmá-la para a
  pessoa e enviará snapshots completos coalescidos. A API ainda não possui um
  contrato capaz de autorizar esses uploads pelo lease vigente, impedir replay ou
  regressão, validar uma árvore histórica do plano e recalcular dados derivados sem
  confiar no cliente.
- Resultado: a API recebe individualmente a revisão mais recente de uma execução
  em andamento, valida identidade, lease, plano e conteúdo bruto, e mantém no Redis
  uma única execução corrente por pessoa. A transição é idempotente e ordenada: uma
  revisão nova substitui atomicamente o snapshot anterior, replay idêntico é
  reconhecido sem escrita e revisões regressivas ou colisões são recusadas. Somente
  aceite de uma revisão nova renova por sete dias o snapshot e o lease.
- Referências:
  - [SDD transversal](../README.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [governança do SDD](../base/04-governanca-do-sdd.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da API](../../../api/docs/sdd/base/01-arquitetura.md);
  - [endpoints e contratos HTTP](../../../api/docs/sdd/base/02-endpoints-e-contratos.md);
  - [testes e qualidade da API](../../../api/docs/sdd/base/03-testes-e-qualidade.md);
  - [seeds e cURLs](../../../api/docs/sdd/base/05-seeds-e-curls-de-cenario.md);
  - [logging e rastreabilidade](../../../api/docs/sdd/base/06-logging-e-rastreabilidade.md);
  - [endpoint de lease offline](../../../api/docs/sdd/endpoints/offline-training-lease.md);
  - [endpoints de treino](../../../api/docs/sdd/endpoints/training.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [ADR-0010 — sessão efêmera e histórico de treino](../adr/ADR-0010-sessao-efemera-e-historico-de-treino.md);
  - [ADR-0014 — motor nativo de persistência offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [ADR-0015 — lease offline de treino no Redis](../adr/ADR-0015-lease-offline-de-treino-no-redis.md);
  - [scripts Lua atômicos no Redis](https://redis.io/docs/latest/develop/programmability/eval-intro/);
  - [`SET` e expiração no Redis](https://redis.io/docs/latest/commands/set/);
  - [Lua no ioredis](https://github.com/redis/ioredis#lua-scripting).
- Features relacionadas: [FIT-0082](fit-0082-nucleo-nativo-persistencia-offline.md)
  fornece `executionId`, `payloadVersion`, revisão monotônica e snapshot opaco no
  SQLite; [FIT-0084](fit-0084-lease-redis-plano-instalacao-pessoa.md) fornece a
  autorização cercada por `leaseId`. A issue 86 acrescentará conclusão,
  cancelamento, persistência durável e resolução entre versões completas. A issue
  87 implementará o sincronizador Android e seu lock global de foreground e
  background. A issue 89 produzirá os snapshots locais a partir da jornada Treinar.

A API usa NestJS `11.1.28`, ioredis `5.11.1`, Zod `4.4.3` e o singleton Redis já
existente. A atomicidade da decisão Redis permanece em scripts Lua curtos: a
documentação oficial confirma que um script executa atomicamente e bloqueia outras
atividades enquanto está ativo. Por isso o script desta feature deve apenas
comparar metadados e gravar valores já validados e serializados, sem percorrer a
árvore do treino dentro do Redis.

## Escopo

### Incluído

- publicar em `@dall-fit/types` o request e a response versionados do snapshot em
  andamento, já que a API e o futuro sincronizador Android compartilham o contrato;
- criar `PUT /training/offline-snapshot`, exclusivo de sessão Bearer nativa, com
  `payloadVersion: 1` no body e resposta `private, no-store`;
- usar `executionId` gerado pelo aplicativo e `revision` inteira monotônica como a
  identidade idempotente de cada snapshot;
- receber uma árvore autocontida e estrita do plano capturado, do workout e do
  progresso bruto, sem totais, duração calculada ou outras métricas fornecidas pelo
  cliente;
- validar pessoa autenticada, `installationId`, `leaseId`, plano cercado pelo
  lease, relações internas da árvore, discriminadores, IDs, timestamps, cargas e
  limites antes de qualquer escrita;
- aceitar a estrutura histórica capturada no início da execução depois dessas
  validações, sem exigir igualdade com a versão corrente do plano no MongoDB e sem
  transformar o cliente em autoridade sobre outro plano;
- manter uma única chave de snapshot corrente por pessoa no Redis, com TTL
  deslizante de sete dias somente após aceite de uma revisão nova;
- classificar atomicamente criação, atualização, replay idêntico, revisão obsoleta,
  colisão idempotente e tentativa de trocar a execução corrente;
- ordenar a evolução pelo par `executionId + revision`; conservar timestamps
  brutos válidos e produzir metadados server-side determinísticos para empates ou
  regressões do relógio do cliente;
- renovar o lease somente depois do aceite atômico de uma revisão nova; replay,
  validação, conflito ou falha não renovam lease nem snapshot;
- serializar no backend os requests da mesma instalação por um lock Redis global e
  limitado, sem lock em memória por instância Nest;
- definir respostas e erros estáveis para aceite, duplicata, concorrência,
  validação, tamanho, lease, conflito e indisponibilidade;
- adicionar unitários e E2E seriais com Redis e MongoDB efêmeros reais para
  autorização, replay, ordenação, atomicidade, concorrência, TTL e falhas;
- atualizar, durante a implementação autorizada, contratos compartilhados,
  documentação viva do endpoint, arquitetura da API, fluxo e ADR do lease conforme
  o comportamento efetivamente entregue.

### Não incluído

- cliente HTTP ou sincronizador Android, coalescência, fila, backoff, retry por
  conectividade, WorkManager ou lock compartilhado entre foreground e background;
- adaptação da rota Treinar, persistência de ações pela UI, modo avião, timers de
  apresentação ou resumo provisório;
- finalização ou cancelamento offline, resumo canônico terminal, escrita em
  `workout_executions`, perfis de carga ou limpeza terminal da sessão;
- múltiplas execuções simultaneamente aceitas no servidor, importação como execução
  adicional, merge de snapshots ou escolha entre versões completas;
- substituição de uma execução corrente por outro `executionId`; esse caminho é
  conflito até a issue 86 definir finalização ou cancelamento;
- lote de snapshots, upload de eventos semânticos, patch parcial ou outbox de ações;
- persistência MongoDB de snapshot intermediário, tombstone, histórico de revisões
  ou fila server-side;
- comparação da árvore capturada com o conteúdo atual do plano, migração automática
  para plano editado ou rejeição apenas porque nome, ordem ou exercícios mudaram;
- mudanças na sessão Web de 24 horas, nos endpoints online existentes ou na UI;
- analytics offline, telemetria persistida ou conteúdo de treino em logs.

## Projetos e documentação afetados

- API e endpoints: adicionar o controller/DTO/command/services do endpoint no
  módulo de treino; estender o `RedisKeyService`; integrar o lease existente; criar
  `api/docs/sdd/endpoints/offline-training-snapshot.md` e atualizar arquitetura,
  catálogo de seeds e o endpoint de lease na implementação.
- UI e rotas: nenhuma tela, rota, handler MSW ou fixture muda nesta entrega. O
  pacote compartilhado ganha tipos para o consumidor nativo futuro, mas a UI ainda
  não chama o endpoint.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` somente na implementação
  para registrar a ingestão disponível, sem declarar sincronizador ou treino
  offline já entregues.
- Contratos em `@dall-fit/types`: adicionar o envelope v1, a árvore bruta capturada,
  os estados `accepted | duplicate` e a response de sucesso; exportar somente pelo
  barrel público.
- Decisões arquiteturais: atualizar a ADR-0015 para registrar que revisão nova
  aceita renova o lease e replay não renova. Criar outra ADR somente se a
  implementação revelar uma decisão transversal difícil de reverter que não esteja
  coberta pelas ADRs 0010, 0014 e 0015.
- Handlers e fixtures MSW: não se aplica; ainda não existe consumidor HTTP na UI.
- Mocks de repositories/caches nos unitários da API: command substitui services;
  services de snapshot e lock substituem Redis, key service, clock e lease por
  doubles tipados, sem banco real.
- Fixtures MongoDB/Redis nos E2E: pessoa, sessão Bearer nativa, plano/lease e
  snapshots determinísticos; cada cenário limpa somente o estado do Redis efêmero
  dedicado e as entidades MongoDB que preparou.

## Contrato HTTP v1

### Endpoint e envelope

`PUT /training/offline-snapshot` recebe um único objeto estrito:

- `payloadVersion: 1` seleciona o único schema aceito nesta entrega;
- `installationId`: UUID v4 da instalação autenticada;
- `leaseId`: UUID v4 da concessão que cercou a produção do snapshot;
- `executionId`: UUID v4 estável, gerado pelo aplicativo uma vez para a execução;
- `revision`: inteiro seguro entre `0` e `2_147_483_647`, monotônico dentro da
  execução e igual à revisão persistida no SQLite;
- `clientUpdatedAt`: timestamp ISO 8601 com timezone do commit local representado;
- `snapshot`: agregado bruto v1 descrito abaixo.

Pessoa e expiração nunca vêm do cliente. O plano enviado dentro do snapshot deve
coincidir com o `planId` do lease validado. A combinação pessoa + instalação +
plano + `leaseId` é confrontada integralmente antes de aceitar o conteúdo.

### Agregado bruto do snapshot

O schema v1 representa somente uma execução em andamento e contém:

- contexto capturado do plano: `planId`, `catalogEntryId`, nome, origem e a lista
  ordenada de até 25 workouts com ID, nome e áreas corporais necessárias às
  projeções futuras;
- workout executado: ID, nome e lista ordenada de até 50 exercícios capturados;
- `startedAt` bruto da execução;
- estado bruto de cada exercício, preservando o discriminador vigente entre
  `youtube-short`, `image`, `youtube-long`, `pause` e `duration`, seus parâmetros
  necessários à execução e `completedAt` anulável;
- para exercícios por séries, lista ordenada de até 100 séries com número único e
  consecutivo, repetições, `loadKg` inteira de 0 a 9999 ou `null`, e
  `completedAt` anulável;
- timer em andamento opcional, com tipo, exercício relacionado, série quando
  aplicável, início e duração brutos suficientes para validação e cálculo futuro.

IDs referenciados devem pertencer à própria árvore: o workout executado aparece no
plano, todo exercício/timer pertence ao workout e toda série pertence ao exercício
correto. Tipos incompatíveis não aceitam campos de série ou timer. Ordem, limites
numéricos e os comprimentos de strings reutilizam os limites canônicos vigentes do
domínio de planos e treino.

O request não contém `personId`, estado do lease, `expiresAt`, `serverNow`, versão
da sessão Web, duração calculada, contagens, soma de cargas, percentual, resumo
semanal ou resultado terminal. Campos adicionais são rejeitados. Quando uma
projeção interna precisar desses valores, a API os recalcula exclusivamente da
árvore, conclusões, cargas e timestamps brutos validados.

O JSON serializado completo não pode ultrapassar 1 MiB, mesmo limite do snapshot
de sessão online. O limite é verificado antes de adquirir o lock de ingestão ou
alterar Redis; conteúdo acima dele responde `413
OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE`.

### Sucesso e metadados canônicos

Sucesso usa `200`, `Cache-Control: private, no-store` e
`ApiResponse<OfflineTrainingSnapshotResult>`. `data` contém:

- `executionId` e `revision` confirmados;
- `state: accepted | duplicate`;
- `acceptedAt`: instante server-side do primeiro aceite daquela revisão;
- `orderedAt`: instante server-side usado como desempate canônico quando
  `clientUpdatedAt` empata ou regride; fora desse caso acompanha o timestamp do
  cliente já validado;
- `expiresAt`: vencimento server-side do snapshot corrente.

`accepted` significa que a revisão nova foi gravada e que snapshot e lease foram
renovados por sete dias. `duplicate` exige mesma execução, revisão e conteúdo
canônico; devolve exatamente os metadados persistidos no primeiro aceite e não
reescreve nem renova snapshot, lease ou lock.

## Requisitos funcionais

1. `SessionAuthGuard` e `NativeSessionGuard` executam antes do command. Cookie Web
   recebe `403 NATIVE_SESSION_REQUIRED`; cookie e Bearer simultâneos recebem `400
   AUTH_TRANSPORT_AMBIGUOUS`. Sessão nativa validada dispensa CSRF.
2. O DTO rejeita versão diferente de `1`, UUIDs inválidos, revisão fora do limite,
   timestamp sem timezone, campo adicional, tipo discriminado incompatível,
   relação quebrada ou limite excedido com `400 VALIDATION_ERROR`. O limite total
   usa o erro específico `413`.
3. O command recebe a pessoa somente da sessão, prepara contratos de domínio,
   chama os services na ordem necessária, traduz os resultados e monta a response.
   Controller e command nunca acessam Redis diretamente.
4. O `planId` do snapshot deve coincidir com o lease cercado e todas as relações
   internas devem ser consistentes. Depois disso a árvore capturada é aceita mesmo
   que o plano corrente no MongoDB tenha sido editado; conteúdo do cliente nunca
   altera o plano persistido nem autoriza outro plano.
5. O backend usa uma chave lógica `offline-training-snapshot` por pessoa. Seu valor
   contém identidade da execução, revisão, hash canônico do conteúdo, timestamps
   cliente/servidor, expiração e o agregado v1 validado. Não há chave ou documento
   por revisão.
6. A primeira revisão aceita cria a chave por sete dias e retorna `accepted`. Uma
   revisão maior da mesma execução substitui o agregado completo, atualiza os
   metadados e reinicia os sete dias.
7. Mesma execução e mesma revisão com o mesmo hash canônico retorna `duplicate`
   usando os metadados já persistidos. O replay não executa write, não desloca TTL
   e não chama renovação do lease.
8. Mesma execução e mesma revisão com conteúdo diferente responde `409
   OFFLINE_TRAINING_SNAPSHOT_IDEMPOTENCY_CONFLICT`. O servidor não escolhe um dos
   payloads nem revela a versão armazenada.
9. Revisão menor que a corrente responde `409
   OFFLINE_TRAINING_SNAPSHOT_STALE`. Revisão maior é a única capaz de avançar o
   estado; timestamps nunca autorizam uma revisão regressiva.
10. Outro `executionId` enquanto a chave existe responde `409
    OFFLINE_TRAINING_EXECUTION_CONFLICT` e preserva integralmente a execução
    corrente. Response e logs não devolvem o ID ou o conteúdo armazenado.
11. Para uma revisão maior, `clientUpdatedAt` superior ao último timestamp aceito
    preserva a ordenação do cliente. Em empate ou regressão, o servidor define
    `orderedAt` pela ordem linearizada de chegada, maior que o valor canônico
    anterior, sem reescrever timestamps brutos do treino.
12. A API adquire um lock Redis global por instalação antes da região que valida o
    lease contra o estado mutável e decide a ingestão. O lock usa token opaco,
    expiração curta e remoção condicionada ao token; nunca usa `DEL` cego, espera
    ilimitada ou mutex em memória.
13. Contenção do lock responde `409 OFFLINE_TRAINING_SYNC_IN_PROGRESS`, erro
    transitório que o consumidor pode repetir. O lock é liberado em sucesso e erro;
    sua expiração limita recuperação depois de queda do processo.
14. Sob o lock, a transição Redis confronta lease, snapshot e revisão de forma
    atômica. Requests concorrentes da mesma instalação ou de runtimes Nest
    diferentes observam uma ordem total e no máximo uma revisão efetiva por vez.
15. Somente depois de gravar uma revisão nova o fluxo chama a renovação
    condicionada do lease. Snapshot e lease devem terminar alinhados em sete dias;
    se a renovação não puder confirmar a mesma tupla, a ingestão não declara
    aceite e não deixa a nova revisão publicamente efetiva.
16. A implementação deve garantir a regra anterior em uma única transição Lua ou
    por staging/compensação Redis que não exponha estado parcial. Não existe
    transação MongoDB–Redis, fallback local ou aceite otimista.
17. Lease ausente produz `410 OFFLINE_LEASE_EXPIRED`; lease divergente produz `409
    OFFLINE_LEASE_REVOKED`; falha Redis produz `503
    OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE`. Nenhum desses caminhos altera snapshot,
    TTL ou MongoDB.
18. O rate limit reutiliza a política de mutação frequente de treino por
    pessoa/sessão e IP. UUID informado pelo cliente não cria quota, identidade ou
    chave sem antes passar pela autorização.
19. O endpoint nunca grava MongoDB. Persistência durável, recibos terminais e
    remoção da execução corrente pertencem à issue 86.

## Requisitos não funcionais

- Acessibilidade: não se aplica diretamente; nenhuma superfície visual é criada ou
  modificada.
- Performance:
  - request máximo de 1 MiB, no máximo 25 workouts, 50 exercícios no workout e 100
    séries por exercício;
  - validação e hash acontecem uma vez antes da região crítica; o script Redis
    compara metadados em tempo constante e grava um único valor já serializado;
  - não há scan, polling, histórico de revisões, conexão por request, lote ou loop
    Lua proporcional ao payload;
  - lock possui espera zero e TTL limitado, evitando ocupar request ou runtime em
    contenção.
- Segurança e privacidade:
  - somente sessão Bearer nativa e lease integralmente coincidente autorizam
    ingestão;
  - conteúdo não pode informar pessoa, alterar plano, renovar outro fence ou
    escapar dos discriminadores e limites do contrato;
  - payload, nomes, cargas, timestamps de ações, pessoa, plano, instalação,
    execução, `leaseId`, hash, chave Redis e valor persistido nunca entram em logs,
    erros ou métricas;
  - response expõe somente IDs já enviados pelo próprio cliente e metadados
    server-side da própria operação;
  - dados permanecem efêmeros e expiram; não há mídia, signed URL ou binário no
    snapshot.
- Observabilidade:
  - todos os métodos seguem `NomeDaClasse -> nomeDoMetodo -> etapa:` e registram
    entrada, retorno de dependências, branches e saída por resumos sanitizados;
  - logs podem conter operação, `payloadVersion`, revisão categorizada, contagens,
    tamanho, estado público, duração do lock e códigos, nunca IDs ou conteúdo;
  - aceite, duplicata, stale, colisão, execução concorrente, lock ocupado, lease
    expirado/revogado e Redis indisponível permanecem distinguíveis sem payload.
- Resiliência: retry de resposta perdida observa `duplicate`; lock abandonado
  expira; falha antes do commit não muda snapshot ou lease; falha depois do commit
  não produz estado parcialmente renovado.
- Compatibilidade: endpoint e tipos são aditivos. Sessão online, Web/CSRF, lease,
  Redis compartilhado, plano ativo e histórico atual permanecem compatíveis.
  Versões futuras do payload adicionam outro ramo explícito sem reinterpretar v1.
- Limite de execução: a implementação deve caber em uma sessão de até cinco horas.
  Ela reutiliza autenticação nativa, módulo de treino, singleton/key service Redis,
  lease, relógio, erros, limites e infraestrutura E2E existentes. Se exigir
  MongoDB durável, UI, Android, finalização, múltiplas execuções ou protocolo de
  resolução, deve parar e retornar ao refinamento da issue correspondente.

## Critérios de aceite

### Cenário 1 — primeira revisão é aceita e renova

- Forma de validar: cenário vivo do novo endpoint com seed e cURL Bearer nativo,
  complementado pelo E2E que inspeciona chaves e PTTL.
- Given: pessoa, instalação, plano e lease são válidos e não existe snapshot
  server-side.
- When: envia um payload v1 válido na revisão 0.
- Then: recebe `200 accepted`; Redis conserva exatamente aquela execução por sete
  dias e o lease correspondente é renovado para a mesma janela.

### Cenário 2 — replay idêntico não escreve nem renova

- Forma de validar: cenário vivo com o mesmo cURL repetido e relógio controlado,
  além de E2E que compara valor e PTTL.
- Given: a revisão já foi aceita.
- When: repete a mesma `executionId`, revisão e conteúdo depois de parte da validade
  transcorrer.
- Then: recebe `200 duplicate` com os metadados originais; conteúdo, snapshot TTL e
  lease TTL permanecem inalterados.

### Cenário 3 — revisão nova substitui o snapshot completo

- Forma de validar: seed com revisão 0 e cURL da revisão 1, complementado por E2E.
- Given: existe revisão 0 para a mesma execução.
- When: chega revisão 1 válida com progresso adicional.
- Then: recebe `accepted`; somente o agregado completo da revisão 1 permanece e os
  TTLs de snapshot e lease voltam a sete dias.

### Cenário 4 — revisão regressiva não altera o estado

- Forma de validar: seed com revisão corrente maior e cURL de revisão menor.
- Given: revisão 2 já foi aceita.
- When: chega revisão 1 da mesma execução.
- Then: recebe `409 OFFLINE_TRAINING_SNAPSHOT_STALE`; Redis e TTLs não mudam.

### Cenário 5 — colisão idempotente é distinguida de duplicata

- Forma de validar: seed com uma revisão e cURL da mesma identidade com conteúdo
  diferente.
- Given: execução e revisão já identificam um conteúdo aceito.
- When: outro conteúdo usa a mesma revisão.
- Then: recebe `409 OFFLINE_TRAINING_SNAPSHOT_IDEMPOTENCY_CONFLICT`; nenhum payload
  vence ou é devolvido.

### Cenário 6 — outra execução não substitui a corrente

- Forma de validar: seed com execução A e cURL de execução B.
- Given: A ainda é a execução corrente da pessoa.
- When: B tenta enviar sua primeira revisão.
- Then: recebe `409 OFFLINE_TRAINING_EXECUTION_CONFLICT`; A permanece intacta e seu
  identificador não é revelado pela resposta.

### Cenário 7 — relógio igual ou regressivo tem ordem determinística

- Forma de validar: E2E com relógio controlado e revisões sequenciais usando
  timestamps iguais e depois regressivos; o endpoint vivo inclui seed e cURL para
  o empate.
- Given: uma revisão aceita possui `clientUpdatedAt` T.
- When: revisões maiores chegam com T e com instante anterior a T.
- Then: ambas avançam pela revisão, conservam os timestamps brutos e recebem
  `orderedAt` server-side estritamente ordenado pela chegada.

### Cenário 8 — árvore histórica válida é aceita

- Forma de validar: seed prepara lease para o plano e depois altera sua árvore
  canônica; cURL envia o snapshot capturado antes da edição.
- Given: o fence continua válido para o mesmo plano, mas nome, ordem ou exercícios
  atuais já mudaram.
- When: a instalação envia a árvore antiga estruturalmente válida e internamente
  relacionada.
- Then: a API aceita a revisão sem reescrever o plano MongoDB; futuras execuções
  continuam usando a árvore atual.

### Cenário 9 — payload ou relação inválida falha antes dos efeitos

- Forma de validar: cenários vivos com seed/cURLs para versão desconhecida, campo
  adicional, plano divergente e payload acima de 1 MiB; E2E inspeciona os bancos.
- Given: o request viola shape, limite ou relação de domínio.
- When: chama o endpoint.
- Then: recebe `400 VALIDATION_ERROR` ou `413
  OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE`; snapshot, lease, lock, Redis e MongoDB não
  são alterados.

### Cenário 10 — lease ausente ou divergente falha fechado

- Forma de validar: seeds e cURLs do endpoint vivo com lease expirado e revogado.
- Given: a chave do lease não existe ou sua tupla não coincide integralmente.
- When: envia um snapshot estruturalmente válido.
- Then: recebe respectivamente `410 OFFLINE_LEASE_EXPIRED` ou `409
  OFFLINE_LEASE_REVOKED`; não grava snapshot nem renova nada.

### Cenário 11 — concorrência da instalação tem um único vencedor

- Forma de validar: E2E Redis dispara requests simultâneos sem usar testes
  `concurrent` da suíte; `não se aplica` a cURL por exigir barreira coordenada entre
  requests.
- Given: a mesma instalação possui lease e duas revisões disputam a ingestão.
- When: as requests atravessam runtimes concorrentes.
- Then: uma entra na região crítica; a outra recebe `409
  OFFLINE_TRAINING_SYNC_IN_PROGRESS` ou, se adquirir após a liberação, observa o
  estado já linearizado. Nunca há write concorrente, regressão ou lock órfão.

### Cenário 12 — falha Redis não produz aceite parcial

- Forma de validar: E2E automatizado com Redis efêmero interrompido ou falha
  injetada entre os passos atômicos; `não se aplica` a cURL público porque o branch
  exige isolamento da infraestrutura.
- Given: request e identidade são válidos, mas lock, lease ou persistência Redis
  falha.
- When: tenta ingerir a revisão.
- Then: recebe `503 OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE`; a API não declara
  aceite e não deixa snapshot e lease com revisões/TTLs divergentes.

### Cenário 13 — canais e contrato HTTP permanecem protegidos

- Forma de validar: cenários vivos com cookie Web, transporte ambíguo e Bearer
  nativo, todos com seed e cURL completos.
- Given: o mesmo body é apresentado por cada transporte.
- When: chama o endpoint.
- Then: Web recebe `NATIVE_SESSION_REQUIRED`, transporte ambíguo recebe
  `AUTH_TRANSPORT_AMBIGUOUS` e somente Bearer nativo válido alcança a ingestão;
  todas as respostas preservam `ApiError`, `x-request-id` e `no-store` aplicáveis.

## Estratégia de entrega e compatibilidade

1. Introduzir no pacote público os tipos v1 estruturais, sua response e estados;
   compilar o pacote antes dos consumidores.
2. Criar DTO/envelope estrito e validador de domínio que limita o payload, valida
   discriminadores e relações e produz serialização/hash canônicos fora do Redis.
3. Acrescentar subjects de chave para snapshot e lock; criar services coesos para
   lock e transição de snapshot reutilizando o singleton Redis e o relógio.
4. Integrar validação/renovação do lease de modo que revisão nova e lease sejam
   confirmados sem estado parcial; manter replay e erros sem renovação.
5. Criar command e controller nativos, rate limit, `no-store`, erros e response
   explícita; nenhum repository MongoDB participa da escrita.
6. Cobrir DTO, domínio, command, services, scripts, concorrência, falhas e
   redaction; adicionar seeds/cURLs e atualizar documentação viva e ADR afetadas.

A mudança HTTP é aditiva e não possui consumidor nesta entrega. Deploy anterior
ignora as novas chaves; rollback deixa snapshot e lock inertes até seus TTLs, sem
migração ou limpeza destrutiva. Uma versão futura do payload usa outro
discriminador explícito e mantém v1 enquanto houver consumidor distribuído
compatível. Mudanças em `@dall-fit/types` atualizam produtor, barrel, build e testes
atomicamente, embora a UI ainda não execute requests.

## Plano de testes

- Unitários de contrato e domínio:
  - envelope aceita apenas `payloadVersion: 1`, UUID v4, revisão/timestamp válidos e
    rejeita campos adicionais;
  - todos os discriminadores e combinações de exercício, série e timer;
  - relações entre plano, workout, exercício e série;
  - limites de coleção, números, strings e 1 MiB;
  - serialização/hash estáveis independentemente da ordem incidental de propriedades;
  - projeções derivadas usam somente dados brutos e não aceitam métricas do cliente.
- Unitários de command/controller/services:
  - ordem autenticação/validação→lock→lease→snapshot→renovação→response;
  - estados `accepted` e `duplicate` e todos os erros estáveis;
  - replay não chama renovação; revisão nova chama exatamente uma vez;
  - lock usa token, TTL e release condicionado inclusive em erro;
  - falha de lease ou persistência não produz estado parcial;
  - logs e erros não contêm IDs, lease, hash, payload, nomes, cargas ou timestamps
    de ações.
- E2E serial com Nest, MongoDB e Redis efêmeros reais:
  - sessão Bearer nativa, cookie Web, transporte ambíguo, rate limit e validação;
  - criação, atualização, duplicate, stale, colisão e outra execução;
  - timestamps crescentes, iguais e regressivos com ordem determinística;
  - árvore antiga após edição canônica do plano;
  - TTL de snapshot e lease em aceite e preservação exata no replay/erro;
  - requests simultâneos da mesma instalação e de revisões distintas;
  - liberação por token, expiração de lock abandonado e indisponibilidade Redis;
  - nenhuma escrita em MongoDB e regressão dos endpoints de lease e sessão online.
- Seeds e contrato vivo:
  - fixtures fictícias independentes para aceite, replay, stale, colisão, outra
    execução, plano antigo, lease expirado/revogado e payload inválido;
  - cada cenário HTTP começa com seed ou justificativa e cURL copiável usando o
    token Bearer local protegido, sem placeholders ou dados reais.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`.

## Riscos e decisões

- Redis e uma chave por pessoa preservam a natureza efêmera da execução e a regra
  de um treino corrente. MongoDB intermediário misturaria rascunho frequente com
  histórico; múltiplas chaves antecipariam o protocolo da issue 86.
- TTL deslizante de sete dias acompanha atividade válida sem conservar rascunho
  órfão. Apenas revisão nova aceita o renova; replay repetido não mantém autorização
  ou dados vivos indefinidamente.
- `executionId + revision` reutiliza o modelo monotônico do SQLite e evita um UUID
  adicional por snapshot. O hash canônico distingue retry verdadeiro de colisão
  com conteúdo diferente sob a mesma identidade.
- Revisão, e não relógio do aparelho, decide progressão do agregado completo. O
  timestamp do cliente preserva semântica temporal; empate ou regressão usa a
  ordem server-side sem permitir que revisão antiga sobrescreva estado novo.
- O schema HTTP é próprio e estrito. Reutilizar `TrainingSession` acoplaria o modo
  offline a timestamps e versões server-side da sessão Web; aceitar JSON opaco
  impediria as validações e o recálculo exigidos.
- A estrutura histórica do plano é aceita porque a execução precisa permanecer
  coerente com aquilo que a pessoa iniciou. O lease impede usar essa permissão para
  outro plano, e o request nunca sobrescreve o plano canônico.
- Um `executionId` diferente falha enquanto houver execução corrente. Substituir
  silenciosamente perderia progresso; manter várias anteciparia finalização,
  cancelamento e resolução reservados à issue 86.
- O lock é Redis e global por instalação porque runtimes Nest são distribuídos.
  Token, release condicionado e TTL evitam que uma request remova o lock de outra;
  espera zero protege duração do runtime e torna a contenção explicitamente
  repetível pelo consumidor.
- A renovação do lease precisa participar da mesma decisão efetiva do snapshot.
  Gravar primeiro e falhar depois não pode devolver erro deixando uma revisão que
  um retry classificaria como duplicata sem ter renovado a autorização.
- O limite de 1 MiB reutiliza a fronteira da sessão online e mantém hashing,
  validação e Redis previsíveis. Se o payload v1 real não couber sem mídia ou
  capacidades temporárias, a feature volta ao refinamento em vez de elevar
  silenciosamente o limite.
- O escopo cabe no limite de cinco horas por reutilizar infraestrutura e concentrar
  a mudança em tipos, um endpoint e Redis. UI, Android, MongoDB durável, terminal e
  múltiplas execuções permanecem explicitamente fora.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Snapshot v1 bruto, estrito, limitado e compartilhado
- Uma única execução corrente por pessoa no Redis
- Idempotência por `executionId + revision` sem regressão ou colisão silenciosa
- Aceite de árvore histórica vinculada ao lease sem alterar o plano canônico
- Ordenação determinística diante de empate ou relógio regressivo
- Lease e snapshot renovados somente por revisão nova aceita
- Lock global por instalação sem escrita concorrente ou remoção insegura
- Nenhum snapshot intermediário ou plano escrito no MongoDB
- Sessão online, canais Web/native e endpoint de lease preservados
- Contratos, endpoint, flow, arquitetura e ADR afetados atualizados
- Seeds, mocks unitários e E2E Redis atualizados conforme o impacto
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz e E2E da API aprovados
