# Arquitetura base da UI

## Stack

A UI usa React 19, TypeScript, Vite, Tailwind CSS 4 e HeroUI 3. A estilização
própria usa a API Tailwind Variants exportada por `@heroui/styles`.

A fundação de aplicação usa:

- TanStack Router com árvore declarada manualmente;
- TanStack Query para estado de servidor;
- TanStack Form para formulários;
- Axios como client HTTP;
- `vite-plugin-pwa` com Workbox para instalação e atualização da PWA;
- Capacitor 8 para empacotar o mesmo bundle Vite em Android;
- `@vercel/analytics` para pageviews e eventos customizados sem conteúdo;
- Vitest para testes unitários e de componentes;
- Playwright para testes integrados no navegador.

`src/main.tsx` cria o root antes das etapas assíncronas, aguarda a ativação opcional
do MSW, realiza o bootstrap e aplica uma `ApplicationErrorBoundary` acima de
`AppProviders`. Rejeição do bootstrap ou erro de renderização apresenta fallback
global com recarga, em vez de deixar a tela vazia. `src/app.tsx` monta o
`RouterProvider`, e a árvore tipada vive em `src/routes/routes.tsx`.

## Plataforma Web e Android

`capacitor.config.ts` identifica o aplicativo como `com.dallfit.app`, usa o nome
`Dall Fit` e copia exclusivamente o bundle local de `dist`. A configuração de
produção não define `server.url`, navegação liberada para um host remoto nem HTTP
cleartext. O Web/PWA continua sendo o canal web vigente; Capacitor apenas adiciona
o container Android versionado em `ui/android/`.

`src/core/platform` é a fronteira do runtime. Seu contrato discriminado expõe
somente `web | android` e um snapshot profundamente imutável das capabilities de
fundação. O adapter Web devolve `nativeBridge: false` sem ler bridge ou plugin. O
adapter Capacitor usa `isNativePlatform()` e `getPlatform()` e só reconhece Android
quando ambas as informações são coerentes; iOS ou qualquer valor inesperado cai no
fallback Web sem ser promovido por coerção.

No snapshot Android, `nativeAuthentication: true` ativa uma composição carregada
dinamicamente que injeta ports de Google Sign-In, credencial segura e dados locais.
Somente adapters em `src/core/platform/native/` importam Capacitor ou os plugins
`@capawesome/capacitor-google-sign-in` e
`@aparajita/capacitor-secure-storage`; o bundle Web não inicializa nem chama esses
plugins. O Google adapter inicializa uma vez com `VITE_GOOGLE_SERVER_CLIENT_ID`,
solicita apenas autenticação e entrega ao coordenador somente o ID token transitório.

`nativeOfflineStorage: true` identifica o motor offline exclusivo do Android. O
plugin local `OfflineStorage`, registrado explicitamente no `MainActivity`, é uma
ponte fina para o singleton `OfflineStorageService`; o serviço não depende de
Activity, WebView ou React e pode ser reutilizado por futuros Workers. Somente
arquivos de `src/core/platform/native/` importam o contrato Capacitor. Web/PWA não
registra o plugin, não cria IndexedDB equivalente e conserva comportamento online.

No Web/PWA, `WebConnectivityGuard` envolve a árvore acionável acima do router e usa
`src/core/connectivity` como fonte única do hint de conectividade. Se o documento
inicia offline, router, sessão, requests privados, SSE e Analytics não são montados;
se a conexão é perdida depois, toda a árvore pública ou privada é desmontada e
substituída pela superfície global `Conexão necessária`. A URL corrente não muda e,
ao receber `online` ou após `Tentar novamente`, a mesma rota é remontada e
revalidada. `navigator.onLine` e seus eventos são apenas um hint local, não uma
prova de alcance da API. O Android ignora esse guard global e seu guard nativo
reutiliza a mesma fonte para conservar a jornada offline já suportada.

O Workbox usa `generateSW` somente para precache do app shell versionado
(`js`, `css`, `html`, `woff2`, manifesto e seus assets explícitos) e fallback de
navegação para `index.html`. Não existe runtime cache, Background Sync nem
offline Google Analytics. Rotas `/api` e `/auth`, SSE, signed URLs e recursos
remotos não entram no cache e nunca recebem resposta privada do service worker.

O motor é o único proprietário do SQLite `dall-fit-offline.db`, de
`files/offline/` e do lock justo que serializa mutações no processo. O schema v4
mantém metadados do motor, uma conta local, no máximo um plano preparado e uma
sessão ativa, snapshots por execução, estado operacional de sincronização e
metadados de arquivos `temporary | ready`. Plano, sessão e snapshot são objetos JSON
opacos com `payloadVersion` e revisão; apenas IDs, timestamps, sequência monotônica
local e estado necessários ficam normalizados. A bridge não expõe SQL, path absoluto
ou bytes. A migration v2→v3 acrescenta uma projeção singleton da conclusão mais
recente, separada do snapshot de domínio e vinculada à identidade e sequência da
fila para promoção canônica sem regressão.
A migration v3→v4 acrescenta a cada snapshot o `producer_version_code` e o
`sync_contract_version`; linhas legadas recebem 1 sem alterar JSON, revisão,
sequência, ação ou conclusão provisória. Bancos v1 e v2 atravessam todas as
migrations intermediárias na mesma ordem.

`OfflineSyncEngine` é um singleton nativo associado ao mesmo provider. Um executor
serial garante no máximo um upload da instalação em voo; o lock do storage protege
somente claim e transições SQLite curtas e nunca permanece adquirido durante HTTP ou
backoff. `snapshots` conserva uma versão por execução e `sync_state` faz claim por
revisão. Uma gravação mais nova durante o request volta a execução para `pending`, e
a resposta antiga não consegue removê-la. Ordem entre execuções usa
`queue_sequence`, nunca UUID ou relógio do aparelho; claim interrompido volta a
`pending` na próxima composição.

O transporte nativo usa `HttpURLConnection` e `PUT /training/offline-snapshot`, sem
cookie ou CSRF. O coordenador TypeScript lê o Bearer pelo contrato seguro da sessão e
o entrega ao plugin somente em memória; SQLite, eventos e logs nunca o recebem. Rede,
timeout, `408`, `429`, lock remoto e `5xx` usam backoff exponencial com jitter;
autenticação pausa globalmente e conflito, imutabilidade ou lease ficam associados
somente à execução afetada para a UI. A bridge lê a menor ação por sequência e
oferece comandos CAS de resolução ou descarte; a UI nunca envia o snapshot por
Axios. Sucesso remove por ID + revisão, captura a conclusão canônica opcional, e uma
resposta tardia não alcança outra conta ou geração.
Cada upload usa a versão do pacote atualmente instalado em
`X-App-Version-Code` e o contrato persistido no envelope em
`X-Sync-Contract-Version`; a versão produtora permanece auditável no SQLite.
`409 APP_UPDATE_REQUIRED` com
detalhes válidos grava monotonicamente a política, mantém a fila e encerra a
passagem como `update-required`, sem retry ou backoff.

