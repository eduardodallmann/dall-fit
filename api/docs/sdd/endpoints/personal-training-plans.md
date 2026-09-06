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
| `POST /training-plans`                   | plano próprio v0 + entrada, sem ativar          |
| `POST /training-plans/global-references` | vínculo único ao global                         |
| `PUT /training-plans/active`             | substitui atomicamente o único radio ativo      |
| `GET /training-plans/:catalogEntryId`    | detalhe resolvido, source e versão              |
| `PATCH /training-plans/:catalogEntryId`  | atualiza somente plano próprio                  |
| `DELETE /training-plans/:catalogEntryId` | exclui próprio ou desvincula referência         |
| `POST .../workouts` e mutações aninhadas | editor próprio com CAS                          |
| `GET .../workouts/:workoutId`            | conteúdo próprio ou global resolvido            |

Os endpoints aninhados de workout, exercícios, ordem e imagem possuem os mesmos
bodies, limites, tipos, status, `X-Resource-Version`, URLs privadas e regras de CAS
descritos em [`global-training-plans.md`](global-training-plans.md). A diferença é
ownership pessoal; uma referência aceita GET, mas qualquer mutação retorna `403
GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`. IDs fora do catálogo da sessão são
indistinguíveis e retornam `TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND`.

DELETE de item próprio exige versão; DELETE de referência não exige, pois remove
somente o vínculo. Ambos limpam a seleção ativa sem escolher fallback. Repetir uma
referência retorna `409 GLOBAL_TRAINING_PLAN_REFERENCE_DUPLICATE`. Ativação nunca
aceita job, item de outra pessoa ou referência cujo global foi excluído.

Ao excluir plano próprio, workout ou exercício, `TrainingPlanService` solicita ao
`TrainingLoadProfileService` a remoção dos perfis de carga correspondentes. A
limpeza acontece depois da mutation canônica do plano e não altera o histórico de
execuções já finalizadas.

## Persistência e branches

`training_plan_catalog_entries` possui unicidade por pessoa/plano próprio e por
pessoa/global. `training_plan_active_selections` possui índice único por pessoa e
zero ou um documento. A lista combina catálogo válido e jobs visíveis, ordena por
criação e pagina 20; globais excluídos são removidos pela limpeza administrativa.
Leituras de referência consultam sempre a árvore global atual.

Criação própria compensa a árvore se falhar ao criar catálogo. Exclusão própria
remove a árvore e suas imagens; desvincular preserva o global. Erros estáveis
adicionais: `TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND`,
`GLOBAL_TRAINING_PLAN_REFERENCE_DUPLICATE` e
`GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`.

A confirmação do assistente reutiliza esta modelagem por
`AssistantTrainingPlanMaterializationService`: reserva `trainingPlanId` e
`catalogEntryId`, faz `set-on-insert` do aggregate embutido completo e depois da
entrada `owned`. O plano nasce v0, inativo e invisível até o catálogo existir;
provider, prompt e triagem não são copiados. Exercícios de duração gerados pelo
assistente preservam minutos, instrução curta e vídeo demonstrativo opcional. O
fluxo HTTP proprietário está em
[`training-plan-assistant.md`](training-plan-assistant.md).

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
  --data '{"catalogEntryId":"74b000000000000000000001"}'
```

A lista contém o próprio e a referência na mesma coleção; a resposta final aponta
somente para `...001`. Nenhum item seria ativado só pela criação.

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

## Cobertura

E2E em `api/test/training-plan.e2e-spec.ts` cobre pessoa comum, ownership,
catálogo misto, referência read-only, seleção, criação, desvinculação e criação de
workout próprio pelo `catalogEntryId`.
Unitários dos services usam repositories e starter substituídos por mocks.
