# Endpoints de lease offline de treino

## Objetivo funcional

`PUT /training/offline-lease` registra idempotentemente a instalação Android como
editora offline do plano ativo. `POST /training/offline-lease/takeover` substitui
explicitamente outra instalação. Existe uma única concessão por pessoa; estes
endpoints não ingerem snapshots nem alteram a sessão online de treino. A ingestão
proprietária usa separadamente `PUT /training/offline-snapshot`.

## Referências técnicas

| Papel | Símbolo e arquivo | Responsabilidade |
| --- | --- | --- |
| Controller | [`OfflineTrainingLeaseController`](../../../src/training/controllers/offline-training-lease.controller.ts) | recebe o body validado, chama o command proprietário e devolve sua response |
| Entrada | [`OfflineTrainingLeaseDto`](../../../src/training/dto/offline-training-lease.dto.ts) | aceita exclusivamente um `installationId` UUID v4 |
| Commands | [`RegisterOfflineTrainingLeaseCommand`](../../../src/training/commands/register-offline-training-lease.command.ts) e [`TakeoverOfflineTrainingLeaseCommand`](../../../src/training/commands/takeover-offline-training-lease.command.ts) | resolvem o plano ativo, acionam a transição e montam `OfflineTrainingLeaseResponse` |
| Plano ativo | [`PersonalTrainingPlanService`](../../../src/training-plan/services/personal-training-plan.service.ts) | deriva da pessoa autenticada a árvore canônica atualmente selecionada |
| Lease | [`OfflineTrainingLeaseService`](../../../src/training/services/offline-training-lease.service.ts) | executa registro, takeover, validação e renovação atômicos |
| Redis | [`RedisClientService`](../../../src/redis/redis-client.service.ts) e [`RedisKeyService`](../../../src/redis/redis-key.service.ts) | reutilizam o singleton e compõem a única chave namespaced por pessoa |
| Tipos | [`offline-training-lease.types.ts`](../../../src/training/domain/offline-training-lease.types.ts) e [`@dall-fit/types`](../../../../packages/types/src/contracts.ts) | mantêm a tupla interna e compartilham request, estados e response pública com a UI Android |

Não existe repository ou MongoDB do lease. MongoDB participa apenas da autenticação
da pessoa e da resolução vigente do plano ativo.

## Contrato HTTP resumido

- Autenticação: exclusivamente `Authorization: Bearer` de sessão `native` já
  verificada. Cookie Web recebe `403 NATIVE_SESSION_REQUIRED`; cookie e Bearer
  simultâneos recebem `400 AUTH_TRANSPORT_AMBIGUOUS`.
- Rate limit: política `training-lifecycle`, por pessoa/sessão e IP. Sessão nativa
  dispensa CSRF depois de validada.
- Entrada dos dois endpoints: `{ "installationId": "UUID v4" }`, sem campos
  adicionais. Pessoa, plano, validade e estado nunca vêm do cliente.
- Sucesso: sempre `200`, `Cache-Control: private, no-store`, e `{ data: {
  leaseId, planId, expiresAt, state } }`. A response nunca contém instalação ou
  dados do editor anterior.
- Estados: `created`, `unchanged`, `plan-rebound` ou `taken-over`; o último só pode
  vir de takeover.
- Validade: sete dias server-side na criação, rebind e takeover efetivo.
  `unchanged` preserva exatamente fence, timestamp e PTTL.
- Idempotência: repetir registro ou takeover pela instalação/plano atuais não
  escreve no Redis. Retry depois de resposta ambígua observa o valor já efetivado.

## Fluxo completo

### Entrada e autorização

`SessionAuthGuard` valida Bearer, audience, canal Redis e pessoa. Em seguida,
`NativeSessionGuard` recusa o canal Web antes de rate limit e command. O pipe global
rejeita UUID que não seja v4 e qualquer campo adicional. O controller registra
somente operação e estado público, nunca IDs, chama o command correspondente e
devolve a response já montada.

### Orquestração dos commands

Cada command chama primeiro `PersonalTrainingPlanService.getActiveExecutionPlan`.
Se não houver seleção válida, interrompe com `404 ACTIVE_TRAINING_PLAN_NOT_FOUND` e
o service Redis não é chamado. Havendo plano, prepara pessoa, ID canônico do plano
e instalação para `OfflineTrainingLeaseService`.

O command de registro traduz conflito de outra instalação para `409
OFFLINE_LEASE_TAKEOVER_REQUIRED`. Ambos traduzem a fronteira técnica fechada para
`503 OFFLINE_LEASE_UNAVAILABLE`. No sucesso, expõem somente a projeção pública
devolvida pelo service.

### Transição atômica no Redis

`OfflineTrainingLeaseService` usa `RedisKeyService` para obter
`offline-training-lease:<personId>` no namespace do ambiente. Um único script Lua
lê, compara e eventualmente grava com `PXAT`:

- chave ausente grava nova tupla/fence e retorna `created`;
- mesma instalação e plano retorna o valor bruto atual como `unchanged`, sem
  `SET`, `EXPIRE` ou recálculo;
- mesma instalação e plano diferente grava outro fence por sete dias como
  `plan-rebound`;
- instalação diferente em registro não altera valor ou TTL e sinaliza takeover;
- instalação diferente no endpoint explícito substitui toda a tupla com outro
  fence e retorna `taken-over`.

As respostas de operações concorrentes descrevem a transição linearizada pelo
Redis. Não há compare-and-set em memória, `WATCH`, scan, lock por processo ou
conexão adicional.

### Fronteiras internas para ingestão futura

