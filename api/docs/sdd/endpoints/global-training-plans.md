# Endpoints `global-training-plans`

## Objetivo e hierarquia

As quinze operações administrativas mantêm planos globais, workouts e exercícios
embutidos. O caminho interno é sempre controller → command proprietário →
`TrainingPlanService` → `TrainingPlanRepository`; mídia acrescenta
`ExerciseImageService`/`BlobStorageService` e referências YouTube acrescentam
`YoutubeReferenceService`. Commands/controllers não acessam MongoDB ou SDKs.

| Papel        | Símbolo                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| transporte   | `GlobalTrainingPlansController`, DTOs e parser de versão                |
| orquestração | classes em `src/training-plan/commands/`                                |
| domínio      | `TrainingPlanService`                                                   |
| integrações  | `YoutubeReferenceService`, `ExerciseImageService`, `BlobStorageService` |
| persistência | `MongoTrainingPlanRepository`, schemas discriminados                    |
| contratos    | `@dall-fit/types`                                                       |

Todas exigem sessão ativa e `isAdmin: true`. Mutações exigem origem/CSRF e quota:
30/minuto nas operações administrativas existentes, 120/minuto nas mutations JSON
do editor e 10/minuto no upload. Plano pessoal é indistinguível de ausente.

## Concorrência HTTP

POST de plano nasce com `version: 0`. GET de item e toda resposta bem-sucedida que
mantém o aggregate devolvem `X-Resource-Version: <version>`, inclusive `204` e
no-ops; DELETE do plano não devolve versão porque o aggregate deixa de existir.
Toda mutação de plano existente exige nesse header a forma decimal canônica de um
inteiro não negativo seguro: `0` ou valor sem zero à esquerda até
`Number.MAX_SAFE_INTEGER`. Ausência é `428 PRECONDITION_REQUIRED`; valor repetido,
malformado ou inseguro é `400 VALIDATION_ERROR`; versão antiga de recurso existente
é `412 TRAINING_PLAN_VERSION_CONFLICT`. `If-Match` legado não satisfaz a
precondição. CORS permite e expõe `X-Resource-Version`, não anuncia `If-Match` ou
ETag, e aceita PUT.

Cada mutação efetiva envia também `X-Client-Instance-Id` quando originada pela UI.
Depois do commit, `TrainingPlanService` pede ao `RealtimePublisherService` uma
invalidação `global-training-plan`; o envelope Redis leva o UUID apenas para
suprimir aquele documento. No-op, validação, conflito e falha não publicam. Falha
de Pub/Sub é registrada e não altera a resposta HTTP já comprometida. CORS aceita
o header de origem sem expô-lo na resposta.

## Contratos

| Método e path                                  | Entrada                                 | Sucesso                          |
| ---------------------------------------------- | --------------------------------------- | -------------------------------- |
| `GET /global/training-plans?page=1`            | página 1–100                            | `200`, resumos, versão e impacto |
| `POST /global/training-plans`                  | `{name,description}`                    | `201`, resumo v0 + header        |
| `GET /global/training-plans/:planId`           | IDs MongoDB                             | `200`, detalhe + header          |
| `PATCH /global/training-plans/:planId`         | campos + `X-Resource-Version`           | `200`, resumo + novo header      |
| `DELETE /global/training-plans/:planId`        | `X-Resource-Version`                    | `204`, remove árvore/mídia       |
| `POST /global/training-plans/:planId/workouts` | `{}` + `X-Resource-Version`             | `201`, `Novo treino` + header    |
| `DELETE .../workouts/:workoutId`               | `X-Resource-Version`                    | `204`, remove workout + header   |
| `GET .../workouts/:workoutId`                  | IDs MongoDB                             | `200`, editor completo + header  |
| `PATCH .../workouts/:workoutId`                | `{name}` + `X-Resource-Version`         | `200`, nome/timestamp + header   |
| `POST .../workouts/:workoutId/exercises`       | `{type}` + `X-Resource-Version`         | `201`, defaults + header         |
| `PATCH .../exercises/:exerciseId`              | campos do tipo + `X-Resource-Version`   | `200`, exercício + header        |
| `DELETE .../exercises/:exerciseId`             | `X-Resource-Version`                    | `204`, remove linha + header     |
| `PUT .../exercises/order`                      | ordem completa + `X-Resource-Version`   | `204`, inclusive no-op + header  |
| `PUT .../exercises/:exerciseId/image`          | multipart `file` + `X-Resource-Version` | `200`, URLs + header             |
| `DELETE .../exercises/:exerciseId/image`       | `X-Resource-Version`                    | `204`, inclusive no-op + header  |

