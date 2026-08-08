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
  navegador ou, na ausência de um valor local válido, o tema escuro. Depois que a
  pessoa autenticada é carregada, `Person.configs.theme` passa a ser a fonte de
  verdade, é aplicado e sincronizado no armazenamento local. Um botão somente com
  ícone no menu alterna entre `light` e `dark`, aplica a mudança imediatamente e a
  persiste tanto localmente quanto no cadastro da pessoa.
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
  `theme: Theme`;
- campo MongoDB opcional em registros históricos e obrigatório na representação de
  domínio e no contrato HTTP, com fallback `dark` durante o mapeamento;
- tema `dark` como padrão de novos cadastros e de registros antigos sem
  `configs.theme`, sem migração em massa;
- `GET /auth/me` devolvendo sempre `configs.theme`, inclusive para registros
  históricos sem o campo persistido;
- endpoint autenticado e específico `PATCH /auth/me/configs`, sem CRUD geral de
  pessoas, para persistir a preferência da própria sessão;
- request `{ theme: "light" | "dark" }` e response com a `Person` pública
  atualizada;
- estado global de tema da UI, disponível nas rotas públicas e autenticadas;
- leitura síncrona da chave local `dall-fit:theme` antes da primeira pintura útil;
- aplicação do tema por `data-theme="light"` ou `data-theme="dark"` no elemento
  raiz do documento;
- precedência local durante o bootstrap e precedência do perfil depois que
  `GET /auth/me` concluir com sucesso;
- sincronização do tema devolvido pelo perfil para `localStorage` e para o estado
  global da UI;
- botão HeroUI somente com ícone em todas as apresentações do menu autenticado,
  compartilhando um único estado e uma única mutation;
- aplicação otimista da troca, persistência local imediata, gravação na API,
  atualização do cache de pessoa e rollback em caso de falha;
- feedback acessível de ação, progresso e erro;
- atualização coordenada de contratos, endpoint, rota, fluxo, mocks e testes na
  fase de implementação.

### Não incluído

- tema `system`, `auto`, alto contraste ou qualquer valor além de `light` e `dark`;
- inferência por `prefers-color-scheme`;
- escolha de tema antes do login fora do valor já presente no navegador;
- tela de configurações ou de perfil;
- edição de nome, e-mail, foto, condição administrativa ou outras configurações;
- CRUD de pessoas ou endpoint que permita alterar a configuração de outra pessoa;
- migração ou backfill em massa dos documentos antigos do MongoDB;
- Redis, sessão com estado, cookie de tema ou persistência em Cache Storage ou
  IndexedDB;
- sincronização em tempo real entre abas, dispositivos ou sessões já abertas;
- alteração dinâmica das cores estáticas do Web App Manifest, splash screen ou
  interface externa do navegador/PWA;
- redesenho dos tokens claro e escuro existentes no `index.css`;
- screenshots ou regressão visual, pois não existem referências em
  `ui/docs/sdd/routes/assets/root/` nem em
  `ui/docs/sdd/routes/assets/dash/`.

## Projetos e documentação afetados

- API e endpoints:
  - o schema de `Person` recebe `configs.theme` com enum `light | dark`;
  - entidade, repository e mapeamento de `Person` materializam `dark` quando o
    documento não possui o campo;
  - `GET /auth/me` inclui `configs` na representação pública;
  - `PATCH /auth/me/configs` valida a preferência, atualiza somente a pessoa
    autenticada e devolve sua representação pública atualizada;
  - o fluxo segue controller → command → service de configuração → repository;
  - `api/docs/sdd/endpoints/current-person.md` passa a documentar a leitura e a
    atualização das configurações da pessoa atual, ou referencia um documento
    proprietário separado caso o endpoint seja dividido na implementação;
  - `api/docs/sdd/base/01-arquitetura.md` registra a configuração persistida em
    `Person` somente se isso acrescentar uma regra transversal vigente.
