# Endpoints `training-plan-clone-jobs`

## Objetivo e hierarquia

Persistem e controlam clonagens duráveis solicitadas pela pessoa autenticada.
`TrainingPlanCloneJobsController` chama `PersonalTrainingPlansCommand`, que chama
`PersonalTrainingPlanService`; o service captura snapshot via
`MongoPersonalTrainingPlanRepository` e agenda pelo
`HttpTrainingPlanCloneStarter`. O adapter descobre o Related Project, assina o
bridge e trata timeout sem executar clonagem na request.

| Método e path                                      | Entrada                  | Sucesso             |
| -------------------------------------------------- | ------------------------ | ------------------- |
| `POST /training-plan-clone-jobs`                   | `{globalTrainingPlanId}` | `202`, job queued   |
| `POST /training-plan-clone-jobs/:cloneJobId/retry` | `{}`                     | `202`, nova geração |
| `DELETE /training-plan-clone-jobs/:cloneJobId`     | nenhuma                  | `202`, cancelling   |

## Fluxo e estados

Start lê o global com imagens internas e captura o ETag de cada variante; uploads
novos já o possuem no documento e imagens legadas são resolvidas com `head` no
Blob por OIDC. A resolução é limitada a quatro imagens simultâneas. Só então cria
snapshot e job antes do HTTP. Um índice parcial impede outro job ativo da mesma pessoa/origem. O body assinado do
bridge contém somente ID e geração. Resposta 202 mantém `queued`; rejeição HTTP
definitiva marca `start-failed`; timeout/rede é ambíguo e mantém `queued`, pois o
Workflow pode ter aceitado. Em ambos os casos a API responde `503
TRAINING_PLAN_CLONE_SCHEDULING_UNAVAILABLE`, deixando a linha recuperável.

Cada imagem copiada recebe um `imageAssetId` opaco determinístico a partir do job e
do exercício. Thumbnail e display ficam em
`exercise-images/{imageAssetId}/{thumbnail|display}.webp`; a mesma geração ou um
retry reutiliza os pathnames e pode sobrescrever somente esses destinos. Snapshot
de origem e destinos confirmados de jobs não terminais também são referências
válidas para a reconciliação de mídia.

Retry é permitido em `failed` e `start-failed`, incrementa geração e reutiliza o
snapshot. Cancelamento de job em execução muda para `cancelling`; em falha também
redelivery o Workflow para executar compensação. Depois de `materializing`, a
finalização prevalece e cancelamento retorna conflito. Estados terminais deixam de
aparecer; plano concluído entra como `owned`, inativo e editável.

Erros: `TRAINING_PLAN_CLONE_JOB_DUPLICATE`,
`TRAINING_PLAN_CLONE_JOB_NOT_FOUND`, `TRAINING_PLAN_CLONE_JOB_STATE_CONFLICT` e
`TRAINING_PLAN_CLONE_SCHEDULING_UNAVAILABLE`.

## Cenário reproduzível — retry e cancelamento

**Seed**

```bash
pnpm -C api seed -- personal-training-plans:clone-job
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit58.txt \
  --data '{"googleSubject":"google-person-001","name":"Regular Runner","email":"regular.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit58.txt | jq -r '.data.token')" \
&& curl --include --request POST http://localhost:4000/training-plan-clone-jobs/84b000000000000000000001/retry \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit58.txt --data '{}'
```

Com API e Workflow locais ativos, a geração passa a 2 e o bridge recebe uma única
solicitação idempotente. Para reproduzir cancelamento, refaça o seed e use DELETE
no mesmo path sem `/retry`; o resultado é `202` e a compensação fica visível na
lista até o terminal.

## Cobertura

E2E da API substitui o starter HTTP e verifica persistência anterior ao disparo,
duplicidade, retry, cancelamento e falha. O projeto Workflow possui testes de
assinatura, lease, batch, finalização e compensação.
