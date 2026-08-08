# Feature Spec: Tema claro e escuro persistido por pessoa

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0019`
- Problema: a UI já possui tokens HeroUI para os modos claro e escuro, mas inicia
  sempre com o tema claro e não oferece uma ação para alterná-lo. A preferência não
  é preservada no navegador nem vinculada à pessoa no MongoDB, portanto não pode
  acompanhar a mesma conta entre dispositivos.
- Resultado: toda abertura da aplicação recebe imediatamente o tema salvo no
  navegador ou, na ausência de um valor local válido, o tema indicado por
  `prefers-color-scheme`. Depois que a pessoa autenticada é carregada, um
  `Person.configs.theme` existente passa a ser a fonte de verdade, é aplicado e
  sincronizado no armazenamento local. Quando o perfil não possui essa
  configuração, a preferência do sistema operacional prevalece e nenhum default é
  inventado pela API. Um botão somente com ícone no menu alterna entre `light` e
  `dark`, aplica a mudança imediatamente e a persiste localmente e no cadastro da
  pessoa.
- Referências:
  - `docs/sdd/base/03-contratos-compartilhados.md`;
  - `docs/sdd/features/fit-0001-login-google.md`;
  - `docs/sdd/features/fit-0007-menu-da-aplicacao.md`;
  - `docs/sdd/features/fit-0011-instalacao-pwa.md`;
  - `docs/sdd/flows/login-google.md`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/endpoints/current-person.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/routes/root.md`;
  - `ui/docs/sdd/routes/dash.md`.
- Features relacionadas:
  - `FIT-0001` introduziu `Person`, a sessão e `GET /auth/me`;
  - `FIT-0007` introduziu o menu compartilhado das rotas autenticadas e excluiu
    explicitamente o seletor de tema de seu escopo;
  - `FIT-0011` introduziu a PWA e manteve estáticos os metadados de cor do manifesto.

## Escopo

### Incluído

- tipo compartilhado `Theme` limitado a `light | dark`;
- chave compartilhada e obrigatória `Person.configs`, inicialmente com
  `theme?: Theme`;
- campo MongoDB `configs.theme` opcional, sem default e sem migração em massa;
- `GET /auth/me` incluindo `configs.theme` somente quando o valor existir no
  documento e devolvendo `configs: {}` quando a pessoa não possuir configuração;
- endpoint autenticado e específico `PATCH /auth/me/configs`, sem CRUD geral de
  pessoas, para persistir a preferência da própria sessão;
- request `{ theme: "light" | "dark" }` e response com a `Person` pública
  atualizada;
- estado global de tema da UI, disponível nas rotas públicas e autenticadas;
- leitura síncrona da chave local `dall-fit:theme` antes da primeira pintura útil;
- leitura de `prefers-color-scheme` quando não existir uma preferência local
  válida;
- aplicação do tema por `data-theme="light"` ou `data-theme="dark"` no elemento
  raiz do documento;
- precedência local sobre o sistema durante o bootstrap público;
- após `GET /auth/me`, precedência do tema persistido no perfil ou, quando ele não
  existir, precedência do sistema operacional inclusive sobre um valor local;
- sincronização do tema explícito devolvido pelo perfil para `localStorage` e
  remoção da chave local quando o perfil não possuir tema;
- acompanhamento de mudanças do sistema operacional enquanto a fonte efetiva for
  `prefers-color-scheme`;
- botão HeroUI somente com ícone em todas as apresentações do menu autenticado,
  compartilhando um único estado e uma única mutation;
- aplicação otimista da troca, persistência local imediata, gravação na API,
  atualização do cache de pessoa e rollback em caso de falha;
- feedback acessível de ação, progresso e erro;
- atualização coordenada de contratos, endpoint, rota, fluxo, mocks e testes na
  fase de implementação.

### Não incluído

- persistência dos valores `system` ou `auto`, tema de alto contraste ou qualquer
  valor armazenável além de `light` e `dark`;
- tela de configurações ou de perfil;
- edição de nome, e-mail, foto, condição administrativa ou outras configurações;
- CRUD de pessoas ou endpoint que permita alterar a configuração de outra pessoa;
- migração ou backfill em massa dos documentos antigos do MongoDB;
- Redis, sessão com estado, cookie de tema ou persistência em Cache Storage ou
  IndexedDB;
