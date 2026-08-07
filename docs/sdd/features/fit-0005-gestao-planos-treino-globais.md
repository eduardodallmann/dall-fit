# Feature Spec: Gestão administrativa de planos de treino globais

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0005`](https://github.com/eduardodallmann/dall-fit/issues/5).
- Problema: administradores ainda não conseguem cadastrar e manter planos de treino
  reutilizáveis. Não existem rotas, contratos HTTP nem persistência para listar,
  criar, editar ou excluir planos globais e seus workouts.
- Resultado: uma pessoa administradora acessa uma área protegida para gerenciar
  planos globais, abre o detalhe de um plano, mantém sua lista de workouts e chega
  à rota reservada ao futuro editor. A API oferece somente as operações exigidas
  por essas telas, persiste planos e sua árvore na coleção `training_plans` e mantém
  o domínio preparado para planos pessoais por meio de `ownerPersonId`.
- Referências:
  - `docs/sdd/features/fit-0004-autorizacao-administrativa.md`;
  - `docs/sdd/features/fit-0007-menu-da-aplicacao.md`;
  - `docs/sdd/adr/ADR-0001-estrategia-de-mocks-e-bancos-de-teste.md`;
  - `docs/sdd/adr/ADR-0002-autenticacao-google-e-sessao.md`;
  - `docs/sdd/base/03-contratos-compartilhados.md`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/base/02-endpoints-e-contratos.md`;
  - `api/docs/sdd/base/05-seeds-e-curls-de-cenario.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - catálogo oficial do HeroUI v3 para
    [Table](https://heroui.com/en/docs/react/components/table),
    [Pagination](https://heroui.com/en/docs/react/components/pagination),
    [Modal](https://heroui.com/en/docs/react/components/modal),
    [Fieldset](https://heroui.com/en/docs/react/components/fieldset),
    [Dropdown](https://heroui.com/en/docs/react/components/dropdown),
    [AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog),
    [Breadcrumbs](https://heroui.com/en/docs/react/components/breadcrumbs) e
    [Toast](https://heroui.com/en/docs/react/components/toast).
- Features relacionadas:
  - `FIT-0004` — introduziu `AdminOnly`, `adminRoute` e a semântica
    `Person.isAdmin === true`;
  - `FIT-0007` — introduziu o shell autenticado, o menu responsivo e `/dash` como
    destino comum e fallback administrativo;
  - a futura issue de exercícios implementará o editor da rota de workout criada
    nesta demanda.

## Escopo

### Incluído

- coleção MongoDB `training_plans`, separada de `Person`;
- modelo de plano reutilizável para ownership global e pessoal, usando somente
  `ownerPersonId: ObjectId | null`;
- workouts embutidos no documento do plano, cada um com ID próprio, nome e array de
  exercícios inicialmente vazio;
- índice `{ ownerPersonId: 1, createdAt: -1 }`;
- contratos compartilhados de plano, detalhe, resumo de workout, requests e
  responses consumidos pela API e pela UI;
- sete operações administrativas privadas:
  - `GET /global/training-plans?page=1`;
  - `POST /global/training-plans`;
  - `PATCH /global/training-plans/:trainingPlanId`;
  - `DELETE /global/training-plans/:trainingPlanId`;
  - `GET /global/training-plans/:trainingPlanId`;
  - `POST /global/training-plans/:trainingPlanId/workouts`;
  - `DELETE /global/training-plans/:trainingPlanId/workouts/:workoutId`;
- proteção de todas as operações da API por `AdminOnly` e das três rotas da UI por
  `adminRoute`;
- rota `/global/training-plan` para listagem paginada, criação, edição e exclusão;
- rota `/global/training-plan/:trainingPlanId` para identificação do plano, edição
  inline e manutenção da lista de workouts;
- rota `/global/training-plan/:trainingPlanId/workout/:workoutId` somente com
  integração à árvore, proteção, breadcrumb e estado informativo de editor ainda
  indisponível;
- link administrativo `Planos de treino` no menu, visível somente para
  `Person.isAdmin === true` e ativo também nas rotas descendentes;
- breadcrumbs HeroUI em todas as três rotas;
- `EmptyState` dentro do corpo da tabela para coleção vazia, loading sem linhas e
  falha recuperável do primeiro carregamento da listagem;
- formulários com TanStack Form, `Fieldset` e campos HeroUI;
- tabela, paginação, dropdowns de ações, modais e confirmações HeroUI;
- um `Toast.Provider` global e uso de `toast.promise` nas criações, edições e
  exclusões desta demanda;
- atualização otimista com snapshot e rollback nas mutações em que o resultado
  necessário já é conhecido; criação de workout espera o ID real antes de atualizar
  cache e navegar;
- handlers, fixtures e seletores exclusivos de MSW para todos os endpoints e
  estados relevantes;
- unitários, componentes, E2E da API e Playwright proporcionais aos caminhos e
  riscos descritos nesta feature;
- documentação viva do endpoint, das três rotas, de um novo fluxo administrativo e
  das bases afetadas, atualizada somente durante a implementação autorizada.

### Não incluído

- editor de nome, exercícios, séries, repetições, carga, descanso ou ordenação de
  exercícios dentro de um workout;
- endpoint para editar ou buscar isoladamente um workout;
- endpoint separado para listar workouts;
- CRUD genérico além das sete operações exigidas pelas telas;
- planos pessoais, clonagem de planos globais ou associação de plano a uma pessoa;
- `ownerType`, coleções separadas para planos globais/pessoais ou planos embutidos
  em `Person`;
- paginação, reordenação ou busca dos workouts do detalhe;
- busca, filtros, ordenação escolhida pela UI ou seletor de quantidade por página;
- unicidade de nome; planos diferentes podem possuir o mesmo nome;
- edição ou exclusão em lote;
- auditoria administrativa, histórico de versões ou soft delete;
- controle de concorrência por ETag, versionamento exposto ou confirmação de
  sobrescrita;
- uso de Redis, cache de backend, mensageria, serviço externo ou transação MongoDB;
- alteração da autenticação, da representação de `Person` ou da regra de acesso
  administrativo vigente;
- screenshots ou regressão visual, pois não existem referências nas pastas das
  novas rotas e nenhuma imagem foi fornecida.

## Projetos e documentação afetados

- API e endpoints:
  - novo módulo de domínio `training-plan`, composto apenas pelas camadas exigidas
    pelos fluxos reais;
  - controller(s) administrativos, DTOs, um command proprietário por operação,
    services coesos e port/adapter MongoDB para `training_plans`;
  - registro do módulo no wiring da aplicação;
  - novo documento vivo `api/docs/sdd/endpoints/global-training-plans.md`, agrupando
    as operações inseparáveis do recurso e descrevendo controller → command →
    service → repository em todos os caminhos;
  - atualização de `api/docs/sdd/base/01-arquitetura.md` para a nova persistência e
    o primeiro uso concreto de `AdminOnly`;
  - `auth.md`, `current-person.md` e `root.md` não mudam de contrato.
- UI e rotas:
  - `adminRoute` passa a possuir as três rotas navegáveis e entra na `routeTree`;
  - novos módulos de rota para lista, detalhe e stub de workout;
  - componentes exclusivos permanecem próximos das rotas; somente composição com
    reutilização real entre lista e detalhe migra para `ui/src/core/components/`;
  - `application-menu` recebe o link administrativo sem alterar o menu de pessoa
    comum;
  - `AppProviders` recebe o único `Toast.Provider` global;
  - novos documentos vivos `global-training-plan.md`,
    `global-training-plan-detail.md` e `global-training-plan-workout.md` em
    `ui/docs/sdd/routes/`;
  - atualização de `ui/docs/sdd/base/01-arquitetura.md`,
    `ui/docs/sdd/base/05-mocks-de-api.md` e `ui/docs/sdd/routes/dash.md` para a
    navegação administrativa, queries e provider efetivamente implementados;
  - `ui/docs/sdd/routes/root.md` não muda.
- Fluxos:
  - novo `docs/sdd/flows/gestao-planos-treino-globais.md`, da entrada pelo menu à
    manutenção de plano/workout e navegação ao stub do editor;
  - o fluxo de login Google não muda de ordem, destino ou contrato.
- Contratos em `@dall-fit/types`:
  - representação pública resumida de plano;
  - detalhe de plano com resumos de workouts;
  - request de criação e request parcial de edição;
  - responses de coleção, item, detalhe e criação de workout;
  - parâmetros HTTP ou tipos exclusivos de persistência permanecem na API;
  - `ownerPersonId` e o array real de exercícios não são expostos à UI;
  - todas as novas exportações saem por `packages/types/src/index.ts`.
- Decisões arquiteturais:
  - novo ADR para registrar a coleção única, o discriminador por
    `ownerPersonId`, os workouts/exercícios embutidos e seus trade-offs de
    crescimento e atomicidade; a decisão é transversal, prepara evolução futura e
    é difícil de reverter depois que documentos forem persistidos;
  - os ADRs de autenticação e testes permanecem históricos e inalterados.
- Handlers e fixtures MSW:
  - handlers para as sete operações, com estado mutável isolado por cenário quando
    uma jornada precisar observar criação, edição ou exclusão subsequente;
  - fixtures tipadas de coleção, detalhe, plano vazio, plano com workouts e erros;
  - seletor exclusivo de mocks `mockTrainingPlans`, convertido em header somente
    quando MSW estiver habilitado e nunca pertencente ao contrato da API;
  - proteção sentinela continua por último e nenhuma request alcança a API real.
- Mocks de repositories/caches nos unitários da API:
  - commands mockam os services que orquestram;
  - services mockam a port de `TrainingPlanRepository`;
  - controllers mockam seus commands apenas quando houver regra de transporte a
    validar;
  - Redis não se aplica.
- Fixtures MongoDB/Redis nos E2E:
  - administrador, pessoa comum, plano global sem workouts, plano global com
    workouts/exercícios fictícios e plano pessoal fora do escopo global;
  - MongoDB efêmero valida queries, projeções, mutações atômicas, ownership,
    cascata natural do documento e índice;
  - Redis não se aplica e não deve ser iniciado apenas para esta feature.

## Contratos pretendidos

### Representações públicas compartilhadas

- `TrainingPlanSummary` contém `id`, `name`, `description`, `createdAt` e
  `updatedAt`.
- `TrainingPlanWorkoutSummary` contém `id`, `name` e `exerciseCount`.
- `TrainingPlanDetails` contém todos os campos de `TrainingPlanSummary` e
  `workouts: readonly TrainingPlanWorkoutSummary[]`.
- `GlobalTrainingPlanCollectionResponse` usa
  `CollectionResponse<TrainingPlanSummary>` e sempre devolve `pageSize: 20`.
- `CreateTrainingPlanResponse` e `UpdateTrainingPlanResponse` envolvem
  `TrainingPlanSummary` em `ApiResponse`.
- `TrainingPlanDetailsResponse` envolve `TrainingPlanDetails` em `ApiResponse`.
- `CreateTrainingPlanWorkoutResponse` envolve `TrainingPlanWorkoutSummary` em
  `ApiResponse`.
- datas atravessam HTTP como strings ISO 8601 e IDs permanecem strings opacas.

### Entradas e validação

- `CreateTrainingPlanRequest` exige `name` e `description`.
- `UpdateTrainingPlanRequest` aceita `name` e/ou `description`, mas exige ao menos
  uma das duas propriedades.
- `name` deve ser string, é normalizado por `trim` e precisa possuir de 1 a 120
  caracteres após a normalização.
- `description` deve ser string, é normalizada por `trim` e precisa possuir de 1 a
  1000 caracteres após a normalização.
- propriedades adicionais são rejeitadas pela validação global da API.
- `page` é inteiro a partir de 1; ausência assume 1 e qualquer valor inválido
  responde `400 VALIDATION_ERROR`.
- IDs malformados respondem `400 VALIDATION_ERROR`; IDs válidos que não identifiquem
  um recurso global acessível usam os erros `404` específicos.
- `POST .../workouts` não recebe body funcional; body ausente ou objeto vazio é
  aceito, e propriedades adicionais são rejeitadas.

### Erros estáveis

- `401 AUTHENTICATION_REQUIRED`: sessão ausente, inválida, expirada ou pessoa
  removida;
- `403 ADMIN_ACCESS_REQUIRED`: pessoa autenticada sem `isAdmin: true`;
- `404 TRAINING_PLAN_NOT_FOUND`: ID válido inexistente ou plano que não seja global;
- `404 WORKOUT_NOT_FOUND`: plano global existe, mas o workout não pertence a ele;
- `400 VALIDATION_ERROR`: query, params ou body inválidos;
- falhas técnicas usam resposta genérica vigente e não expõem MongoDB, query,
  documento ou stack;
- a UI toma decisões por status e `code`, nunca por `message`.

## Requisitos funcionais

### Regras transversais de acesso, navegação e estado

1. As três rotas são filhas de `adminRoute`; pessoa não autenticada segue o
   redirect vigente para `/`, e pessoa autenticada comum segue o redirect vigente
   para `/dash` antes de qualquer conteúdo administrativo.
2. Cada endpoint usa `AdminOnly`, de modo que proteção visual da UI nunca substitui
   autorização no servidor.
3. O menu da pessoa administradora mostra o link `Planos de treino` para
   `/global/training-plan`; o item não existe, nem reserva espaço, no menu de pessoa
   comum.
4. O link usa navegação tipada, possui label textual e indica estado ativo tanto na
   lista quanto em qualquer rota descendente.
5. Todas as telas apresentam `Breadcrumbs` HeroUI com links tipados:
   - lista: `Home / Planos de treino`;
   - detalhe: `Home / Planos de treino / <nome do plano>`;
   - workout: `Home / Planos de treino / <nome do plano> / <nome do workout>`.
6. O último item do breadcrumb representa a página atual e não é link. Nomes
   extensos são truncados apenas visualmente e permanecem integralmente acessíveis.
   Quando uma consulta falha sem dado válido em cache, o breadcrumb mantém somente
   os ancestrais estáticos e os segmentos dinâmicos que puderam ser resolvidos com
   sucesso: falha do detalhe omite o nome do plano e do workout; plano carregado com
   `workoutId` ausente mantém o nome do plano e omite o nome do workout. Nenhum ID,
   placeholder, texto de erro ou dado possivelmente indefinido ocupa o segmento
   omitido.
7. Primeira entrada sem cache mostra estado de loading que comunica o recurso
   carregado e não apresenta tabela ou identificação parcial como se fosse dado
   definitivo.
8. Quando houver cache, refetch e invalidação mantêm o dado atual visível; uma
   indicação não bloqueante pode comunicar atualização, mas não substitui a tela
   por loading inicial.
9. Na listagem, loading sem linhas, coleção vazia e falha do primeiro carregamento
   são apresentados dentro do corpo da própria tabela por
   `Table.Body.renderEmptyState`, usando `EmptyState` HeroUI com conteúdo distinto
   para cada condição. A falha mostra mensagem segura e botão `Tentar novamente`,
   que chama `refetch`, fica desabilitado durante a tentativa e preserva cabeçalhos
   e contexto da tabela. No detalhe e na rota de workout, uma falha inicial da
   query do plano usa o estado de erro da rota com a mesma ação, pois o recurso da
   página inteira, e não somente suas linhas, está indisponível. Falha de atualização
   em background nunca usa `EmptyState`: preserva as linhas ou o detalhe em cache e
   mostra `Alert` não bloqueante com `Tentar novamente` até um refetch bem-sucedido,
   sem apagar conteúdo válido.
10. Toda mutation cancela queries concorrentes relevantes, captura snapshot antes
    de alterar cache, aplica a mudança prevista e restaura integralmente o snapshot
    em falha. Ao concluir, invalida somente as famílias de queries afetadas.
11. Toda criação, edição e exclusão usa `toast.promise`, com mensagens de loading,
    sucesso e erro. Erros exibidos são seguros e não mostram `message` técnico da
    API.
12. Enquanto uma mutation está pendente, seu controle de confirmação fica
    desabilitado e não permite submissão duplicada; operações não conflitantes
    continuam disponíveis quando seguras.

### Rota `/global/training-plan`

13. A rota possui título `Planos de treino globais` e botão `Adicionar` no lado
    oposto do cabeçalho.
14. O search param tipado `page` representa a página atual, assume 1 quando ausente
    ou inválido na URL da UI e permite reload, deep link, voltar e avançar do
    navegador sem perder a paginação.
15. A UI envia somente `page`; não envia `pageSize`, e não apresenta seletor de
    quantidade.
16. A tabela usa `Table` HeroUI, possui nome acessível e as colunas `Nome`,
    `Descrição` e `Ações`. `Nome` é cabeçalho de linha.
17. O nome de cada plano é um link tipado para seu detalhe. A linha inteira não se
    torna um alvo de clique implícito.
18. `Ações` contém botão HeroUI icon-only com ícone de três pontos e nome acessível
    contextual, por exemplo `Ações do plano Hipertrofia iniciante`.
19. O `Dropdown` oferece `Editar` e `Excluir`; `Excluir` usa a variante semântica de
    perigo e ambas as opções funcionam por teclado.
20. A paginação usa `Pagination` HeroUI, calcula a quantidade de páginas por
    `ceil(total / 20)` e não aparece quando houver no máximo uma página.
21. Uma página acima do último resultado válido, inclusive após exclusão
    concorrente, é corrigida para a última página existente; coleção vazia permanece
    em `page=1`.
22. O estado vazio usa `EmptyState` em `Table.Body.renderEmptyState`, mostra mensagem
    de que não existem planos globais e mantém `Adicionar` disponível. Ele possui
    texto diferente do loading e da falha recuperável, para não representar erro de
    integração como ausência real de registros.

### Criar e editar plano pela listagem

23. `Adicionar` abre `Modal` HeroUI com heading `Adicionar plano de treino` e um
    formulário TanStack Form composto por `Fieldset`, `TextField`, `Input`,
    `TextArea`, `FieldError` e botões HeroUI.
24. O formulário possui campos `Nome` e `Descrição`, ações `Salvar` e `Cancelar`,
    valida conforme o contrato antes da mutation e move foco para o primeiro campo
    inválido quando houver erro.
25. `Cancelar`, fechamento permitido da modal e `Escape` descartam apenas o draft
    local quando não há submissão pendente. Durante a submissão, fechamento é
    bloqueado para que o resultado e o rollback sejam determinísticos.
26. Ao criar um plano:
    1. a UI normaliza e valida os valores;
    2. cancela refetches e captura as páginas de lista afetadas;
    3. muda a navegação para a página 1, porque a ordenação coloca o novo plano no
       início;
    4. insere um item temporário identificável apenas no cache, incrementa `total`
       e mantém no máximo 20 itens na página;
    5. executa `POST /global/training-plans` sob `toast.promise`;
    6. substitui o temporário exatamente pelo item canônico retornado;
    7. invalida a coleção em background e fecha a modal no sucesso;
    8. em falha, restaura páginas, total e página de navegação anteriores e mantém
       os valores do formulário disponíveis para correção ou nova tentativa.
27. `Editar` abre a mesma composição de modal, com heading `Editar plano de treino`
    e valores obtidos diretamente da linha; nenhuma request de detalhe é feita.
28. Ao editar pela lista, a UI atualiza imediatamente o item em todas as páginas de
    lista que o contenham e também um eventual cache de detalhe do mesmo ID.
29. A resposta do PATCH substitui os campos otimistas pelos valores canônicos. Em
    erro, lista e detalhe voltam aos snapshots e o formulário mantém o draft.
30. Abrir e cancelar a edição não altera cache nem executa request.

### Excluir plano pela listagem

31. `Excluir` abre `AlertDialog` HeroUI que nomeia o plano, informa que workouts e
    exercícios também serão removidos e exige uma ação explícita `Excluir plano`;
    `Cancelar` preserva o item.
32. Confirmar a exclusão remove imediatamente o item da página, decrementa `total`
    sem torná-lo negativo e preserva snapshot de todas as páginas e do detalhe.
33. Se a remoção deixar uma página maior que a última página válida, a UI navega
    otimisticamente para a última página válida, no mínimo 1.
34. Em `204`, o cache de detalhe é removido e a coleção é invalidada para preencher
    a página conforme a ordenação do servidor.
35. Em falha, o item, a ordem, `total`, caches de detalhe e search param `page`
    retornam exatamente ao estado anterior.

### Rota `/global/training-plan/:trainingPlanId`

36. A rota consulta `GET /global/training-plans/:trainingPlanId` uma única vez para
    obter identificação e workouts; não cria request adicional para a tabela.
37. Enquanto a listagem de planos ainda estiver em cache, seus dados podem servir
    como apresentação inicial do nome e da descrição, mas o detalhe não é
    considerado completo até a query própria fornecer `workouts`.
38. O cabeçalho mostra título `Plano de treino`, nome, descrição, botão icon-only de
    lápis com nome `Editar nome e descrição` e botão `Adicionar` para workout no
    lado oposto.
39. Ativar o lápis substitui nome e descrição pelos mesmos campos e validações da
    modal, com ações explícitas `Salvar` e `Cancelar`, em edição inline semelhante
    à edição de título de uma issue do GitHub.
40. `Cancelar` restaura a apresentação sem mutation. `Salvar` atualiza
    otimisticamente o detalhe e qualquer resumo em lista, usa o mesmo PATCH e faz
    rollback coordenado em falha.
41. Em sucesso, a resposta canônica permanece no cache e a tela sai do modo de
    edição. Em falha, os dados persistidos voltam ao snapshot e o draft continua
    editável.
42. A tabela de workouts usa `Table` HeroUI e possui colunas `Nome`, `Quantidade de
exercícios` e `Ações`, com `Nome` como cabeçalho de linha.
43. `exerciseCount` é exibido diretamente da response; a UI nunca busca nem conta
    exercícios.
44. A tabela preserva a ordem dos workouts no array embutido. Workouts novos são
    acrescentados ao fim. Não há paginação ou ordenação local nesta entrega.
45. O estado vazio informa que o plano ainda não possui workouts e mantém
    `Adicionar` disponível.
46. O botão icon-only de ações de cada workout possui nome acessível contextual e
    abre `Dropdown` com `Editar` e `Excluir`.
47. `Editar` navega de forma tipada para
    `/global/training-plan/:trainingPlanId/workout/:workoutId`.

### Criar e excluir workout

48. Ativar `Adicionar` desabilita o controle e mostra loading sem criar `/new`, ID
    temporário ou reserva exclusivamente frontend.
49. A UI executa o POST de body vazio sob `toast.promise`, recebe o ID real e então:
    1. acrescenta imediatamente o resumo canônico ao cache do detalhe;
    2. invalida o detalhe em background sem ocultar o dado;
    3. navega para a rota do workout com o ID retornado.
50. A atualização posterior à resposta é intencionalmente imediata, mas não é uma
    criação otimista anterior ao servidor: nenhum workout fictício pode existir sem
    ID persistido.
51. Falha na criação mantém a pessoa no detalhe, não adiciona item e reabilita o
    controle com toast de erro.
52. `Excluir` abre `AlertDialog` que nomeia o workout e informa que seus exercícios
    serão removidos. Confirmar remove o resumo do cache antes da resposta e preserva
    snapshot para rollback.
53. Em `204`, a query de detalhe é invalidada. Em falha, o workout retorna à mesma
    posição, com o mesmo `exerciseCount`.

### Rota de workout reservada

54. A rota de workout reutiliza a query de detalhe do plano para resolver os nomes
    do plano e do workout no breadcrumb. Em navegação a partir do detalhe não faz
    nova request enquanto o cache estiver válido; em acesso direto executa somente
    o GET de detalhe do plano.
55. A página mostra título `Treino`, o nome do workout e texto informando que o
    editor será disponibilizado em uma próxima entrega. Não mostra formulário,
    exercícios ou ações de salvamento.
56. Se o plano responder `TRAINING_PLAN_NOT_FOUND`, a tela apresenta estado de não
    encontrado com retorno para a lista. Se o plano existir mas o `workoutId` não
    estiver em `workouts`, apresenta estado de workout não encontrado sem inventar
    uma chamada HTTP específica. O primeiro caso omite os dois nomes dinâmicos do
    breadcrumb; o segundo pode manter o nome do plano carregado, mas omite o nome do
    workout.

### Comportamento dos endpoints e persistência

57. `GET /global/training-plans` filtra exclusivamente
    `ownerPersonId: null`, ordena por `createdAt` decrescente, aplica offset de
    `(page - 1) * 20`, limita a 20 e devolve `total` dos planos globais.
58. A listagem projeta somente `id`, `name`, `description`, `createdAt` e
    `updatedAt`; nunca devolve `ownerPersonId`, workouts ou exercícios.
59. `POST /global/training-plans` cria um documento com `ownerPersonId: null`,
    valores normalizados, `workouts: []` e timestamps; nomes duplicados são aceitos
    e cada POST válido cria um recurso novo.
60. `PATCH` altera somente os campos presentes e atualiza `updatedAt`. O endpoint é
    reutilizado pela modal e pela edição inline e devolve o mesmo resumo público da
    listagem.
61. Escritas concorrentes de PATCH usam a política last-write-wins do MongoDB; não
    existe precondition nesta entrega, e a response do último request concluído é
    a representação canônica para seu consumidor.
62. `DELETE` do plano remove um único documento global. Como a árvore é embutida,
    workouts e exercícios desaparecem na mesma operação, sem cascata entre
    coleções ou transação.
63. `GET /global/training-plans/:trainingPlanId` filtra pelo ID e por
    `ownerPersonId: null`, projeta o plano e calcula `exerciseCount` de cada workout
    no MongoDB sem transportar os arrays de exercícios para a UI.
64. O detalhe devolve todos os workouts na ordem persistida, cada um apenas com
    `id`, `name` e `exerciseCount`.
65. `POST .../workouts` exige plano global existente e acrescenta atomicamente ao
    array um subdocumento com ID MongoDB real, `name: "Novo treino"` e
    `exercises: []`.
66. `DELETE .../workouts/:workoutId` distingue plano global inexistente de workout
    ausente e remove atomicamente somente o subdocumento correspondente.
67. Plano pessoal conhecido por ID continua invisível às rotas globais e responde
    `TRAINING_PLAN_NOT_FOUND`, evitando enumeração ou alteração fora do escopo.
68. Commands não acessam repository. Cada command chama services com contratos de
    domínio; somente os services acessam a port de repository, e o adapter MongoDB
    recebe filtros/entidades já preparados, nunca DTO HTTP.
69. Operações sobre workouts permanecem atômicas dentro de um documento e não
    introduzem transação. Concorrência entre exclusão do plano e mutação filha
    termina em sucesso atômico ou erro de recurso não encontrado, sem documento
    parcial.
70. O schema persiste `ownerPersonId` explicitamente: `null` para global e
    `ObjectId` para o futuro proprietário pessoal. Ausência do campo não é uma
    terceira semântica válida.
71. Esta entrega persiste o array `exercises` sempre vazio e não define payload
    público para seus elementos. A implementação evita uma API genérica de escrita;
    a feature futura de exercícios introduzirá o schema tipado antes de persistir o
    primeiro elemento.

## Requisitos não funcionais

- Acessibilidade:
  - headings, breadcrumbs, tabelas, formulários, menus e diálogos preservam a
    semântica dos componentes HeroUI e nomes acessíveis em português;
  - botões icon-only têm nome contextual; ícones são decorativos;
  - ações destrutivas exigem `AlertDialog`, foco contido e confirmação explícita;
  - modal e alert dialog restauram foco ao trigger quando fechados;
  - erros de campo são associados ao controle e anunciados, sem depender de cor;
  - loading, vazio, sucesso e erro possuem texto ou nome acessível;
  - o `EmptyState` de erro contém mensagem persistente e ação de retry operável por
    teclado; o `Alert` de falha em background não desloca foco automaticamente;
  - Toast complementa o estado persistente e não é a única forma de informar erro
    de validação ou de primeiro carregamento;
  - paginação e links informam a página/rota atual semanticamente.
- Performance:
  - paginação e contagem são feitas no backend; a UI não baixa a coleção completa;
  - listagem não carrega workouts e detalhe não carrega exercícios;
  - índice `{ ownerPersonId: 1, createdAt: -1 }` sustenta filtro e ordenação da
    listagem;
  - TanStack Query compartilha e preserva caches; editar uma linha não faz GET de
    detalhe, e a rota de workout reutiliza o GET do plano;
  - invalidações são específicas e não limpam todo o `QueryClient`.
- Segurança e privacidade:
  - `AdminOnly` protege cada endpoint e `adminRoute` evita renderização antecipada;
  - nenhuma entrada controla `ownerPersonId`, IDs gerados, `exerciseCount` ou
    exercícios;
  - queries sempre incluem ownership global, inclusive get/update/delete por ID;
  - DTOs rejeitam campos adicionais e payloads fora dos limites;
  - responses e logs não expõem IDs de proprietário, documentos, queries ou arrays
    de exercícios;
  - fixtures usam somente administradores e conteúdos fictícios.
- Observabilidade:
  - todo método novo de controller, command, service e repository registra entrada,
    retorno de dependência, branch, efeito e saída conforme
    `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
  - logs podem conter IDs técnicos, página, contagens, campos alterados, operação,
    ownership global como flag e códigos de erro;
  - nomes, descrições, documentos completos, bodies e exercícios nunca são
    registrados;
  - não criar telemetria ou analytics de interação na UI.
