# Endpoints `training-plans`

## Objetivo e hierarquia

Estas operações autenticadas mantêm o catálogo da pessoa derivada da sessão. A
fronteira nunca aceita owner ou modo global do cliente. O caminho é
`PersonalTrainingPlansController` → `PersonalTrainingPlansCommand` →
`PersonalTrainingPlanService`; catálogo/seleção usam
`MongoPersonalTrainingPlanRepository`, enquanto árvores próprias reutilizam
`TrainingPlanService` e `MongoTrainingPlanRepository` com `ownerPersonId` tipado.
Mídia reutiliza `ExerciseImageService` e `BlobStorageService`.

Entradas `owned` apontam para árvore pertencente à pessoa e são editáveis. Entradas
`global-reference` apontam para o global vivo e são somente leitura. A API decide
o source pela entrada persistida; não existe capability ou flag confiada ao body.

## Contratos

| Método e path                            | Resultado principal                             |
| ---------------------------------------- | ----------------------------------------------- |
| `GET /training-plans?page=1`             | página unificada de planos e jobs não terminais |
| `GET /training-plans/library?page=1`     | globais com resumo e bloqueio local de clone    |
| `GET /training-plans/exercise-library`   | exercícios globais agrupados, busca e área      |
| `POST .../workouts/:workoutId/exercises/copy` | cópia independente de um lote com CAS       |
| `POST /training-plans`                   | plano próprio v0 + entrada, sem ativar          |
| `POST /training-plans/global-references` | vínculo único ao global                         |
| `PUT /training-plans/active`             | define o estado de uma entrada; máximo de cinco |
| `GET /training-plans/:catalogEntryId`    | detalhe resolvido, source e versão              |
| `PATCH /training-plans/:catalogEntryId`  | atualiza somente plano próprio                  |
| `DELETE /training-plans/:catalogEntryId` | exclui próprio ou desvincula referência         |
| `POST .../workouts` e mutações aninhadas | editor próprio com CAS                          |
| `POST .../workouts/:workoutId/duplicate` | cópia completa no mesmo plano próprio com CAS |
| `GET .../workouts/:workoutId`            | conteúdo próprio ou global resolvido            |

Os endpoints aninhados de workout, exercícios, ordem e imagem possuem os mesmos
bodies, limites, tipos, status, `X-Resource-Version`, URLs privadas e regras de CAS
descritos em [`global-training-plans.md`](global-training-plans.md). A diferença é
ownership pessoal; uma referência aceita GET, mas qualquer mutação retorna `403
GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`. IDs fora do catálogo da sessão são
indistinguíveis e retornam `TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND`.

A [biblioteca de exercícios](exercise-library.md) possui controller/command
próprios dentro do mesmo módulo. A leitura não exige administração; a cópia exige
destino próprio, preserva a ordem da seleção e grava o conjunto inteiro com uma
única versão. A documentação proprietária descreve agrupamento, filtros, mídia,
compensação, resultado incerto e seus cenários reproduzíveis.

DELETE de item próprio exige versão; DELETE de referência não exige, pois remove
somente o vínculo. Ambos removem a entrada do conjunto ativo sem escolher fallback. Repetir uma
referência retorna `409 GLOBAL_TRAINING_PLAN_REFERENCE_DUPLICATE`. Ativação nunca
aceita job, item de outra pessoa ou referência cujo global foi excluído.

Ao excluir plano próprio, workout ou exercício, `TrainingPlanService` solicita ao
`TrainingLoadProfileService` a remoção dos perfis de carga correspondentes. A
limpeza acontece depois da mutation canônica do plano e não altera o histórico de
execuções já finalizadas.

## Persistência e branches

`training_plan_catalog_entries` possui unicidade por pessoa/plano próprio e por
pessoa/global. `training_plan_active_selections` possui índice único por pessoa e
um array de até cinco `catalogEntryIds` únicos. O repository migra preguiçosamente
o campo singular legado e usa `$addToSet` condicionado ao quinto índice para
impedir seis seleções sob concorrência. A lista devolve `activeCount` além do
booleano de cada linha. A lista combina catálogo válido e jobs visíveis, ordena por
criação e pagina 20; globais excluídos são removidos pela limpeza administrativa.
Leituras de referência consultam sempre a árvore global atual.

