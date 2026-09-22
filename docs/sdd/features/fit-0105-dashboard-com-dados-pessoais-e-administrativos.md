# Feature Spec: Dashboard com dados pessoais e administrativos

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0105`.
- Problema: a rota autenticada `/dash` oferece identidade e navegação, mas sua
  região principal é intencionalmente vazia. A pessoa não encontra na entrada da
  aplicação uma orientação sobre a próxima ação nem uma síntese de sua atividade;
  administradores também não possuem uma visão agregada de adoção e uso do
  produto.
- Resultado: `/dash` torna-se uma visão útil e acionável. Toda pessoa autenticada
  vê sua próxima ação, progresso da semana, síntese dos últimos 30 dias, tendência
  das últimas oito semanas e atividades recentes. Administradores veem exatamente
  essa mesma experiência e, abaixo dela, indicadores exclusivamente agregados de
  pessoas, treinos e planos.
- Referências:
  - [`ui/docs/sdd/routes/dash.md`](../../../ui/docs/sdd/routes/dash.md);
  - [`ui/docs/sdd/routes/training.md`](../../../ui/docs/sdd/routes/training.md);
  - [`ui/docs/sdd/routes/training-completion.md`](../../../ui/docs/sdd/routes/training-completion.md);
  - [`api/docs/sdd/endpoints/training.md`](../../../api/docs/sdd/endpoints/training.md);
  - [`docs/sdd/flows/execucao-de-treino.md`](../flows/execucao-de-treino.md);
  - [`docs/sdd/base/03-contratos-compartilhados.md`](../base/03-contratos-compartilhados.md);
  - [`ui/docs/sdd/base/03-componentes-e-estilizacao.md`](../../../ui/docs/sdd/base/03-componentes-e-estilizacao.md);
  - catálogo oficial do HeroUI v3, em especial `Card`, `Meter`, `Table`,
    `Skeleton`, `Alert`, `Button` e `Typography`.
- Features relacionadas:
  - [`FIT-0004`](fit-0004-autorizacao-administrativa.md), que definiu
    `Person.isAdmin` e a fronteira administrativa;
  - [`FIT-0061`](fit-0061-redirecionar-autenticado-raiz-dash.md), que consolidou
    `/dash` como entrada privada;
  - [`FIT-0070`](fit-0070-fluxo-treinar.md), que introduziu o histórico durável de
    execuções usado pelos indicadores.

## Escopo

### Incluído

- preencher a região principal de `/dash` para pessoas comuns e administradoras;
- criar uma leitura autenticada de dashboard pessoal, filtrada pela pessoa da
  sessão;
- criar uma leitura administrativa separada, protegida por `AdminOnly`, contendo
  somente valores agregados;
- determinar uma ação principal contextual entre selecionar plano, iniciar o
  próximo workout e retomar o workout em andamento;
- apresentar progresso da semana civil atual no timezone do navegador;
- apresentar indicadores pessoais fixos dos últimos 30 dias;
- apresentar a quantidade de workouts concluídos em cada uma das oito semanas
  civis mais recentes, incluindo a atual;
- apresentar as cinco conclusões pessoais mais recentes, com navegação para o
  resumo durável correspondente;
- apresentar a administradores indicadores agregados de pessoas, atividade de
  treino e adoção de planos;
- apresentar a administradores os cinco modelos globais mais utilizados, sem
  identificar as pessoas vinculadas;
- adicionar contratos compartilhados de response em `@dall-fit/types`;
- adicionar handlers e fixtures MSW para os dois endpoints e seus estados;
- adicionar seeds e cURLs reproduzíveis para os cenários dos endpoints;
- atualizar testes unitários, E2E da API e integrados da UI proporcionais ao risco;
- substituir as referências visuais vigentes de `/dash` nos estados desktop e
  mobile por novas referências aprovadas que incluam o conteúdo da rota.

### Não incluído

- filtros, seletor de período ou intervalo personalizado; os períodos são fixos;
- sequência diária ou semanal, medalhas, pontos, ranking ou outra gamificação;
- metas configuráveis de treino, calorias, peso corporal, medidas, sono ou dados
  de saúde que o produto não coleta;
- comparação entre pessoas ou entre a pessoa atual e a base;
- nomes, e-mails, fotos, IDs de pessoa, ranking individual, drill-down por pessoa
  ou lista de atividade individual na área administrativa;
- usar pageviews do Vercel Analytics como fonte de usuários ativos; nesta feature,
  atividade significa conclusão de treino persistida pela aplicação;
- histórico completo com paginação, busca ou filtros; a dashboard mostra somente
  as cinco conclusões pessoais mais recentes;
- alterar a jornada de execução, o cálculo de uma conclusão ou os dados gravados
  em `workout_executions`;
- gráficos de carga, evolução por exercício ou comparação de pesos, pois o
  histórico vigente conserva resumo por execução e somente o último perfil de
  cargas;
- instalar biblioteca de gráficos. A tendência será uma composição acessível com
  primitives do HeroUI e estilização própria já permitida pelo projeto;
- polling contínuo, websocket adicional ou novo evento SSE;
- tornar a dashboard utilizável offline no Web/PWA ou no Android. As regras de
  conectividade e de redirecionamento nativo vigentes continuam soberanas;
- criar screenshots além da matriz visual representativa descrita nesta feature.

## Decisões de produto confirmadas

1. A área administrativa contém somente agregados. Nenhum dado identifica uma
   pessoa nem permite abrir seu histórico.
2. Os períodos são fixos: semana atual, últimos 30 dias e tendência das últimas
   oito semanas. Não há controle de data.
3. A dashboard não apresenta streak. Consistência é comunicada pelo progresso da
   semana e pela tendência semanal, sem penalizar pausas ou pressupor treino diário.
4. “Pessoa ativa” é definida por treino concluído, não por login ou pageview.
5. Administradores recebem a mesma dashboard pessoal das demais pessoas; o bloco
   administrativo é adicional e não substitui nem altera os dados pessoais.

## Projetos e documentação afetados

- API e endpoints:
  - novo endpoint pessoal `GET /dashboard`;
  - novo endpoint administrativo `GET /admin/dashboard`;
  - novo documento vivo `api/docs/sdd/endpoints/dashboard.md`;
  - atualização de `api/docs/sdd/base/01-arquitetura.md` somente para registrar o
    novo módulo/read model e suas dependências efetivas;
  - o endpoint `training` mantém seus paths e respostas, mas seu service/calendário
    semanal pode ser extraído para reutilização sem mudar comportamento.
- UI e rotas:
  - alteração de conteúdo, estados e integração de `/dash` em
    `ui/docs/sdd/routes/dash.md`;
  - atualização do catálogo de Analytics em
    `ui/docs/sdd/base/01-arquitetura.md` para as novas ações e retries;
  - atualização das duas referências em `ui/docs/sdd/routes/assets/dash/` depois
    da implementação e da aprovação visual do novo layout.
- Fluxos:
  - `docs/sdd/flows/execucao-de-treino.md`, pois a dashboard passa a oferecer
    entradas contextuais para seleção, início, retomada e consulta de conclusões.
- Contratos em `@dall-fit/types`:
  - `DashboardResponse` e estruturas pessoais;
  - `AdminDashboardResponse` e estruturas agregadas administrativas;
  - datas civis são strings `YYYY-MM-DD`; instantes continuam ISO 8601.
- Decisões arquiteturais: não se aplica novo ADR. São adicionados endpoints de
  leitura e read models locais sobre coleções vigentes, sem alterar autoridade,
  persistência ou fronteiras entre projetos.
- Handlers e fixtures MSW: novos handlers e fixtures de dashboard com pessoa sem
  histórico, pessoa com histórico, sessão em andamento, falha pessoal, admin com
  agregados e falha exclusiva do bloco administrativo.
- Mocks de repositories/caches nos unitários da API: ports do read model e da
  resolução de contexto de treino serão substituídas por mocks Vitest tipados.
- Fixtures MongoDB/Redis nos E2E: pessoas, planos, seleção ativa, sessão Redis e
  execuções concluídas mínimas e determinísticas para validar isolamento,
  timezone, agregações e autorização.

## Contratos pretendidos

### `GET /dashboard?timezone=<IANA>`

- autenticação: `Authenticated`, por cookie Web ou Bearer nativo;
- entrada: query obrigatória `timezone`, entre 1 e 100 caracteres e válida para
  `Intl.DateTimeFormat`; a UI envia
  `Intl.DateTimeFormat().resolvedOptions().timeZone`;
- sucesso: `200 DashboardResponse`, `Cache-Control: private, no-store`;
- a pessoa é sempre derivada da sessão; nenhum ID de pessoa é aceito na query;
- erros preservam o contrato `ApiError`; timezone ausente/malformado responde
  `400 VALIDATION_ERROR`, e timezone estruturalmente válido mas desconhecido
  responde `400 DASHBOARD_TIMEZONE_INVALID`;
- a response contém:
  - `generatedAt`: instante ISO usado como referência comum do cálculo;
  - `nextAction`: união discriminada:
    - `select-plan`, sem identificadores, quando não existe plano ativo;
    - `start-workout`, com plano, workout seguinte e `catalogEntryId`, quando há
      plano ativo e nenhuma sessão;
    - `resume-workout`, com plano e workout da sessão, quando existe sessão em
      andamento;
  - `currentWeek`: segunda-feira e domingo em datas civis, sete dias ordenados,
    quantidade concluída e quantidade de workouts do plano ativo ou `null` quando
    não há plano;
  - `last30Days`: quantidade de workouts concluídos, duração total em segundos,
    quantidade de conclusões completas e percentual inteiro de conclusão completa;
  - `weeklyTrend`: exatamente oito semanas ordenadas da mais antiga para a atual,
    cada qual com início, fim e quantidade concluída, incluindo zeros;
  - `recentWorkouts`: no máximo cinco conclusões ordenadas por `completedAt` e ID
    decrescentes, contendo somente ID da execução, nomes capturados de plano e
    workout, instante, duração, contagens de exercícios, conclusão completa e áreas
    do corpo.

### `GET /admin/dashboard?timezone=<IANA>`

- autenticação e autorização: `AdminOnly`; pessoa comum recebe o erro administrativo
  vigente e nenhum agregado;
- entrada, validação de timezone, cache e contrato de erro seguem o endpoint
  pessoal;
- sucesso: `200 AdminDashboardResponse` com:
  - `generatedAt`;
  - `people`: total de pessoas cadastradas, cadastros nos últimos 30 dias, pessoas
    com plano ativo no momento e pessoas distintas com ao menos um treino concluído
    nos últimos 30 dias;
  - `training`: total de conclusões, duração total em segundos, conclusões
    completas e percentual inteiro de conclusão completa nos últimos 30 dias;
  - `weeklyTrend`: oito semanas com quantidade de conclusões e quantidade de
    pessoas distintas que concluíram treino em cada semana;
  - `plans`: quantidade atual de modelos globais, planos próprios no catálogo,
    referências globais no catálogo e seleções ativas;
  - `topGlobalPlans`: no máximo cinco modelos globais ordenados por pessoas com a
    referência ativa, depois pessoas vinculadas, nome e ID; cada item contém apenas
    ID/nome do modelo e as duas contagens agregadas.

### Semântica temporal e numérica

- semana civil começa na segunda-feira e termina no domingo;
- “últimos 30 dias” significa o intervalo desde `00:00` do 29º dia civil anterior
  até `00:00` do dia civil seguinte, no timezone informado; não significa 720
  horas retroativas;
- a tendência inclui a semana atual parcial e as sete anteriores;
- uma execução pertence ao período por `completedAt` e só conta quando possui
  `status: completed`;
- duração é a soma de `durationSeconds`; não é convertida nem arredondada na API;
- percentual de conclusão completa é arredondado ao inteiro mais próximo e vale
  zero quando não existem conclusões;
- uma pessoa é contada uma única vez por período, ainda que conclua vários treinos;
- a semana pessoal marca um dia como concluído quando existe ao menos uma conclusão
  naquele dia e conserva a contagem total separadamente;
- todos os limites UTC são calculados a partir das datas civis no timezone, de modo
  compatível com horário de verão. A implementação reutiliza ou extrai a lógica
  temporal já exercitada no resumo semanal do domínio de treino; não mantém dois
  algoritmos divergentes.

## Arquitetura pretendida da API

- um módulo de dashboard possui controller, commands, services e port de read
  model próprios;
- o controller valida query, registra entrada segura, chama o command proprietário
  e devolve sua response;
- o command pessoal orquestra o contexto de treino e as métricas históricas; o
  command administrativo orquestra somente serviços agregadores autorizados;
- services concentram cálculo temporal, percentuais e composição dos dados e
  acessam persistência somente por repositories;
- o adapter MongoDB usa projeções e agregações server-side; não carrega todos os
  documentos para contar em memória;
- a resolução da sessão em andamento e do próximo workout reutiliza uma interface
  pública coesa do domínio de treino, sem permitir que command/controller acessem
  Redis ou repositories de outro módulo;
- os índices necessários às leituras por `completedAt`, criação de pessoa, tipo de
  catálogo e demais filtros agregados são definidos e validados na implementação.
  A especificação não autoriza collection scan como estratégia permanente;
- todos os métodos novos ou alterados seguem integralmente a política de logging,
  resumindo apenas IDs técnicos, períodos e contagens. Nenhum log contém nome de
  pessoa, e-mail, nome de plano/workout, timezone bruto não validado ou lista de
  execuções.

## Requisitos funcionais da UI

1. Depois que o shell autenticado conclui pessoa e CSRF, `/dash` consulta o endpoint
   pessoal com o timezone do navegador.
2. A região principal possui heading `Visão geral` e saudação neutra sem repetir
   nome, e-mail ou foto já exibidos no menu.
3. O primeiro bloco é `Próximo treino` e contém exatamente uma ação dominante:
   - `Escolher um plano` navega para `/training-plan` em `select-plan`;
   - `Começar treino` navega para `/training/workout/:workoutId` em
     `start-workout`;
   - `Retomar treino` navega para o mesmo path em `resume-workout`.
4. Os estados de iniciar e retomar mostram nomes do plano e workout. O estado sem
   plano explica brevemente que um plano precisa ser escolhido, sem tratar a
   ausência como erro.
5. `Esta semana` apresenta sete dias de segunda a domingo, marca os dias com ao
   menos uma conclusão e informa textualmente `X treinos concluídos`.
6. Quando existe plano ativo, o mesmo card informa `X de Y treinos`; `Y` representa
   a quantidade vigente de workouts do plano e funciona como referência do ciclo,
   não como prescrição clínica nem obrigação semanal. Sem plano, não mostra
   denominador.
7. `Últimos 30 dias` apresenta três indicadores: treinos concluídos, tempo total de
   treino formatado em horas/minutos e taxa de conclusões completas. Volume de
   carga não é usado como KPI geral porque planos de duração podem não possuir
   carga.
8. `Ritmo de treino` apresenta as oito contagens semanais por uma lista
   cronológica de barras/meters. Cada item possui rótulo de período e valor textual;
   cor, comprimento e posição não são as únicas fontes da informação.
9. `Atividades recentes` apresenta até cinco conclusões. Cada linha mostra workout,
   plano, data/hora local, duração e estado completo/parcial, e é um link para
   `/training/completion/:workoutExecutionId`.
10. Sem nenhuma conclusão, os indicadores exibem zero, a tendência mantém oito
    períodos zerados e a lista é substituída por uma mensagem útil. A ação
    principal continua disponível.
11. Administradores consultam adicionalmente `GET /admin/dashboard` e recebem,
    depois de todo o conteúdo pessoal, a seção `Visão administrativa`.
12. A seção administrativa possui:
    - cards de total de pessoas, novas nos últimos 30 dias, com plano ativo e que
      treinaram nos últimos 30 dias;
    - cards de treinos concluídos, tempo total e taxa de conclusão completa nos
      últimos 30 dias;
    - tendência de oito semanas com treinos e pessoas ativas;
    - resumo atual de modelos globais, planos próprios, referências globais e
      seleções ativas;
    - tabela `Modelos mais utilizados` com nome, pessoas vinculadas e pessoas que
      mantêm o modelo ativo.
13. Pessoa comum não chama o endpoint administrativo e não recebe skeleton, heading,
    espaço reservado nem indicação de conteúdo oculto.
14. Falha do endpoint pessoal substitui somente o conteúdo da rota por erro
    recuperável com `Tentar novamente`; o shell e menu permanecem utilizáveis.
15. Falha do endpoint administrativo preserva toda a dashboard pessoal e apresenta
    erro/retry apenas dentro da seção administrativa.
16. Requests são canceladas ao sair da rota ou encerrar a geração da sessão;
    callbacks tardios não escrevem cache, toast ou Analytics em outra geração.
17. As queries usam os padrões vigentes de leitura: um retry apenas para falhas
    transitórias permitidas, `staleTime` explícito de um minuto e refetch ao
    recuperar conexão ou focar uma dashboard stale, sem polling.
18. Após concluir um treino na mesma geração, o sucesso invalida as queries de
    dashboard pessoal e, quando a pessoa é admin, administrativa. Abrir `/dash`
    depois da conclusão não pode reapresentar métricas anteriores confirmadas.

## Composição visual e responsividade

- componentes do HeroUI são usados antes de qualquer equivalente local: `Card`
  agrupa seções, `Meter` sustenta valores proporcionais quando adequado, `Table`
  apresenta modelos administrativos, `Skeleton` preserva a estrutura de loading,
  `Alert` representa falhas e `Button`/`Typography` preservam ações e hierarquia;
- não existe componente de chart no HeroUI vigente. A visualização de tendência é
  uma composição de domínio sem biblioteca adicional, com dados textuais acessíveis;
- toda estilização própria fica em `styles.ts`, por `tv` de `@heroui/styles`; JSX
  não contém classes Tailwind literais nem estilos inline;
- a dashboard usa uma única coluna abaixo de `768px`. Cards, barras e listas ocupam
  a largura disponível; a tabela administrativa usa o scroll container oficial e
  não amplia o viewport;
- a partir de `768px`, o conteúdo usa largura máxima legível, ação e progresso
  semanal podem dividir a primeira linha, e os KPIs formam grids responsivos sem
  mudar a ordem semântica;
- a seção administrativa começa em nova região com heading próprio e separação
  inequívoca, mas usa os mesmos tokens e linguagem visual da seção pessoal;
- o novo conteúdo não altera largura, posição, comportamento ou breakpoint do
  menu autenticado já documentado;
- as referências visuais curadas representam: dashboard administrativa desktop em
  `1440x900` com menu persistente e dashboard administrativa mobile em `390x844`
  com o menu aberto. A captura mobile pode exigir rolagem da página para registrar
  o conteúdo, mas o drawer conserva sua referência de layout e não precisa exibir
  simultaneamente toda a dashboard sob o backdrop.

## Requisitos não funcionais

- Acessibilidade:
  - headings formam hierarquia contínua e landmarks distinguem conteúdo pessoal e
    administrativo;
  - indicadores possuem rótulo e valor textual, sem depender apenas de cor;
  - a tendência expõe as oito semanas em ordem legível a tecnologias assistivas;
  - tabela possui nome acessível, cabeçalhos corretos e coluna de nome como row
    header;
  - loading possui nome acessível, erro move foco somente quando substitui o
    conteúdo após uma ação explícita de retry, e links/botões mantêm foco visível;
  - datas e durações recebem texto localizado compreensível sem substituir o
    instante canônico no contrato.
- Performance:
  - cada endpoint executa número limitado e previsível de consultas/agregações;
  - listas são limitadas a cinco itens e tendências a oito buckets;
  - agregações filtram e projetam no MongoDB, apoiadas por índices compatíveis;
  - endpoint pessoal e administrativo podem carregar em paralelo depois da
    autenticação, e falha de um não bloqueia o outro;
  - nenhuma biblioteca de gráficos é adicionada ao bundle.
- Segurança e privacidade:
  - o endpoint pessoal deriva o escopo da sessão;
  - o endpoint administrativo aplica `AdminOnly` na API e proteção visual não o
    substitui;
  - agregados administrativos nunca incluem PII ou ID de pessoa;
  - respostas são privadas e não entram no precache/runtime cache da PWA;
  - nomes históricos de plano/workout aparecem somente ao proprietário da execução;
  - fixtures e screenshots usam dados totalmente fictícios.
- Observabilidade:
  - logs registram períodos, contagens, branches e duração lógica das etapas sem
    payloads ou conteúdo pessoal;
  - não são adicionadas métricas externas nem tracing distribuído;
  - erros mantêm `requestId` e o contrato global.

## Analytics

- abrir `/dash` continua sendo coberto pelo pageview automático, sem evento customizado;
- a ação principal emite `ui_navigation_selected` com destinos enumerados
  `training_plans`, `training_start` ou `training_resume` e
  `navigation_kind: dashboard_action`;
- ativar uma atividade recente emite o mesmo evento com destino
  `training_completion` e `navigation_kind: row_link`;
- retries pessoal e administrativo emitem `ui_retry_requested` com resources
  distintos `dashboard` e `admin_dashboard`;
- carregamento automático, leitura de métricas e renderização de gráficos não
  emitem eventos;
- nenhum evento recebe contagem, período, timezone, tipo de pessoa, nome de plano,
  nome de workout, execução ou qualquer agregado administrativo.

## Critérios de aceite

### Cenário 1 — Pessoa sem plano e sem histórico

- Forma de validar:
  `http://localhost:3000/dash?mockDashboard=empty` com MSW habilitado.
