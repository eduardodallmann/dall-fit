# Endpoint `PUT /training/offline-snapshot`

## Objetivo funcional

Receber a revisão completa mais recente de uma execução Android em andamento,
autorizá-la pelo lease vigente e manter uma única execução corrente por pessoa no
Redis. O endpoint é exclusivo de sessão Bearer nativa, não consulta a árvore atual
do plano e não escreve no MongoDB.

## Referências técnicas

| Papel | Símbolo e arquivo | Responsabilidade |
| --- | --- | --- |
| Controller | [`OfflineTrainingSnapshotController`](../../../src/training/controllers/offline-training-snapshot.controller.ts) | recebe o body validado e devolve a response do command |
| Entrada | [`OfflineTrainingSnapshotValidationPipe`](../../../src/training/dto/offline-training-snapshot.dto.ts) e [`offlineTrainingSnapshotRequestSchema`](../../../src/training/domain/offline-training-snapshot.schema.ts) | limitam o JSON a 1 MiB e validam envelope, árvore estrita, discriminadores e relações |
| Command | [`PutOfflineTrainingSnapshotCommand`](../../../src/training/commands/put-offline-training-snapshot.command.ts) | prepara conteúdo, adquire o lock, executa a ingestão e libera o lock |
| Conteúdo | [`OfflineTrainingSnapshotContentService`](../../../src/training/services/offline-training-snapshot-content.service.ts) | serializa o agregado e calcula uma vez o SHA-256 da representação canônica |
| Lock | [`OfflineTrainingSnapshotLockService`](../../../src/training/services/offline-training-snapshot-lock.service.ts) | usa Redis global por instalação, token opaco, TTL de 15 segundos e release condicionado |
| Transição | [`OfflineTrainingSnapshotService`](../../../src/training/services/offline-training-snapshot.service.ts) | confronta lease, execução, revisão e hash e grava snapshot + renovação em um script Lua |
| Redis | [`RedisClientService`](../../../src/redis/redis-client.service.ts) e [`RedisKeyService`](../../../src/redis/redis-key.service.ts) | reutilizam o singleton e compõem somente as chaves namespaced autorizadas |
| Contrato | [`PutOfflineTrainingSnapshotV1Request`](../../../../packages/types/src/contracts.ts) e [`OfflineTrainingSnapshotV1`](../../../../packages/types/src/entities.ts) | publicam request, árvore bruta e resultado para o futuro sincronizador Android |

## Contrato HTTP resumido

- Autenticação: somente `Authorization: Bearer` de sessão `native`. Cookie Web
  recebe `403 NATIVE_SESSION_REQUIRED`; cookie e Bearer juntos recebem `400
  AUTH_TRANSPORT_AMBIGUOUS`. Sessão nativa dispensa CSRF.
- Rate limit: política `training-mutation`, por pessoa/sessão e IP.
- Entrada: envelope estrito v1 com UUID v4 de instalação, lease e execução,
  revisão de `0` a `2147483647`, timestamp com timezone e snapshot completo.
- Árvore: plano capturado com até 25 workouts, workout executado com até 50
  exercícios e até 100 séries consecutivas por exercício. IDs Mongo, nomes,
  áreas, cargas, parâmetros e timer precisam ser internamente coerentes.
- Tamanho: o parser HTTP e o pipe limitam o JSON completo a 1 MiB. Excesso retorna
  `413 OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE` antes do lock.
- Sucesso: `200`, `Cache-Control: private, no-store` e
  `ApiResponse<OfflineTrainingSnapshotResult>` com estado `accepted | duplicate`.
- Dados efêmeros: o hash e o agregado ficam em um hash Redis
  `offline-training-snapshot:<personId>` por sete dias. Não existem documento,
  histórico por revisão, mídia, URL assinada ou escrita do plano.

## Fluxo completo

### Entrada e validação

Os guards autenticam a pessoa e restringem o canal antes do rate limit e do
controller. O parser aceita no máximo 1 MiB; o pipe Zod rejeita campos adicionais,
versão desconhecida, UUID/timestamp/limite inválido, série não consecutiva,
workout fora do plano capturado e timer incompatível. A pessoa nunca vem no body.

Depois da validação, o controller passa pessoa e request ao command. O content
service ordena recursivamente somente nomes de propriedades para o hash; a ordem
dos arrays continua semântica. Snapshot e timestamp bruto não são reescritos.

### Lock global da instalação

O command chama o lock service antes de ler lease ou snapshot. O service executa
`SET NX PX` com token criptograficamente aleatório e espera zero. Contenção vira
`OFFLINE_TRAINING_SYNC_IN_PROGRESS`. O `finally` sempre tenta liberar por Lua, que
só remove a chave se o token ainda coincidir; queda do runtime é limitada pelo TTL.

### Transição atômica

Sob o lock, o snapshot service entrega ao Redis duas chaves explícitas: lease da
pessoa e snapshot corrente. O script constante:

1. exige lease presente e coincidência de pessoa, plano, instalação e `leaseId`;
2. se não existe snapshot, aceita a primeira revisão;
3. para a mesma execução, devolve `duplicate` apenas quando revisão e hash são
   iguais, rejeita hash diferente e revisão menor, e aceita somente revisão maior;
4. rejeita outro `executionId` sem revelar a execução armazenada;
5. em aceite, grava o agregado completo e renova snapshot e o mesmo lease para o
   mesmo `PXAT` de sete dias dentro da transição;
6. em duplicata ou erro, não executa escrita nem desloca TTL.

