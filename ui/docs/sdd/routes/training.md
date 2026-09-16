# Rota `/training`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

## Objetivo funcional

- Problema resolvido: escolher um workout do plano em uso ou retomar a sessão.
- Ator: pessoa autenticada, inclusive administradora.
- Resultado esperado: abrir a prévia/execução correta sem editar o plano.
- Fluxo relacionado: [execução de treino](../../../../docs/sdd/flows/execucao-de-treino.md).

## Entradas e pré-condições

O item `Treinar` do menu navega para a rota. `mockAuth` e `mockTraining` existem
somente nos cenários locais. No Web, o backend deriva a pessoa, a seleção ativa e
uma eventual sessão Redis; query ou body não escolhem owner. No Android, o
repository nativo deriva esses dados do plano e da sessão vinculados à conta no
SQLite.

Web/PWA não oferece execução offline. Sem conexão, o guard global preserva
`/training`, desmonta shell e conteúdo e mostra somente `Conexão necessária`, sem
consultar sessão, plano, treino, SSE ou Analytics. Ao reconectar, a rota é remontada
e consulta novamente as autoridades online. O Android não participa dessa barreira
e conserva o caminho nativo descrito abaixo.

Antes da rota ser liberada, o Android avalia a política de compatibilidade. Uma
versão obsoleta sem sessão ativa substitui a rota pelo bloqueio global e não inicia
preparação, lease, takeover nem navegação a workout. Se a detecção ocorreu durante
um workout capturado, `/training` continua bloqueada até a atualização, inclusive
depois que o terminal local voltar a este path.

## Elementos, estados e ações

Com plano ativo, a tela mostra nome do plano, instrução `Selecione o treino` e uma
lista de cards navegáveis. Cada card contém thumbnail/fallback, nome, áreas
distintas e, quando aplicável, `Atual` ou `Em andamento`. O primeiro workout é
atual sem histórico; depois, o atual é o seguinte ao último concluído de forma
cíclica. Sessão em andamento prevalece sobre seleção e histórico.

A grade possui uma coluna em `390px` e `900px` e no máximo duas em `1440px`. O
play de vídeo fica centralizado sobre a thumbnail. Os chips usam tokens semânticos
com contraste legível nos temas claro e escuro; nomes podem ocupar duas linhas.

Sem plano, mostra `Nenhum plano em uso`, explicação e `Ir para Meus planos`. Plano
sem workouts possui empty state próprio. Loading usa skeletons. Falha mostra Alert
e retry explícito. A navegação do card conserva o seletor MSW somente quando os
mocks locais estão habilitados; uma build de produção nunca propaga
`mockTraining` para a URL.

No Android com storage nativo, a entrada dispara a preparação do plano ativo. Sem
snapshot essencial válido, o conteúdo da rota mostra um gate acessível nos estados
`preparing-data`, `expired` ou `failed`; falha oferece retry e link real para Meus
planos, sem bloquear o shell. Depois do commit essencial, mídia pendente ou
incompleta não bloqueia a lista. Os estados completos são `no-plan`,
`preparing-data`, `data-ready-media-in-progress`, `ready`,
`ready-media-incomplete`, `expired`, `takeover-required` e `failed`. Takeover só é
oferecido quando a instalação não possui sessão ou snapshot pendente; a confirmação
chama `POST /training/offline-lease/takeover` e avisa que o outro aparelho deixará
de sincronizar. Um snapshot válido não é invalidado
nem tem a validade estendida por falha de atualização. A rota renderiza a projeção
local válida mesmo sem rede enquanto uma atualização online ocorre em paralelo.
Mídia ausente, temporária ou remota offline usa fallback acessível sem bloquear.

Uma sessão local ativa marca o workout como `Em andamento` e abre um
`AlertDialog` não descartável. `Continuar treino` navega ao workout capturado;
`Descartar treino` espera o commit atômico de `cancelled`, remoção da sessão e
preservação do terminal na fila. Somente então outra execução fica livre.

Depois de uma conclusão Android, a rota mostra um único card compacto da conclusão
local mais recente. Enquanto o snapshot aguarda envio, o card diz `Aguardando
sincronização` e contém somente workout, instante e contagem integral/parcial; não
estima semana ou histórico. O resumo canônico da mesma execução substitui o card no
lugar. Uma resposta de execução anterior não altera uma conclusão local posterior.

A menor ação pendente da fila abre uma superfície não descartável. Conflito compara
os envelopes completos local e servidor, permite escolher uma versão e exige uma
segunda confirmação antes de reenfileirar com o token observado. Execução terminal
imutável permite somente descartar a revisão local. Lease expirado ou revogado
permite somente limpar sessão, snapshots, plano, arquivos e apresentação cercados
pelo fence antigo; esses dados nunca participam de takeover posterior. Token de
conflito obsoleto remove a escolha e reapresenta o conflito corrente.

Após a primeira preparação essencial bem-sucedida, o Android explica e solicita
uma única vez a permissão opcional de notificações. Negar não bloqueia treino nem
sync. Com permissão, login ou conflito detectado sem o app visível produz uma única
notificação genérica cujo toque abre o app e provoca nova leitura do SQLite.

