# Feature Spec: Finalizar, cancelar e resolver conflitos de execuções offline

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #86](https://github.com/eduardodallmann/dall-fit/issues/86).
- Problema: a API já recebe uma execução Android em andamento como snapshot
  completo, idempotente e efêmero, mas ainda não reconhece conclusão ou
  cancelamento offline. Remover o snapshot Redis sem uma memória durável permitiria
  ressuscitar execuções terminais; conservar somente uma execução corrente
  impediria sincronizar a próxima conclusão da fila; e os conflitos atuais não
  oferecem ao futuro cliente uma representação segura para escolher uma versão
  completa.
- Resultado: o mesmo protocolo v1 passa a representar snapshots `in-progress`,
  `completed` e `cancelled`. Conclusões geram uma única execução durável e devolvem
  o resumo canônico calculado pela API; cancelamentos limpam o progresso sem entrar
  no histórico. Um recibo terminal permanente impede reprocessamento depois da
  limpeza do Redis. Conflitos editáveis devolvem a versão segura do servidor e um
  token de compare-and-swap para escolha explícita de uma versão completa; uma
  execução já terminal nunca é substituída. Depois de cada terminal, a próxima
  `executionId` enviada sequencialmente pode ocupar a única posição corrente.
- Referências:
  - [SDD transversal](../README.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [governança do SDD](../base/04-governanca-do-sdd.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da API](../../../api/docs/sdd/base/01-arquitetura.md);
  - [endpoints e contratos HTTP](../../../api/docs/sdd/base/02-endpoints-e-contratos.md);
  - [testes e qualidade da API](../../../api/docs/sdd/base/03-testes-e-qualidade.md);
  - [mocks e bancos de teste](../../../api/docs/sdd/base/04-mocks-e-bancos-de-teste.md);
  - [seeds e cURLs](../../../api/docs/sdd/base/05-seeds-e-curls-de-cenario.md);
  - [logging e rastreabilidade](../../../api/docs/sdd/base/06-logging-e-rastreabilidade.md);
  - [endpoint de snapshot offline](../../../api/docs/sdd/endpoints/offline-training-snapshot.md);
  - [endpoint de lease offline](../../../api/docs/sdd/endpoints/offline-training-lease.md);
  - [endpoints de treino](../../../api/docs/sdd/endpoints/training.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [ADR-0010 — sessão efêmera e histórico de treino](../adr/ADR-0010-sessao-efemera-e-historico-de-treino.md);
  - [ADR-0014 — motor nativo de persistência offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [ADR-0015 — lease offline de treino no Redis](../adr/ADR-0015-lease-offline-de-treino-no-redis.md);
  - [atomicidade de `findOneAndUpdate` no Mongoose](https://mongoosejs.com/docs/tutorials/findoneandupdate.html#atomic-updates);
  - [índices únicos compostos no MongoDB](https://www.mongodb.com/docs/manual/core/index-unique/#unique-compound-index);
  - [scripts Lua atômicos no Redis](https://redis.io/docs/latest/develop/programmability/eval-intro/).
- Features relacionadas: [FIT-0070](fit-0070-fluxo-treinar.md) fornece o cálculo,
  histórico e perfis da finalização online; [FIT-0082](fit-0082-nucleo-nativo-persistencia-offline.md)
  fornece múltiplos snapshots locais e estado de sincronização por execução;
  [FIT-0084](fit-0084-lease-redis-plano-instalacao-pessoa.md) fornece o fence da
  instalação; [FIT-0085](fit-0085-receber-snapshots-idempotentes-treino-api.md)
  fornece o endpoint, validação, hash, lock e transição Redis que esta demanda
  evolui. As issues 87 e 88 consumirão o protocolo no sincronizador nativo, a issue
  89 produzirá os terminais locais e a issue 90 apresentará resumo e conflitos.

A implementação deve confirmar novamente as versões efetivamente instaladas. No
planejamento foram encontradas NestJS `11.1.28`, Mongoose `9.8.0`, ioredis
`5.11.1`, Zod `4.4.3`, Vitest `4.1.10`, `mongodb-memory-server` `11.2.0` e
`redis-memory-server` `0.17.0`. A estratégia conserva os índices únicos e upserts
atômicos já usados por `workout_executions`, além dos scripts Redis curtos que
linearizam a execução corrente; não introduz transação distribuída entre MongoDB e
Redis.

## Escopo

### Incluído

- evoluir `PUT /training/offline-snapshot`, mantendo `payloadVersion: 1`, para uma
  união discriminada de snapshots `in-progress | completed | cancelled`;
- aceitar conclusão integral ou parcial sem receber totais ou métricas calculadas
  pelo cliente;
- validar timestamps terminais, timezone IANA, ausência de timer terminal e
  coerência entre conclusão de exercício, séries e instante terminal;
- recalcular e persistir uma única `workout_execution` canônica por pessoa e
  `executionId`, usando as mesmas regras observáveis da finalização online;
- atualizar perfis de carga somente para exercícios ainda presentes na árvore
  canônica atual, preservando o histórico baseado no snapshot antigo;
- persistir recibos terminais mínimos, permanentes e idempotentes em coleção
  própria, para conclusão e cancelamento;
- remover condicionalmente o snapshot Redis depois do terminal durável e permitir
  que outra execução seja aceita somente depois dessa limpeza;
- renovar o lease por sete dias quando um terminal novo for aceito, sem renovar em
  replay, conflito ou resolução que apenas preserve o servidor;
- reconhecer replay terminal mesmo depois da limpeza Redis e devolver o mesmo
  resultado canônico ou confirmação de cancelamento;
- representar conflitos editáveis com a versão completa e segura do servidor, um
  token opaco vinculado àquela versão e as escolhas permitidas;
- resolver no mesmo endpoint por versão completa, usando compare-and-swap para
  preservar integralmente servidor ou local, sem merge e sem importação adicional;
- recusar substituição de conclusão ou cancelamento já durável e permitir apenas o
  descarte da versão local;
- processar várias execuções distintas individualmente, na ordem de chegada e com
  no máximo uma execução editável no Redis;
- cobrir replay, cancelamento, plano alterado, escolha de conflito, corrida de
  finalização, falhas entre MongoDB e Redis e sequência de execuções;
- atualizar contratos compartilhados, índices, seeds e documentação viva somente
  durante a implementação autorizada.

### Não incluído

- produzir snapshots ou resumos provisórios no Android;
- implementar fila, coalescência, HTTP nativo, retry, WorkManager ou qualquer
  consumidor do endpoint;
- criar telas, modais ou notificações para resumo, takeover ou conflito;
- alterar a jornada online de finalização, seu contrato HTTP ou sua apresentação;
- aceitar lote de snapshots, evento semântico, patch parcial ou mais de uma
  execução editável no servidor;
- ordenar por um contador global, adicionar `previousExecutionId` ou reconstruir a
  ordem da fila do aparelho; o sincronizador futuro envia individualmente em ordem;
- importar a versão descartada como outra execução, duplicar uma conclusão ou
  executar merge campo a campo;
- permitir que lease expirado ou revogado importe pendências ainda não aceitas;
- comparar o conteúdo histórico do plano com sua árvore MongoDB atual, migrar uma
  execução para o plano novo ou reescrever o plano canônico;
- registrar cancelamento como item do histórico ou atualizar perfis de carga ao
  cancelar;
- reter histórico de todas as revisões, payload completo no recibo terminal ou
  signed URLs, mídia e binários;
- adicionar TTL ou política de retenção aos recibos terminais;
- modificar rotas, handlers MSW, fixtures ou testes da UI.

## Projetos e documentação afetados

- API e endpoints:
  - evoluir DTO, schema, controller, command, services, erros e response de
    `PUT /training/offline-snapshot` dentro do módulo `training`;
  - extrair ou reutilizar serviços coesos do cálculo canônico, persistência de
    execução e perfis sem duplicar a regra online;
  - criar port, schema e adapter MongoDB para recibos terminais e aplicar seu índice
    único pelo mecanismo vigente de índices;
  - atualizar `offline-training-snapshot.md`, `training.md`, arquitetura, seeds e
    regras de teste com todos os caminhos novos.
- UI e rotas: nenhuma rota, tela, componente, handler MSW ou fixture muda. O pacote
  compartilhado publica contratos para o sincronizador Android futuro, mas a UI
  ainda não os consome.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` na implementação para
  registrar terminais, sequência e resolução disponíveis no backend, sem declarar
  o cliente offline como entregue.
- Contratos em `@dall-fit/types`:
  - transformar `OfflineTrainingSnapshotV1` em união discriminada pelos três
    estados;
  - acrescentar dados brutos terminais, resolução opcional, resultados
    discriminados e detalhes tipados do conflito;
  - reutilizar `WorkoutExecutionSummary` como resultado canônico da conclusão;
  - manter a exportação somente pelo barrel público.
- Decisões arquiteturais: atualizar ADR-0010 para recibos terminais duráveis e
  recuperação idempotente MongoDB–Redis, e ADR-0015 para aceite terminal e
  renovação do lease. Criar nova ADR somente se a implementação exigir outra
  decisão transversal difícil de reverter.
- Handlers e fixtures MSW: não se aplica; não há consumidor HTTP na UI nesta
  entrega.
- Mocks de repositories/caches nos unitários da API: commands mockam services;
  services de finalização e cancelamento mockam repositories de execução, recibo,
  perfil, plano, Redis, lock e relógio por ports tipadas.
- Fixtures MongoDB/Redis nos E2E: pessoa, Bearer nativo, lease, snapshot corrente,
  execução, perfil e recibo terminal determinísticos. Os E2E continuam seriais e
  usam adapters reais contra MongoDB e Redis efêmeros.

## Contrato HTTP v1 pretendido

### Estados do snapshot

O envelope continua contendo `payloadVersion`, `installationId`, `leaseId`,
`executionId`, `revision`, `clientUpdatedAt` e `snapshot`. O agregado comum conserva
plano, workout, exercícios, `startedAt` e todo o progresso bruto já validado pela
FIT-0085. `snapshot.state` discrimina:

- `in-progress`: contém `activeTimer`, inclusive `null`, e segue o comportamento
  vigente de revisão efêmera;
- `completed`: contém `activeTimer: null`, `completedAt` com timezone explícito e
  `timezone` IANA; o próprio estado terminal é a confirmação de conclusão integral
  ou parcial;
- `cancelled`: contém `activeTimer: null` e `cancelledAt` com timezone explícito;
  conserva a versão completa para idempotência e conflito, mas não produz métricas.

O schema permanece estrito e não aceita `confirmIncomplete`, totais, duração,
semana, áreas calculadas, percentual ou resumo fornecido pelo cliente. Para um
terminal, o instante precisa ser igual ou posterior a `startedAt` e a todo
`completedAt` ou início de timer persistido na árvore. Um timer precisa ser
resolvido localmente antes do terminal. A conclusão rejeita timezone inexistente e
qualquer incoerência temporal com `400 VALIDATION_ERROR`, antes de lock ou escrita.

### Resultado de sucesso

Sucesso permanece `200`, `Cache-Control: private, no-store` e uma
`ApiResponse` discriminada:

- progresso editável informa operação `accepted | duplicate`, execução, revisão e
  metadados server-side vigentes;
- conclusão informa operação `completed | duplicate-completed`, execução, revisão
  e `completion: WorkoutExecutionSummary` canônico;
- cancelamento informa operação `cancelled | duplicate-cancelled`, execução,
  revisão e instante de aceite server-side, sem resumo;
- resolução informa `resolved-local | resolved-server` e a versão efetivamente
  preservada; quando essa versão é concluída, inclui o mesmo resumo canônico.

Replay devolve os dados canônicos já persistidos e não recalcula métricas, não
duplica perfis, não renova lease e não cria outro recibo. O identificador público
da conclusão continua sendo o `_id` opaco de `workout_executions`; `executionId`
permanece a identidade idempotente originada no aparelho e ocupa o papel de
`sessionId` na persistência durável existente.

### Conflito comparável e resolução

Conflitos entre versões completas editáveis respondem `409` com `ApiError` e código
estável `OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT`. Depois de decidir pelo
status/código, o consumidor pode interpretar o tipo compartilhado de `details`,
que contém:

- `serverVersion`: envelope seguro com `executionId`, revisão, timestamps de
  ordenação e o snapshot completo validado;
- `conflictToken`: valor opaco que identifica exatamente a versão retornada;
- `allowedResolution: local-or-server`.

Pessoa, instalação, lease, hash interno, chave Redis e metadados de persistência não
são expostos. A versão local já está no request e não é repetida. O limite da
response acompanha o máximo de 1 MiB do snapshot, usa `no-store` e nunca é
registrado integralmente.

O mesmo `PUT` aceita opcionalmente `resolution: { choice, conflictToken }`:

- `choice: server` confirma a versão corrente e não a reescreve; o cliente poderá
  remover sua versão local;
- `choice: local` substitui integralmente a versão editável do servidor pela versão
  completa enviada e então aplica normalmente seu estado, inclusive um terminal;
- o token é confrontado atomicamente com a versão corrente. Token vencido,
  reutilizado contra outra versão ou uma corrida posterior devolve novo conflito
  com a representação atual;
- resolução não cria uma segunda execução nem combina árvores. Se os IDs forem
  diferentes, escolher uma implica descartar integralmente a outra.

Quando já existir recibo terminal para a `executionId`, conteúdo idêntico é replay.
Conteúdo divergente responde `409 OFFLINE_TRAINING_EXECUTION_IMMUTABLE`, com
`allowedResolution: discard-local-only`; conclusão inclui sua projeção canônica e
cancelamento informa apenas o estado terminal. Não existe escolha local nesse
caminho.

## Persistência e consistência

### Recibo terminal durável

A coleção própria `offline_training_terminal_receipts` guarda somente:

- `personId` e `executionId`, protegidos por índice composto único;
- `terminalState: completed | cancelled`;
- `revision` e fingerprint canônico da versão aceita;
- instante server-side de aceite;
- `workoutExecutionId` apenas para conclusão;
- timestamps técnicos do documento.

O recibo não possui TTL, payload, nomes, cargas, timezone, instalação ou lease. Ele
não aparece em histórico, overview ou resumo semanal. O repository recebe uma
entidade pronta de um service, nunca DTO HTTP, e usa upsert condicionado pelo índice
único para que duas tentativas não criem terminais divergentes.

### Conclusão canônica

1. Sob o lock global da instalação, a API valida autenticação, lease, snapshot
   corrente, revisão e eventual resolução.
2. Um recibo existente decide replay ou imutabilidade antes de qualquer nova
   persistência.
3. A API deriva exercícios concluídos, conclusão integral, áreas distintas, soma
   das cargas das séries concluídas, duração inteira não negativa, nomes e IDs a
   partir da versão completa validada. `completedAt` e `startedAt` são dados brutos;
   nenhum total do cliente participa.
4. `workout_executions` faz `begin` idempotente por pessoa + `executionId` no
   estado `finalizing`, preservando o snapshot antigo do plano.
5. Perfis são aplicados idempotentemente somente aos exercícios de séries que
   ainda existam no mesmo workout da árvore canônica atual. Série não concluída
   preserva a posição anterior; vetor final inteiramente `null` remove o perfil.
6. A execução passa a `completed`; somente então o recibo terminal referencia seu
   ID. Uma interrupção anterior ao recibo é retomada pela execução `finalizing` ou
   `completed`, sem recalcular sobre outra versão.
7. A API remove no Redis somente o snapshot com a mesma pessoa, execução e versão
   terminal, e renova o lease coincidente por sete dias na transição de limpeza.
8. O resumo semanal é montado depois da conclusão, no timezone IANA persistido, e
   devolvido como resultado canônico.

O histórico antigo continua válido mesmo quando plano, workout ou exercício foram
editados ou excluídos. Essas alterações afetam somente perfis e execuções futuras.
O denominador semanal continua vindo da quantidade de workouts do snapshot e o
numerador pode ultrapassá-lo.

### Cancelamento canônico

1. A API valida a versão completa e cria idempotentemente o recibo `cancelled`.
2. Não cria `workout_executions`, não calcula resumo e não lê ou escreve perfis.
3. Remove condicionalmente a execução Redis e renova o lease coincidente na mesma
   transição terminal.
4. Nova execução só pode ser aceita depois que essa limpeza terminar.

Se o MongoDB confirmar um terminal e a limpeza Redis falhar, a API não desfaz o
registro durável. Ela responde indisponibilidade recuperável; o retry encontra o
recibo, repete somente a limpeza condicionada e devolve o mesmo terminal. Se a
falha ocorrer antes do terminal durável, o snapshot permanece corrente. O desenho
não promete atomicidade distribuída: ordem dos efeitos, estados `finalizing`,
índices únicos, recibos e operações condicionadas tornam cada interrupção
retomável.

## Requisitos funcionais

1. Guards, canal Bearer nativo, rate limit, tamanho máximo, lock e autorização por
   lease permanecem os definidos pela FIT-0085.
2. Ausência de `state` ou shape incompatível com seu discriminador é erro de
   validação. Como ainda não há consumidor do endpoint, todos os produtores,
   seeds e testes migram atomicamente para o contrato v1 discriminado; não existe
   interpretação implícita do formato anterior como `in-progress`.
3. Revisão maior da mesma execução continua avançando automaticamente. Revisão
   igual com outro conteúdo, revisão regressiva ou outra execução corrente produz
   conflito comparável, sem overwrite silencioso.
4. Resolução `local` exige snapshot completo e token da versão corrente; resolução
   `server` não altera conteúdo, TTL ou lease.
5. Um terminal novo é processado apenas quando a versão terminal vence normalmente
   ou por resolução local explícita.
6. Conclusão e cancelamento aceitos são imutáveis. Replay exato é idempotente;
   qualquer outra versão daquela execução só pode ser descartada localmente.
7. Conclusão parcial é válida sem confirmação adicional porque o estado terminal
   já materializa a decisão local. A API deriva `fullCompletion` da árvore.
8. Cancelamento nunca aparece em `GET /training/completions/:id`, overview, próximo
   workout, semana ou perfil de cargas.
9. Conclusão offline aparece nos mesmos consumidores duráveis da conclusão online
   e devolve o mesmo `WorkoutExecutionSummary`.
10. A ordem entre IDs diferentes é a ordem linearizada de chegada. Enquanto o
    snapshot Redis existir, outra execução conflita; depois do terminal e da
    limpeza, a próxima pode ser aceita. A API não recebe lote nem predecessor.
11. Replays antigos são resolvidos pelos recibos sem bloquear uma execução nova já
    corrente. Eles nunca removem ou substituem a execução atual.
12. Plano antigo é aceito somente dentro da execução originalmente vinculada ao
    lease. A árvore não altera o plano MongoDB e não autoriza futuros treinos com
    conteúdo desatualizado.
13. Lease ausente ou revogado continua falhando fechado para conteúdo ainda não
    aceito. Um terminal já durável pode ser consultado como replay pela mesma
    pessoa autenticada, mas não renova autorização nem importa dados novos.
14. Redis indisponível antes da limpeza retorna `503
    OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE`; MongoDB indisponível não remove o
    snapshot nem declara terminal.
15. Toda response preserva `x-request-id`, `ApiError` e `private, no-store` conforme
    o contrato atual.

## Requisitos não funcionais

- Acessibilidade: não se aplica diretamente; nenhuma superfície visual é criada ou
  modificada.
- Performance:
  - request e versão de conflito permanecem limitados a 1 MiB, 25 workouts, 50
    exercícios e 100 séries por exercício;
  - validação, serialização e fingerprint ocorrem uma vez por request antes da
    persistência; métricas percorrem a árvore uma vez fora do script Redis;
  - recibos usam lookup/index único por pessoa + execução; não há scan, histórico
    de revisões ou consulta por instalação;
  - scripts Redis recebem chaves explícitas e comparam metadados constantes, sem
    percorrer o payload;
  - execuções e perfis seguem os índices e limites vigentes.
- Segurança e privacidade:
  - somente pessoa autenticada por Bearer nativo e lease vigente pode criar ou
    substituir estado; receipt replay não concede autorização nova;
  - detalhes de conflito expõem somente a árvore que pertence à própria pessoa e
    omitem identidade da instalação, lease, hash, pessoa e infraestrutura;
  - body, versão completa, nomes, cargas, timestamps de ações, IDs, token de
    conflito, fingerprint, chaves Redis e documentos nunca entram nos logs;
  - tokens de conflito são opacos, têm uso exclusivo de compare-and-swap e não são
    credenciais reutilizáveis para outro endpoint, pessoa ou versão;
  - responses são privadas e não armazenáveis; recibos não duplicam conteúdo de
    treino.
- Observabilidade:
  - todos os métodos seguem `NomeDaClasse -> nomeDoMetodo -> etapa:` com entrada,
    dependências, branches e saída sanitizados;
  - logs distinguem progresso, terminal, replay, conflito editável, imutabilidade,
    escolha, recuperação MongoDB–Redis e indisponibilidade apenas por categorias,
    contagens e códigos;
  - nenhuma exigência cria log por exercício, série ou tentativa de retry.
- Resiliência:
  - locks abandonados expiram e só são liberados pelo token proprietário;
  - recibo e execução duráveis tornam retry seguro depois de resposta perdida ou
    falha de limpeza;
  - escolha usa compare-and-swap e não aplica uma decisão tomada sobre versão
    obsoleta;
  - não existe rollback destrutivo entre MongoDB e Redis.
- Compatibilidade: a alteração coordenada do v1 é deliberadamente incompatível com
  o request interno entregue pela FIT-0085, porém ocorre antes de existir consumidor
  Android. API, `@dall-fit/types`, seeds e testes mudam atomicamente. Versões
  futuras usam novo `payloadVersion` em vez de reinterpretar v1 após seu consumo.
- Limite de execução: a implementação deve caber em uma sessão de até cinco horas,
  reutilizando endpoint, lock, hash, lease, finalização online, repositories e
  infraestrutura E2E existentes. Não inclui qualquer código Android ou UI. Se a
  implementação revelar necessidade de transação distribuída, cadeia causal entre
  execuções, migração SQLite ou nova tela, a demanda volta ao refinamento e é
  dividida antes de ampliar silenciosamente esta feature.

## Critérios de aceite

### Cenário 1 — conclusão offline gera um único resultado canônico

- Forma de validar: cenário vivo do endpoint com seed e cURL Bearer nativo,
  complementado por E2E que inspeciona MongoDB e Redis.
- Given: existe snapshot editável aceito e a revisão seguinte é `completed`, com
  parte ou todos os exercícios concluídos e timezone válido.
- When: envia a versão terminal.
- Then: recebe `200 completed` com `WorkoutExecutionSummary` calculado pela API;
  existe uma execução MongoDB concluída, perfis elegíveis foram consolidados,
  existe um recibo e o snapshot Redis foi removido.

### Cenário 2 — replay da conclusão é idempotente

- Forma de validar: repetir o mesmo cURL depois da limpeza e comparar IDs,
  documentos, perfis e TTL do lease no E2E.
- Given: a conclusão já foi confirmada e seu recibo permanece durável.
- When: o mesmo terminal é enviado novamente por perda da response.
- Then: recebe `200 duplicate-completed` com o mesmo resumo e ID; não cria
  histórico, perfil ou recibo adicional e não renova o lease.

### Cenário 3 — cancelamento limpa sem criar histórico

- Forma de validar: cenário vivo com snapshot editável e cURL terminal
  `cancelled`, além de inspeção E2E.
- Given: uma execução possui progresso, inclusive cargas, mas foi descartada.
- When: envia sua revisão terminal de cancelamento.
- Then: recebe `200 cancelled`; o recibo permanente é criado, Redis é limpo e não
  há execução, resumo semanal ou alteração de perfil.

### Cenário 4 — replay ou mudança após cancelamento não ressuscita a execução

- Forma de validar: repetir o cancelamento e depois enviar versão divergente da
  mesma `executionId`.
- Given: existe recibo `cancelled` e nenhuma chave Redis daquela execução.
- When: envia o mesmo terminal e depois uma versão editável ou concluída diferente.
- Then: o replay recebe `duplicate-cancelled`; a divergência recebe
  `OFFLINE_TRAINING_EXECUTION_IMMUTABLE` com descarte local como única ação; nenhum
  histórico é criado.

### Cenário 5 — conflito editável oferece comparação segura

- Forma de validar: seed com versão corrente e cURL de mesma revisão com conteúdo
  diferente ou outra execução.
- Given: o servidor conserva uma versão editável que não pode ser substituída
  automaticamente.
- When: envia outra versão completa sem resolução.
- Then: recebe `409 OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT` com versão segura
  do servidor, token opaco e `local-or-server`; TTL, lease, MongoDB e snapshot não
  mudam e nenhum dado proibido é exposto ou registrado.

### Cenário 6 — escolha do servidor preserva integralmente sua versão

- Forma de validar: reenviar o conflito com `choice: server` e token vigente.
- Given: cliente comparou local e servidor.
- When: escolhe o servidor.
- Then: recebe `200 resolved-server`; nenhum conteúdo, TTL, lease, recibo, execução
  ou perfil muda, e a response identifica a versão que o cliente deve conservar.

### Cenário 7 — escolha local usa compare-and-swap

- Forma de validar: resolver uma vez com token vigente e repetir com token obsoleto.
- Given: a versão do servidor ainda é exatamente aquela apresentada no conflito.
- When: escolhe o snapshot local completo.
- Then: o primeiro request recebe `resolved-local` e substitui somente a versão
  editável; se a versão mudou antes da escolha, recebe novo conflito e nenhum
  overwrite ocorre.

### Cenário 8 — conclusão durável nunca é substituída

- Forma de validar: seed com execução e recibo concluídos e cURL divergente da
  mesma `executionId`.
- Given: o servidor já finalizou a execução.
- When: chega outra versão local, ainda que declare revisão maior ou escolha local.
- Then: recebe `409 OFFLINE_TRAINING_EXECUTION_IMMUTABLE`, resumo canônico e
  `discard-local-only`; histórico e perfis permanecem inalterados.

### Cenário 9 — plano alterado preserva somente o histórico da execução

- Forma de validar: seed captura o snapshot, altera ou remove exercícios no plano
  MongoDB e envia a conclusão antiga.
- Given: lease e relação original continuam válidos, mas a árvore canônica atual
  mudou.
- When: conclui a execução baseada no snapshot histórico.
- Then: histórico e resumo usam nomes, áreas e contagens capturados; perfis são
  atualizados apenas para exercícios ainda elegíveis, o plano não é reescrito e
  futuras execuções usam a árvore atual.

### Cenário 10 — várias execuções são aceitas sequencialmente

- Forma de validar: E2E envia A concluída, B cancelada e C em andamento, em requests
  individuais, e tenta antecipar C enquanto B ainda está corrente.
- Given: o aparelho possui várias execuções pendentes ordenadas.
- When: sincroniza uma por vez.
- Then: A e B preservam seus IDs e terminais; somente após cada limpeza a próxima
  ocupa Redis. A tentativa antecipada conflita e não reordena; C termina como única
  execução editável.

### Cenário 11 — falha entre persistência durável e limpeza é retomável

- Forma de validar: E2E/falha injetada interrompe Redis depois de confirmar o
  terminal MongoDB; não se aplica a cURL público porque exige controlar a
  infraestrutura entre efeitos.
- Given: execução ou recibo já foi persistido, mas a chave Redis não foi removida.
- When: a tentativa falha e depois é repetida com a infraestrutura restaurada.
- Then: a primeira não declara novo terminal; o retry não duplica MongoDB, conclui
  a limpeza condicionada e devolve o resultado canônico original.

### Cenário 12 — finalizações concorrentes têm um único vencedor

- Forma de validar: E2E dispara requests coordenados sem `test.concurrent`; não se
  aplica a um único cURL por exigir barreira real entre requests.
- Given: duas requests disputam a mesma execução ou uma resolução disputa a
  finalização.
- When: atravessam runtimes concorrentes.
- Then: lock, compare-and-swap e índices únicos produzem um terminal; a perdedora
  observa replay, novo conflito ou imutabilidade, nunca duas execuções ou recibos.

### Cenário 13 — terminal inválido ou lease inválido não produz efeitos

- Forma de validar: cenários vivos com timestamp incoerente, timer ativo, timezone
  inválido, lease expirado e lease revogado.
- Given: o body terminal ou a autorização viola o contrato.
- When: chama o endpoint.
- Then: recebe `400 VALIDATION_ERROR`, `410 OFFLINE_LEASE_EXPIRED` ou `409
  OFFLINE_LEASE_REVOKED`; Redis, recibos, histórico e perfis permanecem intactos.

## Estratégia de entrega e compatibilidade

1. Evoluir a união v1, requests, responses e detalhes tipados no pacote público;
   atualizar API, seeds e testes no mesmo commit lógico antes de compilar os
   consumidores.
2. Estender a validação estrutural/temporal e a preparação canônica do conteúdo,
   mantendo payload e cálculo fora dos scripts Redis.
3. Criar recibo terminal com índice único e incluir o índice no script operacional
   vigente; não usar TTL nem armazenar o snapshot.
4. Extrair a finalização canônica compartilhável da sessão online sem alterar seu
   comportamento e integrar histórico/perfis ao fluxo offline.
5. Evoluir a transição Redis para conflito comparável, token de CAS, escolha de
   versão e limpeza terminal condicionada com renovação do lease.
6. Orquestrar recuperação idempotente por recibo/execução antes de liberar a
   próxima execução, mantendo controller → command → services → repositories.
7. Adicionar seeds/cURLs, unitários e E2E de todos os ramos; atualizar endpoint,
   flow, base e ADRs para a verdade efetivamente implementada.

O rollout ocorre antes dos clientes das issues 87–90, portanto não há fila
distribuída utilizando o formato anterior. Deploy anterior ignora a coleção de
recibos e não entende terminais; rollback depois de receber um terminal não é
seguro para novas sincronizações e deve interromper o consumidor até restaurar a
versão compatível. Dados duráveis já concluídos não são removidos no rollback.

## Plano de testes

- Unitários de contrato e domínio:
  - união estrita dos três estados e rejeição de combinações entre campos;
  - timestamps terminais, timezone IANA, timer e relações da árvore;
  - cálculo de parcial/integral, áreas distintas, duração e cargas apenas das
    séries concluídas;
  - preparação da representação segura e omissão de pessoa, lease, instalação,
    fingerprint e infraestrutura.
- Unitários de command e services:
  - ordem lock → lease/estado → recibo → execução/perfis → recibo → limpeza;
  - conclusão nova, `finalizing`, replay concluído e cancelamento;
  - plano alterado filtra perfis sem rejeitar o histórico;
  - conflito, escolha local/servidor, token obsoleto e terminal imutável;
  - falhas antes/depois de cada efeito e release do lock no `finally`;
  - redaction de payloads, IDs, tokens, nomes, cargas e timestamps de ações.
- Unitários de repositories/adapters:
  - upsert idempotente e colisão terminal do recibo;
  - lookup por pessoa + execução e projeção mínima;
  - execução existente nunca recebe métricas de outro snapshot.
- E2E serial com Nest, MongoDB e Redis efêmeros reais:
  - canais e rate limits vigentes;
  - conclusão integral/parcial, resumo semanal e perfis;
  - cancelamento sem histórico;
  - replay depois da limpeza e imutabilidade terminal;
  - conflitos de revisão/conteúdo/execução e as duas escolhas;
  - token obsoleto por corrida e finalização concorrente;
  - sequência A/B/C e tentativa fora de ordem enquanto existe corrente;
  - plano editado ou removido depois do snapshot;
  - falha MongoDB preserva Redis; falha Redis pós-terminal é reconciliada;
  - TTL do lease só muda em terminal novo aceito e não em replay/escolha servidor.
- Seeds e documentação viva:
  - fixtures fictícias independentes para conclusão, replay, cancelamento,
    conflito, imutabilidade, plano alterado e sequência;
  - cada cenário HTTP possui seed ou justificativa e cURL copiável com Bearer local
    protegido, sem placeholder ou dado real.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`.

## Riscos e decisões

- O mesmo endpoint e `payloadVersion: 1` mantêm uma única máquina de estados para
  revisão, hash, lease e terminal. Endpoints separados criariam coordenação entre
  requests e estados intermediários sem consumidor que a justifique.
- A mudança obrigatória do shape v1 é aceita somente porque nenhum cliente existe.
  Compatibilidade implícita com body sem `state` esconderia versões incompatíveis.
- Recibo separado evita transformar cancelamento em histórico ou tornar campos de
  métricas opcionais em `workout_executions`. Ausência de TTL impede ressuscitar
  uma execução antiga depois que Redis e aparelho perderem contexto.
- A versão completa do servidor é necessária para a decisão futura, mas é devolvida
  somente à própria pessoa, sem capacidades ou metadados internos e com
  `no-store`. O código do erro, não o conteúdo livre de `details`, seleciona o
  fluxo do consumidor.
- Token opaco e compare-and-swap impedem aplicar uma escolha contra estado que
  mudou enquanto a pessoa comparava as versões. Escolher local ou servidor sempre
  descarta a outra árvore; não existe merge ou execução adicional.
- Ordenação por chegada reutiliza a fila sequencial já decidida para a issue 87.
  Uma cadeia causal ampliaria contrato, SQLite e sincronizador sem necessidade para
  o protocolo individual desta entrega.
- Conclusão reutiliza as regras online para que origem da execução não altere
  resumo, semana ou perfil. Timestamps do aparelho são dados brutos necessários ao
  modo offline, mas métricas derivadas continuam exclusivas da API.
- Recibo gravado depois da execução concluída impede declarar completion sem
  histórico; estado `finalizing` recupera queda anterior. Recibo anterior à limpeza
  impede duplicidade se Redis falhar depois. Essa ordem substitui uma transação
  MongoDB–Redis inexistente.
- Cancelamento recebe recibo permanente embora não apareça no histórico, pois a
  ausência total de memória permitiria que um replay atrasado recriasse progresso
  ou conclusão.
- Uma execução terminal não é substituível, inclusive cancelamento. Embora a issue
  destaque a conclusão durável, permitir ressuscitar cancelamento contrariaria sua
  finalidade e o recibo confirmado.
- O limite de cinco horas depende de reutilizar o módulo e a finalização atuais. A
  feature não autoriza cliente, UI, cadeia causal, batch, migration SQLite ou nova
  infraestrutura de transação.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Snapshots v1 discriminados entre andamento, conclusão e cancelamento
- Resumo canônico e histórico idempotente para conclusões offline
- Cancelamento terminal sem histórico ou perfil de carga
- Recibos terminais permanentes e mínimos por pessoa + execução
- Conclusões e cancelamentos duráveis imutáveis após limpeza Redis
- Conflito seguro com comparação de versões completas e token de CAS
- Escolha integral local/servidor sem merge ou importação adicional
- Várias execuções processadas individualmente e na ordem de chegada
- Snapshot de plano antigo limitado à própria execução
- Falhas MongoDB–Redis recuperáveis sem duplicação ou aceite parcial
- Contratos, endpoint, flow, arquitetura, índices e ADRs afetados atualizados
- Seeds, mocks unitários e E2E MongoDB/Redis atualizados conforme o impacto
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz e E2E da API aprovados
