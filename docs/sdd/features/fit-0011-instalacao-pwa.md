# Feature Spec: Instalação da aplicação como PWA

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0011`
- Problema: o Dall Fit funciona somente como uma aplicação web aberta pelo
  navegador. A UI não publica um Web App Manifest, não registra um Service Worker,
  não oferece uma ação contextual de instalação e não possui um mecanismo seguro
  para informar que uma nova versão está disponível. Isso impede que navegadores
  compatíveis promovam a instalação com ícone e janela própria no dispositivo.
- Resultado: a UI torna-se uma PWA instalável em navegadores e sistemas
  compatíveis, com identidade `Dall Fit`, abertura em modo `standalone`, assets
  estáticos precacheados e instalação promovida no menu autenticado. Atualizações
  aguardam confirmação da pessoa antes de ativar a nova versão e recarregar a
  página. Requests da API, autenticação, dados pessoais e recursos remotos nunca
  entram no cache da PWA.
- Referências:
  - `docs/sdd/adr/ADR-0001-estrategia-de-mocks-e-bancos-de-teste.md`;
  - `docs/sdd/features/fit-0007-menu-da-aplicacao.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/base/05-mocks-de-api.md`;
  - `ui/docs/sdd/base/07-testes-integrados-playwright.md`;
  - `ui/docs/sdd/routes/root.md`;
  - `ui/docs/sdd/routes/dash.md`;
  - [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa);
  - [guia do Vite PWA](https://vite-pwa-org.netlify.app/guide/);
  - [requisitos mínimos do Vite PWA](https://vite-pwa-org.netlify.app/guide/pwa-minimal-requirements.html);
  - [integração React do Vite PWA](https://vite-pwa-org.netlify.app/frameworks/react.html);
  - [instalação de PWAs no MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- Features relacionadas:
  - `FIT-0001` — introduziu a entrada pública, autenticação Google, sessão e
    proteção da rota privada;
  - `FIT-0007` — introduziu o shell autenticado, o menu compartilhado e a rota
    `/dash`, onde ficará a promoção de instalação.

## Escopo

### Incluído

- adoção de `vite-plugin-pwa` `1.3.x`, compatível com o Vite 8 vigente, como
  dependência de desenvolvimento exclusiva da UI;
- adoção das dependências oficiais necessárias à integração React e à geração
  reprodutível dos assets PWA, sem dependência de runtime na API;
- Web App Manifest gerado no build e ligado automaticamente ao `index.html`;
- Service Worker gerado com Workbox na estratégia `generateSW` e registrado uma
  única vez pela integração React do plugin;
- precache conservador do app shell e dos assets estáticos versionados produzidos
  pelo build da UI;
- fallback de navegação para o `index.html` nas rotas da SPA pertencentes à origem
  da UI;
- metadados de aplicação, favicon e ícones próprios para instalação comum,
  `maskable` e Apple;
- correção dos metadados HTML genéricos para nome, idioma, descrição e cor da
  aplicação;
- estado global e único do ciclo de instalação, compartilhado pelas apresentações
  persistente e móvel do menu autenticado;
- ação `Instalar aplicativo` quando o navegador fornecer um prompt programático;
- ação alternativa `Como instalar` com instruções manuais quando não houver prompt
  programático e a aplicação ainda estiver sendo usada como página do navegador;
- ocultação das ações de instalação quando a aplicação estiver instalada ou aberta
  em modo `standalone`;
- aviso global e acessível `Nova versão disponível` com as ações
  `Atualizar agora` e `Agora não`;
- ativação da nova versão e reload somente depois de `Atualizar agora`;
- configuração de deploy necessária para HTTPS, manifesto, Service Worker, headers
  de revalidação e fallback da SPA;
- testes de unidade, componente, build e verificação manual em navegadores
  compatíveis;
- atualização coordenada da documentação viva da UI afetada.

### Não incluído

- funcionamento completo da aplicação sem internet;
- cache de responses HTTP, inclusive `GET /auth/me`, `POST /auth/google` ou futuros
  endpoints de domínio;
- cache de nome, e-mail, foto, sessão, JWT, cookies ou qualquer dado pessoal;
- persistência de responses do TanStack Query fora da memória da página;
- cache de avatares, Google OAuth ou outros recursos remotos;
- Background Sync, Periodic Background Sync, Web Push, notificações push, badge,
  geolocalização ou execução de tarefas em segundo plano;
- publicação ou empacotamento para Google Play, App Store, Microsoft Store ou outra
  loja;
- experiência nativa, wrapper Capacitor, Trusted Web Activity ou aplicativo móvel
  separado;
- customização da interface nativa de confirmação apresentada pelo navegador;
- instalação automática ou tentativa de contornar a decisão da pessoa e os
  critérios do navegador;
- telemetria de instalação, analytics, funil de conversão ou logging de eventos da
  PWA;
- nova rota para instalação, ajuda ou estado offline;
- mudança nos endpoints, cookies, CORS, autenticação, API ou contratos de
  `@dall-fit/types`;
- screenshots promocionais no manifesto ou referências visuais de layout no SDD;
- tema escuro, seletor de tema ou mudança dos tokens visuais vigentes.

## Projetos e documentação afetados

- API e endpoints: não se aplica — instalação, Service Worker, manifesto e cache
  pertencem exclusivamente à origem da UI; nenhum comportamento HTTP da API muda.
- UI e rotas:
  - `ui/package.json`, lockfile da raiz e `ui/vite.config.ts` recebem o plugin e as
    dependências de suporte;
  - `ui/index.html` recebe idioma e metadados coerentes com o Dall Fit;
  - `ui/public/` recebe os assets PWA gerados de forma reprodutível a partir do
    favicon vigente ou de outra fonte visual aprovada antes da implementação;
  - a infraestrutura transversal da PWA fica em `ui/src/core/`, sem depender de
    módulos de rota;
  - `AppProviders` aplica o estado global somente porque instalação e atualização
    atravessam o bootstrap, as duas apresentações do menu e todas as rotas;
  - `application-menu` recebe a seção `Aplicativo` depois da navegação principal,
    com a promoção de instalação compartilhada entre `aside` e `Drawer`;
  - um aviso global de atualização é renderizado sobre qualquer rota sem alterar a
    árvore manual do TanStack Router;
  - `ui/docs/sdd/base/01-arquitetura.md` passa a documentar manifesto, Service
    Worker, cache, instalação e atualização;
  - `ui/docs/sdd/base/05-mocks-de-api.md` passa a documentar a convivência entre o
    worker da PWA e o worker do MSW;
  - `ui/docs/sdd/routes/dash.md` passa a documentar as ações observáveis no menu;
  - `ui/docs/sdd/routes/root.md` passa a registrar somente o aviso global de nova
    versão quando esse estado existir; entrada, login e erro de autenticação
    permanecem inalterados;
- Fluxos: não exige fluxo novo nem alteração do login Google; instalação é uma
  interação exclusiva da UI e o `start_url` reutiliza a proteção vigente de
  `/dash`.
- Contratos em `@dall-fit/types`: não se aplica — eventos de instalação, estados do
  Service Worker e manifesto são contratos locais do browser e da UI.
- Decisões arquiteturais: não exige ADR transversal; `vite-plugin-pwa` e Workbox
  são infraestrutura exclusiva e reversível da UI. A decisão vigente do MSW é
  preservada pela separação explícita entre desenvolvimento/testes e produção.
- Handlers e fixtures MSW: não há nova request nem mudança de contrato. Os handlers
  e fixtures vigentes são reutilizados sem alteração; o worker MSW continua sendo
  o único Service Worker registrado no servidor Vite de desenvolvimento e no
  Playwright vigente.
- Mocks de repositories/caches nos unitários da API: não se aplica — a API não
  participa da demanda.
- Fixtures MongoDB/Redis nos E2E: não se aplica — não há persistência ou endpoint
  afetado.

## Requisitos funcionais

1. O build de produção da UI gera um Web App Manifest e um Service Worker válidos,
   referencia ambos na aplicação e mantém o build executável como SPA.
2. O manifesto identifica a aplicação com estes valores e comportamentos:
   - `id` estável `/`;
   - `name` e `short_name` iguais a `Dall Fit`;
   - descrição `Acesse o Dall Fit pelo seu dispositivo.`;
   - `start_url` igual a `/dash`;
   - `scope` igual a `/`;
   - `display` igual a `standalone`;
   - `prefer_related_applications` igual a `false`;
   - `theme_color` e `background_color` estáticos, iguais entre si e visualmente
     coerentes com o fundo claro padrão da aplicação.
3. Abrir a aplicação instalada inicia em `/dash`. Uma sessão válida segue para o
   shell autenticado; uma sessão ausente ou expirada reutiliza o redirect vigente
   para `/`, sem criar um fluxo de autenticação paralelo.
4. O manifesto fornece pelo menos:
   - PNG `192x192` de propósito `any`;
   - PNG `512x512` de propósito `any`;
   - PNG `512x512` de propósito `maskable`, com zona segura e fundo apropriados;
   - `apple-touch-icon` PNG `180x180`;
   - favicon vetorial vigente.
5. Os assets são gerados de uma única fonte visual versionada e por um comando
   reproduzível. Não editar binários gerados manualmente nem criar variações
   divergentes do mesmo símbolo.
6. O `index.html` usa `lang="pt-BR"`, título `Dall Fit`, descrição igual à do
   manifesto, `theme-color` igual ao manifesto, favicon e `apple-touch-icon`.
7. O Service Worker usa precache somente para `index.html`, chunks JavaScript e
   CSS versionados, fontes locais e assets estáticos necessários ao app shell.
8. Requests para a API configurada em `VITE_API_URL` usam sempre a rede e não são
   respondidas, repetidas, enfileiradas nem persistidas pelo Service Worker.
9. Rotas ou padrões de autenticação, API, recursos remotos e
   `mockServiceWorker.js` são excluídos do precache e de qualquer runtime cache.
10. Navegações same-origin para rotas da SPA podem receber o `index.html` já
    precacheado. Esse fallback não transforma respostas da API nem recursos que não
    sejam documentos de navegação em HTML.
11. A disponibilidade do app shell sem rede não representa sessão válida nem modo
    offline funcional. Ao depender da API, a aplicação conserva os estados de erro
    vigentes e nunca apresenta dados pessoais provenientes do cache da PWA.
12. O estado de instalação é capturado uma única vez em infraestrutura global,
    mesmo que os menus persistente e móvel estejam montados simultaneamente.
13. Quando o browser dispara `beforeinstallprompt`, a seção `Aplicativo` do menu
    autenticado mostra um botão HeroUI com o texto `Instalar aplicativo`.
14. Ativar `Instalar aplicativo` chama o prompt nativo somente a partir da ação da
    pessoa. A aplicação aguarda o resultado nativo e não simula sucesso antes da
    resposta do navegador.
15. Se a pessoa aceitar a instalação ou o browser disparar `appinstalled`, as
    ações de instalação desaparecem sem afetar navegação, sessão ou conteúdo.
16. Se a pessoa dispensar o prompt, o evento consumido não é reutilizado. A ação
    programática desaparece até que o navegador ofereça novo evento; a aplicação
    pode então apresentar `Como instalar` no lugar dela.
17. Quando não houver prompt programático e a aplicação estiver em modo de
    navegador, a seção mostra `Como instalar`. Sua ativação expande uma região
    textual acessível com estas orientações:
    - em iPhone ou iPad, usar `Compartilhar` e `Adicionar à Tela de Início`;
    - nos demais navegadores compatíveis, usar `Instalar aplicativo` ou
      `Adicionar à tela inicial` no menu do navegador;
    - se a opção não existir, o navegador ou o dispositivo pode não oferecer essa
      forma de instalação.
18. `Como instalar` informa o estado expandido de forma semântica, pode ser operado
    por teclado e não abre um segundo diálogo modal dentro do `Drawer` móvel.
19. Quando a aplicação estiver aberta com `display-mode: standalone`, ou pelo modo
    equivalente disponível no iOS, a seção não mostra `Instalar aplicativo` nem
    `Como instalar`.
20. A UI não exibe uma promoção automática ao carregar, não chama o prompt sem gesto
    da pessoa e não persiste recusas em cookie, local storage ou API.
21. O Service Worker é registrado pela integração React
    `virtual:pwa-register/react` em modo de atualização por confirmação. Não há
    registro automático paralelo injetado pelo plugin.
22. Na primeira instalação do Service Worker, nenhuma mensagem afirma que toda a
    aplicação funciona offline.
23. Quando uma nova versão termina de instalar e aguarda ativação, aparece um aviso
    global com o texto `Nova versão disponível`, a explicação
    `Atualize para usar a versão mais recente.` e as ações `Atualizar agora` e
    `Agora não`.
24. `Atualizar agora` solicita a ativação do novo Service Worker e recarrega a
    página somente depois que a atualização estiver pronta para assumir o controle.
25. `Agora não` fecha o aviso apenas no documento atual, mantém a versão corrente
    utilizável e não força reload. A nova versão pode assumir quando todas as abas
    antigas forem encerradas ou em uma nova oportunidade oferecida pelo browser.
26. Falha ao registrar ou atualizar o Service Worker não bloqueia bootstrap,
    autenticação ou navegação. A aplicação continua funcionando como web app comum
    e não expõe detalhes técnicos à pessoa.
27. Em desenvolvimento e no Playwright vigente, o Service Worker da PWA permanece
    desabilitado. O MSW continua sendo o único worker registrado nesse contexto.
28. Em produção e em preview do build, o bootstrap não importa nem registra MSW; o
    Service Worker da PWA é o único worker da aplicação.
29. A origem de produção usa HTTPS. `localhost` e `127.0.0.1` são aceitos somente
    para desenvolvimento, preview e validação local.
30. O servidor preserva arquivos reais do manifesto e Service Worker antes de
    aplicar o fallback da SPA, serve o manifesto com MIME compatível e exige
    revalidação do arquivo do Service Worker em vez de marcá-lo como imutável.

## Requisitos não funcionais

- Acessibilidade:
  - todas as ações usam `Button` HeroUI com texto visível e foco perceptível;
  - a região de instruções possui relação programática com `Como instalar` e não
    depende somente de animação, cor ou ícone;
  - o aviso de nova versão é anunciado como informação de status sem mover o foco
    automaticamente nem bloquear o restante da aplicação;
  - atualizar e dispensar são operáveis por teclado e possuem labels explícitas;
  - nenhum prompt é disparado automaticamente durante carregamento ou navegação.
- Performance:
  - o Service Worker e os assets PWA são produzidos somente no build e não entram
    no bundle inicial como lógica desnecessária;
  - usar `generateSW` enquanto as necessidades de cache permanecerem simples;
  - limitar o precache aos arquivos necessários, excluir o worker do MSW e evitar
    assets grandes ou duplicados;
  - limpar caches antigos gerenciados pelo Workbox depois da ativação da versão
    nova;
  - preservar nomes com hash e cache imutável para chunks, mas não para `sw.js` e
    o manifesto.
- Segurança e privacidade:
  - nenhuma regra `CacheFirst`, `NetworkFirst` ou `StaleWhileRevalidate` alcança a
    API, OAuth, avatares ou outro conteúdo pessoal/remoto;
  - não serializar `Person`, responses Axios, cookies, tokens ou URLs temporárias
    em Cache Storage, IndexedDB ou armazenamento local;
  - o Service Worker atua somente no escopo da origem da UI e não amplia CORS nem
    permissões da API;
  - a proteção da UI continua consultando a API e não trata app instalado como
    autenticação;
  - falhas internas não exibem stack, configuração ou URL sensível.
- Observabilidade:
  - não adicionar `console.*`, telemetria ou logs de instalação, recusa, update ou
    erro de Service Worker;
  - erros permanecem técnicos no contexto do browser e não se tornam requisito de
    integração com a API nesta demanda.
- Componentização e estilo:
  - estado e APIs do browser ficam em infraestrutura `core`, separados da
    composição visual;
  - o menu consome um componente de ação coeso sem duplicar listeners ou regras;
  - componentes visuais reutilizáveis ficam em `ui/src/core/components/`, com JSX
    em `index.tsx` e apresentação própria em `styles.ts`;
  - classes Tailwind e variantes ficam exclusivamente em `styles.ts`, usando `tv`
    de `@heroui/styles`; não usar estilos inline nem classes literais no JSX.

## Critérios de aceite

### Cenário 1 — Build produz uma PWA válida

- Forma de validar: executar `pnpm -C ui build`, iniciar
  `pnpm -C ui preview --host 127.0.0.1` e abrir a URL local informada pelo Vite em
  Chromium.
- Given: o build é executado com a configuração de produção.
- When: a aplicação é carregada pelo preview em loopback.
- Then: manifesto e Service Worker são servidos e registrados sem erro.
- And: o manifesto contém identidade, `start_url`, `scope`, `display`, cores e
  ícones definidos nesta feature.
- And: recarregar diretamente `/dash` continua entregando a SPA.

### Cenário 2 — Instalar pelo menu autenticado

- Forma de validar: preview do build em Chromium, com sessão válida na origem de
  teste ou simulação manual controlada do evento de instalação; o prompt nativo
  real não é automatizado no CI.
- Given: a aplicação não está instalada, está em modo de navegador e o browser
  forneceu `beforeinstallprompt`.
- When: a pessoa autenticada abre o menu e ativa `Instalar aplicativo`.
- Then: o browser apresenta sua confirmação nativa.
- And: ao aceitar, a aplicação é instalada com nome e ícones `Dall Fit` e a ação
  desaparece.

### Cenário 3 — Orientar instalação sem prompt programático

- Forma de validar: `http://localhost:3000/dash` com MSW habilitado e teste de
  componente que represente ausência de `beforeinstallprompt`.
