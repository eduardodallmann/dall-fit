# Feature Spec: Menu responsivo da aplicação e rota `/dash`

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0007`
- Problema: as rotas autenticadas ainda não possuem uma estrutura de navegação
  compartilhada. A única rota privada, `/me`, concentra a identificação da pessoa
  em uma página própria, não oferece links para futuras áreas da aplicação e não
  se adapta como menu persistente ou temporário conforme o viewport.
- Resultado: toda rota autenticada é renderizada dentro de um layout compartilhado
  com a identidade da pessoa e a navegação da aplicação. Em tablet e desktop, o
  menu lateral permanece visível; em celular, um botão somente com ícone abre um
  `Drawer` pela esquerda, com backdrop clicável. A rota privada inicial passa a ser
  `/dash`, sem conteúdo próprio nesta demanda, e o primeiro item `Home` navega para
  ela.
- Referências:
  - `docs/sdd/adr/ADR-0002-autenticacao-google-e-sessao.md`;
  - `docs/sdd/flows/login-google.md`;
  - `api/docs/sdd/endpoints/auth.md`;
  - `api/docs/sdd/endpoints/current-person.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/routes/root.md`;
  - `ui/docs/sdd/routes/me.md`;
  - [HeroUI Drawer](https://heroui.com/en/docs/react/components/drawer), que
    oferece placement lateral, backdrop dispensável, fechamento por teclado,
    contenção e restauração de foco;
  - [HeroUI Typography](https://heroui.com/en/docs/react/components/typography),
    que oferece hierarquia semântica, cor secundária, peso e truncamento em uma
    linha por props próprias;
  - [Lucide React](https://lucide.dev/guide/react), biblioteca de ícones React com
    imports individuais e tree-shaking.
- Features relacionadas:
  - `FIT-0001` — introduziu o login Google, a rota `/me`, o layout autenticado e
    `GET /auth/me`;
  - `FIT-0004` — introduziu `Person.isAdmin`, o `Chip` `Admin` e o ponto de extensão
    do layout administrativo.

## Escopo

### Incluído

- dependência de runtime `lucide-react` instalada exclusivamente no projeto `ui`;
- layout visual compartilhado para todas as rotas filhas do layout autenticado;
- menu lateral com identidade da pessoa autenticada e links de navegação;
- menu persistente em viewports com largura a partir de `768px`, incluindo tablets,
  notebooks e monitores;
- botão HeroUI somente com o ícone Lucide `Menu` em viewports menores que `768px`;
- `Drawer` HeroUI móvel, aberto pela esquerda, com backdrop visível e clicável para
  fechar;
- fechamento do `Drawer` por backdrop, tecla `Escape`, controle de fechar e
  ativação de um link de navegação;
- avatar com foto e fallback de iniciais derivadas do nome da pessoa;
- nome e e-mail exibidos em duas linhas distintas, primeiro o nome e abaixo o
  e-mail com menor destaque; cada valor é limitado à sua própria linha e truncado
  visualmente com reticências quando exceder a largura disponível;
- `Chip` HeroUI textual `Admin` somente para `Person.isAdmin === true`;
- primeiro link de navegação `Home`, acompanhado pelo ícone Lucide `House` e com
  destino tipado `/dash`;
- indicação visual e semântica do link correspondente à rota atual;
- renomeação da rota privada navegável `/me` para `/dash`;
- remoção da tela de conta existente e criação de `/dash` sem conteúdo visível
  próprio nesta demanda; o layout autenticado e seu menu continuam visíveis;
- alteração do redirect de sucesso do callback Google da API para `${UI_URL}/dash`;
- alteração do destino fictício devolvido pelo MSW ao iniciar login para `/dash`;
- alteração do fallback do layout administrativo, de `/me` para `/dash`;
- atualização coordenada de testes, mocks e documentação viva afetada.

### Não incluído

- qualquer alteração visual, textual ou interativa no conteúdo da rota pública
  `/`, inclusive em seu botão `Entrar com Google` e alerta de erro;
- mudança do path ou do contrato de `GET /auth/me`; o nome do endpoint continua
  representando a pessoa vinculada à sessão e não a antiga rota de UI;
- conteúdo de dashboard, cards, métricas, treinos, boas-vindas ou heading visível
  em `/dash`;
- manter `/me` como alias ou criar redirect de compatibilidade de `/me` para
  `/dash`;
- rota de perfil ou ação para editar nome, e-mail ou foto;
- logout, troca de conta ou ação ao clicar no avatar e na identidade;
- recolher, redimensionar ou ocultar manualmente o menu persistente;
- submenus, grupos expansíveis, badges de contagem ou links além de `Home`;
- links ou seções administrativas; nesta demanda `Admin` é somente um indicador;
- alteração da proteção de sessão ou administrativa da API;
- mudança em `Person`, `CurrentPersonResponse` ou outro contrato de
  `@dall-fit/types`;
- nova request HTTP, repository, cache, integração externa, seed ou fixture de
  banco;
- tema escuro, seletor de tema ou internacionalização;
- screenshots ou regressão visual, pois não existem referências em
  `ui/docs/sdd/routes/assets/me/` e nenhuma referência foi fornecida para
  `ui/docs/sdd/routes/assets/dash/`.

## Projetos e documentação afetados

- API e endpoints:
  - `CompleteGoogleLoginCommand` passa a montar o redirect de sucesso com
    `${UI_URL}/dash`;
  - `GET /callback` mantém status, cookies, falhas e fluxo interno, mudando somente
    o `Location` de sucesso;
  - atualização de `api/docs/sdd/endpoints/auth.md` e dos testes unitários do
    command;
  - `api/docs/sdd/endpoints/current-person.md` não muda: `GET /auth/me` continua
    protegendo o layout e devolvendo a mesma `Person`.
- UI e rotas:
  - o layout autenticado passa a compor o menu responsivo e o `Outlet`, reutilizando
    a `Person` já carregada pelo `beforeLoad`;
  - componentes compartilhados de layout e menu pertencem a
    `ui/src/core/components/`, com composição em `index.tsx` e apresentação em
    `styles.ts`;
  - a árvore manual do TanStack Router substitui `/me` por `/dash` e preserva a
    query exclusiva de mocks `mockAuth` na nova rota;
  - os arquivos exclusivos e testes da tela `/me` deixam de existir; `/dash` não
    introduz conteúdo de tela próprio além do necessário para registrar a rota;
  - o layout administrativo passa a redirecionar pessoa não administradora para
    `/dash` com substituição de histórico;
  - atualização de `ui/docs/sdd/base/01-arquitetura.md`,
    `ui/docs/sdd/routes/README.md`, `ui/docs/sdd/routes/root.md` e substituição do
    documento vivo `ui/docs/sdd/routes/me.md` por
    `ui/docs/sdd/routes/dash.md`;
  - `lucide-react` entra em `ui/package.json` e no lockfile da raiz.
- Fluxos: atualização de `docs/sdd/flows/login-google.md` para terminar em `/dash`
  e descrever a identidade e navegação no menu, sem afirmar que a rota exibe uma
  tela de perfil.
- Contratos em `@dall-fit/types`: não há alteração; o menu consome `Person` e o
  opcional `isAdmin` já existentes.
- Decisões arquiteturais: não exige novo ADR; trata-se de composição local e
  reversível da UI. O ADR-0002 permanece como registro histórico, sem edição, e a
  documentação viva passa a registrar o novo destino.
- Handlers e fixtures MSW:
  - o handler de `POST /auth/google` passa a devolver `/dash` como URL fictícia;
  - os cenários de `GET /auth/me` e as fixtures de pessoa comum e administradora
    são reutilizados sem mudança de contrato;
  - nome e e-mail longos podem ser representados por override de fixture apenas
    quando necessários a um teste de componente, sem criar seletor HTTP novo.
- Mocks de repositories/caches nos unitários da API: não se aplica — nenhum
  repository ou cache participa da mudança; o unitário do command usa as
  dependências já mockadas.
- Fixtures MongoDB/Redis nos E2E: não se aplica — o destino do redirect não altera
  persistência, sessão ou dados temporários e nenhuma fixture de banco muda.

## Requisitos funcionais

1. O layout autenticado continua executando a proteção existente antes de
   renderizar conteúdo privado e entrega a mesma `Person` tanto ao menu quanto à
   rota filha, sem uma segunda chamada a `GET /auth/me`.
2. Depois que a sessão é validada, todas as rotas autenticadas comuns e futuras
   exibem a estrutura do aplicativo com menu e região de conteúdo. Rotas públicas,
   em especial `/`, não recebem menu nem botão de abertura.
3. O breakpoint funcional é a largura `768px`, correspondente ao modifier `md` do
   Tailwind vigente:
   - com largura menor que `768px`, o menu persistente fica oculto e o botão de
     abertura fica visível;
   - com largura igual ou maior que `768px`, o menu persistente fica visível e o
     botão e o `Drawer` móvel não ficam disponíveis para interação.
4. Em tablet e desktop, o menu ocupa uma região lateral persistente representada
   semanticamente por `aside`. Ele não usa overlay, backdrop, diálogo modal nem
   contenção de foco, e a região de conteúdo continua utilizável ao lado dele.
5. Em celular, o botão de abertura usa `Button` HeroUI e mostra visualmente somente
   o ícone Lucide `Menu`, sem texto visível. Seu nome acessível é `Abrir menu`.
6. Ao ativar o botão em celular, um `Drawer` HeroUI é aberto com
   `placement="left"`, sobre o conteúdo da rota e com backdrop visível.
7. O `Drawer` móvel pode ser fechado por qualquer uma destas interações:
   - clicar ou tocar no backdrop;
   - pressionar `Escape`;
   - ativar o controle acessível de fechar;
   - ativar um link de navegação.
8. Enquanto o `Drawer` está aberto, foco e rolagem seguem o comportamento modal
   acessível do HeroUI. Ao fechar sem navegar, o foco retorna ao botão `Abrir menu`.
9. Ao mudar de um viewport móvel com o `Drawer` aberto para um viewport a partir
   de `768px`, o overlay deixa de estar aberto e não reaparece aberto caso o
   viewport volte a ser móvel.
10. O conteúdo funcional do menu é compartilhado pelas variantes persistente e
    móvel, evitando listas de links ou regras de identidade divergentes.
11. O menu apresenta, nesta ordem:
    - avatar da pessoa;
    - nome;
    - e-mail com menor destaque visual que o nome;
    - `Chip` `Admin`, somente quando aplicável;
    - navegação, iniciada pelo link `Home`.
12. O `Avatar` HeroUI exibe `person.photoUrl` quando houver uma imagem utilizável.
    Quando a URL for nula ou a imagem não puder ser exibida, mostra as iniciais:
    - primeira letra da primeira palavra não vazia do nome;
    - primeira letra da última palavra não vazia, quando houver mais de uma;
    - somente a primeira letra quando o nome possuir uma única palavra;
    - letras convertidas para maiúsculas.
13. O avatar possui nome acessível derivado do nome completo da pessoa. As iniciais
    são fallback visual e não substituem essa identificação para tecnologia
    assistiva.
14. Nome e e-mail são dois elementos textuais separados e aparecem em linhas
    distintas: primeiro o nome e, imediatamente abaixo, o e-mail. Cada elemento
    ocupa no máximo sua própria linha; quando ultrapassa a largura do menu, seu
    valor visível termina em reticências, mas o texto completo permanece no DOM e
    disponível para tecnologia assistiva.
15. Nome e e-mail usam `Typography` do HeroUI e suas props semânticas antes de
    qualquer estilização própria:
    - o nome usa texto de corpo com peso de maior destaque e `truncate`;
    - o e-mail usa texto de corpo menor, `color="muted"` e `truncate`;
    - `styles.ts` controla somente composição, largura e espaçamento que não forem
      atendidos pelas props públicas do componente.
16. O `Chip` HeroUI com texto explícito `Admin` aparece somente quando
    `person.isAdmin === true`. A ausência da propriedade não renderiza chip,
    placeholder nem espaço reservado.
17. A identidade, o avatar e o chip são informativos e não recebem ação de clique
    nesta demanda.
18. A navegação usa links tipados do TanStack Router. O item inicial:
    - possui label visível `Home`;
    - possui ícone Lucide `House`, decorativo diante da label;
    - navega para `/dash` sem recarregar a página;
    - informa visualmente o estado ativo e usa `aria-current="page"` quando `/dash`
      é a rota atual.
19. O ícone `Menu` não repete um nome acessível próprio porque o botão já fornece
    `Abrir menu`; o ícone `House` também é oculto da árvore acessível porque `Home`
    nomeia o link.
20. `/dash` é filha direta do layout autenticado, aceita a query exclusiva de
    desenvolvimento `mockAuth` nos mesmos cenários vigentes e não mostra conteúdo
    de rota nesta demanda. A região principal pode ficar vazia; o menu permanece
    visível conforme o viewport.
21. `/me` deixa de fazer parte da árvore de rotas e não possui alias nem redirect de
    compatibilidade. Links, testes, mocks e destinos internos deixam de gerá-la.
22. O callback Google bem-sucedido responde `302` para `${UI_URL}/dash`; o callback
    com falha continua respondendo para `${UI_URL}/?authError=oauth_failed`.
23. O handler MSW de início de login devolve `/dash`, permitindo que a jornada
    Playwright saia da rota pública e chegue ao novo layout autenticado.
24. Uma pessoa sem acesso administrativo que tente carregar uma futura rota filha
    de `adminRoute` é redirecionada com substituição de histórico para `/dash`. Uma
    pessoa administradora continua autorizada pelo mesmo contexto, sem request
    adicional.
25. Pending, `401` e erro técnico continuam resolvidos antes da renderização do
    shell autenticado: loading e erro não mostram identidade parcial; `401`
    redireciona para `/` sem expor o menu nem dados pessoais.

## Requisitos não funcionais

- Acessibilidade:
  - usar a semântica de navegação e diálogo fornecida pelos componentes e
    landmarks adequados, preservando foco visível e operação por teclado;
  - o menu móvel possui heading ou label acessível, controle de fechar, contenção
    de foco, fechamento por `Escape` e restauração de foco;
  - o botão icon-only e os links possuem nomes acessíveis independentes dos
    ícones;
  - o estado ativo não depende somente de cor e é anunciado por `aria-current`;
  - nome, e-mail e condição administrativa não dependem de imagem ou cor para
    serem compreendidos;
  - respeitar a preferência `prefers-reduced-motion` já atendida pelas animações
    do design system, sem criar animação paralela própria.
- Performance:
  - importar `Menu` e `House` diretamente de `lucide-react`, sem catálogo dinâmico
    nem importação de todos os ícones;
  - não duplicar `GET /auth/me`, providers ou estado de servidor;
  - responsividade é apresentação do layout e não dispara requests nem remontagem
    da árvore de rotas.
- Segurança e privacidade:
  - nome, e-mail e foto aparecem somente depois da proteção autenticada;
  - dados pessoais não são copiados para armazenamento local, logs ou novas
    fixtures reais;
  - o menu não altera a fronteira de autorização da API nem usa a presença visual
    do `Chip` como controle de acesso.
- Observabilidade:
  - não há requisito novo de logging na UI;
  - a alteração do destino no command da API conserva o padrão de logs vigente e
    nunca registra sessão, cookies ou dados pessoais;
  - não introduzir telemetria, analytics ou logging de abertura e fechamento do
    menu.
- Componentização e estilo:
  - usar `Drawer`, `Button`, `Avatar`, `Typography` e `Chip` de `@heroui/react`
    antes de qualquer equivalente local;
  - usar o `Drawer` somente na experiência modal móvel; o menu persistente usa
    composição semântica não modal para não bloquear foco ou conteúdo;
  - componentes visuais compartilhados ficam em `ui/src/core/components/`, com JSX
    em `index.tsx` e classes/variantes em `styles.ts`;
  - classes Tailwind e regras responsivas ficam exclusivamente em `styles.ts`, com
    `tv` de `@heroui/styles`; não usar estilos inline nem classes literais no JSX.

## Critérios de aceite

### Cenário 1 — Menu persistente em tablet e desktop

- Forma de validar: `http://localhost:3000/dash` com MSW habilitado, em viewport
  `768x1024` e em um viewport desktop.
