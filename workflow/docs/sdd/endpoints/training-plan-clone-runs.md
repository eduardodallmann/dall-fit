# Endpoint `POST /internal/training-plan-clone-runs`

## Objetivo e contrato

Recebe da API uma solicitação autenticada para iniciar ou redeliver uma geração de
clone. O JSON contém somente `cloneJobId` MongoDB e `generation` positiva. Body
maior que 512 bytes retorna `413`; versão incompatível, `409`; autenticação
inválida, `401`; job ausente, `404`; estado terminal/conflitante, `409`; falha
interna antes da aceitação, `503`; aceitação idempotente, `202`.

## Hierarquia e fluxo

`training-plan-clone-runs.post.ts` lê o body bruto e headers, então
`BridgeAuthenticationService` valida versão, relógio, forma e HMAC. O handler cria
repository/serviços, chama `StartTrainingPlanCloneRunCommand`, que pede a
`TrainingPlanCloneService` uma lease de 30 segundos. Somente quem obtém a lease
chama `start(trainingPlanCloneWorkflow, ...)`; redelivery concorrente apenas
confirma a aceitação. A runtime registra o `workflowRunId` no primeiro step.

## Exemplo local

Não há seed HTTP próprio: o job precisa ser criado pela API com
`personal-training-plans:clone-job`, e a assinatura depende do timestamp e do
segredo local. O teste de contrato em
`bridge-authentication.service.spec.ts` reproduz body, assinatura válida, replay
temporal, versão, limite e falhas sem publicar credenciais em documentação.