- Given: a aplicação está em modo de navegador e não existe prompt programático
  disponível.
- When: a pessoa ativa `Como instalar` no menu autenticado.
- Then: a região acessível apresenta instruções para iPhone/iPad, demais browsers e
  a limitação de compatibilidade.
- And: uma segunda ativação recolhe a região sem navegar nem abrir diálogo modal.

### Cenário 4 — Não promover uma aplicação já instalada

- Forma de validar: teste unitário dos modos de exibição e conferência manual ao
  abrir a PWA instalada; não há link HTTP capaz de impor `standalone`.
- Given: a aplicação foi aberta em modo `standalone` ou o browser informou
  `appinstalled`.
- When: o shell autenticado renderiza.
- Then: não existe `Instalar aplicativo` nem `Como instalar` no menu persistente ou
  móvel.

### Cenário 5 — Atualizar somente mediante confirmação

- Forma de validar: publicar duas versões locais consecutivas do build no mesmo
  preview controlado e cobrir o componente por Vitest com o hook do plugin
  substituído; não há URL isolada que fabrique um Service Worker aguardando.
- Given: uma versão anterior controla a página e uma nova versão foi instalada em
  espera.
- When: o estado `needRefresh` é informado à UI.
- Then: aparece `Nova versão disponível` com `Atualizar agora` e `Agora não`.
- And: nada recarrega até a pessoa ativar `Atualizar agora`.
- And: ao confirmar, a nova versão assume e a página recarrega uma única vez.