`OfflineSyncCoordinator` publica estado, próxima ação e última conclusão por
`useSyncExternalStore`. Detalhes não expõem credenciais, pessoa, paths nem a lista
inteira. Resolução obsoleta remove o token do envelope e o reenvia para obter o
conflito corrente. A limpeza de lease inválido preserva apenas o vínculo da conta e
remove atomicamente todos os dados cercados pelo fence antigo.

O plugin solicita `POST_NOTIFICATIONS` no Android 13+ somente depois da explicação
contextual exibida após o primeiro preparo essencial; a decisão é lembrada em
preferência privada excluída de backup. O processo rastreia visibilidade por
callbacks de Activity. Um canal de importância padrão e ID fixo deduplicam a
notificação genérica de autenticação ou conflito; toque abre a `MainActivity`, e a
WebView relê o SQLite. Sucesso, retry, lease inválido e progresso não notificam.

Mudança local usa debounce, e abertura/resume, conectividade restaurada e a entrada
manual acordam o mesmo motor. `syncStateChanged` é apenas hint; `getSyncState` repara
evento perdido com estado e contagens sanitizados. O callback de rede é único e
removido com o plugin. Cada snapshot também agenda um unique one-time work global da
fila, e um unique periodic work de seis horas atua como contingência. Ambos exigem
somente `NetworkType.CONNECTED`, usam backoff exponencial de 30 segundos e podem ser
adiados pelo Android; não são expedited e não registram Foreground Service.

`DallFitApplication` registra a contingência pelo WorkManager no processo principal.
`OfflineSyncWorker` abre a mesma composição nativa sem Activity, WebView ou
JavaScript, lê o envelope v1 no mesmo secure storage cifrado pelo Android Keystore e
obtém a URL-base pública previamente validada. Ele abre e migra o banco e consulta
a política de compatibilidade antes de vincular conta ou chamar uma passagem aguardável
do mesmo `OfflineSyncEngine`: falha temporária devolve retry ao WorkManager; ausência
ou expiração de sessão, `401`, bloqueio ou ação necessária encerram sem loop e
preservam a fila conforme sua categoria. Abertura/resume continua disparando o motor
imediatamente, sem esperar a cadência do scheduler.

Arquivos nascem como `.part` e só viram `.data` por rename no mesmo filesystem;
temporários e órfãos são removidos na próxima inicialização. A limpeza de conta
isola o diretório, remove as linhas em transação e conclui a exclusão física antes
de resolver. Falha mantém o motor fechado para outra identidade e permite retry.
Eventos `stateChanged` são best-effort; `getState` sempre fornece revisão e
contadores canônicos, inclusive a geração/categoria técnica de recuperação.

`OfflinePreparationCoordinator` existe somente na composição Android. Ao entrar
em Treinar, ele lê validade e metadados canônicos, compõe `GET /training` e até
quatro previews simultâneos pelo Axios autenticado, registra o lease e grava o
payload v2 sem URLs e
libera a rota antes das mídias. Até quatro downloads Java recebem a signed URL
`display` apenas durante a chamada, exigem HTTPS/WebP/2xx, no máximo três redirects
HTTPS, corpo completo não vazio de até 10 MiB e concluem pelo rename do motor.
Geração e revisão impedem callbacks atrasados de publicar dados depois de troca ou
remoção. Web/PWA não instancia esse coordenador.

O payload preparado v2 acrescenta a projeção de overview, previews sanitizados e
o lease registrado por `PUT /training/offline-lease`; UUID e fence permanecem no
SQLite privado e não entram em logs. Payload v1 legado não autoriza nova sessão e
exige preparação online. `TrainingRepository` é a fronteira única da jornada:
Web/PWA injeta o adapter HTTP, enquanto Android injeta sempre
`NativeTrainingRepository`, inclusive online. A autoridade Android lê o plano e a
sessão do motor, aplica ações localmente e confirma cada feedback somente depois do
commit composto de sessão + envelope de snapshot.
Arquivos `ready` são projetados sob demanda pelo `FileProvider` como URI de
conteúdo restrita ao aplicativo; somente `fileId` persiste no plano e na sessão,
e indisponibilidade do arquivo produz o fallback visual sem invalidar o treino.

Os comandos nativos de treino gravam sessão e snapshot da mesma revisão em uma
única transação, ou gravam o terminal e removem a sessão pelo CAS da revisão. Uma
execução pendente é coalescida sem perder sua sequência, e terminais de execuções
anteriores permanecem na fila. Timers guardam timestamp civil, duração e âncora de
`SystemClock.elapsedRealtime()`; a apresentação usa monotônico no mesmo boot e
fallback civil limitado depois de reboot. O contador não grava por tick nem resolve
o domínio automaticamente ao chegar a zero.

O shell Android observa conectividade como hint. Fora de `/training` e
`/training/workout/:workoutId`, perda de rede substitui a navegação por Treinar se
houver plano local válido; sem ele, mantém uma superfície acessível de conexão
necessária. Web/PWA não participa desse guard.

`NativeAppCompatibilityCoordinator` lê `PackageInfo.getLongVersionCode()` e
`versionName` pela bridge e consulta `GET /app-compatibility/android` na abertura,
no resume e ao recuperar conectividade. Consultas concorrentes compartilham uma
operação e respostas de composição encerrada são ignoradas. O maior mínimo já
observado e a URL validada ficam em preferência privada excluída de backup; falha
de rede sem mínimo conhecido permanece aberta somente para o uso local permitido.
O pacote que introduz o schema v4 usa `versionCode 2`; `versionName` continua
somente informativo e não participa da comparação.
Com pacote obsoleto, o guard global substitui toda navegação por `main`, heading e
ação da Play Store. Somente o path exato do workout capturado antes da detecção
permanece montado até `completed` ou `cancelled`; preparação, takeover, nova sessão
e todas as entradas do sincronizador permanecem bloqueados. A bridge tenta primeiro
o intent restrito a `com.android.vending` e depois a mesma URL HTTPS no navegador.