`acceptedAt` vem do relógio server-side. `orderedAt` acompanha
`clientUpdatedAt` quando ele avança a ordem canônica; empate, regressão ou um
relógio que ficou atrás de desempates anteriores recebe um instante estritamente
maior que o `orderedAt` anterior. O timestamp bruto continua persistido.

Falha de Redis em lock ou transição vira `503
OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE`. Como lease e snapshot são tratados no
mesmo script, o endpoint não declara aceite com apenas um dos dois atualizado.

## Mapa de caminhos

| Caminho | Resultado | Efeito |
| --- | --- | --- |
| primeira revisão ou revisão maior | `200 accepted` | substitui snapshot completo e renova os dois TTLs |
| replay idêntico | `200 duplicate` | nenhum write; metadados e TTLs originais |
| revisão menor | `409 OFFLINE_TRAINING_SNAPSHOT_STALE` | nenhum |
| mesma revisão, outro conteúdo | `409 OFFLINE_TRAINING_SNAPSHOT_IDEMPOTENCY_CONFLICT` | nenhum |
| outra execução corrente | `409 OFFLINE_TRAINING_EXECUTION_CONFLICT` | nenhum |
| lock ocupado | `409 OFFLINE_TRAINING_SYNC_IN_PROGRESS` | nenhum |
| lease ausente/divergente | `410 OFFLINE_LEASE_EXPIRED` / `409 OFFLINE_LEASE_REVOKED` | nenhum |
| shape/tamanho inválido | `400 VALIDATION_ERROR` / `413 OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE` | interrompe antes do lock |
| Redis indisponível | `503 OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE` | nenhum aceite declarado |

## Cenários reproduzíveis

Os seeds gravam token, cookie e body fictícios com permissão `0600` em `/tmp`.

### Cenário 1 — primeira revisão e árvore histórica aceitas

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:ready
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data-binary @/tmp/dall-fit-offline-training-snapshot.json
```

- Given: lease válido para o plano pessoal atual, cujo documento MongoDB não
  contém a árvore histórica enviada.
- Then: `200 accepted`; snapshot e lease recebem a mesma janela de sete dias e o
  plano MongoDB permanece intacto.

### Cenário 2 — replay, atualização, stale e colisões

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:current
```

**cURL**

```bash
# duplicate da revisão 2
curl --include --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data-binary @/tmp/dall-fit-offline-training-snapshot.json

# revisão 3 aceita
jq '.revision = 3' /tmp/dall-fit-offline-training-snapshot.json | curl --include \
  --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --data-binary @-
```

Repetir o seed e enviar `.revision = 1` reproduz `STALE`; manter revisão 2 e
alterar `.snapshot.workout.exercises[0].series[0].loadKg = 10` reproduz
`IDEMPOTENCY_CONFLICT`; alterar `.executionId` para outro UUID v4 reproduz
`EXECUTION_CONFLICT`. Nenhum erro altera o hash, agregado ou TTL vigente.

### Cenário 3 — lease expirado ou revogado

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:expired
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' \
  --data-binary @/tmp/dall-fit-offline-training-snapshot.json
```

O seed `offline-training-snapshot:revoked` com o mesmo cURL prepara outra
instalação como proprietária. Os resultados são, respectivamente, `410
OFFLINE_LEASE_EXPIRED` e `409 OFFLINE_LEASE_REVOKED`, sem snapshot.

### Cenário 4 — validação, tamanho e canais

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:invalid
```

**cURL**

```bash
jq '.payloadVersion = 2' /tmp/dall-fit-offline-training-snapshot.json | curl --include \
  --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --data-binary @-
```

Versão/shape/relação inválida retorna `400 VALIDATION_ERROR`. Um JSON acima de 1
MiB retorna o código específico `413`. Trocar o header Bearer pelo cookie de
`/tmp/dall-fit-web-session-cookie.txt` retorna `NATIVE_SESSION_REQUIRED`; enviar
ambos retorna `AUTH_TRANSPORT_AMBIGUOUS`.

### Cenário 5 — concorrência e indisponibilidade

**Seed:** não se aplica — contenção real exige uma barreira entre requests e a
indisponibilidade exige interromper apenas o Redis efêmero; um cURL público não
deve selecionar artificialmente esses branches.

**cURL**

```bash
curl --include http://localhost:4000/ready
```

O cURL confirma apenas a infraestrutura. O E2E ocupa o lock com outro token e
valida `OFFLINE_TRAINING_SYNC_IN_PROGRESS`; falhas isoladas do client validam
`OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE`, release condicionado e ausência de estado
parcial.

## Regras cobertas por testes

- Unitários do pipe cobrem envelope estrito, timezone, limites, relações, séries e
  timer; o content service cobre hash canônico.
- Unitários de command e services cobrem ordem da orquestração, release em erro,
  lock NX/token, matriz da transição e tradução de falhas.
- [`offline-training-lease.e2e-spec.ts`](../../../test/offline-training-lease.e2e-spec.ts)
  usa Nest, MongoDB e Redis efêmeros reais para canais, árvore histórica, criação,
  replay, TTL, atualização, relógio regressivo, stale, colisões, lease e lock.

## Fora do comportamento atual

- cliente/sincronizador Android, lote, patch ou merge;
- conclusão, cancelamento, histórico MongoDB ou limpeza terminal;
- múltiplas execuções correntes e substituição silenciosa;
- mídia, signed URL, métricas derivadas ou alteração do plano canônico.