- UI e rotas:
  - a inicialização global aplica a preferência local antes da renderização;
  - um provider de tema envolve todas as rotas dentro do `QueryClientProvider`;
  - o layout autenticado reconcilia o provider com `Person.configs.theme` assim que
    a proteção carregar a pessoa;
  - `application-menu` recebe o botão de alternância sem duplicar estado entre o
    `aside` e o `Drawer`;
  - `ui/docs/sdd/base/01-arquitetura.md` e
    `ui/docs/sdd/base/03-componentes-e-estilizacao.md` passam a documentar
    bootstrap, provider, precedência e aplicação dos tokens;
  - `ui/docs/sdd/routes/root.md` passa a documentar o tema inicial local/default;
  - `ui/docs/sdd/routes/dash.md` passa a documentar reconciliação com o perfil,
    botão, mutation, sucesso e erro.
- Fluxos: `docs/sdd/flows/login-google.md` passa a registrar que o perfil
  autenticado substitui o tema local após `GET /auth/me`.
- Contratos em `@dall-fit/types`:
  - `Theme = 'light' | 'dark'`;
  - `PersonConfigs { theme: Theme }`;
  - `Person.configs: PersonConfigs`;
  - `UpdateCurrentPersonConfigsRequest { theme: Theme }`;
  - `UpdateCurrentPersonConfigsResponse`, com a `Person` pública atualizada.
- Decisões arquiteturais: não exige ADR; a preferência usa a persistência de
  `Person`, o client HTTP e os tokens já vigentes, sem introduzir tecnologia ou
  decisão transversal difícil de reverter.
- Handlers e fixtures MSW:
  - todas as fixtures de `Person` passam a possuir `configs.theme`;
  - `GET /auth/me` oferece uma variação fictícia com tema claro para validar a
    precedência do servidor;
  - novo handler stateful de `PATCH /auth/me/configs` cobre sucesso, validação,
    latência e falha técnica;
  - o estado mutável do handler é reiniciado entre testes Vitest e isolado entre
    cenários Playwright.
- Mocks de repositories/caches nos unitários da API: mock de `PersonRepository`
  recebe a operação de atualização da configuração; Redis não participa.
- Fixtures MongoDB/Redis nos E2E: fixtures de pessoa nova, existente,
  administradora e legado sem `configs` no MongoDB; Redis não se aplica.

## Requisitos funcionais

1. Os únicos temas reconhecidos em qualquer camada são `light` e `dark`.
2. A chave local é `dall-fit:theme` e armazena somente a string `light` ou `dark`,
   sem objeto, pessoa, timestamp ou outro dado.
3. Antes da primeira pintura útil, a UI lê `dall-fit:theme` de forma síncrona:
   - `light` aplica `data-theme="light"`;
   - `dark` aplica `data-theme="dark"`;
   - chave ausente, valor diferente ou falha de acesso aplica `dark`.
4. O bootstrap não consulta `prefers-color-scheme` e não espera a API para escolher
   o primeiro tema.
5. A aplicação do tema usa `data-theme` no `document.documentElement` e reutiliza
   exclusivamente os tokens já definidos para esses seletores em `index.css`.
6. A rota pública e os estados de loading/erro anteriores ao perfil usam o tema
   definido pelo bootstrap local.
7. Toda `Person` pública possui `configs: { theme }`. A propriedade não é opcional
   no domínio nem no contrato compartilhado.
8. Novas pessoas são persistidas com `configs.theme: 'dark'`.
9. Ao ler um documento histórico sem `configs` ou sem `configs.theme`, o repository
   materializa `configs.theme: 'dark'` na entidade e `GET /auth/me` devolve esse
   fallback. A leitura não precisa gravar ou migrar o documento.
10. Depois que a proteção autenticada recebe `Person`, o tema do perfil substitui
    qualquer tema local, inclusive quando os valores divergem.
11. A reconciliação do perfil atualiza, como uma única transição observável:
    - `data-theme` no elemento raiz;
    - estado global do provider;
    - chave `dall-fit:theme`;
    - valor confirmado usado para eventual rollback.
12. A reconciliação ocorre antes da pintura do shell autenticado sempre que a API e
    o ciclo do React permitirem, evitando exibir o menu com tokens divergentes.
13. O menu autenticado mostra um `Button` HeroUI icon-only para alternar o tema nas
    apresentações persistente e móvel.
14. No tema escuro, o botão usa um ícone Lucide decorativo que representa a ação de
    ativar o tema claro e possui nome acessível `Ativar tema claro`.
