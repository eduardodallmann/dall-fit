# Rota `/training/workout/:workoutId`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

## Objetivo funcional

- Problema resolvido: revisar, iniciar, executar, retomar ou abandonar um workout.
- Ator: pessoa autenticada com plano ativo ou sessão retomável.
- Resultado esperado: progresso confirmado na autoridade da plataforma; Web
  navega ao resumo canônico e Android retorna à lista depois do terminal local.
- Fluxo relacionado: [execução de treino](../../../../docs/sdd/flows/execucao-de-treino.md).

## Entradas e pré-condições

`workoutId` identifica um item do plano ativo. No Web, a rota combina prévia e
sessão HTTP; depois do início, o Redis permanece canônico por até 24 horas. No
Android, prévia, sessão e lease vêm do motor nativo e sobrevivem a refresh,
background, recriação do WebView e morte do processo. Existe no máximo uma sessão
por pessoa/aparelho.

## Conteúdo e caminho feliz

Antes do início, todos os exercícios aparecem em ordem com tipo e métricas; mídia
é somente preview e `Voltar para treinos` retorna à seleção. Esse retorno deixa de
ser renderizado após o início. `Iniciar treino` cria a sessão. No Android, a imagem
preparada `ready` é exibida por URI de conteúdo local; arquivo ausente ou incompleto
usa o mesmo fallback sem bloquear o exercício. Durante a execução,
somente um card fica expandido, o próximo incompleto começa aberto e conclusão
avança/foca o próximo. Toda a superfície do cabeçalho é um botão com
`aria-expanded`, operação por teclado e feedback visual de hover e active em toda
a largura do card, inclusive nas margens internas aparentes. A interação mantém a
cor desses estados sem aplicar escala ou efeito de afundamento. O botão cresce com
o conteúdo em vez de conservar a altura fixa do componente base. Em `390px`, nome
e metadados quebram linha dentro dessa superfície, sem corte, sobreposição ou
overflow horizontal, tanto aberto quanto recolhido.

Exercícios `image` e `youtube-short` mostram séries. `NumberField` não possui
botões de incremento/decremento, aceita somente inteiro entre 0 e 9999 ou vazio e
captura o texto a cada edição para salvar após 500 ms ou blur, sem depender do
commit interno do campo. Vazio não bloqueia conclusão: concluir uma série envia a
carga atual atomicamente; concluir restantes envia o vetor completo. A ação de
conclusão cancela o debounce correspondente para impedir write tardio. Sem os
steppers, o grupo do `NumberField` usa uma única coluna: o input ocupa e recebe
clique em toda a largura visível. A altura e a linha do input acompanham os 36 px
do grupo sem padding vertical adicional, mantendo valor e cursor centralizados.

Enquanto uma gravação de carga está em voo, os campos incompletos e as ações de
conclusão continuam utilizáveis. Gravações e conclusões compartilham a mesma fila
FIFO por sessão; cada item lê a versão quando chega à cabeça. A conclusão captura
o draft mais recente e respostas antigas atualizam apenas o cache canônico sem
sobrescrever um draft local posterior. Em mobile, rótulo, repetições, carga e
estado reorganizam-se em duas linhas.

`pause` e `duration` abrem timer; descanso de série/pausa pode ser pulado, duração
pode ser finalizada ou cancelada. Atividade por duração apresenta também sua
instrução e demonstração em vídeo quando fornecidas pelo plano. Timestamps do
servidor dirigem o contador Web. No Android, timestamp civil, duração e âncora de
`elapsedRealtime` persistidos recompõem o contador; background não pausa, reboot
usa fallback civil limitado e nenhum tick grava SQLite. Chegar a zero conserva o
overlay até ação explícita, sem concluir série, exercício ou treino.
`youtube-long` conclui manualmente. Exercício concluído pode ser reiniciado sem
apagar cargas. Mídia e timers usam Drawer encostado ao rodapé em mobile e Modal em
desktop. YouTube Short preserva 9:16; vídeo longo preserva 16:9; títulos podem
quebrar sem serem cortados. O cabeçalho desses overlays reserva recuo próprio no
topo e nas laterais, inclusive espaço para o botão de fechar. No Drawer, o handle
tem contraste com o fundo, fica afastado da borda superior e usa posicionamento
absoluto para não ocupar espaço nem deslocar o título.

## Alternativas, validações e erros

- Outra sessão: mostra nome atual, `Retomar treino` e descarte protegido por
  `AlertDialog`; nada é perdido antes da confirmação.
- Conflito de versão: descarta drafts e debounces, refaz GET, substitui a sessão e
  anuncia `O treino foi atualizado em outro lugar.`; não faz merge ou retry.
- Falha comum: mantém representação canônica, encerra pending e mostra toast.
- Finalização incompleta: exige confirmação `Finalizar mesmo assim`.
- Conclusão integral: abre confirmação com `Parabéns!` e bloqueia dismiss acidental.
- Draft com debounce pendente bloqueia finalização. Draft inválido, debounce ou
  mutation pendente apresenta a confirmação nativa antes de reload ou fechamento
  manual; cancelar a saída mantém a tela até a gravação terminar ou o valor ser
  corrigido.
- Carga decimal, negativa ou acima de 9999 é inválida; carga vazia é válida.

## Integrações e coordenação

Todos os endpoints de sessão estão em
[`api/docs/sdd/endpoints/training.md`](../../../../api/docs/sdd/endpoints/training.md).
Mutations TanStack Query usam um `scope` por sessão, formando fila FIFO e lendo a
versão quando cada request começa. Sucesso substitui o cache pela response
canônica. Não há atualização otimista de conclusão. Finalização limpa a query de
sessão, invalida o domínio e navega com replace.