- Given: a pessoa autenticada não possui seleção ativa, sessão ou conclusão.
- When: a dashboard pessoal conclui o carregamento.
- Then: mostra `Escolher um plano`, semana e KPIs zerados, oito semanas zeradas e
  estado vazio de atividades recentes.
- And: não mostra seção administrativa.

### Cenário 2 — Pessoa com próximo workout e histórico

- Forma de validar:
  `http://localhost:3000/dash?mockDashboard=personal` com MSW habilitado.
- Given: existe plano ativo, não existe sessão e há conclusões nos períodos fixos.
- When: a dashboard carrega.
- Then: `Começar treino` aponta para o workout seguinte e todos os indicadores,
  tendência e cinco atividades refletem exatamente a fixture.
- And: ativar uma atividade abre seu resumo durável sem reload do documento.

### Cenário 3 — Sessão em andamento prevalece

- Forma de validar:
  `http://localhost:3000/dash?mockDashboard=session-running` com MSW habilitado.
- Given: existe sessão em andamento para um workout do snapshot capturado.
- When: o endpoint resolve a ação seguinte.
- Then: mostra `Retomar treino` para o workout da sessão, ainda que a seleção ativa
  tenha sido alterada depois do início.

### Cenário 4 — Semana e períodos respeitam timezone