- Componentização e estilo:
  - usar `Table`, `EmptyState`, `Alert`, `Pagination`, `Modal`, `Fieldset`,
    `TextField`, `Input`, `TextArea`, `Dropdown`, `AlertDialog`, `Breadcrumbs`,
    `Button`, `Spinner` e `Toast` de `@heroui/react` antes de equivalentes locais;
  - formulários usam TanStack Form e composição tipada, sem casts para APIs
    genéricas;
  - JSX próprio não contém classes Tailwind nem estilos inline; toda apresentação
    fica em `styles.ts` com `tv` de `@heroui/styles`;
  - componentes extensos são decompostos por responsabilidade e permanecem na rota
    enquanto não houver reutilização comprovada.

## Critérios de aceite

### Cenário 1 — Acesso administrativo e navegação pela lista

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin` com MSW habilitado.
- Given: a pessoa atual possui `isAdmin: true` e existem mais de 20 planos globais.
- When: ela ativa `Planos de treino` no menu e muda de página.
- Then: vê breadcrumb, título, tabela com 20 itens, paginação sem seletor de tamanho
  e o item administrativo ativo; a URL preserva `page`.

### Cenário 2 — Pessoa comum não acessa a área

- Forma de validar: `http://localhost:3000/global/training-plan` com MSW habilitado.
- Given: `GET /auth/me` devolve pessoa sem `isAdmin`.
- When: ela tenta acessar a URL diretamente.
- Then: é redirecionada com substituição de histórico para `/dash`, sem request de
  planos nem renderização de conteúdo administrativo.

