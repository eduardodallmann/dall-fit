# Feature Spec: Resiliência transversal de sessão, requests, bootstrap e PWA

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0029`](https://github.com/eduardodallmann/dall-fit/issues/29).
- Problema: a UI já centraliza Axios, usa TanStack Query e Router, protege rotas,
  inicializa CSRF e oferece instalação e atualização do PWA. Entretanto, a pessoa
  atual permanece apenas no cache consultado pelo `beforeLoad`, `401` pode iniciar
  transições concorrentes, `403` não possui recuperação por código, requests não
  têm timeout nem cancelamento completo e estado externo ao QueryClient pode
  sobreviver ao logout. Falhas no bootstrap, na renderização e no service worker
  também podem terminar sem fallback ou diagnóstico seguro. O editor de planos
  tornou os riscos mais visíveis porque mantém drafts e filas versionadas, mas as
  políticas de sessão e transporte são responsabilidades transversais da UI e não
  podem nascer acopladas a esse domínio.
- Resultado: toda rota e todo fluxo atual ou futuro usam uma única política de
  sessão, transporte, timeout, cancelamento, retry e diagnóstico. O shell mantém a
  pessoa atual observada e revalidada; logout, expiração ou troca de pessoa encerram
  uma geração de sessão de forma idempotente; trabalho antigo não escreve no novo
  estado; falhas de bootstrap, renderização e PWA preservam uma interface utilizável.
  A gestão de planos e treinos é o primeiro fluxo completo de validação, enquanto
  sua fila de aggregate continua sendo uma responsabilidade específica do domínio.
- Referências locais:
  - `docs/sdd/features/fit-0011-instalacao-pwa.md`;
  - `docs/sdd/features/fit-0026-endurecimento-autenticacao-sessao.md`;
  - `docs/sdd/features/fit-0028-editor-exercicios-escalabilidade-concorrencia.md`;
  - `docs/sdd/features/fit-0030-paginacao-recuperacao-concorrencia-planos.md`;
  - `docs/sdd/features/fit-0047-corrigir-falso-conflito-vercel.md`;
  - `docs/sdd/adr/ADR-0004-sessao-revogavel-redis-e-csrf.md`;
  - `docs/sdd/adr/ADR-0005-limites-concorrencia-e-midia-dos-planos.md`;
  - `docs/sdd/adr/ADR-0006-versao-de-recurso-em-header-de-dominio.md`;
  - `docs/sdd/flows/login-google.md`;
  - `docs/sdd/flows/gestao-planos-treino-globais.md`;
  - `api/docs/sdd/endpoints/auth.md`;
  - `api/docs/sdd/endpoints/current-person.md`;
  - `api/docs/sdd/endpoints/global-training-plans.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/02-rotas-e-comportamento.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/base/04-testes-e-qualidade.md`;
  - `ui/docs/sdd/base/05-mocks-de-api.md`;
  - `ui/docs/sdd/base/07-testes-integrados-playwright.md`;
  - `ui/docs/sdd/routes/root.md`;
  - `ui/docs/sdd/routes/dash.md`;
  - `ui/docs/sdd/routes/global-training-plan.md`;
  - `ui/docs/sdd/routes/global-training-plan-detail.md`;
  - `ui/docs/sdd/routes/global-training-plan-workout.md`.
- Versões instaladas confirmadas no planejamento: React `19.2`, Axios `1.18`,
  TanStack Query `5.101`, TanStack Router `1.170`, MSW `2.15`, HeroUI `3.2` e
  `vite-plugin-pwa` `1.3`.
- Referências oficiais consultadas no planejamento:
  - TanStack Query: [cancelamento e `AbortSignal`](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation),
    [defaults, retry e revalidação](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
    e [`QueryClient`](https://tanstack.com/query/v5/docs/reference/QueryClient);
  - TanStack Router: [rotas autenticadas](https://tanstack.com/router/latest/docs/guide/authenticated-routes),
    [invalidação aguardável](https://tanstack.com/router/latest/docs/guide/data-mutations)
    e [eventos do router](https://tanstack.com/router/latest/docs/guide/router-events);
  - Axios: [timeout e `signal` na configuração](https://axios-http.com/docs/req_config),
    [cancelamento com `AbortController`](https://axios-http.com/docs/cancellation)
    e [interceptors](https://axios-http.com/docs/interceptors);
  - React: [Error Boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
    e [handlers de erro do `createRoot`](https://react.dev/reference/react-dom/client/createRoot#error-logging-in-production);
  - Vite PWA: [`useRegisterSW` e `onRegisterError`](https://vite-pwa-org.netlify.app/frameworks/react.html);
  - HeroUI 3: [catálogo oficial de componentes](https://heroui.com/react/llms.txt),
    incluindo `Alert`, `Button` e `Card` para estados recuperáveis.
- Features relacionadas:
  - `FIT-0026` definiu sessão revogável e CSRF; esta feature não enfraquece os
    guards nem repete automaticamente uma mutation rejeitada;
  - `FIT-0028`, `FIT-0030` e `FIT-0047` definiram versão, fila FIFO, drafts e
    conflito real de planos; esta feature acrescenta apenas o ciclo de vida da
    sessão e as políticas de transporte ao redor desse estado;
  - `FIT-0011` definiu instalação e atualização do PWA; esta feature cobre falhas
    de registro e mantém recuperável a falha de atualização.

## Escopo

### Incluído

- observação ativa de `GET /auth/me` durante toda sessão autenticada;
- revalidação limitada no tempo e revalidação imediata em mount, foco, reconexão,
  navegação protegida stale e perda de autorização administrativa;
- ciclo de vida idempotente e central para logout, `401`, troca de pessoa e início
  de nova geração de sessão;
- encerramento de requests, callbacks e recursos externos ao QueryClient que
  pertençam à geração anterior;
- registro transversal de recursos vinculados à sessão, com integração inicial do
  `AggregateMutationCoordinator` de planos;
- recuperação distinta de `CSRF_VALIDATION_FAILED`, `ADMIN_ACCESS_REQUIRED` e
  demais respostas `403` usando somente `status` e `ApiError.code`;
- obtenção CSRF single-flight e renovação sem retry automático da mutation;
- timeout finito, cancelamento por `AbortSignal` e classificação comum de erros;
- retry automático somente para leituras e falhas transitórias explicitamente
  permitidas;
- tratamento terminal de promises de bootstrap, navegação, invalidação, logout,
  refetch, retry e atualização PWA;
- fallback global acessível para falha de bootstrap e erro de renderização;
- diagnóstico cliente sanitizado e de baixa cardinalidade para falhas sistêmicas;
- tratamento de falha de registro e atualização do service worker sem bloquear a
  aplicação web;
- handlers e fixtures MSW, unitários, componentes e Playwright proporcionais ao
  risco, usando planos e treinos como fluxo de regressão ponta a ponta;
- atualização dos SDDs vivos afetados somente durante a implementação autorizada.

### Não incluído

- alterar endpoint, status, `ApiError.code`, cookie, TTL, CORS, CSRF, rate limit,
  sessão Redis ou contrato compartilhado da API;
- renovar silenciosamente uma sessão expirada, fazer refresh token ou manter JWT
  stateless como fallback;
- conceder ou revogar `isAdmin` pela UI;
- repetir automaticamente mutations, inclusive após renovar CSRF, timeout, falha
  de rede ou conflito de versão;
- tratar todo `403` como CSRF, logout ou perda de privilégio;
- mover a fila versionada, os drafts ou regras de conflito de planos para `core`;
- persistir cache privado, CSRF, fila ou mutation em storage, service worker ou
  mecanismo offline;
- cachear requests da API no service worker;
- adicionar um provedor externo de monitoramento, coletar stack, mensagem livre,
  URL, pessoa, sessão, payload, headers ou identificadores em Analytics;
- alterar o prompt manual de instalação, criar prompt automático ou bloquear o
  conteúdo por falha PWA;
- criar screenshots ou regressão visual: não existem assets para as rotas afetadas.

## Projetos e documentação afetados

- API e endpoints:
  - nenhum código, wiring, contrato ou documento vivo da API deve mudar;
  - permanecem `401 AUTHENTICATION_REQUIRED`,
    `403 CSRF_VALIDATION_FAILED`, `403 ADMIN_ACCESS_REQUIRED` e
    `412 TRAINING_PLAN_VERSION_CONFLICT` conforme os endpoints vigentes;
  - qualquer necessidade de mudar essa superfície retorna a feature à
    especificação antes da implementação.
- UI e rotas:
  - concentrar sessão/autorização em `ui/src/auth/`, transporte e classificação em
    `ui/src/core/http/`, fallback/diagnóstico/PWA em `ui/src/core/` e providers;
  - manter `routes.tsx` como árvore manual tipada e tornar o shell autenticado o
    observador ativo da pessoa, sem duplicar um segundo client HTTP ou store de
    pessoa;
  - services de todos os domínios continuam usando a instância Axios única;
  - o domínio `training-plan` apenas encaminha signals, registra seu coordenador no
    ciclo de sessão e protege drafts/rollbacks contra callbacks antigos;
  - atualizar `ui/docs/sdd/base/01-arquitetura.md`,
    `02-rotas-e-comportamento.md`, `04-testes-e-qualidade.md`,
    `05-mocks-de-api.md` e `07-testes-integrados-playwright.md`;
  - atualizar `root.md`, `dash.md` e os três documentos
    `global-training-plan*.md` conforme o comportamento implementado.
- Fluxos:
  - atualizar `login-google.md` com observação, revalidação e teardown da sessão;
  - atualizar `gestao-planos-treino-globais.md` com encerramento da fila antiga,
    cancelamento, recuperação de CSRF e perda de privilégio.
- Contratos em `@dall-fit/types`:
  - nenhuma mudança; classificação, geração de sessão, timeout e diagnóstico são
    tipos internos da UI e os códigos HTTP já existem no contrato recebido.
- Decisões arquiteturais:
  - nenhuma ADR nova; a solução refina responsabilidades reversíveis já atribuídas
    a Axios, QueryClient, Router e sessão pela arquitetura da UI e pela `ADR-0004`;
  - as decisões de aggregate e versão das `ADR-0005` e `ADR-0006` permanecem no
    domínio de planos.
- Handlers e fixtures MSW:
  - adicionar cenários stateful para expiração após bootstrap, `401` concorrentes,
    perda de `isAdmin`, CSRF inválido seguido de token novo, latência, timeout e
    cancelamento;
  - ampliar planos somente com os estados necessários para comprovar preservação
    de draft, rollback localizado e limpeza do coordenador;
  - seletores continuam exclusivos do MSW e ausentes de requests reais.
- Mocks de repositories/caches nos unitários da API:
  - não se aplica; a API não muda.
- Fixtures MongoDB/Redis nos E2E:
  - não se aplica; os novos cenários são da UI e usam MSW na fronteira HTTP.

## Requisitos funcionais

### Pessoa atual e revalidação

1. O `beforeLoad` protegido continua sendo a barreira inicial, mas deve aguardar
   `GET /auth/me` quando não houver cache ou quando o dado autenticado estiver stale;
   não pode liberar uma branch nova com dado stale e apenas revalidar em background.
2. A query da pessoa atual usa `staleTime` explícito de 30 segundos e permanece
   ativa no shell autenticado. O shell e o guard compartilham exatamente a mesma
   chave e a mesma fonte de dados.
3. Enquanto o documento estiver visível e conectado, a pessoa é revalidada no
   máximo a cada cinco minutos. Foco e reconexão solicitam revalidação imediata;
   remount refaz a leitura somente quando o dado estiver stale, evitando duplicar
   o request recém-aguardado pelo `beforeLoad`. Polling em background permanece
   desabilitado.
4. A política da pessoa atual não herda acidentalmente defaults globais futuros.
   `staleTime`, mount, foco, reconexão, intervalo, retry e cancelamento ficam
   explícitos em suas query options.
5. Uma response canônica que remove `isAdmin` atualiza menu e contexto, aguarda a
   invalidação do Router e substitui qualquer branch administrativa ativa por
   `/dash`, sem logout e sem apagar dados públicos da pessoa.
6. Uma mudança inesperada do ID da pessoa dentro do mesmo documento encerra a
   geração privada anterior antes de publicar a nova pessoa. Nenhum cache, request,
   mutation, draft, versão ou fila é compartilhado entre as duas identidades.

### Ciclo de vida e teardown de sessão

7. Existe uma única fronteira de ciclo de sessão com geração monotônica e estados
   equivalentes a `active`, `ending` e `ended`. Interceptor, guard, logout e troca
   de pessoa delegam a ela em vez de executar limpezas ou redirects paralelos. Um
   novo bootstrap autenticado abre uma geração e um `AbortController` novos antes
   de publicar qualquer estado privado.
8. O primeiro `401` inicia a transição. `401` concorrentes da mesma geração
   aguardam a mesma Promise terminal e não repetem abort, limpeza, diagnóstico ou
   navegação.
9. O teardown aborta o signal da geração, impede novos requests autenticados,
   cancela queries aplicáveis, limpa CSRF e cache privado, encerra recursos
   registrados e navega uma vez para `/` com `replace`.
10. Toda Promise de transição, `router.invalidate`, `router.navigate`, logout e
    retry é aguardada ou recebe tratamento terminal explícito. Não existe `void`
    sobre uma Promise que possa rejeitar sem um `catch` terminal na própria
    fronteira.
11. Logout chama a API enquanto a geração ainda está ativa e executa teardown
    local no bloco terminal, inclusive se a revogação remota falhar. A falha pode
    ser informada de forma genérica, mas não mantém dados privados no documento.
12. Um registro de recursos vinculados à sessão permite que domínios futuros
    cadastrem uma operação idempotente de reset. Registro, remoção e reset não
    conhecem tipos de plano, workout ou exercício.
13. O `AggregateMutationCoordinator` permanece sob `training-plan`, registra-se
    nessa fronteira e, no teardown, encerra filas, versões e pausas. Tarefas que não
    começaram são rejeitadas como encerramento esperado; requests em execução são
    abortadas pelo signal da geração.
14. Cada callback assíncrono que possa escrever cache ou estado privado captura a
    geração de origem e confirma que ela ainda está ativa antes de aplicar sucesso,
    rollback, invalidação, toast ou navegação. Resultado tardio da geração antiga é
    descartado sem tocar a nova sessão.

### CSRF e autorização por código

15. `ensureCsrfToken` é single-flight: chamadas concorrentes sem token compartilham
    uma única Promise de `GET /auth/csrf`. Somente sucesso armazena o token; falha
    limpa a referência pendente para permitir recuperação explícita.
16. `401` em qualquer request autenticada segue exclusivamente o ciclo de sessão.
    Não há retry da query ou mutation que recebeu a resposta.
17. `403 CSRF_VALIDATION_FAILED` limpa o token em memória e inicia uma única
    renovação CSRF. A mutation original termina em erro recuperável, preserva seu
    draft e rollback localizado e só é criada novamente por ação explícita depois
    da renovação bem-sucedida.
18. Falha ao renovar CSRF mantém a pessoa autenticada, bloqueia novas mutations e
    apresenta o estado técnico recuperável vigente com ação real de tentar obter o
    token novamente. Não simula logout.
19. `403 ADMIN_ACCESS_REQUIRED` invalida e refaz a query da pessoa, aguarda a
    invalidação do Router e retira a pessoa da branch administrativa. Não limpa
    sessão nem tenta renovar CSRF por esse código.
20. Qualquer outro `403` permanece com o fluxo proprietário. Nenhuma classificação
    usa `message`, `details`, texto Axios, presença de draft ou rota atual.

### Transporte, timeout, cancelamento e retry

21. A instância Axios única possui timeout default de 15 segundos e
    `clarifyTimeoutError` habilitado. Nenhuma request pode remover o limite com
    zero, `Infinity` ou valor indefinido resolvido como ilimitado.
22. Upload multipart de imagem usa override explícito de 60 segundos. Outro
    override só pode existir como constante nomeada, finita, junto ao service e
    documentada no SDD proprietário da operação.
23. Toda query function recebe o `AbortSignal` do TanStack Query e o encaminha pelo
    service até `AxiosRequestConfig.signal`. Services aceitam o signal sem criar
    `AbortController` concorrente nem usar o `CancelToken` legado.
24. Requests autenticadas também pertencem ao signal da geração de sessão. Quando
    houver signal da query e da sessão, o transporte combina ambos e aborta quando
    qualquer um encerrar, removendo listeners depois do término.
25. `cancelQueries`, descarte de uma query em navegação e teardown devem abortar o
    transporte aplicável, não apenas ignorar a response no cache.
26. A fronteira HTTP classifica, em ordem, cancelamento esperado, timeout, falha de
    rede sem response e erro HTTP normalizado. Cancelamento Axios usa a API oficial
    de cancelamento e nunca é convertido em `HTTP_ERROR` genérico.
27. Cancelamento esperado não produz retry, toast, `Alert`, terminal de Analytics,
    diagnóstico sistêmico, rollback destrutivo ou error component. O estado anterior
    da query permanece conforme a semântica de cancelamento do TanStack Query.
28. O QueryClient usa uma predicate comum: no máximo uma nova tentativa, após um
    segundo, somente para query de leitura que falhou por timeout, rede sem response,
    `408`, `500`, `502`, `503` ou `504`. A query pode marcar explicitamente uma
    leitura como não repetível.
29. Não há retry automático para cancelamento, `400`, `401`, `403`, `404`, `409`,
    `412`, `422`, `428`, `429`, validação de contrato, conflito de versão ou falha
    permanente. Mutations permanecem com retry zero, inclusive as idempotentes
    atuais; habilitar retry de uma mutation exige feature e contrato explícitos.
30. Timeout ou falha transitória de leitura apresenta erro recuperável somente
    depois de esgotar a tentativa permitida. Timeout de mutation preserva a intenção
    local, não presume falha do write e exige reconciliação/refetch seguro antes de
    permitir repetição que possa duplicar efeito.

### Bootstrap, renderização e recuperação global

31. `bootstrap()` possui tratamento terminal. O root é preparado antes das etapas
    assíncronas e falha ao importar/iniciar MSW, preparar providers ou montar a
    aplicação renderiza fallback em vez de deixar o documento vazio.
32. Quando MSW estiver explicitamente habilitado e não iniciar, o fallback não
    libera a aplicação para atingir silenciosamente a API real. Produção continua
    sem importar MSW.
33. A árvore inteira fica sob uma Error Boundary acima de providers e Router. Erro
    de renderização fora dos `errorComponent` de rota troca somente a árvore por um
    fallback estável; handlers de erro do `createRoot` complementam diagnóstico e
    não substituem essa interface.
34. O fallback global informa de forma genérica que a aplicação não pôde iniciar,
    mantém heading e foco acessíveis e oferece botão `Tentar novamente` que recarrega
    o documento. Não mostra stack, mensagem técnica, URL, pessoa ou request.
35. O estado autenticado `Não foi possível carregar sua conta` oferece botão
    `Tentar novamente` que aguarda invalidação síncrona do Router e nova leitura da
    pessoa/CSRF. O botão apresenta pending, evita clique duplicado e conserva o erro
    quando a tentativa falha.
36. Estados globais reutilizáveis vivem em `core/components`, usam composição
    HeroUI (`Alert`, `Button`, `Card`) e seguem `index.tsx`/`styles.ts`; estados
    específicos de planos permanecem no domínio da rota.

### Diagnóstico e PWA

37. Uma fronteira tipada de diagnóstico aceita apenas categorias enumeradas de
    baixa cardinalidade: `bootstrap`, `render` e `pwa_registration`. Ela nunca
    recebe ou serializa o objeto `Error`, mensagem, stack, URL, query, sessão,
    pessoa, payload, header, token, IDs ou texto livre. Falha de atualização
    iniciada pela pessoa usa o terminal `error` já existente da operação PWA.
38. O transporte vigente de Analytics pode receber somente o evento sistêmico
    agregado definido no catálogo vivo. Falha do próprio transporte é no-op e
    nunca bloqueia fallback, navegação ou PWA. Cancelamento, `401`, CSRF e perda de
    privilégio não geram esse evento.
39. `onRegisterError` registra apenas `pwa_registration`; o erro técnico é
    descartado na borda. A aplicação continua autenticando, navegando e exibindo
    conteúdo como web app comum, sem depender do service worker.
40. Falha de `updateServiceWorker(true)` mantém o aviso de atualização visível,
    troca seu conteúdo para erro recuperável, reabilita `Tentar atualizar` e
    conserva a versão corrente utilizável. A Promise possui tratamento terminal.
41. A falha de atualização mantém um único terminal `error` da operação PWA já
    existente e o diagnóstico sistêmico não duplica contagem para a mesma tentativa.
42. Recusa ou falha do prompt de instalação mantém o fallback manual vigente, sem
    prompt automático, bloqueio ou detalhe técnico. PWA continua desligado em
    desenvolvimento e Playwright, e MSW continua desligado em produção.

## Requisitos não funcionais

- Acessibilidade:
  - fallbacks usam heading semântico, mensagem concisa, ação nomeada e foco
    previsível;
  - `Alert` persistente anuncia falha recuperável sem depender somente de cor;
  - pending desabilita repetição e mantém nome acessível; recuperação devolve foco
    à ação ou ao heading do conteúdo;
  - alterações de sessão não criam loops de foco ou anúncios duplicados.
- Performance:
  - a query ativa compartilha cache e request; CSRF single-flight evita fan-out;
  - polling de pessoa acontece somente com shell ativo, documento visível e rede
    conectada, no máximo uma vez a cada cinco minutos;
  - não há polling de planos, fila global, segundo client HTTP ou listener sem
    cleanup;
  - timeout, combinação de signals e classificação permanecem custo constante por
    request.
- Segurança e privacidade:
  - `GET /auth/me` e CSRF continuam `no-store` e nunca entram no service worker ou
    storage persistente;
  - teardown falha fechado: dado privado antigo não permanece para preservar
    conveniência;
  - a UI não usa revalidação como substituto de autorização da API;
  - diagnóstico e Analytics seguem allowlist tipada e não recebem conteúdo técnico
    ou identificável;
  - nenhuma fixture contém credencial, token ou dado pessoal real.
- Observabilidade:
  - cada falha sistêmica emite no máximo uma categoria sanitizada por ocorrência;
  - operações iniciadas pela pessoa preservam exatamente um início e um terminal;
  - cancelamentos esperados e transições automáticas de segurança não poluem
    métricas de erro;
  - testes inspecionam somente o payload sanitizado, nunca o objeto bruto.
- Manutenibilidade:
  - políticas transversais não importam `training-plan` nem qualquer rota futura;
  - domínios registram recursos de sessão por uma interface mínima e removível;
  - erros são discriminados por tipos/predicates centralizados, não por texto;
  - promises iniciadas por efeitos e callbacks têm ownership e término explícitos.

## Critérios de aceite

### Cenário 1 — sessão expira com o shell montado

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=session-expired&mockTrainingPlans=default`.
- Given: a pessoa administradora carregou a lista e o primeiro `GET /auth/me` teve
  sucesso
