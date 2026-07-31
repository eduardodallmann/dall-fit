# Arquitetura base da UI

## Stack

A UI usa React 19, TypeScript, Vite, Tailwind CSS 4 e HeroUI 3. A estilização
própria usa a API Tailwind Variants exportada por `@heroui/styles`.

A fundação de aplicação usa:

- TanStack Router com árvore declarada manualmente;
- TanStack Query para estado de servidor;
- TanStack Form para formulários;
- Axios como client HTTP;
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
2. `AppProviders` aplica o `QueryClientProvider`.
3. `App` aplica o `RouterProvider`.
4. TanStack Router resolve a URL pela árvore manual de `routes/routes.tsx`.

Não usar roteamento baseado em arquivos nem adicionar o plugin gerador do TanStack
Router. Cada rota declara `getParentRoute`, `path` e componente; módulos de tela
devem usar lazy loading quando sua separação produzir ganho real. Links,
redirecionamentos, parâmetros e navegação programática usam APIs tipadas do
TanStack Router, sem manipulação manual de `history`.

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

MSW está configurado para as fronteiras de autenticação, seguindo
`05-mocks-de-api.md`. Playwright está configurado para as rotas e a jornada de login,
seguindo `07-testes-integrados-playwright.md`.

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

O ponto de extensão `adminRoute` declara um layout sem path cujo pai é o layout
autenticado. Seu `beforeLoad` reutiliza `Person` do contexto: `isAdmin: true` permite
o filho futuro e a ausência da chave redireciona com substituição de histórico para
`/dash`. Enquanto não possui rota navegável filha, ele não é agregado à `routeTree`,
pois uma branch sem path e vazia competiria com `/`. A primeira rota administrativa
deve ser adicionada como filha desse layout e agregá-lo à árvore; seu endpoint
também deve aplicar a autorização da API.

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