15. No tema claro, o botão representa a ação inversa e possui nome acessível
    `Ativar tema escuro`.
16. Acionar o botão calcula sempre o valor oposto e, antes da request:
    - aplica o novo `data-theme`;
    - atualiza o provider;
    - grava `dall-fit:theme`;
    - inicia `PATCH /auth/me/configs` com o novo valor.
17. Enquanto a gravação estiver pendente, os dois botões montados compartilham o
    mesmo estado desabilitado/loading e não iniciam uma segunda mutation.
18. `PATCH /auth/me/configs`:
    - exige sessão válida e não recebe ID de pessoa no path ou body;
    - aceita exatamente `{ "theme": "light" | "dark" }`;
    - rejeita valor inválido, body vazio e propriedades adicionais com
      `400 VALIDATION_ERROR`;
    - atualiza atomicamente somente `configs.theme` e `updatedAt` da pessoa da
      sessão;
    - responde `200` com a `Person` pública atualizada;
    - é idempotente quando recebe o valor já persistido.
19. Em sucesso, a UI mantém o tema escolhido, substitui o dado de pessoa nas queries
    ativas pelo payload devolvido e registra esse valor como a nova preferência
    confirmada, sem executar um segundo `GET /auth/me`.
20. Em falha de validação, autenticação, rede ou servidor, a UI restaura o último
    tema confirmado em `data-theme`, provider e `localStorage`, preserva o cache de
    pessoa anterior e exibe uma notificação acessível
    `Não foi possível salvar o tema. Tente novamente.`.
21. Se o armazenamento local estiver indisponível, a aplicação continua aplicando
    o tema em memória e pode persistir a escolha na API. A falha local não bloqueia
    bootstrap, login, navegação nem a request e não expõe detalhe técnico.
22. Se `GET /auth/me` falhar com status diferente de `401`, o tema local/default
    permanece aplicado junto do estado de erro já vigente; nenhum valor parcial de
    perfil é inferido.
23. Se a sessão estiver ausente ou expirada, a UI redireciona para `/` e conserva a
    preferência local para a experiência pública. Um login posterior pode
    substituí-la pela configuração da pessoa autenticada.
24. O fluxo não registra nome, e-mail, foto, cookie, payload completo da pessoa ou
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
  - a preferência local é lida uma vez no bootstrap e não atrasa o carregamento com
    request adicional;
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
  - falha de `localStorage` permanece degradada e não bloqueante.
- Compatibilidade:
  - documentos antigos continuam válidos e são lidos como `dark`;
  - adicionar `configs` à response é compatível somente porque a API garante o
    objeto para todos os registros antes de expô-los;
  - consumidores, mocks e fixtures migram atomicamente para a propriedade
    obrigatória.

## Critérios de aceite

### Cenário 1 — Primeira abertura sem preferência local usa tema escuro

- Forma de validar: limpar `dall-fit:theme` e abrir
  `http://localhost:3000/` com DevTools preservando o primeiro carregamento.
- Given: a chave local não existe
- When: o documento inicia antes de qualquer perfil autenticado
- Then: o elemento raiz recebe `data-theme="dark"` e a rota pública usa os tokens
  escuros sem consultar a preferência do sistema

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

### Cenário 4 — Registro legado recebe fallback escuro

- Forma de validar: cenário vivo de legado em
  `api/docs/sdd/endpoints/current-person.md`, com seed e cURL adicionados na
  implementação.
- Given: existe um documento `Person` sem `configs`
- When: chama `GET /auth/me` com a sessão dessa pessoa
- Then: recebe `200` com `data.configs.theme: 'dark'` sem exigir migração prévia

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

### Cenário 7 — Valor local inválido não cria um terceiro tema

- Forma de validar: gravar `dall-fit:theme=system` e abrir
  `http://localhost:3000/`.
- Given: a chave contém um valor não reconhecido
- When: o bootstrap valida a preferência
- Then: aplica `dark`, não consulta `prefers-color-scheme` e não propaga `system`

### Cenário 8 — Request inválida é rejeitada

- Forma de validar: cenário vivo de validação em
  `api/docs/sdd/endpoints/current-person.md`, com seed e cURL adicionados na
  implementação.
