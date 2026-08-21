# Rota `/training-plan/:catalogEntryId`

## Objetivo funcional

Exibir a árvore resolvida de uma entrada do catálogo pessoal. Sessão e ownership
são obrigatórios; o parâmetro identifica a entrada, não diretamente a árvore.

## Comportamento por source

Em `owned`, a composição reutiliza formulário, tabela e confirmações do fluxo
global: editar nome/descrição, criar workout e excluir workout usam CAS e
`X-Resource-Version`. Em `global-reference`, um alerta explica que o conteúdo
acompanha a administração; não são renderizados editar, criar ou excluir. Os
workouts continuam navegáveis e a coluna Ações informa “Somente leitura”. Não há
booleans independentes de capability: a união `source` escolhe uma composição
inteira.

Loading mostra breadcrumbs e skeleton; falha/entrada removida mostra retry. Vazio
mantém a tabela e informa ausência de treinos. Alteração global por SSE invalida a
leitura da referência. Exclusão global posterior torna a entrada indisponível e a
limpeza administrativa a remove do catálogo sem fallback ativo.

## Integrações, navegação e acessibilidade

Usa `GET/PATCH /training-plans/:catalogEntryId` e operações de workouts sob o
mesmo prefixo. Breadcrumbs ligam Home → Meus planos → plano; workout avança para
`/training-plan/:catalogEntryId/workout/:workoutId`. Formulários e dialogs mantêm
labels, foco e teclado dos componentes compartilhados.

## Cenários e cobertura

- `...?mockAuth=person&mockTrainingPlans=personal-reference`: alerta read-only e
  nenhuma ação de escrita;
- `...?mockAuth=person&mockTrainingPlans=personal-mixed`: plano próprio editável;
- `...?mockAuth=person&mockTrainingPlans=detail-error`: erro recuperável.

Implementação em `personal-detail-page.tsx`; handlers/fixtures MSW compartilhados;
Playwright em `personal-training-plan.spec.ts`. Não há referência visual.
