# Endpoints `training`

## Objetivo e hierarquia

As operações autenticadas expõem a jornada de execução do plano ativo. A
hierarquia é [`TrainingController`](../../../src/training/controllers/training.controller.ts)
→ [`TrainingCommand`](../../../src/training/commands/training.command.ts) →
[`TrainingService`](../../../src/training/services/training.service.ts). O command
monta sempre `ApiResponse`; o service resolve o plano pelo
`PersonalTrainingPlanService`, mídia pelo `ExerciseImageService`, sessão pelo
`WorkoutSessionStore`, sugestões pelo `TrainingLoadProfileService` e histórico pelo
`WorkoutExecutionRepository`.

Redis é acessado apenas pelo store através de `RedisClientService`. MongoDB é
acessado pelos adapters `MongoWorkoutExecutionRepository` e
`MongoTrainingLoadProfileRepository`. DTOs estão em
[`training.dto.ts`](../../../src/training/dto/training.dto.ts), erros estáveis em
[`training.errors.ts`](../../../src/training/errors/training.errors.ts) e contratos
HTTP compartilhados em `@dall-fit/types`.

## Contratos HTTP

| Método e path                                   | Entrada                           | Sucesso e resultado                   |
| ----------------------------------------------- | --------------------------------- | ------------------------------------- |
| `GET /training`                                 | sem body                          | `200 TrainingOverviewResponse`        |
| `GET /training/workouts/:workoutId`             | MongoID                           | `200 TrainingWorkoutPreviewResponse`  |
| `POST /training/workouts/:workoutId/session`    | `{}`                              | `201 TrainingSessionResponse`         |
| `GET /training/session`                         | sem body                          | `200 TrainingSessionResponse`         |
| `DELETE /training/session`                      | sem body                          | `204`                                 |
| `PUT .../series/:seriesNumber/load`             | `{ loadKg }`                      | `200 TrainingSessionResponse`         |
| `POST .../series/:seriesNumber/complete`        | `{ loadKg }`                      | `201 TrainingSessionResponse`         |
| `POST .../series/complete-remaining`            | `{ loadsKg }`                     | `201 TrainingSessionResponse`         |
| `POST .../exercises/:exerciseId/timer`          | `{ kind }`                        | `201 TrainingSessionResponse`         |
| `POST /training/session/timer/resolve`          | `{ outcome }`                     | `201 TrainingSessionResponse`         |
| `POST .../exercises/:exerciseId/complete`       | `{}`                              | `201 TrainingSessionResponse`         |
| `POST .../exercises/:exerciseId/restart`        | `{}`                              | `201 TrainingSessionResponse`         |
| `POST /training/session/complete`               | `{ confirmIncomplete, timezone }` | `201 WorkoutExecutionSummaryResponse` |
| `GET /training/completions/:workoutExecutionId` | MongoID                           | `200 WorkoutExecutionSummaryResponse` |

Todos exigem sessão. Mutações exigem Origin e CSRF; as mutações de sessão exigem
`X-Resource-Version` inteiro, exceto iniciar e abandonar. Leitura e resposta de
mutation da sessão usam `Cache-Control: private, no-store` e devolvem a versão
canônica no mesmo header. Carga aceita `null` ou inteiro de 0 a 9999; a série pode
ser concluída com `null`. IDs, número de série de 1 a 100, arrays com até 100 itens,
enums e timezone IANA são validados antes dos efeitos.

Mutações frequentes têm limite padrão de 240 por minuto por sessão/IP; criação,
abandono e finalização têm 30 por minuto. A configuração está em
`RATE_LIMIT_TRAINING_MUTATION_*` e `RATE_LIMIT_TRAINING_LIFECYCLE_*`.

## Fluxos internos

### Listagem e prévia

`overview` consulta primeiro a sessão Redis. Se existir, usa o snapshot para não
misturar edições posteriores e marca seu workout como `in-progress`. Sem sessão,
resolve a seleção ativa, busca a última execução do plano e marca o workout
seguinte ciclicamente como `current`. Ausência de seleção retorna plano nulo e lista
vazia. A prévia exige workout pertencente ao plano ativo, lê os perfis da pessoa e
hidrata signed URLs somente na resposta; nenhuma URL temporária é persistida.

### Criação, leitura e abandono

`start` rejeita sessão existente, captura o plano/workout/exercícios, preenche
séries com as últimas cargas e cria snapshot v0 com `SET NX` e `PXAT` fixo de 24
horas. `getSession` renova somente a representação pública; se um timer já venceu,
resolve seu estado por CAS antes de responder. `abandon` lê a sessão e executa Lua
de delete condicionado ao `sessionId`, preservando uma eventual sessão substituta.

### Mutações versionadas

`TrainingService` lê o snapshot, valida tipo, ordem da série, carga e timer, e
entrega uma transformação ao store. O store compara `sessionId` e versão em Lua,
incrementa uma vez e preserva o `expiresAt`. Colisão retorna `409
WORKOUT_SESSION_VERSION_CONFLICT` sem merge ou retry. Um timer ativo bloqueia
outras mutações da execução.

Concluir uma série grava carga e conclusão atomicamente. Se ainda houver série,
cria descanso; concluir restantes grava todo o vetor de uma vez. `pause` e
`duration` criam timers pelos limites do exercício. Descanso aceita finalizar ou
pular; duração aceita finalizar ou cancelar; combinações incompatíveis retornam
`WORKOUT_TIMER_OUTCOME_INVALID`. Vídeo longo conclui diretamente. Reiniciar limpa a
conclusão do exercício e de suas séries sem apagar as cargas.

