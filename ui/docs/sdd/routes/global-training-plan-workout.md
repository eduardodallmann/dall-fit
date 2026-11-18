# Rota `/global/training-plan/:trainingPlanId/workout/:workoutId`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

O editor administrativo apresenta também o resumo de pessoas vinculadas e ativas
do plano pai. A métrica não altera nenhuma capability do editor e se atualiza após
mudanças de referência/seleção recebidas pelo stream.

## Objetivo

Editor administrativo completo de um workout global e sua lista ordenada de até
50 exercícios. A rota é filha de `adminRoute` e faz uma única leitura projetada em
`GET /global/training-plans/:trainingPlanId/workouts/:workoutId`.

Na comunicação visível, o recurso compartilhado é chamado de modelo; o termo
`global` fica restrito a rotas, contratos e conceitos técnicos.

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
`412 TRAINING_PLAN_VERSION_CONFLICT` ou uma invalidação SSE externa (admin
ou não-admin) com trabalho local mostra alerta persistente e bloqueia novas
gravações. No editor,
`Descartar e recarregar` executa a leitura diretamente no alerta, sem segunda
modal; falha preserva drafts e a pausa. Refetches
normais não remontam o editor nem reinicializam sua fila; somente o reload
bem-sucedido descarta os drafts e reinicia a fila com a versão retornada pelo
servidor.

Com o editor limpo, invalidação SSE (admin ou não-admin) refaz a leitura e remonta
a representação canônica. Exclusão externa do plano navega para a listagem; com draft, isso ocorre
somente depois da ação direta e da confirmação HTTP.

## Lista e campos

A composição é lista semântica responsiva, não Table. Lista sem itens apresenta
empty state `Nenhum exercício`, com orientação, imediatamente acima do acionador
de adição; o estado desaparece ao existir uma linha. O acionador
`Adicionar exercício` fica depois da lista, centralizado entre dois `Separator`,
possui indicador de expansão e abre Dropdown no qual cada tipo combina ícone
Lucide, nome e descrição.

O nome do workout pode ser editado inline; `Ctrl+Enter` confirma pela mesma fila
e pelas mesmas validações da ação de salvar.

Cada card possui cabeçalho com handle e ícone do tipo à esquerda, `Chip` e ação de
exclusão à direita. Identificação, mídia e body area ocupam a linha seguinte;
campos numéricos ficam sempre em outra linha. Três números dividem essa linha em
larguras iguais no desktop e empilham individualmente no viewport pequeno. Vídeo
usa label `Vídeo (ID)` e mantém ao lado uma miniatura proporcional com a mesma
altura do conjunto label/input em todas as larguras. A miniatura inteira é um
controle com ícone `Play` discreto, centralizado e de 18 px; sua ativação abre um
`Modal` HeroUI amplo com header separado, nome do exercício e fechar sempre acima
da mídia. O `react-player` é carregado sob demanda, reproduz automaticamente sem
som e inline, sem forçar legendas. O corpo conserva 9:16 para YouTube Short e 16:9
para YouTube Longo, cresce até os limites do viewport sem scroll horizontal e não
deforma o vídeo. O player só permanece montado enquanto o modal está aberto. O
fechamento não anima a saída: player, diálogo e backdrop desaparecem juntos,
interrompem a reprodução e restauram o foco.

No exercício de imagem, nome e região de mídia formam o mesmo grupo. Quando existe
mídia, `thumbnailUrl` tem a altura do conjunto label/input de `Nome`, conserva a
proporção e funciona inteira como preview com `Eye` centralizado. `Substituir
imagem` e `Remover imagem` são botões icon-only empilhados à direita e não excedem
a altura da miniatura. O modal usa `displayUrl`; uma renovação da query substitui
as URLs sem fechar o overlay. Ele possui header separado com o nome do exercício,
mantém o fechar acima da mídia, ocupa até 90% da largura e 78% da altura útil do
viewport e fecha sem animação de saída. Nenhuma largura produz scroll horizontal.

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
| Duração       | nome, body area, minutos, instruções e mídia opcional                      |

TextField/Input, NumberField, Select/ListBox, Chip, Spinner, Dropdown, Popover,
Button, Modal e Alert são HeroUI. `ImageFilePicker` é a composição transversal
própria para imagem e usa input file nativo acessível. `ExerciseVideoPreview` é
exclusivo da rota e encapsula miniatura, modal e `react-player`.

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
loading e nunca lê base64. Sem imagem, uma área tracejada com `Plus` aceita clique,
teclado ou o drop de exatamente um arquivo. Durante upload ela fica desabilitada,
troca o `Plus` por `Spinner` e mantém `Processando imagem` apenas em região viva.
Durante substituição ou remoção, ambos os botões e o preview ficam desabilitados,
a miniatura fica em escala de cinza e o `Eye` dá lugar ao `Spinner`; erro restaura
a mídia anterior e reabilita os controles. A response usa signed URLs temporárias do host privado
`8u9fq5re0oenmrtc.private.blob.vercel-storage.com` e informa uma expiração comum.
O `<img>` acessa diretamente a URL, sem Axios, cookie da API ou endpoint binário.
`image:null` mostra somente a área de envio, sem inventar conteúdo de mídia.

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
derivado do nome visível, controles de preview nomeiam a ação e drag possui
instruções do sensor de teclado. Modais fecham por `Escape`, backdrop e controle
explícito, contêm o foco e o devolvem ao preview que os abriu.

