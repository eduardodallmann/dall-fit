# Endpoints administrativos de planos de treino globais

> Documentação viva das sete operações inseparáveis do recurso global.

## Objetivo funcional

- Problema resolvido: listar e manter planos globais e seus workouts embutidos.
- Ator/consumidor: UI administrativa, exclusivamente para pessoa com
  `isAdmin: true`.
- Resultado esperado: persistir documentos em `training_plans`, sem expor owner ou
  exercícios, e responder com contratos compartilhados estáveis.
- Módulo proprietário: `TrainingPlanModule`.
- Fluxo relacionado:
  `../../../../docs/sdd/flows/gestao-planos-treino-globais.md`.

## Referências técnicas

| Papel      | Símbolo/arquivo                                                                                               | Responsabilidade                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Proteção   | [`AdminOnly`](../../../src/auth/decorators/admin-only.ts)                                                     | executa sessão e autorização administrativa                  |
| Controller | [`GlobalTrainingPlansController`](../../../src/training-plan/controllers/global-training-plans.controller.ts) | valida transporte, registra e chama o command proprietário   |
| Entrada    | [`training-plan.dto.ts`](../../../src/training-plan/dto/training-plan.dto.ts)                                 | valida página, IDs, bodies, trim e limites                   |
| Commands   | [`commands/`](../../../src/training-plan/commands)                                                            | um orquestrador por operação e montagem da response          |
| Service    | [`TrainingPlanService`](../../../src/training-plan/services/training-plan.service.ts)                         | aplica ownership global, page size, nomes padrão e not-found |
| Port       | [`TrainingPlanRepository`](../../../src/training-plan/repositories/training-plan.repository.ts)               | contrato de persistência independente do MongoDB             |
| Adapter    | [`MongoTrainingPlanRepository`](../../../src/training-plan/repositories/mongo-training-plan.repository.ts)    | consultas, projeções e mutações atômicas                     |
| Schema     | [`training-plan.schema.ts`](../../../src/training-plan/repositories/training-plan.schema.ts)                  | coleção, subdocumentos e índice                              |
| Saídas     | [`contracts.ts`](../../../../packages/types/src/contracts.ts)                                                 | responses compartilhadas com a UI                            |

## Contrato HTTP resumido

Todas as operações exigem o cookie `dall_fit_session` e `isAdmin: true`. Sessão
ausente/inválida responde `401 AUTHENTICATION_REQUIRED`; pessoa comum responde
`403 ADMIN_ACCESS_REQUIRED` antes do controller. Propriedades adicionais, IDs,
query e bodies inválidos respondem `400 VALIDATION_ERROR` com detalhes vazios.

| Método e path                                                       | Entrada                       | Sucesso | Saída                           |
| ------------------------------------------------------------------- | ----------------------------- | ------- | ------------------------------- |
| `GET /global/training-plans?page=1`                                 | `page` inteiro >= 1, padrão 1 | `200`   | coleção com `pageSize: 20`      |
| `POST /global/training-plans`                                       | nome e descrição              | `201`   | resumo criado                   |
| `GET /global/training-plans/:trainingPlanId`                        | ID MongoDB                    | `200`   | detalhe com resumos de workouts |
| `PATCH /global/training-plans/:trainingPlanId`                      | nome e/ou descrição           | `200`   | resumo atualizado               |
| `DELETE /global/training-plans/:trainingPlanId`                     | ID MongoDB                    | `204`   | sem body                        |
| `POST /global/training-plans/:trainingPlanId/workouts`              | body ausente ou `{}`          | `201`   | workout criado                  |
| `DELETE /global/training-plans/:trainingPlanId/workouts/:workoutId` | dois IDs MongoDB              | `204`   | sem body                        |

`name` recebe trim e exige 1 a 120 caracteres; `description` recebe trim e exige 1
a 1000. PATCH vazio é inválido. Nomes não são únicos. Um ID válido inexistente ou
de plano pessoal responde `404 TRAINING_PLAN_NOT_FOUND`. Ao excluir workout de um
plano global existente, ID ausente responde `404 WORKOUT_NOT_FOUND`.

As datas são ISO 8601. Resumos de lista nunca incluem workouts. O detalhe inclui
`workouts: [{ id, name, exerciseCount }]`; não inclui `ownerPersonId` nem
`exercises`. GET é seguro; PATCH/DELETE não são garantidos como idempotentes no
sentido de resposta, pois repetir depois da exclusão produz not-found.

## Fluxo completo

### 1. Entrada e proteção — `GlobalTrainingPlansController`

