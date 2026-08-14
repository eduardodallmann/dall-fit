# Rota `/dash`

## Objetivo funcional

- Problema resolvido: oferecer a entrada privada da aplicação dentro de uma
  estrutura compartilhada de identidade e navegação.
- Ator: pessoa autenticada, comum ou administradora.
- Resultado esperado: exibir o menu autenticado responsivo e manter vazia a região
  de conteúdo própria do dashboard.
- Fluxos relacionados: `../../../../docs/sdd/flows/login-google.md`.

## Entradas e pré-condições

- Como o usuário chega: callback de login, item `Home` ou URL direta.
- No deploy da Vercel, callback, URL direta e recarregamento de `/dash` entregam
  `index.html` pelo fallback da SPA; o TanStack Router resolve a rota sem `404` da
  plataforma.
- Path e query params: `/dash`; a query `mockAuth` existe somente com MSW e aceita
  os cenários `admin`, `unauthenticated`, `error`, `theme-light`, `theme-dark`,
  `theme-unset`, `theme-save-error`, `theme-save-error-unset`, `csrf-error`,
  `csrf-refresh`, `session-expired`, `admin-revoked` e `logout-error`.
- Contexto e estado persistido: cookie de sessão gerenciado pelo browser, cache
  TanStack Query, preferência opcional `dall-fit:theme` e estado local temporário
  do `Drawer` móvel.
- Permissões: sessão válida e pessoa existente. A rota é comum e não pertence ao
  layout administrativo.

## Elementos e conteúdo

Depois da proteção, o layout autenticado apresenta:

- menu persistente em um `aside` quando o viewport possui pelo menos `768px`;
- botão HeroUI somente com ícone Lucide `Menu` e nome acessível `Abrir menu` quando
  o viewport possui menos de `768px`;
- `Drawer` HeroUI móvel aberto pela esquerda, com backdrop clicável e controle
  `Fechar menu`;
- avatar com foto ou iniciais da primeira e última palavras do nome;
- no topo do bloco de identidade, avatar à esquerda e grupo de ações à direita,
  alinhados verticalmente ao centro; o toggle de tema precede o logout;
- nome em uma linha;
- e-mail em uma segunda linha, abaixo do nome e com menor destaque;
- truncamento independente do nome e do e-mail com reticências, preservando os
  valores completos no DOM;
- `Chip` HeroUI não interativo com texto `Admin`, somente quando
  `Person.isAdmin === true`;
- navegação principal com o link `Home`, ícone Lucide `House` e destino `/dash`;
- botão HeroUI icon-only que mostra `Sun` no escuro com nome `Ativar tema claro`
  ou `Moon` no claro com nome `Ativar tema escuro`;
- `Home` marcado visualmente e com `aria-current="page"`;
- somente para `Person.isAdmin === true`, link `Planos de treino` com ícone
  `Dumbbell`, destino `/global/training-plan` e estado ativo nos descendentes;
- seção `Aplicativo` no menu com instalação nativa quando o navegador oferece o
  prompt ou orientação manual expansível quando ele não está disponível;
- botão HeroUI icon-only de logout com ícone `LogOut` e nome acessível `Sair`, sem
  texto visível, compartilhado pelas apresentações persistente e móvel;
- região `main` sem conteúdo próprio, título, placeholder, card ou mensagem.

A rota pública `/` não recebe nenhum desses elementos.

## Caminho feliz

1. O layout autenticado executa `GET /auth/me` antes de renderizar o shell.
2. A API responde com `CurrentPersonResponse`; em seguida o layout obtém
   `GET /auth/csrf` e conserva o token somente em memória.
3. Somente após ambos concluírem, o layout reconcilia o provider: tema explícito do
   perfil prevalece e é sincronizado localmente; sem tema, remove a chave local e
   usa o sistema.
4. O layout entrega a mesma `Person` ao shell e ao contexto dos filhos, sem segunda
   request.