### Finalização e resumo

`completeSession` exige ausência de timer e confirmação quando há exercício
pendente. O service calcula duração, áreas, contagens e soma somente cargas
preenchidas. `MongoWorkoutExecutionRepository.begin` cria ou retoma por índice
único de pessoa + `sessionId` no estado `finalizing` e conserva o
`catalogEntryId` capturado no snapshot. Perfis de exercícios de série são
atualizados somente quando o exercício ainda pertence à árvore atual do plano;
vetor totalmente vazio remove o perfil. A execução passa a `completed`, a sessão
Redis é removida e o resumo semanal é calculado no timezone recebido. Repetição
após persistência encontra a mesma execução e evita duplicar o histórico. A leitura
de conclusão sempre filtra também por pessoa.

## Mapa de caminhos e erros

| Caminho                               | Gatilho                                          | Resultado                                                        | Efeitos            |
| ------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- | ------------------ |
| sem plano ativo                       | overview ou prévia                               | overview vazio ou `404 TRAINING_PLAN_ACTIVE_SELECTION_NOT_FOUND` | nenhum             |
| workout alheio                        | ID não pertence ao ativo                         | `404 TRAINING_WORKOUT_NOT_FOUND`                                 | nenhum             |
| sessão concorrente                    | iniciar com chave existente                      | `409 WORKOUT_SESSION_ALREADY_ACTIVE`                             | preserva existente |
| sessão ausente                        | leitura ou mutation                              | `404 WORKOUT_SESSION_NOT_FOUND`                                  | nenhum             |
| sessão expirada recentemente          | leitura ou mutation                              | `410 WORKOUT_SESSION_EXPIRED`                                    | nenhum             |
| versão obsoleta                       | CAS diverge                                      | `409 WORKOUT_SESSION_VERSION_CONFLICT`                           | nenhum             |
| carga inválida                        | decimal, negativa ou maior que 9999              | `400 WORKOUT_LOAD_INVALID` ou validação DTO                      | nenhum             |
| série/tipo inválido                   | alvo ausente, concluído ou operação incompatível | `404` ou `409` com código específico                             | nenhum             |
| timer incompatível                    | timer já ativo, ausente ou outcome inválido      | `404`, `409` ou `400`                                            | nenhum             |
| finalização incompleta não confirmada | `confirmIncomplete=false`                        | `409 WORKOUT_INCOMPLETE`                                         | sessão preservada  |
| snapshot maior que 1 MiB              | serialização                                     | `413 WORKOUT_SESSION_TOO_LARGE`                                  | nenhum write       |
| execução alheia/ausente               | leitura do resumo                                | `404 WORKOUT_EXECUTION_NOT_FOUND`                                | nenhum             |

Validação estrutural usa `400 VALIDATION_ERROR`; ausência do header de versão usa
`428 PRECONDITION_REQUIRED`. Falhas inesperadas de Redis ou MongoDB seguem o
contrato global `500 INTERNAL_SERVER_ERROR` com `requestId`.

## Cenários reproduzíveis

### Cenário 1 — listar, iniciar e concluir uma série sem carga

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:reference
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit70.txt \
  --data '{"googleSubject":"google-person-001","name":"Regular Runner","email":"regular.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit70.txt | jq -r '.data.token')" \
&& curl --include http://localhost:4000/training --cookie /tmp/dall-fit-fit70.txt \
&& curl --include --request POST http://localhost:4000/training/workouts/64b000000000000000000101/session \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit70.txt --data '{}' \
&& curl --include --request POST http://localhost:4000/training/session/exercises/64b000000000000000000201/series/1/complete \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit70.txt --data '{"loadKg":null}'
```

A sessão nasce v0; a última resposta conclui a primeira série sem exigir carga,
cria o descanso e devolve v1.

### Cenário 2 — conflito de versão

**Seed:** execute o cenário 1 para manter a sessão em v1.

**cURL completo**

```bash
curl --include --request PUT http://localhost:4000/training/session/exercises/64b000000000000000000201/series/2/load \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit70.txt --data '{"loadKg":20}'
```

A precondição obsoleta retorna `409 WORKOUT_SESSION_VERSION_CONFLICT` e não altera
a sessão. O consumidor deve refazer `GET /training/session`.

### Cenário 3 — carga decimal inválida

**Seed:** não se aplica — a validação de body acontece antes do command.

```bash
curl --include --request PUT http://localhost:4000/training/session/exercises/64b000000000000000000201/series/1/load \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit70.txt --data '{"loadKg":10.5}'
```

O DTO retorna `400 VALIDATION_ERROR`; Redis e MongoDB não são acessados.

## Regras de negócio cobertas por testes

| Regra                           | Unitário             | E2E                                   | Mock/fixture       |
| ------------------------------- | -------------------- | ------------------------------------- | ------------------ |
| plano ativo, início e sessão v0 | services existentes  | `training-plan.e2e-spec.ts`           | `training.ts`      |
| carga opcional e inteira        | DTO/service          | mesmo E2E combina `null` e `17`       | fixture de sessão  |
| descanso e CAS conflitante      | store/service        | resolve timer e força versão obsoleta | handler versionado |
| finalização, execução e perfil  | repositories/service | MongoDB + Redis efêmeros              | completion fixture |

## Fora do comportamento atual

- múltiplas sessões simultâneas por pessoa;
- merge de drafts concorrentes;
- persistência de signed URLs ou intervals;
- edição do plano a partir da rota de execução;
- histórico detalhado série a série além do resumo e do último perfil de cargas.