### Cenário 3 — API rejeita pessoa comum

- Forma de validar: cenário `Pessoa comum` do documento vivo
  `api/docs/sdd/endpoints/global-training-plans.md`, com seed e cURL completos.
- Given: existe sessão válida de pessoa sem `isAdmin`.
- When: ela chama qualquer uma das sete operações.
- Then: recebe `403 ADMIN_ACCESS_REQUIRED` antes do controller e não há efeito.

### Cenário 4 — Criar plano com atualização otimista

- Forma de validar:
  `http://localhost:3000/global/training-plan?page=2&mockAuth=admin` com MSW
  habilitado.
- Given: a lista possui duas páginas e a pessoa está na segunda.
- When: abre `Adicionar`, informa valores válidos e salva.
- Then: a UI vai à página 1, mostra o item temporário durante o POST, troca-o pela
  response canônica, atualiza total, fecha a modal e mostra sucesso no toast.

### Cenário 5 — Falha ao criar plano restaura cache, página e draft

- Forma de validar:
  `http://localhost:3000/global/training-plan?page=2&mockAuth=admin&mockTrainingPlans=create-error`
  com MSW habilitado.
- Given: a pessoa está na página 2 com a modal preenchida.
- When: salva e o POST falha.
- Then: item temporário desaparece, total e página 2 são restaurados, os campos
  continuam preenchidos e o toast informa erro seguro.