- Given: `GET /auth/me` devolve uma pessoa comum autenticada.
- When: `/dash` termina de carregar.
- Then: o menu lateral com avatar, nome, e-mail e link `Home` permanece visível ao
  lado da região vazia de conteúdo.
- And: o botão `Abrir menu`, o `Drawer` e o backdrop não estão disponíveis para
  interação.
- And: `Home` está ativo e possui `aria-current="page"`.

### Cenário 2 — Abrir e fechar o menu móvel pelo backdrop

- Forma de validar: `http://localhost:3000/dash` com MSW habilitado, em viewport
  `390x844`.
- Given: a pessoa autenticada visualiza apenas o botão com ícone de menu e o menu
  persistente está oculto.
- When: ativa `Abrir menu` e depois clica ou toca no backdrop.
- Then: o `Drawer` abre pela esquerda com a identidade e a navegação e depois
  fecha.
- And: o foco retorna ao botão `Abrir menu`.

### Cenário 3 — Operar e fechar o menu móvel pelo teclado

- Forma de validar: `http://localhost:3000/dash` com MSW habilitado, em viewport
  `390x844`.
- Given: o foco está no botão `Abrir menu`.
- When: abre o menu por teclado, percorre seus controles com `Tab` e pressiona
  `Escape`.
- Then: o foco permanece contido no `Drawer` enquanto aberto, o menu fecha e o foco
  retorna ao botão.

