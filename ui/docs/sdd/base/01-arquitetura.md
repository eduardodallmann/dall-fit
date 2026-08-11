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
- `@vercel/analytics` para pageviews e eventos customizados sem conteúdo;
- Vitest para testes unitários e de componentes;
- Playwright para testes integrados no navegador.

`src/main.tsx` aguarda a ativação opcional do MSW, realiza o bootstrap e aplica
`AppProviders`. `src/app.tsx` monta o `RouterProvider`, e a árvore tipada vive em
`src/routes/routes.tsx`.

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
   único `Toast.Provider` global.
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
data URI, avatar Google, `img.youtube.com` e o host público exato
`gvi3tyf5ckqiqlak.public.blob.vercel-storage.com`, e bloqueia objetos, frames e
ancestrais. Imagens de exercícios são servidas pelo prefixo público
`exercise-images/`; a política não usa wildcard de `vercel.app`.

## Estado e integrações

- estado local fica próximo do componente proprietário;
- estado de servidor usa TanStack Query, com query keys estáveis e loading, erro,
  cache e invalidação explícitos;
- o `QueryClient` global desabilita refetch ao focar a janela, tenta novamente uma
  vez e usa `staleTime` de 30 segundos por padrão; exceções ficam na query
  proprietária;
- chamadas HTTP passam por uma única instância Axios central e serviços tipados;
- componentes não chamam `fetch` diretamente;
- payloads compartilhados usam `@dall-fit/types`;
- desenvolvimento e testes simulam a fronteira HTTP com MSW, reutilizando o mesmo
  cliente da aplicação;
- credenciais e dados pessoais não aparecem em logs ou fixtures.

O client Axios vigente está em `src/core/http/api-client.ts`, usa `VITE_API_URL`
como `baseURL` e `withCredentials=true` para enviar a sessão `HttpOnly` à API. Não
criar instâncias paralelas nem usar Axios diretamente em componentes. Services HTTP
pertencem ao domínio ou à rota proprietária; hooks TanStack Query consomem esses
services.

O mesmo client injeta `X-CSRF-Token` em POST, PUT, PATCH e DELETE a partir de um
store exclusivamente em memória. O token é obtido por `GET /auth/csrf` depois de
`GET /auth/me`; nunca entra em localStorage, sessionStorage, cookie legível ou
cache persistido. Resposta `401` limpa imediatamente o token. Mutations não fazem
retry automático de `403`.

Formulários usam TanStack Form. A composição tipada permanece próxima da rota;
helpers migram para `src/core/form/` somente quando houver reutilização real.
Validação, erros por campo, submissão, estado disabled e erros da API devem ser
observáveis e documentados na rota. Submissões assíncronas usam mutations do
TanStack Query quando atravessarem a fronteira HTTP.

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

### Coordenação do editor de workout

O editor consulta `TrainingPlanWorkoutDetails` por query própria. Toda mutação do
mesmo plano passa por uma fila FIFO local que conserva o valor retornado em
`X-Resource-Version`; debounces de três segundos continuam independentes por
linha. Não há retry de
mutation. Um `412` pausa a fila, mantém drafts e exige recarga confirmada. Resposta
de autosave é mesclada apenas nos campos que não receberam edição posterior.

Reordenação usa dnd kit com sensores de ponteiro e teclado e só envia a ordem no
drop. O seletor transversal `core/components/image-file-picker` valida
preliminarmente tipo/tamanho e envia `FormData`; arquivo nunca vira base64. Campos,
Select, NumberField, Dropdown, Popover, Alert, Chip e Spinner permanecem HeroUI.

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

Eventos nunca recebem nome, e-mail, foto, token, payload HTTP, texto de plano ou
treino, ID de domínio, valor/tamanho/erro de campo, texto visível arbitrário ou
seletor `mock*`. Campos emitem o primeiro foco de cada montagem e um término apenas
quando o valor mudou desde o término anterior, sempre como estado enumerado.

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
raiz e usa apresentação `standalone`. Os ícones versionados em `public/` incluem
as variantes `192x192`, `512x512`, `maskable 512x512` e Apple Touch `180x180`; o
script `pnpm -C ui generate:pwa-assets` os reproduz a partir do `favicon.svg`.