### Cenário 6 — Editar pela listagem sem GET adicional

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin` com MSW habilitado e
  inspeção das requests no Playwright.
- Given: a linha já contém nome e descrição.
- When: a pessoa escolhe `Editar`, altera os dois campos e salva.
- Then: a modal nasce dos dados da linha, nenhum GET de detalhe é emitido, a linha
  muda otimisticamente e a response canônica mantém o cache consistente.

### Cenário 7 — Excluir plano e realizar rollback

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=delete-error`
  com MSW habilitado.
- Given: a pessoa abriu a confirmação para um plano com workouts.
- When: confirma e o DELETE falha.
- Then: o dialog nomeia a cascata, o item some durante a mutation e volta à mesma
  posição com total e paginação anteriores; o toast informa erro.

### Cenário 8 — Carregar detalhe e editar inline

- Forma de validar:
  `http://localhost:3000/global/training-plan/training-plan-global-001?mockAuth=admin`
  com MSW habilitado.
- Given: o GET devolve plano e workouts.
- When: a pessoa ativa o lápis, edita nome e descrição e salva.
- Then: formulário inline substitui a apresentação, detalhe e lista em cache mudam
  otimisticamente e a response canônica encerra a edição com toast de sucesso.

### Cenário 9 — Criar workout com ID do backend

