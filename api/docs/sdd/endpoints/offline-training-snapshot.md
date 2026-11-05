# Endpoint `PUT /training/offline-snapshot`

## Objetivo funcional

Sincronizar a versão completa de uma execução Android, em andamento, concluída ou
cancelada, sob o lease vigente. O endpoint mantém uma única versão corrente por
pessoa, permite resolver conflitos explicitamente e torna estados terminais
duráveis e imutáveis.

## Referências técnicas

| Papel | Símbolo e arquivo | Responsabilidade |
| --- | --- | --- |
| Controller | [`OfflineTrainingSnapshotController`](../../../src/training/controllers/offline-training-snapshot.controller.ts) | recebe a entrada validada e devolve a resposta do command |
| Validação | [`OfflineTrainingSnapshotValidationPipe`](../../../src/training/dto/offline-training-snapshot.dto.ts) e [`offlineTrainingSnapshotRequestSchema`](../../../src/training/domain/offline-training-snapshot.schema.ts) | limitam o JSON a 1 MiB e validam envelope, estado e relações |
| Command | [`PutOfflineTrainingSnapshotCommand`](../../../src/training/commands/put-offline-training-snapshot.command.ts) | calcula o conteúdo, adquire o lock, consulta recibo, ingere, consolida terminal e limpa |
| Compatibilidade | [`AndroidAppCompatibilityService`](../../../src/app-compatibility/services/android-app-compatibility.service.ts) | recusa pacote ou contrato incompatível antes das dependências do snapshot |
| Conteúdo | [`OfflineTrainingSnapshotContentService`](../../../src/training/services/offline-training-snapshot-content.service.ts) | produz serialização canônica e SHA-256 sem incluir a escolha de resolução |
| Lock | [`OfflineTrainingSnapshotLockService`](../../../src/training/services/offline-training-snapshot-lock.service.ts) | serializa por instalação com token e release condicionado |
| Redis | [`OfflineTrainingSnapshotService`](../../../src/training/services/offline-training-snapshot.service.ts) | aplica lease, CAS, resolução, TTL e limpeza condicionada em Lua |
| Terminal | [`OfflineTrainingTerminalService`](../../../src/training/services/offline-training-terminal.service.ts) | faz replay durável, conclusão canônica, cancelamento e imutabilidade |
| Histórico | [`TrainingService`](../../../src/training/services/training.service.ts) | consolida execução, perfis e resumo com as mesmas regras do fluxo online |
| Recibo | [`MongoOfflineTrainingTerminalReceiptRepository`](../../../src/training/repositories/mongo-offline-training-terminal-receipt.repository.ts) | persiste terminal único por pessoa + execução |
| Contrato | [`PutOfflineTrainingSnapshotV1Request`](../../../../packages/types/src/contracts.ts) e [`OfflineTrainingSnapshotV1`](../../../../packages/types/src/entities.ts) | definem envelope, estados, respostas e conflitos compartilhados |

## Contrato HTTP resumido

- Autenticação: somente sessão Bearer `native`; cookie Web recebe `403
  NATIVE_SESSION_REQUIRED`, e cookie com Bearer recebe `400
  AUTH_TRANSPORT_AMBIGUOUS`. Sessão nativa dispensa CSRF.
- Rate limit: política `training-mutation`, por pessoa/sessão e IP.
- Compatibilidade: `X-App-Version-Code` e `X-Sync-Contract-Version` são inteiros
  positivos gravados no envelope nativo. Ausência conjunta representa pacote e
  contrato 1 somente no rollout inicial; ausência parcial, formato inválido,
  pacote abaixo do mínimo ou contrato diferente responde `409
  APP_UPDATE_REQUIRED` antes do conteúdo, lock, Redis ou MongoDB.
- Entrada: envelope estrito `payloadVersion: 1`, UUID v4 de instalação e execução,
  fence do lease, revisão inteira, timestamp com timezone e snapshot completo.
