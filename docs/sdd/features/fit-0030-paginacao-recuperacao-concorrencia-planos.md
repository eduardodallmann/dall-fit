# Feature Spec: Paginação, recuperação e concorrência nas mutações de planos

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0030`](https://github.com/eduardodallmann/dall-fit/issues/30).
- Problema: a gestão administrativa de planos evoluiu desde a abertura do ticket,
  principalmente com a versão do aggregate em `X-Resource-Version`, o CAS do
  backend e a fila FIFO do editor entregues pela `FIT-0028`, além da correção do
  falso `412` na `FIT-0047`. Ainda assim, a UI materializa todos os links de página,
  pode apresentar uma página solicitada acima da última página real, fecha
  formulários antes da confirmação da mutation, restaura snapshots amplos que
  sobrescrevem alterações concorrentes e não coordena todas as mutações do mesmo
  plano. No editor, drafts de autosave podem deixar de ser considerados pendentes
  antes do sucesso, operações estruturais podem usar IDs temporários ou snapshots
  obsoletos e uma exclusão durante o debounce pode perder o trabalho local.
- Resultado: a listagem usa URL canônica e janela de paginação limitada; formulários
  e confirmações permanecem recuperáveis até o resultado terminal; conflitos de
  versão recebem tratamento uniforme e explícito; mutações do mesmo aggregate são
  coordenadas sem bloquear planos diferentes; rollbacks alteram somente o alvo da
  operação; e o editor preserva drafts, ordem e intenção da pessoa administradora
  durante falhas, filas, exclusões e navegação.
- Referências locais:
  - `docs/sdd/features/fit-0005-gestao-planos-treino-globais.md`;
  - `docs/sdd/features/fit-0028-editor-exercicios-escalabilidade-concorrencia.md`;
  - `docs/sdd/features/fit-0047-corrigir-falso-conflito-vercel.md`;
  - `docs/sdd/adr/ADR-0005-limites-concorrencia-e-midia-dos-planos.md`;
  - `docs/sdd/adr/ADR-0006-versao-de-recurso-em-header-de-dominio.md`;
  - `docs/sdd/flows/gestao-planos-treino-globais.md`;
  - `api/docs/sdd/endpoints/global-training-plans.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/02-rotas-e-comportamento.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/base/04-testes-e-qualidade.md`;
  - `ui/docs/sdd/base/05-mocks-de-api.md`;
  - `ui/docs/sdd/base/07-testes-integrados-playwright.md`;
  - `ui/docs/sdd/routes/global-training-plan.md`;
  - `ui/docs/sdd/routes/global-training-plan-detail.md`;
  - `ui/docs/sdd/routes/global-training-plan-workout.md`.
- Referências oficiais consultadas no planejamento:
  - HeroUI 3.2 instalado: [Pagination composta e
    elipses](https://heroui.com/en/docs/react/components/pagination) e
    [Modal controlada e comportamento de
    dismiss](https://heroui.com/en/docs/react/components/modal);
  - TanStack Query 5.101 instalado: [mutações e escopos
    seriais](https://tanstack.com/query/v5/docs/framework/react/guides/mutations),
    [atualizações
    otimistas](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates)
    e [`QueryClient`](https://tanstack.com/query/v5/docs/reference/QueryClient);
  - TanStack Router 1.170 instalado: [search params validados e
    tipados](https://tanstack.com/router/latest/docs/guide/search-params) e
    [bloqueio de
    navegação](https://tanstack.com/router/latest/docs/guide/navigation-blocking);
  - TanStack Form 1.33 instalado: [estado de submissão
    assíncrona](https://tanstack.com/form/latest/docs/reference/interfaces/FormState).
- Features relacionadas:
  - `FIT-0005` criou a listagem, os formulários e as mutações otimistas originais;
  - `FIT-0028` introduziu o limite HTTP de página 100, a concorrência por versão e
    o editor com autosave e fila por aggregate;
  - `FIT-0035` define o catálogo de Analytics que deve continuar emitindo um início
    e um único terminal por operação;
  - `FIT-0047` consolidou `X-Resource-Version` como única fonte do conflito de
    domínio e não deve ser revertida.

## Escopo

### Incluído

- modelo determinístico e limitado de itens da paginação, com primeira página,
  última página, vizinhança da atual e elipses;
- teto de 100 páginas também no cálculo visual, mesmo quando `total` exceder 2000;
- canonicalização do search param `page` antes da consulta e depois que o `total`
  revelar que a página solicitada não existe;
- preservação de drafts e do overlay ou modo de edição durante submissão, falha
  genérica e conflito de versão;
- fechamento de modal, formulário inline e confirmação somente depois do sucesso
  correspondente;
- tratamento compartilhado de `412 TRAINING_PLAN_VERSION_CONFLICT` na lista, no
  detalhe e no editor de workout;
- coordenação FIFO por `trainingPlanId` para toda mutação de aggregate existente,
  com propagação da versão resultante e pausa em conflito;
- independência entre mutações de planos diferentes e entre a criação de um plano
  ainda sem ID e os aggregates existentes;
- snapshots mínimos e rollbacks condicionais por entidade, campo, item temporário
  ou posição, sem restaurar coleções e detalhes inteiros;
- estado explícito de valor confirmado, draft, patch dirty, revisão e erro no
  autosave de cada exercício;
- retry explícito de autosave com o draft corrente;
- coordenação segura entre adição, reordenação e exclusão, impedindo IDs temporários
  e snapshots estruturais obsoletos;
- preservação e restauração de draft ao excluir durante debounce ou depois de uma
  falha de autosave;
- bloqueio de todas as gravações do plano quando a fila estiver pausada por conflito;
- proteção de navegação enquanto houver draft, debounce, mutation enfileirada,
  mutation em execução ou falha recuperável;
- término explícito das promises disparadas por formulário, confirmação,
  navegação, refetch, retry e operações do editor;
- handlers, estado e cenários determinísticos de MSW para paginação, concorrência,
  falhas e recuperação;
- unitários, testes de componentes e Playwright proporcionais aos riscos;
- atualização dos SDDs vivos afetados somente durante a implementação autorizada.

### Não incluído

- alterar qualquer endpoint, status, código de erro, body ou header da API;
- substituir `X-Resource-Version`, reintroduzir ETag/`If-Match` ou modificar o CAS;
- mudar contratos ou exports de `@dall-fit/types`;
- trocar paginação por offset por cursor, mudar `pageSize: 20`, permitir página
  acima de 100, adicionar busca, filtros ou ordenação configurável;
- merge automático após `412`, reenvio silencioso de mutation ou resolução de
  conflito baseada em `message`;
- serialização global entre planos diferentes, lock no backend, Redis, broker ou
  persistência offline da fila;
- mudar regras, campos, limites, tipos ou endpoints de exercícios e imagens;
- criar um componente próprio quando a composição vigente do HeroUI atender;
- alterar autenticação, autorização, CSRF, rate limit, Analytics ou privacidade;
- screenshots ou regressão visual, pois não existem arquivos nas pastas de assets
  das três rotas afetadas.

## Projetos e documentação afetados

- API e endpoints:
  - nenhum arquivo de produção, contrato ou endpoint deve mudar;
  - `GET /global/training-plans` continua aceitando somente páginas 1–100, com 20
    itens, e pode responder uma página válida sem itens quando ela estiver acima da
    última página existente;
  - as quinze operações e `X-Resource-Version` permanecem conforme
    `api/docs/sdd/endpoints/global-training-plans.md`;
  - se a implementação descobrir necessidade real de mudança HTTP, esta feature
    volta à especificação antes de qualquer alteração na API.
- UI e rotas:
  - atualizar a árvore manual em `routes.tsx` somente quanto à validação e
    canonicalização do search param vigente, sem roteamento por arquivos;
  - corrigir lista, formulários compartilhados, detalhe, mutations e editor sob
    `ui/src/routes/training-plan/`;
  - manter componentes exclusivos próximos às rotas; helpers reutilizados pelas
    três telas podem permanecer no domínio de `training-plan`;
  - atualizar `ui/docs/sdd/base/01-arquitetura.md`,
    `02-rotas-e-comportamento.md`, `04-testes-e-qualidade.md`,
    `05-mocks-de-api.md` e `07-testes-integrados-playwright.md` quando seus trechos
    vigentes forem afetados;
  - atualizar os três documentos `global-training-plan*.md` para a nova verdade.
- Fluxos:
  - atualizar `docs/sdd/flows/gestao-planos-treino-globais.md` com página canônica,
    permanência dos formulários, coordenação por aggregate e recuperação de draft.
- Contratos em `@dall-fit/types`:
  - nenhuma mudança; tokens de mutation, revisões de draft, itens de paginação e
    estado da fila são tipos internos da UI.
- Decisões arquiteturais:
  - nenhuma ADR nova; a coordenação mantém a decisão da `ADR-0005` de serializar
    mutations do mesmo plano no cliente e a `ADR-0006` para classificar versão;
  - a implementação não altera limites difíceis de reverter nem ownership.
- Handlers e fixtures MSW:
  - ampliar os cenários de `training-plans` com volume acima de 2000, página acima
    do último resultado, latências controláveis, sucesso/falha intercalados,
    conflito, autosave, reordenação e exclusão durante debounce;
  - o estado por cenário valida a versão recebida, incrementa-a somente em sucesso
    e é reiniciado por teste;
  - seletores continuam exclusivos do ambiente com MSW e não entram no contrato da
    API nem nas chamadas quando MSW estiver desabilitado.
- Mocks de repositories/caches nos unitários da API:
  - não se aplica; nenhum código ou comportamento da API muda.
- Fixtures MongoDB/Redis nos E2E:
  - não se aplica; nenhum endpoint, wiring, MongoDB ou Redis muda e os cenários da
    UI permanecem na fronteira HTTP simulada pelo MSW.

## Requisitos funcionais

### URL e paginação da listagem

1. A UI usa `pageSize: 20` e calcula
   `lastPage = min(100, max(1, ceil(total / pageSize)))`. Valor de `pageSize`
   ausente, zero ou inválido não é tolerado silenciosamente como contrato novo: é
   uma falha da response tratada pela fronteira HTTP vigente.
2. A URL canônica omite `page` na página 1. Páginas 2–100 são representadas por um
   número inteiro decimal sem fração, sinal, zero à esquerda ou forma alternativa.
3. Ausência de `page` representa 1. Valor vazio, string, booleano, `null`, fração,
   `NaN`, infinito, zero, negativo, forma não canônica ou número acima de 100 é
   substituído pela URL da página 1 antes de consultar a coleção.
4. A substituição usa navegação com `replace`, preserva os demais search params
   válidos — inclusive seletores locais de MSW — e não cria uma entrada de histórico
   que leve de volta à URL inválida.
5. Depois de uma response bem-sucedida, se a página solicitada for maior que
   `lastPage`, a rota substitui a URL pela última página, omite `page` quando ela
   for 1 e consulta o destino. A response vazia da página excedente não é
   apresentada como coleção global vazia nem como `Página 100 de 2`.
6. Correções decorrentes de exclusão, mudança concorrente do `total` ou refetch
   seguem a mesma regra e nunca produzem navegação em ciclo.
7. Quando `lastPage <= 1`, a navegação paginada não aparece. Quando aparecer, a
   summary informa `Página <atual> de <última>` e a página ativa usa a semântica
   `aria-current` do HeroUI.
8. A lista visual possui no máximo sete posições entre links e elipses:
   - até sete páginas: mostrar todas;
   - página atual de 1 a 4: mostrar `1 2 3 4 5 … última`;
   - página atual da quarta posição final em diante: mostrar
     `1 … última-4 última-3 última-2 última-1 última`;
   - demais páginas: mostrar `1 … atual-1 atual atual+1 … última`.
9. A composição usa `Pagination`, `Pagination.Content`, `Pagination.Item`,
   `Pagination.Link`, `Pagination.Ellipsis`, `Pagination.Previous` e
   `Pagination.Next` do HeroUI. Elipses não são interativas; links, anterior e
   próximo navegam para search params canônicos e possuem nomes acessíveis.
10. O cálculo do modelo de paginação é uma função pura, não aloca array proporcional
    ao total de páginas e é compartilhado por renderização e testes.

### Ciclo de vida de formulários e confirmações

11. Criar e editar plano pela lista mantém a `Modal` aberta durante toda a
    mutation. Editar plano no detalhe e nome do workout mantém o modo inline ativo.
12. Durante a submissão, campos e ações que alterariam o mesmo draft, confirmação
    duplicada, `Cancelar`, close trigger, backdrop e `Escape` ficam desabilitados.
    A UI mantém foco no contexto e anuncia o estado de processamento.
13. Sucesso aplica a response canônica, encerra o estado pending, fecha o overlay
    ou modo inline e restaura foco no trigger ou próximo destino válido.
14. Falha genérica encerra loading, restaura somente o cache otimista desta
    mutation e mantém exatamente os valores digitados. O formulário continua
    aberto e editável com erro persistente, retry e opção de cancelar; toast é
    complementar.
15. Na criação, a ida otimista à página 1 é revertida somente se ainda for a
    navegação produzida pela própria mutation. Falha remove somente o item
    temporário dessa criação e preserva alterações posteriores nas páginas.
16. `AlertDialog` de exclusão de plano ou workout permanece aberto e não pode ser
    dispensado enquanto o DELETE estiver pendente. Sucesso fecha o diálogo; falha
    restaura somente o item alvo, deixa o diálogo aberto com mensagem persistente e
    permite retry ou cancelamento.
17. A criação de workout continua aguardando o ID real. O controle permanece
    pending até cache e navegação tipada terminarem; falha não cria ID temporário,
    não navega e reabilita a ação.
18. `ui_overlay_opened` continua sendo emitido ao abrir. `ui_overlay_closed` é
    emitido apenas no fechamento real depois de sucesso ou em cancelamento
    permitido, com o motivo vigente correspondente. Cada operação conserva um
    único `ui_operation_started` e um único terminal `success|error`.

### Coordenação por aggregate e versão

19. Toda mutation de um plano existente, originada na lista, detalhe ou editor,
    entra em um coordenador único com chave `trainingPlanId`. A criação de plano,
    que ainda não possui aggregate existente, não entra nessa fila.
20. O coordenador vive no escopo do `QueryClient`, e não no ciclo de vida de uma
    tela. Navegar entre lista, detalhe e workout não cria uma segunda fila para o
    mesmo plano enquanto houver trabalho pendente.
21. Cada tarefa recebe a versão somente quando alcançar o início da fila. Sucesso
    atualiza a versão corrente com o `X-Resource-Version` validado pela camada de
    serviço; a próxima tarefa usa esse valor. A versão capturada no clique não pode
    ser reutilizada por uma tarefa que esperou outra mutation.
22. Mutações do mesmo plano executam em FIFO. Mutações de planos diferentes usam
    filas diferentes e podem executar em paralelo. Uma falha genérica não altera a
    versão e permite que a próxima tarefa segura continue.
23. O efeito otimista associado à mutation só começa quando a tarefa alcança a
    cabeça da fila. Uma tarefa apenas enfileirada pode indicar espera, mas não cria
    snapshot estrutural antecipado.
24. O coordenador não faz retry automático. Uma mutation nova só nasce de ação
    explícita, novo debounce ou retry permitido pelo requisito correspondente.
25. Conflito existe apenas quando o status é `412` e o `code` é exatamente
    `TRAINING_PLAN_VERSION_CONFLICT`. Nenhuma lógica usa texto de `message`, erro
    Axios genérico, outro `412` ou ausência do header como sinônimo.
26. Em conflito, o efeito otimista da operação é desfeito de forma localizada, a
    fila daquele plano pausa antes da próxima tarefa e drafts/tarefas ainda não
    enviadas permanecem locais. Filas de outros planos continuam funcionando.
27. Lista, detalhe e workout mostram um `Alert` persistente de conflito e a ação
    `Recarregar dados`. Enquanto pausado, nenhum controle pode iniciar ou enfileirar
    gravação daquele plano; controles de leitura, cancelamento local seguro e
    mutações de outros planos permanecem disponíveis.
28. `Recarregar dados` informa que os drafts serão descartados e exige confirmação
    quando existir trabalho local. O refetch usa a query proprietária da tela e
    mantém fila e drafts pausados até obter uma response canônica válida.
29. Somente depois do refetch bem-sucedido a UI substitui o dado local, descarta
    drafts confirmados para descarte, reinicializa a versão e libera gravações.
    Falha de refetch conserva `Alert`, fila pausada e drafts, com retry de leitura.
30. A UI nunca aplica merge implícito com a versão externa nem reenvia a mutation
    que recebeu `412`. Se o recurso tiver sido removido, o estado not-found vigente
    substitui a recuperação de conflito depois da leitura confirmá-lo.

### Atualização otimista e rollback localizado

31. Cancelamentos e invalidações usam somente famílias de lista, detalhe ou workout
    realmente afetadas. Nenhuma mutation desta feature cancela, invalida ou restaura
    `trainingPlanKeys.all` por conveniência.
32. O contexto de mutation registra, por query afetada, apenas o alvo anterior, a
    referência ou token otimista produzido e os metadados mínimos para desfazer a
    própria alteração. Objetos de response permanecem imutáveis.
33. Rollback de edição substitui campos do alvo somente quando o cache ainda contém
    o valor otimista dessa mutation. Linhas e campos alterados depois, especialmente
    os de outro plano, são preservados.
34. Rollback de criação remove somente o ID temporário da própria operação e corrige
    `total` apenas onde a inserção ainda existir. Não restaura arrays completos.
35. Rollback de exclusão reinsere o alvo somente se ele continuar ausente, na
    posição relativa registrada entre vizinhos sobreviventes, e corrige `total`
    somente onde a remoção desta mutation ainda estiver aplicada.
36. Exclusão de plano remove seu cache de detalhe somente depois do sucesso. Em
    pending, apenas a representação necessária à lista muda; isso evita recriar
    detalhes inteiros em rollback.
37. Exclusão de workout restaura somente o workout alvo com seu `exerciseCount` e
    posição, sem substituir nome, descrição, versão ou outros workouts que tenham
    mudado.
38. Resposta canônica substitui somente o alvo da mutation. O settle invalida as
    queries relevantes para reconciliação, sem apagar cache válido nem criar loading
    inicial quando já houver dados.

### Drafts e autosave do editor de workout

39. Cada exercício mantém no estado proprietário do editor:
    - representação confirmada pelo servidor;
    - draft visível;
    - patch dirty por campo;
    - revisão monotônica das edições locais;
    - estado `idle|debouncing|queued|saving|error` e erro seguro opcional.
40. Esse estado não pertence somente ao componente visual da linha. Reordenação,
    remoção temporária ou remount não podem apagar draft, timer ou erro sem decisão
    explícita.
41. Cada linha conserva debounce independente de três segundos. A janela combina
    as últimas alterações por campo e enfileira um PATCH com somente os campos dirty
    válidos daquele exercício.
42. Disparar o debounce não limpa o patch, não encerra o estado dirty e não libera
    o bloqueio de navegação. O PATCH captura patch e revisão, mas novas edições
    continuam acumuladas no draft.
43. Em sucesso, a response canônica atualiza o confirmado. Somente campos cuja
    revisão não mudou desde o envio saem do patch dirty e recebem normalização da
    API; campos editados durante o request permanecem no draft e ganham nova
    passagem de autosave.
44. Em falha genérica, o patch e o draft permanecem, o estado vira `error`, o erro é
    anunciado junto à linha e surge `Tentar novamente`. O retry envia o patch dirty
    mais recente; uma nova edição também rearma o debounce. Não há toast de sucesso.
45. Miniatura YouTube continua derivada do valor visível. Falha de normalização não
    substitui o draft pelo ID confirmado; sucesso usa o ID canônico somente se o
    campo não tiver sido editado depois do request.
46. Edição e salvamento do nome do workout seguem a mesma distinção entre valor
    confirmado e draft. Falha reabre ou mantém o editor com o texto digitado; não
    fecha antes do sucesso.

### Operações estruturais do editor

47. Adição, exclusão e reordenação são operações estruturais. No máximo uma delas
    pode ficar enfileirada ou em execução por workout; seus controles ficam
    desabilitados até o resultado terminal. Campos de exercícios persistidos
    continuam editáveis e seus autosaves aguardam a fila do aggregate.
48. Ao adicionar, a linha temporária aparece ao fim em estado de criação. Seus
    campos, handle, imagem e exclusão permanecem desabilitados até o ID real chegar;
    nenhum request ou ordem pode conter o ID `temporary-*`.
49. Sucesso da adição troca somente o ID temporário e os defaults pela response
    canônica. Falha remove somente essa linha temporária e mantém os demais drafts e
    a ordem corrente.
50. Reordenação captura a ordem de IDs persistidos quando alcança a cabeça da fila.
    Falha restaura somente a ordem relativa anterior, reaplicando-a aos objetos e
    drafts correntes em vez de restaurar um snapshot de exercícios completos.
51. Excluir durante um debounce cancela o timer não iniciado e registra exercício,
    draft, patch dirty, estado e vizinhos da posição antes da remoção otimista. Se
    um PATCH já estiver na fila, o DELETE vem depois dele e recebe sua nova versão.
52. Sucesso do DELETE descarta o estado capturado. Falha reinsere a linha entre os
    vizinhos sobreviventes, com draft e patch dirty intactos, sem disparar autosave
    oculto; a pessoa escolhe retry de salvamento, nova edição ou nova exclusão.
53. Enquanto houver conflito, handle, adicionar, excluir, upload/substituição/
    remoção de imagem, salvar nome e dispatch/retry de autosave ficam desabilitados.
    Campos textuais podem continuar recebendo edição local e permanecem dirty para
    que a pessoa possa consultar o trabalho antes de decidir pela recarga.
54. Estados de saving, waiting, error e conflict são textuais ou possuem nome
    acessível; spinner, cor ou toast nunca são a única indicação.

### Navegação, promises e término das operações

55. A rota bloqueia navegação interna quando existir nome dirty, patch dirty,
    debounce ativo, tarefa enfileirada/em execução, linha temporária, operação
    estrutural ou erro recuperável. O diálogo acessível permite permanecer ou sair
    descartando o trabalho local.
56. `beforeunload` é habilitado somente enquanto a mesma condição existir e serve
    apenas como aviso do navegador. Não executa request síncrona, não promete flush
    e não substitui o bloqueio tipado do TanStack Router.
57. Confirmar saída cancela timers ainda não disparados e descarta somente estado
    local; requests já iniciadas podem terminar normalmente. Permanecer restaura
    foco ao editor sem perder dados.
58. Toda promise criada por `form.handleSubmit`, confirmação, fila, mutation,
    `navigate`, `refetch`, reload de conflito ou callback assíncrono termina em
    `await` dentro de handler protegido ou em `void` acompanhado de `catch` terminal
    que registra Analytics/feedback uma única vez.
59. `toast.promise` não é considerado, sozinho, tratamento da rejeição. Erros
    esperados não chegam a `unhandledrejection`, não geram toast duplicado e não
    deixam controles em pending.

## Requisitos não funcionais

- Acessibilidade:
  - paginação é uma navegação semântica, anuncia página atual e desabilita anterior
    ou próximo nos limites;
  - elipses não recebem foco e todos os links têm nome contextual;
  - modal e dialog preservam contenção/restauração de foco e bloqueiam dismiss
    durante pending sem remover uma saída depois da falha;
  - erro de formulário ou linha é persistente, associado ao contexto e não depende
    de toast ou cor;
  - estados queued, saving, error, conflict e dirty são anunciáveis sem live region
    ruidosa a cada tecla;
  - reordenação continua operável por ponteiro e teclado, e controles desabilitados
    explicam seu estado pelo nome ou texto próximo;
  - confirmação de recarga e bloqueio de navegação usam `AlertDialog` HeroUI.
- Performance:
  - o modelo de paginação tem custo e tamanho constantes, limitado a sete posições;
  - não existe cópia ou restauração indiscriminada de todas as listas e detalhes;
  - atualizações de cache percorrem apenas queries da família necessária e alteram
    somente a entidade alvo;
  - coordenação é por plano e não reduz paralelismo entre aggregates;
  - debounce conserva no máximo um patch pendente por linha e coalesce campos;
  - nenhuma request adicional de detalhe é criada para abrir a edição da lista.
- Segurança e privacidade:
  - proteção `adminRoute`, CSRF, origem, headers e regras da API permanecem;
  - drafts ficam somente em memória e não vão para URL, Analytics, storage ou logs;
  - Analytics não recebe IDs, nomes, descrições, valores, ordem, versão, URL,
    arquivos, código externo ou seletor `mock*`;
  - erros visíveis usam mensagens seguras e lógica por status/código estável;
  - seletores MSW são removidos da request quando mocking estiver desabilitado.
- Observabilidade:
  - preservar o catálogo tipado vigente de início/terminal, overlay, retry e
    conflito, sem novos eventos para cada transição interna da fila;
  - cada tentativa aceita possui exatamente um terminal, inclusive falha de
    navegação ou refetch iniciado por controle da UI;
  - conflito continua distinguível de falha genérica pelo outcome e operação já
    existentes, sem incluir dados do aggregate;
  - nenhuma mudança de logging da API é necessária.
- Confiabilidade e manutenção:
  - funções puras determinam itens de paginação, patches confirmados, rollbacks e
    restauração de ordem;
  - estados impossíveis são representados por unions internas discriminadas em vez
    de combinações livres de booleanos;
  - não adicionar dependência: usar React 19, HeroUI, TanStack Query/Router/Form,
    dnd kit, Axios, MSW, Vitest e Playwright já instalados;
  - componentes HeroUI são compostos conforme a API v3; classes e variantes ficam
    em `styles.ts`, sem Tailwind literal ou estilo inline no JSX;
  - ao final, remover helpers, wrappers, estados, imports e arquivos substituídos
    que não tenham uso direto ou indireto.

## Critérios de aceite

### Cenário 1 — Paginação grande permanece limitada

- Forma de validar:
  `http://localhost:3000/global/training-plan?page=50&mockAuth=admin&mockTrainingPlans=large-pagination`.