No Android, a mesma UI consome `TrainingRepository`, mas cada ação vira uma
transação curta de sessão + `PutOfflineTrainingSnapshotV1Request`. O commit local
antecede cache, toast, foco e navegação; falha preserva a última revisão confirmada.
Cada ação incrementa uma revisão, coalesce o snapshot da execução sem mudar sua
ordem e nunca aguarda rede. Finalizar grava `completed`, remove a sessão e persiste
a projeção compacta da conclusão no mesmo commit, então volta com replace para
`/training`, sem abrir o resumo semanal. A lista distingue essa projeção do
histórico canônico até a sincronização.
Descartar grava `cancelled` da mesma forma. Expiração posterior ao início ou Bearer
ausente não interrompem a sessão; apenas um novo início exige plano e lease válidos.

## Navegação e acessibilidade

Cards são botões com `aria-expanded`; séries têm labels próprias e estados com
texto/ícone. Overlays possuem nome e controles de teclado. Após concluir o card, o
foco segue ao primeiro exercício incompleto. Reload safety cobre draft ainda não
confirmado. A página de conclusão é o avanço; voltar antes de finalizar preserva a
sessão no backend.

O `NumberField` aceita foco pelo clique em qualquer ponto de sua superfície
visível, não apenas sobre os glifos do valor.

## Analytics

Pageview normalizado: `/training/workout/:workoutId`. Eventos
`ui_training_action` usam somente enums para seleção/expansão, mídia, início,
carga, conclusão, timer, reinício, abandono e resultado. IDs, carga, nome, mídia,
body area, tempo exato e erros de campo são proibidos.

## Cenários funcionais

### Cenário 1 — prévia e finalização parcial

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=workout-preview`
- Given: cinco tipos de exercício e nenhuma sessão.
- When: inicia, deixa uma carga vazia, conclui as séries e confirma finalização
  incompleta.
- Then: sessão avança sem exigir carga e navega ao resumo parcial.

### Cenário 2 — sessão concorrente

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000102?mockAuth=person&mockTraining=session-running`
- Given: Treino A está em andamento.
- When: tenta abrir Treino B e aciona descarte.
- Then: AlertDialog permite manter ou confirmar perda antes de iniciar B.

### Cenário 3 — carga pendente e layout mobile

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=load-pending`
- Given: sessão em andamento em viewport de `390px` e PUT de carga atrasado.
- When: edita novamente a carga e conclui a série durante a primeira request.
- Then: o valor mais novo é preservado, a conclusão respeita a fila e a tela não
  produz corte, sobreposição ou rolagem horizontal.

### Cenário 4 — autosave sem blur nem conclusão

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=load-pending`
- Given: sessão em andamento e campo de carga da série ainda focado.
- When: digita uma carga válida e aguarda o debounce sem desfocar o campo nem
  concluir a série.
- Then: a UI envia o PUT da carga e mantém o valor digitado.

### Cenário 5 — execução e conclusão offline no Android

- Link para testar: não se aplica; exige bridge/SQLite Android ou repository nativo
  injetado.
- Given: plano e lease locais estão válidos no início.
- When: a pessoa inicia, altera carga, conclui exercícios e finaliza completa ou
  parcialmente sem rede.
- Then: cada feedback sucede o commit local, a sessão só desaparece no terminal,
  o snapshot `completed` permanece na fila e a navegação volta para `/training`.

### Cenário 6 — timer e retomada nativos

- Link para testar: não se aplica; relógio monotônico e recriação exigem Android.
- Given: existe sessão local com timer confirmado.
- When: o app vai ao background, o WebView é recriado ou o aparelho reinicia.
- Then: progresso e timer são recompostos sem writes por tick ou resolução
  automática, usando monotônico no mesmo boot e fallback civil limitado no reboot.

## Estrutura e cobertura

- Rota: `ui/src/routes/training/workout-page.tsx`.
- Componentes exclusivos: `media-viewer.tsx`, `timer-overlay.tsx`, `styles.ts`.
- HeroUI: `Card`, `NumberField`, `Drawer`, `Modal`, `AlertDialog`, `ProgressBar`,
  `Button`, `Chip`, `Skeleton`, toast.
- Tipos: `TrainingWorkoutPreview`, `TrainingSession`, unions de exercício/timer.
- MSW: handlers mutáveis e versionados em `ui/src/mocks/handlers/training.ts`.
- Playwright: `ui/tests/integration/routes/training.spec.ts`.

## Referências visuais de layout

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/training-workout/desktop-1440-training-workout.png` | `1440x900` | `workout-preview` | prévia completa e ação de início no desktop |
| `assets/training-workout/mobile-390-training-workout.png` | `390x844` | `workout-preview` | prévia empilhada no mobile |
| `assets/training-workout/desktop-1440-session-running.png` | `1440x900` | `sdd-session-running` | sessão, card expandido e demais exercícios |
| `assets/training-workout/mobile-390-session-running.png` | `390x844` | `sdd-session-running` | séries em duas linhas e cards móveis |
| `assets/training-workout/desktop-1440-media-modal.png` | `1440x900` | `sdd-session-running`, mídia aberta | modal, header e proporção 9:16 no desktop |
| `assets/training-workout/mobile-390-media-drawer.png` | `390x844` | `sdd-session-running`, mídia aberta | Drawer inferior, handle e mídia no mobile |
| `assets/training-workout/desktop-1440-timer-modal.png` | `1440x900` | `sdd-pause-running` | timer em Modal com progresso e ação |
| `assets/training-workout/mobile-390-timer-drawer.png` | `390x844` | `sdd-pause-running` | timer em Drawer encostado ao rodapé |
| `assets/training-workout/mobile-390-finish-incomplete-dialog.png` | `390x844` | `sdd-session-running`, finalização aberta | confirmação incompleta e ações sem corte |