- When: a revalidação ou uma request posterior recebe `401`
- Then: uma única transição aborta trabalho da geração, limpa estado privado e
  substitui a URL por `/`
- And: nenhuma Promise rejeitada, toast de cancelamento ou dado administrativo
  permanece visível.

### Cenário 2 — respostas 401 concorrentes são idempotentes

- Forma de validar: teste de componente/integração do shell com duas requests
  concorrentes e o cenário MSW `session-expired`.
- Given: duas queries autenticadas estão em voo na mesma geração
- When: ambas recebem `401`
- Then: compartilham a mesma Promise de teardown, há um abort, um reset de recursos
  e uma navegação
- And: a segunda resposta não cria redirect, limpeza ou erro não tratado adicional.

### Cenário 3 — privilégio administrativo é revogado

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin-revoked`.
- Given: `GET /auth/me` inicial devolveu `isAdmin: true` e a rota administrativa
  está ativa
- When: uma revalidação ou request administrativa recebe
  `403 ADMIN_ACCESS_REQUIRED` e a nova pessoa vem sem `isAdmin`
- Then: menu e contexto são atualizados, Router é invalidado e a URL é substituída
  por `/dash`
- And: a sessão e os dados públicos da pessoa permanecem ativos.

### Cenário 4 — falha CSRF renova proteção sem repetir mutation

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=csrf-refresh`.
- Given: o editor possui draft válido e o token em memória ficou obsoleto
- When: o autosave recebe `403 CSRF_VALIDATION_FAILED`
- Then: o token é descartado, uma única renovação CSRF ocorre e o draft permanece
  em erro recuperável