- Forma de validar: cenário E2E do endpoint documentado em
  `api/docs/sdd/endpoints/dashboard.md`, com seed e cURL.
- Given: existem conclusões próximas à meia-noite local, ao limite de segunda-feira
  e a uma transição de horário de verão.
- When: `GET /dashboard` recebe o timezone do cenário.
- Then: cada conclusão pertence ao dia, semana e janela de 30 dias corretos, sem
  duplicidade ou perda.

### Cenário 5 — Isolamento do histórico pessoal

- Forma de validar: cenário E2E do endpoint documentado em
  `api/docs/sdd/endpoints/dashboard.md`, com seed e cURL.
- Given: duas pessoas possuem conclusões no mesmo período.
- When: uma delas consulta `GET /dashboard`.
- Then: métricas e lista contêm somente suas execuções, sem dado ou contagem da
  outra pessoa.

### Cenário 6 — Administrador vê conteúdo pessoal e agregado

- Forma de validar:
  `http://localhost:3000/dash?mockAuth=admin&mockDashboard=admin` com MSW habilitado.
- Given: os dois endpoints respondem com fixtures determinísticas.
- When: a dashboard administrativa carrega.
- Then: todo o conteúdo pessoal aparece primeiro e `Visão administrativa` aparece
  depois com pessoas, treino, tendência, planos e a tabela dos cinco modelos.
