# Feature Spec: Manter o PWA online sem persistência privada

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #91](https://github.com/eduardodallmann/dall-fit/issues/91).
- Problema: o mesmo frontend é distribuído como Web/PWA e Android Capacitor, mas
  somente o Android possui a autoridade SQLite, a fila e as mídias necessárias ao
  treino offline. O PWA já precacheia o app shell e não configura runtime cache de
  API, porém ainda não transforma essa fronteira em um estado de produto explícito:
  o shell pode abrir sem rede, loaders tentam acessar a API, conteúdos privados que
  já estavam em memória podem continuar aparentando disponibilidade e Analytics
  customizado pode entrar na fila transitória do SDK antes de o script carregar.
- Resultado: Web e PWA permanecem canais integralmente online. O Service Worker
  conserva somente o app shell estático, nunca persiste nem enfileira respostas ou
  operações privadas e, sem conexão, a UI substitui o conteúdo da rota por uma
  superfície acessível que exige rede e informa que o aplicativo Android oferece
  treino offline. Ao reconectar, a mesma URL retoma o fluxo normal. Android mantém
  sua jornada offline vigente atrás das capabilities nativas, sem importar plugins
  no ramo Web.
- Referências locais:
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [documentação oficial das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [mocks da UI](../../../ui/docs/sdd/base/05-mocks-de-api.md);
  - [rota pública](../../../ui/docs/sdd/routes/root.md);
  - [shell autenticado](../../../ui/docs/sdd/routes/dash.md);
  - [rota Treinar](../../../ui/docs/sdd/routes/training.md);
  - [execução de treino](../flows/execucao-de-treino.md);
  - [Workbox — precache](https://developer.chrome.com/docs/workbox/modules/workbox-precaching/);
  - [Workbox — estratégias de cache](https://developer.chrome.com/docs/workbox/caching-strategies-overview);
  - [Vite PWA — Workbox](https://vite-pwa-org.netlify.app/workbox/);
  - [Vercel Analytics — API do pacote](https://vercel.com/docs/analytics/package).
- Features relacionadas:
  - [FIT-0011](fit-0011-instalacao-pwa.md) introduziu o app shell precacheado e já
    excluiu API, autenticação, recursos remotos e dados pessoais do cache;
  - [FIT-0035](fit-0035-adicionar-analytics.md) introduziu pageviews, eventos
    customizados sanitizados e a fronteira tolerante a falhas;
  - [FIT-0068](fit-0068-atualizacao-silenciosa-segura-pwa.md) consolidou o ciclo
    real do Service Worker e preservou a ausência de modo offline funcional;
  - [FIT-0079](fit-0079-estruturar-aplicativo-capacitor-android.md) criou a
    fronteira `web | android` e reservou release/publicação para outra demanda;
  - [FIT-0082](fit-0082-nucleo-nativo-persistencia-offline.md) estabeleceu o motor
    privado exclusivo do Android;
  - [FIT-0089](fit-0089-adaptar-jornada-treinar-execucao-offline.md) tornou o
    repository Android autoridade local da jornada Treinar;
  - [FIT-0090](fit-0090-integrar-resumo-provisorio-takeover-conflitos-ui.md)
    completou a integração observável da fila Android sem criar equivalente Web.

As versões confirmadas durante a especificação são `vite-plugin-pwa` `1.3.0`,
Workbox `7.4.1`, Vite `8.1.5` e `@vercel/analytics` `2.0.1`. Os tipos e o template
local do Workbox confirmam que `runtimeCaching` é opcional e só gera rotas quando
configurado; a configuração vigente não o declara. A API local de Analytics
confirma `beforeSend` e também uma fila apenas em memória enquanto o script carrega,
por isso eventos produzidos já offline precisam ser recusados antes de chamar o SDK.

## Escopo

### Incluído

- tornar explícita na configuração PWA a ausência de runtime cache, Background
  Sync e offline analytics;
- manter no precache somente `index.html`, chunks JavaScript/CSS, fontes, ícones e
  demais assets estáticos locais necessários ao app shell;
- auditar o Service Worker gerado e suas entradas de Cache Storage para provar que
  API, autenticação, SSE, mídia remota/privada, signed URLs e payloads não entram no
  cache;
- criar uma fonte reativa e testável do estado de conectividade Web, baseada nos
  sinais `navigator.onLine`, `online` e `offline`, sem confundi-los com prova de
  alcance da API;
- apresentar uma superfície Web/PWA de `Conexão necessária` em abertura offline e
  quando a conexão for perdida com a aplicação já aberta;
- ocultar imediatamente conteúdo público acionável e todo conteúdo privado da rota
  enquanto o ramo Web/PWA estiver offline, sem navegar para outra URL;
- impedir que uma abertura sabidamente offline inicie login, probe de sessão,
  bootstrap CSRF, query, mutation, SSE ou outra integração privada;
- preservar em memória o estado já pertencente ao documento, sem copiá-lo para
  Cache Storage, IndexedDB, local storage, session storage ou fila durável;
- retomar automaticamente a avaliação da mesma URL ao receber o sinal `online`,
  deixando autenticação, autorização, query e erro HTTP confirmarem o estado real;
- informar na superfície que treino offline está disponível somente no aplicativo
  Android, sem botão ou link de loja enquanto não existir distribuição documentada;
- descartar pageviews, eventos customizados e diagnósticos originados enquanto o
  browser estiver offline, antes que alcancem a fila transitória do SDK;
- preservar o guard, o repository, o motor, a fila, as notificações e os fallbacks
  de mídia exclusivos do Android;
- cobrir configuração, build, cache real, conectividade, rotas, Analytics e
  isolamento de plataforma com testes proporcionais;
- atualizar os SDDs vivos afetados somente durante a futura implementação
  autorizada.

### Não incluído

- IndexedDB, Cache API de domínio, local storage ou session storage para plano,
  sessão, histórico, credencial, resposta HTTP, draft ou fila de treino;
- `runtimeCaching` para API, páginas visitadas, imagens remotas, avatares, vídeos,
  Blob privado ou qualquer recurso autenticado;
- Background Sync, Periodic Background Sync, Workbox Background Sync, offline
  analytics, replay de request ou telemetria acumulada;
- execução, preparação, conclusão ou sincronização de treino offline na Web/PWA;
- mudança das regras online atuais da jornada Treinar ou dos demais domínios;
- limpeza do cache HTTP interno do navegador, cuja política pertence aos headers
  das respostas, nem alteração de endpoint para compensar cache inexistente no SW;
- persistência Web da memória do TanStack Query, do CSRF ou dos repositories;
- mudança no motor SQLite, filesystem, WorkManager, lease, snapshot ou autenticação
  Bearer do Android;
- criação de rota `/offline`, redirect permanente, destino de retorno persistido ou
  query exclusiva de produção para representar conectividade;
- link para Play Store, APK, QR code, deep link, detecção de instalação Android ou
  fluxo de download/publicação; isso depende da demanda de release;
- suporte iOS ou promessa de offline em navegador específico;
- screenshots novas ou alteração das referências visuais vigentes;
- mudanças na API, no Workflow ou em `@dall-fit/types`.

## Projetos e documentação afetados

- API e endpoints: não afetados. A UI continua usando os contratos e headers
  vigentes; não há request, response, autenticação ou persistência nova.
- UI e rotas:
  - `ui/vite.config.ts` explicita a política conservadora do Workbox;
  - a infraestrutura reativa de conectividade e a superfície reutilizável ficam em
    `ui/src/core/`, sem depender de rotas nem de código nativo;
  - o ponto de composição acima do router impede bootstrap/loader Web sabidamente
    offline e o shell autenticado deixa de tratar somente o caso Android;
  - `ui/src/core/analytics/` e a composição de `Analytics` descartam emissões
    offline sem persistência ou replay;
  - a implementação atualiza `ui/docs/sdd/base/01-arquitetura.md`,
    `ui/docs/sdd/base/04-testes-e-qualidade.md`,
    `ui/docs/sdd/routes/root.md`, `ui/docs/sdd/routes/dash.md` e
    `ui/docs/sdd/routes/training.md`;
  - os demais documentos de rota autenticada referenciam a regra transversal do
    shell quando necessário, sem duplicar a mesma descrição em onze arquivos.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` para tornar observável
  que Web/PWA bloqueia a jornada sem rede e Android continua sendo o único ramo
  offline. Os demais fluxos não mudam sua ordem online.
- Contratos em `@dall-fit/types`: não afetados; conectividade e plataforma são
  contratos exclusivos do frontend.
- Decisões arquiteturais: preservar
  [ADR-0012](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md) e
  [ADR-0014](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md). Não criar
  novo ADR: esta feature concretiza a separação já aceita, sem escolher nova
  tecnologia ou persistência.
- Handlers e fixtures MSW: nenhuma operação HTTP muda. Não criar handler para
  conectividade; Vitest injeta a fonte e Playwright alterna o estado de rede do
  browser depois do bootstrap. O ambiente isolado de PWA continua sem MSW.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

### Política do Service Worker e persistência

1. O build continua usando `generateSW`, `cleanupOutdatedCaches`, fallback de
   navegação para o `index.html` e registro controlado em modo `prompt` pelo ciclo
   silencioso vigente.
2. O precache contém somente arquivos locais produzidos ou incluídos no build para
   formar o app shell: documento base, chunks com hash, CSS, fontes e ícones.
3. A configuração não declara `runtimeCaching`, `offlineGoogleAnalytics`,
   `backgroundSync`, fila de replay ou import de módulo equivalente. A ausência é
   protegida por teste do artefato gerado, não apenas por inspeção do objeto fonte.
4. `navigateFallback` responde somente a navegações same-origin aceitas e continua
   negando `/api` e `/auth`. Ele entrega o app shell, nunca a resposta anterior de
   uma rota, de um loader ou da API.
5. Requests Axios, OAuth, CSRF, SSE, Vercel Analytics, YouTube, avatar, Blob privado
   e signed URLs passam somente pela rede e não são interceptadas, repetidas,
   enfileiradas nem armazenadas pelo Service Worker.
6. O teste de produção abre a aplicação uma vez online, inspeciona o cache real e
   confirma que todas as entradas pertencem ao allowlist estático. Depois acessa o
   shell offline e repete a inspeção para provar que nenhuma navegação ou tentativa
   de integração acrescentou entrada privada.
7. A política não proíbe memória efêmera necessária ao documento atual nem as
   preferências Web não privadas já vigentes, como tema e intenção sanitizada de
   retorno ao login. Nenhuma delas passa a transportar plano, sessão, credencial,
   histórico ou payload.

### Estado Web/PWA sem conexão

8. Uma única fonte de conectividade do core publica o snapshot inicial de
   `navigator.onLine` e observa os eventos `online` e `offline`, com cleanup no
   unmount e snapshot seguro para renderização fora do browser.
9. O sinal representa a informação disponível no navegador. `online` não promete
   que a API está alcançável: depois dele, os loaders e requests vigentes continuam
   responsáveis por loading, timeout, erro técnico, `401` e demais respostas.
10. No ramo `platform: 'web'`, snapshot offline substitui a árvore navegável por
    uma superfície de estado antes de iniciar o router e suas integrações. Uma
    entrada direta em `/`, `/dash`, `/training` ou qualquer outra rota conhecida
    preserva path, query válida e fragmento no endereço.
11. A superfície mostra o título `Conexão necessária`, explica
    `Conecte-se à internet para continuar usando o Dall Fit.` e informa
    `Treinos offline estão disponíveis no aplicativo Android.`. Ela não afirma que
    plano, sessão ou histórico estão disponíveis e não exibe identidade, menu,
    conteúdo da rota, cache TanStack ou dado privado previamente renderizado.
12. Não existe botão de download nesta entrega. Uma ação `Tentar novamente` relê o
    snapshot e permite nova avaliação do fluxo, mas não fabrica estado online nem
    executa polling, probe ou request enquanto `navigator.onLine` continuar falso.
13. Se a conexão cair depois da renderização, a superfície substitui imediatamente
    o conteúdo. Queries e mutations não são convertidas em fila offline, operações
    novas ficam indisponíveis e nenhum estado é serializado para futura execução.
14. Perder rede não equivale a logout, expiração, `401`, redirect ou captura de
    intenção de autenticação. A URL e a geração de sessão permanecem as do
    documento; teardown só ocorre pelos gatilhos de sessão já documentados.
15. Ao receber `online`, a superfície sai automaticamente e a rota preservada volta
    a ser avaliada. Se havia sessão válida, o fluxo normal é recuperado; se a sessão
    expirou, a proteção executa o redirect/login vigente; se a API continua
    inalcançável, aparece o erro técnico proprietário da rota.
16. A primeira abertura offline só funciona quando o app shell já tiver sido
    instalado pelo Service Worker. Sem visita anterior/controle do worker, o
    navegador pode exibir sua falha nativa; a aplicação não promete bootstrap que
    não pode executar.

### Isolamento Android e adapters

17. No ramo `platform: 'android'`, a barreira Web não é aplicada. O guard nativo
    continua permitindo `/training` e `/training/workout/:workoutId` offline,
    redirecionando para Treinar quando houver plano válido ou exibindo sua
    superfície nativa vigente quando a rota não for suportada.
18. Componentes de conectividade consomem `PlatformContext` e ports/capabilities;
    não importam `@capacitor/*`, plugin local, SQLite, WorkManager ou arquivos da
    composição nativa.
19. O adapter Web não registra, importa nem chama plugin nativo. Falha ou ausência
    da bridge, iOS ou plataforma inesperada continuam caindo no ramo Web seguro.
20. A informação sobre Android é copy de produto, não detecção, invocation ou
    capability Web. Ela não altera o manifesto PWA nem `prefer_related_applications`.

### Analytics

21. `trackUiEvent`, `trackTrainingPlanAssistantAction` e diagnósticos sistêmicos
    retornam antes de chamar `track` quando o browser estiver offline. O evento não
    entra em `window.vaq`, IndexedDB, Cache Storage, Service Worker ou memória de
    replay da aplicação.
22. A composição global usa `beforeSend` como segunda barreira para cancelar
    pageviews e eventos que chegarem ao SDK enquanto `navigator.onLine` for falso.
    O callback devolve `null` sem alterar ou guardar o evento.
23. Eventos descartados não são reenviados no evento `online`, na próxima
    navegação, no remount do componente ou no próximo pageview. Somente ações e
    pageviews ocorridos depois da conectividade restaurada seguem o fluxo normal.
24. Abrir, fechar, tentar novamente ou permanecer na superfície offline não emite
    evento de produto nem diagnóstico de falha. Estar offline é estado esperado,
    não erro sistêmico.

## Requisitos não funcionais

- Acessibilidade:
  - a superfície usa `main` e `Alert`/status semântico, título e descrição legíveis
    independentemente de cor;
  - `Tentar novamente` possui nome visível, foco perceptível e ativação por teclado;
  - a troca para o estado offline move o foco de forma previsível para o heading ou
    região principal quando necessário, sem prender foco em overlay removido;
  - a retomada não força foco sobre controles da rota nem cria navegação no
    histórico.
- Performance:
  - uma assinatura global de três sinais no máximo (`online`, `offline` e leitura
    explícita), sem polling ou health-check periódico novo;
  - nenhuma estratégia de runtime cache, banco Web ou serialização de domínio;
  - o precache não cresce com páginas visitadas, requests ou uso do produto.
- Segurança e privacidade:
  - nenhum payload autenticado, token, cookie, CSRF, pessoa, plano, sessão,
    histórico, signed URL, mídia privada, erro técnico ou evento perdido é
    persistido pelo PWA;
  - conteúdo privado já em memória deixa de ser apresentado enquanto offline e não
    é copiado para o estado da superfície;
  - a superfície não revela se existe sessão, plano preparado, treino em andamento
    ou dado em cache;
  - nenhum `console.*` ou identificador é introduzido.
- Observabilidade:
  - offline não gera log ou Analytics;
  - erros reais depois da retomada continuam seguindo as categorias sanitizadas e
    feedbacks proprietários existentes;
  - testes auditam o artefato e o Cache Storage real para evitar falsa segurança
    baseada apenas em configuração fonte.
- Compatibilidade:
  - comportamento igual em aba comum e PWA `standalone`;
  - desenvolvimento e Playwright continuam usando MSW com Workbox desabilitado;
  - preview/teste PWA usa Workbox real sem MSW;
  - os gates Web continuam sem exigir Android SDK.

## Critérios de aceite

### Cenário 1 — cache contém somente o app shell

- Forma de validar: build/preview de produção no Chromium com Service Worker real,
  inspeção automatizada do precache e do `sw.js` gerado.
- Given: a UI foi aberta online e o Service Worker concluiu a instalação.
- When: o teste enumera caches, entradas e código gerado.
- Then: todas as entradas correspondem a assets estáticos locais permitidos.
- And: não existe runtime route, Background Sync, offline analytics, API,
  autenticação, mídia privada ou resposta autenticada.

### Cenário 2 — abertura offline preserva a URL e bloqueia integrações

- Forma de validar: extensão de `pnpm test:pwa-update` ou teste isolado equivalente
  com build real, após uma primeira visita online que instale o app shell.
- Given: o browser controla a origem pelo Service Worker e abre diretamente uma
  rota conhecida sem rede.
- When: o app shell inicia.
- Then: mantém a URL, mostra `Conexão necessária` e a informação sobre Android.
- And: não inicia probe de sessão, CSRF, query, SSE, Analytics ou plugin nativo.

### Cenário 3 — perda de conexão oculta conteúdo privado

- Forma de validar: Playwright da rota `/dash` ou `/training`, iniciada online com
  MSW e colocada offline somente depois do bootstrap.
- Given: pessoa e conteúdo fictícios já estão visíveis no shell autenticado Web.
- When: o browser emite o estado offline.
- Then: identidade, menu e conteúdo deixam de ser apresentados e a superfície
  neutra assume sem mudar a URL.
- And: nenhuma ação nova vira request ou fila.

### Cenário 4 — conexão restaurada recupera o fluxo normal

- Forma de validar: continuação do cenário Playwright anterior.
- Given: a superfície offline está visível na URL original.
- When: o browser volta a ficar online.
- Then: a rota é reavaliada automaticamente e volta ao comportamento online
  canônico, sem replay de ações ou Analytics perdidos.
- And: erro real, `401` ou sessão válida seguem seus ramos já documentados.

### Cenário 5 — PWA não oferece treino Web offline

- Forma de validar: build real offline e teste de componente da superfície.
- Given: o app shell está disponível e a URL é `/training` ou um workout.
- When: a aplicação Web/PWA inicia ou perde a conexão.
- Then: não renderiza plano, prévia, sessão, cargas, timer, histórico ou resumo.
- And: informa que o treino offline pertence ao aplicativo Android, sem link de
  download ou alegação de dado local disponível.

### Cenário 6 — Android mantém a jornada offline

- Forma de validar: regressão Vitest com snapshot Android/repository injetado e os
  testes Android já proprietários da jornada.
- Given: a capability `nativeOfflineStorage` está ativa e existe plano preparado.
- When: o Android perde a rede dentro de Treinar.
- Then: continua usando SQLite/repository nativo e não mostra a barreira Web.
- And: Web/PWA não importa nem chama a bridge usada nesse caminho.

### Cenário 7 — evento Analytics offline é descartado

- Forma de validar: Vitest da fronteira customizada e da prop `beforeSend` com o
  SDK substituído.
- Given: `navigator.onLine` é falso antes do carregamento do script.
- When: um componente tenta emitir evento, diagnóstico ou pageview.
- Then: `track` não é chamado ou `beforeSend` devolve `null`, e nenhuma fila de
  replay da aplicação é criada.
- And: voltar online não envia o evento anterior.

### Cenário 8 — sinal online não mascara falha de alcance

- Forma de validar: teste de rota com fonte de conectividade online e handler MSW
  de erro técnico já documentado.
- Given: o browser informa online, mas a integração devolve falha.
- When: a rota é retomada.
- Then: a superfície offline sai e o erro proprietário da rota aparece.
- And: a UI não promete conectividade nem converte a falha em fila offline.

### Cenário 9 — cache não cresce após uso autenticado

- Forma de validar: teste Chromium de produção que instala o shell, executa um
  fluxo autenticado fictício contra origem controlada, compara o inventário do
  Cache Storage e volta a abrir offline.
- Given: várias leituras, mutations e mídias foram solicitadas online.
- When: o inventário posterior é comparado ao precache inicial.
- Then: não há novas entradas privadas, de API, mídia ou navegação.
- And: o shell offline continua mostrando somente conexão necessária.

## Estratégia de entrega e compatibilidade

1. Criar primeiro a fonte de conectividade injetável e a superfície neutra, com
   cobertura de snapshot inicial, eventos, cleanup, foco e retry sem request.
2. Aplicar a barreira no ponto de composição Web acima da execução dos loaders,
   mantendo o ramo Android explicitamente separado e preservando a URL.
3. Adaptar o guard nativo existente apenas na medida necessária para evitar duas
   fontes divergentes de conectividade, sem mover regras Android para o core Web.
4. Aplicar o corte anterior ao SDK nos eventos customizados/diagnósticos e a
   segunda barreira `beforeSend` na composição global de pageviews.
5. Tornar a intenção de cache explícita na configuração e fortalecer o teste do
   build real para inspecionar `sw.js`, módulos importados e entradas efetivas.
6. Atualizar os SDDs vivos e a matriz de testes junto da implementação autorizada.
7. Não migrar nem apagar dado de domínio Web porque ele não existe. Caches antigos
   administrados pelo Workbox continuam sujeitos a `cleanupOutdatedCaches`; se a
   auditoria encontrar cache privado legado não previsto, a implementação deve
   parar e retornar à especificação antes de introduzir limpeza destrutiva ampla.

A mudança é compatível com instalações PWA existentes: um novo Service Worker
substitui o precache estático pelo mecanismo de atualização vigente, sem mudar
manifesto, `start_url`, escopo ou identidade. O estado offline é efêmero ao
documento e não exige schema ou migração. Um rollback remove a barreira visual e a
filtragem Analytics, mas não encontra dado Web a converter.

## Plano de testes

- Vitest da conectividade:
  - snapshot inicial online/offline, eventos e leitura explícita;
  - cleanup, Strict Mode e fallback de renderização;
  - ausência de polling e de chamada de rede no retry ainda offline.
- Vitest da superfície:
  - copy neutra, informação Android e ausência de dado privado;
  - semântica, teclado, foco e troca online/offline;
  - ramo Web bloqueado e ramo Android preservado.
- Router e sessão:
  - abertura offline não executa probe, CSRF, query ou captura de retorno;
  - perda de conexão não encerra geração nem navega;
  - retomada preserva URL e delega `401`, erro e sucesso ao fluxo vigente.
- Analytics:
  - cada entrypoint público descarta antes de `track` quando offline;
  - `beforeSend` cancela pageview/evento offline;
  - nenhum replay em `online` e emissão nova funciona depois da retomada;
  - offline não produz diagnóstico.
- Configuração/build:
  - lista exata de globs/entradas estáticas;
  - ausência de runtime caching, Background Sync e offline analytics no SW;
  - denylist de `/api` e `/auth`, exclusão de `mockServiceWorker.js` e fallback
    somente de navegação;
  - inventário real do Cache Storage antes e depois do fluxo autenticado.
- Playwright com MSW:
  - rota autenticada online → offline → online, conteúdo oculto e URL estável;
  - falha de API mesmo com sinal online usa o erro da rota;
  - Workbox continua desabilitado e nenhuma request sem handler escapa.
- Teste isolado PWA:
  - primeira visita online instala shell;
  - abertura direta offline mostra a superfície;
  - cache não cresce com navegação/integrações;
  - atualização silenciosa de dois builds continua funcionando.
- Regressão Android:
  - capabilities e fallback Web;
  - guard nativo, preparação e repository Android;
  - teste executável do ESLint preserva imports Capacitor na fronteira permitida.
- Inspeção final de API e UI para remover wrappers, hooks, helpers, imports,
  exports e arquivos que fiquem sem uso.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`;
  - `pnpm test:pwa-update`;
  - `pnpm -C api test:e2e` e `pnpm android:test` não são exigidos enquanto API,
    wiring, MongoDB, Redis e código Android permanecerem inalterados.

## Riscos e decisões

- `navigator.onLine` é um hint e pode informar online sem alcançar a API. A feature
  usa o sinal somente para reconhecer a ausência conhecida de rede; depois da
  retomada, requests reais continuam canônicas. Um health-check novo criaria
  endpoint/polling e não é necessário para cumprir a demanda.
- Manter o conteúdo privado visível depois do evento offline faria o app shell
  aparentar capacidade que o produto não oferece. A decisão é substituir toda a
  árvore Web/PWA, preservando apenas estado efêmero invisível para retomada, sem
  logout destrutivo.
- Limpar o QueryClient ao perder rede eliminaria conteúdo da tela, mas também
  confundiria conectividade com encerramento de sessão e poderia descartar trabalho
  recuperável. A decisão é ocultar sem persistir nem promover o cache de memória.
- Criar `/offline` simplificaria a composição visual, mas mudaria URL/histórico e
  exigiria retorno próprio. A decisão é manter a URL e renderizar um estado global.
- Promover Android com link antes da release produziria destino instável ou
  inseguro. A decisão é informar a capacidade em texto; distribuição pertence à
  feature de release.
- Declarar uma estratégia `NetworkOnly` para API ainda criaria uma runtime route
  desnecessária. Sem rota Workbox correspondente, o fetch já segue a rede; a
  ausência é mais simples e é validada no artefato.
- Inspecionar apenas `vite.config.ts` não prova o conteúdo gerado. A combinação de
  auditoria do `sw.js` e Cache Storage real protege contra defaults, plugins ou
  regressões futuras.
- A fila pré-carregamento do SDK Analytics é volátil, mas ainda pode entregar um
  evento originado offline quando o script carregar depois. O corte antes de
  `track` impede esse caso; `beforeSend` cobre pageviews e corridas restantes.
- O Service Worker e o MSW não podem controlar o mesmo escopo nos testes
  integrados. A matriz mantém Playwright de rotas com MSW e valida cache/offline PWA
  em processo Chromium isolado com build real.
- A implementação permanece limitada a uma sessão de até cinco horas: configuração
  e auditoria do SW, um estado global de conectividade, uma superfície, filtragem
  Analytics, regressões de plataforma e documentação. Descoberta de cache privado
  legado, necessidade de endpoint ou canal real de distribuição Android exige
  dividir a demanda antes de ampliar o contrato.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- App shell offline sem aparência de dados privados disponíveis
- Web/PWA exclusivamente online e Android como único canal de treino offline
- Nenhuma resposta autenticada, sessão, plano, histórico, credencial ou fila no PWA
- Ausência de runtime cache, Background Sync e offline analytics comprovada
- URL preservada e fluxo normal retomado após reconexão
- Imports e plugins nativos confinados aos adapters Android
- Eventos Analytics offline descartados sem replay
- Contratos, rotas e fluxo vivos afetados atualizados
- MSW e Workbox preservados em ambientes separados
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz, integração UI e regressão PWA aprovados
