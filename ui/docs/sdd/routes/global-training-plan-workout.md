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
1–120, atualiza otimisticamente, entra na fila e usa toast.promise. Cancelar
restaura o confirmado. `412` mostra alerta persistente, bloqueia novas gravações e
oferece `Recarregar dados`, com confirmação antes de descartar drafts. Refetches
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

Cada linha acumula somente campos alterados e dispara depois de três segundos sem
nova edição. Timers são independentes; requests passam por uma fila FIFO do plano,
que injeta o ETag mais recente. Refetches e atualizações de cache não recriam essa
fila. Se houver edição durante um request, a response
canônica não substitui o draft mais novo. Sucesso de autosave não mostra toast;
falha preserva draft/miniatura e anuncia erro.

Adicionar escolhe um dos cinco tipos, põe linha temporária no fim e troca pelo
default retornado. Ordem envia todos os IDs uma vez e faz rollback em falha.
Excluir confirma, remove otimisticamente e restaura item/posição/draft se falhar.
Nenhuma mutation tem retry automático.

Upload/substituição/remover imagem são imediatos, mas usam a mesma fila. A UI
valida JPEG/PNG/WebP e 10 MiB antes de FormData, conserva a imagem anterior durante
loading e nunca lê base64. As URLs públicas pertencem ao host
`gvi3tyf5ckqiqlak.public.blob.vercel-storage.com` e ao prefixo
`exercise-images/`. `image:null` não mostra placeholder de mídia.

## Integrações e falhas

- GET/PATCH do workout;
- POST/PATCH/DELETE de exercícios e PUT da ordem;
- PUT multipart/DELETE da imagem;
- `If-Match` em toda mutation e ETag em todo sucesso.

Not-found distingue plano/workout na API sem expor ownership. Conflito preserva
trabalho e pausa a fila. Erros iniciais não dependem de toast; saving usa aria-live
e spinner nomeado. Handles e botões icon-only têm nomes contextuais, miniaturas têm
alt derivado do nome visível e drag possui instruções do sensor de teclado.

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
- conflito: `version-conflict`;
- imagem falha: `image-error`.

Vitest cobre services e fila; Playwright cobre render dos cinco tipos, autosave,
conflito e proteção. E2E separado cobre API/MongoDB. Não há referência visual em
`routes/assets/global-training-plan-workout/`.

Arquivos: `workout-page.tsx`, `workout-editor/`, `training-plan-service.ts`,
queries e handlers/fixtures `training-plans.ts`.
