# Endpoints `global-training-plans`

## Objetivo e hierarquia

As quinze operações administrativas mantêm planos globais, workouts e exercícios
embutidos. O caminho interno é sempre controller → command proprietário →
`TrainingPlanService` → `TrainingPlanRepository`; mídia acrescenta
`ExerciseImageService`/`BlobStorageService` e referências YouTube acrescentam
`YoutubeReferenceService`. Commands/controllers não acessam MongoDB ou SDKs.

| Papel        | Símbolo                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| transporte   | `GlobalTrainingPlansController`, DTOs e ETag parser                     |
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
mantém o aggregate devolvem `ETag: "training-plan:<id>:<version>"`. Toda mutação de
plano existente exige exatamente essa tag forte em `If-Match`; ausência é
`428 PRECONDITION_REQUIRED`, formato fraco/lista/wildcard/alheio é
`400 VALIDATION_ERROR` e versão antiga de recurso existente é
`412 TRAINING_PLAN_VERSION_CONFLICT`. CORS permite `If-Match`, expõe `ETag` e
aceita PUT.

## Contratos

| Método e path                                  | Entrada                             | Sucesso                         |
| ---------------------------------------------- | ----------------------------------- | ------------------------------- |
| `GET /global/training-plans?page=1`            | página 1–100                        | `200`, 20 resumos com versão    |
| `POST /global/training-plans`                  | `{name,description}`                | `201`, resumo v0 + ETag         |
| `GET /global/training-plans/:planId`           | IDs MongoDB                         | `200`, detalhe projetado + ETag |
| `PATCH /global/training-plans/:planId`         | campos parciais + If-Match          | `200`, resumo + novo ETag       |
| `DELETE /global/training-plans/:planId`        | If-Match                            | `204`, remove árvore/mídia      |
| `POST /global/training-plans/:planId/workouts` | `{}` + If-Match                     | `201`, `Novo treino`            |
| `DELETE .../workouts/:workoutId`               | If-Match                            | `204`, remove workout/mídia     |
| `GET .../workouts/:workoutId`                  | IDs MongoDB                         | `200`, editor completo + ETag   |
| `PATCH .../workouts/:workoutId`                | `{name}` + If-Match                 | `200`, nome/timestamp           |
| `POST .../workouts/:workoutId/exercises`       | `{type}` + If-Match                 | `201`, exercício com defaults   |
| `PATCH .../exercises/:exerciseId`              | campos válidos do tipo + If-Match   | `200`, exercício canônico       |
| `DELETE .../exercises/:exerciseId`             | If-Match                            | `204`, remove linha/mídia       |
| `PUT .../exercises/order`                      | `{exerciseIds}` completo + If-Match | `204`; ordem igual é no-op      |
| `PUT .../exercises/:exerciseId/image`          | multipart `file` + If-Match         | `200`, URLs thumbnail/display   |
| `DELETE .../exercises/:exerciseId/image`       | If-Match                            | `204`; imagem nula é no-op      |

GET do workout retorna plano mínimo, timestamps e exercícios na ordem física. Os
tipos/limites/defaults são os publicados em `@dall-fit/types`: nomes 120/40,
25 workouts, 50 exercícios, números finitos, 16 body areas. Página 101 é inválida.
YouTube persiste só ID de 11 caracteres e deriva thumbnail no cliente. Imagem
pública expõe apenas URLs; keys, dimensões internas e original não atravessam HTTP.

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
10 MiB, 40 MP e ausência de animação, gera duas variantes e só então executa CAS.
Falha pré-commit remove novas keys; sucesso remove variantes antigas depois do
MongoDB. Exclusões coletam referências antes do CAS e limpam depois.

## Erros estáveis