- Given: o MSW devolve mais de 2000 planos e `pageSize: 20`.
- When: a página 50 é exibida.
- Then: a summary mostra `Página 50 de 100`; aparecem exatamente
  `1 … 49 50 51 … 100`, sem array ou DOM proporcional ao total, e anterior/próximo
  navegam por URLs canônicas.

### Cenário 2 — Bordas da janela são determinísticas

- Forma de validar: o cenário `large-pagination` nas páginas 1, 4, 5, 97 e 100.
- Given: existem 100 páginas acessíveis.
- When: cada página é aberta.
- Then: a UI mostra respectivamente a janela inicial, a transição central e a
  janela final definidas nesta feature, com no máximo sete posições e sem links
  duplicados.

### Cenário 3 — Search param inválido vira página 1 canônica

- Forma de validar:
  `http://localhost:3000/global/training-plan?page=101&mockAuth=admin` e variantes
  com `page=0`, `page=-1`, `page=1.5`, `page=01` e `page=texto`.
- Given: a URL contém uma forma não canônica ou fora de 1–100.
- When: a rota valida o search.
- Then: usa `replace` para remover `page`, preserva `mockAuth`, faz somente a
  request de página 1 e voltar no navegador não reabre a URL inválida.

### Cenário 4 — Página válida acima do último resultado é corrigida