### Cenário 6 — Adiar atualização

- Forma de validar: teste de componente do aviso de atualização; não se aplica um
  link próprio porque o estado pertence ao ciclo do Service Worker.
- Given: o aviso de nova versão está visível.
- When: a pessoa ativa `Agora não`.
- Then: o aviso fecha no documento atual sem chamar a ativação nem recarregar a
  página.

### Cenário 7 — Não servir dados autenticados pelo cache

- Forma de validar: preview do build em Chromium, DevTools na seção Application e
  teste da configuração de cache; requests da API podem usar uma origem fictícia
  controlada, sem dados reais.
- Given: o app shell foi instalado e `/dash` já foi acessado online.
- When: a rede é desativada e `/dash` é recarregada.
- Then: os assets estáticos necessários podem vir do precache.
- And: `GET /auth/me` não é encontrado em Cache Storage nem recebe response do
  Service Worker.
- And: identidade, e-mail, foto, sessão e conteúdo da API não são reconstruídos do
  cache da PWA.

### Cenário 8 — MSW e PWA não competem pelo mesmo escopo

- Forma de validar: `http://127.0.0.1:3100/` durante
  `pnpm test:integration` e preview separado do build de produção.
- Given: o Playwright inicia Vite em modo de desenvolvimento com MSW habilitado.
- When: a jornada de login e os cenários de rota executam.
- Then: somente `mockServiceWorker.js` controla o contexto e os handlers vigentes
  continuam respondendo.
