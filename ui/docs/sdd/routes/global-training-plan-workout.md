# Rota `/global/training-plan/:trainingPlanId/workout/:workoutId`

## Objetivo

Editor administrativo completo de um workout global e sua lista ordenada de até
50 exercícios. A rota é filha de `adminRoute` e faz uma única leitura projetada em
`GET /global/training-plans/:trainingPlanId/workouts/:workoutId`.

## Entrada, cabeçalho e estados

Breadcrumb resolvido: `Home / Planos de treino / <plano> / <treino>`. IDs nunca
viram labels. Sem cache, skeleton estrutural precede o editor; refetch falho mantém
dado e alerta. Not-found/falha inicial mostra Alert com retorno/retry aplicável.

O cabeçalho usa `Treino` como contexto textual discreto, o nome do treino como
único `h1`, `Exercícios` como `h2` e lápis icon-only centralizado na mesma linha do
nome. A edição inline valida trim
1–120, mantém valor confirmado separado do draft e entra na fila. Salvar conserva
o modo inline até o sucesso, mantém o campo sem label visível e fornece seu nome
acessível diretamente ao input. Só apresenta toast para resultado não cancelado;
falha mantém texto, erro e retry. Cancelar restaura o confirmado. Somente
`412 TRAINING_PLAN_VERSION_CONFLICT` mostra alerta persistente, bloqueia novas
gravações e oferece `Recarregar dados`, com confirmação antes de descartar drafts. Refetches
normais não remontam o editor nem reinicializam sua fila; somente o reload
confirmado descarta os drafts e reinicia a fila com a versão retornada pelo
servidor.

## Lista e campos

A composição é lista semântica responsiva, não Table. Lista sem itens apresenta
empty state `Nenhum exercício`, com orientação, imediatamente acima do acionador
de adição; o estado desaparece ao existir uma linha. O acionador
`Adicionar exercício` fica depois da lista, centralizado entre dois `Separator`,
possui indicador de expansão e abre Dropdown no qual cada tipo combina ícone
Lucide, nome e descrição.

Cada card possui cabeçalho com handle e ícone do tipo à esquerda, `Chip` e ação de
exclusão à direita. Identificação, mídia e body area ocupam a linha seguinte;
campos numéricos ficam sempre em outra linha. Três números dividem essa linha em
larguras iguais no desktop e empilham individualmente no viewport pequeno. Vídeo
usa label `Vídeo (ID)`; imagem mantém prévia e ações de envio/substituição/remoção
na região de mídia. Nenhuma largura produz scroll horizontal.

O slot da exclusão possui dimensão fixa e recebe o `Spinner` sem deslocar o card.
O Popover abre abaixo do icon button, com bordas direitas alinhadas, tem nome
acessível contextual, omite título visível e oferece somente
`Confirmar exclusão`. dnd kit aceita ponteiro, toque/teclado, mostra `DragOverlay`
e deslocamento dos demais cards durante a operação e persiste apenas no drop.
Ao confirmar o drop, o overlay desaparece imediatamente, sem animação de retorno à
posição original, e a lista conserva visualmente o destino escolhido. `Escape` ou
drop sem destino cancela, remove o overlay, restaura ordem/foco e não envia
mutation. Em dispositivos por toque, somente o handle declara `touch-action: none`
antes do início do gesto, evitando que o navegador converta o movimento em scroll
e emita `pointercancel`; o restante do card e da página continua rolável.

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
O estado `debouncing` não mostra a mensagem visual
`Alterações aguardando autosave`; continua participando do anúncio global da fila,
da proteção de saída e do disparo após três segundos.
O estado pendente da fila também não mostra a mensagem visual
`Alterações sendo salvas em ordem…`; o texto permanece somente como anúncio para
tecnologia assistiva, enquanto controles e spinners contextuais representam o
pending aplicável.

A versão de leitura semeia uma fila ainda inexistente ou avança uma fila ociosa,
mas nunca regride a versão já produzida por uma mutation. Depois de um sucesso, a
versão devolvida permanece corrente mesmo quando a fila volta a ficar ociosa; uma
ação posterior não reutiliza a versão antiga ainda presente nos dados de entrada
do editor.

Cada sucesso sincroniza a query projetada do workout e a versão do plano no cache.
Renomear também atualiza o resumo do workout; adicionar/excluir atualiza
`exerciseCount`; editar, ordenar e mídia atualizam a representação correspondente.
Assim, breadcrumb para o detalhe seguido de retorno ao workout não exibe nome,
campos, ordem, mídia ou contagem anteriores. Respostas falhas, canceladas,
obsoletas ou conflitantes não são publicadas como canônicas.

