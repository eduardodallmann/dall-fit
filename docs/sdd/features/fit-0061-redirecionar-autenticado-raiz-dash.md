# Feature Spec: Redirecionar pessoa autenticada da raiz para o dashboard

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0061`](https://github.com/eduardodallmann/dall-fit/issues/61).
- Problema: a sessão persiste ao fechar e reabrir o navegador e o acesso direto a
  `/dash` reconhece a pessoa, mas entrar pela rota raiz `/` sempre apresenta a ação
  de login. A pessoa pode iniciar OAuth novamente apesar de já possuir uma sessão
  válida.
- Resultado: ao entrar em `/`, a UI verifica a sessão vigente; uma sessão válida
  substitui a navegação por `/dash`, enquanto sessão ausente ou expirada mantém a
  entrada pública atual.
- Referências:
  - [`ui/docs/sdd/routes/root.md`](../../../ui/docs/sdd/routes/root.md);
  - [`ui/docs/sdd/routes/dash.md`](../../../ui/docs/sdd/routes/dash.md);
  - [`docs/sdd/flows/login-google.md`](../flows/login-google.md);
  - [`api/docs/sdd/endpoints/current-person.md`](../../../api/docs/sdd/endpoints/current-person.md);
  - [rotas autenticadas do TanStack Router](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes);
  - [`QueryClient` do TanStack Query](https://tanstack.com/query/v5/docs/reference/QueryClient).
- Features relacionadas:
  - [`FIT-0001`](fit-0001-login-google.md), que introduziu a entrada pública e a
    proteção autenticada;
  - [`FIT-0029`](fit-0029-resiliencia-sessao-requests-pwa.md), que consolidou o
    ciclo de vida da sessão, requests e teardown local.

## Escopo

### Incluído

- verificar a sessão ao carregar diretamente ou navegar para `/`;
- reutilizar `GET /auth/me`, o client Axios com credenciais e a query vigente da
  pessoa atual como fonte da decisão;
- redirecionar uma sessão válida para `/dash` com substituição de histórico antes
  de apresentar a ação de login;
- manter a tela pública atual quando a API responder `401`;
- manter a rota pública disponível em falha técnica da verificação, sem apagar ou
  inventar estado de autenticação;
- preservar como terminal a navegação para `/` provocada por logout ou expiração,
  sem retorno automático imediato ao dashboard no mesmo teardown;
- adaptar os cenários MSW de autenticação para representar de forma determinística
  sessão válida, sessão ausente, login e logout durante o novo probe da raiz;
- aceitar na raiz o seletor `mockAuth` exclusivo de desenvolvimento já usado pelo
  domínio de autenticação, sem enviar esse valor ou seu header em produção;
- atualizar testes Vitest e Playwright proporcionais ao comportamento;
- atualizar a documentação viva da rota raiz e do fluxo de login.

### Não incluído

- alterar emissão, duração, armazenamento, revogação ou renovação da sessão;
- tornar `/` uma rota privada ou renderizar o shell autenticado nela;
- modificar o conteúdo ou o layout da tela de login e do dashboard;
- criar endpoint de sessão, mudar `GET /auth/me` ou alterar a API;
- armazenar token, cookie, pessoa ou marcador durável de autenticação no
  `localStorage` ou `sessionStorage`;
- alterar OAuth Google, logout, CSRF, permissões administrativas, PWA ou Analytics;
- criar alias ou redirect para rotas diferentes de `/dash`.

## Projetos e documentação afetados

- API e endpoints: nenhum código ou contrato HTTP muda;
  `api/docs/sdd/endpoints/current-person.md` é apenas a referência do probe
  existente e não precisa ser atualizado.
- UI e rotas: comportamento de `/` em `ui/docs/sdd/routes/root.md`; `/dash`
  permanece o destino privado já protegido e não muda seu conteúdo.
- Fluxos: `docs/sdd/flows/login-google.md`, acrescentando a retomada pela raiz com
  sessão válida e a permanência pública sem sessão.
- Contratos em `@dall-fit/types`: não se aplica; `CurrentPersonResponse` é
  reutilizado sem alteração.
- Decisões arquiteturais: não se aplica; a demanda reutiliza TanStack Router,
  TanStack Query, Axios e o ciclo de sessão vigentes.
- Handlers e fixtures MSW: handlers de autenticação devem sustentar os estados
  autenticado e não autenticado através do probe, login, expiração e logout;
  fixtures de `Person` existentes são reutilizadas.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

1. `/` continua sendo uma rota pública e acessível sem cookie de sessão.
2. Antes de renderizar a entrada pública, a rota consulta `GET /auth/me` pelo
   `QueryClient` e pela instância Axios única, com as credenciais configuradas pelo
   browser.
3. A decisão usa validação atual da API, sem inspecionar o cookie `HttpOnly`, sem
   marcador local de login e sem considerar apenas uma `Person` antiga em cache.
4. Uma resposta `200` substitui a URL por `/dash`; a tela e a ação de login não
   aparecem durante essa transição.
5. A query de pessoa confirmada pelo probe é reutilizada pela proteção de `/dash`.
   O carregamento do destino não repete imediatamente `GET /auth/me`; o bootstrap
   de `GET /auth/csrf` continua pertencendo exclusivamente ao layout autenticado.
6. Uma resposta `401` encerra o probe como ausência de sessão, mantém `/` e
   apresenta a tela de login atual sem erro técnico, dado privado ou ciclo de
   redirects.
7. Timeout, falha de rede ou status técnico preservam `/` e a ação de login depois
   da política vigente de retry. Esses erros não limpam cookie, cache privado de
   uma geração ativa ou preferência de tema e não são convertidos em `401`.
8. Quando o teardown de logout ou expiração já determinou uma navegação para `/`,
   essa transição não executa um novo probe capaz de desfazer imediatamente a
   intenção. O bypass vale somente para essa navegação; acesso direto,
   recarregamento ou navegação posterior para `/` volta a verificar a API.
9. A regra também se aplica quando `/` contém `authError=oauth_failed`: se ainda
   existir sessão válida, `/dash` prevalece; sem sessão, o alerta atual permanece.
10. O redirect usa a API tipada do TanStack Router e `replace: true`, evitando que
    o botão Voltar reapresente a entrada descartada enquanto a sessão continuar
    válida.
11. O probe automático não emite `google_login` nem outro evento customizado de
    operação; somente a ativação explícita de `Entrar com Google` conserva o evento
    vigente.
12. Com MSW habilitado, `/` aceita somente os valores já tipados de `mockAuth` para
    tornar os cenários reproduzíveis. Valor ausente ou inválido segue o fallback
    vigente, e builds sem mocks não enviam o header de seleção à API.

## Requisitos não funcionais

- Acessibilidade: enquanto a verificação impedir a renderização por tempo
  perceptível, a rota apresenta estado de progresso com nome acessível e sem
  anunciar conteúdo privado ou a ação de login prematuramente.
- Performance: cada entrada elegível em `/` realiza no máximo uma consulta lógica
  de pessoa, além do único retry transitório já permitido; o redirect reutiliza o
  resultado fresco no dashboard.
- Segurança e privacidade: a API continua sendo a única autoridade da sessão; a UI
  não lê credenciais, não persiste identidade e não envia `Person`, cookie, URL ou
  erro técnico para logs e Analytics.
- Observabilidade: não são criados eventos customizados para a decisão automática;
  falhas seguem as categorias e o tratamento sanitizado já existentes.

## Critérios de aceite

### Cenário 1 — Sessão válida na rota raiz

- Forma de validar:
  `http://localhost:3000/?mockAuth=authenticated` com MSW habilitado.