GET do workout retorna plano mínimo, timestamps e exercícios na ordem física. Os
tipos/limites/defaults são os publicados em `@dall-fit/types`: nomes 120/40,
25 workouts, 50 exercícios, números finitos, 16 body areas. Página 101 é inválida.
YouTube persiste só ID de 11 caracteres e deriva thumbnail no cliente. Imagem
expõe `thumbnailUrl`, `displayUrl` assinadas e `signedUrlExpiresAt`; keys,
dimensões internas, pathnames, delegation token e original não atravessam HTTP.
Responses JSON que podem conter essas URLs usam `Cache-Control: private, no-store`.

Lista, detalhe e workout incluem `usage.linkedPeople` e `usage.activePeople`. O
primeiro conta referências pessoais vivas; o segundo, referências que também são
a seleção ativa. Clones concluídos não contam. A administração pode editar e
excluir independentemente desses números. DELETE remove todas as referências e
seleções daquele global, sem fallback; portanto pessoas podem ficar sem plano
ativo. Keys presentes em snapshots de clone não terminal são retidas para que a
exclusão do global não interrompa a clonagem e serão liberadas após o terminal.

## Persistência e branches

Listagem usa projeção lean, ordem `{createdAt:-1,_id:-1}` e índice
`{ownerPersonId:1,createdAt:-1,_id:-1}`. Detalhe/workout retornam somente campos
necessários. PATCH substitui/projeta só o subdocumento alvo e todos os writes CAS
incluem `ownerPersonId:null`. Uma inspeção mínima distingue plano, workout,
exercício e versão quando um filtro não casa.

Criação rejeita 25/50 por `409 WORKOUT_LIMIT_REACHED` ou
`EXERCISE_LIMIT_REACHED`; documento no limite operacional rejeita por
`TRAINING_PLAN_SIZE_LIMIT_REACHED`. Ordem deve conter uma vez todos os IDs atuais.
Campos de outro discriminador são `INVALID_EXERCISE_TYPE`.

No YouTube, allowlist aceita ID, youtu.be, watch e shorts HTTPS; resposta externa
não bem-sucedida vira `INVALID_YOUTUBE_REFERENCE`, falha/timeout vira
`YOUTUBE_VALIDATION_UNAVAILABLE`, sem write. No upload, Sharp valida bytes,
10 MiB, 40 MP e ausência de animação e gera duas variantes privadas agrupadas sob
`exercise-images/{imageAssetId}/thumbnail.webp` e `display.webp`. O ID opaco nasce
antes dos uploads; ambos usam pathnames exatos, sem sufixo aleatório nem overwrite.
O command
solicita as duas URLs assinadas antes de executar o CAS. Falha de upload,
assinatura ou commit remove as novas keys; sucesso persiste somente keys/dimensões
e remove variantes antigas depois do MongoDB. Leitura do workout hidrata todas as
imagens com concorrência limitada a oito emissões e falha integralmente se uma
assinatura não puder ser produzida. Exclusões coletam referências antes do CAS e
limpam depois.

## Erros estáveis

`VALIDATION_ERROR`, `INVALID_YOUTUBE_REFERENCE`, `INVALID_EXERCISE_ORDER`,
`INVALID_EXERCISE_TYPE`, `AUTHENTICATION_REQUIRED`, `ADMIN_ACCESS_REQUIRED`,
`TRAINING_PLAN_NOT_FOUND`, `WORKOUT_NOT_FOUND`, `EXERCISE_NOT_FOUND`,
`WORKOUT_LIMIT_REACHED`, `EXERCISE_LIMIT_REACHED`,
`TRAINING_PLAN_SIZE_LIMIT_REACHED`, `TRAINING_PLAN_VERSION_CONFLICT`,
`IMAGE_TOO_LARGE`, `UNSUPPORTED_IMAGE_TYPE`, `PRECONDITION_REQUIRED`,
`YOUTUBE_VALIDATION_UNAVAILABLE` e `IMAGE_UPLOAD_FAILED`. Todo erro segue
`ApiError` e `x-request-id`. Falha de assinatura usa
`503 IMAGE_URL_SIGNING_FAILED`.

## Cenários reproduzíveis

Os comandos usam bypass somente local. A fixture tem plano
`64b000000000000000000001`, workout `...101`, exercícios `...201` a `...205` e
versão zero. Cada cenário prepara novamente o seed.

### Cenário 1 — listar, criar e ler detalhe

**Seed**

```bash
pnpm -C api seed -- training-plans:list
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit28.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit28.txt | jq -r '.data.token')" \
&& curl --include 'http://localhost:4000/global/training-plans?page=1' --cookie /tmp/dall-fit-fit28.txt \
&& curl --include --request POST http://localhost:4000/global/training-plans \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt \
  --data '{"name":"Plano corrida","description":"Preparação global."}' \
&& curl --include http://localhost:4000/global/training-plans/64b000000000000000000001 \
  --cookie /tmp/dall-fit-fit28.txt
```