Criação e migrations pertencem ao `SQLiteOpenHelper`. Falha de abertura é tentada
novamente com outro handle; falha persistente, migration ausente ou downgrade
recria banco, sidecars e arquivos e registra somente diagnóstico sanitizado. O
registro `migration-reset` fica fora do banco recriado e sobrevive até a UI mostrar
um `AlertDialog` persistente sobre possível perda e a pessoa reconhecer `Entendi`.
Não há restauração fictícia, envio parcial ou Analytics desse conteúdo.
Falha no próprio reset rejeita comandos sem fallback Web.

O coordenador nativo mantém um envelope v1 mínimo (`accessToken`, `expiresAt` e
`personId`) e o UUID v4 aleatório da instalação no secure storage cifrado pelo
Android Keystore. Envelope ausente, inválido, ilegível ou evidentemente expirado
falha fechado; expiração remove somente o envelope, preservando UUID, vínculo e
dados da conta. A `Person` devolvida por `POST /auth/native/session` é a única fonte
canônica de identidade. Mesma pessoa substitui somente a credencial; pessoa
diferente encerra a geração e limpa a conta anterior antes de confirmar a nova.
Falha de limpeza impede ativação e revoga a nova sessão em best effort.
Depois de validar uma sessão recuperada e antes de confirmar um login, o
coordenador vincula a identidade canônica ao motor. `NativeLocalDataPort` consulta
pendências reais — sessão ativa ou snapshot `pending` — e sua limpeza coordena o
motor antes de remover o tema Web local.

`AppProviders` é o ponto de composição e permite injetar diretamente um snapshot
em testes. Componentes, hooks e rotas acessam apenas `PlatformContext` e
`usePlatform`; não importam Capacitor. O ESLint proíbe `@capacitor/*` em todo
`ui/src`, exceto em `src/core/platform/native/`. Novas capacidades adicionam seu
port e adapter somente quando possuírem comportamento e consumidor reais.

O template Capacitor 8.5.2 conserva compile/target SDK 36, Android Gradle Plugin
8.13.0 e Gradle Wrapper 8.14.3. Apenas `minSdkVersion` é elevado para 29. Assets
web copiados, configuração gerada, caches e outputs Gradle não são versionados;
configuração, wrapper e código nativo necessários para reproduzir o build são.

O build publicável é exclusivamente `pnpm android:build:release`. Antes de tocar o
Gradle, o script exige `VITE_API_URL` HTTPS público,
`VITE_GOOGLE_SERVER_CLIENT_ID`, mocks desativados e as quatro entradas da upload
key; remove `dist`, recompila, sincroniza o Capacitor e executa `bundleRelease`.
Depois verifica a assinatura e grava SHA-256 e metadados públicos ao lado do AAB.
Ausência ou inconsistência falha fechado, sem fallback unsigned/debug. A app
signing key própria não alcança o projeto nem o CI; somente a upload key separada
entra no environment protegido `android-production`.

O launcher usa o símbolo azul-claro Dall Fit (`#21B9E5`) em adaptive icon com
camada monocromática; o mesmo desenho identifica as notificações em silhueta, e a
abertura usa `androidx.core:core-splashscreen` sem Activity ou timer adicional. O
manifest release mantém somente `INTERNET`, `ACCESS_NETWORK_STATE` e a permissão
opcional `POST_NOTIFICATIONS`. O `FileProvider` não é exportado e expõe somente
`files/offline/account/files/`; não existem paths genéricos de cache ou external
storage.

## Estrutura alvo

Quando as funcionalidades surgirem, organizar por responsabilidade:

```text
src/
├── core/                # infraestrutura e componentes realmente transversais
├── domain/              # regras e tipos exclusivos do frontend
├── routes/              # módulos organizados por rota
├── context/             # providers globais
└── mocks/               # mocks na fronteira de rede
```

- rotas podem consumir `core`, `domain`, `context` e `@dall-fit/types`;
- `core` não depende de rotas;
- componentes exclusivos permanecem próximos da rota;
- um provider só se torna global quando precisa envolver toda a aplicação;
- a UI não importa arquivos internos da API.

A estrutura deve crescer conforme funcionalidades reais, sem diretórios vazios.

## Inicialização e navegação

1. `main.tsx` carrega os estilos globais.
2. `AppProviders` aplica `QueryClientProvider`, `ThemeProvider`, `PwaProvider` e o
   `WebConnectivityGuard`; somente conectado ele monta o único `Toast.Provider`
   global e a aplicação acionável.
3. `App` aplica o `RouterProvider` do TanStack Router e monta uma única instância
   de `Analytics` de `@vercel/analytics/react`. Breadcrumbs de domínio usam `Link`
   tipado diretamente para navegar sem recarregar o documento.
4. TanStack Router resolve a URL pela árvore manual de `routes/routes.tsx`.

Não usar roteamento baseado em arquivos nem adicionar o plugin gerador do TanStack
Router. Cada rota declara `getParentRoute`, `path` e componente; módulos de tela
devem usar lazy loading quando sua separação produzir ganho real. Links,
redirecionamentos, parâmetros e navegação programática usam APIs tipadas do
TanStack Router, sem manipulação manual de `history`.

### Deploy da SPA na Vercel

A UI é publicada como uma Single Page Application. O arquivo `ui/vercel.json`
prioriza arquivos físicos e envia qualquer path restante para `/index.html`,
preservando a URL solicitada no navegador. Depois que o documento principal é
entregue, o TanStack Router resolve a rota correspondente na árvore manual.

Esse fallback é obrigatório para que URLs navegáveis funcionem em acessos diretos,
recarregamentos e redirects HTTP externos. Em particular, o callback OAuth da API
redireciona o navegador diretamente para `/dash`; a Vercel deve entregar a SPA em
vez de procurar um arquivo físico nesse path e responder `404`.

Arquivos estáticos existentes continuam sendo atendidos normalmente pela Vercel.
Novas rotas da SPA são cobertas pelo mesmo fallback e não exigem regras individuais.

`ui/vercel.json` também aplica CSP e headers defensivos a todas as respostas. A
CSP permite scripts e endpoints do Vercel Analytics v2 pela própria origem,
conexão somente com a própria origem e a origem exata da API vigente, imagem local,
data URI, avatar Google, `img.youtube.com` e o host privado exato
`8u9fq5re0oenmrtc.private.blob.vercel-storage.com`. Para o player de vídeo, permite
script e frame somente de `https://www.youtube.com`; continua bloqueando objetos e
ancestrais. A API entrega signed URLs temporárias sob `exercise-images/`, e o
navegador busca os bytes diretamente do Blob/CDN sem cookie da API. A política não
usa wildcard de `vercel.app` nem conserva o host público excluído.