- Given: `GET /auth/me` responde `200` com uma pessoa fictícia.
- When: a pessoa abre ou recarrega `/`.
- Then: a URL é substituída por `/dash`, o shell autenticado é apresentado e a
  tela de login não aparece.
- And: o destino reutiliza a pessoa recém-consultada e não dispara um segundo
  `GET /auth/me` imediato.

### Cenário 2 — Rota raiz sem sessão

- Forma de validar:
  `http://localhost:3000/?mockAuth=unauthenticated` com MSW habilitado.
- Given: `GET /auth/me` responde `401 AUTHENTICATION_REQUIRED`.
- When: a rota raiz verifica a sessão.
- Then: a URL permanece `/`, a ação `Entrar com Google` fica disponível e nenhum
  dado privado é renderizado.
- And: não ocorre novo redirect nem erro não tratado.

### Cenário 3 — Falha técnica ao verificar sessão

- Forma de validar: `http://localhost:3000/?mockAuth=error` com MSW habilitado.
- Given: `GET /auth/me` responde com falha técnica após a política de retry.
- When: a rota raiz não consegue determinar a sessão.
- Then: a URL permanece `/` e a entrada pública continua disponível.
- And: a UI não declara logout, não redireciona para `/dash` e não expõe o erro
  técnico.

### Cenário 4 — Logout termina na entrada pública

- Forma de validar: cenário Playwright iniciado em
  `http://localhost:3000/dash?mockAuth=authenticated`.