- And: nenhum nome, e-mail, foto ou ID de pessoa aparece na seção administrativa.

### Cenário 7 — Pessoa comum não acessa agregados administrativos

- Forma de validar: cenário E2E de `GET /admin/dashboard` documentado com seed e
  cURL, e `http://localhost:3000/dash?mockDashboard=personal` na UI.
- Given: a sessão pertence a uma pessoa não administradora.
- When: o endpoint administrativo é chamado diretamente e a dashboard pessoal é
  renderizada normalmente.
- Then: a API responde `403 ADMIN_ACCESS_REQUIRED`, e a UI comum não realiza essa
  request nem reserva espaço para a seção.

### Cenário 8 — Falha pessoal preserva o shell

- Forma de validar:
  `http://localhost:3000/dash?mockDashboard=personal-error` com MSW habilitado.
- Given: pessoa e CSRF já foram confirmados, mas `GET /dashboard` falha.
- When: a rota apresenta o erro.
- Then: menu e identidade permanecem disponíveis, o conteúdo mostra erro e
  `Tentar novamente`, e o retry bem-sucedido substitui o erro pelos dados.

### Cenário 9 — Falha administrativa é isolada

- Forma de validar:
  `http://localhost:3000/dash?mockAuth=admin&mockDashboard=admin-error` com MSW.