- Forma de validar:
  `http://localhost:3000/global/training-plan?page=100&mockAuth=admin&mockTrainingPlans=two-pages`.
- Given: a API aceita a página 100, mas o total real produz duas páginas.
- When: a primeira response chega vazia com esse total.
- Then: a rota substitui por `page=2`, consulta a página 2 e nunca apresenta estado
  vazio global nem `Página 100 de 2`.

### Cenário 5 — Falha de criação preserva modal, draft e concorrência alheia

- Forma de validar:
  `http://localhost:3000/global/training-plan?page=2&mockAuth=admin&mockTrainingPlans=create-error`.
- Given: a modal contém nome e descrição e outra linha recebe atualização durante a
  latência do POST.
- When: a criação falha.
- Then: somente o temporário desaparece, a página anterior volta se ainda aplicável,
  a mudança da outra linha permanece e a modal continua aberta com os valores,
  erro persistente, retry e cancelamento.

### Cenário 6 — Formulário fecha apenas após sucesso

- Forma de validar: lista, detalhe e editor com cenário de sucesso atrasado.
- Given: modal ou edição inline possui dados válidos.
- When: a pessoa salva.
- Then: o formulário permanece visível e não dismissable durante pending, impede
  duplicidade e só fecha depois que response, cache e terminal de Analytics forem
  processados.

