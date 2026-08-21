# Feature Spec: Planos de treino pessoais, referências globais e clonagem durável

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0058`](https://github.com/eduardodallmann/dall-fit/issues/58).
- Problema: a árvore reutilizável de planos, workouts e exercícios existe somente
  na gestão global administrativa. Pessoas comuns ainda não possuem um catálogo
  próprio no qual possam criar planos, acompanhar um plano global sem duplicá-lo ou
  clonar integralmente um modelo global para editá-lo. Reaproveitar a implementação
  apenas por flags vindas da request confundiria autorização global e ownership
  pessoal; duplicar controllers, domínio e telas inteiras aumentaria divergência e
  regressões. A clonagem de mídia privada também não cabe com segurança no ciclo de
  uma única request nem pode expor um plano parcialmente materializado.
- Resultado: toda pessoa autenticada possui uma jornada própria de planos; planos
  criados ou clonados pertencem à pessoa e são editáveis, referências a globais
  acompanham o conteúdo global e permanecem somente leitura, e a clonagem ocorre
  duravelmente por Vercel Workflow em uma aplicação Nitro própria, publicada como
  projeto Vercel separado, sobre um job visível e não navegável. A pessoa escolhe
  no máximo um item ativo por radio, mas pode permanecer sem plano ativo. A
  administração global continua em fronteira própria e passa a enxergar quantas
  pessoas estão vinculadas e quantas mantêm cada global ativo antes de editar ou
  excluir.
- Decisão arquitetural consolidada, chamada de plano C nesta demanda:
  - manter os endpoints e as rotas globais administrativos separados dos pessoais;
  - criar controllers, commands e loaders próprios para cada fronteira de
    autorização;
  - reutilizar serviços, repositories, contratos internos e componentes de
    apresentação por meio de escopos e modos discriminados;
  - derivar `global`, `owned` e `global-reference` exclusivamente da rota, sessão e
    persistência, nunca de `isGlobal`, `ownerPersonId` ou capability enviado pelo
    cliente;
  - não criar uma matriz genérica de `TrainingPlanCapabilities`: a UI compõe o
    comportamento pelo discriminador do item. A remoção de uma referência é uma
    operação do catálogo, independente da permissão de editar o conteúdo global.
- Referências locais:
  - `docs/sdd/adr/ADR-0003-modelagem-dos-planos-de-treino.md`;
  - `docs/sdd/adr/ADR-0005-limites-concorrencia-e-midia-dos-planos.md`;
  - `docs/sdd/adr/ADR-0007-blob-privado-oidc-e-urls-assinadas.md`;
  - `docs/sdd/adr/ADR-0008-sse-e-invalidacao-realtime.md`;
  - `docs/sdd/features/fit-0005-gestao-planos-treino-globais.md`;
  - `docs/sdd/features/fit-0028-editor-exercicios-escalabilidade-concorrencia.md`;
  - `docs/sdd/features/fit-0030-paginacao-recuperacao-concorrencia-planos.md`;
  - `docs/sdd/features/fit-0032-atualizacao-tempo-real-sse.md`;
  - `docs/sdd/features/fit-0044-migrar-imagens-exercicios-blob-privado-oidc.md`;
  - `docs/sdd/features/fit-0046-melhorias-visuais-editor-exercicios.md`;
  - `docs/sdd/features/fit-0059-aprimoramentos-midia-editor-fechamento-menu.md`;
  - `docs/sdd/flows/gestao-planos-treino-globais.md`;
  - `api/docs/sdd/endpoints/global-training-plans.md`;
  - `api/docs/sdd/endpoints/realtime-events.md`;
  - `ui/docs/sdd/routes/global-training-plan.md`;
  - `ui/docs/sdd/routes/global-training-plan-detail.md`;
  - `ui/docs/sdd/routes/global-training-plan-workout.md`.
- Referências oficiais consultadas no planejamento:
  - Vercel Workflow estável e execução durável:
    [visão geral](https://vercel.com/workflows),
    [anúncio GA](https://vercel.com/blog/a-new-programming-model-for-durable-execution)
    e [`start()`, `Run` e `getRun()`](https://github.com/vercel/workflow/blob/main/docs/content/docs/v4/foundations/starting-workflows.mdx);
  - integração do Workflow com Nitro pelo módulo `workflow/nitro`:
    [repositório e referência oficial](https://github.com/vercel/workflow)
    e [skill oficial do SDK](https://github.com/vercel/workflow/blob/main/skills/workflow/SKILL.md);
  - Nitro 2 estável pelo pacote
    [`nitropack`](https://www.npmjs.com/package/nitropack) e configuração de
    [deploy na Vercel](https://nitro.build/deploy/providers/vercel);
  - projetos Vercel separados no mesmo monorepo e descoberta do deployment
    correspondente:
    [monorepos](https://vercel.com/docs/monorepos) e
    [Related Projects](https://vercel.com/docs/monorepos#how-to-link-projects-together-in-a-monorepo);
  - acesso server-to-server a previews protegidos:
    [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation);
  - Vercel Blob `copy()` server-side, pathname determinístico, `ifMatch`,
    `allowOverwrite` e `AbortSignal`:
    [SDK oficial](https://vercel.com/docs/vercel-blob/using-blob-sdk);
  - HeroUI 3 para seleção mutuamente exclusiva:
    [`RadioGroup` e `Radio`](https://heroui.com/en/docs/react/components/radio-group).
- Estado das dependências na especificação:
  - API usa NestJS `11.1.x`, Mongoose `9.8.x`, `@vercel/blob` `2.7.x`,
    `@vercel/functions` `3.9.x`, Node 24 e TypeScript 6;
  - UI usa HeroUI 3 e TanStack Query/Router/Form conforme o SDD vigente;
  - `workflow`, `@workflow/vitest` e `nitropack` ainda não estão instalados. A
    implementação deve selecionar as linhas estáveis v4 do Workflow e v2 do Nitro,
    confirmar peer dependencies, tipos, transformação das diretivas e documentação
    empacotada; não deve instalar `workflow@5` beta nem o pacote `nitro@3` beta;
  - a versão estável observada na revalidação é `nitropack@2.13.4`. O patch estável
    mais recente de Workflow deve ser reconfirmado pelo lockfile e pelos artefatos
    oficiais no início da implementação, sem ranges que admitam prerelease;
  - `@workflow/nitro` é alcançado pelo módulo público `workflow/nitro`. Sua
    compatibilidade com Nitro 2, Node 24, build do monorepo e deploy Vercel é um
    gate executável anterior à habilitação da clonagem.
- Features relacionadas:
  - `FIT-0005` criou o aggregate reutilizável e antecipou ownership pessoal por
    `ownerPersonId`;
  - `FIT-0028` e `FIT-0030` definiram limites, CAS, fila por aggregate, drafts e
    recuperação que também valem para planos pessoais editáveis;
  - `FIT-0032` definiu SSE como invalidação best-effort, nunca como fila durável;
  - `FIT-0044` tornou as duas variantes de imagem privadas e assinadas;
  - `FIT-0059` consolidou a apresentação e os estados transitórios do editor que o
    modo pessoal deve preservar.

## Escopo

### Incluído

- novo item de menu pessoal, visível a toda pessoa autenticada, inclusive admins;
- rotas pessoais de lista, detalhe e workout sem o prefixo `/global`, mantendo as
  rotas administrativas atuais;
- catálogo pessoal unificado contendo planos próprios e referências vivas a
  planos globais;
- criação direta de plano pessoal com o mesmo editor de workouts e exercícios;
- dropdown `Novo plano` com `Criar novo plano` e `Copiar um plano`;
- modal autenticado com planos globais, resumo limitado de workouts/exercícios e
  ações `Clonar` e `Usar esse plano`;
- referência pessoal única a um global, sem copiar sua árvore e acompanhando toda
  alteração futura do global;
- navegação integral em referência global com conteúdo somente leitura e ação
  visual `Excluir` que remove apenas o vínculo pessoal;
- clonagem independente de plano, workouts, exercícios e das duas variantes de
  cada imagem para novos pathnames no Blob privado;
- job de clonagem persistido no MongoDB e orquestrado por Vercel Workflow estável,
  com progresso, retry automático, retry manual, cancelamento cooperativo,
  compensação e finalização idempotente;
- nova aplicação `workflow/`, com Nitro 2 estável, deploy Vercel independente,
  endpoint interno autenticado e acesso direto ao MongoDB e ao mesmo store Blob;
- destino clonado invisível até estar completo; a lista apresenta somente uma
  linha de operação bloqueada durante o processamento;
- bloqueio, para a pessoa que iniciou o job, da linha de origem correspondente no
  catálogo global da modal enquanto aquela clonagem estiver ativa;
- coluna de radio `Em uso`, fora da primeira posição, com no máximo um item ativo
  e realce discreto da linha ativa;
- permissão para permanecer sem plano ativo, inclusive após criação inicial,
  exclusão própria, desvinculação ou exclusão administrativa do global;
- coluna administrativa única de impacto com pessoas vinculadas e pessoas que
  mantêm o global ativo;
- reforço dos mesmos números no detalhe, no workout e na confirmação de exclusão
  global, deixando explícita a possibilidade de pessoas ficarem sem plano ativo;
- exclusão administrativa permitida mesmo com vínculos ou uso ativo, removendo o
  global da experiência pessoal sem escolher fallback;
- contratos compartilhados discriminados, novos endpoints pessoais, índices,
  handlers MSW, fixtures, seeds, E2E da API e Playwright da UI;
- atualização dos SDDs vivos e nova ADR somente na implementação autorizada.

### Não incluído

- recomendar planos, gerar treinos por IA, compartilhar planos pessoais entre
  pessoas, colaboração, marketplace, assinatura ou cobrança;
- permitir que uma pessoa edite parcialmente um plano global referenciado;
- congelar uma referência global em uma versão anterior;
- impedir edição ou exclusão global porque existem vínculos pessoais;
- escolher automaticamente outro plano ativo após exclusão ou desvinculação;
- tornar o primeiro plano criado, usado ou clonado automaticamente ativo;
- expor todos os planos globais diretamente na lista pessoal sem ação prévia de
  `Usar esse plano` ou conclusão de `Clonar`;
- considerar clones nos contadores administrativos de vínculos: depois de
  concluído, um clone é independente do global de origem;
- bloquear a tela administrativa global porque uma pessoa está clonando. O
  bloqueio de origem é local à pessoa solicitante; concorrência administrativa é
  absorvida pelo snapshot do job;
- expor plano destino parcial, workout parcial ou URL de blob copiado antes da
  finalização;
- usar Redis Pub/Sub, `waitUntil`, Vercel Queues ou Cron como executor principal da
  clonagem;
- executar toda a clonagem de árvore e imagens sincronamente na request pública;
- adotar Workflow SDK beta, cancelamento em voo beta ou worker/fila adicional fora
  da aplicação Nitro definida nesta feature;
- usar Vercel Services enquanto permanecer em Private Beta, hospedar o Workflow
  dentro do processo Nest ou encaminhar `/.well-known/workflow/*` pela API;
- remover CAS, `X-Resource-Version`, limites de 25 workouts/50 exercícios,
  variantes WebP, OIDC, URLs assinadas ou reconciliação de mídia vigentes;
- mudar os cinco tipos ou os campos de exercícios;
- paginação por cursor, busca textual, filtros, ordenação configurável ou seleção
  em lote;
- soft delete, histórico de versões, auditoria de conteúdo ou restauração de
  global excluído;
- screenshots de referência: nenhuma pasta de assets existe para as novas rotas e
  a feature não exige criá-las.

## Projetos e documentação afetados

- API e endpoints:
  - manter `GlobalTrainingPlansController` sob `/global/training-plans` e
    `AdminOnly`;
  - criar fronteira autenticada pessoal sob `/training-plans`, com commands
    proprietários e serviços internos reutilizados por escopo tipado;
  - criar operações autenticadas de biblioteca global, vínculo, ativação e jobs de
    clonagem sem liberar mutações globais a pessoas comuns;
  - ampliar as leituras administrativas com métricas de vínculo/atividade e a
    exclusão global com limpeza referencial idempotente;
  - adicionar schemas/repositories para entrada de catálogo, ponteiro ativo e job
    de clonagem, preservando `training_plans` como coleção única para as árvores;
  - persistir o job antes do agendamento e chamar por HTTP autenticado o projeto
    Nitro com somente `cloneJobId` e geração; a API não executa nem empacota as
    diretivas do Workflow;
  - encapsular descoberta da URL, assinatura, timeout e classificação da resposta
    em adapter próprio, mantendo controller e command sem client HTTP ad hoc;
  - criar `api/docs/sdd/endpoints/personal-training-plans.md` e atualizar
    `global-training-plans.md`, `realtime-events.md` e os documentos base afetados.
- Aplicação de Workflow:
  - criar `workflow/` como pacote privado `dall-fit-workflow`, membro do workspace e
    projeto Vercel com Root Directory própria, domínio, deploy e rollback
    independentes da API e da UI;
  - usar Nitro 2 estável com `workflow/nitro`; o endpoint interno inicia o run e as
    funções `"use workflow"`/`"use step"` orquestram MongoDB, Blob, retenção,
    compensação e finalização idempotente;
  - manter handler Nitro fino: validar transporte/assinatura, registrar log seguro,
    chamar command e devolver seu resultado. Commands orquestram o caso; services
    encapsulam regras, MongoDB, Blob e SDK; repositories são usados somente por
    services e recebem dados já preparados;
  - compartilhar o cluster MongoDB e o store Blob privado com a API por conexões e
    OIDC configurados separadamente no projeto Vercel, sem encaminhar steps pela
    API e sem importar arquivos internos de `api/` ou `ui/`;
  - possuir `package.json`, TypeScript estrito, configuração Nitro, ambiente de
    exemplo, estrutura `src/`, testes/configurações Vitest, cobertura LCOV/JUnit,
    build e `sonar-project.properties` próprios, sem lockfile independente;
  - expor scripts próprios `dev`, `typecheck`, `test`, `test:workflow`,
    `test:coverage`, `test:coverage:ci` e `build`; o desenvolvimento local usa a
    porta `5000`, com `WORKFLOW_BASE_URL=http://localhost:5000` na API;
  - criar `workflow/docs/sdd/README.md`, documentos base de arquitetura, segurança,
    logging, testes e ambiente, `endpoints/training-plan-clone-runs.md` e
    `workflows/training-plan-clone.md`; os SDDs da raiz referenciam esses documentos
    sem duplicar detalhes locais;
  - incluir o novo projeto nos agregadores de `dev`, `typecheck`, `lint`, `test`,
    `test:coverage:ci`, `build` e Sonar da raiz, na configuração ESLint única e no
    CI, preservando `pnpm test:integration` exclusivamente para Playwright da UI.
- UI e rotas:
  - acrescentar manualmente à árvore tipada `/training-plan`,
    `/training-plan/:catalogEntryId` e
    `/training-plan/:catalogEntryId/workout/:workoutId` como filhas autenticadas;
  - preservar `/global/training-plan*` como filhas administrativas;
  - adicionar `Meus planos` ao menu de todas as pessoas e identificar a entrada
    administrativa como `Planos globais`, sem ambiguidade para admins;
  - compartilhar componentes de tabela, formulário, detalhe e editor onde a
    composição for realmente comum, selecionando comportamento por união
    discriminada `global-admin | personal-owned | personal-global-reference`;
  - criar os documentos vivos `training-plan.md`, `training-plan-detail.md` e
    `training-plan-workout.md` e atualizar os três documentos globais, `dash.md` e
    os documentos base afetados.
- Fluxos:
  - criar `docs/sdd/flows/gestao-planos-treino-pessoais.md`;
  - atualizar `gestao-planos-treino-globais.md` somente durante a implementação
    para incluir métricas e impacto administrativo.
- Contratos em `@dall-fit/types`:
  - adicionar união discriminada dos itens da lista pessoal, respostas de
    biblioteca, catálogo, ativação, jobs e métricas administrativas;
  - adicionar também o envelope serializável e versionado do bridge interno
    API→Workflow; o body contém somente `cloneJobId` e geração;
  - manter IDs opacos; nenhum contrato público expõe `ownerPersonId`, blob pathname,
    `workflowRunId`, estado interno de lease ou snapshot do job;
  - preservar contratos globais existentes quando compatíveis e evoluí-los
    atomicamente quando as métricas forem adicionadas;
  - módulos com diretiva `"use workflow"` ou `"use step"` recebem somente
    primitivos e dependem de código local de `workflow/`; o uso de pacote irmão
    dentro desses bundles só é permitido se o spike comprovar sua resolução no
    build e no runtime Vercel.
- Decisões arquiteturais:
  - criar ADR para o catálogo pessoal, referência viva, ponteiro ativo e Workflow
    durável, relacionando e sem reescrever as ADRs históricas 0003, 0005, 0007 e
    0008;
  - registrar explicitamente que fronteiras HTTP permanecem separadas, enquanto o
    núcleo reutiliza escopos tipados e não parâmetros de confiança do cliente;
  - registrar a aplicação Nitro como quarto projeto do monorepo e terceiro projeto
    Vercel desta jornada, com comunicação API→Workflow por HTTP assinado e dados de
    execução compartilhados apenas por MongoDB/Blob.
- Handlers e fixtures MSW:
  - adicionar pessoa comum e admin com catálogos pessoais independentes;
  - cobrir plano próprio, referência global, item ativo, nenhum ativo, job em cada
    estado, resumo global, contadores administrativos, exclusão e concorrência;
  - simular progresso por estado HTTP determinístico; MSW não executa Workflow nem
    acessa API/Blob reais.
- Mocks de repositories/caches nos unitários da API:
  - mocks tipados para catálogo, preferência ativa, clone job, adapter de disparo
    HTTP e publicação de invalidação;
  - manter repositories acessados somente por services.
- Fixtures MongoDB/Redis nos E2E:
  - MongoDB efêmero cobre ownership, referências, ponteiro ativo, jobs, índices,
    métricas e finalização idempotente;
  - Redis efêmero continua dedicado à infraestrutura vigente de sessão, rate
    limit e SSE; não recebe jobs;
  - Vercel Workflow e Blob são isolados na fronteira externa nos testes, sem
    credencial, rede ou dependência do painel da Vercel.
- Testes e documentação próprios de `workflow/`:
  - unitários substituem MongoDB, Blob, relógio e starter do Workflow por ports
    tipados; integrados executam a runtime local oficial e adapters determinísticos;
  - testes de contrato cobrem envelope, assinatura, replay, idempotência e respostas
    do bridge sem chamar um deployment Vercel real;
  - build smoke verifica descoberta das diretivas, rotas geradas e artefato Nitro;
    preview autorizado valida a integração real sem dados de produção.

## Requisitos funcionais

### Fronteiras, catálogo e ownership

1. `/global/training-plans` continua administrativo. `/training-plans` deriva a
   pessoa da sessão e nunca aceita owner, escopo global ou modo de autorização no
   body/query.
2. `training_plans` continua contendo somente árvores reais: global com
   `ownerPersonId: null`, próprio criado ou clonado com o ID da pessoa.
3. Uma entrada de catálogo pessoal possui ID público próprio, pertence a exatamente
   uma pessoa e discrimina:
   - `owned`: aponta para um plano real cujo `ownerPersonId` é a mesma pessoa;
   - `global-reference`: aponta para um plano real global e não possui cópia da
     árvore.
4. Cada plano próprio possui uma única entrada de catálogo. Cada par pessoa/global
   possui no máximo uma referência; repetir `Usar esse plano` devolve conflito
   estável e não cria duplicata.
5. A seleção ativa é um único ponteiro por pessoa para uma entrada de seu catálogo.
   Ausência do ponteiro é estado válido. O backend valida existência, ownership e
   elegibilidade antes de alterar o ponteiro.
6. Um job de clonagem não é entrada de catálogo nem plano. A lista pessoal monta um
   read model paginado discriminado entre `training-plan` e `clone-job`, mantendo
   ordenação e paginação no servidor em vez de mesclar duas páginas no cliente.
7. Todos os IDs de catálogo, plano, workout, exercício, job e pessoa são validados
   na fronteira correspondente e tratados como opacos na UI.

### Menu, rotas e lista pessoal

8. Toda pessoa autenticada vê `Meus planos`; admins veem também `Planos globais`.
   Cada item fica ativo em suas rotas descendentes, usa navegação tipada e não
   altera proteção ou fallback existentes.
9. `/training-plan` apresenta título `Meus planos`, paginação canônica de 20 itens
   e botão `Novo plano` cujo dropdown contém, nesta ordem, `Criar novo plano` e
   `Copiar um plano`.
10. Itens `owned` e `global-reference` aparecem na mesma tabela. A origem é
    perceptível por texto/ícone acessível sem depender somente de cor; a tabela não
    mistura todos os globais da biblioteca, apenas referências já adicionadas.
11. A coluna `Em uso` contém radios mutuamente exclusivos, não ocupa a primeira
    coluna e possui nome acessível contextual. Selecionar outro item executa uma
    única mutation de ativação; selecionar o já ativo não desmarca nem cria request.
12. Nenhum plano nasce ativo por efeito colateral. Isso vale para o primeiro plano
    criado, a primeira referência usada e o primeiro clone concluído.
13. A linha ativa recebe realce discreto, de baixa ênfase, enquanto o radio
    selecionado permanece a indicação semântica. O realce não transforma a tabela
    em seleção múltipla nem substitui foco, texto ou controle.
14. Excluir um plano próprio ativo, excluir visualmente uma referência ativa ou
    perder um global ativo por exclusão administrativa limpa o ponteiro. Nenhum
    outro item é escolhido automaticamente.
15. A linha `clone-job` não contém link, radio elegível, menu normal do plano nem
    `trainingPlanId` público. Ela mostra nome de origem sanitizado, estado e
    progresso confirmado, e permanece inteira não navegável.

### Criar plano pessoal

16. `Criar novo plano` reutiliza o formulário vigente de nome e descrição, mas
    cria plano com ownership da sessão e entrada `owned` no catálogo pessoal.
17. A criação preserva limites, validação, mensagens, recuperação de formulário e
    semântica de loading vigentes. Sucesso inclui o item na lista sem marcá-lo
    ativo; falha não deixa árvore ou entrada órfã observável.
18. Detalhe e workout de `owned` permitem as mesmas operações de plano global
    compatíveis com o domínio, aplicando CAS, fila por aggregate, autosave,
    reordenação, mídia, proteção de navegação e compensações existentes com filtro
    obrigatório por `ownerPersonId`.

### Biblioteca global e `Usar esse plano`

19. `Copiar um plano` abre modal HeroUI paginada com apenas globais existentes e
    autorizados. Cada opção mostra nome, descrição, total de workouts/exercícios e
    os cinco primeiros workouts na ordem física; cada workout mostra nome, total e
    os três primeiros exercícios por nome/tipo, indicando quantos itens ficaram
    fora do preview. A projeção não carrega árvore integral, emite signed URLs ou
    cria N+1 de mídia.
20. Cada global oferece `Clonar` e `Usar esse plano`. Ações possuem nomes
    contextuais e permanecem irmãs, sem controles interativos aninhados.
21. `Usar esse plano` cria somente a referência pessoal e fecha/aplica a response
    canônica após sucesso. Não copia workouts, exercícios nem imagens e não torna o
    item ativo.
22. A referência resolve o plano global atual em toda leitura. Nome, descrição,
    workouts, exercícios, ordem e mídia refletem futuras alterações administrativas
    após invalidação/refetch; não existe snapshot de conteúdo para `Usar`.
23. Se a pessoa já possui a referência, `Usar esse plano` aparece indisponível com
    explicação contextual. Removê-la permite usá-la novamente depois.

### Navegação somente leitura e exclusão visual da referência

24. Uma referência global pode ser aberta no detalhe e no workout e apresenta as
    mesmas informações autorizadas, inclusive signed URLs, preview de vídeo e
    imagem, porém todo campo de conteúdo fica read-only/disabled.
25. Adicionar, salvar, autosave, upload, substituir/remover imagem, reordenar,
    excluir exercício/workout/plano real e qualquer trigger equivalente ficam
    ausentes ou semanticamente desabilitados. O backend também rejeita writes por
    uma referência, independentemente da UI.
26. O menu da linha de referência oferece `Excluir`, com a mesma linguagem visual,
    confirmação, loading, sucesso, falha e restauração de foco da exclusão de um
    plano próprio.
27. No backend, essa operação remove somente a entrada de catálogo. O plano global,
    seus blobs e referências de outras pessoas não mudam. Se a referência era
    ativa, o ponteiro fica vazio.
28. A response discrimina o resultado de catálogo sem obrigar a UI a exibir o termo
    técnico `desvincular`; textos de confirmação podem esclarecer que o plano será
    removido de `Meus planos` sem ser apagado para outras pessoas.

### Clonagem durável e invisível

29. `Clonar` valida a origem global, captura no MongoDB um snapshot imutável da
    versão, estrutura, IDs lógicos e referências/ETags de mídia e cria um clone job
    pertencente à sessão. Depois do commit, a API solicita por HTTP autenticado que
    o projeto Nitro inicie o Workflow e responde `202` com o item de operação, sem
    criar plano destino ou entrada `owned` parcial.
30. O input do Workflow contém somente `cloneJobId` e geração. Snapshot, identidade,
    blob keys e progresso permanecem no MongoDB e não entram no event log, contrato
    público, bridge HTTP ou URL.
31. O Workflow usa `"use workflow"` somente para controle determinístico. Todo
    acesso a MongoDB, Vercel Blob, logging e publicação ocorre em funções
    `"use step"` da aplicação Nitro. O projeto Workflow acessa esses recursos
    diretamente com credenciais próprias e nunca chama endpoints pessoais da API
    para executar cada step.
32. Cada step copia um lote pequeno e limitado. Para cada imagem, `thumbnail` e
    `display` são copiados server-side para pathnames privados novos,
    determinísticos e pertencentes ao clone; a imagem só avança no progresso depois
    das duas variantes confirmadas.
33. `copy()` preserva explicitamente content type/cache necessários, usa OIDC e
    condicionais suportadas pela versão instalada. Retry do mesmo step não cria
    variantes adicionais nem associa mídia duplicada.
34. A árvore clonada preserva conteúdo e ordem do snapshot, mas recebe novos IDs de
    plano, workouts e exercícios e `ownerPersonId` da pessoa. Ela não mantém
    dependência funcional do global depois da conclusão.
35. O plano e sua entrada `owned` só se tornam observáveis depois que todas as
    cópias foram confirmadas. A finalização usa `cloneJobId` único ou invariante
    equivalente: repetição encontra o mesmo destino e nunca cria dois planos.
36. A linha nova exibida durante clonagem representa o job, permanece bloqueada e
    informa `Aguardando`, `Clonando X de Y`, `Cancelando` ou `Falha ao clonar`.
    Não há porcentagem inventada quando o total ainda não estiver confirmado.
37. Enquanto houver job não terminal para pessoa+global, a linha de origem daquele
    global na modal fica bloqueada para essa pessoa e não inicia segundo job. Esse
    bloqueio não impede outra pessoa nem um admin de ler, editar ou excluir o
    global.
38. Alteração administrativa depois do snapshot não muda o clone em andamento.
    Exclusão administrativa continua permitida; chaves de origem usadas pelo job
    recebem retenção lógica e só podem ser removidas do Blob depois de todos os jobs
    que as referenciam chegarem a estado terminal.
39. A clonagem pode concluir usando o snapshot mesmo que o global seja excluído no
    decorrer do processo. A referência pessoal ao global desaparece conforme a
    regra de exclusão, mas o futuro clone independente não é convertido em
    referência nem cancelado automaticamente.

### Falha, retry e cancelamento do clone job

40. Falha transitória de step usa retry/backoff estável do Workflow. Steps já
    concluídos não são refeitos e side effects continuam idempotentes.
41. Depois de esgotar retries, o job fica `failed`, conserva progresso seguro e
    mostra `Tentar novamente` e `Remover`. Mensagem pública usa categoria estável e
    não expõe stack, provider, pathname, URL ou payload.
42. Retry manual incrementa a geração, inicia novo run para o mesmo job e retoma
    apenas blobs ainda não confirmados. Run ou callback de geração anterior vira
    no-op e não pode finalizar o plano.
43. Durante `queued|running`, a ação `Cancelar` marca primeiro
    `cancelRequestedAt`. O Workflow verifica o estado antes de cada lote, deixa de
    iniciar novas cópias, remove somente destinos já criados por aquele job e marca
    `cancelled` antes de a linha desaparecer.
44. Cancelamento de produto é cooperativo e não depende diretamente de
    `Run.cancel()`, pois encerrar o run poderia impedir compensação. Cancelamento
    operacional de run travado exige rotina durável separada de limpeza e não
    altera a semântica pública.
45. `Remover` em job falho confirma a desistência, limpa destinos parciais de forma
    idempotente e só então remove/arquiva sua presença na lista. Um job com cleanup
    pendente permanece visível e bloqueado como `Cancelando`.
46. Se cancelamento e finalização concorrerem, uma transição atômica decide o
    vencedor: finalização já confirmada mantém o plano e faz cancelamento responder
    conflito terminal; cancelamento confirmado impede a criação posterior.
47. A falha entre criar o job e iniciar/registrar o Workflow deixa estado
    `start-failed` recuperável pelo mesmo retry manual. Timeout do bridge é resultado
    ambíguo, não autorização para criar outro job: repetir a mesma chave
    `cloneJobId+generation` primeiro tenta reconciliar o run aceito. O endpoint Nitro
    usa reserva atômica recuperável por lease, e o primeiro step
    reivindica/confirma atomicamente seu `runId`; se a queda ocorrer na janela entre
    `start()` e essa confirmação, um run físico concorrente pode existir, mas somente
    o vencedor prossegue e os demais encerram sem side effects.

### Plano ativo

48. Ativação é operação pessoal independente do conteúdo do plano e não usa
    `If-Match` do aggregate. Ela troca atomicamente o único ponteiro ativo e devolve
    o catálogo pessoal canônico afetado.
49. Somente entrada `owned` existente ou `global-reference` cujo global ainda
    existe pode ser ativada. Job, item bloqueado, referência pendente de remoção ou
    entrada de outra pessoa são rejeitados.
50. A pessoa não recebe ação de desmarcar o radio atual. O estado sem ativo nasce
    apenas sem seleção inicial ou como consequência permitida de exclusão,
    desvinculação ou perda do global.
51. Mudanças de ativo atualizam o contador administrativo do global anterior e do
    novo quando forem referências, sem incluir planos próprios/clonados.

### Impacto na administração global

52. A lista global adiciona uma única coluna `Uso` com dois valores distintos por
    pessoas, não por requests ou documentos duplicados:
    - `Usam`: pessoas com referência viva criada por `Usar esse plano`;
    - `Ativas`: subconjunto dessas pessoas cujo ponteiro ativo aponta para a
      referência.
53. Vale sempre `Ativas <= Usam`. Clones em andamento ou concluídos e planos
    pessoais criados do zero não entram em nenhum contador.
54. O detalhe global e o editor de workout repetem os números em indicação discreta
    próxima ao cabeçalho e informam que alterações serão refletidas para pessoas
    vinculadas. Isso não bloqueia edição nem exige confirmação em cada autosave.
55. A confirmação de exclusão global mostra os valores mais recentes disponíveis e
    declara explicitamente que as referências serão removidas e que as pessoas em
    `Ativas` poderão ficar sem plano ativo. Os números são informativos e não
    impedem a exclusão se mudarem concorrentemente.
56. Confirmar continua excluindo o global mesmo quando qualquer contador é maior
    que zero. A leitura pessoal deixa de expor referências dangling imediatamente,
    o ponteiro correspondente passa a ser interpretado como vazio e a limpeza
    referencial idempotente converge sem escolher fallback.
57. A exclusão global também respeita as retenções de blob de clone jobs ativos.
    Ela remove a árvore da experiência canônica, mas adia somente o `del` físico de
    chaves ainda necessárias ao snapshot; reconciliação não as classifica como
    órfãs antes do término dos jobs.

### Concorrência, invalidação e recuperação

58. Planos `owned` usam a mesma versão de aggregate, `X-Resource-Version`, CAS e
    coordenador FIFO por plano das telas globais. Global referenciado não cria fila
    de write porque seu conteúdo é somente leitura.
59. Eventos de alteração global continuam invalidando lista, detalhe e workout de
    referências em todas as sessões autorizadas. SSE continua best-effort e a
    leitura HTTP canônica recupera perdas.
60. Criar/remover referência e trocar ativo invalidam as métricas administrativas
    do global afetado. Nenhum evento publica personId, nome do plano, conteúdo ou
    contagem sensível além do necessário para localizar o recurso canônico.
61. A lista pessoal consulta periodicamente somente enquanto existir clone job não
    terminal e interrompe polling ao chegar em sucesso, falha ou cancelamento.
    Eventos terminais podem antecipar o refetch, mas não substituem a consulta.
62. Em conclusão, a linha de job desaparece e a entrada `owned` aparece sem remonta
    indevida, navegação automática ou seleção ativa. Em falha/cancelamento, planos e
    referências já existentes permanecem intactos.

### Contrato HTTP mínimo

63. A implementação documenta, com DTOs exatos, pelo menos as seguintes operações
    pessoais ou equivalentes que preservem a mesma separação semântica:
    - `GET/POST /training-plans` para lista pessoal e criação própria;
    - `GET /training-plans/library` para resumos globais autenticados;
    - `POST /training-plans/global-references` para `Usar esse plano`;
    - `PUT /training-plans/active` para selecionar a entrada ativa;
    - `GET/PATCH/DELETE /training-plans/:catalogEntryId`;
    - operações de workouts, exercícios, ordem e imagem sob a entrada pessoal;
    - `POST /training-plan-clone-jobs`, `POST .../:cloneJobId/retry` e
      `DELETE .../:cloneJobId` para iniciar, repetir e cancelar/remover.
64. Começar clonagem, retry e cancelamento em execução respondem `202`. Criação de
    referência/plano e ativação respondem com representação canônica suficiente
    para atualizar a lista sem inferência do cliente.
65. Erros distinguem ID inválido, item ausente, ownership, referência somente
    leitura, referência duplicada, job duplicado/terminal, global removido,
    conflito de versão, falha de agendamento e indisponibilidade transitória. A UI
    decide por `status+code`, nunca por `message`.
66. O endpoint administrativo preserva paths globais e `AdminOnly`; nenhum endpoint
    pessoal concede acesso à árvore de outra pessoa nem transforma sessão comum em
    administradora.

### Bridge interno API→Workflow e deploy

67. O monorepo possui três projetos Vercel para esta jornada: UI, API Nest e
    Workflow Nitro. `workflow/` tem domínio e ciclo de deploy próprios; Vercel
    Services, proxy pela UI/API e execução no mesmo processo Nest não são fallback.
68. A API chama `POST /internal/training-plan-clone-runs` no domínio do projeto
    Workflow. O contrato interno v1 possui body JSON canônico com somente
    `cloneJobId` e `generation` e nunca transporta sessão, person ID, snapshot,
    árvore, blob key, URL assinada ou credencial.
69. A request interna usa versão explícita e HMAC-SHA-256 sobre método, pathname,
    timestamp e hash dos bytes exatos do body. O projeto Nitro verifica assinatura
    em tempo constante e rejeita relógio fora da janela documentada antes de ler ou
    alterar o job. O segredo fica somente em variáveis server-side equivalentes nos
    dois projetos e nunca possui valor funcional no repositório.
70. A URL correspondente é resolvida por Related Projects nos deployments Git da
    Vercel, com `WORKFLOW_BASE_URL` explícita como fallback obrigatório para local,
    CI e ambientes sem Related Projects. Não há host hardcoded, URL vinda do cliente
    nem fallback silencioso entre preview e produção. Se Deployment Protection
    estiver ativa, o adapter envia o header oficial de Protection Bypass for
    Automation com segredo server-side próprio; ele complementa e não substitui a
    autenticação HMAC da aplicação.
71. O endpoint interno é idempotente por `cloneJobId+generation`: `202` representa
    execução nova ou já aceita para a mesma chave. Assinatura inválida/expirada,
    versão incompatível, job inexistente, geração obsoleta, estado terminal e falha
    transitória possuem status e code internos estáveis documentados. Replays
    válidos dentro da janela não produzem segunda execução lógica nem segundo
    destino; eventual run físico perdedor encerra antes de qualquer side effect.
72. A API persiste o job antes da chamada. Sucesso vincula a correlação do run;
    falha definitiva de start marca `start-failed`; timeout mantém estado
    recuperável e uma nova chamada com a mesma chave reconcilia o resultado. A API
    continua sendo a única fronteira pública para iniciar, repetir e cancelar.
73. Cancelamento público grava intenção no MongoDB; o Workflow a observa entre
    lotes. Não existe callback público do Nitro para a API nem dependência de uma
    Function Nest permanecer ativa enquanto o run executa.
74. As rotas geradas `/.well-known/workflow/v1/*` pertencem exclusivamente ao
    deployment Nitro e seguem a proteção/runtime oficiais do SDK. Elas não são
    reescritas, expostas como contrato do produto ou implementadas manualmente.
75. API e Workflow podem fazer deploy e rollback independentes. O bridge interno é
    versionado e retrocompatível durante a janela de rollout; novo contrato é
    publicado no Workflow antes de seu produtor na API. Runs em andamento continuam
    associados ao deployment Nitro que os iniciou.
76. Localmente, o Nitro escuta na porta `5000` e integra o `pnpm dev` agregado sem
    mudar as portas `3000` da UI e `4000` da API. CI e testes escolhem porta efêmera
    quando iniciarem servidor isolado, para não depender de estado externo.
77. A API é responsável por criar o snapshot/job, expor o read model e registrar
    intenção de cancelamento. O Workflow é responsável por aceitar o run, avançar
    progresso, copiar/compensar mídia e materializar/finalizar o clone. Ambas as
    aplicações acessam o job somente por services/repositories locais e updates
    atômicos filtrados por ID, geração e estado esperado.
78. Schema persistido, índices e transições compartilhadas são definidos na ADR e
    cobertos por contratos/fixtures comuns; a API continua proprietária da criação
    de índices/migração. O Workflow não usa sincronização automática de schema nem
    mantém uma segunda interpretação silenciosa dos estados.

## Requisitos não funcionais

- Acessibilidade:
  - dropdown, modal, confirmações e previews seguem composição HeroUI, possuem nome,
    foco contido/restaurado e suporte a teclado, backdrop e `Escape` conforme o
    estado pending permitir;
  - a coluna identifica o grupo `Plano em uso`; cada radio possui nome com o plano,
    foco visível e estado selecionado/disabled sem depender de cor;
  - a composição mantém HTML de tabela válido mesmo com seleção controlada entre
    linhas e não cria checkbox, seleção de linha ou controle interativo aninhado;
  - linha ativa usa radio mais realce; job/source bloqueado usa texto e semântica
    disabled, não somente opacidade;
  - progresso e transições de job são anunciados sem disparar leitura repetitiva a
    cada atualização.
- Performance:
  - biblioteca e lista permanecem paginadas e usam projeções MongoDB limitadas;
  - resumo global não assina imagens, não hidrata exercícios completos além do
    preview limitado e não executa consulta por linha;
  - métricas administrativas usam índices/agregação sem N+1;
  - Workflow divide imagens em lotes pequenos, limita concorrência de Blob e não
    mantém Function ativa durante espera entre steps;
  - polling existe apenas enquanto houver job ativo e aplica intervalo/backoff
    documentado; renders não iniciam Workflow ou Blob copy.
- Segurança e privacidade:
  - sessão define owner e audiência em toda operação; IDs públicos não substituem
    filtros de ownership;
  - Workflow recebe somente identificadores técnicos mínimos e steps revalidam
    geração/estado antes de side effects;
  - bridge interno exige HMAC, timestamp, versão, body limitado, comparação em
    tempo constante e idempotência; CORS não é mecanismo de autenticação entre os
    dois projetos;
  - cópia ocorre server-side no store privado por OIDC; blob keys, URLs assinadas,
    ETags, `runId`, snapshot e tokens não entram em responses comuns, Analytics ou
    logs;
  - signed URLs mantêm escopo, expiração, `private, no-store`, CSP e renovação
    vigentes;
  - início/retry/cancelamento recebem rate limit proporcional e idempotência para
    evitar abuso e multiplicação de blobs;
  - o uso do Hobby da Vercel deve respeitar cotas e finalidade do plano; ambiente
    comercial não assume gratuidade como requisito arquitetural.
- Observabilidade:
  - controller, command, service, repository e adapter HTTP na API, assim como
    handlers, services, repositories e adapters no Workflow, registram entrada,
    branches, dependências e saída sanitizada conforme padrões locais documentados;
  - logs usam job ID, geração, contadores e categorias estáveis, nunca nomes,
    árvore, arquivo, URL, pathname, ETag ou payload;
  - transições `starting|queued|running|cancel-requested|failed|completed|cancelled`
    são correlacionáveis com request e run sem expor o `runId` ao cliente;
  - logs correlacionam chamada API, aceitação Nitro, `cloneJobId`, geração e run sem
    registrar assinatura, segredo, body canônico, protection bypass ou headers
    sensíveis;
  - métricas operacionais distinguem duração, retries, falha permanente,
    cancelamento, cleanup pendente e blobs compensados;
  - Analytics preserva um início e um terminal por intenção de criar, usar, clonar,
    ativar, excluir, retry e cancelar, com identificadores enumerados e sem conteúdo.
- Compatibilidade e manutenção:
  - usar somente Workflow v4 e `nitropack` v2 estáveis compatíveis com Node 24 e o
    build vigente; confirmar APIs nos tipos locais e docs empacotados e impedir
    prereleases no lockfile;
  - separar função determinística de Workflow de steps com side effects e não
    serializar handlers, clients Mongo/Redis/Blob ou contexto de request;
  - `workflow/` não importa internos de API/UI; dependências de workspace são
    declaradas e qualquer import de pacote irmão alcançável por diretiva precisa
    passar build e execução de preview, devido à fronteira própria do bundler;
  - componentes compartilhados recebem uniões discriminadas exaustivas; não usam
    listas abertas de booleans que permitam combinações impossíveis;
  - cada projeto mantém `package.json` único/privado, TypeScript, testes, cobertura,
    documentação, Sonar e build próprios, mas usa o ESLint/Prettier e os quality
    gates agregados da raiz;
  - UI, API e Workflow permanecem compatíveis durante deployments independentes;
    a ativação da ação de clone só ocorre depois do preview integrado aprovado.

## Critérios de aceite

### Cenário 1 — Menu pessoal para pessoa comum e admin

- Forma de validar: abrir `http://localhost:3000/dash?mockAuth=person` e repetir com
  `mockAuth=admin` usando MSW.
- Given: existe sessão autenticada comum ou administrativa.
- When: o menu é aberto em desktop e mobile.
- Then: ambas veem `Meus planos`; somente admin também vê `Planos globais`; cada
  item ativa corretamente suas rotas descendentes sem reservar espaço indevido.

### Cenário 2 — Primeiro plano criado não fica ativo

- Forma de validar: abrir
  `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=empty`.
- Given: a pessoa não possui catálogo nem plano ativo.
- When: escolhe `Novo plano > Criar novo plano` e conclui o formulário.
- Then: surge item próprio editável, nenhum radio fica selecionado e o backend não
  grava ativo implicitamente.

### Cenário 3 — Seleção única e ausência permitida de ativo

- Forma de validar: mesma rota com fixture `personal-mixed`.
- Given: existem dois próprios e uma referência, sem job ativo.
- When: a pessoa ativa sucessivamente dois itens e depois exclui o item atual.
- Then: apenas o último radio fica selecionado antes da exclusão; clicar nele de
  novo não desmarca; a exclusão deixa todos desmarcados sem escolher fallback.

### Cenário 4 — Biblioteca global com duas ações

- Forma de validar: abrir a modal pelo link do cenário 2 com fixture
  `global-library`.
- Given: há globais com vários workouts e exercícios.
- When: escolhe `Copiar um plano`.
- Then: a modal paginada mostra resumo limitado, totais e as ações contextuais
  `Clonar`/`Usar esse plano`, sem imagens assinadas, conteúdo cortado sem indicação
  ou carregamento integral por linha.

### Cenário 5 — Referência acompanha alterações globais

- Forma de validar: flow Playwright com duas páginas MSW coordenadas e cenário vivo
  a ser documentado em `personal-training-plans.md`.
- Given: a pessoa usa um global e um admin altera nome, workout e exercício.
- When: a invalidação/refetch chega à lista, detalhe e workout pessoais.
- Then: a referência mostra a versão global atual sem cópia, merge ou edição local;
  contadores administrativos continuam coerentes.

### Cenário 6 — Referência é navegável e somente leitura

- Forma de validar: abrir
  `http://localhost:3000/training-plan/catalog-global-1/workout/workout-1?mockAuth=person&mockTrainingPlans=personal-reference`.
- Given: a entrada é `global-reference`.
- When: a pessoa percorre detalhe, workouts, exercícios, imagens e vídeos.
- Then: informações e previews funcionam, mas campos e ações de conteúdo ficam
  read-only/disabled; tentativa HTTP direta de mutation recebe código estável de
  somente leitura.

### Cenário 7 — Excluir referência significa desvincular

- Forma de validar: lista pessoal `personal-reference` e E2E do endpoint.
- Given: a referência pertence à pessoa e está ativa.
- When: escolhe visualmente `Excluir` e confirma.
- Then: a entrada some, ativo fica vazio, global/blobs/outras pessoas permanecem
  intactos e o fluxo visual é o mesmo de uma exclusão pessoal recuperável.

### Cenário 8 — Clone começa sem plano parcial

- Forma de validar: modal com fixture `clone-running` e cenário E2E de início.
- Given: o global possui estrutura e imagens privadas.
- When: a pessoa escolhe `Clonar`.
- Then: recebe `202`, a lista mostra uma linha `clone-job` bloqueada e sem radio ou
  link, nenhum plano/entrada destino existe, e a origem fica bloqueada apenas para
  essa pessoa enquanto o job está ativo.

### Cenário 9 — Clone conclui com novas imagens

- Forma de validar: integrado do projeto Workflow com runtime local, MongoDB efêmero
  e adapter Blob determinístico, mais flow Playwright `clone-success`.
- Given: snapshot possui workouts, todos os tipos e imagens com duas variantes.
- When: steps concluem e a UI refaz a lista.
- Then: existe exatamente um plano próprio completo com novos IDs e novos pathnames
  para cada variante, conteúdo/ordem do snapshot, nenhuma dependência do global e
  radio inicialmente desmarcado.

### Cenário 10 — Edição global durante o clone não altera snapshot

- Forma de validar: E2E com barreira determinística entre snapshot e steps.
- Given: job foi iniciado na versão N.
- When: admin altera o global para N+1 antes da finalização.
- Then: referência viva mostra N+1, mas o clone concluído corresponde integralmente
  ao snapshot N e nenhuma linha administrativa é bloqueada.

### Cenário 11 — Exclusão global durante o clone

- Forma de validar: E2E com job pausado após parte das cópias.
- Given: há referência ativa e clone da mesma origem em andamento.
- When: admin confirma a exclusão global.
- Then: referência desaparece, pessoa pode ficar sem ativo, job mantém acesso
  retido às keys do snapshot e pode concluir o clone independente; blobs de origem
  não são removidos prematuramente.

### Cenário 12 — Falha e retry manual idempotente

- Forma de validar: fixture `clone-failed` e E2E com falha transitória/permanente.
- Given: algumas variantes já foram confirmadas e retries automáticos se esgotaram.
- When: a pessoa aciona `Tentar novamente`.
- Then: nova geração retoma o restante, entrega antiga vira no-op e o sucesso cria
  um único plano sem blobs duplicados.

### Cenário 13 — Cancelamento cooperativo

- Forma de validar: fixture `clone-cancelling` e E2E com step em barreira.
- Given: job está copiando e possui destinos parciais.
- When: a pessoa aciona `Cancelar`.
- Then: linha muda para `Cancelando`, nenhum lote novo começa, destinos do job são
  compensados, origem permanece, nenhum plano nasce e a linha some somente após o
  cleanup terminal.

### Cenário 14 — Remover job falho

- Forma de validar: lista `clone-failed`.
- Given: job terminal falhou e conserva destinos parciais.
- When: a pessoa escolhe `Remover` e confirma.
- Then: cleanup idempotente ocorre antes da retirada visual definitiva e não remove
  blob de origem nem mídia de outro clone.

### Cenário 15 — Contadores administrativos

- Forma de validar: abrir
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=usage-counts`.
- Given: um global possui 12 pessoas vinculadas, 7 ativas, clones e planos próprios
  derivados.
- When: a lista, o detalhe e um workout são renderizados.
- Then: a coluna única `Uso` e os cabeçalhos mostram `12 usam` e `7 ativas`;
  clones não alteram os números e nenhuma consulta N+1 é produzida.

### Cenário 16 — Confirmação e exclusão global com impacto

- Forma de validar: mesmo cenário 15 e E2E administrativo.
- Given: global possui vínculos e ativos.
- When: admin abre a confirmação e conclui a exclusão.
- Then: a mensagem informa os dois números e o risco de ausência de ativo, mas não
  bloqueia; global e referências deixam de ser observáveis, ponteiros ficam vazios
  e nenhum fallback é escolhido.

### Cenário 17 — Ownership e fronteiras HTTP

- Forma de validar: cenários vivos com seeds/cURLs no novo documento de endpoint.
- Given: pessoa comum, outra pessoa e admin possuem itens próprios diferentes.
- When: tentam acessar ou mutar IDs alheios, enviar owner/escopo, usar endpoints
  globais ou converter referência em editável.
- Then: validação/autorização responde com status+code estável, nenhuma existência
  indevida é revelada e endpoints administrativos continuam `AdminOnly`.

### Cenário 18 — Recuperação após reinício e entrega repetida

- Forma de validar: integrado do Workflow com runtime local, repetição de
  step/finalização e MongoDB efêmero.
- Given: execução cai depois de copiar mídia ou criar o plano final.
- When: Workflow retoma/reexecuta o step.
- Then: progresso persistido continua, cópias são idempotentes, `cloneJobId` resolve
  o mesmo destino e o catálogo nunca contém dois clones daquela tentativa.

### Cenário 19 — Acessibilidade da tabela e estados bloqueados

- Forma de validar: testes de componente e Playwright em `1440x900` e `390x844`.
- Given: lista contém item ativo, inativo, referência e job.
- When: a pessoa navega somente por teclado e leitor semântico.
- Then: grupo/coluna e radios têm nomes, seleção é única, foco é visível, origem e
  bloqueios são anunciados, modal restaura foco e a tabela mantém markup válido sem
  sugerir seleção múltipla.

### Cenário 20 — Perda de SSE e polling limitado

- Forma de validar: MSW interrompe evento terminal e responde a consultas de
  status subsequentes.
- Given: lista tem job ativo e conexão SSE perde uma invalidação.
- When: polling canônico observa estado terminal.
- Then: a UI converge, substitui job pelo plano ou mantém a falha, interrompe
  polling e não depende de Redis/stream para consistência.

### Cenário 21 — Bridge interno autenticado e idempotente

- Forma de validar: teste de contrato HTTP entre adapters API/Nitro com relógio e
  starter determinísticos.
- Given: existe job persistido e a API conhece a URL do deployment Workflow
  correspondente.
- When: envia o envelope v1 assinado, perde a primeira resposta por timeout e repete
  exatamente `cloneJobId+generation`; também são tentadas assinatura alterada,
  timestamp expirado e versão desconhecida.
- Then: a chamada válida recebe/reconcilia `202` com a execução lógica correlacionada;
  as inválidas são rejeitadas antes de side effects com status+code estáveis; há uma
  única execução lógica/destino mesmo na janela de queda, e nenhum dado pessoal,
  snapshot ou segredo aparece no contrato ou nos logs.

### Cenário 22 — Projeto Nitro independente e executável

- Forma de validar: gates do workspace, teste integrado local do Workflow e deploy
  de preview dos projetos relacionados.
- Given: `workflow/` está incluído no workspace e API, UI e Workflow são projetos
  Vercel separados do mesmo repositório.
- When: lint, typecheck, unitários, cobertura, build Nitro e smoke de preview são
  executados, e o processo API é reiniciado durante um clone.
- Then: o projeto possui configurações e documentação próprias, todos os gates da
  raiz o abrangem, as diretivas/rotas oficiais são geradas sem prerelease, o run
  continua no deployment Nitro e API/Workflow não importam internos entre si.

## Estratégia de entrega e compatibilidade

1. Fazer primeiro um spike executável mínimo em `workflow/` com `nitropack` v2 e
   Workflow v4 estáveis: dev local, build de produção, diretivas, runtime local,
   `@workflow/vitest` e preview Vercel. Inspecionar lockfile para prereleases. Se o
   SDK exigir Nitro 3/Workflow 5 beta ou falhar no runtime Vercel, retornar à
   especificação antes de alterar contratos de produto.
2. Estruturar `workflow/` como aplicação completa do workspace: pacote privado,
   TypeScript estrito, ESLint raiz com escopo próprio, Prettier raiz, Vitest,
   cobertura, Sonar, scripts, ambiente de exemplo e SDD local. Adicionar o projeto
   aos agregadores e ao CI antes de implementar o domínio de clone.
3. Registrar a ADR e introduzir schemas/índices do catálogo, ponteiro ativo e clone
   job sem separar a árvore de `training_plans`.
4. Evoluir `@dall-fit/types`, bridge interno versionado, produtor API, consumidor
   Nitro, consumidores UI, handlers e testes de contrato de forma atômica.
5. Criar controllers/commands pessoais separados e extrair do domínio global
   somente reutilização real por escopo tipado, preservando autorização e logs.
6. Implementar persistência anterior ao start, resolver de URL por Related
   Projects/fallback explícito, assinatura HMAC e endpoint Nitro idempotente. O
   preview deve provar pareamento correto de ambiente e rejeição de requests
   inválidas antes de habilitar a ação na UI.
7. Adicionar Workflow fino, steps idempotentes, services/repositories locais,
   adapter de Blob copy, retenção de origem e compensação; validar retomada em
   runtime local e preview entre invocações.
8. Entregar menu, lista, biblioteca, radios e os três modos discriminados nas rotas
   pessoais; manter globais administrativas funcionando mesmo se o Workflow estiver
   temporariamente indisponível.
9. Acrescentar métricas e aviso de impacto administrativo depois que o catálogo for
   fonte confiável dos vínculos.
10. Não há backfill de planos pessoais preexistentes, pois o produto ainda não os
    oferece. Planos globais existentes passam a ser elegíveis à biblioteca e começam
    com contadores zero.
11. Publicar/promover primeiro a versão do Workflow que aceita o contrato interno e
    depois a API produtora. Falha de rollout desabilita somente iniciar/repetir clone
    com erro explícito; jobs iniciados continuam no deployment Nitro de origem.
12. Atualizar SDDs vivos, seeds/cURLs, rotas, flows, documentação do workspace e
    instruções do projeto somente junto da implementação autorizada; revisar e
    remover símbolos/arquivos sem uso em API, UI, Workflow e packages.

## Plano de testes

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

- Unitários da API:
  - escopo global/owned/reference e rejeição de combinações impossíveis;
  - criação de árvore+catálogo, referência única, ativação e limpeza de ponteiro;
  - contagens `linked/active` e exclusão global com referências;
  - snapshot, transições válidas do job, geração, retry, cancelamento e corrida com
    finalização;
  - criação do snapshot/job antes do start e transições diante de aceitação, erro,
    timeout ambíguo e retry;
  - resolver Related Projects/fallback, canonicalização, assinatura e adapter HTTP
    com relógio/client substituídos;
  - classificação de erros transitórios e permanentes sem retry indevido.
- E2E da API, serial com Nest/MongoDB/Redis efêmeros:
  - todos os endpoints pessoais com autenticação, ownership, DTOs, status, codes,
    headers e limites;
  - CRUD próprio completo, CAS e mídia;
  - referência viva, duplicidade, read-only e exclusão visual/desvinculação;
  - ponteiro ativo e todos os caminhos que o deixam vazio;
  - métricas e exclusão global com dangling invisível/cleanup idempotente;
  - persistência dos jobs, geração, cancelamento e observação da finalização única;
  - adapter de start determinístico sem rede Vercel, preservando Mongo/Redis reais.
- Unitários do Workflow:
  - validação do envelope interno, tamanho, versão, timestamp, HMAC em tempo
    constante e rejeição anterior a side effects;
  - máquina de estados/geração, idempotência do start e correlação do mesmo run;
  - batches de mídia, limites de concorrência, pathnames determinísticos, retenção,
    ETag, idempotência e compensação;
  - cancelamento cooperativo, disputa com finalização, retry e classificação de
    falhas, com MongoDB, Blob, relógio e starter substituídos por ports tipados;
  - logging sanitizado sem corpo, assinatura, segredo, mídia ou dado pessoal.
- Integrados do Workflow:
  - runtime oficial local com `@workflow/vitest`, reexecução de step, retomada,
    geração obsoleta e finalização exatamente uma vez;
  - handler Nitro real e bridge assinado com MongoDB efêmero e adapters Blob
    determinísticos, sem rede ou credenciais Vercel;
  - contrato API→Nitro compartilhado testado nas duas pontas, incluindo timeout e
    replay da mesma chave;
  - nenhuma suíte raiz `test:integration` é criada para o Workflow; esses testes
    usam `pnpm -C workflow test:workflow`, rodam serialmente quando compartilham
    runtime/fixtures e também integram `pnpm test`.
- Unitários/componentes da UI:
  - união discriminada e composição dos modos `global-admin`, `personal-owned`,
    `personal-global-reference` e `clone-job`;
  - dropdown, modal, resumo limitado, ações e estados duplicados/bloqueados;
  - RadioGroup controlado, nomes, posição da coluna, realce discreto e nenhum
    deselect;
  - modos editável/read-only e ação de catálogo independente;
  - job queued/running/cancelling/failed, retry, remove, polling e teardown;
  - otimismos/rollbacks mínimos, toasts, foco e Analytics únicos.
- MSW e Playwright:
  - menu para pessoa/admin; lista vazia, mista e paginada;
  - criar sem ativar, usar, navegar read-only, desvincular e ativar;
  - clone sucesso/falha/retry/cancelamento e origem bloqueada;
  - admin vê impacto, altera global observado pela referência e exclui deixando
    pessoa sem ativo;
  - desktop/mobile, teclado, foco, tabela válida e ausência de API real ou
    `page.route`.
- Workflow/build:
  - descoberta e transformação das diretivas no build Nitro 2 estável;
  - build smoke confirma artefato `.output`, handlers internos e rotas oficiais
    geradas sem import não resolvido de pacote irmão;
  - execução local durável, retry de step, retomada e inspeção sanitizada;
  - preview na Vercel confirma OIDC, Blob copy privado, continuidade entre
    invocações, Related Projects/fallback correto e ausência de dependência de
    Queue/worker/Cron/Services;
  - smoke não inclui dados pessoais ou blobs reais de produção.
- Regressão:
  - CRUD global, CAS, fila por aggregate, SSE, signed URLs, renovação, mídia,
    reconciliação, autenticação, menu, tema e logout permanecem aprovados.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm -C workflow test:workflow`, também agregado por `pnpm test` e sem ocupar
    `pnpm test:integration`;
  - `pnpm test:integration`.

## Riscos e decisões

- Uma referência viva maximiza reaproveitamento, mas uma edição global afeta
  imediatamente todas as pessoas vinculadas. Os contadores e avisos administrativos
  tornam o impacto visível; não criam aprovação ou bloqueio.
- Excluir global com referências pode atravessar documentos/coleções sem transação
  comum com Blob. A experiência canônica filtra imediatamente o global ausente,
  interpreta ativo dangling como vazio e usa cleanup idempotente; não expõe estado
  quebrado enquanto a convergência ocorre.
- `owned` e `global-reference` compartilham apresentação, mas não autorização. Uma
  flag informal espalhada pelo editor favoreceria regressões; a união discriminada
  e branches exaustivos mantêm modos impossíveis fora do tipo.
- A referência é read-only quanto ao conteúdo, mas ainda pode ser excluída do
  catálogo. Essa não é uma capability contraditória: remover a associação pessoal
  não é apagar o plano global.
- Radio comunica seleção mutuamente exclusiva melhor que switch. Como ausência de
  ativo é válida, o grupo é controlado e não `required`; a UI não oferece uma ação
  de desmarcar o item atual.
- Mostrar a linha do job preserva feedback sem tornar o plano parcial navegável.
  Misturar jobs e planos exige read model/paginação do servidor para evitar ordem e
  total divergentes.
- Workflow remove a necessidade de worker, Queue e encadeamento manual, mas cada
  step continua uma Function e consome cotas. Lotes limitados e ausência de polling
  ocioso controlam duração e custo; o plano Hobby não é garantia para uso comercial.
- Separar API e Workflow adiciona uma chamada HTTP e dois ciclos de deploy. Essa
  fronteira é intencional: mantém Nest fora do bundler do Workflow e evita Vercel
  Services beta. HMAC, Related Projects, contrato versionado e start idempotente
  tratam autenticação, pareamento de ambiente, rollout e timeout ambíguo.
- A chamada HTTP serve somente para iniciar/reconciliar o run. Fazer cada step
  atravessar a API aumentaria acoplamento, latência e indisponibilidade; o Nitro usa
  MongoDB e Blob diretamente com configuração própria e filtros de job/geração.
- O Workflow é durável, porém side effects externos continuam at-least-once na
  prática. Pathnames determinísticos, geração e `cloneJobId` único são requisitos,
  não otimizações.
- Cancelar diretamente o run pode impedir cleanup. O produto usa cancelamento
  cooperativo; `Run.cancel()` é mecanismo operacional acompanhado de compensação
  separada.
- Admin pode excluir a origem durante a clonagem. Reter keys pelo job concilia essa
  permissão com o snapshot; remover fisicamente antes do terminal produziria falha
  evitável e violaria a clonagem independente.
- Contadores podem mudar entre renderização e confirmação. Eles são orientação de
  impacto, não precondição de exclusão; o backend sempre executa contra o estado
  autorizado atual.
- Colocar radios em tabela pode produzir marcação inválida se `RadioGroup` envolver
  elementos estruturais incorretos. A composição deve preservar semântica de grupo
  e tabela conforme HeroUI/React Aria, validada em browser e testes de acessibilidade.
- O módulo `workflow/nitro` adiciona transformação de build e fronteira de
  serialização. Capturar handlers, clients ou request context no corpo do Workflow
  é proibido. Imports de pacotes irmãos alcançados por diretivas também exigem smoke
  real porque o bundler possui fronteira própria; os módulos duráveis devem preferir
  primitivos e código local.
- O nome atual `nitro` no npm representa a linha 3 beta, enquanto a linha 2 estável
  é publicada como `nitropack`. Esta feature escolhe Nitro 2 estável; a
  incompatibilidade entre `workflow/nitro`, Node 24, `nitropack` 2 ou Vercel devolve
  a demanda à especificação, sem trocar silenciosamente para prerelease.
- Related Projects cobre deployments Git do mesmo repositório, mas não todos os
  fluxos de CLI/local. Por isso `WORKFLOW_BASE_URL` é fallback explícito e validado;
  nunca se presume que um preview possa chamar produção.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- ADR de catálogo pessoal e clonagem durável registrada
- Aplicação `workflow/` Nitro criada como pacote do workspace e projeto Vercel
  separado, com SDD, configuração e ciclo de deploy próprios
- Fronteiras global/pessoal separadas e núcleo reutilizado por escopo tipado
- Referências globais vivas, somente leitura e removíveis do catálogo
- Clone invisível, idempotente, cancelável e com mídia privada independente
- Plano ativo opcional, radio acessível e nenhum fallback automático
- Impacto administrativo visível sem bloquear edição ou exclusão
- MSW, mocks unitários, testes do Workflow e E2E atualizados conforme o impacto
- Lint, typecheck, cobertura, build, Sonar, CI e agregadores da raiz abrangem o novo
  projeto sem configuração paralela de Prettier ou lockfile próprio
- Migração entre produtor e consumidores compatível
- Bridge API→Workflow versionado, assinado, idempotente e pareado por ambiente
- Workflow v4 e Nitro 2 estáveis validados em local/build/preview, sem Queue,
  Services ou dependência beta
- Ownership, OIDC, URLs assinadas, logs e privacidade preservados
- Revisão de código sem uso concluída em API, UI, Workflow e packages
- Quality gates da raiz e suítes adicionais aprovados