## Estado e integrações

- estado local fica próximo do componente proprietário;
- estado de servidor usa TanStack Query, com query keys estáveis e loading, erro,
  cache e invalidação explícitos;
- o `QueryClient` global desabilita refetch ao focar a janela e usa `staleTime` de
  30 segundos por padrão; retry usa uma tentativa após um segundo somente para
  timeout, rede sem response, `408`, `500`, `502`, `503` ou `504` de leitura;
  exceções ficam explícitas na query proprietária;
- chamadas HTTP passam por uma única instância Axios central e serviços tipados;
- componentes não chamam `fetch` diretamente;
- payloads compartilhados usam `@dall-fit/types`;
- desenvolvimento e testes simulam a fronteira HTTP com MSW, reutilizando o mesmo
  cliente da aplicação;
- credenciais e dados pessoais não aparecem em logs ou fixtures.

### Atualização em tempo real

`src/core/realtime` mantém um único `EventSource` autenticado por documento no
shell autenticado e um UUID efêmero compartilhado com o interceptor Axios das
mutações. O recurso participa do ciclo de sessão; logout ou troca de identidade
fecha a conexão e descarta o UUID. Após 60 segundos oculto o documento fecha o
stream e, ao voltar, reconecta. Todo `realtime-ready` invalida queries registradas
para reparar eventos perdidos.

Pontes de domínio interpretam `resource-invalidated`; o core não importa rotas.
A ponte de planos consulta o coordenador: trabalho local ou mutation pendente
pausa o aggregate e mantém o draft; estado limpo reconcilia automaticamente pela
leitura HTTP canônica.

O domínio de planos possui composições `global-admin`, `personal-owned` e
`personal-global-reference`. Elas compartilham apresentação e editor quando o
comportamento coincide, mas rotas/services HTTP continuam separados. O source
discriminado escolhe edição completa ou leitura completa; não existe matriz de
capabilities controlada pelo cliente.

O domínio `training` mantém servidor e draft de carga separados, serializa
mutations pelo ID da sessão e substitui o cache pela resposta canônica. Em conflito
de versão, sua exceção documentada ao coordenador genérico descarta o draft, refaz
o GET e avisa a pessoa; a decisão é aceitável porque existe uma única sessão e a
colisão depende de outro cliente. A sessão nunca é persistida no navegador.

O client Axios vigente está em `src/core/http/api-client.ts`, usa `VITE_API_URL`
como `baseURL`, `withCredentials=true`, timeout default de 15 segundos e erros de
timeout discrimináveis. Upload de imagem usa override finito de 60 segundos. Não
criar instâncias paralelas, request ilimitada nem usar Axios diretamente em
componentes. Services HTTP pertencem ao domínio ou à rota proprietária; hooks
TanStack Query consomem esses services e encaminham seu `AbortSignal` até o Axios.
Requests autenticadas combinam esse signal com o signal da geração de sessão;
cancelar a query, trocar de rota ou encerrar a sessão aborta também o transporte.

Cancelamento esperado é classificado antes de timeout, rede e response HTTP. Ele
não produz retry, toast, alerta, Analytics, diagnóstico sistêmico nem rollback que
recrie estado privado. Mutations usam retry zero. `400`, `401`, `403`, `404`, `409`,
`412`, `422`, `428`, `429`, erro de contrato e conflito nunca recebem retry
automático.

O mesmo client injeta `X-CSRF-Token` em POST, PUT, PATCH e DELETE a partir de um
store exclusivamente em memória. O token é obtido por `GET /auth/csrf` depois de
`GET /auth/me`; nunca entra em localStorage, sessionStorage, cookie legível ou
cache persistido. Obtenção concorrente é single-flight. Resposta `401` encerra a
geração de sessão; `403 CSRF_VALIDATION_FAILED` descarta e renova o token sem
repetir a mutation; `403 ADMIN_ACCESS_REQUIRED` revalida a pessoa e retira a UI da
branch administrativa sem logout. Outro `403` permanece com o fluxo proprietário.
Se a renovação CSRF falhar, a sessão continua ativa e mutations aguardam uma nova
obtenção single-flight na próxima ação explícita; a operação rejeitada não é
recriada pelo interceptor.

No Android, a instância Axios continua única, mas define `withCredentials=false`,
obtém o Bearer em memória pelo coordenador e injeta `Authorization` sem adicionar
`X-CSRF-Token`. Um `401` remove o envelope e encerra a geração; cookie eventualmente
presente no WebView nunca é fallback. O bootstrap protegido consulta somente
`GET /auth/me` com Bearer, não chama `GET /auth/csrf`, e a conexão SSE baseada em
cookie permanece desativada até existir transporte nativo próprio para realtime.

`src/auth/session-lifecycle.ts` mantém uma geração monotônica, um
`AbortController` e um registro mínimo de recursos privados. O primeiro `401`, o
logout ou a troca de identidade inicia um teardown idempotente; ocorrências
concorrentes compartilham a mesma Promise. O ciclo aborta requests, cancela e limpa
o QueryClient, limpa CSRF, reseta recursos registrados e trata terminalmente a
navegação. Callbacks de mutation capturam a geração e não escrevem cache, tema,
draft, toast ou Analytics depois que ela termina. Domínios futuros registram apenas
seus recursos externos ao QueryClient, sem serem importados por `core`.

Formulários usam TanStack Form. A composição tipada permanece próxima da rota;
helpers migram para `src/core/form/` somente quando houver reutilização real.
Validação, erros por campo, submissão, estado disabled e erros da API devem ser
observáveis e documentados na rota. Submissões assíncronas usam mutations do
TanStack Query quando atravessarem a fronteira HTTP.

### Mutações recuperáveis

Toda mutation nova ou alterada segue um ciclo de vida recuperável. Estado
confirmado pelo servidor e intenção local ainda não confirmada são representados
separadamente sempre que a pessoa puder continuar editando antes da resposta. Um
draft não é promovido silenciosamente a dado confirmado, e uma resposta tardia só
pode atualizar campos cuja intenção local não mudou desde o início daquela
request. Revisão, token da operação ou mecanismo equivalente deve impedir que uma
resposta antiga sobrescreva uma edição ou uma resposta mais nova.