- And: nenhum PATCH é repetido até a pessoa acionar retry depois da renovação.

### Cenário 5 — bootstrap CSRF continua distinto de logout

- Forma de validar: `http://localhost:3000/dash?mockAuth=csrf-error`.
- Given: `GET /auth/me` confirmou a pessoa, mas `GET /auth/csrf` falhou
- When: o shell encerra o bootstrap autenticado
- Then: apresenta ação funcional de retry, bloqueia mutations e mantém pessoa/cache
  da sessão
- And: não navega para `/` nem registra expiração.

### Cenário 6 — nova pessoa não herda coordenador antigo

- Forma de validar: Playwright iniciando em
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=conflict`,
  seguido de logout e novo login MSW no mesmo documento.
- Given: a primeira sessão possui versão conhecida, draft e fila pausada por
  conflito
- When: logout encerra a geração e outra pessoa entra
- Then: a nova sessão não herda ID, versão, pausa, draft, timer ou tarefa da fila
- And: resultado tardio da sessão anterior não altera cache nem interface.

### Cenário 7 — cancelamento alcança o Axios

- Forma de validar: teste do service/query e Playwright com leitura atrasada no
  fluxo de planos, navegando para `/dash` antes da response.
- Given: uma query de plano encaminhou os signals de query e sessão
- When: a rota descarta a query ou o teardown encerra a sessão
- Then: o request Axios é abortado e a query volta ao estado anterior
- And: não há retry, toast, diagnóstico, erro de rota ou rollback de outro estado.

### Cenário 8 — timeout de leitura obedece à política comum

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=timeout`.
- Given: o handler não responde dentro do timeout default
- When: a listagem executa a leitura
- Then: o transporte aborta em 15 segundos, a query repete somente uma vez e depois
  mostra erro recuperável com retry explícito