Criação própria compensa a árvore se falhar ao criar catálogo. Exclusão própria
remove a árvore e suas imagens; desvincular preserva o global. Erros estáveis
adicionais: `TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND`,
`GLOBAL_TRAINING_PLAN_REFERENCE_DUPLICATE` e
`GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`. Uma sexta ativação retorna `409
ACTIVE_TRAINING_PLAN_LIMIT_REACHED` com `details.limit=5`; desativação é
idempotente e pode deixar o conjunto vazio.

A confirmação do assistente reutiliza esta modelagem por
`AssistantTrainingPlanMaterializationService`: reserva `trainingPlanId` e
`catalogEntryId`, faz `set-on-insert` do aggregate embutido completo e depois da
entrada `owned`. O plano nasce v0, inativo e invisível até o catálogo existir;
provider, prompt e triagem não são copiados. Exercícios de duração gerados pelo
assistente preservam minutos, instrução curta e vídeo demonstrativo opcional. O
fluxo HTTP proprietário está em
[`training-plan-assistant.md`](training-plan-assistant.md).

Todos os endpoints exigem exatamente um transporte de sessão: cookie Web ou
`Authorization: Bearer` nativo. Os dois juntos retornam `400
AUTH_TRANSPORT_AMBIGUOUS`. Mutações Web exigem origem e CSRF; uma sessão nativa já
verificada dispensa ambos.

## Cenários reproduzíveis

### Cenário 1 — catálogo misto e seleção ativa

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:catalog
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit58.txt \
  --data '{"googleSubject":"google-person-001","name":"Regular Runner","email":"regular.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit58.txt | jq -r '.data.token')" \
&& curl --include 'http://localhost:4000/training-plans?page=1' --cookie /tmp/dall-fit-fit58.txt \
&& curl --include --request PUT http://localhost:4000/training-plans/active \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit58.txt \
  --data '{"active":true,"catalogEntryId":"74b000000000000000000001"}'
```

A lista contém o próprio e a referência na mesma coleção; a resposta final contém
o array canônico de IDs ativos. Nenhum item é ativado só pela criação.

### Cenário 2 — referência viva e somente leitura

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:reference
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit58.txt \
  --data '{"googleSubject":"google-person-001","name":"Regular Runner","email":"regular.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit58.txt | jq -r '.data.token')" \
&& curl --include http://localhost:4000/training-plans/74b000000000000000000002 \
  --cookie /tmp/dall-fit-fit58.txt \
&& curl --include --request PATCH http://localhost:4000/training-plans/74b000000000000000000002 \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit58.txt --data '{"name":"Não permitido"}'
```

GET retorna `source: global-reference`; PATCH retorna 403 sem write. DELETE do
mesmo catálogo, sem version header, remove apenas referência e seleção.

