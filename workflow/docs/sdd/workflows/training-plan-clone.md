# Workflow `trainingPlanCloneWorkflow`

## Objetivo

Clonar uma árvore global e suas imagens privadas sem expor destino parcial. O job
persistido pela API contém snapshot imutável e é a fonte de retomada.

## Máquina de execução

1. O run reivindica `(cloneJobId, generation)` com seu `workflowRunId`.
2. A cada decisão, estado obsoleto encerra; cancelamento entra em compensação;
   imagens pendentes formam lotes de até três exercícios.
3. Cada lote copia em paralelo thumbnail e display para pathnames determinísticos,
   preserva explicitamente o content type/cache da política de imagens, condiciona
   cada origem ao ETag imutável do snapshot e confirma individualmente cada
   exercício no job.
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