5. A largura do viewport seleciona a apresentação persistente ou móvel.
6. O menu exibe avatar com tema/logout à direita, nome, e-mail, indicador
   administrativo condicional e `Home` ativo.
7. A rota filha `/dash` não acrescenta conteúdo à região principal.

Resultado esperado: a pessoa reconhece sua sessão e possui navegação disponível,
enquanto o dashboard permanece intencionalmente vazio.

## Caminhos alternativos

### Alternativa 1 — Sessão ausente ou expirada

- Condição: API responde `401`.
- Comportamento: `beforeLoad` redireciona com substituição de histórico para `/`
  antes do shell.
- Resultado: menu, botão e dados pessoais não são renderizados.

### Alternativa 2 — Falha técnica

- Condição: API falha com status diferente de `401`.
- Comportamento: o erro permanece no router.
- Resultado: o estado informa indisponibilidade e orienta recarregar, sem exibir
  menu ou identidade parcial.

### Alternativa 3 — Pessoa administradora

- Condição: `Person.isAdmin === true`.
- Comportamento: o mesmo menu recebe o `Chip` textual `Admin` e o link
  `Planos de treino`.
- Resultado: a pessoa ganha entrada visível para a branch protegida; pessoa comum
  não reserva espaço para o item.

### Alternativa 4 — Instalação do PWA

- Condição nativa: o navegador dispara `beforeinstallprompt`.
- Comportamento: o menu mostra `Instalar aplicativo`; a ativação abre a interface
  nativa e consome esse prompt uma única vez. Enquanto a decisão estiver pendente,
  mantém a mesma ação em progresso nos menus persistente e móvel e não antecipa
  `Como instalar`.
- Condição manual: o prompt não existe, é recusado ou falha.
- Comportamento: somente depois do cancelamento ou da falha, o menu mostra
  `Como instalar` e expande instruções inline. Em iOS, orienta usar `Compartilhar`
  e `Adicionar à Tela de Início`; nos demais casos, orienta usar o menu do
  navegador.
- Resultado: a recusa não é persistida, não há prompt automático e a ação some em
  modo standalone ou após `appinstalled`.

### Alternativa 5 — Nova versão do PWA

- Condição: o service worker encontra uma versão em espera.
- Comportamento: um aviso global mostra `Nova versão disponível`, as ações
  `Atualizar agora` e `Agora não` e não interrompe o uso da rota. Abaixo de
  `640px`, as ações ficam abaixo da mensagem; a partir de `640px`, mensagem e ações
  usam a mesma linha quando houver espaço.
- Resultado: somente `Atualizar agora` ativa a versão e recarrega; `Agora não`
  dispensa o aviso no documento atual. Falhas permanecem não bloqueantes e sem
  detalhe técnico. O aviso não corta conteúdo nem cria rolagem horizontal.

### Alternativa 6 — Perfil sem preferência de tema

- Condição: `GET /auth/me` devolve `configs: {}`.
- Comportamento: a UI ignora e remove um valor local anterior, aplica o valor atual
  de `prefers-color-scheme` e passa a acompanhar suas mudanças sem persistir um
  default.
- Resultado: a conta não herda a escolha explícita de outra pessoa neste browser.

### Alternativa 7 — Falha ao salvar o tema

- Condição: `PATCH /auth/me/configs` falha por validação, autenticação, rede ou
  servidor.
- Comportamento: se o perfil possuía tema, restaura documento, provider e chave
  local; se não possuía, remove a chave, restaura o sistema atual e volta a
  acompanhá-lo. O cache de pessoa anterior é preservado.
- Resultado: mostra o toast acessível
  `Não foi possível salvar o tema. Tente novamente.` e permite tentar de novo.

### Alternativa 8 — Falha no bootstrap anti-CSRF