- Given: a leitura pessoal teve sucesso e a administrativa falhou.
- When: ambas terminam.
- Then: a dashboard pessoal permanece íntegra e somente `Visão administrativa`
  mostra erro e retry.

### Cenário 10 — Conclusão invalida a dashboard

- Forma de validar: Playwright no fluxo de execução de treino com MSW Browser.
- Given: uma dashboard pessoal anterior está no cache da geração atual.
- When: a pessoa conclui um treino e volta para `/dash`.
- Then: semana, últimos 30 dias, tendência e atividades recentes incluem a nova
  conclusão sem esperar o `staleTime` anterior.

### Cenário 11 — Layout responsivo e tabela administrativa

- Forma de validar:
  `http://localhost:3000/dash?mockAuth=admin&mockDashboard=admin` com MSW, em
  `390x844`, `768x1024` e `1440x900`.
- Given: todos os blocos possuem valores representativos e nomes longos fictícios.
- When: o viewport muda entre os três tamanhos.
- Then: ordem semântica é preservada, cards reorganizam sem corte, tabela usa seu
  próprio scroll quando necessário e a página não cria rolagem horizontal.

### Cenário 12 — Tendência compreensível sem percepção de cor

- Forma de validar: teste de componente e conferência manual da rota mockada.
- Given: as oito semanas contêm valores zero, intermediários e máximo.
- When: a visualização é lida visualmente ou por tecnologia assistiva.
- Then: cada semana possui período e contagem textual; ocultar cores ou ignorar a
  forma das barras não elimina a informação.