- Forma de validar: mesmo link do cenário 8.
- Given: o detalhe está carregado.
- When: a pessoa ativa `Adicionar`.
- Then: o botão mostra loading, o POST envia body vazio, nenhum ID temporário nem
  rota `/new` é criado, o item retornado entra no cache e a UI navega com seu ID
  real para a rota de workout.

### Cenário 10 — Excluir workout e preservar contagem no rollback

- Forma de validar:
  `http://localhost:3000/global/training-plan/training-plan-global-001?mockAuth=admin&mockTrainingPlans=delete-workout-error`
  com MSW habilitado.
- Given: um workout mostra quantidade de exercícios maior que zero.
- When: a pessoa confirma a exclusão e o DELETE falha.
- Then: o workout removido otimisticamente retorna à mesma posição e com a mesma
  contagem; nenhum exercício é buscado pela UI.

### Cenário 11 — Rota reservada de workout usa o cache do detalhe

- Forma de validar: navegar pelo `Editar` do workout no cenário 8 e também acessar
  diretamente
  `http://localhost:3000/global/training-plan/training-plan-global-001/workout/workout-001?mockAuth=admin`.
- Given: plano e workout existem.
- When: a pessoa navega a partir do detalhe ou abre o deep link.
- Then: vê breadcrumb com os dois nomes e o estado informativo do futuro editor;
  navegação com cache não faz novo GET, e deep link faz somente o GET do plano.