- Condição: pessoa foi carregada, mas `GET /auth/csrf` falha sem `401`.
- Comportamento: o shell e suas mutações não são liberados; o error component
  oferece recuperação por recarga e a UI não apaga autenticação por inferência.
- Resultado: nenhum token parcial é persistido e nenhum dado privado incompleto é
  renderizado.

### Alternativa 9 — Falha ao sair

- Condição: `POST /auth/logout` falha.
- Comportamento: o teardown local ainda aborta requests, limpa cache/CSRF e
  recursos da geração e navega com replace para `/`; um toast acessível informa
  que a revogação remota falhou.
- Resultado: nenhum dado privado permanece no documento, mesmo sem confirmação do
  endpoint.

## Validações

Não se aplica — a rota e o menu não possuem formulário nem entrada editável.

## Estados

- Loading: skeletons estruturais com nome acessível `Carregando sua conta` durante
  a proteção, sem shell.
- Vazio: região principal intencionalmente vazia depois do sucesso.
- Sucesso comum: shell com identidade e `Home`, sem `Admin`.
- Sucesso administrativo: mesmo shell acrescido do `Chip` `Admin`.
- Erro recuperável: mensagem `Não foi possível carregar sua conta` e orientação de
  recarga, sem shell.
- Erro não recuperável: não se aplica.
- Ações desabilitadas: controles de tema, logout, instalação e atualização indicam
  o progresso e evitam ativações concorrentes. Os dois toggles de tema compartilham
  exatamente o mesmo pending; os dois botões icon-only de logout conservam seu
  slot, compartilham outra única mutation e o mesmo pending.

## Integrações

### Pessoa atual

- Momento: `beforeLoad` do layout autenticado.
- Endpoint documentado: `api/docs/sdd/endpoints/current-person.md`.
- Dados enviados: cookie automaticamente por `withCredentials`.
- Resposta utilizada: `data.name`, `data.email`, `data.photoUrl`, `data.configs`
  e o opcional `data.isAdmin`.
- Sucesso: pessoa entregue ao shell e ao contexto; a presença de `isAdmin: true`
  mostra o indicador e a ausência representa pessoa comum.
- Erros: `401` redireciona; demais erros acionam o error component.
- Retry, timeout e idempotência: `staleTime` de 30s, query ativa, foco/reconexão e
  intervalo visível de cinco minutos; uma tentativa apenas para falha transitória
  permitida e timeout Axios de 15s.

### Bootstrap anti-CSRF

- Momento: depois de `GET /auth/me` e antes de renderizar o shell.
- Endpoint documentado: `api/docs/sdd/endpoints/auth.md`.
- Persistência: somente variável em memória consumida pelo interceptor Axios.
- Erros: `401` limpa token/cache e redireciona; outra falha permanece recuperável
  no error component sem declarar logout.

### Atualizar tema da pessoa atual

- Momento: ativação de `Ativar tema claro` ou `Ativar tema escuro`.
- Endpoint documentado: `api/docs/sdd/endpoints/current-person.md`.
- Dados enviados: exatamente `{ theme: "light" | "dark" }`, cookie automático e
  `X-CSRF-Token`; o browser fornece Origin.
- Antes da resposta: aplica `data-theme`, estado global e chave local de forma
  otimista; bloqueia ambos os toggles.
- Sucesso: mantém a escolha, atualiza todas as queries de pessoa com a response e
  registra a preferência confirmada sem novo `GET /auth/me`.
- Erro: executa o rollback descrito na alternativa 7 e anuncia a falha.
- Retry, timeout e idempotência: sem retry adicional da mutation; nova ativação é
  possível depois do término e repetir o mesmo tema é idempotente na API.

### Encerrar sessão

- Momento: ativação do controle icon-only com nome acessível `Sair` em qualquer
  apresentação do menu.