- Estado: `snapshot.state` discrimina `in-progress`, `completed` e `cancelled`.
  Estados terminais exigem timer nulo e seus respectivos timestamps; conclusão
  exige timezone para o resumo semanal.
- Resolução opcional: `{ choice: 'local' | 'server', conflictToken }`. O token de
  64 caracteres hexadecimais identifica a versão exata observada.
- Árvore: plano capturado com até 25 workouts, workout executado com até 50
  exercícios e até 100 séries consecutivas por exercício. IDs, nomes, áreas,
  parâmetros, cargas e timer precisam ser coerentes.
- Tamanho: parser e pipe limitam o JSON completo a 1 MiB; excesso retorna `413
  OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE` antes do lock.
- Sucesso: `200`, `Cache-Control: private, no-store` e
  `ApiResponse<OfflineTrainingSnapshotResult>`.

## Fluxo completo

O controller chama o command com a pessoa autenticada e os dois headers. O command
primeiro pede ao `AndroidAppCompatibilityService` para compará-los com a política
vigente. Somente um cliente compatível alcança o content service, que ordena
recursivamente nomes de propriedades, preserva a ordem semântica de arrays e
calcula o hash do envelope sem `resolution`. O command adquire um lock Redis curto
por instalação; contenção retorna `OFFLINE_TRAINING_SYNC_IN_PROGRESS`, e o
`finally` libera somente se o token ainda for proprietário.

Sob o lock, o command primeiro procura o recibo MongoDB por pessoa + execução. Um
recibo idêntico responde `duplicate-completed` ou `duplicate-cancelled` mesmo sem
lease; divergência responde execução imutável. Sem recibo, um script Lua valida a
tupla de lease e compara a versão Redis:

1. ausência ou divergência do lease falha sem escrita;
2. ausência de versão corrente ou revisão maior aceita a versão recebida;
3. mesma execução, revisão e hash responde `duplicate`;
4. revisão menor, mesmo número com conteúdo diferente ou outra execução devolve a
   versão segura completa, seu token e `local-or-server`;
5. escolha `server` mantém a versão corrente e responde `resolved-server`;
6. escolha `local` substitui a versão e responde `resolved-local`, somente se o
   token ainda coincidir; versão alterada invalida a resolução;
7. escrita aceita renova lease e snapshot para o mesmo `PXAT` de sete dias;
   duplicata, conflito e escolha do servidor não renovam.

`acceptedAt` usa o relógio da API. `orderedAt` acompanha `clientUpdatedAt` quando
ele avança a ordem; empate ou regressão recebe um instante server-side estritamente
maior que o anterior. O timestamp cliente original permanece no agregado.

Se a versão efetiva é `completed`, o terminal service reutiliza a consolidação do
treino online: cria/retoma `workout_executions`, atualiza somente perfis ainda
elegíveis na árvore atual, conclui a execução e calcula o resumo semanal. Se é
`cancelled`, não cria histórico nem perfil. Nos dois casos grava um recibo único e
imutável em `offline_training_terminal_receipts`. Somente depois remove o snapshot
Redis por execução + revisão + hash; o lease permanece até expirar. Uma conclusão
responde também `completion` com o resumo canônico.

Falha de Redis vira `503 OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE`. Falha MongoDB não
declara terminal concluído; a repetição retoma a execução `finalizing` de forma
idempotente.

## Mapa de caminhos

