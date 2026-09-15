# Feature Spec: Integrar resumo provisório, takeover e conflitos na UI

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #90](https://github.com/eduardodallmann/dall-fit/issues/90).
- Problema: o Android já executa treinos sobre SQLite, conserva conclusões e
  cancelamentos na fila e tenta sincronizá-los em foreground e pelo WorkManager.
  Porém, a conclusão offline apenas retorna à seleção sem confirmação persistente,
  o sincronizador expõe somente uma flag genérica de ação necessária e nenhum fluxo
  permite reautenticar, assumir um lease em uma instalação nova, comparar versões
  completas ou descartar com segurança dados que não podem mais ser importados.
- Resultado: a conclusão Android retorna diretamente para `/training`, sem abrir a
  tela semanal, e mostra na própria lista um registro compacto da última conclusão,
  inequivocamente provisório enquanto aguarda sincronização. A resposta canônica
  substitui esse registro por identidade, sem duplicá-lo e sem toast de sucesso.
  A aplicação apresenta uma ação pendente por vez para login, takeover inicial,
  conflito ou descarte obrigatório; escolhas destrutivas são confirmadas e
  atualizadas no SQLite antes de retomar o mesmo sincronizador. Notificações Android
  são opcionais, contextuais e usadas somente para chamar a pessoa quando uma ação
  é necessária.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [governança do SDD](../base/04-governanca-do-sdd.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [rotas e comportamento](../../../ui/docs/sdd/base/02-rotas-e-comportamento.md);
  - [componentes e estilização](../../../ui/docs/sdd/base/03-componentes-e-estilizacao.md);
  - [testes e qualidade](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [mocks de API](../../../ui/docs/sdd/base/05-mocks-de-api.md);
  - [referências visuais](../../../ui/docs/sdd/base/06-referencias-visuais-de-layout.md);
  - [testes Playwright](../../../ui/docs/sdd/base/07-testes-integrados-playwright.md);
  - [rota Treinar](../../../ui/docs/sdd/routes/training.md);
  - [rota de execução](../../../ui/docs/sdd/routes/training-workout.md);
  - [rota de conclusão](../../../ui/docs/sdd/routes/training-completion.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [endpoint de lease](../../../api/docs/sdd/endpoints/offline-training-lease.md);
  - [endpoint de snapshot](../../../api/docs/sdd/endpoints/offline-training-snapshot.md);
  - [ADR-0010 — sessão efêmera e histórico](../adr/ADR-0010-sessao-efemera-e-historico-de-treino.md);
  - [ADR-0012 — Capacitor e fronteira de plataforma](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md);
  - [ADR-0013 — sessões Web e nativas](../adr/ADR-0013-sessoes-web-e-native-isoladas.md);
  - [ADR-0014 — motor nativo](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [ADR-0015 — lease offline](../adr/ADR-0015-lease-offline-de-treino-no-redis.md);
  - [permissão de notificações no Android](https://developer.android.com/develop/ui/compose/notifications/notification-permission);
  - [criação de notificações no Android](https://developer.android.com/develop/ui/compose/notifications/create-notification).
- Features relacionadas: [FIT-0081](fit-0081-login-isolamento-conta-android.md)
  preserva pendências ao reautenticar a mesma conta; [FIT-0084](fit-0084-lease-redis-plano-instalacao-pessoa.md)
  fornece registro e takeover; [FIT-0086](fit-0086-finalizar-cancelar-resolver-conflitos-execucoes-offline.md)
  fornece terminais, resumo canônico, comparação e imutabilidade;
  [FIT-0087](fit-0087-sincronizador-primeiro-plano.md) persiste os estados de ação;
  [FIT-0088](fit-0088-sincronizar-workmanager-app-fechado.md) os detecta sem
  WebView; e [FIT-0089](fit-0089-adaptar-jornada-treinar-execucao-offline.md)
  produz as conclusões locais. A issue 92 continua proprietária da política de
  versão mínima, migração e ação de atualização obrigatória.

As versões verificadas no planejamento são Capacitor `8.5.2`, React `19.2.8`,
TanStack Query `5.101.4`, TanStack Router `1.170.18`, Axios `1.18.1`, HeroUI
`3.2.2`, WorkManager `2.11.2`, Android mínimo API 29 e target/compile SDK 36. Em
Android 13 ou superior, notificações comuns exigem `POST_NOTIFICATIONS` em runtime;
o target vigente permite escolher o momento contextual do pedido. Android 8 ou
superior exige canal, e toda notificação recebe uma ação de toque que abre o app.
Alertas destrutivos usam `AlertDialog` HeroUI não descartável, conforme o catálogo
vigente, sem criar um componente básico paralelo.

## Escopo

### Incluído

- criar uma projeção local mínima da última conclusão Android, persistida no motor
  e separada do snapshot destinado ao backend;
- depois do terminal `completed`, navegar diretamente para `/training` e apresentar
  nessa rota um card compacto, sem tela ou seção de resumo semanal;
- marcar o card como `Aguardando sincronização` enquanto provisório e nunca
  apresentá-lo como item confirmado do histórico;
- capturar o `WorkoutExecutionSummary` devolvido por `completed`,
  `duplicate-completed` ou resolução terminal e substituir atomicamente o conteúdo
  provisório da mesma execução pelo canônico;
- preservar uma única apresentação da última conclusão: uma resposta antiga não
  substitui uma conclusão local posterior e a versão canônica nunca cria outro card;
- evoluir a bridge com leitura tipada da próxima ação necessária e comandos coesos
  de resolver conflito, descartar o alvo e limpar todos os dados cercados por um
  lease inválido;
- apresentar autenticação necessária, takeover inicial, conflito editável,
  imutabilidade terminal, lease revogado e lease expirado sem expor a máquina de
  estados técnica da fila;
- reautenticar por gesto explícito e retomar a fila apenas quando a API confirmar a
  mesma pessoa; a política vigente limpa outra conta antes de ativá-la;
- permitir takeover somente durante a preparação de uma instalação sem sessão ou
  snapshot pendente, com confirmação explícita de que o outro aparelho deixará de
  sincronizar;
- para aparelho revogado, oferecer exclusivamente descarte dos dados locais; depois
  da limpeza, uma preparação futura poderá apresentar um novo takeover, mas os dados
  descartados nunca atravessam a nova concessão;
- para lease expirado, oferecer exclusivamente descarte de sessão, snapshots, plano
  e apresentação local vinculados ao fence antigo;
- comparar em conflito o estado local e a versão completa segura do servidor,
  incluindo plano/workout, estado, revisão, horários, exercícios, séries, cargas e
  timer, em painéis rotulados e navegáveis no mobile e desktop;
- permitir escolher integralmente `Usar dados deste aparelho` ou `Usar dados do
  servidor`, exigir confirmação do descarte da outra versão e reenfileirar a mesma
  execução com o token observado;
- diante de token obsoleto, buscar/apresentar o conflito corrente sem aplicar a
  escolha anterior nem fechar a superfície como sucesso;
- diante de execução já concluída ou cancelada no servidor, impedir escolha local,
  explicar a imutabilidade e remover a versão local somente após confirmação;
- solicitar permissão de notificação uma única vez, de forma contextual, na primeira
  preparação essencial bem-sucedida da instalação e nunca condicionar offline, fila
  ou sincronização à resposta;
- criar uma notificação Android discreta e deduplicada quando WorkManager ou
  foreground detectarem autenticação ou conflito que exija ação sem a aplicação
  visível; o toque apenas abre o app, cuja leitura canônica decide a superfície;
- manter sync comum, retries, sucesso, erro permanente isolado e descarte silencioso
  sem toast, badge global, notificação ou Analytics persistido;
- acrescentar testes de acessibilidade, navegação, concorrência, escolhas destrutivas,
  permissão e lifecycle em Vitest, Playwright e Android instrumentado;
- atualizar os SDDs vivos e o fluxo somente durante a futura implementação
  autorizada.

### Não incluído

- abrir `/training/completion/:workoutExecutionId` ou reproduzir a tela semanal
  depois de uma conclusão Android; essa rota permanece no caminho online Web/PWA;
- estimar ou exibir semana, frequência semanal ou posição no histórico antes da
  resposta canônica;
- criar histórico local navegável, lista técnica, central de pendências, badge com
  contagem ou tela geral de sincronização;
- exibir todas as conclusões pendentes: a fila conserva todas, mas a apresentação
  compacta pertence apenas à conclusão local mais recente;
- merge campo a campo, importação como outra execução, edição dentro da comparação
  ou escolha automática entre versões;
- permitir que dados de lease revogado ou expirado façam takeover, recebam novo
  fence ou sincronizem depois da decisão desta feature;
- transferir dados entre aparelhos, identificar o editor anterior ou recuperá-lo
  pelo backend;
- alterar os endpoints, contratos compartilhados, cálculo canônico, recibos,
  política de retry, ordem da fila ou WorkManager;
- implementar a política de versão mínima, deep link da loja ou fluxo final de
  `update-required`, pertencentes à issue 92; a categoria continua reservada e não
  pode ser usada para mensagem genérica;
- notificar progresso, sucesso, retry, modo offline, plano preparado ou natureza
  best-effort do WorkManager;
- push remoto, Firebase Cloud Messaging, foreground service, notificação
  persistente, ação inline, iOS ou notificações Web/PWA;
- persistir logs, Analytics offline, conteúdo de treino ou identificadores em
  notificação;
- criar ou atualizar screenshots: as referências atuais serão apenas preservadas e
  verificadas nos estados equivalentes.

## Projetos e documentação afetados

- API e endpoints: nenhum código ou comportamento HTTP muda. A UI passa a consumir
  `POST /training/offline-lease/takeover`; o transporte nativo passa a conservar a
  response de sucesso já documentada de `PUT /training/offline-snapshot`.
- UI e rotas:
  - `/training` recebe o card compacto da última conclusão, o takeover durante
    preparação e o host das ações necessárias;
  - `/training/workout/:workoutId` passa a retornar ao card provisório depois do
    commit terminal, sem mudar o fluxo Web;
  - `/` reutiliza o login Google nativo para recuperar a mesma conta e informa que
    existem dados aguardando envio, sem expor seu conteúdo;
  - `/training/completion/:workoutExecutionId` permanece exclusivamente canônica e
    online; sua documentação registra que Android não a abre nesta jornada;
  - o shell Android observa a próxima ação canônica, mas componentes de plataforma
    não importam rotas e Web/PWA não registram a capability.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` com apresentação local,
  substituição canônica, login, takeover, comparação e descartes.
- Contratos em `@dall-fit/types`: nenhuma alteração. Reutilizar
  `OfflineTrainingSnapshotConflictDetails`, `OfflineTrainingSnapshotResult`,
  `OfflineTrainingLeaseResponse` e `WorkoutExecutionSummary`; projeções da bridge,
  permissão e card permanecem exclusivas da UI.
- Decisões arquiteturais: ADR-0012, ADR-0014 e ADR-0015 já determinam adapters,
  fonte SQLite e editor único. Atualizá-las apenas se a implementação introduzir
  consequência arquitetural nova; não se espera ADR adicional.
- Handlers e fixtures MSW: estender o grupo de treino com takeover, resposta
  canônica e estados nativos injetáveis de login, conflito, imutabilidade,
  revogação e expiração. O browser não simula plugin por request HTTP.
- Mocks de repositories/caches nos unitários da API: não afetados.
- Fixtures MongoDB/Redis nos E2E: não afetadas; os E2E atuais continuam
  proprietários dos contratos reais.
- Android: migration incremental, projeção da última conclusão, detalhes/commands
  de ação, parser da response, notificação local, canal e permissão runtime.

## Modelo local e coordenação

1. O snapshot continua sendo a única fonte do upload. A apresentação de conclusão
   é uma projeção pequena e não pode ser reenviada como dado de domínio.
2. O commit terminal grava atomicamente o snapshot `completed`, remove a sessão e
   registra a apresentação provisória da mesma `executionId` e `queue_sequence`.
   Ela contém somente nome do workout, conclusão integral/parcial, quantidade de
   exercícios concluídos/total e instante local; não calcula semana, carga, duração
   ou outra métrica que o usuário possa confundir com resultado canônico.
3. Existe no máximo uma apresentação visível por conta: a maior sequência local.
   Conclusões anteriores continuam na fila sem formar uma lista visual.
4. O transporte valida o sucesso como hoje e entrega ao storage, na mesma transição
   que remove o snapshot, o resumo canônico opcional. Somente a response da
   `executionId` que ainda é a última substitui o provisório; sucesso de outra
   execução não apaga nem regride o card atual.
5. Resultado concluído substitui o conteúdo pelo `WorkoutExecutionSummary` seguro,
   sem criar outra linha. Cancelamento, escolha do servidor sem conclusão e sucesso
   de outro item apenas aplicam a limpeza de fila correspondente.
6. A projeção canônica local é dispensável: limpeza de conta a remove, e falha em
   promovê-la não pode repetir ou desfazer um terminal aceito. O commit de remoção
   do snapshot e captura do resumo deve, porém, ser transacional no SQLite para não
   perder a substituição em uma resposta observada.
7. A próxima ação necessária é escolhida pela menor `queue_sequence` e devolve
   categoria fechada, revisão esperada, snapshot local e detalhe seguro aplicável.
   Nenhum método expõe SQL, Bearer, pessoa, lease, path ou todas as pendências.
8. O evento `syncStateChanged` permanece hint. Abertura, resume, toque da
   notificação e fechamento de overlay sempre consultam novamente a ação canônica;
   eventos atrasados não reabrem item já resolvido.
9. Resolver conflito grava `resolution` no envelope completo existente, confronta
   execução, revisão e categoria, troca `action_required` por `pending` e preserva
   a sequência. O motor vigente faz o upload; a UI nunca chama o endpoint de
   snapshot pelo Axios.
10. Descartar por imutabilidade remove somente a execução/revisão apresentada e
    aplica eventual resumo canônico recebido no detalhe. Descartar lease expirado
    ou revogado limpa em uma operação coordenada a sessão, todos os snapshots,
    estados, plano, arquivos e apresentação vinculados à concessão inválida.

## Requisitos funcionais

1. Depois de concluir no Android, o diálogo fecha somente após o commit local e a
   navegação usa `replace` para `/training`. A listagem mostra o card provisório no
   primeiro render reparado pelo SQLite, inclusive após refresh ou morte do WebView.
2. O card usa texto explícito `Aguardando sincronização`; cor ou ícone são apenas
   complementares. Não contém semana nem afirma que o histórico foi confirmado.
3. A promoção canônica acontece sem toast, notificação ou navegação. Se o card ainda
   representa a mesma execução, seu status e conteúdo mudam no lugar; caso contrário,
   a response antiga não altera a conclusão mais recente.
4. `authentication-required` preserva todos os dados e leva à entrada nativa por
   ação explícita. Login da mesma pessoa rearma o sync; login de outra pessoa segue
   a limpeza atômica vigente e não mostra conteúdo da conta anterior.
5. `OFFLINE_LEASE_TAKEOVER_REQUIRED` durante preparação apresenta plano de ação
   apenas quando não há sessão nem snapshot local. Confirmar chama
   `POST /training/offline-lease/takeover`, bloqueia duplicidade, persiste o novo
   fence antes de liberar o plano e retoma a preparação. Cancelar mantém o outro
   aparelho como editor e bloqueia novo treino offline nesta instalação.
6. Se houver dado local, a aplicação nunca usa takeover para torná-lo válido. Uma
   instalação revogada recebe somente `Descartar dados deste aparelho`; após a
   confirmação e limpeza, poderá iniciar outra preparação sem transportar o estado
   antigo.
7. Lease expirado usa a mesma ação exclusiva de descarte. Não existe login, retry,
   renovação ou novo registro capaz de importar os snapshots antigos.
8. O conflito abre comparação completa em duas representações rotuladas. Em mobile,
   a pessoa alterna entre painéis sem perder a escolha; em desktop, ambos podem ser
   comparados lado a lado. Conteúdo grande rola dentro de uma superfície com título
   e ações sempre alcançáveis.
9. Escolher local ou servidor não aplica imediatamente. Um `AlertDialog` explica
   qual versão será descartada, recebe foco previsível e exige confirmação. Pending
   impede segunda submissão e fechamento destrutivo; falha preserva comparação,
   escolha e retry.
10. `conflict-stale` não reutiliza o token. O sincronizador obtém o conflito atual,
    e a UI substitui os painéis somente depois da nova leitura persistida.
11. `discard-local-only` nunca renderiza controle para escolher local. Se existe
    conclusão canônica no detalhe, ela substitui o provisório correspondente; o
    snapshot local só é removido após confirmação.
12. Ações são processadas uma por vez. Resolver ou descartar uma faz nova leitura e
    apresenta a próxima, sem depender de ordem de eventos ou abrir overlays
    empilhados.
13. Na primeira preparação essencial concluída, a UI explica que notificações serão
    usadas apenas quando houver ação necessária e oferece `Permitir notificações`
    ou `Agora não`. O primeiro botão aciona a permissão do sistema quando exigida.
14. Recusa, dismiss ou notificações desabilitadas são estados válidos. Não repetir
    automaticamente o prompt, não degradar treino/sync e não mostrar erro; uma
    futura gestão manual fica fora desta feature.
15. O canal possui importância padrão ou menor, nome funcional estável e conteúdo
    genérico. A notificação não contém workout, pessoa, ID, carga, horário, conflito
    ou quantidade de pendências e é deduplicada por categoria/estado vigente.
16. O toque abre a Activity existente e marca somente a intenção de consultar o
    estado. A UI autenticada abre a ação correspondente; sem sessão, apresenta
    login. A notificação não carrega snapshot, token ou rota privada sensível.
17. Takeover detectado com o app visível usa somente a superfície da preparação.
    Atualização obrigatória continua reservada à issue 92. Não produzir uma
    notificação sem ação implementada.
18. Web/PWA conserva o repository HTTP, a conclusão semanal atual e nenhuma
    permissão, canal, SQLite, bridge ou apresentação provisória nativa.

## Requisitos não funcionais

- Acessibilidade:
  - card provisório/canônico possui status textual anunciado sem região viva
    repetitiva;
  - overlays têm heading, descrição, foco inicial, ordem de tabulação e retorno de
    foco previsíveis;
  - comparadores não dependem de cor/posição e anunciam `Neste aparelho` e
    `Servidor` em cada seção;
  - confirmações destrutivas não fecham por backdrop ou Escape e usam ações com
    nomes inequívocos;
  - atualização de estado não rouba foco nem reabre superfície já resolvida.
- Performance:
  - leitura materializa somente a última apresentação e uma ação por vez;
  - comparação completa permanece sob o limite de 1 MiB do endpoint e não duplica
    o payload em estado global, Analytics ou notificação;
  - transações SQLite são curtas e nunca mantêm lock durante HTTP, render ou espera
    humana.
- Segurança e privacidade:
  - detalhes completos ficam no SQLite privado e em memória somente enquanto a
    superfície existe;
  - Bearer, fence, token de conflito, IDs, nomes, cargas, horários e payloads não
    entram em logs, notification extras, título/corpo da notificação ou Analytics;
  - intents são explícitos e imutáveis; nenhuma URI externa recebe estado privado;
  - banco, apresentação e notificações não alteram as exclusões de backup vigentes.
- Observabilidade:
  - métodos nativos seguem `NomeDaClasse -> nomeDoMetodo -> etapa:` e registram
    somente categoria, escolha enumerada, revisão técnica e resultado sanitizado;
  - permissão, publicação/deduplicação, abertura, resolução e limpeza distinguem
    sucesso/falha sem conteúdo;
  - operação normal, sync bem-sucedido e erro bloqueado descartado permanecem
    silenciosos.
- Resiliência e concorrência:
  - comandos usam execução + revisão esperada; callback tardio não remove ação ou
    apresentação mais nova;
  - confirmação fecha somente depois do commit local ou response de takeover;
  - morte entre escolha e upload deixa o envelope resolvido como `pending`, seguro
    para o Worker existente;
  - falha de notificação nunca altera fila nem ação canônica.
- Compatibilidade: migration Android é incremental e imutável após distribuição;
  API 29+ não pede runtime permission inexistente, API 33+ usa
  `POST_NOTIFICATIONS`, e Web/gates sem Android SDK continuam executáveis.
- Limite de execução: a implementação deve caber em uma sessão de até cinco horas,
  reutilizando rota, componentes HeroUI, snapshot, `action_details_json`, fila,
  transporte, WorkManager, endpoint de takeover e login existentes. Não inclui
  histórico local, tela semanal nativa, backend, merge, política de update ou nova
  dependência de push. Se a implementação exigir qualquer um desses itens, a
  demanda volta ao refinamento e deve ser dividida antes da ampliação.

## Critérios de aceite

### Cenário 1 — conclusão offline retorna à lista com estado provisório

- Forma de validar: Playwright com repository nativo injetável e teste Android com
  SQLite real; link isolado não reproduz a bridge.
- Given: existe uma sessão Android que pode ser concluída offline.
- When: a pessoa confirma a conclusão e o terminal recebe commit.
- Then: a UI usa `replace` para `/training`, não abre a tela semanal e mostra um
  único card compacto com a conclusão local marcada `Aguardando sincronização`.

### Cenário 2 — resposta canônica substitui sem duplicar

- Forma de validar: teste Android do transporte/storage e Playwright da listagem.
- Given: o card provisório representa a execução ainda mais recente.
- When: o backend devolve `completed` ou `duplicate-completed` com resumo canônico.
- Then: a mesma apresentação é substituída atomicamente, sem segundo card, toast,
  notificação ou navegação e sem apresentar dados semanais provisórios.

### Cenário 3 — resposta antiga não regressa a última conclusão

- Forma de validar: teste Android com duas conclusões locais e respostas ordenadas.
- Given: A e depois B foram concluídas, e o card mostra B.
- When: A sincroniza antes de B.
- Then: A sai da fila sem substituir ou remover B; somente a resposta de B pode
  promover o card atual.

### Cenário 4 — autenticação expirada preserva e retoma

- Forma de validar: Vitest do coordenador e teste de componente/login nativo.
- Given: há pendências e o sync exige autenticação.
- When: a pessoa entra novamente com a mesma conta.
- Then: dados permanecem locais, a nova credencial rearma a fila e nenhuma escolha
  ou limpeza ocorre antes da identidade canônica ser confirmada.

### Cenário 5 — instalação nova assume explicitamente

- Forma de validar: Playwright/Vitest com handler MSW de takeover e estado nativo
  sem pendências.
- Given: a preparação recebe `OFFLINE_LEASE_TAKEOVER_REQUIRED` e este aparelho não
  possui sessão nem snapshot.
- When: a pessoa confirma `Assumir neste aparelho`.
- Then: o endpoint de takeover é chamado uma vez, o novo fence é persistido antes
  da preparação e cancelar teria preservado o editor anterior.

### Cenário 6 — aparelho revogado só descarta

- Forma de validar: Playwright da confirmação e teste Android da limpeza.
- Given: uma execução local recebe `OFFLINE_LEASE_REVOKED`.
- When: a ação é apresentada.
- Then: não existe takeover nem retry; a única continuação é confirmar o descarte
  coordenado dos dados locais, sem enviar qualquer snapshot sob outro fence.

### Cenário 7 — lease expirado só descarta

- Forma de validar: teste parametrizado da mesma superfície e transação nativa.
- Given: uma ou mais pendências pertencem a um lease expirado.
- When: a pessoa abre a ação necessária.
- Then: somente o descarte total da concessão antiga fica disponível; cancelar
  preserva os dados bloqueados e confirmar limpa tudo antes de nova preparação.

### Cenário 8 — conflito compara versões completas

- Forma de validar: Playwright mobile/desktop com estado nativo injetado.
- Given: o sincronizador persistiu versão local e `serverVersion` segura.
- When: a comparação abre.
- Then: os dois estados completos aparecem rotulados, acessíveis e sem edição;
  todos os exercícios, séries, cargas, timers, revisões e horários podem ser
  inspecionados sem overflow ou perda da ação.

### Cenário 9 — escolha integral exige confirmação e sobrevive à morte

- Forma de validar: Playwright dos dois choices e teste Android reiniciando o
  processo depois do commit da resolução.
- Given: existe conflito corrente com token válido.
- When: a pessoa escolhe local ou servidor e confirma o descarte da outra versão.
- Then: o envelope completo recebe a resolução por CAS, volta a `pending` na mesma
  sequência e o Worker pode concluí-lo sem WebView; nenhuma versão é mesclada.

### Cenário 10 — token obsoleto não aplica escolha antiga

- Forma de validar: teste Android do transporte e Playwright de atualização do
  overlay.
- Given: o servidor mudou depois que a comparação foi aberta.
- When: a resolução recebe conflito/token stale.
- Then: a escolha não é aplicada, a versão corrente substitui a comparação e a
  pessoa precisa decidir novamente.

### Cenário 11 — terminal canônico é imutável

- Forma de validar: Playwright com `discard-local-only` e teste Android de CAS.
- Given: o servidor já concluiu ou cancelou a execução.
- When: a ação necessária abre.
- Then: não existe escolha local; após confirmação, somente o snapshot local é
  removido e eventual resumo canônico substitui a apresentação correspondente.

### Cenário 12 — permissão recusada não reduz capacidade

- Forma de validar: teste Android API 33+ com permissão negada e teste de
  coordenador.
- Given: a primeira preparação essencial terminou e a pessoa recusa notificações.
- When: executa, conclui, sincroniza ou resolve uma ação pela interface.
- Then: todos os fluxos continuam disponíveis, o pedido não reaparece
  automaticamente e nenhuma falha de permissão vira erro funcional.

### Cenário 13 — WorkManager notifica somente ação útil

- Forma de validar: teste Android com `NotificationManager`, app em background e
  permissão concedida.
- Given: o Worker encontra autenticação ou conflito que exige ação.
- When: termina sem retry automático.
- Then: existe uma notificação genérica e deduplicada cujo toque abre o app e
  provoca leitura canônica; sucesso, retry, pending comum e erro bloqueado não
  notificam.

### Cenário 14 — Web/PWA permanece canônico e online

- Forma de validar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=workout-preview`
  e Playwright vigente.
- Given: a aplicação não está no Android nativo.
- When: a pessoa conclui um treino.
- Then: continua navegando para `/training/completion/:workoutExecutionId`, sem
  SQLite, takeover nativo, card provisório ou pedido de notificação.

## Estratégia de entrega e compatibilidade

1. Acrescentar migration e primitives da projeção de conclusão e das ações sem
   mudar primeiro a apresentação; preservar snapshots e `queue_sequence` vigentes.
2. Evoluir parser/resultado do transporte e `completeSync` para promover o resumo
   por execução + revisão, mantendo idempotência e classificação HTTP atuais.
3. Expor pela bridge somente próxima ação, resolução e descarte coesos; integrar o
   coordenador global com leitura em mount/resume e teardown de sessão.
4. Integrar card, comparação e confirmações HeroUI às rotas compartilhadas,
   mantendo branches Web e Android explicitamente separados pela composição.
5. Adicionar o consumo Axios do takeover e retomar a preparação apenas depois da
   response/persistência canônicas.
6. Adicionar canal, permissão contextual e notificador nativo deduplicado, sem
   dados funcionais em intents e sem transformar notificação em fonte de estado.
7. Atualizar testes e SDDs vivos, verificar as referências visuais existentes,
   revisar código sem uso em API/UI e executar os gates aplicáveis.

O rollout preserva pendências existentes. A migration cria projeções vazias e
mantém `action_details_json`; ações já persistidas passam a ser legíveis quando
seus detalhes são suficientes. Se uma ação legada não possuir detalhe seguro para
comparação, ela continua bloqueada e solicita nova passagem para obter o conflito
corrente, sem descarte automático. Rollback depois da migration segue o reset de
downgrade já documentado e não pode ser usado como estratégia de release com
pendências reais.

## Plano de testes

- Vitest e Testing Library:
  - reducer/projeção provisória, promoção canônica e resposta antiga;
  - coordenador de ação em mount, resume, evento perdido, uma ação por vez e
    teardown;
  - login da mesma conta, takeover sem pendência e bloqueio com pendência;
  - comparação completa, tabs mobile, foco, teclado, pending, falha e retry;
  - confirmações de escolha, imutabilidade, revogação e expiração;
  - card/status sem semana provisória e branch Web inalterada;
  - prompt contextual, recusa e ausência de capability no Web.
- MSW e Playwright:
  - takeover com sucesso, falha, latência e prevenção de duplicidade;
  - conclusão Android injetável → card provisório → substituição no lugar;
  - A/B com resposta antiga, refresh da lista e ausência de tela semanal;
  - autenticação, conflito local/servidor, token stale e terminal imutável;
  - revogado/expirado com cancelamento e confirmação de descarte;
  - acessibilidade e responsividade em `390x844` e `1440x900`;
  - regressão completa da conclusão Web canônica.
- Java/Android instrumentado:
  - migration com snapshots/action details existentes;
  - commit terminal + projeção e promoção na remoção condicionada;
  - duas conclusões, resposta tardia, replay e morte entre escolha/upload;
  - leitura da menor ação, CAS, resolução e limpezas restrita/total;
  - canal idempotente, permissão API 29/33+, deduplicação, app visível e tap;
  - notificação sem conteúdo privado e falha incapaz de alterar a fila.
- Validação manual:
  - APK debug em API 29+ e API 33+ com modo avião, conclusão e reconexão;
  - app fechado diante de conflito/401, notificação permitida e recusada;
  - takeover em instalação limpa e descarte no aparelho revogado;
  - inspeção de SQLite, notification extras e logcat sem credencial ou conteúdo;
  - comparação com as referências de layout vigentes das rotas `training`,
    `training-workout` e `training-completion`, apenas nos estados equivalentes.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`;
  - `pnpm android:sync`;
  - `pnpm android:build:debug`;
  - `pnpm android:test` em dispositivo ou emulador conectado.

`pnpm -C api test:e2e` não é exigido enquanto endpoint, wiring, MongoDB e Redis do
backend permanecerem inalterados.

## Riscos e decisões

- Foi decidido não abrir nem reproduzir a tela semanal no Android offline. O card
  compacto em `/training` satisfaz a confirmação provisória sem sugerir histórico
  que somente o backend pode calcular.
- A projeção guarda somente a última conclusão apresentada. A fila continua
  preservando todas as execuções; mostrar uma lista seria um centro de pendências ou
  histórico local fora do escopo.
- O resumo canônico é capturado antes de remover o snapshot porque depois do
  sucesso não existe outra consulta HTTP por `executionId` local. A promoção por
  identidade impede duplicação e regressão quando várias conclusões aguardam.
- Revogação foi deliberadamente equiparada à expiração na recuperação dos dados
  locais: somente descarte. O aparelho pode disputar um takeover apenas depois de
  limpar a concessão anterior, nunca para importar seus snapshots.
- Takeover só existe para instalação sem pendência. Isso mantém a promessa de
  editor único e evita apresentar uma confirmação que pareça transferir conteúdo
  do aparelho anterior.
- A comparação usa versões completas porque o backend não oferece diff semântico e
  a decisão confirmada proíbe merge. O token de CAS impede agir sobre uma versão
  diferente da inspecionada.
- Notificação é chamada, não estado. Conteúdo genérico protege privacidade; a UI
  sempre relê SQLite ao abrir e pode não mostrar nada se a ação já foi resolvida.
- O prompt ocorre após benefício concreto — primeira preparação — e uma única vez.
  A documentação oficial do Android permite ao app com target atual controlar esse
  momento e exige que recusa permaneça uma escolha válida.
- `update-required` permanece reservado, mas não recebe superfície incompleta nesta
  feature. A issue 92 deve reutilizar a capability somente quando sua ação da Play
  Store e política de migração existirem.
- O limite de cinco horas depende de reaproveitar o plugin local, o campo de detalhes
  já persistido, as rotas e os componentes HeroUI. Uma tela semanal nativa, lista de
  pendências, backend, push ou política de update quebraria essa fronteira.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Conclusão Android retorna à lista sem tela semanal
- Última conclusão provisória inequívoca e substituição canônica por identidade
- Sync comum e sucesso sem comunicação intrusiva
- Login da mesma conta preserva e retoma pendências
- Takeover restrito à preparação limpa e sempre explícito
- Aparelho revogado e lease expirado com descarte local como única saída
- Conflito completo resolvido por versão integral e token corrente
- Terminal canônico imutável e versão local descartada somente com confirmação
- Notificações opcionais, contextuais, privadas e não essenciais
- Web/PWA e contratos HTTP preservados
- Rotas, fluxo, arquitetura e testes vivos atualizados na implementação
- MSW e testes Android/Playwright atualizados conforme o impacto
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz, integração UI e validações Android aprovados