- sincronização em tempo real entre abas ou dispositivos; mudanças do sistema
  operacional são observadas apenas na própria aba enquanto ele for a fonte ativa;
- alteração dinâmica das cores estáticas do Web App Manifest, splash screen ou
  interface externa do navegador/PWA;
- redesenho dos tokens claro e escuro existentes no `index.css`;
- screenshots ou regressão visual, pois não existem referências em
  `ui/docs/sdd/routes/assets/root/` nem em
  `ui/docs/sdd/routes/assets/dash/`.

## Projetos e documentação afetados

- API e endpoints:
  - o schema de `Person` recebe `configs.theme` opcional com enum
    `light | dark` e sem default;
  - entidade, repository e mapeamento de `Person` preservam a ausência de
    `configs.theme` e materializam somente o objeto público `configs: {}`;
  - `GET /auth/me` inclui `configs` na representação pública e inclui
    `configs.theme` somente quando persistido;
  - `PATCH /auth/me/configs` valida a preferência, atualiza somente a pessoa
    autenticada e devolve sua representação pública atualizada;
  - o fluxo segue controller → command → service de configuração → repository;
  - `api/docs/sdd/endpoints/current-person.md` passa a documentar a leitura e a
    atualização das configurações da pessoa atual, ou referencia um documento
    proprietário separado caso o endpoint seja dividido na implementação;
  - `api/docs/sdd/base/01-arquitetura.md` registra a configuração persistida em
    `Person` somente se isso acrescentar uma regra transversal vigente.
- UI e rotas:
  - a inicialização global aplica a preferência local ou, na ausência dela, a
    preferência do sistema antes da renderização;
  - um provider de tema envolve todas as rotas dentro do `QueryClientProvider`;
  - o layout autenticado reconcilia o provider com `Person.configs.theme` quando
    ele existir e com `prefers-color-scheme` quando estiver ausente;
  - `application-menu` recebe o botão de alternância sem duplicar estado entre o
    `aside` e o `Drawer`;
  - `ui/docs/sdd/base/01-arquitetura.md` e
    `ui/docs/sdd/base/03-componentes-e-estilizacao.md` passam a documentar
    bootstrap, provider, precedência e aplicação dos tokens;
  - `ui/docs/sdd/routes/root.md` passa a documentar a precedência local/sistema;
  - `ui/docs/sdd/routes/dash.md` passa a documentar reconciliação com o perfil,
    botão, mutation, sucesso e erro.
- Fluxos: `docs/sdd/flows/login-google.md` passa a registrar que, após
  `GET /auth/me`, o tema explícito do perfil substitui o tema inicial; sem tema no
  perfil, o sistema operacional substitui e remove uma preferência local anterior.
- Contratos em `@dall-fit/types`:
  - `Theme = 'light' | 'dark'`;
  - `PersonConfigs { theme?: Theme }`;
  - `Person.configs: PersonConfigs`;
  - `UpdateCurrentPersonConfigsRequest { theme: Theme }`;
  - `UpdateCurrentPersonConfigsResponse`, com a `Person` pública atualizada.
- Decisões arquiteturais: não exige ADR; a preferência usa a persistência de
  `Person`, o client HTTP e os tokens já vigentes, sem introduzir tecnologia ou
  decisão transversal difícil de reverter.
- Handlers e fixtures MSW:
  - todas as fixtures de `Person` passam a possuir `configs`, com ou sem
    `theme` conforme o cenário;
  - `GET /auth/me` oferece variações fictícias com tema claro, tema escuro e sem
    configuração para validar as três reconciliações;
  - novo handler stateful de `PATCH /auth/me/configs` cobre sucesso, validação,
    latência e falha técnica;
  - o estado mutável do handler é reiniciado entre testes Vitest e isolado entre
    cenários Playwright.
- Mocks de repositories/caches nos unitários da API: mock de `PersonRepository`
  recebe a operação de atualização da configuração; Redis não participa.
- Fixtures MongoDB/Redis nos E2E: fixtures de pessoa com tema e sem tema, incluindo
  registro legado sem `configs` no MongoDB; Redis não se aplica.

## Requisitos funcionais