| Caminho | Resultado | Efeito |
| --- | --- | --- |
| primeira versão ou revisão maior em andamento | `200 accepted` | substitui snapshot e renova lease/TTL |
| replay idêntico em andamento | `200 duplicate` | nenhuma escrita ou renovação |
| conflito comparável | `409 OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT` | devolve versão segura, token e duas escolhas |
| escolha local com token atual | `200 resolved-local` | substitui a versão; terminal é consolidado quando aplicável |
| escolha do servidor com token atual | `200 resolved-server` | mantém versão e TTL correntes |
| token sem versão ou versão alterada | `409 OFFLINE_TRAINING_CONFLICT_TOKEN_STALE` ou novo conflito atual | nenhuma escrita |
| conclusão inédita | `200 completed` | histórico, perfis elegíveis, recibo e limpeza do snapshot |
| cancelamento inédito | `200 cancelled` | recibo e limpeza; nenhum histórico ou perfil |
| replay terminal idêntico | `200 duplicate-completed` ou `duplicate-cancelled` | lê recibo, independente do lease e do snapshot Redis |
| mutação após terminal | `409 OFFLINE_TRAINING_EXECUTION_IMMUTABLE` | informa `discard-local-only` e estado terminal |
| lock ocupado | `409 OFFLINE_TRAINING_SYNC_IN_PROGRESS` | nenhum efeito |
| lease ausente/divergente | `410 OFFLINE_LEASE_EXPIRED` / `409 OFFLINE_LEASE_REVOKED` | nenhum efeito inicial |
| shape/tamanho inválido | `400 VALIDATION_ERROR` / `413 OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE` | para antes do lock |
| app ou contrato incompatível | `409 APP_UPDATE_REQUIRED` | devolve mínimo, contrato aceito e URL; não toca lock, Redis ou MongoDB |
| Redis indisponível | `503 OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE` | nenhum aceite declarado |

## Cenários reproduzíveis

Os seeds gravam token, cookie e body fictícios com permissão `0600` em `/tmp`.

### Cenário 1 — primeira revisão

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:ready
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'x-app-version-code: 1' \
  --header 'x-sync-contract-version: 1' \
  --header 'content-type: application/json' \
  --data-binary @/tmp/dall-fit-offline-training-snapshot.json
```

O resultado é `accepted`; a árvore histórica enviada não altera o plano MongoDB.

### Cenário 2 — conflito e resolução

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:current
```

**cURL**

```bash
jq '.revision = 1' /tmp/dall-fit-offline-training-snapshot.json | curl --include \
  --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'x-app-version-code: 1' \
  --header 'x-sync-contract-version: 1' \
  --header 'content-type: application/json' --data-binary @-
```

O resultado é `OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT`. Copie
`details.conflictToken` da resposta para `resolution.conflictToken`, escolha
`server` para conservar a versão retornada ou `local` para publicar o body local.
Repetir o seed antes da resolução altera a versão corrente e exercita token stale
ou um novo conflito, sem sobrescrita cega.

### Cenário 3 — conclusão e cancelamento

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:ready
```

**cURL de conclusão**

```bash
jq '.snapshot.state = "completed" |
    .snapshot.activeTimer = null |
    .snapshot.completedAt = "2026-09-14T12:06:00.000Z" |
    .snapshot.timezone = "America/Sao_Paulo"' \
  /tmp/dall-fit-offline-training-snapshot.json | curl --include \
  --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'x-app-version-code: 1' \
  --header 'x-sync-contract-version: 1' \
  --header 'content-type: application/json' --data-binary @-
```

O resultado `completed` contém `completion`; repetir exatamente o body responde
`duplicate-completed`. Para cancelamento, repita o seed e troque a transformação
por `.snapshot.state = "cancelled" | .snapshot.activeTimer = null |
.snapshot.cancelledAt = "2026-09-14T12:06:00.000Z"`; o resultado é `cancelled`,
sem `workout_executions`.

### Cenário 4 — lease expirado ou revogado

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:expired
```

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'x-app-version-code: 1' \
  --header 'x-sync-contract-version: 1' \
  --header 'content-type: application/json' \
  --data-binary @/tmp/dall-fit-offline-training-snapshot.json
```

O seed `offline-training-snapshot:revoked` com o mesmo cURL produz o outro ramo.
Os resultados são `OFFLINE_LEASE_EXPIRED` e `OFFLINE_LEASE_REVOKED`.

### Cenário 5 — validação e canais

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:invalid
```

**cURL**