Formulário, edição inline, `Modal` e `AlertDialog` permanecem no contexto até o
resultado terminal da operação. Enquanto a request estiver pendente, a UI impede
submissão duplicada e ações que descartariam o mesmo trabalho. Sucesso aplica a
response canônica e só então fecha ou encerra o contexto; falha encerra o loading,
mantém o draft e apresenta erro persistente com retry e cancelamento quando essas
ações forem seguras. Fechamento antecipado é exceção e precisa estar justificado no
SDD da rota por não haver estado recuperável ou por existir outro mecanismo
explícito de acompanhamento e recuperação.

Uma atualização otimista antecipa somente o efeito visual ou de cache que possui
rollback seguro. Ela não transforma uma request pendente em sucesso nem exige que
o contexto de edição seja fechado antes da confirmação. Quando o benefício não
compensar a complexidade, ou o rollback não puder ser localizado, a UI aguarda a
response canônica antes de alterar o dado de servidor apresentado.

Rollback otimista registra a menor informação suficiente — entidade, campo,
posição, item temporário e token da mutation — e reverte somente se o alvo ainda
contiver o efeito daquela operação. Não restaurar snapshots amplos de coleção ou
detalhe que possam apagar mudanças posteriores. IDs temporários existem somente
no estado da UI: não atravessam contratos persistentes, não viram parâmetros de
outra mutation e são substituídos ou removidos pelo resultado terminal da operação
que os criou.

Decisões de erro usam a combinação de status HTTP e `ApiError.code`, nunca
`message`, `details` ou `requestId`. Retry automático só é permitido quando a
operação for comprovadamente idempotente, a política estiver documentada e não
existir risco de duplicar intenção. Caso contrário, retry nasce de ação explícita
e reutiliza o draft atual, não um payload obsoleto.

Toda promise iniciada por formulário, confirmação, retry, navegação, refetch ou
ação do editor possui tratamento terminal explícito. `toast.promise` é feedback
complementar e não substitui fechamento, rollback, persistência de erro nem consumo
da rejeição. Trabalho assíncrono só pode ser deliberadamente independente da
interação quando tratar sua própria falha e essa independência estiver documentada.

Depois do sucesso de uma mutation, toda query que represente a entidade alterada
ou um resumo dela recebe a response canônica ou é invalidada de forma explícita.
Ao alterar um workout, isso inclui sua query projetada, o resumo no detalhe do
plano e a versão nas coleções já presentes do mesmo cenário. Navegar para um
ancestral e retornar não pode reapresentar estado anterior confirmado. Falha,
cancelamento, conflito ou callback de geração encerrada não publicam o draft como
dado canônico.

Se sair da rota puder perder draft, debounce, operação enfileirada ou em execução,
ou falha ainda recuperável, a navegação é protegida por confirmação acessível.
Operações de fundo sem trabalho recuperável não bloqueiam navegação apenas por
estarem pendentes. Estados de espera, erro, retry, cancelamento e bloqueio usam
nomes acessíveis, foco previsível, anúncio apropriado e controles disabled de forma
coerente com sua semântica.

O `ReloadSafetyProvider` aplica a mesma fronteira ao recarregamento ou fechamento
manual do documento por `beforeunload`, registrando o listener somente enquanto
existir ao menos um bloqueador. O diálogo nativo protege o trabalho ainda não
confirmado; depois que drafts, debounces e mutations terminam, o listener é
removido para não interferir em recargas seguras.

### Mutações de aggregates versionados

Quando a API exigir uma precondição de versão e múltiplas mutations puderem alterar
o mesmo aggregate, elas compartilham um coordenador por ID do aggregate. O
coordenador vive em um escopo que sobreviva aos componentes e rotas consumidoras,
serializa em FIFO apenas o mesmo aggregate e permite paralelismo entre aggregates
diferentes. A versão é injetada quando a tarefa chega à cabeça da fila; capturá-la
no clique ou no agendamento não é suficiente.

A versão corrente do coordenador é monotônica. Leituras canônicas podem criar o
estado ou avançar uma fila ociosa, mas uma leitura ou montagem atrasada nunca
regride a versão produzida por mutation. Depois de um sucesso, inclusive quando a
fila já voltou a ficar ociosa, a próxima operação usa a versão resultante anterior.
Reinicializar uma fila pausada exige uma leitura canônica bem-sucedida no fluxo
explícito de recuperação.

O efeito otimista começa somente na cabeça da fila, para que snapshot e versão
representem o estado que será efetivamente enviado. Conflito de versão não recebe
retry ou merge silencioso: a fila do aggregate é pausada, o trabalho recuperável é
preservado e a pessoa decide quando recarregar a representação canônica. Outros
status ou códigos não são promovidos a conflito por semelhança de mensagem.

Esse coordenador é condicional, não uma abstração obrigatória para todo domínio.
Recursos sem versão, mutations independentes ou contratos intencionalmente
last-write-wins seguem o ciclo recuperável geral e documentam que coordenação por
aggregate não se aplica.

Todo coordenador ou recurso privado que sobreviva às rotas registra um reset no
ciclo de sessão. O coordenador de planos permanece no domínio `training-plan`, mas
seu reset cancela como operação esperada tarefas em execução/espera e remove IDs,
versões e pausas antes de uma nova pessoa usar o documento.

Quando um formulário for dividido em componentes menores, usar a composição
oficial com `createFormHook`, `createFormHookContexts` e `withForm`. O tipo da
instância deve ser inferido por essa composição; não declarar `AnyFormApi`, não
duplicar manualmente tipos internos do form e não usar casts para repassar a
instância. Componentes de campo compartilhados só pertencem a `src/core/form/`
quando possuírem contrato transversal real.

Introduzir internacionalização ou alterar essas escolhas exige atualizar esta base
e registrar ADR quando houver trade-off transversal. O design system e suas regras
vigentes estão definidos em `03-componentes-e-estilizacao.md`.

MSW está configurado para autenticação e planos globais, seguindo
`05-mocks-de-api.md`. Playwright cobre as rotas e jornadas desses domínios,
seguindo `07-testes-integrados-playwright.md`.

### Aplicação vigente nas mutações de planos

O editor consulta `TrainingPlanWorkoutDetails` por query própria. Toda mutação de
um plano existente, seja iniciada na lista, detalhe ou editor, passa pelo mesmo
coordenador FIFO por `trainingPlanId`. O coordenador pertence ao `QueryClient`,
preserva-se entre rotas, injeta a versão somente quando a tarefa chega à cabeça da
fila e conserva o valor retornado em `X-Resource-Version`. Planos diferentes
mantêm filas independentes; a criação de plano, ainda sem ID, permanece fora
delas. Essa aplicação concreta segue o padrão condicional de aggregates
versionados acima; o efeito otimista também só começa na cabeça da fila.

