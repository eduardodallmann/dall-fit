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
2. `AppProviders` aplica `QueryClientProvider`, `PwaProvider` e o único
   `Toast.Provider` global.
3. `App` aplica o `RouterProvider` do TanStack Router. Breadcrumbs de domínio usam
   `Link` tipado diretamente para navegar sem recarregar o documento.
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
`GET /auth/me` antes de carregar qualquer filho.

- `401` lança redirect tipado para `/`;
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

## Referências oficiais

- [TanStack Router React](https://tanstack.com/router/latest/docs/framework/react/start/overview)
- [TanStack Query React](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Form React](https://tanstack.com/form/latest/docs/framework/react)
- [Axios](https://axios.rest/pages/getting-started/first-steps)