- And: o teste unitário usa timers controlados e não espera tempo real.

### Cenário 9 — timeout de mutation não presume resultado

- Forma de validar: teste do editor com upload/mutation atrasado e resposta de
  reconciliação configurada no MSW.
- Given: uma mutation ou upload ultrapassa seu timeout finito
- When: o cliente deixa de conhecer o resultado do write
- Then: preserva draft/arquivo, não repete automaticamente e exige refetch seguro
  antes de liberar retry
- And: não restaura snapshot amplo nem avança versão por inferência.

### Cenário 10 — bootstrap falha sem tela vazia

- Forma de validar: teste de `main.tsx` que rejeita import/início do MSW; URL não se
  aplica porque a falha ocorre antes do Router.
- Given: mocks estão explicitamente habilitados e o worker não inicia
- When: `bootstrap()` rejeita
- Then: o documento mostra fallback acessível com `Tentar novamente`, não monta a
  aplicação contra a API real e registra somente `bootstrap` sanitizado.

### Cenário 11 — erro de renderização tem boundary global

- Forma de validar: teste do provider raiz com um filho que lança durante render;
  URL não se aplica porque o boundary envolve toda a árvore.
- Given: um erro escapa dos boundaries de rota
- When: React tenta renderizar a árvore
- Then: o fallback global substitui a aplicação, permite recarregar e emite somente
  a categoria `render`