A versão proveniente de uma leitura cria um estado que ainda não existe ou avança
uma fila ociosa sem conflito; nunca regride a versão já produzida por uma mutation.
Depois do primeiro sucesso, novas mutations usam a versão interna produzida pela
fila mesmo quando começam após um período ocioso e a tela ainda conserva a versão
da leitura original. Somente uma leitura canônica confirmada pela recuperação de
conflito reinicializa e libera explicitamente uma fila pausada.

Debounces de três segundos continuam independentes por linha. Não há retry
automático de mutation. Somente `412 TRAINING_PLAN_VERSION_CONFLICT` pausa a fila,
mantém drafts e exige recarga confirmada; outro `412` é falha genérica. Resposta de
autosave é mesclada apenas nos campos que não receberam edição posterior. O reload
só libera a fila e descarta os drafts depois de uma leitura canônica bem-sucedida.

Reordenação usa dnd kit com sensores de ponteiro e teclado e só envia a ordem no
drop. O seletor transversal `core/components/image-file-picker` valida
preliminarmente tipo/tamanho e envia `FormData`; arquivo nunca vira base64. Campos,
Select, NumberField, Dropdown, Popover, Alert, Chip e Spinner permanecem HeroUI.

Imagens privadas chegam no contrato como `thumbnailUrl`, `displayUrl` e
`signedUrlExpiresAt`. A query do workout agenda refetch dois minutos antes da
primeira expiração e repete a verificação ao voltar à aba. A primeira falha de uma
imagem perto do prazo renova uma vez por ciclo; depois disso o componente mostra
fallback acessível e retry manual. A sincronização troca somente o objeto `image`
da linha persistida e preserva drafts, dirty patches, revisões e estado da fila.
Signed URLs são credenciais efêmeras: não entram em Analytics, logs, storage ou
cache persistente da PWA, e o `<img>` usa `referrerPolicy="no-referrer"`.
O preview de vídeo usa `react-player` v3 em um `Modal` HeroUI. O módulo e o player
só são carregados/montados com o overlay aberto; `playing`, `muted` e `playsInline`
definem a reprodução, `cc_load_policy: 0` não força legendas e desmontar o
componente ao fechar interrompe o vídeo. Os modais de mídia removem a animação de
saída para que conteúdo e overlay desapareçam juntos, sem um estado intermediário
de redimensionamento.

### Analytics e privacidade

`src/core/analytics/index.ts` é a única fronteira de eventos customizados. Ela usa
`track` do pacote oficial, converte somente enums tipados em propriedades planas,
omite propriedades ausentes, normaliza os paths dinâmicos e absorve falhas da
coleta. Eventos idênticos repetidos no mesmo ciclo de interação são descartados.
Não existe provider, event bus, client paralelo, listener global de cliques ou
captura de teclas.

`App` mantém uma única instância do componente oficial. O script acompanha o
carregamento inicial e as transições client-side produzidas pelo router sem mudar a
árvore de providers ou provocar reload do documento. Desenvolvimento usa o modo do
pacote sem envio de produção e os testes isolam componente e transporte.

Quando o hint Web/PWA está offline, as fronteiras de eventos retornam antes de
chamar o SDK e o `beforeSend` global descarta pageviews ou eventos que disputem com
a mudança de conectividade. Nada é enfileirado ou repetido ao reconectar; somente
interações novas, produzidas depois da remontagem online, podem ser emitidas.

O contexto comum de eventos aceita somente `route`, `surface` e `control`. `route`
é omitida quando o path não é conhecido; nos paths vigentes, aceita somente `/`,
`/dash`, `/global/training-plan`,
`/global/training-plan/:trainingPlanId` e
`/global/training-plan/:trainingPlanId/workout/:workoutId`. Query, hash, URL
completa e valores concretos dos segmentos nunca são propriedades.

| Evento                    | Propriedades adicionais vigentes                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ui_navigation_selected`  | `destination`, `navigation_kind` (`menu`, `breadcrumb`, `row_link`, `pagination`)                                      |
| `ui_button_pressed`       | `action` enumerada pela fronteira                                                                                      |
| `ui_menu_opened`          | `menu` (`application`, `row_actions`)                                                                                  |
| `ui_menu_action_selected` | `menu`, `action` (`edit`, `delete`)                                                                                    |
| `ui_overlay_opened`       | `overlay`, `mode` opcional (`create`, `edit`)                                                                          |
| `ui_overlay_closed`       | `overlay`, `reason` (`cancel`, `close_trigger`, `backdrop`, `escape`, `submit`, `confirm`, `navigation`, `breakpoint`) |
| `ui_field_focused`        | `form`, `field`                                                                                                        |
| `ui_field_completed`      | `form`, `field`, `state` (`empty`, `valid`, `invalid`)                                                                 |
| `ui_form_submitted`       | `form`, `mode` (`create`, `edit`, `inline_edit`)                                                                       |
| `ui_operation_started`    | `operation`                                                                                                            |
| `ui_operation_completed`  | `operation`, `outcome` (`success`, `error`, `dismissed`, `unavailable`)                                                |
| `ui_retry_requested`      | `resource` (`training_plans`, `training_plan`, `workout`)                                                              |
| `ui_disclosure_toggled`   | `disclosure`, `state` (`open`, `closed`)                                                                               |
| `ui_system_failure`       | `category` (`bootstrap`, `render`, `pwa_registration`)                                                                 |

Eventos nunca recebem nome, e-mail, foto, token, payload HTTP, texto de plano ou
treino, ID de domínio, valor/tamanho/erro de campo, texto visível arbitrário ou
seletor `mock*`. Campos emitem o primeiro foco de cada montagem e um término apenas
quando o valor mudou desde o término anterior, sempre como estado enumerado.
Os overlays enumerados incluem `exercise_image_preview` e
`exercise_video_preview`; seus controles são `image_preview` e `video_preview` e
nunca enviam ID, nome, URL ou metadado da mídia.

O catálogo do workout inclui nome, tipo/adicionar, campo, handle/drop, exclusão,
upload/substituição/remoção, conflito e retry. Operações de workout/exercício/mídia
emitem início e terminal `success|error`; movimento intermediário do drag não
emite evento e nenhuma propriedade inclui IDs, ordem, URL, arquivo ou valor.

Todo novo botão, link acionável, campo, seleção, paginação, menu, disclosure,
overlay, toast com ação ou fluxo assíncrono deve mapear a interação a um evento do
catálogo na mesma mudança. Uma necessidade nova exige atualizar primeiro a feature
da demanda e este catálogo vivo. `ui_button_pressed` não acompanha outra emissão
mais específica da mesma ação, e operações assíncronas emitem um único início e um
único resultado terminal.

O login emite apenas `ui_operation_started/google_login` antes da navegação
top-level; não existe conclusão antecipada. Logout emite início e exatamente um
terminal `success|error`, sem token, pessoa ou detalhe técnico.

### Tema da aplicação

Antes de aguardar o MSW ou renderizar React, `main.tsx` lê sincronamente a chave
`dall-fit:theme`. Somente `light` e `dark` são válidos; na ausência, em valor
inválido ou em falha do armazenamento, o bootstrap usa
`prefers-color-scheme`. O resultado é aplicado como `data-theme` em `<html>` antes
da primeira pintura útil.

`ThemeProvider` fica dentro do `QueryClientProvider`, envolve rotas públicas e
privadas e é o único controlador do tema. Enquanto a fonte for o sistema, observa
mudanças do media query sem gravar localmente. Depois que o layout autenticado
recebe `Person`, `configs.theme` explícito prevalece e é sincronizado no
`localStorage`; se estiver ausente, a chave local é removida e o sistema passa a
ser a fonte. Assim uma escolha deixada por outra conta não é herdada.

O toggle do menu aplica o valor oposto e a chave local de forma otimista, chama
`PATCH /auth/me/configs` por uma mutation TanStack Query única e atualiza todas as
queries de pessoa com a response. Os menus persistente e móvel compartilham
loading e bloqueio de concorrência. Em falha, o provider restaura o tema confirmado
do perfil ou, quando ele não existia, remove a chave e volta a acompanhar o sistema;
o erro é anunciado pelo toast global.

## Progressive Web App

O build de produção usa `vite-plugin-pwa` 1.3 com a estratégia `generateSW`. O
manifest identifica a aplicação como `Dall Fit`, inicia em `/dash`, possui escopo
raiz e usa apresentação `standalone`. `public/favicon.svg` é a fonte vetorial
canônica do símbolo azul-claro Dall Fit (`#21B9E5`). Os demais ícones versionados
em `public/` incluem favicon ICO, variantes `64x64`, `192x192`, `512x512`, maskable
`512x512` e Apple Touch `180x180`; o script `pnpm -C ui generate:pwa-assets` os
reproduz a partir desse SVG.