- Endpoint documentado: `api/docs/sdd/endpoints/auth.md`.
- Dados enviados: body vazio, cookie automático e CSRF em memória.
- Resultado local: sucesso ou falha remota executa o mesmo teardown idempotente,
  aborta requests, limpa cache/CSRF/recursos privados e navega com replace para `/`.
- Sucesso: limpa token e cache privado, emite resultado de analytics e navega com
  replace para `/`.
- Erro: mantém rota, identidade e caches; reabilita o botão e mostra
  `Não foi possível sair. Tente novamente.`.
- Retry: somente por nova ativação explícita.

## Responsividade e interações do menu

### Viewport menor que `768px`

1. O `aside` persistente fica oculto e fora da interação.
2. `Abrir menu` fica visível.
3. A ativação abre o `Drawer` pela esquerda e bloqueia a rolagem externa.
4. O foco permanece contido no diálogo enquanto ele está aberto.
5. `Fechar menu` aparece visualmente sobre o backdrop, imediatamente à direita da
   borda do drawer; tema e logout permanecem dentro do menu.
6. Backdrop, `Escape`, `Fechar menu` ou ativação de `Home` fecham o overlay.
7. Ao fechar sem navegação, o foco retorna a `Abrir menu`.

Se o viewport alcançar `768px` com o `Drawer` aberto, ele fecha. Voltar ao viewport
móvel não o reabre.

### Viewport igual ou maior que `768px`

- o `aside` permanece visível ao lado da região principal;
- botão, diálogo e backdrop móveis não ficam disponíveis para interação;
- menu e conteúdo podem ser usados simultaneamente, sem contenção de foco ou
  bloqueio de rolagem modal.

## Navegação

- Entrada: callback, URL direta ou item `Home`.
- Avanço: `Home` e, para administradora, `Planos de treino` usam `Link` tipado do
  TanStack Router, sem reload.
- Rota atual: ativar `Home` em `/dash` mantém a rota; no `Drawer`, também fecha o
  menu.
- Retorno: browser volta à página anterior conforme seu histórico.
- Botão voltar do navegador: preservado pelo router.
- Dados preservados: TanStack Query preserva a pessoa enquanto o cache estiver
  válido; cookie permanece inacessível ao JavaScript; estado aberto do `Drawer`
  não é persistido.
- Compatibilidade: `/me` não pertence mais à árvore e não possui alias nem
  redirect.

## Acessibilidade e interação

- `aside`, `nav`, `main` e `dialog` preservam seus landmarks e nomes acessíveis;
- o botão icon-only possui nome `Abrir menu`; ícones `Menu` e `House` são
  decorativos e não duplicam labels;
- o toggle icon-only possui nome dinâmico que descreve a ação; `Sun` e `Moon` são
  decorativos, e pending impede concorrência sem remover o controle;
- o logout icon-only conserva o nome `Sair` ou `Saindo`, usa ícone decorativo e não
  depende de texto visível nem de sua posição ao lado do avatar;
- o `Drawer` possui nome `Menu da aplicação`, controle `Fechar menu` semanticamente
  preservado e posicionado sobre o backdrop, contenção e restauração de foco e
  fechamento por `Escape`;
- links do menu têm label visível, foco visível e `aria-current="page"` quando
  ativos;
- a instalação manual usa `Disclosure` com trigger nomeado, conteúdo inline e
  texto de compatibilidade; não abre modal dentro do `Drawer`;
- o aviso de versão possui título, descrição textual, região viva polida e duas
  ações explícitas, sem depender apenas de cor; mensagem e ações mantêm a mesma
  ordem de leitura e de foco em todas as larguras;
- o avatar é exposto como imagem com o nome completo da pessoa; foto e iniciais são
  apresentações alternativas da mesma identidade;
- nome e e-mail usam `Typography` HeroUI; cada um ocupa sua própria linha com
  truncamento por CSS, sem alterar a string;
- `Admin` possui texto explícito, não depende de cor e não entra na ordem de foco;
- loading possui nome acessível além dos skeletons; erro possui texto explícito.