Adicionar escolhe um dos cinco tipos, põe linha temporária desabilitada no fim e
troca pelo default/ID retornado. No máximo uma operação estrutural — adicionar,
reordenar ou excluir — fica enfileirada/em execução; nenhuma ordem contém ID
`temporary-*`. Ordem envia todos os IDs persistidos uma vez e, em falha, reaplica
somente a ordem anterior aos objetos/drafts atuais. Excluir cancela debounce ainda
não disparado, captura linha, dirty, erro e posição, remove otimisticamente e, em
falha, reinsere esse estado sem PATCH oculto. Nenhuma mutation tem retry automático.

As leituras encaminham o `AbortSignal` ao Axios e usam timeout de 15 segundos;
upload usa 60 segundos. `CSRF_VALIDATION_FAILED` preserva draft, renova o token e
só repete o write pelo botão da linha. Timeout de mutation não presume o resultado
e exige reconciliação da query antes de nova tentativa.

Upload/substituição/remover imagem são imediatos, mas usam a mesma fila. A UI
valida JPEG/PNG/WebP e 10 MiB antes de FormData, conserva a imagem anterior durante
loading e nunca lê base64. A response usa signed URLs temporárias do host privado
`8u9fq5re0oenmrtc.private.blob.vercel-storage.com` e informa uma expiração comum.
O `<img>` acessa diretamente a URL, sem Axios, cookie da API ou endpoint binário.
`image:null` não mostra placeholder de mídia.

A query agenda uma renovação dois minutos antes da expiração mais próxima e
verifica novamente quando o documento volta a ficar visível. Refetch atualiza
somente o objeto de imagem nas linhas persistidas que não estejam salvando mídia;
nome, campos dirty, revisões, linhas temporárias e fila não são reinicializados. A
primeira falha de carregamento perto da expiração dispara no máximo um refetch por
timestamp. Falha persistente ou fora dessa janela oculta o preview, anuncia
`Imagem indisponível` e oferece `Tentar novamente`; nova URL remove o fallback.

## Integrações e falhas

- GET/PATCH do workout;
- POST/PATCH/DELETE de exercícios e PUT da ordem;
- PUT multipart/DELETE da imagem;
- download direto por signed URL `get` do Blob privado;
- `X-Resource-Version` com inteiro canônico em toda mutation e em todo sucesso que
  preserva o aggregate.

Not-found distingue plano/workout na API sem expor ownership. Somente o erro
`412 TRAINING_PLAN_VERSION_CONFLICT` preserva trabalho e pausa a fila; um `412`
externo sem esse código segue como falha genérica. Erros iniciais não dependem de
toast; o pending usa anúncio `aria-live` não visual e spinners contextuais
nomeados. Handles e botões icon-only têm nomes contextuais, miniaturas têm alt
derivado do nome visível e drag possui instruções do sensor de teclado.

Enquanto a fila estiver pausada, adicionar, handle, excluir, mídia, salvar nome e
retry/dispatch de autosave ficam desabilitados; campos persistidos continuam
editáveis localmente. Navegação interna é bloqueada por `AlertDialog` enquanto
existirem draft, debounce, tarefa, estrutura pendente, linha temporária ou erro
recuperável; `Permanecer` conserva foco e dados, e `Sair e descartar` cancela timers
locais. `beforeunload` oferece somente o aviso nativo para saída do documento.

O coordenador pertence ao domínio, mas registra reset no ciclo transversal de
sessão. Logout, `401` ou troca de pessoa aborta request, cancela tarefas ainda não
iniciadas e remove versão/pausa; callbacks antigos não atualizam editor, cache,
toast ou Analytics.

## Analytics e privacidade

Nome, adicionar/tipo, campos, drop, exclusão, mídia e retry usam enums do catálogo.
Cada operação aceita emite início e terminal; conflito é erro e recarga é retry.
Não se enviam IDs, nomes, valores, URLs, arquivos, tamanhos, ordem, código externo
ou seletor mock. Signed URL, pathname, query de assinatura e expiração também não
entram em Analytics nem em storage persistente.

## Cenários e cobertura

- sucesso:
  `/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin`;
- loading: `mockTrainingPlans=loading`;
- autosave falho: `update-exercise-error`;
- exclusão durante debounce: `delete-exercise-error`;
- rollback de ordem com draft posterior: `reorder-error`;
- conflito: `version-conflict`;
- imagem falha: `image-error`.
- URL assinada expirada/renovação: `image-signed-url-expired`;
- lista vazia: `empty-workout`.

Vitest cobre services, coordenador, merge por revisão e restauração estrutural;
Playwright cobre os cinco tipos, mídia privada/renovação, empty state/menu informativo, layouts desktop e
móvel, duas adições consecutivas com propagação de versão, retorno sem cache antigo,
autosave, conflito, exclusão durante debounce, ordem por teclado/cancelamento/
rollback e proteção acessível. E2E separado cobre API/MongoDB. Não há referência visual em
`routes/assets/global-training-plan-workout/`.

Arquivos: `workout-page.tsx`, `workout-editor/`, `training-plan-service.ts`,
queries e handlers/fixtures `training-plans.ts`.