O registro é manual pelo módulo React do plugin e ocorre no `PwaProvider` global.
Esse provider concentra o único estado de instalação, mesmo que as apresentações
desktop e móvel do menu coexistam no DOM, e observa:

- `beforeinstallprompt` para disponibilizar a ação nativa uma única vez;
- `appinstalled`, `display-mode: standalone` e `navigator.standalone` para ocultar
  ações quando a aplicação já está instalada;
- ausência, recusa ou falha do prompt para oferecer orientação manual compatível
  com iOS e demais navegadores;
- registro e URL reais por `onRegisteredSW`, com checagem inicial e no máximo uma
  vez por hora enquanto o documento estiver visível e online;
- retomadas por visibilidade, foco ou reconexão, usando o mesmo relógio e uma única
  Promise de `registration.update()`; antes dela, `sw.js` é revalidado com
  `cache: no-store` na mesma origem;
- worker em espera, ativação, `controllerchange` e um único reload confirmado do
  path, query e hash correntes.

O modo técnico continua `registerType: 'prompt'`, mas não apresenta confirmação no
caminho normal. Uma versão pronta é ativada e recarrega silenciosamente somente
quando `ReloadSafetyProvider` não possui bloqueadores. Essa fronteira core agrega
toda mutation TanStack Query pendente e recebe os owners de formulários alterados,
drafts, filas, autosaves, uploads, conflitos e edições temporárias das rotas. O
último owner removido retoma automaticamente uma atualização pendente; documento
oculto espera ficar visível. Leituras, menus e overlays sem valor alterado não
bloqueiam.

A resolução de `updateServiceWorker()` significa apenas que `SKIP_WAITING` pôde
ser enviado. O provider aguarda o worker esperado alcançar `activated`, assumir a
registration ou mudar o controller observado, com timeout de 15 segundos e
deduplicação por documento. Mudança iniciada em outra aba também respeita a
segurança local antes do reload. O caminho normal não mostra aviso, toast, modal ou
spinner e não registra ação humana.

Somente falha terminal de ativação mostra o aviso global
`Não foi possível atualizar`, informa que a versão atual continua utilizável e
oferece `Tentar novamente` e `Continuar`. Retry registra início e terminal
`success|error`; `Continuar` fecha o erro corrente sem remover registration ou
cache. Falhas automáticas usam apenas o diagnóstico sanitizado `pwa_update`;
falha de registro usa `pwa_registration`. A aplicação não exibe mensagem de cache
pronto, não solicita instalação automaticamente e permanece utilizável nas falhas.

O precache contém somente o app shell, bundles versionados, fontes e ativos locais
necessários. Requests da API, autenticação, imagens remotas, avatares, respostas
com dados pessoais e `mockServiceWorker.js` não entram no cache. Não existem push
notifications, background sync ou empacotamento para lojas neste contrato.

O PWA permanece desabilitado no servidor Vite de desenvolvimento e nos integrados
Playwright. Ele é emitido no build e exercitado pelo `vite preview`, evitando
concorrência entre o service worker do Workbox e o service worker do MSW. Em
produção, `vercel.json` serve primeiro arquivos reais, aplica fallback de SPA só
depois e mantém `sw.js` e `manifest.webmanifest` revalidáveis com seus MIME types
explícitos. A origem de produção precisa usar HTTPS, como exigido pela plataforma
de service workers.

O comando `pnpm test:pwa-update` cria dois builds de produção marcados somente no
HTML do ambiente isolado, serve ambos sucessivamente na mesma origem e usa Chromium
com Workbox real. Ele comprova reload único da aba segura e preservação do draft em
outra aba até a remoção do bloqueador; não registra o worker do MSW.

O empacotamento Capacitor não altera manifest, service worker, instalação ou
atualização do PWA. O build Android consome o mesmo build otimizado e acrescenta
autenticação, storage privado, preparação de treino e sincronização nativa em
foreground e por WorkManager atrás da fronteira de plataforma; Web/PWA não carregam
essas capacidades.

O documento compartilhado `index.html` declara a viewport com escala inicial e
máxima `1.0` e `user-scalable=no`. Essa política solicita o bloqueio de zoom manual
por pinça em todas as rotas web e na PWA `standalone`, sem listeners JavaScript ou
CSS que interfiram em rolagem, foco, teclado ou controles. Navegadores que preservem
zoom por políticas de acessibilidade mantêm sua própria decisão.