`AdminOnly` executa `SessionAuthGuard` e `AdminAuthorizationGuard` nessa ordem. O
pipe global transforma query, aplica whitelist e rejeita propriedades extras com o
erro estável. O controller registra somente IDs e nomes de campos, chama exatamente
um command e devolve o resultado sem acessar repository.

### 2. Orquestração — commands proprietários

- `ListGlobalTrainingPlansCommand` recebe a página, chama `listGlobal` e monta
  `data`, `page`, `pageSize: 20` e `total`.
- `CreateGlobalTrainingPlanCommand` chama `createGlobal` e envolve o resumo em
  `{ data }`.
- `GetGlobalTrainingPlanCommand` chama `getGlobal` e envolve o detalhe.
- `UpdateGlobalTrainingPlanCommand` encaminha somente os campos validados e envolve
  o resumo atualizado.
- `DeleteGlobalTrainingPlanCommand` e `DeleteTrainingPlanWorkoutCommand` aguardam a
  conclusão e não montam body.
- `CreateTrainingPlanWorkoutCommand` solicita o workout com nome padrão e envolve
  seu resumo.

Cada command registra entrada, retorno do service e saída. Não acessa o adapter.

### 3. Regra e persistência — `TrainingPlanService` e repository

`TrainingPlanService` fixa 20 itens, prepara criação com `ownerPersonId: null` e
usa `Novo treino` no workout criado. Ele transforma ausência do plano e distinção
da exclusão de workout nos erros funcionais estáveis.

`MongoTrainingPlanRepository` sempre filtra operações globais por
`ownerPersonId: null`:

- lista ordena `createdAt` decrescente, aplica skip/limit e conta somente globais;
- detalhe usa projeção MongoDB para calcular `$size` dos exercícios sem retorná-los;
- criação materializa workouts vazios;
- edição e exclusão combinam ID e owner no mesmo filtro;
- criação de workout gera `ObjectId` antes de um único `$push`, com exercícios
  vazios;
- exclusão usa `$pull` por plano e workout; se nada for removido, consulta a
  existência do plano para distinguir os dois not-found.

MongoDB é a única dependência. Redis, mensageria, serviço externo e transação não
participam.

### 4. Saída e falhas

Commands montam os tipos de `@dall-fit/types`, controllers registram uma
representação sanitizada e devolvem o objeto original. Falhas técnicas atravessam
o tratamento global como erro genérico, sem query, documento ou stack. Não há
efeito parcial compensável: cada alteração do plano/workout é uma operação MongoDB
atômica sobre um documento.

## Mapa de caminhos possíveis

| Caminho              | Gatilho                          | Sequência interna                                 | Resultado                     | Efeito                |
| -------------------- | -------------------------------- | ------------------------------------------------- | ----------------------------- | --------------------- |
| lista                | página válida                    | controller → command → service → find/count       | `200`                         | nenhum                |
| cria plano           | body válido                      | controller → command → service → create           | `201`                         | documento global      |
| detalhe              | plano global                     | controller → command → service → aggregate        | `200`                         | nenhum                |
| edita                | plano global e PATCH não vazio   | controller → command → service → findOneAndUpdate | `200`                         | campos alterados      |
| exclui plano         | plano global                     | controller → command → service → findOneAndDelete | `204`                         | árvore removida       |
| cria workout         | plano global                     | controller → command → service → `$push`          | `201`                         | subdocumento vazio    |
| exclui workout       | IDs pertencentes                 | controller → command → service → `$pull`          | `204`                         | subdocumento removido |
| plano oculto/ausente | owner não nulo ou ID inexistente | service interrompe após repository                | `404 TRAINING_PLAN_NOT_FOUND` | nenhum                |
| workout ausente      | plano existe, workout não        | service distingue após repository                 | `404 WORKOUT_NOT_FOUND`       | nenhum                |
| validação            | entrada inválida                 | pipe interrompe antes do command                  | `400 VALIDATION_ERROR`        | nenhum                |

## Cenários detalhados

Todos os exemplos locais usam o bypass restrito de autenticação. O seed indicado
cria a administradora e as fixtures com IDs estáveis. O ID do plano global é
`64b000000000000000000001`, o pessoal é `64b000000000000000000002` e o workout é
`64b000000000000000000101`.

### Cenário 1 — Listar a primeira página

**Seed**

```bash
pnpm -C api seed -- training-plans:list
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":"https://example.test/admin-avatar.png"}' \
&& curl --request GET \
  --url 'http://localhost:4000/global/training-plans?page=1' \
  --cookie /tmp/dall-fit-training-plan-cookie.txt
```