1. Os únicos temas reconhecidos em qualquer camada são `light` e `dark`.
2. A chave local é `dall-fit:theme` e armazena somente a string `light` ou `dark`,
   sem objeto, pessoa, timestamp, `system` ou outro dado. Sua presença representa
   uma preferência explícita, nunca uma cópia do tema inferido do sistema.
3. Antes da primeira pintura útil, a UI lê `dall-fit:theme` de forma síncrona:
   - `light` aplica `data-theme="light"`;
   - `dark` aplica `data-theme="dark"`;
   - chave ausente, valor diferente ou falha de acesso consulta
     `window.matchMedia('(prefers-color-scheme: dark)')`;
   - preferência escura do sistema aplica `dark`; qualquer outro resultado
     aplica `light`.
4. O bootstrap não espera a API para escolher o primeiro tema. A precedência antes
   de um perfil autenticado é `localStorage > prefers-color-scheme`.
5. A aplicação do tema usa `data-theme` no `document.documentElement` e reutiliza
   exclusivamente os tokens já definidos para esses seletores em `index.css`.
6. A rota pública e os estados de loading/erro anteriores ao perfil usam o tema
   definido pelo bootstrap local/sistema.
7. Enquanto a fonte efetiva for o sistema, a UI observa mudanças do media query e
   alterna entre `light` e `dark` sem gravar `dall-fit:theme`.
8. Toda `Person` pública possui `configs: PersonConfigs`, mas
   `PersonConfigs.theme` é opcional. A ausência representa falta de escolha
   persistida, não o tema escuro.
9. Novas pessoas não recebem tema padrão. O MongoDB pode manter `configs.theme`
   ausente e a API não materializa um valor durante criação, leitura ou login.
10. Ao ler um documento histórico sem `configs` ou sem `configs.theme`, o
    repository preserva a ausência e `GET /auth/me` devolve `configs: {}`, sem
    gravar, migrar ou inferir `dark`.
11. Depois que a proteção autenticada recebe `Person`, a precedência passa a ser:
    - `Person.configs.theme`, quando existir;
    - `prefers-color-scheme`, quando `Person.configs.theme` estiver ausente.
12. Quando o perfil possui tema, a reconciliação atualiza como uma única transição:
    - `data-theme` no elemento raiz;
    - estado global e fonte efetiva do provider;
    - chave `dall-fit:theme` com o valor do perfil;
    - valor confirmado usado para eventual rollback.
13. Quando o perfil não possui tema, a reconciliação ignora qualquer preferência
    local usada no bootstrap, remove `dall-fit:theme`, aplica o valor atual de
    `prefers-color-scheme`, marca o sistema como fonte efetiva e passa a observar
    mudanças do media query.
14. A reconciliação ocorre antes da pintura do shell autenticado sempre que a API e
    o ciclo do React permitirem, evitando exibir o menu com tokens divergentes.
15. O menu autenticado mostra um `Button` HeroUI icon-only para alternar o tema nas
    apresentações persistente e móvel.
16. No tema escuro, o botão usa um ícone Lucide decorativo que representa a ação de
    ativar o tema claro e possui nome acessível `Ativar tema claro`.
17. No tema claro, o botão representa a ação inversa e possui nome acessível
    `Ativar tema escuro`.
18. Acionar o botão calcula sempre o valor oposto e, antes da request:
    - aplica o novo `data-theme`;
    - atualiza o provider e deixa de seguir temporariamente mudanças do sistema;
    - grava `dall-fit:theme`;
    - inicia `PATCH /auth/me/configs` com o novo valor.
19. Enquanto a gravação estiver pendente, os dois botões montados compartilham o
    mesmo estado desabilitado/loading e não iniciam uma segunda mutation.
20. `PATCH /auth/me/configs`:
    - exige sessão válida e não recebe ID de pessoa no path ou body;
    - aceita exatamente `{ "theme": "light" | "dark" }`;
    - rejeita valor inválido, body vazio e propriedades adicionais com
      `400 VALIDATION_ERROR`;
    - atualiza atomicamente somente `configs.theme` e `updatedAt` da pessoa da
      sessão;
    - responde `200` com a `Person` pública atualizada;
    - é idempotente quando recebe o valor já persistido.
21. Em sucesso, a UI mantém o tema escolhido, substitui o dado de pessoa nas queries
    ativas pelo payload devolvido e registra esse valor como a nova preferência
    confirmada, sem executar um segundo `GET /auth/me`.