## Proteção de rotas

A árvore manual possui um layout sem path para rotas autenticadas. Seu
`beforeLoad` usa o `QueryClient` recebido pelo router context para aguardar
`GET /auth/me` quando ausente ou stale e depois `GET /auth/csrf` antes de carregar
qualquer filho. A query da pessoa permanece observada no shell, com `staleTime` de
30 segundos, refetch em foco/reconexão e intervalo de cinco minutos somente com o
documento visível.

- `401` limpa CSRF/cache privado e lança redirect tipado para `/`; uma entrada
  efetiva bloqueada preserva a intenção de destino conforme a
  [retomada após autenticação](02-rotas-e-comportamento.md#retomada-após-autenticação);
- falha exclusiva do bootstrap CSRF permanece recuperável e não transforma uma
  pessoa autenticada em anônima;
- outros erros permanecem erros da rota e são apresentados pelo componente de erro;
- o contexto autenticado entrega a `Person` inicial aos guards; o shell observa a
  mesma key sem duplicar o request fresco do `beforeLoad`;
- a proteção da UI é navegação e privacidade visual, nunca substitui o guard da API.

`src/auth/auth-return-to.ts` concentra a persistência temporária da intenção de
navegação em `sessionStorage`, sem dados de sessão. O Router valida o path contra
sua árvore e reutiliza os validadores de search da rota para guardar apenas seus
parâmetros aceitos. A raiz e `/dash` consomem a intenção; o handler de encerramento
de sessão coordena sua limpeza com a captura da entrada bloqueada. Preloads usam
somente a pessoa já cacheada e não ativam sessão, obtêm CSRF ou alteram a intenção.

Novas rotas privadas são adicionadas como filhas desse layout. Rotas públicas
continuam filhas diretas da root route.

Depois da proteção, o componente do layout autenticado mantém a query ativa,
reconcilia pessoa/tema e renderiza um shell visual compartilhado com o `Outlet`.
Revogação de `isAdmin` invalida o Router e substitui a branch por `/dash`; mudança
de ID encerra a geração anterior antes de expor outra identidade. O shell apresenta:

- um `aside` persistente a partir do breakpoint `md` de `768px`;
- um botão icon-only e um `Drawer` HeroUI dispensável abaixo de `768px`;
- o mesmo conteúdo de identidade e navegação nas duas apresentações;
- a mesma ação icon-only de tema e o mesmo estado de gravação nas duas
  apresentações;
- uma única mutation compartilhada de logout nas duas apresentações, com botão
  pending; sucesso ou falha remota termina a geração local, limpa estado privado e
  navega com replace para `/`; falha também anuncia toast acessível;
- a região `main` reservada ao conteúdo da rota filha.

Os componentes reutilizáveis do shell e do menu vivem em
`src/core/components/authenticated-shell/` e
`src/core/components/application-menu/`. O menu usa `Avatar`, `Typography` e
`Chip` do HeroUI, ícones individuais de `lucide-react` e links tipados do TanStack
Router. Ao entrar no breakpoint persistente, qualquer `Drawer` aberto é fechado e
não conserva estado para uma futura volta ao viewport móvel.

`adminRoute` declara um layout sem path cujo pai é o layout autenticado. Seu
`beforeLoad` reutiliza `Person` do contexto: `isAdmin: true` permite as rotas de
planos e a ausência da chave redireciona com substituição de histórico para
`/dash`. Lista, detalhe e workout são filhos desse layout, cuja branch faz parte da
`routeTree`. A proteção visual não substitui `AdminOnly` na API.

O módulo `src/routes/training-plan/` possui services Axios, query keys, queries,
coordenador e mutations. Atualizações otimistas registram tokens, entidades,
posições e campos mínimos; o rollback altera somente o alvo que ainda contém o
efeito daquela mutation, sem restaurar snapshots amplos. Detalhes de plano só são
removidos do cache depois de DELETE bem-sucedido.

Modal, formulário inline e confirmação permanecem no contexto durante pending e
falha, bloqueiam dismiss ou duplicidade durante a request e fecham somente após
sucesso. Erro persistente preserva o draft e permite retry ou cancelamento. Criar
workout espera o ID real. Mutations usam feedback visual complementar apenas em
resultados não cancelados e invalidam somente as famílias proprietárias; falha de
refetch preserva dado válido sem apagar conteúdo.

## Ambiente local

O Vite usa obrigatoriamente a porta `3000` e falha se ela estiver ocupada.
`ui/.env.example` declara:

- `VITE_API_URL=http://localhost:4000`, base da API usada pelo Axios;
- `VITE_ENABLE_API_MOCKS=false`, opt-in dos mocks MSW.
- `VITE_GOOGLE_SERVER_CLIENT_ID`, client OAuth Web/server público usado somente
  pela autenticação Android e obrigatório nesse runtime.

O `.env` local não é versionado. Toda variável exposta à UI usa prefixo `VITE_`,
é tipada em `src/vite-env.d.ts` e deve ser tratada como informação pública
incorporada ao bundle, nunca como segredo.

## Imports internos e compartilhados

Imports de arquivos em `src/` usam `~/*`, resolvido para o `src/` exclusivo da UI
por TypeScript, Vite e Vitest:

```ts
import { WorkoutPage } from '~/routes/workout';
```

Contratos do monorepo são consumidos por seus pacotes públicos no namespace
`@dall-fit/*`, como `@dall-fit/types`. `~/` nunca aponta para a API ou para outro
pacote do workspace, e `@/*` não é um alias válido.

`@dall-fit/types` publica valores de runtime em CommonJS para a API NestJS e é uma
dependência vinculada pelo workspace. `vite.config.ts` mantém esse pacote em
`optimizeDeps.include`, fazendo o servidor de desenvolvimento convertê-lo para ESM
antes de expor imports nomeados ao navegador. O build de produção preserva o mesmo
consumo público por meio da interoperabilidade CommonJS do Vite.

## Referências oficiais

- [Capacitor 8](https://capacitorjs.com/docs)
- [Workflow do Capacitor](https://capacitorjs.com/docs/basics/workflow)
- [Android no Capacitor](https://capacitorjs.com/docs/android)
- [Atualização para Capacitor 8](https://capacitorjs.com/docs/updating/8-0)
- [TanStack Router React](https://tanstack.com/router/latest/docs/framework/react/start/overview)
- [TanStack Query React](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Form React](https://tanstack.com/form/latest/docs/framework/react)
- [Axios](https://axios.rest/pages/getting-started/first-steps)