- And: no preview de produção, MSW não é registrado e somente o worker da PWA pode
  controlar a aplicação.

### Cenário 9 — Falha de registro preserva o web app

- Forma de validar: teste unitário do registro com erro simulado; não há link local
  específico porque o estado depende da API de Service Worker do browser.
- Given: o browser rejeita o registro do Service Worker.
- When: a UI executa o bootstrap.
- Then: a aplicação continua renderizando e navegando como web app comum.
- And: não mostra erro técnico, não entra em loop de reload e não afeta a sessão.

## Estratégia de entrega e compatibilidade

1. Adicionar as dependências PWA somente ao projeto `ui` e preservar o lockfile
   único da raiz.
2. Gerar e versionar os assets mínimos a partir de uma fonte visual única; manter
   o comando de geração para futuras atualizações de identidade.
3. Configurar manifesto, `generateSW`, precache, exclusões e registro manual no
   Vite, sem habilitar o worker da PWA no servidor de desenvolvimento.
4. Introduzir o estado global de instalação e atualização antes de conectar suas
   apresentações ao menu e ao aviso global.
5. Integrar a promoção no conteúdo compartilhado do menu, de modo que desktop e
   móvel consumam o mesmo evento descartável sem listeners duplicados.
6. Ajustar metadados e configuração do host, preservando o fallback da SPA e a
   revalidação do Service Worker.