- Given: existe uma sessão válida
- When: envia `{ "theme": "system" }`, `{}` ou propriedade adicional para
  `PATCH /auth/me/configs`
- Then: recebe `400 VALIDATION_ERROR` e o documento da pessoa permanece inalterado

## Estratégia de entrega e compatibilidade

A implementação é coordenada para não expor uma `Person` sem `configs` a qualquer
consumidor. Primeiro, tipos, schema, mapeamento com fallback e serialização passam a
aceitar documentos históricos; API, UI, fixtures e mocks são então atualizados na
mesma entrega. Não existe rollout em que a UI nova dependa de um campo que a API
vigente possa omitir.

O fallback é aplicado na leitura e não exige job de migração. O primeiro toggle
grava `configs.theme` no documento legado. Alterar para o mesmo valor continua
idempotente e pode materializar o campo sem mudar o comportamento observado.

O bootstrap local permanece independente da disponibilidade da API. Após o perfil
ser carregado, a configuração do MongoDB é deliberadamente autoritativa para que a
preferência acompanhe a conta entre navegadores e dispositivos. Essa precedência
aceita uma única troca visual quando o valor local divergir do perfil.

## Plano de testes

- unitários do parser/bootstrap de tema para `light`, `dark`, ausente, inválido e
  exceção de `localStorage`;
- testes do provider para aplicação do atributo, reconciliação do perfil, mutation,
  cache, loading compartilhado, sucesso e rollback;
- testes de `application-menu` para nomes acessíveis, ícones decorativos e as duas
  apresentações sincronizadas;
- testes de rota com MSW Node para perfil claro, perfil escuro e falha na gravação;
- Playwright da rota `/dash` para precedência local/perfil e alternância persistida
  pela interface;
- unitários da API para DTO, command, service, fallback do mapper e repository;
- E2E serial da API com MongoDB efêmero para pessoa nova, legado sem `configs`,
  atualização válida, idempotência, validação e sessão ausente;
- execução dos quality gates da raiz, `pnpm -C api test:e2e` e
  `pnpm test:integration` na fase de implementação.

## Riscos e decisões

- A aplicação estática não conhece o perfil antes da request; por isso o tema local
  é a única fonte capaz de evitar uma espera inicial e o servidor assume autoridade
  somente depois que a pessoa é carregada.
- Ler o tema apenas dentro do React permitiria uma pintura com os tokens claros
  definidos hoje em `:root`; o bootstrap precisa aplicar `data-theme` antes da
  primeira pintura útil.
- Persistir apenas localmente não acompanharia a conta, enquanto persistir apenas no
  MongoDB produziria flash e dependeria de rede em toda abertura. As duas camadas
  possuem papéis diferentes e precedência explícita.
- Manter a escolha otimista após falha criaria divergência conhecida em relação ao
  perfil autoritativo. O rollback e a notificação tornam o resultado previsível
  e permitem nova tentativa.
- Os menus desktop e móvel podem coexistir montados. Estado e mutation locais em
  cada botão permitiriam requests concorrentes e ícones divergentes; ambos consomem
  o mesmo provider global.
- O manifesto PWA é estático e não deve duplicar a preferência pessoal. Ajustar a
  interface externa do navegador exige demanda própria.
- O fallback de legado ocorre no mapper, não por default implícito do Mongoose,
  garantindo que qualquer documento sem o campo produza o contrato completo sem
  escrita incidental.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- `Person.configs.theme` obrigatório nos contratos e garantido para registros novos
  e históricos
- Tema local aplicado antes da primeira pintura útil e perfil autoritativo após
  `GET /auth/me`
- Toggle acessível, sincronizado entre menu persistente e móvel e sem mutation
  concorrente
- Persistência local e MongoDB consistente, com rollback em falha
- Endpoint, rotas, fluxo e bases vivas afetados atualizados
- MSW, mocks unitários, fixtures MongoDB e testes atualizados conforme o impacto
- Nenhuma migração em massa, Redis, tema de sistema ou alteração de manifesto PWA
- Revisão de código sem uso concluída em `api/` e `ui/`
- Quality gates da raiz, E2E da API e Playwright aprovados