### Cenário 12 — Listagem paginada filtra somente planos globais

- Forma de validar: cenário `Listar planos globais` do documento vivo do endpoint,
  com seed e cURL completos.
- Given: o MongoDB contém planos globais e pessoais intercalados por data.
- When: administrador chama `GET /global/training-plans?page=1`.
- Then: recebe somente globais, em ordem decrescente de criação, no máximo 20,
  `pageSize: 20`, total global e nenhum workout.

### Cenário 13 — Criar plano persiste ownership e contrato público

- Forma de validar: cenário `Criar plano global` do documento vivo do endpoint,
  com seed e cURL completos.
- Given: administrador envia nome e descrição válidos.
- When: chama o POST.
- Then: recebe o resumo público, e o documento possui `ownerPersonId: null`,
  `workouts: []` e timestamps sem expor ownership na response.

### Cenário 14 — Validação de criação e PATCH

- Forma de validar: cenários `Body inválido` dos endpoints POST e PATCH, cada um com
  seed justificado e cURL completo.
- Given: nome/descrição ficam vazios após trim, excedem limites, possuem tipo
  inválido, o PATCH não contém campo ou o body contém propriedade adicional.
- When: o request é validado.
- Then: recebe `400 VALIDATION_ERROR` antes do command e não altera MongoDB.