7. Atualizar os SDDs vivos somente junto da implementação autorizada.
8. Revisar `api/` e `ui/` para remover imports, helpers, componentes, exports ou
   arquivos que fiquem sem uso.

A instalação é melhoria progressiva. Chrome, Edge e outros navegadores Chromium
podem oferecer `beforeinstallprompt`; outros navegadores usam seus próprios menus
ou não suportam instalação. No iOS/iPadOS não existe prompt programático equivalente
e a pessoa usa `Compartilhar` → `Adicionar à Tela de Início`. A ausência de suporte
não bloqueia o Dall Fit no navegador.

O Service Worker da PWA fica desabilitado em `vite dev` para não disputar escopo
com o MSW usado no desenvolvimento e no Playwright. A PWA é validada sobre o build
servido por preview ou no host HTTPS. Uma futura necessidade de testar o Service
Worker em CI pode criar um servidor e uma suíte próprios; ela não deve habilitar o
worker da PWA no Playwright atual enquanto esse contexto depender do MSW Browser.

O modo `generateSW` é suficiente para precache e fallback simples. Web Push,
Background Sync, regras dinâmicas complexas ou lógica customizada de Service Worker
exigiriam uma evolução própria e reavaliação de `injectManifest`.

## Plano de testes

- Unitários e componentes da UI:
  - captura, consumo único e descarte de `beforeinstallprompt`;
  - resultado aceito e dispensado pelo prompt;
  - reação a `appinstalled`, `display-mode: standalone` e equivalente do iOS;
  - alternância entre `Instalar aplicativo`, `Como instalar` e ausência de ação;
  - expansão acessível das instruções sem diálogo modal;
  - compartilhamento do mesmo estado entre os dois menus montados;
  - aviso `needRefresh`, confirmação, adiamento e erro de registro;
  - garantia de que falha PWA não bloqueia os providers nem o router.