## Estados da rota

- Loading pessoal: skeletons para ação, semana, três KPIs, tendência e lista, com
  nome acessível único `Carregando sua visão geral`.
- Sucesso sem histórico: conteúdo acionável com métricas zero; não é erro.
- Sucesso pessoal: todos os blocos pessoais, sem área admin.
- Sucesso administrativo: sucesso pessoal acrescido da seção administrativa.
- Erro pessoal: estado recuperável dentro de `main`, com shell preservado.
- Loading administrativo: skeletons somente após o heading administrativo; não
  bloqueia os blocos pessoais.
- Erro administrativo: alerta e retry locais; dados pessoais permanecem visíveis.
- Sem conexão Web/PWA: a barreira global vigente continua substituindo toda a
  árvore; nenhum estado desta feature é renderizado.
- Android obsoleto ou offline fora da jornada permitida: os guards nativos vigentes
  prevalecem antes da dashboard.

## Estratégia de entrega e compatibilidade

- ambos os endpoints são aditivos e não modificam responses vigentes;
- os contratos entram em `@dall-fit/types` junto com produtor, consumidores e
  fixtures;
- índices MongoDB novos são aplicados pelo mecanismo operacional vigente e
  incluídos no comando de índices; não há migração destrutiva nem reescrita de
  documentos existentes;