### Cenário 15 — Detalhe calcula contagens sem expor exercícios

- Forma de validar: cenário `Detalhar plano global` do documento vivo do endpoint,
  com seed e cURL completos.
- Given: um plano possui workouts com zero e com vários exercícios fictícios.
- When: administrador chama o GET de detalhe.
- Then: recebe nomes e `exerciseCount` corretos, na ordem persistida, sem arrays ou
  dados dos exercícios.

### Cenário 16 — Exclusão do plano remove a árvore

- Forma de validar: cenário `Excluir plano global` do documento vivo do endpoint,
  com seed e cURL completos, mais E2E MongoDB.
- Given: plano global possui workouts e exercícios embutidos.
- When: administrador chama DELETE.
- Then: recebe `204` sem body e o único documento, workouts e exercícios deixam de
  existir atomicamente.

### Cenário 17 — Plano pessoal não é alcançável por endpoint global

- Forma de validar: cenário `Plano fora do ownership global` do documento vivo do
  endpoint, com seed e cURL completos.
- Given: existe plano com `ownerPersonId` de uma pessoa.
- When: administrador usa seu ID em GET, PATCH, DELETE ou operação de workout
  global.
- Then: recebe `404 TRAINING_PLAN_NOT_FOUND` e o documento permanece inalterado.

### Cenário 18 — Diferenciar plano e workout inexistentes

- Forma de validar: cenários específicos do documento vivo do endpoint, com seeds
  e cURLs completos.
- Given: no primeiro caso o plano não existe; no segundo o plano global existe e o
  workout não pertence a ele.
- When: administrador tenta excluir o workout.
- Then: recebe respectivamente `TRAINING_PLAN_NOT_FOUND` e `WORKOUT_NOT_FOUND`, sem
  usar `message` como contrato e sem efeito parcial.

### Cenário 19 — Falha inicial da listagem permite retry dentro da tabela

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=list-error`
  com MSW habilitado.
- Given: a listagem não possui dado anterior em cache e seu GET falha.
- When: a tabela é renderizada e a pessoa ativa `Tentar novamente`.
- Then: cabeçalhos e contexto da tabela permanecem visíveis, o corpo mostra
  `EmptyState` de erro em vez da mensagem de coleção vazia e o botão dispara
  `refetch`, ficando desabilitado durante a nova tentativa.
- And: se uma atualização em background falhar depois de existir cache, as linhas
  permanecem e a falha aparece em `Alert`, sem substituir o corpo por `EmptyState`.

### Cenário 20 — Falha omite segmentos dinâmicos do breadcrumb

- Forma de validar:
  `http://localhost:3000/global/training-plan/training-plan-not-found?mockAuth=admin`
  e
  `http://localhost:3000/global/training-plan/training-plan-global-001/workout/workout-not-found?mockAuth=admin`
  com MSW habilitado.
- Given: no primeiro link o plano não pode ser carregado; no segundo o plano é
  carregado, mas o workout não pertence ao detalhe.
- When: cada rota apresenta seu estado de falha ou não encontrado.
- Then: a falha do plano mantém somente `Home / Planos de treino`; a falha do
  workout pode manter também o nome do plano resolvido, mas não apresenta nome,
  ID, placeholder ou erro como item do workout no breadcrumb.

## Estratégia de entrega e compatibilidade

1. Registrar o ADR e introduzir os contratos compartilhados antes de seus
   consumidores, mantendo `ownerPersonId` exclusivo da API.
2. Implementar domínio, persistência, services, commands, controllers, wiring,
   seeds e E2E da API segundo a hierarquia vigente.
3. Implementar services HTTP, query options, mutations, handlers e fixtures MSW.
4. Adicionar o provider de toast, as rotas sob `adminRoute`, o link de menu e as
   telas de lista/detalhe/stub.
5. Atualizar SDDs vivos, testes e consumidores atomicamente somente na fase de
   implementação autorizada.
6. Revisar API e UI para remover código sem uso e executar todos os gates.

Todos os contratos são novos e não quebram consumidores vigentes. A extensão do
menu ocorre somente para administradores. A coleção nasce sem migração nem backfill,
porque nenhum plano vigente existe em outra estrutura.

O modelo de domínio evita nomes e decisões exclusivamente globais fora da fronteira
HTTP/rota: entidade, schema, repository e estruturas compartilhadas representam
`TrainingPlan`; os endpoints globais preparam o filtro `ownerPersonId: null`.
Planos pessoais futuros podem reutilizar a coleção sem alterar documentos globais,
mas exigirão feature, endpoints, autorização e UI próprios.

Criação não é idempotente e aceita nomes duplicados. PATCH usa last-write-wins.
DELETE de recurso já ausente responde `404`, portanto repetir uma exclusão não
repete o status de sucesso. Operações de workout são atômicas por estarem no mesmo
documento; não há transação distribuída.

## Plano de testes

