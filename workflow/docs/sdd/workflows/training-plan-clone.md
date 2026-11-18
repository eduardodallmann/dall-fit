# Workflow `trainingPlanCloneWorkflow`

## Objetivo

Clonar uma árvore global e suas imagens privadas sem expor destino parcial. O job
persistido pela API contém snapshot imutável e é a fonte de retomada.

## Máquina de execução

1. O run reivindica `(cloneJobId, generation)` com seu `workflowRunId`.
2. A cada decisão, estado obsoleto encerra; cancelamento entra em compensação;
   imagens pendentes formam lotes de até três exercícios.
3. Cada lote deriva um `imageAssetId` opaco e estável de job+exercício e copia em
   paralelo thumbnail e display para
   `exercise-images/{imageAssetId}/{thumbnail|display}.webp`, preserva
   explicitamente o content type/cache da política de imagens, condiciona cada
   origem ao ETag imutável do snapshot e confirma individualmente cada exercício
   no job.
4. Sem imagens pendentes, o job passa atomicamente a `materializing`; IDs de plano,
   catálogo, workouts e exercícios são determinísticos e os upserts são
   idempotentes.
5. A conclusão muda o job para `completed`. Só então a entrada própria aparece na
   lista pessoal.

Falha não consumida marca `failed`. Cancelamento cooperativo ou `cancelling` remove
as variantes destino conhecidas antes de marcar `cancelled`. Retry manual aumenta
a geração e zera a posse do run; execuções antigas deixam de casar nos filtros.
Exclusão posterior do global não interrompe jobs já criados porque snapshot e keys
de origem são retidos até um estado terminal.

## Garantias e limites

- at-least-once é absorvido por lease, geração, run ID, pathnames e IDs estáveis;
- `copy()` usa OIDC, `allowOverwrite` idempotente e `ifMatch` por variante;
- plano/clonagem nunca ativa automaticamente o catálogo;
- finalização prevalece quando já entrou em `materializing`;
- progresso conta imagens confirmadas, não variantes individuais;
- nenhuma URL assinada ou árvore parcial atravessa o bridge.

## Imagens opcionais em duração

A captura da API conta e conserva `image` em `duration`, incluindo ETags e retenção
de origem. `MongoTrainingPlanCloneRepository.nextDecision` inclui esses exercícios
nos mesmos lotes de três; `CloneBlobService.copyExerciseImage` copia ambas as
variantes com destinos determinísticos. Confirmação/progresso, redelivery, falha,
retry e cancelamento mantêm os mesmos fences. Na materialização, `mapExercise`
aplica metadata copiada a `image` e `duration`; neste último preserva minutos e
instruções sem criar séries. Durações antigas sem imagem continuam válidas. A
compensação/reconciliação considera também origens e destinos de duração; nenhum
novo protocolo, HMAC ou schema de job é exigido. API e Workflow atualizados devem
preceder a publicação da UI que escreve esse campo.