O registro é manual pelo módulo React do plugin e ocorre no `PwaProvider` global.
Esse provider concentra o único estado de instalação, mesmo que as apresentações
desktop e móvel do menu coexistam no DOM, e observa:

- `beforeinstallprompt` para disponibilizar a ação nativa uma única vez;
- `appinstalled`, `display-mode: standalone` e `navigator.standalone` para ocultar
  ações quando a aplicação já está instalada;
- ausência, recusa ou falha do prompt para oferecer orientação manual compatível
  com iOS e demais navegadores;
- nova versão do service worker para mostrar um aviso global e só ativá-la e
  recarregar após `Atualizar agora`.

`Agora não` dispensa o aviso apenas no documento corrente. A aplicação não exibe
mensagem de cache pronto, não solicita instalação automaticamente e continua
utilizável quando o registro, a instalação ou a atualização falham.

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

O documento compartilhado `index.html` declara a viewport com escala inicial e
máxima `1.0` e `user-scalable=no`. Essa política solicita o bloqueio de zoom manual
por pinça em todas as rotas web e na PWA `standalone`, sem listeners JavaScript ou
CSS que interfiram em rolagem, foco, teclado ou controles. Navegadores que preservem
zoom por políticas de acessibilidade mantêm sua própria decisão.

## Proteção de rotas

A árvore manual possui um layout sem path para rotas autenticadas. Seu
`beforeLoad` usa o `QueryClient` recebido pelo router context para garantir
`GET /auth/me` e depois `GET /auth/csrf` antes de carregar qualquer filho.

- `401` limpa CSRF/cache privado e lança redirect tipado para `/`;
- falha exclusiva do bootstrap CSRF permanece recuperável e não transforma uma
  pessoa autenticada em anônima;
- outros erros permanecem erros da rota e são apresentados pelo componente de erro;
- o contexto autenticado entrega `Person` aos filhos sem uma segunda request;
- a proteção da UI é navegação e privacidade visual, nunca substitui o guard da API.

Novas rotas privadas são adicionadas como filhas desse layout. Rotas públicas
continuam filhas diretas da root route.

Depois da proteção, o componente do layout autenticado renderiza um shell visual
compartilhado e o `Outlet`. O shell recebe a `Person` do contexto, sem consultar a
API novamente, e apresenta:

- um `aside` persistente a partir do breakpoint `md` de `768px`;
- um botão icon-only e um `Drawer` HeroUI dispensável abaixo de `768px`;
- o mesmo conteúdo de identidade e navegação nas duas apresentações;
- a mesma ação icon-only de tema e o mesmo estado de gravação nas duas
  apresentações;
- uma única mutation compartilhada de logout nas duas apresentações, com botão
  pending; sucesso revoga, limpa CSRF/cache e navega com replace para `/`, enquanto
  falha mantém o shell e anuncia toast acessível;
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

O módulo `src/routes/training-plan/` possui services Axios, query keys, queries e
mutations. Criação/edição/exclusão de plano e exclusão de workout usam snapshot,
atualização otimista e rollback; overlays de edição/exclusão fecham ao disparar a
mutation e não reabrem no rollback. Criar workout espera o ID real. Toda mutation
usa `toast.promise` e invalida o cache proprietário ao terminar. Falha de refetch
preserva dado válido e é comunicada sem apagar conteúdo.

## Ambiente local

O Vite usa obrigatoriamente a porta `3000` e falha se ela estiver ocupada.
`ui/.env.example` declara:

- `VITE_API_URL=http://localhost:4000`, base da API usada pelo Axios;
- `VITE_ENABLE_API_MOCKS=false`, opt-in dos mocks MSW.

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

- [TanStack Router React](https://tanstack.com/router/latest/docs/framework/react/start/overview)
- [TanStack Query React](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Form React](https://tanstack.com/form/latest/docs/framework/react)
- [Axios](https://axios.rest/pages/getting-started/first-steps)