## Responsividade do aviso de atualização

### Viewport menor que `640px`

- o aviso preserva `16px` de distância das laterais e da borda inferior;
- indicador, título e descrição formam a primeira região de conteúdo;
- as ações aparecem abaixo da mensagem, usam a largura disponível e podem quebrar
  entre linhas sem cortar seus textos;
- o aviso permanece sobre o shell sem ampliar a largura do documento nem bloquear
  o menu ou a região principal.

### Viewport igual ou maior que `640px`

- o aviso preserva `24px` de distância das laterais e largura máxima de `768px`;
- mensagem e ações ficam lado a lado, com as ações em sua ordem original;
- redimensionar o viewport altera somente a disposição visual e não confirma nem
  dispensa a atualização.

## Analytics

- abrir o drawer móvel emite `ui_menu_opened` para `application`; seu fechamento
  emite `ui_overlay_closed` com `close_trigger`, `backdrop`, `escape`, `navigation`
  ou `breakpoint`, conforme a interação que efetivamente o fechou;
- `Home` e `Planos de treino` emitem `ui_navigation_selected` com navegação `menu`
  e destino enumerado, sem query ou reload do documento;
- o toggle emite início e resultado `success|error` de `theme_update`, sem enviar o
  tema anterior, o tema escolhido ou dados da pessoa;
- logout emite início e resultado `success|error`, sem enviar token, pessoa ou
  conteúdo do erro;
- a instalação nativa emite início e resultado
  `success|dismissed|error` de `pwa_install`; `Como instalar` emite somente
  `ui_disclosure_toggled` com `open|closed`;
- a atualização da PWA segue os eventos documentados na rota `/`;
- nome, e-mail, foto, `isAdmin`, preferência e seletores `mockAuth` nunca entram nas
  emissões.

## Referências visuais de layout — opcional

Não se aplica — não existem imagens em `routes/assets/dash/`.

## Cenários funcionais

### Cenário 1 — Menu persistente em tablet e desktop

- Link para testar: `http://localhost:3000/dash` com MSW habilitado, em `768x1024`
  ou viewport maior
- Given: o handler devolve pessoa fictícia comum
- When: a rota protegida carrega
- Then: mostra o `aside` com identidade e `Home` ativo, oculta `Abrir menu` e mantém
  a região principal vazia

### Cenário 2 — Abrir e fechar o menu móvel pelo backdrop

- Link para testar: `http://localhost:3000/dash` com MSW habilitado, em `390x844`
- Given: somente `Abrir menu` está visível
- When: a pessoa abre o `Drawer` e ativa o backdrop
- Then: o menu fecha e o foco retorna ao trigger

### Cenário 3 — Operar e fechar o menu móvel pelo teclado

- Link para testar: `http://localhost:3000/dash` com MSW habilitado, em `390x844`
- Given: o foco está em `Abrir menu`
- When: a pessoa abre pelo teclado, percorre os controles e pressiona `Escape`
- Then: o foco permanece contido enquanto aberto, o menu fecha e o foco retorna ao
  trigger

### Cenário 4 — Pessoa administradora

- Link para testar:
  `http://localhost:3000/dash?mockAuth=admin` com MSW habilitado
- Given: o handler devolve pessoa fictícia com `isAdmin: true`
- When: o shell renderiza
- Then: exibe foto, nome, e-mail, `Chip` `Admin`, `Home` e `Planos de treino`

### Cenário 5 — Orientação manual de instalação

- Link para testar: `http://localhost:3000/dash` com MSW habilitado
- Given: o Vite de desenvolvimento não registra PWA e não existe prompt nativo
- When: a pessoa aciona `Como instalar` no menu
- Then: expande instruções do navegador e a nota de compatibilidade sem abrir outro
  overlay

### Cenário 6 — Sessão ausente

- Link para testar:
  `http://localhost:3000/dash?mockAuth=unauthenticated` com MSW habilitado