- Build e configuração:
  - `pnpm -C ui build` deve gerar manifesto, Service Worker e assets sem warnings
    de Workbox;
  - conferir os campos e ícones do manifesto gerado;
  - conferir que `mockServiceWorker.js`, endpoints e origens remotas não aparecem
    no precache;
  - conferir headers e fallback no preview e no deploy HTTPS.
- Playwright vigente:
  - manter os cenários de `/` e `/dash` com MSW Browser sem Service Worker da PWA;
  - cobrir a instrução manual observável no menu quando possível sem fabricar
    contrato de produção;
  - não automatizar a UI nativa do prompt de instalação.
- Verificação manual em browser:
  - instalar e abrir em modo `standalone` no Chromium desktop ou Android;
  - conferir ícone comum, ícone maskable, nome e abertura em `/dash`;
  - conferir as instruções manuais em iOS/iPadOS quando houver dispositivo
    disponível;
  - publicar duas versões locais para validar o ciclo de update;
  - usar DevTools para confirmar que Cache Storage contém somente assets estáticos.
- MSW:
  - nenhum handler ou fixture novo;
  - confirmar que o worker vigente continua sendo o único controlador em dev e no
    Playwright.
- API:
  - nenhum teste novo e nenhum E2E adicional específico; executar os gates gerais
    para detectar regressões do monorepo.