### Cenário 7 — Falha de edição mantém draft na lista e no detalhe

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=update-error`
  e o detalhe do plano `training-plan-global-001` com o mesmo seletor.
- Given: nome e descrição foram alterados no formulário.
- When: o PATCH falha genericamente.
- Then: cache confirmado é restaurado só para esse plano, outros caches não
  retrocedem e o formulário permanece editável com o draft exato.

### Cenário 8 — Confirmação de exclusão permanece recuperável

- Forma de validar: cenários `delete-error` e `delete-workout-error` já usados pelo
  flow administrativo.
- Given: a pessoa confirmou uma exclusão.
- When: o DELETE está pendente e depois falha.
- Then: dismiss e confirmação duplicada ficam bloqueados durante pending; o item
  retorna à posição sem desfazer outras mudanças e o diálogo permanece aberto para
  retry ou cancelamento.

### Cenário 9 — Mesmo plano serializa e planos diferentes não

- Forma de validar: teste de componente/hook com MSW de latência controlada.
- Given: duas mutations do plano A e uma do plano B são iniciadas nessa ordem.
- When: a primeira do plano A permanece pendente.
- Then: a segunda de A não alcança a rede, B pode concluir, e depois a segunda de A
  usa exatamente a versão devolvida pela primeira.

### Cenário 10 — Rollback condicionado não apaga sucesso concorrente

- Forma de validar: teste de mutation com dois planos presentes na mesma página.
- Given: A recebe update otimista que falhará e B recebe update que terá sucesso.
- When: B conclui antes da falha de A.
- Then: o rollback restaura somente A; representação, versão e total de B
  permanecem canônicos em lista e detalhe.

### Cenário 11 — Conflito na lista preserva formulário

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=version-conflict`.
- Given: a modal de edição possui draft e a versão externa avançou.
- When: o PATCH recebe o `412` de domínio.
- Then: draft e modal permanecem, efeito otimista local é revertido, um `Alert`
  persistente aparece, gravações daquele plano pausam e nenhum retry automático é
  enviado.