### Cenário 4 — Identidade com foto e pessoa administradora

- Forma de validar:
  `http://localhost:3000/dash?mockAuth=admin` com MSW habilitado, em qualquer
  viewport suportado.
- Given: a fixture possui `photoUrl` e `isAdmin: true`.
- When: o layout autenticado renderiza o menu.
- Then: mostra a foto, o nome, o e-mail e o `Chip` textual `Admin`.
- And: não executa outra request de pessoa para montar o menu.

### Cenário 5 — Fallback de iniciais e ausência do indicador administrativo

- Forma de validar: teste de componente com uma `Person` fictícia cujo nome é
  `Taylor Morgan Fit`, `photoUrl` é nulo e `isAdmin` está ausente; não há link local
  específico porque a variação não pertence ao seletor HTTP vigente.
- Given: a imagem da pessoa não está disponível.
- When: o conteúdo do menu é renderizado.
- Then: o avatar mostra `TF`.
- And: nome e e-mail completos permanecem disponíveis e nenhum `Chip` `Admin` nem
  espaço reservado é renderizado.

### Cenário 6 — Nome e e-mail longos

- Forma de validar: teste de componente e conferência no browser com valores
  fictícios longos; não há link local específico porque a variação é puramente de
  apresentação e não altera o contrato HTTP.