Lista é determinística, criação retorna v0 no header e detalhe contém cinco exercícios
apenas como `exerciseCount`.

### Cenário 2 — mutações existentes com X-Resource-Version

**Seed**

```bash
pnpm -C api seed -- training-plans:update
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit28.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit28.txt | jq -r '.data.token')" \
&& curl --include --request PATCH http://localhost:4000/global/training-plans/64b000000000000000000001 \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt \
  --data '{"name":"Plano atualizado"}' \
&& curl --include --request POST http://localhost:4000/global/training-plans/64b000000000000000000001/workouts \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 1' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt --data '{}'
```

Cada write incrementa uma vez. DELETE de workout/plano usa o mesmo formato com a
versão vigente e limpa imagens somente depois do commit.

### Cenário 3 — ler e editar workout/exercícios

**Seed**

```bash
pnpm -C api seed -- training-plans:workout-editor
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit28.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit28.txt | jq -r '.data.token')" \
&& curl --include http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101 --cookie /tmp/dall-fit-fit28.txt \
&& curl --include --request PATCH http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101 \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit28.txt --data '{"name":"Treino editado"}' \
&& curl --include --request POST http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 1' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit28.txt --data '{"type":"pause"}' \
&& curl --include --request PATCH http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises/64b000000000000000000205 \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 2' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit28.txt --data '{"durationMinutes":20}'
```

GET traz os cinco tipos; POST recebe somente tipo e PATCH aceita somente campos do
discriminador persistido.

### Cenário 4 — reordenar e detectar conflito

**Seed**

```bash
pnpm -C api seed -- training-plans:workout-conflict
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit28.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit28.txt | jq -r '.data.token')" \
&& curl --include --request PUT http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises/order \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit28.txt \
  --data '{"exerciseIds":["64b000000000000000000205","64b000000000000000000204","64b000000000000000000203","64b000000000000000000202","64b000000000000000000201"]}' \
&& curl --include --request DELETE http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises/64b000000000000000000201 \
  --header 'origin: http://localhost:3000' --header 'x-resource-version: 0' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt
```

PUT retorna v1. O DELETE deliberadamente reutiliza v0, recebe `412` e não remove.
Duplicar/omitir/desconhecer ID na ordem produz `INVALID_EXERCISE_ORDER` sem efeito.

### Cenário 5 — upload e remoção de imagem

**Seed**

```bash
pnpm -C api seed -- training-plans:workout-editor
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit28.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit28.txt | jq -r '.data.token')" \
&& curl --include --request PUT http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises/64b000000000000000000202/image \
  --header 'origin: http://localhost:3000' --header 'x-resource-version: 0' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt \
  --form 'file=@./fixtures/exercise.jpg;type=image/jpeg' \
&& curl --include --request DELETE http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises/64b000000000000000000202/image \
  --header 'origin: http://localhost:3000' --header 'x-resource-version: 1' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt
```

Requer `BLOB_STORE_ID=store_8u9fq5re0OENMRtC`, OIDC local vigente da Vercel e
arquivo fictício local. PUT grava variantes privadas sob `exercise-images/`,
agrupadas por um mesmo `imageAssetId`, assina cada pathname para `get` antes do CAS
e devolve duas URLs temporárias com
`signedUrlExpiresAt`; DELETE preserva o exercício e remove a associação. A leitura
do workout devolve outro par válido sem endpoint binário intermediário.

### Cenário 6 — limites, ownership e precondição

**Seed**

```bash
pnpm -C api seed -- training-plans:workout-limits
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit28.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit28.txt | jq -r '.data.token')" \
&& curl --include --request PATCH http://localhost:4000/global/training-plans/64b000000000000000000001 \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt --data '{"name":"Sem versão"}' \
&& curl --include http://localhost:4000/global/training-plans/64b000000000000000000002 --cookie /tmp/dall-fit-fit28.txt \
&& curl --include 'http://localhost:4000/global/training-plans?page=101' --cookie /tmp/dall-fit-fit28.txt
```

As respostas são respectivamente `428`, `404 TRAINING_PLAN_NOT_FOUND` e
`400 VALIDATION_ERROR`. Seeds/E2E de fronteira exercitam 25/50 e confirmam
`$bsonSize < 12 MiB` sem depender do limite físico de 16 MiB.

## Testes e operação

`resource-version.spec.ts`, services/commands e adapters cobrem parser, defaults,
validação YouTube, processamento/compensação de imagem, CAS, no-op e falhas. O E2E
serial usa Nest, MongoDB e Redis efêmeros e valida transporte, ownership, schema,
índice, limites e BSON. Aplicação de índice: `pnpm -C api indexes:apply` com
confirmação explícita. Reconciliação: `pnpm -C api images:reconcile`, dry-run por
padrão.