- Then: `200`, apenas planos globais, ordem decrescente, página 1 e page size 20.

### Cenário 2 — Criar plano com normalização

**Seed**

```bash
pnpm -C api seed -- training-plans:create
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --request POST --url http://localhost:4000/global/training-plans \
  --header 'content-type: application/json' --cookie /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"name":"  Plano corrida  ","description":"  Preparação global.  "}'
```

- Then: `201` com strings normalizadas; persiste owner nulo e workouts vazios.

### Cenário 3 — Consultar detalhe projetado

**Seed**

```bash
pnpm -C api seed -- training-plans:detail
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --request GET \
  --url http://localhost:4000/global/training-plans/64b000000000000000000001 \
  --cookie /tmp/dall-fit-training-plan-cookie.txt
```

- Then: `200`, workout `Treino A` com `exerciseCount: 1`, sem exercícios/owner.

### Cenário 4 — Editar plano parcialmente

**Seed**

```bash
pnpm -C api seed -- training-plans:update
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --request PATCH \
  --url http://localhost:4000/global/training-plans/64b000000000000000000001 \
  --header 'content-type: application/json' --cookie /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"name":"Plano global atualizado"}'
```

- Then: `200`; atualiza somente o nome e mantém a descrição.

### Cenário 5 — Criar workout

**Seed**

```bash
pnpm -C api seed -- training-plans:create-workout
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --request POST \
  --url http://localhost:4000/global/training-plans/64b000000000000000000001/workouts \
  --header 'content-type: application/json' --cookie /tmp/dall-fit-training-plan-cookie.txt \
  --data '{}'
```

- Then: `201` com ID MongoDB real, nome `Novo treino` e `exerciseCount: 0`.

### Cenário 6 — Excluir workout

**Seed**

```bash
pnpm -C api seed -- training-plans:delete-workout
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --request DELETE \
  --url http://localhost:4000/global/training-plans/64b000000000000000000001/workouts/64b000000000000000000101 \
  --cookie /tmp/dall-fit-training-plan-cookie.txt
```

- Then: `204`; remove apenas o workout indicado.

### Cenário 7 — Excluir plano e sua árvore

**Seed**

```bash
pnpm -C api seed -- training-plans:delete
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --request DELETE \
  --url http://localhost:4000/global/training-plans/64b000000000000000000001 \
  --cookie /tmp/dall-fit-training-plan-cookie.txt
```

- Then: `204`; documento e árvore embutida deixam de existir.

### Cenário 8 — Plano pessoal não é acessível como global

**Seed**

```bash
pnpm -C api seed -- training-plans:not-found
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --request GET \
  --url http://localhost:4000/global/training-plans/64b000000000000000000002 \
  --cookie /tmp/dall-fit-training-plan-cookie.txt
```

- Then: `404 TRAINING_PLAN_NOT_FOUND`; nenhum dado pessoal é exposto.

### Cenário 9 — PATCH vazio

**Seed**

```bash
pnpm -C api seed -- training-plans:update
```

**cURL**

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-training-plan-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --request PATCH \
  --url http://localhost:4000/global/training-plans/64b000000000000000000001 \
  --header 'content-type: application/json' --cookie /tmp/dall-fit-training-plan-cookie.txt \
  --data '{}'
```

- Then: `400 VALIDATION_ERROR`; command e persistência não executam.

## Regras de negócio cobertas por testes

| Regra                                   | Unitário                        | E2E                         | Fixture                  |
| --------------------------------------- | ------------------------------- | --------------------------- | ------------------------ |
| page size, owner nulo e nome padrão     | `training-plan.service.spec.ts` | `training-plan.e2e-spec.ts` | 21 globais + pessoal     |
| projeção e contagem sem exercícios      | service/repository por contrato | `training-plan.e2e-spec.ts` | workout com 2 exercícios |
| CRUD e cascata documental               | service                         | `training-plan.e2e-spec.ts` | plano global             |
| criação e remoção atômica de workout    | service                         | `training-plan.e2e-spec.ts` | workouts embutidos       |
| plano pessoal/missing e workout missing | service                         | `training-plan.e2e-spec.ts` | IDs distintos            |
| autenticação, admin e validação         | guards/DTOs                     | `training-plan.e2e-spec.ts` | pessoa comum/admin       |
| índice owner/data                       | não se aplica                   | `training-plan.e2e-spec.ts` | schema real              |

## Fora do comportamento atual

- planos pessoais, clonagem, busca, filtros e page size variável;
- edição ou consulta isolada de workout;
- exercícios, ordenação, transações, Redis, auditoria e soft delete.