- And: mensagem, stack, pessoa e URL não chegam ao diagnóstico.

### Cenário 12 — falha de registro PWA não bloqueia a aplicação

- Forma de validar: teste do `PwaProvider` com `onRegisterError`; URL não se aplica
  porque PWA permanece desabilitado no servidor Playwright.
- Given: o service worker não pode ser registrado em uma build PWA habilitada
- When: `onRegisterError` é chamado
- Then: autenticação, Router e conteúdo continuam utilizáveis como web app comum
- And: apenas `pwa_registration` sanitizado é diagnosticado.

### Cenário 13 — falha de atualização permanece recuperável

- Forma de validar: teste do notice PWA em que `updateServiceWorker(true)` rejeita;
  URL não se aplica porque o registro real não roda no Playwright.
- Given: uma nova versão está disponível e o aviso está visível
- When: `Tentar atualizar` falha
- Then: o aviso permanece, informa erro genérico, reabilita a mesma ação e a versão
  atual continua utilizável
- And: a operação possui um único terminal `error` sem rejeição descartada ou
  duplicação de diagnóstico.

### Cenário 14 — erros permanentes e cancelamento não recebem retry

- Forma de validar: testes parametrizados da predicate do QueryClient e da
  classificação HTTP; URL não se aplica por ser política transversal pura.