`validate` recebe pessoa, plano, instalação e `leaseId`. Seu script devolve
`OfflineTrainingLeaseExpiredError` se a chave não existe,
`OfflineTrainingLeaseRevokedError` se qualquer campo diverge ou a tupla atual se
tudo coincide. Essa leitura não toca no TTL.

`renewAfterAcceptedSync` permanece uma fronteira interna condicionada, mas a
ingestão pública não separa a gravação do snapshot dessa renovação. O
`OfflineTrainingSnapshotService` confronta a mesma tupla e renova o lease dentro
da única transição Lua que publica uma revisão nova. Duplicata e qualquer erro não
tocam no lease. Ausência e divergência conservam as classificações expiração e
revogação; não existe fallback MongoDB ou autorização otimista.

## Mapa de caminhos

| Caminho | Gatilho | Resultado | Efeito no lease |
| --- | --- | --- | --- |
| criação | chave ausente | `200 created` | nova tupla, fence e sete dias |
| repetição | mesma instalação/plano | `200 unchanged` | nenhum write ou renovação |
| rebind | mesma instalação, novo plano ativo | `200 plan-rebound` | novo fence e sete dias |
| conflito | outra instalação usa PUT | `409 OFFLINE_LEASE_TAKEOVER_REQUIRED` | nenhum |
| takeover | outra instalação usa POST | `200 taken-over` | substituição, novo fence e sete dias |
| plano ausente | seleção ativa inexistente | `404 ACTIVE_TRAINING_PLAN_NOT_FOUND` | Redis do lease não é acessado |
| canal Web | cookie válido | `403 NATIVE_SESSION_REQUIRED` | command não é chamado |
| body inválido | UUID não v4 ou campo extra | `400 VALIDATION_ERROR` | command não é chamado |
| Redis falha | erro, timeout ou resposta inválida | `503 OFFLINE_LEASE_UNAVAILABLE` | nenhuma autorização declarada |

## Cenários reproduzíveis

Todos os seeds criam pessoa e sessão Bearer fictícias. O token fica com permissão
restrita em `/tmp/dall-fit-native-session-token.txt`.

### Cenário 1 — primeira criação

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:create
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"installationId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
```

- Given: existe plano pessoal ativo e não existe lease.
- Then: `200 created`, plano ativo, fence novo e vencimento em sete dias.

### Cenário 2 — repetição sem renovação

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:unchanged
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"installationId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
```

- Given: a mesma instalação/plano possui lease.
- Then: `200 unchanged` com o fence/vencimento preparados e PTTL não renovado.

### Cenário 3 — troca do plano ativo

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:plan-rebound
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"installationId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
```

- Given: o lease aponta para o plano próprio e a seleção ativa aponta para a
  referência global.
- Then: `200 plan-rebound`, plano atual, fence diferente e sete dias novos.

### Cenário 4 — registro exige takeover

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:takeover-required
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"installationId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}'
```

- Given: a instalação A possui o lease.
- Then: B recebe `409 OFFLINE_LEASE_TAKEOVER_REQUIRED`; response, valor e TTL não
  revelam nem alteram A.

### Cenário 5 — takeover e retry

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:takeover
```

**cURL**

```bash
curl --include --request POST http://localhost:4000/training/offline-lease/takeover \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"installationId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}'
```

- Given: A possui o lease.
- Then: a primeira execução por B retorna `taken-over`; repetir o mesmo cURL
  retorna `unchanged` com o mesmo fence/vencimento.

### Cenário 6 — plano ativo ausente

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:no-active-plan
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"installationId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
```

- Then: `404 ACTIVE_TRAINING_PLAN_NOT_FOUND` antes do Redis do lease.

### Cenário 7 — body inválido

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:invalid-body
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"installationId":"not-a-v4","personId":"64b000000000000000000003"}'
```

- Then: `400 VALIDATION_ERROR`; o command e o lease não são acessados.

### Cenário 8 — cookie Web

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:create
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --cookie "$(cat /tmp/dall-fit-web-session-cookie.txt)" \
  --header 'content-type: application/json' \
  --data '{"installationId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
```

- Then: o cookie autenticado recebe `403 NATIVE_SESSION_REQUIRED` antes do
  command.

### Cenário 9 — validação, expiração, revogação e Redis indisponível

**Seed:** não se aplica — validação e renovação ainda são fronteiras internas, e a
indisponibilidade exige interromper isoladamente a infraestrutura efêmera. Não há
endpoint público ou cURL capaz de escolher esses branches sem violar o contrato.

**cURL**

```bash
curl --include http://localhost:4000/ready
```

O cURL apenas confirma o estado da infraestrutura; os E2E chamam a fronteira
interna com Redis real, removem/substituem a chave e isolam a falha da operação do
lease. Ausência produz `OFFLINE_LEASE_EXPIRED`, divergência produz
`OFFLINE_LEASE_REVOKED`, e falha técnica do endpoint produz `503
OFFLINE_LEASE_UNAVAILABLE`.

## Cobertura automatizada

- Unitários: service cobre toda matriz de scripts, erros, TTL e redaction;
  commands cobrem ordem plano→Redis e tradução HTTP; guarda cobre canal nativo.
- E2E: [`offline-training-lease.e2e-spec.ts`](../../../test/offline-training-lease.e2e-spec.ts)
  cobre Bearer/cookie, body, plano ausente, PTTL, rebind, takeover/retry, corrida,
  validação, renovação, expiração, fence antigo e indisponibilidade isolada.

## Fora do comportamento atual

- cliente Android, UI de takeover ou sincronização em background;
- histórico/tombstone de lease no MongoDB;
- recuperação dos dados da instalação revogada;
- renovação por registro, leitura, preparação, login ou validação simples.