22. Em falha de validação, autenticação, rede ou servidor, a UI restaura a última
    fonte confirmada:
    - se havia tema persistido no perfil, restaura esse valor no documento,
      provider e `localStorage`;
    - se o perfil não possuía tema, remove a chave local, volta ao valor atual do
      sistema e retoma a observação do media query.
    Em ambos os casos, preserva o cache anterior e exibe a notificação acessível
    `Não foi possível salvar o tema. Tente novamente.`.
23. Se o armazenamento local estiver indisponível, o bootstrap usa o sistema. Após
    login, a aplicação ainda pode aplicar o tema do perfil em memória e persistir
    uma nova escolha na API. A falha local não bloqueia bootstrap, login, navegação
    nem a request e não expõe detalhe técnico.
24. Se `GET /auth/me` falhar com status diferente de `401`, o tema escolhido no
    bootstrap permanece aplicado junto do estado de erro já vigente; nenhum valor
    parcial de perfil é inferido.
25. Se a sessão estiver ausente ou expirada, a UI redireciona para `/` e volta à
    precedência pública `localStorage > prefers-color-scheme`. Um login posterior
    executa novamente a reconciliação com o perfil.
26. O fluxo não registra nome, e-mail, foto, cookie, payload completo da pessoa ou
    conteúdo de `localStorage` em logs.

## Requisitos não funcionais

- Acessibilidade:
  - o botão icon-only possui nome de ação dinâmico e foco visível;
  - o ícone é decorativo e não duplica o nome acessível;
  - loading impede ativações concorrentes sem retirar silenciosamente o controle;
  - a notificação de falha é anunciada pela infraestrutura global de toast e não
    depende apenas de cor;
  - contraste e estados de foco continuam sendo fornecidos pelos tokens HeroUI de
    cada tema.
- Performance:
  - a preferência local e o media query são lidos no bootstrap sem request
    adicional;
  - a reconciliação reutiliza a `Person` já carregada pela rota protegida;
  - a troca altera somente o atributo do elemento raiz, estado do provider, uma
    chave local e uma request;
  - a response da mutation atualiza o cache e evita refetch obrigatório.
- Segurança e privacidade:
  - o endpoint deriva a pessoa exclusivamente da sessão validada;
  - não aceita `personId`, campos de identidade, `isAdmin` ou objeto `configs`
    arbitrário;
  - a preferência de tema não é armazenada no cookie de sessão;
  - logs da API usam somente ID técnico, operação e nomes de campos sanitizados;
  - o armazenamento local contém apenas `light` ou `dark`.
- Observabilidade:
  - o endpoint segue a política de logging vigente em controller, command, service
    e repository;
  - não adicionar analytics, telemetria, `console.*` ou evento de produto para a
    troca de tema;
  - falha de `localStorage` permanece degradada e não bloqueante;
  - mudança de `prefers-color-scheme` não cria analytics, log nem request.
- Compatibilidade:
  - documentos antigos continuam válidos e são expostos com `configs: {}`;
  - adicionar `configs` à response é compatível porque a API garante o objeto,
    sem garantir nem inventar a propriedade opcional `theme`;
  - consumidores, mocks e fixtures migram atomicamente para a propriedade
    obrigatória.

## Critérios de aceite

### Cenário 1 — Primeira abertura sem preferência local usa o sistema

- Forma de validar: limpar `dall-fit:theme` e abrir
  `http://localhost:3000/` alternando a emulação de
  `prefers-color-scheme` no navegador.
- Given: a chave local não existe e o sistema prefere `dark`
- When: o documento inicia antes de qualquer perfil autenticado
- Then: o elemento raiz recebe `data-theme="dark"` e a rota pública usa os tokens
  escuros
- And: ao repetir com preferência `light`, o elemento raiz recebe
  `data-theme="light"`

### Cenário 2 — Preferência local válida é a primeira fonte de verdade

- Forma de validar: gravar `dall-fit:theme=light` e abrir
  `http://localhost:3000/`.
- Given: o navegador possui `light` na chave local
- When: a aplicação inicia
- Then: o elemento raiz recebe `data-theme="light"` antes da primeira pintura útil

### Cenário 3 — Perfil autenticado substitui o valor local

- Forma de validar: `http://localhost:3000/dash?mockAuth=theme-light` com MSW
  habilitado e `dall-fit:theme=dark` preparado antes da navegação.