- Given: a pessoa está no dashboard com uma geração de sessão ativa.
- When: aciona `Sair` e o teardown navega com substituição para `/`.
- Then: a tela de login permanece visível e o probe da raiz não devolve a pessoa
  imediatamente ao dashboard.
- And: uma entrada posterior e independente em `/` volta a consultar a sessão.

### Cenário 5 — Expiração em rota privada termina na raiz

- Forma de validar:
  `http://localhost:3000/dash?mockAuth=unauthenticated` com MSW habilitado.
- Given: uma rota privada já recebeu `401` e determinou o retorno para `/`.
- When: o teardown e o redirect terminam.
- Then: a tela de login permanece estável na raiz sem probe redundante nem retorno
  ao dashboard.

### Cenário 6 — Falha remota de logout preserva o teardown local

- Forma de validar: cenário Playwright iniciado em
  `http://localhost:3000/dash?mockAuth=logout-error`.
- Given: `POST /auth/logout` falha e a revogação remota não é confirmada.
- When: o teardown local limpa os recursos privados e substitui a URL por `/`.
- Then: a raiz mantém a tela de login e o feedback de falha, sem reabrir o shell
  autenticado no mesmo ciclo.
- And: recarregar ou abrir `/` em um novo documento volta a consultar a API, pois o
  bypass não é persistido.

### Cenário 7 — Erro OAuth não prevalece sobre sessão válida

- Forma de validar:
  `http://localhost:3000/?authError=oauth_failed&mockAuth=authenticated` com MSW
  habilitado.
- Given: a URL contém o erro genérico de callback, mas `GET /auth/me` confirma uma
  sessão válida.
- When: a rota raiz verifica a sessão.
- Then: a URL é substituída por `/dash` sem mostrar o alerta ou iniciar novo OAuth.

## Estratégia de entrega e compatibilidade

A implementação é exclusivamente aditiva no frontend. A resposta e os status de
`GET /auth/me` permanecem inalterados, e consumidores privados continuam usando a
mesma query. O probe da raiz deve forçar a confirmação atual da API; depois do
sucesso, o timestamp da query permite que `/dash` reutilize o dado dentro do
`staleTime` vigente. A navegação terminal do ciclo de sessão precisa sinalizar um
bypass transitório e consumível, nunca persistido, para preservar logout e
expiração sem desabilitar o comportamento em um novo documento.

Não há migração de dados, flag de rollout nem compatibilidade de contrato a
coordenar. Em produção, a primeira visita sem sessão passa a incluir uma leitura
segura e idempotente; o restante da entrada pública permanece igual.

## Plano de testes

- Vitest para a decisão da rota: `200` redireciona com `replace`, `401` libera a
  entrada, falha técnica mantém a rota e o bypass do teardown é consumido uma única
  vez;
- testes do ciclo de sessão para confirmar que logout/expiração não criam bounce e
  que uma navegação posterior volta a habilitar o probe;
- handlers MSW com estado determinístico para sessão válida, ausência, falha,
  login e logout, reiniciados entre testes;
- Playwright da rota `/` para sessão válida, ausente, falha técnica e
  `authError=oauth_failed`;
- Playwright do fluxo de login/logout para preservar o caminho público → OAuth
  fictício → `/dash`, o retorno terminal a `/` e o acesso direto autenticado;
- inspeção da quantidade de requests para impedir `GET /auth/me` duplicado no
  redirect;
- não executar E2E da API, pois endpoint, wiring, MongoDB e Redis não mudam;
- executar `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`, `pnpm build` e
  `pnpm test:integration` a partir da raiz.

## Riscos e decisões

- Um cache de pessoa ainda fresco não prova que o cookie e o registro Redis
  continuam válidos; por isso a entrada em `/` confirma a sessão na API antes de
  redirecionar.
- Consultar a API pode atrasar a primeira pintura da entrada pública. O estado de
  progresso evita piscar o login para uma pessoa autenticada, e a política de
  timeout/retry continua limitada.
- O redirect pode criar bounce depois de logout, expiração ou falha remota de
  revogação se toda chegada a `/` for tratada como acesso independente. Um bypass
  volátil de uso único preserva a transição terminal já decidida sem virar fonte de
  autenticação.
- Os mocks atuais consideram a pessoa autenticada por padrão. Os cenários públicos
  devem declarar sessão ausente e o estado simulado precisa refletir login/logout,
  para que os testes não obtenham um sucesso artificial nem entrem em loop.
- `beforeLoad` também participa do ciclo de preload do Router. A implementação deve
  evitar efeitos persistentes no probe e manter o redirect como única consequência
  do `200`.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Quality gates da raiz aprovados
