# Rota `/global/training-plan/:trainingPlanId/workout/:workoutId`

## Objetivo

Editor administrativo completo de um workout global e sua lista ordenada de até
50 exercícios. A rota é filha de `adminRoute` e faz uma única leitura projetada em
`GET /global/training-plans/:trainingPlanId/workouts/:workoutId`.

## Entrada, cabeçalho e estados

Breadcrumb resolvido: `Home / Planos de treino / <plano> / <treino>`. IDs nunca
viram labels. Sem cache, skeleton estrutural precede o editor; refetch falho mantém
dado e alerta. Not-found/falha inicial mostra Alert com retorno/retry aplicável.

O cabeçalho mostra `Treino`, nome e lápis icon-only. A edição inline valida trim
1–120, mantém valor confirmado separado do draft, entra na fila e usa
`toast.promise`. Salvar conserva o modo inline até o sucesso; falha mantém texto,
erro e retry. Cancelar restaura o confirmado. Somente
`412 TRAINING_PLAN_VERSION_CONFLICT` mostra alerta persistente, bloqueia novas
gravações e oferece `Recarregar dados`, com confirmação antes de descartar drafts. Refetches
normais não remontam o editor nem reinicializam sua fila; somente o reload
confirmado descarta os drafts e reinicia a fila com a versão retornada pelo
servidor.

## Lista e campos

A composição é lista semântica responsiva, não Table. Cada item possui handle,
campos com labels, Chip do tipo, status anunciado e exclusão em Popover. Em telas
menores o grid empilha campos sem scroll horizontal. dnd kit aceita ponteiro,
toque/teclado e persiste apenas no drop.

| Tipo          | Campos                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| YouTube Short | nome, vídeo/miniatura derivada, body area, descanso, séries, repetições |
| Imagem        | nome, imagem, body area, descanso, séries, repetições                   |
| YouTube Longo | nome, vídeo/miniatura derivada, body area                               |
| Pausa         | descanso                                                                |
| Duração       | nome, body area, minutos                                                |

TextField/Input, NumberField, Select/ListBox, Chip, Spinner, Dropdown, Popover,
Button e Alert são HeroUI. `ImageFilePicker` é a única composição transversal
própria e usa input file nativo acessível.

## Autosave e mutações

Cada linha mantém confirmado, draft, patch dirty, revisão por campo e estado
`idle|debouncing|queued|saving|error`. O debounce de três segundos combina somente
campos alterados e não limpa dirty ao disparar. Timers são independentes; requests
passam pelo coordenador FIFO do plano, que pertence ao `QueryClient`, injeta a
versão mais recente em `X-Resource-Version` e exige o header na response. Se houver
edição durante um request, somente campos sem revisão posterior recebem o valor
canônico; o draft mais novo permanece dirty e agenda outra passagem. Falha preserva
patch/draft/miniatura, anuncia erro na linha e oferece `Tentar novamente` com os
valores correntes. Sucesso de autosave não mostra toast.

A versão de leitura semeia uma fila ainda inexistente ou avança uma fila ociosa,
mas nunca regride a versão já produzida por uma mutation. Depois de um sucesso, a
versão devolvida permanece corrente mesmo quando a fila volta a ficar ociosa; uma
ação posterior não reutiliza a versão antiga ainda presente nos dados de entrada
do editor.

Adicionar escolhe um dos cinco tipos, põe linha temporária desabilitada no fim e
troca pelo default/ID retornado. No máximo uma operação estrutural — adicionar,
reordenar ou excluir — fica enfileirada/em execução; nenhuma ordem contém ID
`temporary-*`. Ordem envia todos os IDs persistidos uma vez e, em falha, reaplica
somente a ordem anterior aos objetos/drafts atuais. Excluir cancela debounce ainda
não disparado, captura linha, dirty, erro e posição, remove otimisticamente e, em
falha, reinsere esse estado sem PATCH oculto. Nenhuma mutation tem retry automático.

Upload/substituição/remover imagem são imediatos, mas usam a mesma fila. A UI
valida JPEG/PNG/WebP e 10 MiB antes de FormData, conserva a imagem anterior durante
loading e nunca lê base64. As URLs públicas pertencem ao host
`gvi3tyf5ckqiqlak.public.blob.vercel-storage.com` e ao prefixo
`exercise-images/`. `image:null` não mostra placeholder de mídia.

## Integrações e falhas

- GET/PATCH do workout;
- POST/PATCH/DELETE de exercícios e PUT da ordem;
- PUT multipart/DELETE da imagem;
- `X-Resource-Version` com inteiro canônico em toda mutation e em todo sucesso que
  preserva o aggregate.

Not-found distingue plano/workout na API sem expor ownership. Somente o erro
`412 TRAINING_PLAN_VERSION_CONFLICT` preserva trabalho e pausa a fila; um `412`
externo sem esse código segue como falha genérica. Erros iniciais não dependem de
toast; saving usa aria-live
e spinner nomeado. Handles e botões icon-only têm nomes contextuais, miniaturas têm
alt derivado do nome visível e drag possui instruções do sensor de teclado.

Enquanto a fila estiver pausada, adicionar, handle, excluir, mídia, salvar nome e
retry/dispatch de autosave ficam desabilitados; campos persistidos continuam
editáveis localmente. Navegação interna é bloqueada por `AlertDialog` enquanto
existirem draft, debounce, tarefa, estrutura pendente, linha temporária ou erro
recuperável; `Permanecer` conserva foco e dados, e `Sair e descartar` cancela timers
locais. `beforeunload` oferece somente o aviso nativo para saída do documento.

## Analytics e privacidade

Nome, adicionar/tipo, campos, drop, exclusão, mídia e retry usam enums do catálogo.
Cada operação aceita emite início e terminal; conflito é erro e recarga é retry.
Não se enviam IDs, nomes, valores, URLs, arquivos, tamanhos, ordem, código externo
ou seletor mock.

## Cenários e cobertura

- sucesso:
  `/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin`;
- loading: `mockTrainingPlans=loading`;
- autosave falho: `update-exercise-error`;
- exclusão durante debounce: `delete-exercise-error`;
- rollback de ordem com draft posterior: `reorder-error`;
- conflito: `version-conflict`;
- imagem falha: `image-error`.

Vitest cobre services, coordenador, merge por revisão e restauração estrutural;
Playwright cobre os cinco tipos, duas adições consecutivas com propagação de
versão, autosave, conflito, exclusão durante debounce, ordem por teclado/rollback
e proteção acessível. E2E separado cobre API/MongoDB. Não há referência visual em
`routes/assets/global-training-plan-workout/`.

Arquivos: `workout-page.tsx`, `workout-editor/`, `training-plan-service.ts`,
queries e handlers/fixtures `training-plans.ts`.