- Contratos compartilhados:
  - typecheck das requests/responses e exportações públicas;
  - compatibilidade de `CollectionResponse` com `pageSize` efetivamente igual a 20.
- Unitários da API:
  - DTOs e pipes para normalização, limites, body parcial e propriedades extras;
  - um command por endpoint cobrindo preparação, ordem dos services, respostas e
    propagação de erros;
  - services para filtro global, paginação, criação, patch parcial, not found,
    criação/exclusão de workout e diferenciação dos dois `404`;
  - repository mockado nos services, inclusive falhas técnicas e resultados de
    concorrência;
  - autorização administrativa permanece coberta e é exercitada pelos novos
    controllers.
- E2E serial da API com MongoDB efêmero:
  - `401`, `403`, validações e IDs malformados;
  - paginação de 20, total, ordem e exclusão de planos pessoais;
  - criação com ownership nulo e duplicidade permitida;
  - PATCH parcial e last-write-wins observável;
  - detalhe com projeção e contagens sem exercícios na response;
  - criação de workout com ID real e array vazio;
  - exclusão de workout, erros distintos e preservação dos demais subdocumentos;
  - exclusão do plano com toda a árvore;
  - presença do índice composto esperado.
- Unitários e componentes da UI:
  - query keys, parâmetros, cache entre páginas e detalhe;
  - validação dos dois formulários e preservação de draft;
  - todos os `onMutate`, snapshots, respostas canônicas, rollbacks e invalidações;
  - criação de workout sem ID temporário;
  - cálculo de última página após exclusão;
  - loading, vazio e erro inicial distintos no `EmptyState` da tabela, retry e
    falha de background em `Alert` sem remover linhas;
  - breadcrumbs, tabelas, dropdowns, modais, alert dialogs, toast e nomes
    acessíveis, inclusive omissão dos segmentos dinâmicos não resolvidos;
  - link administrativo presente/ausente e ativo em descendentes;
  - rota de workout com cache, deep link e ID ausente no detalhe.
- MSW:
  - handlers das sete operações com contratos tipados;
  - latência para loading, coleção vazia, páginas, detalhe, `404`, falhas técnicas e
    falhas de cada mutation;
  - estado mutável isolado, reiniciado por teste, sem dependência de ordem;
  - sentinela `501 MOCK_NOT_IMPLEMENTED` permanece por último.
- Playwright:
  - specs das três rotas em `ui/tests/integration/routes/training-plan/`;
  - flow administrativo em `ui/tests/integration/flows/`;
  - proteção comum/admin, menu, deep links e breadcrumbs;
  - paginação, criação/edição/exclusão de plano, rollbacks e foco;
  - edição inline, criação/exclusão de workout e navegação com ID real;
  - cache visível durante atualização e ausência de requests redundantes;
  - testes nunca acessam API real nem usam `page.route`.
- Quality gates após a implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`, por endpoints, wiring e MongoDB;
  - `pnpm test:integration`, pelos novos cenários de rota e flow.

## Riscos e decisões

- Embutir workouts e exercícios oferece leitura única do aggregate e mutações
  atômicas por plano, mas o documento pode crescer até o limite do MongoDB. Esta
  entrega aceita o trade-off; limites, arquivamento ou separação futura exigirão
  nova decisão antes que o volume real se aproxime desse limite.
- Um índice por proprietário e criação atende a listagem global e prepara planos
  pessoais sem introduzir `ownerType`. Persistir `null` explicitamente evita que
  campo ausente adquira semântica ambígua.
- Usar nomes genéricos no domínio não significa criar endpoints genéricos. A
  fronteira desta entrega continua estritamente global e administrativa.
- Atualização otimista pode divergir diante de mutações concorrentes. Cancelamento,
  snapshot, rollback, substituição pela response e invalidação ao final reduzem a
  janela sem ocultar conflito por mensagem técnica.
- Criar workout antes de possuir ID real causaria rota inválida e reconciliação
  complexa. Por isso, a operação mostra loading, espera a response e só então
  atualiza cache e navega.
- Inserir plano novo na página atual quebraria a ordenação por criação. A criação
  leva a UI à página 1 e inclui essa navegação no mesmo snapshot de rollback.
- A listagem de workouts sem paginação pode crescer. A decisão acompanha o aggregate
  e a request única exigidos pela issue; paginação ou resumo separado exigirá nova
  feature e contrato.
- Um `403` ainda pode ocorrer depois que a UI carregou uma pessoa administradora,
  caso o privilégio seja revogado. A mutation realiza rollback e não trata a
  proteção visual como garantia de autorização; a próxima revalidação da pessoa
  aplica o redirect administrativo vigente.
- Toast é transitório e não substitui estados persistentes, validação de campo nem
  foco. Um único provider global evita filas e regiões vivas duplicadas.
- O stub de workout usa o detalhe do plano para breadcrumb e membership. Criar um
  GET isolado de workout nesta demanda violaria o limite de API definido pela
  issue.
- A definição do array de exercícios permanece vazia e não usa payload genérico de
  escrita. A feature futura deve introduzir tipos e validação antes do primeiro
  exercício persistido.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Sete endpoints e três rotas implementados sem CRUD adicional
- Proteções administrativa da API e UI aplicadas sem requests redundantes
- Contratos compartilhados, produtor e consumidores atualizados atomicamente
- Coleção única, ownership nulo explícito, índice e aggregate embutido validados
- Paginação fixa de 20 e projeções sem workouts/exercícios desnecessários
- Atualizações otimistas, snapshots, rollbacks e respostas canônicas consistentes
- Criação de workout somente com ID real do backend
- Breadcrumbs, menu administrativo, formulários e ações acessíveis com HeroUI
- SDDs vivos de base, endpoint, rotas, fluxo e ADR afetados atualizados
- MSW, unitários, E2E e Playwright cobrindo caminhos felizes e falhas relevantes
- Nenhum screenshot exigido na ausência de referências visuais
- Revisão de código sem uso concluída em `api/` e `ui/`
- Quality gates da raiz, E2E da API e testes integrados da UI aprovados