- Given: uma leitura falha por cancelamento ou recebe cada status permanente
  documentado
- When: TanStack Query consulta a predicate
- Then: não agenda nova tentativa
- And: somente timeout, rede sem response, `408`, `500`, `502`, `503` e `504` de
  leitura recebem uma tentativa adicional após um segundo.

### Cenário 15 — um fluxo futuro herda a política sem depender de planos

- Forma de validar: testes arquiteturais/unitários da instância HTTP, QueryClient,
  sessão e registro de recursos; URL não se aplica porque o requisito é de
  composição transversal.
- Given: um novo domínio usa o Axios compartilhado, as query options comuns e
  registra eventual recurso privado de longa duração
- When: executa leitura, cancelamento e teardown
- Then: recebe timeout, retry, classificação, signal de sessão e reset sem importar
  `training-plan`
- And: somente suas regras de negócio e apresentação permanecem no domínio novo.

## Estratégia de entrega e compatibilidade

1. Implementar a fronteira HTTP e seus tipos sem mudar o contrato da API.
2. Introduzir o ciclo de geração de sessão e migrar interceptor, Router, logout,
   CSRF e shell para uma única transição.
3. Migrar todas as query functions existentes para `AbortSignal` e aplicar a
   predicate comum antes de remover o `retry: 1` indiscriminado.