- Given: nome e e-mail excedem a largura disponível no menu.
- When: o menu é renderizado nas variantes persistente e móvel.
- Then: o nome aparece na primeira linha e o e-mail com menor destaque na linha
  imediatamente abaixo.
- And: cada valor permanece limitado à própria linha e termina visualmente em
  reticências.
- And: o valor integral permanece no DOM e acessível, sem aumentar a largura do
  menu.

### Cenário 7 — Navegar pelo item `Home` no menu móvel

- Forma de validar: spec Playwright do shell autenticado iniciado em uma rota filha
  autenticada futura; nesta entrega, a existência de somente `/dash` permite
  validar o destino e o fechamento por teste de componente integrado ao router.
- Given: o `Drawer` está aberto em viewport móvel.
- When: a pessoa ativa `Home`.
- Then: o router navega de forma tipada para `/dash`, o item fica ativo e o
  `Drawer` fecha.

### Cenário 8 — Jornada de login termina no dashboard

- Forma de validar: `http://127.0.0.1:3100/` pelo Playwright com MSW Browser.
- Given: a rota pública permanece com o conteúdo vigente e o handler de
  `POST /auth/google` devolve `/dash` como autorização fictícia.
- When: a pessoa aciona `Entrar com Google`.
- Then: navega para `/dash`, a proteção consulta `GET /auth/me` e o menu autenticado
  exibe a fixture.