### Cenário 12 — Recarga de conflito só descarta depois de ler

- Forma de validar: cenário de conflito seguido primeiro por falha e depois por
  sucesso no GET.
- Given: existem drafts e fila pausada.
- When: a pessoa confirma `Recarregar dados`.
- Then: falha do GET mantém drafts e pausa; sucesso posterior substitui pelos dados
  canônicos, atualiza versão, libera controles e não reenvia a mutation conflitante.

### Cenário 13 — Autosave falho mantém patch e permite retry

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=update-exercise-error`.
- Given: uma linha confirmada recebe várias edições em menos de três segundos.
- When: o PATCH coalescido falha.
- Then: draft e patch permanecem dirty, erro é anunciado na linha, navegação segue
  bloqueada e `Tentar novamente` envia os valores correntes sem sucesso falso.

### Cenário 14 — Edição durante request não é sobrescrita

- Forma de validar: editor com PATCH atrasado e timers controlados.
- Given: o nome `A` foi enviado e mudou para `B` antes da response canônica de A.
- When: a primeira response chega.
- Then: campos não reeditados recebem o canônico, o nome visível continua `B`, ele
  permanece dirty e uma próxima passagem envia B com a nova versão.

### Cenário 15 — Exclusão durante debounce restaura o draft

- Forma de validar: editor com `delete-exercise-error`.
- Given: uma linha foi editada e seu debounce ainda não disparou.
- When: a pessoa exclui a linha e o DELETE falha.
- Then: o timer não envia PATCH oculto, a linha retorna entre os mesmos vizinhos
  sobreviventes com draft e patch intactos e oferece decisões explícitas de retry.

### Cenário 16 — Linha temporária nunca participa da ordem

- Forma de validar: editor com criação atrasada.
- Given: uma nova linha possui ID `temporary-*`.
- When: o POST está pendente.
- Then: linha e controles estruturais ficam desabilitados, drag não inicia e
  nenhuma request de ordem contém o ID; após sucesso, o ID real libera as ações.

### Cenário 17 — Falha de reordenação preserva edições posteriores

- Forma de validar: editor com `reorder-error` e edição de campo durante a latência.
- Given: três exercícios foram reordenados e um campo de uma linha persistida mudou.
- When: o PUT de ordem falha.
- Then: apenas a ordem relativa anterior volta; objetos, draft, patch e estado de
  autosave correntes permanecem.

### Cenário 18 — Fila pausada bloqueia toda gravação do aggregate

- Forma de validar: rota de workout com `version-conflict`.
- Given: uma mutation recebeu conflito e existem drafts em mais de uma linha.
- When: a pessoa tenta nome, add, drag, delete, imagem, autosave ou retry.
- Then: nenhuma nova request de escrita nasce; os campos continuam consultáveis e
  editáveis localmente, as gravações de outro plano não são afetadas e somente a
  recarga confirmada pode retomar a fila.

### Cenário 19 — Navegação protege todo trabalho recuperável

- Forma de validar: Playwright no editor durante debounce, fila, request e erro.
- Given: qualquer um desses estados está ativo.
- When: a pessoa usa breadcrumb, menu, voltar, reload ou fecha a aba.
- Then: recebe confirmação apropriada; permanecer mantém foco e dados, sair cancela
  timers locais sem request síncrona, e nenhum estado dirty desaparece sem decisão.

### Cenário 20 — Promises esperadas não ficam sem tratamento

- Forma de validar: testes de componentes e Playwright ouvindo `unhandledrejection`
  nos cenários de falha de submit, confirmação, navegação, refetch e editor.
- Given: cada operação assíncrona rejeita de forma determinística.
- When: ela é disparada pelo respectivo controle.
- Then: há um único feedback e terminal de Analytics, o controle sai de pending e
  não ocorre `unhandledrejection` nem toast duplicado.

## Estratégia de entrega e compatibilidade

1. Implementar e testar primeiro os helpers puros de página canônica, janela de
   paginação, patch por revisão, rollback condicionado e restauração de ordem.
2. Introduzir o coordenador por `trainingPlanId` no escopo do `QueryClient` e
   migrar as mutations existentes sem mudar os services HTTP ou contratos.
3. Migrar lista, detalhe, modais e confirmações para o ciclo
   pending → success/error antes de fechar, incluindo conflito uniforme.
4. Migrar o editor para o estado proprietário de drafts e para operações
   estruturais exclusivas, preservando o comportamento visual e os contratos.
5. Ampliar MSW, unitários, componentes e Playwright; manter a sentinela como último
   handler e confirmar que nenhuma request alcança a API real.
6. Atualizar documentos vivos de UI e o fluxo raiz na mesma implementação, sem
   editar esta feature histórica validada.
7. Revisar código sem uso em `api/` e `ui/` e executar os gates aplicáveis.

A entrega é compatível com a API publicada: paths, bodies, responses,
`X-Resource-Version`, códigos e limites não mudam. Não há migração de dados,
dependência nova, feature flag ou janela coordenada de deploy. O novo coordenador é
memória efêmera da UI; reload perde a fila local e volta a ler a versão canônica,
como já ocorre hoje. Se a implementação exigir mudança de escopo HTTP, ela deve
parar e voltar à validação desta especificação.

## Plano de testes

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

- Unitários puros da UI:
  - página canônica para ausência, tipos inválidos, formas não canônicas, 1, 2, 100
    e acima de 100;
  - `lastPage` vazio, parcial, exato, acima de 2000 e response inválida;
  - janela para totais 1–8 e páginas inicial, central e final, sem duplicidade;
  - merge por revisão que preserva edição feita durante request;
  - rollback condicionado de create/update/delete com alteração concorrente;
  - restauração estrutural por vizinhos e ordem de objetos correntes.
- Hooks e componentes da UI:
  - coordenador FIFO, propagação de versão, pausa, reset, dispose e independência
    entre IDs;
  - mesma mutation atravessando unmount/navegação sem criar segunda fila;
  - modais, inline form e dialogs em pending, sucesso, erro, retry e conflito;
  - cache de múltiplas páginas/detalhes com sucessos e falhas intercalados;
  - autosave com timers falsos, coalescência, falha, retry e edição durante request;
  - add temporário, lock estrutural, reorder localizado e delete durante debounce;
  - blocker e `beforeunload` entram e saem em todos os estados definidos;
  - Analytics possui um início/terminal e não contém dados proibidos;
  - rejeições de handlers não produzem promise sem tratamento.
- MSW:
  - volumes de 0, 1, 2, 7, 8 e 100 páginas e total acima de 2000;
  - página válida acima do último resultado;
  - latência controlada e ordem de chegada observável por request;
  - sucesso, falha genérica e conflito para cada família de mutation afetada;
  - header de versão validado e incrementado somente em sucesso;
  - estado isolado e reiniciado, sem dependência entre testes;
  - sentinela `501 MOCK_NOT_IMPLEMENTED` por último.
- Playwright:
  - URLs dos vinte critérios aplicáveis, incluindo reload, deep link, voltar e
    avançar;
  - janela de paginação e correções canônicas sem estado vazio intermediário;
  - preservação de forms/dialogs e foco em sucesso/falha;
  - dois planos independentes e mutations do mesmo plano serializadas;
  - conflito, falha de recarga e recarga bem-sucedida;
  - autosave/retry, edição durante request, add/reorder/delete e drafts;
  - navegação protegida e ausência de `unhandledrejection`;
  - Vite real, Chromium e MSW Browser, sem `page.route`, timeout fixo ou API real.
- API:
  - não adicionar unitários ou E2E, pois o contrato e a implementação da API não
    mudam;
  - a suíte vigente continua rodando pelo gate agregado `pnpm test`.
- Quality gates após implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`.