```bash
jq '.payloadVersion = 2' /tmp/dall-fit-offline-training-snapshot.json | curl --include \
  --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'x-app-version-code: 1' \
  --header 'x-sync-contract-version: 1' \
  --header 'content-type: application/json' --data-binary @-
```

Shape ou relação inválida retorna `VALIDATION_ERROR`. Trocar Bearer pelo cookie de
`/tmp/dall-fit-web-session-cookie.txt` retorna `NATIVE_SESSION_REQUIRED`; enviar os
dois transportes retorna `AUTH_TRANSPORT_AMBIGUOUS`.

### Cenário 6 — concorrência e indisponibilidade

**Seed:** não se aplica — esses caminhos exigem barreira real entre requests ou a
interrupção isolada do Redis.

**cURL**

```bash
curl --include http://localhost:4000/ready
```

O cURL apenas observa a infraestrutura. O E2E ocupa o lock e interrompe adapters
controladamente para validar contenção, falha fechada e ausência de estado parcial.

### Cenário 7 — atualização obrigatória

**Seed:** use `offline-training-snapshot:ready`; o cenário depende adicionalmente
de iniciar a API com `ANDROID_MIN_VERSION_CODE=2`.

**cURL**

```bash
curl --include --request PUT http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'x-app-version-code: 1' \
  --header 'x-sync-contract-version: 1' \
  --header 'content-type: application/json' \
  --data-binary @/tmp/dall-fit-offline-training-snapshot.json
```

O resultado é `409 APP_UPDATE_REQUIRED` com somente mínimo 2, contrato 1 e URL
pública nos detalhes. Lease, TTL, snapshot, recibo e execução permanecem intactos.

## Cobertura automatizada

- Unitários do pipe cobrem os três estados, timestamps, timezone, limites,
  relações, séries, timer e resolução.
- Unitários de command e services cobrem lock, hash, CAS, token, replay,
  imutabilidade, consolidação e tradução HTTP.
- [`offline-training-lease.e2e-spec.ts`](../../../test/offline-training-lease.e2e-spec.ts)
  usa Nest, MongoDB e Redis efêmeros para criação, conflitos e ambas as escolhas,
  conclusão canônica, cancelamento, recibos, limpeza e retries.

## Fora do comportamento atual

- cliente, motor e fila do sincronizador Android;
- lote, patch ou merge automático;
- múltiplas execuções correntes ou substituição sem escolha explícita;
- upload de mídia, signed URL ou alteração do plano canônico.

## Precondição jurídica antes da ingestão

`TermsExempt` evita antecipar a política no interceptor deste endpoint: o command
preserva a validação de compatibilidade primeiro e depois chama
`TermsAccessService.require`, antes do lock, leitura/renovação do lease, snapshot,
recibo terminal ou execução. Pendência é `403 TERMS_ACCEPTANCE_REQUIRED` com referência
mínima; ausência de publicação/falha necessária é `503 TERMS_NOT_CONFIGURED` ou
`TERMS_UNAVAILABLE`. O lease e a fila remota ficam intactos. O Android classifica
especificamente essa recusa como `terms-required`, persiste exigência e pausa sem
expirar Bearer ou apagar fila; o aceite posterior reativa o mesmo motor.
Os [cenários de termos](terms.md) e o E2E de snapshot protegem a fronteira.

### Aceite pendente não altera a ingestão

**Seed**

```bash
pnpm -C api seed -- offline-training-snapshot:terms-required
```

**cURL**

```bash
curl --include --request PUT \
  --url http://localhost:4000/training/offline-snapshot \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'x-app-version-code: 2' \
  --header 'x-sync-contract-version: 1' \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-offline-training-snapshot.json
```

- Given: sessão nativa, plano/lease preparados e documento publicado sem recibo vigente.
- When: envia um snapshot compatível.
- Then: `403 TERMS_ACCEPTANCE_REQUIRED` com referência mínima, antes de lock,
  renovação do lease, snapshot Redis ou execução/recibo terminal MongoDB.
- Recuperação: abrir a aplicação e aceitar online; a mesma fila pode ser retomada.