- documentos antigos de `workout_executions` já possuem os campos necessários;
- a UI só passa a consultar os endpoints quando o novo bundle estiver publicado;
  ordem de deploy API antes da UI evita `404` transitório;
- não há feature flag. Uma falha administrativa é isolada e nunca degrada a parte
  pessoal para um admin;
- as referências visuais antigas da rota descrevem a região principal vazia e
  precisam ser substituídas, não mantidas como histórico, durante a implementação.

## Plano de testes

### API unitária

- comandos: montagem dos contratos, branches das três ações e isolamento entre
  pessoal/admin;
- calendário: segunda-feira, virada de mês/ano, horário de verão, oito buckets,
  intervalo civil de 30 dias e timezone inválido;
- service pessoal: vazio, histórico, conclusão parcial/completa, ordenação e limite
  de recentes, percentual zero e arredondamento;
- service administrativo: pessoas distintas, agregados vazios, percentuais,
  contagens atuais de planos e desempate do top cinco;
- controllers: validação, chamada ao command, resposta e aplicação das proteções;
- repositories substituídos nos services e services substituídos nos commands,
  conforme a arquitetura vigente.

### API E2E

- `GET /dashboard` com pessoa sem plano, próximo workout, sessão em andamento,
  histórico em limites temporais e isolamento entre pessoas;