- And: a área de conteúdo de `/dash` não apresenta conteúdo próprio.

### Cenário 9 — Rota privada sem sessão

- Forma de validar:
  `http://127.0.0.1:3100/dash?mockAuth=unauthenticated` pelo Playwright.
- Given: `GET /auth/me` responde `401`.
- When: o layout autenticado valida a sessão.
- Then: redireciona para `/` sem renderizar menu, botão de menu ou dados pessoais.

### Cenário 10 — Falha técnica ao proteger o dashboard

- Forma de validar:
  `http://127.0.0.1:3100/dash?mockAuth=error` pelo Playwright.
- Given: `GET /auth/me` responde `503`.
- When: a proteção executa.
- Then: o estado de erro recuperável vigente é exibido sem menu nem identidade
  parcial.

### Cenário 11 — Callback Google aponta para `/dash`

- Forma de validar: unitário de `CompleteGoogleLoginCommand` com adapter Google e
  services substituídos por mocks, mais a jornada manual do cenário de callback
  feliz documentado em `api/docs/sdd/endpoints/auth.md`.
- Given: callback, identidade, cadastro e criação de sessão são concluídos com
  sucesso.
- When: o command monta o resultado do callback.
- Then: o redirect é `${UI_URL}/dash`, preservando o cookie de sessão e a limpeza
  dos cookies temporários.