`VALIDATION_ERROR`, `INVALID_YOUTUBE_REFERENCE`, `INVALID_EXERCISE_ORDER`,
`INVALID_EXERCISE_TYPE`, `AUTHENTICATION_REQUIRED`, `ADMIN_ACCESS_REQUIRED`,
`TRAINING_PLAN_NOT_FOUND`, `WORKOUT_NOT_FOUND`, `EXERCISE_NOT_FOUND`,
`WORKOUT_LIMIT_REACHED`, `EXERCISE_LIMIT_REACHED`,
`TRAINING_PLAN_SIZE_LIMIT_REACHED`, `TRAINING_PLAN_VERSION_CONFLICT`,
`IMAGE_TOO_LARGE`, `UNSUPPORTED_IMAGE_TYPE`, `PRECONDITION_REQUIRED`,
`YOUTUBE_VALIDATION_UNAVAILABLE` e `IMAGE_UPLOAD_FAILED`. Todo erro segue
`ApiError` e `x-request-id`.

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

Lista é determinística, criação retorna v0/ETag e detalhe contém cinco exercícios
apenas como `exerciseCount`.

### Cenário 2 — mutações existentes com If-Match

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
  --header 'if-match: "training-plan:64b000000000000000000001:0"' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt \
  --data '{"name":"Plano atualizado"}' \
&& curl --include --request POST http://localhost:4000/global/training-plans/64b000000000000000000001/workouts \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'if-match: "training-plan:64b000000000000000000001:1"' \
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
  --header 'if-match: "training-plan:64b000000000000000000001:0"' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit28.txt --data '{"name":"Treino editado"}' \
&& curl --include --request POST http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'if-match: "training-plan:64b000000000000000000001:1"' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit28.txt --data '{"type":"pause"}' \
&& curl --include --request PATCH http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises/64b000000000000000000205 \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'if-match: "training-plan:64b000000000000000000001:2"' --header "x-csrf-token: ${CSRF_TOKEN}" \
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
  --header 'if-match: "training-plan:64b000000000000000000001:0"' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit28.txt \
  --data '{"exerciseIds":["64b000000000000000000205","64b000000000000000000204","64b000000000000000000203","64b000000000000000000202","64b000000000000000000201"]}' \
&& curl --include --request DELETE http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises/64b000000000000000000201 \
  --header 'origin: http://localhost:3000' --header 'if-match: "training-plan:64b000000000000000000001:0"' \
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
  --header 'origin: http://localhost:3000' --header 'if-match: "training-plan:64b000000000000000000001:0"' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt \
  --form 'file=@./fixtures/exercise.jpg;type=image/jpeg' \
&& curl --include --request DELETE http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101/exercises/64b000000000000000000202/image \
  --header 'origin: http://localhost:3000' --header 'if-match: "training-plan:64b000000000000000000001:1"' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt
```

Requer o Blob público `gvi3tyf5ckqiqlak` configurado e arquivo fictício local. PUT
grava as variantes sob `exercise-images/` e devolve somente duas URLs; DELETE
preserva o exercício e remove a associação.

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
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit28.txt --data '{"name":"Sem If-Match"}' \
&& curl --include http://localhost:4000/global/training-plans/64b000000000000000000002 --cookie /tmp/dall-fit-fit28.txt \
&& curl --include 'http://localhost:4000/global/training-plans?page=101' --cookie /tmp/dall-fit-fit28.txt
```

As respostas são respectivamente `428`, `404 TRAINING_PLAN_NOT_FOUND` e
`400 VALIDATION_ERROR`. Seeds/E2E de fronteira exercitam 25/50 e confirmam
`$bsonSize < 12 MiB` sem depender do limite físico de 16 MiB.

## Testes e operação

`training-plan-etag.spec.ts`, services/commands e adapters cobrem parser, defaults,
validação YouTube, processamento/compensação de imagem, CAS, no-op e falhas. O E2E
serial usa Nest, MongoDB e Redis efêmeros e valida transporte, ownership, schema,
índice, limites e BSON. Aplicação de índice: `pnpm -C api indexes:apply` com
confirmação explícita. Reconciliação: `pnpm -C api images:reconcile`, dry-run por
padrão.