- Given: o bootstrap aplicou `dark` e `GET /auth/me` devolve
  `configs.theme: 'light'`
- When: a proteção carrega a pessoa
- Then: o shell autenticado usa `light` e `localStorage` passa a armazenar `light`

### Cenário 4 — Perfil sem tema usa o sistema, não um default da API

- Forma de validar: cenário vivo de legado em
  `api/docs/sdd/endpoints/current-person.md` e cenário de UI em
  `ui/docs/sdd/routes/dash.md`, adicionados na implementação.
- Given: existe um documento `Person` sem `configs.theme`, o navegador possui
  `dall-fit:theme=dark` e o sistema prefere `light`
- When: chama `GET /auth/me` e a UI reconcilia o perfil
- Then: a API responde `200` com `data.configs: {}`, sem `theme`
- And: a UI remove a chave local, aplica `light` e passa a seguir o sistema

### Cenário 5 — Alternar e persistir tema com sucesso

- Forma de validar: `http://localhost:3000/dash` com MSW habilitado.
- Given: o perfil e a UI estão em `dark`
- When: a pessoa ativa `Ativar tema claro`
- Then: a UI aplica `light` imediatamente e envia
  `PATCH /auth/me/configs` com `{ "theme": "light" }`
- And: a resposta atualiza a query de pessoa e uma nova abertura começa em `light`

### Cenário 6 — Falha ao persistir executa rollback

- Forma de validar: link reproduzível de falha documentado em
  `ui/docs/sdd/routes/dash.md` durante a implementação.
- Given: o tema confirmado é `dark` e o handler da mutation responde erro
- When: a pessoa tenta ativar `light`
- Then: a mudança é aplicada durante a tentativa, mas a falha restaura `dark` no
  documento, provider e `localStorage`
- And: a UI mantém a pessoa anterior no cache e anuncia que não conseguiu salvar

### Cenário 7 — Falha após perfil sem tema retorna ao sistema

- Forma de validar: link reproduzível de falha documentado em
  `ui/docs/sdd/routes/dash.md` durante a implementação.
- Given: o perfil não possui `configs.theme`, o sistema prefere `light` e a
  mutation de troca para `dark` falha
- When: a UI conclui a tentativa
- Then: remove `dall-fit:theme`, restaura `light` e volta a observar
  `prefers-color-scheme`

### Cenário 8 — Valor local inválido usa o sistema

- Forma de validar: gravar `dall-fit:theme=system` e abrir
  `http://localhost:3000/`.
- Given: a chave contém um valor não reconhecido e o sistema prefere `light`
- When: o bootstrap valida a preferência
- Then: trata a chave como ausente, aplica `light` por
  `prefers-color-scheme` e não propaga nem persiste `system`

### Cenário 9 — Mudança do sistema atualiza somente a fonte automática

- Forma de validar: `http://localhost:3000/` sem `dall-fit:theme`, alternando a
  emulação de cor do sistema.
- Given: o sistema é a fonte efetiva
- When: `prefers-color-scheme` muda de `light` para `dark`
- Then: a UI aplica `dark` sem gravar localmente nem chamar a API
- And: quando existe preferência local ou de perfil, a mesma mudança do sistema não
  substitui o tema explícito

### Cenário 10 — Request inválida é rejeitada

- Forma de validar: cenário vivo de validação em
  `api/docs/sdd/endpoints/current-person.md`, com seed e cURL adicionados na
  implementação.
- Given: existe uma sessão válida
- When: envia `{ "theme": "system" }`, `{}` ou propriedade adicional para
  `PATCH /auth/me/configs`
- Then: recebe `400 VALIDATION_ERROR` e o documento da pessoa permanece inalterado

## Estratégia de entrega e compatibilidade

A implementação é coordenada para não expor uma `Person` sem `configs` a qualquer
consumidor. Tipos, schema, mapeamento e serialização passam a aceitar
`configs.theme` opcional; API, UI, fixtures e mocks são atualizados na mesma
entrega. A API garante o objeto `configs`, mas não cria um tema quando o documento
não possui essa escolha.

Não existe job de migração. Um documento legado continua sem tema e o primeiro
toggle bem-sucedido materializa `configs.theme`. Alterar para o mesmo valor
persistido continua idempotente.

