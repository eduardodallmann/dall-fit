# Rota `/training-plan/:catalogEntryId/workout/:workoutId`

## Objetivo funcional

Exibir um workout próprio editável ou o conteúdo completo de uma referência global
em leitura. A rota carrega detalhe da entrada e workout em queries separadas.

## Modos

`owned` reutiliza `WorkoutEditor` com resource `personal`; criar, editar, excluir,
reordenar e manter imagens chamam endpoints pessoais, preservando drafts, fila CAS,
retry e signed URLs do editor administrativo. `global-reference` renderiza cards
sequenciais para os cinco discriminadores, incluindo imagem quando existente, sem
inputs nem botões edit/delete/move/upload. O modo é derivado exclusivamente do
detalhe retornado.

O `hasUnsavedWork` compartilhado também registra o owner desta rota na fronteira
global de reload. Draft, debounce, fila, upload, item temporário, patch dirty e
falha/conflito recuperável adiam silenciosamente a ativação PWA; ao terminar o
último bloqueador, o reload confirmado prossegue se o documento estiver visível.

Loading usa skeleton; erro oferece retry; signed URL de plano próprio é renovada
pelo refetch já vigente. Breadcrumbs retornam a Meus planos e ao detalhe. SSE
global invalida a query da referência mesmo que o evento possua ID global e a
query use `catalogEntryId`.

## Cenários e cobertura

- referência: `?mockAuth=person&mockTrainingPlans=personal-reference`, cards
  somente leitura e nenhuma escrita;
- próprio: `?mockAuth=person&mockTrainingPlans=personal-mixed`, editor completo;
- falha: `?mockAuth=person&mockTrainingPlans=detail-error`, retry.

Implementação em `personal-workout-page.tsx` e `workout-editor/`; MSW e Playwright
da rota pessoal cobrem ambos os modos. Não há referência visual.