- Documentação e layout:
  - atualizar arquitetura, mocks e as rotas `/` e `/dash` durante a implementação;
  - não executar comparação visual, pois não existem referências em
    `ui/docs/sdd/routes/assets/dash/`.
- Quality gates após a implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`;
  - `pnpm -C api test:e2e` não é exigido especificamente, pois endpoint, wiring,
    MongoDB e Redis não mudam.

## Riscos e decisões

- `beforeinstallprompt` não é padrão universal. A aplicação usa-o somente quando o
  próprio browser o entrega e mantém instruções manuais como fallback, sem concluir
  que ausência do evento significa erro.
- Um evento de instalação só pode ser consumido uma vez. Dois menus montados não
  podem manter cópias ou chamar o mesmo prompt em paralelo; um estado global é a
  fonte única.
- `autoUpdate` poderia recarregar uma tela durante uma interação futura. A decisão
  é atualização por confirmação, com adiamento explícito e sem loop de reload.
- Cachear a API poderia exibir identidade desatualizada ou privada, mascarar sessão
  expirada e ampliar retenção de dados pessoais. A decisão é nunca aplicar runtime
  cache às integrações HTTP.
- App shell disponível offline não equivale a aplicação funcional offline. A
  entrega não promete login, sessão, dashboard ou dados sem rede e não mostra a
  mensagem enganosa de que toda a aplicação está pronta offline.
- O MSW e a PWA usam Service Workers. Registrar ambos no mesmo escopo tornaria os
  testes instáveis e poderia desviar requests; a separação por modo de execução é
  obrigatória.
- Um Service Worker cacheado incorretamente pode manter uma versão antiga. `sw.js`
  deve ser revalidado, chunks continuam versionados por hash e caches obsoletos são
  limpos na ativação.
- `start_url=/dash` pressupõe a proteção vigente. Esse destino oferece a melhor
  retomada para uma pessoa autenticada e continua seguro porque sessão ausente
  redireciona para `/` antes de renderizar identidade.
- Ícones sem zona segura podem ser recortados por launchers Android. A variante
  `maskable` deve ser gerada e conferida separadamente da variante `any`.
- Instruções de menu variam por navegador e idioma. O texto descreve nomes comuns,
  admite incompatibilidade e não promete que a opção estará presente.
- Configurações de rewrite podem transformar `sw.js` ou o manifesto em HTML. O host
  deve servir primeiro os arquivos reais e aplicar fallback somente a navegações da
  SPA.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Manifesto, Service Worker, registro e assets PWA gerados pelo build da UI
- Aplicação instalável com identidade `Dall Fit` em browsers compatíveis
- Instalação promovida sem prompt automático e com fallback de instruções manuais
- Atualização aplicada somente depois de confirmação explícita
- App shell precacheado sem responses da API, autenticação ou dados pessoais
- MSW exclusivo em desenvolvimento/Playwright e PWA exclusiva em produção/preview
- Metadados HTML, headers e fallback da SPA coerentes com a PWA
- Contratos, endpoints e fluxo de login preservados
- Documentação viva da UI afetada atualizada na implementação
- Nenhum handler, fixture HTTP ou contrato compartilhado criado sem necessidade
- Revisão de código sem uso concluída em `api/` e `ui/`
- Quality gates da raiz e Playwright aprovados
