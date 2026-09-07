# Rota `/global/training-plan/:trainingPlanId`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

O cabeçalho administrativo exibe `Pessoas vinculadas` e `Planos ativos` do global,
atualizados por invalidação. São dados informativos: edição e exclusão de workouts
continuam disponíveis mesmo com impacto pessoal.

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
   icon-only à direita do input de nome. Durante o PATCH, campos e ações do draft
   ficam bloqueados e o modo inline permanece visível. Somente o sucesso aplica a
   response canônica e encerra a edição.
4. Tabela mostra nome e `exerciseCount` de cada treino. O nome é link SPA com cor
   de ação, sublinhado persistente e foco visível, seguindo o affordance dos nomes
   de plano na listagem anterior.
5. `Novo treino` envia body vazio, aguarda o ID real, acrescenta o resumo ao cache
   usando `X-Resource-Version`, incorpora a versão devolvida no mesmo header e
   navega para a rota técnica do workout.
6. O dropdown de treino abre confirmação; o `AlertDialog` permanece aberto e
   bloqueado durante o DELETE. A remoção otimista afeta só o treino alvo e o
   sucesso fecha a confirmação.

## Estados e erros

- Loading sem cache: breadcrumb apenas com os ancestrais estáticos e skeletons que
  representam cabeçalho e conteúdo da tela.
- Plano vazio: `EmptyState` centralizado e com ícone dentro do corpo da tabela de
  treinos.
- Falha inicial/not-found: `Alert` com retry; nome do plano é omitido do breadcrumb,
  sem usar ID ou placeholder.
- Falha em background: conserva plano e treinos em cache, mantém o nome no
  breadcrumb e mostra `Alert` não bloqueante.
- Falha de update: restaura apenas os campos confirmados do plano, mantém o draft
  exato no formulário inline e mostra erro persistente para retry/cancelamento.
- Falha de exclusão de treino: reinsere apenas o treino e sua posição, sem
  substituir nome, descrição, versão ou outros treinos; dialog permanece aberto
  com erro persistente.
- Criação de treino não é otimista, porque a UI não fabrica ID.
- Conflito de domínio: mantém formulário ou confirmação, pausa todas as gravações
  do plano e mostra alerta com recarga confirmada. Falha da leitura mantém drafts e
  pausa; sucesso atualiza a versão, descarta o trabalho confirmado e libera a fila.

## Validações e integrações

Nome e descrição seguem trim e limites 1–120/1–1000. Integrações:

- `GET/PATCH /global/training-plans/:trainingPlanId`;
- `POST /global/training-plans/:trainingPlanId/workouts`;
- `DELETE /global/training-plans/:trainingPlanId/workouts/:workoutId`.

O detalhe conserva `version`; update do plano, criação e exclusão de treino usam o
coordenador compartilhado por `trainingPlanId`. A versão é obtida quando a tarefa
chega à cabeça FIFO, enviada em `X-Resource-Version` e substituída pelo header do
sucesso. Somente `412 TRAINING_PLAN_VERSION_CONFLICT` pausa a fila; não há retry ou
merge automático.

POST, PATCH e DELETE dependem do bootstrap CSRF do layout autenticado. O client
Axios único injeta o header em memória; falha CSRF renova o token sem repetir a
mutation, perda de admin retorna a `/dash`, outro `403` não dispara retry automático
e usa o mesmo rollback/feedback documentado para a operação.

Leituras encaminham `AbortSignal` e usam timeout/retry transversal. Teardown da
sessão aborta o transporte e reseta a fila sem aplicar rollback ou response tardia
na geração seguinte.

Contrato: `api/docs/sdd/endpoints/global-training-plans.md`.

## Navegação e acessibilidade

Breadcrumb e nomes de treino usam navegação SPA pelo TanStack Router; nomes de
treino mantêm sublinhado e cor de ação mesmo sem hover. O último segmento do
detalhe é atual e não conduz a outra página. Lápis, salvar e cancelar
possuem nomes acessíveis apesar de serem icon-only; dialogs de treino descrevem a
exclusão, exigem ação explícita e não aceitam dismiss durante pending. Erros de
formulário e dialog são persistentes, não dependem do toast. O browser voltar
preserva o cache enquanto válido. A interface usa somente `treino`/`treinos`;
`workout` permanece restrito a identificadores técnicos, paths e contratos.

Enquanto a edição inline estiver alterada, falhar com draft recuperável ou
participar de conflito que preserve esse trabalho, ela registra um bloqueador na
fronteira global de reload. Mutations pendentes também bloqueiam por TanStack
Query. A atualização PWA pronta permanece silenciosa e só prossegue depois de
salvar, cancelar ou descartar o último trabalho recuperável.

`Ctrl+Enter` confirma a edição inline do título pela mesma validação e mutation da
ação de salvar. A comunicação visível chama o recurso compartilhado de modelo;
`global` permanece somente em rotas, contratos e conceitos técnicos.

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

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/global-training-plan-detail/desktop-1440-success.png` | `1440x900` | `success` | detalhe, impacto e tabela de treinos no desktop |
| `assets/global-training-plan-detail/mobile-390-success.png` | `390x844` | `success` | detalhe e tabela no mobile |
| `assets/global-training-plan-detail/desktop-1440-delete-workout-dialog.png` | `1440x900` | `success`, exclusão de treino aberta | AlertDialog destrutivo, backdrop e contexto preservado |

## Cenários funcionais e cobertura

- Sucesso: `/global/training-plan/64b000000000000000000001?mockAuth=admin`.
- Loading: acrescentar `mockTrainingPlans=loading`; skeletons precedem o detalhe.
- Erro sem cache: acrescentar `mockTrainingPlans=detail-error`; breadcrumb omite o
  plano e oferece retry.
- Edição inline: `mockTrainingPlans=update-success` troca os textos por campos e
  ações icon-only; `update-error` preserva modo, draft e erro persistente.
- Treino: o flow Playwright cria com ID real e exclui com atualização otimista;
  falha conserva a confirmação e restaura somente o treino alvo.
- Conflito: `version-conflict` preserva o trabalho e exige recarga confirmada.
- Arquivos: `detail-page.tsx`, `components.tsx`, queries/mutations/service e
  handlers/fixtures `training-plans.ts`.
- Specs: rota `training-plan.spec.ts`, flow `gestao-planos-treino.spec.ts` e E2E
  separado da API.

## Atualização externa

Invalidações SSE do plano refazem detalhe e resumos para qualquer usuário
autenticado (admin ou não-admin) quando não há edição ou confirmação local
aberta. Com trabalho local, o coordenador pausa e conserva a recarga confirmada
desta tela. Exclusão externa navega para a listagem depois da reconciliação.
