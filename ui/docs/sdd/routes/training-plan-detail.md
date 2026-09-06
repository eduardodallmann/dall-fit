# Rota `/training-plan/:catalogEntryId`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

## Objetivo funcional

Exibir a árvore resolvida de uma entrada do catálogo pessoal. Sessão e ownership
são obrigatórios; o parâmetro identifica a entrada, não diretamente a árvore.

## Comportamento por source

Em `owned`, a composição reutiliza formulário, tabela e confirmações do fluxo
global: editar nome/descrição, criar workout e excluir workout usam CAS e
`X-Resource-Version`. Em `global-reference`, um alerta explica que o conteúdo
é um `Modelo disponibilizado em modo de leitura`; não são renderizados editar,
criar ou excluir. Os
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

No plano próprio, `Ctrl+Enter` confirma a edição inline do título. Criar workout
só navega depois do sucesso e usa o ID canônico retornado para abrir diretamente
`/training-plan/:catalogEntryId/workout/:workoutId`; falha mantém o detalhe.

No plano `owned`, edição inline alterada ou preservada após falha registra um owner
na fronteira global de segurança de reload, e mutations pendentes são agregadas
pelo provider transversal. A atualização PWA espera silenciosamente até salvar,
cancelar ou descartar o draft. O modo `global-reference`, somente leitura, não
cria bloqueador por navegação ou consulta.

## Cenários e cobertura

- `...?mockAuth=person&mockTrainingPlans=personal-reference`: alerta read-only e
  nenhuma ação de escrita;
- `...?mockAuth=person&mockTrainingPlans=personal-mixed`: plano próprio editável;
- `...?mockAuth=person&mockTrainingPlans=detail-error`: erro recuperável.

Implementação em `personal-detail-page.tsx`; handlers/fixtures MSW compartilhados;
Playwright em `personal-training-plan.spec.ts`.

## Referências visuais de layout

| Arquivo | Viewport | Estado validado |
| --- | ---: | --- |
| `assets/training-plan-detail/desktop-1440-read-only.png` | `1440x900` | modelo disponibilizado em leitura |
| `assets/training-plan-detail/mobile-390-read-only.png` | `390x844` | modelo disponibilizado em leitura mobile |