- `GET /admin/dashboard` com admin, pessoa comum e sessão ausente;
- agregações reais sobre MongoDB efêmero e contexto de sessão real no Redis
  efêmero;
- respostas no contrato, `Cache-Control`, `x-request-id`, erros e nenhum campo
  pessoal nos agregados;
- índices novos presentes e queries funcionais com as collections reais;
- seeds idempotentes e cURLs de todos os cenários documentados.

### UI com Vitest

- services enviam timezone, propagam `AbortSignal` e classificam erros sem usar
  mensagens;
- query keys separam pessoal/admin e callbacks respeitam geração da sessão;
- ação contextual navega para os três destinos corretos;
- formatação de duração, datas e percentuais;
- semana, tendência e KPIs em vazio/sucesso;
- lista recente e link para conclusão;
- seção admin ausente para pessoa comum, presente para admin e sem PII;
- erro/retry pessoal e isolamento do erro/retry administrativo;
- semântica acessível de headings, meters/barras e tabela;
- invalidação após conclusão.

### UI integrada com Playwright

- cenários 1, 2, 3, 6, 8, 9, 10 e 11 pelos handlers MSW Browser;
- requests administrativas ausentes para pessoa comum;
- navegação da ação principal e da atividade recente;
- loading observável por latência do handler, retry real pelo cliente HTTP e
  preservação do shell;
- responsividade e ausência de overflow nos viewports definidos;
- atualização das capturas curadas de `/dash` somente após inspeção das candidatas.

### Gates

- `pnpm lint`;
- `pnpm test`;
- `pnpm test:coverage:ci`;
- `pnpm build`;
- `pnpm -C api test:e2e`;
- `pnpm test:integration`.

## Riscos e decisões

- O número de workouts do plano não é uma meta semanal configurada. A UI usa o
  denominador como referência do ciclo atual e evita linguagem de obrigação.
- Somar carga seria inadequado como KPI transversal para cardio, pausas e
  atividades por duração; por isso a dashboard geral privilegia frequência,
  tempo e conclusão.
- “Ativo” é um termo ambíguo. A seção administrativa usa o rótulo explícito
  `Treinaram nos últimos 30 dias` e define a métrica por execução concluída; não
  infere acesso a partir de `updatedAt` da pessoa.
- Percentuais com bases pequenas podem sugerir precisão excessiva. A UI sempre
  mantém a contagem relacionada próxima e não cria comparação, meta ou cor de
  sucesso/fracasso para a taxa.
- Agregações administrativas sem índice podem degradar com o crescimento. A
  implementação deve revisar planos de consulta e adicionar índices concretos
  antes da entrega, sem carregar coleções inteiras na memória da aplicação.
- Timezone do browser pode estar ausente ou adulterado. A UI usa o timezone IANA
  resolvido pelo runtime e trata rejeição como erro recuperável; a API valida e
  nunca usa o valor para compor query ou log inseguro.
- A sessão Redis pode representar uma árvore anterior à seleção atual. A ação
  `resume-workout` preserva a autoridade do snapshot da sessão, como já ocorre em
  `GET /training`.
- O endpoint administrativo pode falhar por uma agregação mais cara enquanto a
  leitura pessoal funciona. Queries e estados separados impedem que isso retire a
  utilidade principal da dashboard.
- Um gráfico customizado complexo criaria custo de acessibilidade e manutenção. A
  tendência desta entrega usa composição simples, valores textuais e primitives
  oficiais, sem interação, tooltip ou dependência de charts.
- As referências atuais mostram a região principal vazia. Elas serão substituídas
  somente durante a implementação, após a nova verdade estar implementada; esta
  fase de especificação não altera screenshots nem SDD vivo.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Quality gates da raiz aprovados