### Cenário 3 — criar e editar plano próprio

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:catalog
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit58.txt \
  --data '{"googleSubject":"google-person-001","name":"Regular Runner","email":"regular.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit58.txt | jq -r '.data.token')" \
&& curl --silent --show-error --request POST http://localhost:4000/training-plans \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit58.txt \
  --data '{"name":"Meu plano","description":"Treino pessoal."}' \
  --dump-header /tmp/dall-fit-fit58-created-plan.headers \
  --output /tmp/dall-fit-fit58-created-plan.json \
&& CATALOG_ENTRY_ID="$(jq -r '.data.catalogEntryId' /tmp/dall-fit-fit58-created-plan.json)" \
&& curl --include --request POST "http://localhost:4000/training-plans/${CATALOG_ENTRY_ID}/workouts" \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit58.txt --data '{}'
```

O primeiro request retorna uma entrada `owned`, v0 e inativa. O segundo usa o
`catalogEntryId`, cria `Novo treino` e retorna a versão 1 no header. As demais
mutations aninhadas usam `X-Resource-Version` exatamente como no editor global;
na validação prévia das árvores próprias, o adapter Mongo converte o owner da
sessão para `ObjectId` explicitamente porque pipelines de agregação não aplicam o
casting automático das queries Mongoose.

## Duplicação de treino próprio

`POST /training-plans/:catalogEntryId/workouts/:workoutId/duplicate` aceita
somente `{}` e exige `X-Resource-Version`. Usa os mesmos guards de sessão,
CSRF/canal, termos e quota do editor. Retorna `201` com
`CreateTrainingPlanWorkoutResponse` e a versão incrementada no header. Não há
contrato de entrada com conteúdo ou owner fornecido pelo cliente.

O treino é acrescentado ao final do mesmo plano com sufixo ` (cópia)`; o prefixo
do nome é limitado para que o resultado caiba em 120 caracteres. Recebe novos IDs
de treino e exercícios e timestamps atuais. Todos os tipos, parâmetros e ordem
são preservados, inclusive imagem nula e instrução/vídeo opcional de duração.
Histórico, perfis de carga, sessões e seleção ativa não são copiados ou alterados.

### Hierarquia e atomicidade

1. [`PersonalTrainingPlansController.duplicateWorkout`](../../../src/training-plan/controllers/personal-training-plans.controller.ts)
   valida params, body vazio e versão e chama o command.
2. [`PersonalTrainingPlansCommand.duplicateWorkout`](../../../src/training-plan/commands/personal-training-plans.command.ts)
   chama `PersonalTrainingPlanService.resolveOwnedTrainingPlanId`. Catálogo
   alheio/ausente retorna `404 TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND`; referência
   retorna `403 GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`, antes de copiar mídia.
3. [`WorkoutDuplicationService.prepare`](../../../src/training-plan/services/workout-duplication.service.ts)
   usa `TrainingPlanRepository.inspectTarget` para verificar plano, treino, versão,
   quantidade e tamanho; depois captura o workout e confirma novamente sua versão.
   Ausência retorna `TRAINING_PLAN_NOT_FOUND` ou `WORKOUT_NOT_FOUND`; versão
   divergente retorna `412 TRAINING_PLAN_VERSION_CONFLICT`; 25 treinos retorna
   `409 WORKOUT_LIMIT_REACHED`; limite BSON retorna
   `409 TRAINING_PLAN_SIZE_LIMIT_REACHED`. Somente então prepara os novos IDs.
4. O command chama `ExerciseImageService.copyExercises` com orçamento de 45 s.
   Imagens usam o mesmo serviço de cópia da biblioteca: variantes privadas com
   destinos novos, ETag quando disponível e concorrência limitada. Falha/timeout
   compensa variantes novas e retorna `503 EXERCISE_IMAGE_COPY_FAILED`.
5. `WorkoutDuplicationService.commit` entrega o workout completo ao
   [`MongoTrainingPlanRepository.appendWorkout`](../../../src/training-plan/repositories/mongo-training-plan.repository.ts).
   Um único update exige owner, origem, versão, menos de 25 treinos e BSON
   resultante abaixo de 12 MiB. Acrescenta tudo e incrementa uma vez; não existe
   treino parcialmente visível. Filtro rejeitado é reinspecionado para distinguir
   ausência, conflito, quantidade e tamanho. Rejeição conhecida compensa somente
   imagens novas; o original permanece intacto.
6. Falha técnica depois do envio ao MongoDB pode significar commit confirmado sem
   resposta. O command preserva os assets e retorna
   `503 WORKOUT_DUPLICATION_RESULT_UNCERTAIN`; exige releitura antes de nova
   tentativa. Reconciliação existente remove órfãos depois da janela de proteção.
   Não há retry automático nem chave idempotente: cada versão aceita cria uma
   cópia. Concorrentes com a mesma versão têm no máximo um sucesso.
7. O command monta o resumo público e o controller devolve body/header, sem keys
   internas de imagem. MongoDB/Redis indisponíveis antes do commit seguem os erros
   transversais; não autorizam escrita nem retry automático.

### Cenário 4 — duplicar treino completo

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:duplicate-workout
```