4. Registrar o coordenador de planos no teardown e proteger seus callbacks por
   geração, preservando toda a semântica de versão da `FIT-0030`/`FIT-0047`.
5. Adicionar fallbacks e diagnóstico, depois completar os estados do PWA.
6. Atualizar MSW, testes e SDDs vivos atomicamente na implementação autorizada.
7. Não há migração de API, MongoDB, Redis, contrato compartilhado ou dado
   persistido. O rollback da UI restaura o comportamento anterior, mas volta a
   permitir estado privado antigo e requests sem limite, portanto não é estado
   operacional desejável.
8. A política é imediatamente obrigatória para todos os fluxos existentes. Fluxos
   futuros usam as mesmas fronteiras e só acrescentam adapters ou recursos de
   sessão quando houver necessidade real.

## Plano de testes

- unitários da classificação HTTP para cancelamento, timeout, rede, status e
  `ApiError.code`, incluindo respostas malformadas;
- unitários do timeout default, override de upload e combinação/cleanup de signals;
- unitários parametrizados da predicate de retry, limite de uma tentativa e delay;
- unitários do ciclo de sessão para concorrência, idempotência, geração, ordem do
  teardown, falha de cleanup e descarte de callbacks antigos;
- unitários do registro de recursos e do reset do
  `AggregateMutationCoordinator`, inclusive fila pausada e tarefas aguardando;