`pnpm -C api test:e2e` não é gate adicional desta entrega porque endpoint, wiring,
MongoDB e Redis não mudam. Ele passa a ser obrigatório se o escopo for
revalidado para incluir qualquer uma dessas áreas.

## Riscos e decisões

- O limite HTTP de 100 páginas já existe; aplicá-lo também ao cálculo e ao DOM
  corrige divergência sem ampliar o contrato. Cursor continua sendo evolução
  separada quando o gatilho da `FIT-0028` for atingido.
- Canonicalizar depois do `total` exige uma segunda leitura quando uma URL 1–100
  aponta além do fim. Essa leitura é preferível a mostrar estado incoerente ou
  inventar que uma página válida para a API é inválida antes de conhecer o total.
- Manter formulário aberto até o sucesso muda testes que hoje codificam o overlay
  fechado após falha. Esses testes devem mudar porque o comportamento atual perde
  draft e contradiz a recuperação esperada pelas features históricas.
- Serialização por aggregate reduz conflitos causados pelo próprio cliente, mas não
  elimina concorrência externa. O `412` continua intencional e nunca é resolvido
  por merge ou retry automático.
- O coordenador precisa sobreviver às rotas, mas não ao reload. Persistir mutations
  ou drafts em storage aumentaria risco de privacidade, replays e versões obsoletas
  e está fora do escopo.