- And: cURL estático do callback feliz não se aplica, pois o código Google é de uso
  único; os cenários locais de bypass continuam validando cadastro e sessão sem
  mudar de contrato.

### Cenário 12 — Layout administrativo usa o novo fallback

- Forma de validar: teste unitário de `assertAdminAccess`; não há rota
  administrativa navegável para um link local nesta demanda.
- Given: o contexto autenticado contém uma pessoa sem `isAdmin`.
- When: a proteção administrativa é executada.
- Then: lança redirect tipado para `/dash` com substituição de histórico.

## Estratégia de entrega e compatibilidade

1. Adicionar `lucide-react` à UI e preservar um único lockfile na raiz.
2. Criar o shell e o conteúdo compartilhado do menu, reutilizando a `Person` do
   contexto autenticado.
3. Substituir a rota, componente, documentação e specs de `/me` por `/dash`, sem
   manter código morto da antiga tela de conta.
4. Atualizar atomicamente os destinos internos: callback da API, handler MSW,
   jornada de login e fallback administrativo.
5. Atualizar os SDDs vivos somente junto da implementação autorizada.
6. Revisar `api/` e `ui/` para remover componentes, helpers, imports, exports,
   arquivos e testes que existiam apenas para a antiga tela `/me`.

A remoção de `/me` é intencional e incompatível para bookmarks antigos. Não haverá
redirect temporário porque a aplicação está em fase inicial, não possui links
externos ou estado associado à rota documentados e todos os produtores internos do
destino serão migrados na mesma entrega. `GET /auth/me` não é renomeado: ele é um
endpoint de pessoa atual, não uma rota de tela.

O layout persistente e o `Drawer` são duas apresentações do mesmo conteúdo, não
dois menus independentes. O `Drawer` é apropriado somente no celular por possuir
semântica modal, backdrop, scroll lock e contenção de foco; tablet e desktop usam
`aside` para que navegação e conteúdo permaneçam simultaneamente acessíveis.

## Plano de testes

