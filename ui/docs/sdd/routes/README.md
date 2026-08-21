# Rotas

Este diretório contém a documentação funcional viva das telas. Use
`../templates/route-spec.md`.

Índice atual:

- [`/`](root.md): entrada pública e início do login Google.
- [`/dash`](dash.md): entrada autenticada com menu responsivo e conteúdo vazio.
- [`/training-plan`](training-plan.md): catálogo pessoal unificado e clonagem.
- [`/training-plan/:catalogEntryId`](training-plan-detail.md): detalhe próprio ou
  referência global somente leitura.
- [`/training-plan/:catalogEntryId/workout/:workoutId`](training-plan-workout.md):
  editor próprio ou workout somente leitura.
- [`/global/training-plan`](global-training-plan.md): lista e CRUD de planos.
- [`/global/training-plan/:trainingPlanId`](global-training-plan-detail.md):
  detalhe e manutenção de workouts.
- [`/global/training-plan/:trainingPlanId/workout/:workoutId`](global-training-plan-workout.md):
  editor administrativo completo.