- Given: o handler devolve `401`
- When: a proteção executa
- Then: redireciona para `/` sem mostrar shell ou dados pessoais

### Cenário 7 — Erro de integração

- Link para testar:
  `http://localhost:3000/dash?mockAuth=error` com MSW habilitado
- Given: o handler devolve `503`
- When: a proteção executa
- Then: exibe o estado de erro recuperável sem shell ou identidade parcial

### Cenário 8 — Aviso responsivo de nova versão

- Link para testar: não se aplica — o estado depende de uma nova versão do Service
  Worker instalada em espera no preview do build
- Given: uma nova versão está em espera enquanto a rota autenticada está aberta
- When: o aviso é conferido em `320x568`, `360x800`, `390x844` e `768x1024`
- Then: todo o conteúdo permanece dentro do viewport; abaixo de `640px`, as ações
  ficam abaixo da mensagem e, a partir desse breakpoint, ficam ao lado dela
- And: não há corte, sobreposição ou rolagem horizontal e o shell continua operável

### Cenário 9 — Perfil substitui tema local

- Link para testar: `http://localhost:3000/dash?mockAuth=theme-light` com MSW e
  `dall-fit:theme=dark` preparado antes da navegação
- Given: o bootstrap aplicou `dark` e o perfil devolve `configs.theme=light`
- When: a proteção termina
- Then: o shell usa `light` e a chave local passa a conter `light`

### Cenário 10 — Perfil sem tema usa o sistema

- Link para testar: `http://localhost:3000/dash?mockAuth=theme-unset` com MSW,
  sistema em `light` e `dall-fit:theme=dark`
- Given: o perfil devolve `configs: {}`
- When: o shell autenticado reconcilia o tema
- Then: remove a chave local, aplica `light` e acompanha futuras mudanças do
  sistema

### Cenário 11 — Alternar e persistir com estado compartilhado

- Link para testar: `http://localhost:3000/dash?mockAuth=theme-dark` com MSW
- Given: o perfil confirmado e a UI estão em `dark`
- When: ativa `Ativar tema claro` no menu persistente ou móvel
- Then: aplica e grava `light` imediatamente, envia
  `PATCH /auth/me/configs` e mantém os dois toggles em pending compartilhado
- And: a response atualiza o cache sem segundo `GET /auth/me`

### Cenário 12 — Falha restaura tema confirmado

- Link para testar:
  `http://localhost:3000/dash?mockAuth=theme-save-error` com MSW
- Given: o perfil confirmado usa `dark`
- When: a tentativa otimista de ativar `light` falha
- Then: restaura `dark` no documento, provider e chave local e anuncia a falha

### Cenário 13 — Falha sem tema retorna ao sistema

- Link para testar:
  `http://localhost:3000/dash?mockAuth=theme-save-error-unset` com MSW e sistema
  em `light`
- Given: o perfil não possui tema confirmado
- When: a tentativa otimista de ativar `dark` falha
- Then: remove a chave local, restaura `light`, volta a observar o sistema e
  anuncia a falha

### Cenário 14 — Sessão ausente preserva precedência pública

- Link para testar:
  `http://localhost:3000/dash?mockAuth=unauthenticated` com MSW
- Given: o bootstrap já escolheu o tema local ou do sistema
- When: `GET /auth/me` responde `401`
- Then: redireciona a `/`, mantém a precedência pública e não renderiza o toggle
  autenticado

### Cenário 15 — Erro técnico mantém o tema do bootstrap

- Link para testar: `http://localhost:3000/dash?mockAuth=error` com MSW
- Given: o bootstrap escolheu o tema antes da request
- When: `GET /auth/me` responde erro diferente de `401`
- Then: o estado de erro usa esse tema sem inferir configuração parcial de perfil

### Cenário 16 — Falha recuperável no bootstrap CSRF