- Aplicar o otimismo somente na cabeça da fila troca uma resposta visual antecipada
  de tarefas aguardando por rollback determinístico. Drafts permanecem imediatos,
  portanto a digitação não depende da rede.
- Snapshot integral é simples, porém pode apagar sucesso concorrente. Tokens e
  rollbacks condicionais exigem mais metadados internos, mas preservam isolamento
  e permitem paralelismo entre planos.
- Bloquear uma segunda operação estrutural impede reordenação com ID temporário e
  snapshots de ordem concorrentes. Campos persistidos continuam editáveis, e sua
  gravação apenas aguarda a fila.
- Preservar patches até confirmação evita perda de trabalho, mas exige revisão por
  campo para não aplicar response antiga sobre edição nova. O estado discriminado
  torna essa transição testável.
- Excluir durante debounce não pode simplesmente desmontar a linha. Capturar draft
  no editor proprietário permite rollback fiel sem iniciar PATCH oculto.
- Bloqueio de navegação e `beforeunload` são avisos de descarte, não garantia de
  entrega. Requests síncronas, keepalive improvisado ou retry no unload não serão
  usados.
- Nenhuma nova ADR é necessária: as decisões transversais de aggregate e versão
  permanecem. A feature fecha lacunas de implementação e comportamento na UI.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- URL de página canônica e janela limitada a sete posições
- Teto de 100 páginas consistente entre API, cálculo e navegação da UI
- Formulários e confirmações fecham somente após sucesso
- Drafts preservados em falha genérica e conflito
- Um coordenador FIFO por plano, sem serialização entre planos diferentes
- Versão obtida no início de cada tarefa e propagada pela response anterior
- `412` uniforme, persistente, sem merge ou retry automático
- Rollbacks condicionais não restauram caches ou arrays inteiros
- Autosave mantém patch dirty até confirmação e oferece retry explícito
- Add, reorder e delete não usam IDs temporários nem snapshots estruturais obsoletos
- Exclusão durante debounce restaura draft, patch e posição
- Navegação protege drafts, filas, requests e falhas recuperáveis
- Promises de eventos possuem término explícito e nenhum `unhandledrejection`
- Analytics preserva exatamente um início e um terminal sem dados proibidos
- API e `@dall-fit/types` permanecem inalterados
- SDDs vivos de UI e fluxo raiz atualizados na implementação autorizada
- MSW, unitários, componentes e Playwright cobrem sucesso, falha e concorrência
- Nenhuma referência visual exigida na ausência de assets
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz e testes integrados da UI aprovados