- unitários de CSRF single-flight, falha, renovação e retry apenas explícito;
- componentes do shell para query ativa, polling visível, foco, reconexão, troca de
  privilégio, erro da conta e retry aguardável;
- componentes do fallback global, Error Boundary, diagnóstico sanitizado e ausência
  de objeto `Error` no transporte;
- componentes do PWA para registro falho, atualização falha, nova tentativa,
  instalação manual e deduplicação de Analytics;
- MSW stateful para os seletores definidos nesta feature, com reset entre testes e
  sem alterar o contrato real;
- Playwright com Vite real, Chromium e MSW Browser para expiração durante o fluxo,
  revogação administrativa, renovação CSRF, cancelamento por navegação e troca de
  pessoa após fila pausada;
- regressão dos cenários vigentes de login, logout, bootstrap CSRF, listagem,
  detalhe, editor, conflito, instalação e atualização PWA;
- revisão manual de código para confirmar que todos os services/query functions
  existentes encaminham signals e que nenhum recurso de sessão ficou fora do
  teardown;
- na implementação: `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`,
  `pnpm build` e `pnpm test:integration`;
- `pnpm -C api test:e2e` não é exigido por esta feature enquanto endpoint, wiring,
  MongoDB e Redis permanecerem inalterados.

## Riscos e decisões

- Polling de `GET /auth/me` acrescenta carga recorrente a MongoDB e Redis. Cinco
  minutos apenas em shell visível limita o custo e impede privilégio stale
  indefinido; foco, reconexão e respostas administrativas antecipam a correção.
- Route guard não substitui autorização da API. A revalidação melhora coerência da
  UI, mas todo endpoint continua sendo a fronteira de segurança.
- Abortar transporte não garante que o servidor não concluiu uma mutation. Por
  isso timeout/cancelamento de write nunca autoriza retry automático nem rollback
  que presuma ausência de efeito; a UI reconcilia antes.
- Uma transição única pode virar dependência global difícil de testar. A decisão é
  manter uma interface pequena, sem imports de domínio, com geração e recursos
  registráveis em vez de um store geral de aplicação.
- O coordenador de planos vive fora do QueryClient e precisa de reset explícito.
  Movê-lo para `core` espalharia conceitos de aggregate; registrá-lo preserva o
  ownership e resolve o ciclo de vida.
- Combinar signals incorretamente pode vazar listeners ou abortar requests públicas.
  A decisão é limitar o signal de geração a requests autenticadas e testar cleanup
  terminal.
- Um timeout único curto prejudicaria upload; ausência de limite permitiria espera
  infinita. A decisão é 15 segundos por default e 60 segundos para a única operação
  longa conhecida, com overrides futuros explícitos e finitos.
- Retry de erro permanente amplifica carga e mascara regras. A allowlist de leitura
  transitória é preferível a uma denylist aberta e mutations permanecem sem retry.
- Error Boundary não captura falhas assíncronas. Por isso bootstrap, callbacks,
  navegações e atualização PWA também precisam de tratamento terminal próprio.
- Diagnóstico técnico bruto poderia vazar dados; categoria somente enumerada perde
  detalhe, mas permite medir o estágio da falha com risco mínimo. Um provedor
  operacional mais rico exige feature própria e política de privacidade.
- Se o MSW falhar, seguir com a aplicação em ambiente de mock poderia atingir API
  real e tornar o teste não determinístico. O fallback bloqueia esse bypass.
- Service worker é melhoria progressiva. Falha de registro ou atualização nunca
  justifica indisponibilizar autenticação, navegação ou conteúdo online.

## Condições esperadas da entrega

- critérios de aceite atendidos;
- políticas transversais independentes de planos e consumíveis por fluxos futuros;
- pessoa atual observada e revalidada dentro da janela definida;
- teardown idempotente limpa caches, CSRF, signals e recursos registrados;
- sessão nova não herda cache, fila, versão, pausa, draft ou callback antigo;
- todos os requests têm timeout finito e todas as queries existentes encaminham
  `AbortSignal` até o Axios;
- cancelamento, timeout, falha transitória, `401`, `403` e conflito seguem caminhos
  distintos e testados;
- bootstrap e renderização nunca terminam em tela vazia quando o root está
  disponível;
- PWA falha de forma progressiva, com recuperação e sem bloquear a aplicação;
- diagnóstico mantém somente categorias permitidas e Analytics não duplica eventos;
- SDDs vivos, MSW e testes atualizados conforme o impacto;
- componentes e helpers sem uso removidos após inspeção de API e UI;
- quality gates da raiz e Playwright aprovados.