Enquanto a fila estiver pausada, adicionar, handle, excluir, mídia, salvar nome e
retry/dispatch de autosave ficam desabilitados; campos persistidos continuam
editáveis localmente. Navegação interna é bloqueada por `AlertDialog` enquanto
existirem draft, debounce, tarefa, estrutura pendente, linha temporária ou erro
recuperável; `Permanecer` conserva foco e dados, e `Sair e descartar` cancela timers
locais. `beforeunload` oferece somente o aviso nativo para saída do documento.

O mesmo `hasUnsavedWork`, sem cálculo paralelo, alimenta a fronteira global de
segurança de reload da PWA. Assim draft, debounce, fila, tarefa estrutural, upload,
linha temporária, patch dirty e erro/conflito recuperável mantêm uma versão nova em
espera silenciosa. Quando o editor e as mutations globais ficam seguros, a
ativação/reload pendente prossegue automaticamente se o documento estiver visível.

O coordenador pertence ao domínio, mas registra reset no ciclo transversal de
sessão. Logout, `401` ou troca de pessoa aborta request, cancela tarefas ainda não
iniciadas e remove versão/pausa; callbacks antigos não atualizam editor, cache,
toast ou Analytics.

## Analytics e privacidade

Nome, adicionar/tipo, campos, drop, exclusão, mídia, previews e retry usam enums do catálogo.
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
- imagem existente: `image-ready`;
- URL assinada expirada/renovação: `image-signed-url-expired`;
- lista vazia: `empty-workout`.

Vitest cobre services, coordenador, merge por revisão, restauração estrutural,
upload/drop, estados pendentes e ciclo de montagem dos modais de mídia;
Playwright cobre os cinco tipos, mídia privada/renovação/pending/rollback, empty state/menu informativo, layouts desktop e
móvel, duas adições consecutivas com propagação de versão, retorno sem cache antigo,
autosave, conflito, exclusão durante debounce, ordem por teclado/cancelamento/
rollback e proteção acessível. E2E separado cobre API/MongoDB.

## Referências visuais de layout

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/global-training-plan-workout/desktop-1440-success.png` | `1440x900` | `success` | editor e cinco tipos de exercício no desktop |
| `assets/global-training-plan-workout/mobile-390-success.png` | `390x844` | `success` | empilhamento dos campos e cards no mobile |
| `assets/global-training-plan-workout/desktop-1440-image-modal.png` | `1440x900` | `image-ready`, imagem aberta | modal amplo, header separado e mídia contida |
| `assets/global-training-plan-workout/mobile-390-image-modal.png` | `390x844` | `image-ready`, imagem aberta | modal de imagem dentro do viewport móvel |
| `assets/global-training-plan-workout/desktop-1440-delete-popover.png` | `1440x900` | `success`, exclusão de exercício aberta | ancoragem e alinhamento do Popover no card |

Arquivos: `workout-page.tsx`, `workout-editor/`, `training-plan-service.ts`,
queries e handlers/fixtures `training-plans.ts`.

## Administração sem precondição de aceite

Esta rota permanece acessível a administradores autenticados sem publicação ou
aceite vigente. O menu exibe Modelos de treino e Gestão de termos; a branch `_admin`
é reconhecida pela barreira de termos e o guard de papel continua obrigatório.
Uma publicação nova não oculta formulários administrativos nem exige concordância
para continuar administrando. Funções pessoais do próprio admin ainda exigem aceite.

## Duração com mídia opcional

`DurationFields` apresenta nome, área, minutos, instruções opcionais (máximo 300)
e seletor HeroUI `Mídia demonstrativa`: `Sem mídia`, `Imagem`, `Vídeo`. O modo deriva
da mídia confirmada/draft, sem discriminador persistido. A demonstração é opcional;
`ImageFilePicker` e `ExerciseVideoPreview` preservam upload/player existentes.

Escolher modo sem conteúdo é somente draft; cancelar arquivo ou troca não apaga a
mídia confirmada. Texto/vídeo usam debounce de três segundos e a FIFO do plano.
Upload salva imagem e remove vídeo no mesmo CAS; vídeo normalizado substitui imagem
no mesmo PATCH. Escolher sem mídia limpa apenas o meio atual pela operação adequada.
Remover imagem não limpa um vídeo, limpar vídeo não apaga imagem, instruções são
independentes. O player usa o conteúdo confirmado, abre sob demanda e não controla
o cronômetro.

Pending bloqueia outra troca. Falha mantém valor/arquivo, erro persistente e retry
ou cancelamento. Conflito ou `EXERCISE_IMAGE_RESULT_UNCERTAIN` pausa a fila e exige
releitura; uploads não são repetidos automaticamente. Drafts/mídia/fila/erros
participam dos bloqueadores de navegação e reload. Recuperação descarta o draft
somente após releitura explícita; sessão encerrada impede efeitos tardios. URLs
assinadas permanecem em memória e sua renovação não sobrescreve vídeo ainda dirty.

Axios envia `X-Training-Media-Version: 1`. O seletor emite ações enumeradas
`duration_media_none|image|video`; foco/conclusão de `instructions|youtubeId` usa
`form: duration_exercise`, sem texto livre, vídeo, URLs ou arquivo em Analytics.

Cenários: `/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=duration-no-media`
e os estados de [mídia do editor pessoal](training-plan-workout.md#duração-com-mídia-opcional).