- Unitários e componentes da UI:
  - conteúdo e ordem da identidade e navegação;
  - foto disponível e fallback com primeira/última inicial, inclusive nome de uma
    única palavra;
  - presença e ausência do `Chip` `Admin`;
  - nomes acessíveis dos botões e tratamento decorativo dos ícones;
  - link `Home`, estado ativo e destino `/dash`;
  - abertura e fechamento controlado do menu móvel, inclusive ao navegar;
  - redirect administrativo para `/dash`;
  - rota pública sem shell autenticado;
  - `/dash` sem conteúdo próprio e sem segunda consulta de pessoa.
- Playwright da UI:
  - menu persistente e ausência do trigger em `768px` e desktop;
  - trigger icon-only, abertura lateral, backdrop clicável, `Escape` e restauração
    de foco em `390x844`;
  - pessoa comum e administradora;
  - jornada `/` → `/dash` com MSW Browser;
  - `401` redirecionando `/dash` para `/` e erro técnico sem dados parciais;
  - transição de viewport com `Drawer` previamente aberto, sem overlay residual.
- MSW:
  - atualizar a expectativa de `authorizationUrl` para `/dash`;
  - reutilizar os handlers de pessoa comum, administradora, não autenticada e erro;
  - não criar nova operação ou seletor de produção.
- API:
  - unitário de `CompleteGoogleLoginCommand` cobrindo o novo redirect de sucesso e
    a permanência do redirect de falha;
  - executar os E2E existentes para confirmar que cadastro, sessão, cookies e
    `GET /auth/me` não sofreram regressão; nenhuma fixture nova é necessária.
- Documentação e layout:
  - atualizar o endpoint, fluxo, bases e rotas vivos afetados na implementação;
  - não executar comparação visual, pois não existem referências para `/dash`.
- Quality gates após a implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`, pela mudança observável do callback;
  - `pnpm test:integration`, pelos cenários integrados de rota e login.

## Riscos e decisões

- Usar um `Drawer` permanentemente aberto em desktop manteria semântica de diálogo,
  contenção de foco, scroll lock e backdrop inadequados. A decisão é reservar o
  HeroUI `Drawer` ao celular e renderizar um `aside` persistente a partir de
  `768px`.
- CSS responsivo pode apenas ocultar visualmente uma estrutura ainda interativa. A
  implementação deve garantir que a variante inativa não fique focável, aberta ou
  exposta indevidamente à árvore de acessibilidade.
- Nome e e-mail são dados pessoais. O layout só pode recebê-los após a proteção e
  não pode persistir, registrar ou expor esses valores na rota pública.
- Reticências podem esconder informação visual. O texto completo permanece no DOM
  e deve continuar disponível sem depender apenas de hover, que não existe em
  dispositivos touch.
- A rota `/dash` vazia pode parecer um erro de carregamento. Nesta demanda, a
  presença do shell autenticado e do item `Home` ativo é o estado de sucesso
  intencional; não introduzir placeholder não solicitado.
- A troca de `/me` afeta API, MSW, router, proteção administrativa, testes e SDDs.
  Uma referência remanescente quebraria a jornada ou criaria comportamento
  divergente, portanto a busca e migração de todos os produtores atuais é parte do
  aceite.
- A ausência de alias para `/me` quebra bookmarks antigos de forma deliberada. Se
  compatibilidade passar a ser requisito, a feature deve ser refinada antes da
  autorização de implementação.
- Ícones não podem ser o único contrato textual de ações ou destinos. O trigger
  recebe nome acessível e a navegação mantém labels visíveis.
- A biblioteca Lucide deve ser consumida por imports estáticos individuais. Um
  carregador dinâmico do catálogo prejudicaria tree-shaking e não é necessário
  para dois ícones conhecidos.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoint de autenticação, rotas e fluxo de login afetados atualizados
- MSW atualizado sem alteração das fixtures HTTP vigentes
- Menu compartilhado sem segunda request de pessoa e sem código da tela `/me`
- Dependência `lucide-react` registrada somente na UI e lockfile único atualizado
- Migração coordenada de todos os destinos internos de `/me` para `/dash`
- Proteções autenticada e administrativa preservadas
- Tela pública `/` preservada visual e funcionalmente
- Revisão de código sem uso concluída em `api/` e `ui/`
- Quality gates da raiz, E2E da API e Playwright aprovados