**cURL completo**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/74b000000000000000000001/workouts/64b000000000000000000101/duplicate \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --header 'x-resource-version: 0' --data '{}'
```

Retorna cópia com dois exercícios, nome `Treino de exemplo (cópia)` e versão 1.
Repetir exatamente o cURL retorna `412`, sem adicionar outra cópia.

### Cenário 5 — limite de treinos

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:duplicate-workout-limit
```

**cURL completo**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/74b000000000000000000001/workouts/64b000000000000000000101/duplicate \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --header 'x-resource-version: 0' --data '{}'
```

Retorna `409 WORKOUT_LIMIT_REACHED`, sem copiar mídia ou alterar versão.

### Cenário 6 — tamanho resultante excederia o limite

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:duplicate-workout-size
```

**cURL completo**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/74b000000000000000000001/workouts/64b000000000000000000101/duplicate \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --header 'x-resource-version: 0' --data '{}'
```

O seed sintético prepara um documento legado abaixo de 12 MiB. O CAS recusa o
append por `409 TRAINING_PLAN_SIZE_LIMIT_REACHED`, mantendo treino e versão.

### Cenário 7 — mídia de origem indisponível

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:duplicate-workout-image-failure
```

**cURL completo**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/74b000000000000000000001/workouts/64b000000000000000000101/duplicate \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --header 'x-resource-version: 0' --data '{}'
```

As keys fictícias não existem no Blob. Responde
`503 EXERCISE_IMAGE_COPY_FAILED`, sem workout novo e com compensação best-effort;
falha da compensação fica para a reconciliação existente.

### Cenário 8 — ausência e contrato inválido

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:duplicate-workout
```

**cURLs completos**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/74b000000000000000000001/workouts/64b000000000000000000999/duplicate \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --header 'x-resource-version: 0' --data '{}'
curl --include --request POST \
  http://localhost:4000/training-plans/74b000000000000000000001/workouts/64b000000000000000000101/duplicate \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --data '{}'
```

O primeiro retorna `404 WORKOUT_NOT_FOUND`; o segundo,
`428 PRECONDITION_REQUIRED`. IDs/body/header malformados retornam
`400 VALIDATION_ERROR`, sem efeitos.

### Cenário 9 — referência permanece somente leitura

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:duplicate-workout
```

**cURL completo**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/74b000000000000000000002/workouts/64b000000000000000000101/duplicate \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'content-type: application/json' --header 'x-resource-version: 0' --data '{}'
```

Retorna `403 GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`, sem mídia ou alteração do
global. Trocar o catálogo por ID inexistente/alheio retorna
`404 TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND`, sem revelar o proprietário.

## Cobertura

E2E em `api/test/training-plan.e2e-spec.ts` cobre pessoa comum, ownership,
catálogo misto, referência read-only, seleção, criação, desvinculação e criação de
workout próprio pelo `catalogEntryId`.
Unitários dos services usam repositories e starter substituídos por mocks.
Duplicação tem unitários de preparação/orquestração e E2E para os cinco tipos,
mídia independente, treino vazio, permissões, precondição, CAS concorrente,
limites, falha de Blob e exclusão do original sem afetar a cópia. Resultado
incerto usa falha controlada no unitário do command, sem flags de produção.

## Aceite de termos como precondição

Depois dos guards de sessão/permissão/CSRF/quota e antes dos pipes/controllers de
negócio, a política exige recibo da publicação vigente. Pendência responde
`403 TERMS_ACCEPTANCE_REQUIRED`; ausência de publicação, `503 TERMS_NOT_CONFIGURED`;
consulta necessária indisponível, `503 TERMS_UNAVAILABLE`. Sem efeitos no domínio
deste endpoint. Os [cenários reproduzíveis de termos](terms.md) são proprietários
dessa fronteira; os seeds de negócio preparam recibos sintéticos explicitamente,
sem transformá-los em efeito do login.