O bootstrap local/sistema permanece independente da disponibilidade da API. Após o
perfil ser carregado, um tema persistido no MongoDB é deliberadamente autoritativo
para acompanhar a conta entre navegadores e dispositivos. A ausência dessa
configuração também é significativa: ela descarta a preferência local potencialmente
herdada de outra conta e escolhe o sistema operacional sem persistir um default.

## Plano de testes

- unitários do parser/bootstrap para local `light`, local `dark`, chave ausente,
  chave inválida, exceção de `localStorage` e ambos os resultados de
  `prefers-color-scheme`;
- testes do provider para aplicação do atributo, mudança do media query,
  reconciliação com perfil presente/ausente, remoção da chave local, mutation,
  cache, loading compartilhado, sucesso e rollback para perfil ou sistema;
- testes de `application-menu` para nomes acessíveis, ícones decorativos e as duas
  apresentações sincronizadas;
- testes de rota com MSW Node para perfil claro, perfil escuro, perfil sem tema e
  falha na gravação;
- Playwright da rota `/dash` para precedências local/sistema/perfil, mudança do
  sistema e alternância persistida pela interface;
- unitários da API para DTO, command, service, preservação da ausência no mapper e
  repository;
- E2E serial da API com MongoDB efêmero para pessoa com tema, pessoa sem tema,
  legado sem `configs`, atualização válida, idempotência, validação e sessão
  ausente;
- execução dos quality gates da raiz, `pnpm -C api test:e2e` e
  `pnpm test:integration` na fase de implementação.

## Riscos e decisões

- A aplicação estática não conhece o perfil antes da request; por isso a preferência
  local explícita ou, na ausência dela, o sistema operacional evitam uma espera
  inicial. O perfil só pode assumir autoridade depois de carregado.
- Ler o tema apenas dentro do React permitiria uma pintura com os tokens claros
  definidos hoje em `:root`; o bootstrap precisa aplicar `data-theme` antes da
  primeira pintura útil.
- Persistir apenas localmente não acompanharia a conta, enquanto persistir apenas no
  MongoDB produziria flash e dependeria de rede em toda abertura. A preferência do
  sistema cobre a ausência de escolha explícita sem inventar um terceiro valor no
  contrato.
- Um valor local pode pertencer à última pessoa autenticada neste navegador. Quando
  o novo perfil não possui tema, preservá-lo herdaria uma escolha de outra conta;
  por isso a ausência no MongoDB remove a chave local e faz o sistema prevalecer.
- O valor derivado de `prefers-color-scheme` não é salvo localmente. Se fosse
  persistido como `light` ou `dark`, deixaria de acompanhar futuras mudanças do
  sistema e se tornaria indistinguível de uma escolha explícita.
- Manter a escolha otimista após falha criaria divergência conhecida em relação ao
  perfil autoritativo. O rollback e a notificação tornam o resultado previsível
  e permitem nova tentativa.
- Os menus desktop e móvel podem coexistir montados. Estado e mutation locais em
  cada botão permitiriam requests concorrentes e ícones divergentes; ambos consomem
  o mesmo provider global.
- O manifesto PWA é estático e não deve duplicar a preferência pessoal. Ajustar a
  interface externa do navegador exige demanda própria.
- O mapper garante `configs: {}` para documentos antigos, mas não usa default
  implícito do Mongoose nem materializa `theme`. Assim, a API preserva a diferença
  entre ausência de escolha e escolha explícita sem escrita incidental.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- `Person.configs` obrigatório, `Person.configs.theme` opcional e ausência
  preservada para registros novos e históricos
- Tema local ou do sistema aplicado antes da primeira pintura útil
- Tema do perfil autoritativo quando existir e sistema operacional autoritativo
  depois do login quando o perfil não tiver tema
- Toggle acessível, sincronizado entre menu persistente e móvel e sem mutation
  concorrente
- Persistência local e MongoDB consistente, com rollback em falha
- Endpoint, rotas, fluxo e bases vivas afetados atualizados
- MSW, mocks unitários, fixtures MongoDB e testes atualizados conforme o impacto
- Nenhuma migração em massa, Redis, valor persistido `system` ou alteração de
  manifesto PWA
- Revisão de código sem uso concluída em `api/` e `ui/`
- Quality gates da raiz, E2E da API e Playwright aprovados
