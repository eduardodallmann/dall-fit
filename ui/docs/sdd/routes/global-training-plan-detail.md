# Rota `/global/training-plan/:trainingPlanId`

## Objetivo funcional

- Problema resolvido: identificar um plano, editá-lo e manter seus treinos.
- Ator: pessoa administradora.
- Resultado: detalhe com edição inline, tabela de treinos e navegação ao editor.
- Fluxo: `../../../../docs/sdd/flows/gestao-planos-treino-globais.md`.

## Entradas e pré-condições

`trainingPlanId` vem do path e é opaco para a UI. A rota é filha de `adminRoute` e
usa cache TanStack Query do detalhe. `mockAuth` e `mockTrainingPlans` são seletores
somente de MSW.

## Elementos e caminho feliz

1. Breadcrumb `Home / Planos de treino / <nome>` e consulta do detalhe.
2. Cabeçalho mostra nome/descrição e um botão icon-only de lápis junto ao título;
   esta tela não oferece exclusão do plano.
3. O lápis substitui nome e descrição, exatamente na região em que eram exibidos,
   por `Input` e `TextArea` do TanStack Form. Salvar e cancelar são botões
   icon-only à direita do input de nome. Salvar encerra a edição no disparo da
   mutation; falha restaura o cache sem reabrir o editor.
4. Tabela mostra nome e `exerciseCount` de cada treino.
5. `Novo treino` envia body vazio, aguarda o ID real, acrescenta o resumo ao cache
   usando `If-Match`, incorpora o novo ETag e navega para a rota técnica do workout.
6. O dropdown de treino abre confirmação; DELETE remove otimisticamente e faz
   rollback em falha.

## Estados e erros

- Loading sem cache: breadcrumb apenas com os ancestrais estáticos e skeletons que
  representam cabeçalho e conteúdo da tela.
- Plano vazio: `EmptyState` centralizado e com ícone dentro do corpo da tabela de
  treinos.
- Falha inicial/not-found: `Alert` com retry; nome do plano é omitido do breadcrumb,
  sem usar ID ou placeholder.
- Falha em background: conserva plano e treinos em cache, mantém o nome no
  breadcrumb e mostra `Alert` não bloqueante.
- Falha de update ou exclusão de treino: snapshot restaurado e toast de erro; o
  editor/dialog já fechado não reabre.
- Criação de treino não é otimista, porque a UI não fabrica ID.

## Validações e integrações

Nome e descrição seguem trim e limites 1–120/1–1000. Integrações:

- `GET/PATCH /global/training-plans/:trainingPlanId`;
- `POST /global/training-plans/:trainingPlanId/workouts`;
- `DELETE /global/training-plans/:trainingPlanId/workouts/:workoutId`.

O detalhe conserva `version`; todas as mutações enviam a tag atual e atualizam os
caches com a versão resultante. `412` não é repetido nem sobrescreve o servidor.

POST, PATCH e DELETE dependem do bootstrap CSRF do layout autenticado. O client
Axios único injeta o header em memória; falha `403` não dispara retry automático e
usa o mesmo rollback/feedback documentado para a operação.

Contrato: `api/docs/sdd/endpoints/global-training-plans.md`.

## Navegação e acessibilidade

Breadcrumb e nomes de treino usam navegação SPA pelo TanStack Router. O último
segmento do detalhe é atual e não conduz a outra página. Lápis, salvar e cancelar
possuem nomes acessíveis apesar de serem icon-only; dialogs de treino descrevem a
exclusão e exigem ação explícita. O browser voltar preserva o cache enquanto
válido. A interface usa somente `treino`/`treinos`; `workout` permanece restrito a
identificadores técnicos, paths e contratos.

## Analytics

- breadcrumbs e nomes de treino emitem `ui_navigation_selected` com destino
  normalizado, sem nomes nem IDs;
- o lápis e o cancelamento da edição inline emitem `ui_button_pressed`; o formulário
  inline emite foco, término de edição e submissão com as mesmas regras de
  privacidade da lista;
- salvar o plano, criar treino e excluir treino emitem um início e um único
  resultado terminal `success|error`; criação e exclusão nunca enviam ID ou nome do
  treino;
- abrir o dropdown e escolher Excluir emite os eventos de menu; abrir e fechar a
  confirmação emite os eventos de overlay com razão `cancel|confirm`;
- a falha inicial oferece retry e emite `ui_retry_requested` para `training_plan`.

## Referências visuais de layout

Não se aplica — não existem imagens em
`routes/assets/global-training-plan-detail/`.

## Cenários funcionais e cobertura

- Sucesso: `/global/training-plan/64b000000000000000000001?mockAuth=admin`.
- Loading: acrescentar `mockTrainingPlans=loading`; skeletons precedem o detalhe.
- Erro sem cache: acrescentar `mockTrainingPlans=detail-error`; breadcrumb omite o
  plano e oferece retry.
- Edição inline: `mockTrainingPlans=update-success` troca os textos por campos e
  ações icon-only; `update-error` fecha e restaura o cache sem reabrir o editor.
- Treino: o flow Playwright cria com ID real e exclui com atualização otimista.
- Arquivos: `detail-page.tsx`, `components.tsx`, queries/mutations/service e
  handlers/fixtures `training-plans.ts`.
- Specs: rota `training-plan.spec.ts`, flow `gestao-planos-treino.spec.ts` e E2E
  separado da API.