- Link para testar: `http://localhost:3000/dash?mockAuth=csrf-error` com MSW
- Given: a pessoa atual foi carregada
- When: `GET /auth/csrf` falha tecnicamente
- Then: mostra o error component, mantém a URL privada e não libera mutações

### Cenário 17 — Logout confirmado

- Link para testar: `http://localhost:3000/dash` com MSW
- Given: pessoa e CSRF estão carregados
- When: ativa `Sair`
- Then: mostra pending, confirma `204`, limpa estado privado e substitui a URL por
  `/`

### Cenário 18 — Logout falhou

- Link para testar: `http://localhost:3000/dash?mockAuth=logout-error` com MSW
- Given: a pessoa está no shell autenticado
- When: ativa `Sair` e o endpoint falha
- Then: mostra toast acessível, encerra o estado local e substitui a URL por `/`

## Estrutura técnica relevante

- Árvore e rota: `src/routes/routes.tsx` e `src/routes/route-components.tsx`
- Configuração de deep links na Vercel: `vercel.json`
- Componentes HeroUI: `Alert`, `Avatar`, `Button`, `Chip`, `Disclosure`, `Drawer`,
  `Skeleton` e `Typography`
- Componentes core: `authenticated-shell`, `application-menu`,
  `theme-toggle`, `pwa-install-action`, `pwa-update-notice` e `route-status`
- Componentes exclusivos da rota: não se aplica; `/dash` não possui conteúdo
- Hooks e serviços: `useOverlayState`, `currentPersonQueryOptions`,
  `getCurrentPerson`, `ensureCsrfToken`, `logout`, `ThemeProvider` e
  `updateCurrentPersonConfigs`
- Tipos compartilhados: `Theme`, `PersonConfigs`, `Person`,
  `CurrentPersonResponse`, `CsrfTokenResponse` e
  `UpdateCurrentPersonConfigsResponse`
- Ícones: imports individuais `Menu`, `House`, `LogOut`, `Sun` e `Moon` de
  `lucide-react`

## Cobertura automatizada

| Regra ou cenário                          | Vitest              | Playwright       |
| ----------------------------------------- | ------------------- | ---------------- |
| identidade, `Admin` e link administrativo | `application-menu`  | `/dash` e planos |
| link `Home` e estado atual                | `application-menu`  | rota e flow      |
| menu persistente e breakpoint             | estilos/typecheck   | rota `/dash`     |
| backdrop, teclado e foco móvel            | componentes HeroUI  | rota `/dash`     |
| prompt e orientação de instalação         | provider/componente | rota `/dash`     |
| atualização confirmada ou dispensada      | provider/componente | não se aplica    |
| responsividade do aviso de atualização    | componente/estilos  | não se aplica    |
| redirect em `401`                         | router/app          | rota `/dash`     |
| erro técnico sem identidade parcial       | router/app          | rota `/dash`     |
| precedência perfil/local/sistema          | theme provider      | rota `/dash`     |
| toggle, cache e pending compartilhado     | provider/menu       | rota `/dash`     |
| rollback para perfil ou sistema           | theme provider      | rota `/dash`     |
| bootstrap CSRF e falha recuperável        | auth service/router | rota `/dash`     |
| logout compartilhado, sucesso e erro      | shell/menu          | flow login       |

- Handlers e fixtures MSW: `src/mocks/handlers/auth.ts` e
  `src/mocks/fixtures/person.ts`.
- Specs Playwright: `tests/integration/routes/auth/dash.spec.ts` e
  `tests/integration/flows/login-google.spec.ts`.
- Cenários manuais e justificativa: truncamento visual com valores longos é
  conferido no browser sem referência de screenshot; o valor integral e a regra de
  iniciais possuem cobertura unitária. O layout do aviso é conferido no preview de
  duas versões do build, porque o Playwright usa MSW Browser e mantém o Service
  Worker da PWA desabilitado.