## Integração

- No Web, `GET /training`, documentado em
  [`training.md`](../../../../api/docs/sdd/endpoints/training.md).
- TanStack Query distingue `web | native` na key. O adapter Web usa o Axios
  central; Android usa `NativeTrainingRepository` e não alterna para HTTP por
  ação.
- O coordenador Android consulta os mesmos endpoints, com concorrência máxima de
  quatro, e persiste somente o payload de domínio e `fileId` da mídia display.
- Sucesso utiliza `TrainingOverview`; erro não promove cache anterior a sucesso.
- Ativar um plano em `/training-plan` remove todas as queries `trainingKeys` antes
  de invalidar o catálogo; a próxima navegação sempre lê a seleção canônica, mesmo
  que esta rota tenha armazenado anteriormente o estado sem plano.

## Navegação e acessibilidade

Cards são links reais na lista ordenada `Treinos do plano`. Indicadores não são a
única identificação do card. Ação vazia navega para `/training-plan`; workout
navega para `/training/workout/:workoutId`. O voltar do navegador retorna ao shell
sem persistência local de sessão.

## Analytics

O pageview usa `/training`. Seleção emite `ui_training_action` com
`select_workout`; retry usa `retry`. O menu emite `ui_navigation_selected` com
`training_link`. Nenhum ID, nome, área, query de mock ou conteúdo é enviado.
Enquanto o hint Web/PWA está offline, pageview e eventos são descartados antes do
SDK e não são reproduzidos ao reconectar.

## Cenários funcionais

### Cenário 1 — plano ativo

- Link para testar: `http://localhost:3000/training?mockAuth=person&mockTraining=active-plan`
- Given: plano com três workouts e nenhum treino em andamento.
- When: a rota abre.
- Then: os cards aparecem e somente `Treino A` contém `Atual`.

### Cenário 2 — sem plano

- Link para testar: `http://localhost:3000/training?mockAuth=person&mockTraining=no-active-plan`
- Given: seleção ativa ausente.
- When: a rota abre.
- Then: a pessoa recebe orientação para Meus planos.

### Cenário 3 — ativação após estado vazio

- Link para testar: comece pelo cenário anterior e navegue por `Ir para Meus
  planos`.
- Given: a UI armazenou uma resposta sem plano ativo.
- When: a pessoa marca um plano como em uso e volta para Treinar.
- Then: o cache antigo é removido, a API é consultada novamente e o plano ativado
  aparece.

### Cenário 4 — listagem offline e retomada obrigatória no Android

- Link para testar: não se aplica; exige bridge/SQLite Android ou repository nativo
  injetado.
- Given: existe plano preparado válido e uma sessão local ativa.
- When: a pessoa abre Treinar sem rede.
- Then: a lista local aparece e exige `Continuar treino` ou `Descartar treino`, sem
  request da jornada nem dismiss acidental.

### Cenário 5 — conexão necessária fora da jornada suportada

- Link para testar: não se aplica; depende da capability e conectividade Android
  injetadas.
- Given: o Android está offline em uma rota autenticada não suportada.
- When: existe plano local válido ou ele está ausente/incompatível.
- Then: o primeiro caso substitui a rota por `/training`; o segundo mantém uma
  superfície acessível de conexão necessária, sem loop ou destino persistido.

### Cenário 6 — PWA sem conexão não oferece treino offline

- Link para testar: não se aplica — o início offline com app shell real é coberto
  por `pnpm test:pwa-update`; a queda posterior é coberta no Playwright.
- Given: a PWA está em `/training` sem conexão.
- When: o guard global avalia o hint offline.
- Then: preserva a URL e mostra somente `Conexão necessária`, sem plano, cards,
  sessão, requests privados ou cache de dados.
- And: a cópia direciona explicitamente a jornada offline ao aplicativo Android;
  reconectar remonta a rota online.

## Estrutura e cobertura

- Rota: `ui/src/routes/training/overview-page.tsx`.
- Barreira Web/PWA: `ui/src/core/components/web-connectivity-guard/index.tsx` e
  `ui/src/core/connectivity/index.ts`.
- HeroUI: `Card`, `Chip`, `Button`, `Alert`, `Skeleton`.
- Service/queries: `training-service.ts` e `training-queries.ts`.
- Tipos: `TrainingOverview`, `TrainingWorkoutCard`.
- MSW: `ui/src/mocks/handlers/training.ts` e fixture homônima.
- Playwright: `ui/tests/integration/routes/training.spec.ts`.

## Referências visuais de layout

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/training/desktop-1440-training.png` | `1440x900` | `active-plan` | plano em uso e grade limitada a duas colunas |
| `assets/training/mobile-390-training.png` | `390x844` | `active-plan` | cards em coluna única no mobile |
| `assets/training/mobile-390-no-active-plan.png` | `390x844` | `no-active-plan` | empty state e ação para Meus planos |
