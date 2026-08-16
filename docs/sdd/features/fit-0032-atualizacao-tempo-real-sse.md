# Feature Spec: Atualização em tempo real dos planos via SSE

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: FIT-0032.
- Problema: lista, detalhe e editor de workout mantêm caches e coordenadores
  independentes por documento do navegador. Uma mutação confirmada no computador,
  celular ou aba de uma pessoa não chega aos demais clientes. O CAS por versão evita
  sobrescrita, mas o cliente desatualizado só descobre a mudança quando tenta gravar
  e recebe `412 TRAINING_PLAN_VERSION_CONFLICT`.
- Resultado: toda mutação efetiva de plano global publica um sinal de invalidação
  em tempo real. Uma conexão autenticada por Server-Sent Events distribui esse sinal
  a outras instâncias da UI, e lista, detalhe e editor reconciliam seus dados pela
  API HTTP canônica sem transformar o stream em fonte de verdade.
- Resultado de UX no editor: se não houver trabalho local, a representação é
  atualizada automaticamente. Se houver draft, debounce ou tarefa recuperável, a
  fila é pausada e um alerta oferece diretamente `Descartar e recarregar`; não
  existe modal adicional para confirmar o descarte.
- Resultado arquitetural: a aplicação passa a ter uma infraestrutura SSE
  autenticada, tipada, observável e extensível a outros domínios, enquanto a
  integração concreta desta entrega permanece limitada aos planos globais.
- Versões confirmadas no planejamento: NestJS `11.1`, RxJS `7.8`, ioredis `5.11`,
  Axios `1.18`, TanStack Query `5.101` e MSW `2.15`. O cliente SSE é o
  `EventSource` nativo do browser; não se adiciona biblioteca de transporte.
- Referências:
  - [fluxo vigente de gestão dos planos](../flows/gestao-planos-treino-globais.md);
  - [arquitetura vigente da API](../../../api/docs/sdd/base/01-arquitetura.md);
  - [arquitetura vigente da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [endpoint vigente de planos](../../../api/docs/sdd/endpoints/global-training-plans.md);
  - [SSE no NestJS](https://docs.nestjs.com/techniques/server-sent-events);
  - [streaming em Vercel Functions](https://vercel.com/docs/functions/streaming-functions);
  - [Fluid Compute e limites de duração](https://vercel.com/docs/fluid-compute);
  - [EventSource e credenciais cross-origin](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events);
  - [semântica at-most-once do Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/);
  - [WebSocket em beta público na Vercel](https://vercel.com/changelog/websocket-support-is-now-in-public-beta).
- Features relacionadas:
  - [FIT-0028 — editor, escala e concorrência](fit-0028-editor-exercicios-escalabilidade-concorrencia.md);
  - [FIT-0030 — paginação e recuperação de concorrência](fit-0030-paginacao-recuperacao-concorrencia-planos.md);
  - [FIT-0047 — conflito de versão na Vercel](fit-0047-corrigir-falso-conflito-vercel.md).

## Escopo

### Incluído

- Criar um endpoint SSE genérico e autenticado para eventos em tempo real.
- Criar a infraestrutura reutilizável de publicação, fan-out, autorização,
  conexão, heartbeat, encerramento e reconexão.
- Distribuir eventos entre runtimes da API por Redis Pub/Sub, com conexão de
  subscriber separada da conexão Redis usada por sessão, rate limit e comandos.
- Publicar invalidação depois de toda mutação efetiva e confirmada do aggregate
  `TrainingPlan`, incluindo criação e exclusão.
- Reconciliar em tempo real as três telas do fluxo:
  - `/global/training-plan`;
  - `/global/training-plan/:trainingPlanId`;
  - `/global/training-plan/:trainingPlanId/workout/:workoutId`.
- Evitar que a aba que originou a mutation processe o próprio evento como uma
  alteração externa, sem impedir que outra aba ou dispositivo da mesma pessoa o
  receba.
- Preservar CAS, `X-Resource-Version`, coordenador FIFO e classificação exata do
  `412` como proteção final contra corrida, perda de evento ou indisponibilidade do
  SSE.
- Remover apenas do fluxo de conflito do editor de workout/exercícios o
  `AlertDialog` intermediário de descarte. O alerta passa a concentrar explicação,
  loading, falha e a ação direta `Descartar e recarregar`.
- Simular stream, eventos externos, reconexão e falhas com MSW no Vitest e no
  Playwright.
- Validar o endpoint e o fan-out com Redis real efêmero nos E2E da API.
- Registrar a decisão transversal em uma nova ADR e atualizar as bases, endpoint,
  rotas e fluxo vivos durante a implementação autorizada.

### Não incluído

- WebSocket, Socket.IO ou dependência do suporte WebSocket ainda em beta da
  Vercel.
- Edição colaborativa de caracteres, cursores, presença, bloqueio pessimista,
  merge automático, CRDT ou resolução campo a campo.
- Envio de payloads completos de plano, workout ou exercício pelo stream.
- Substituição das queries HTTP, do MongoDB como fonte de verdade ou do CAS.
- Garantia durável, replay de eventos, Redis Streams, broker adicional ou outbox
  transacional.
- MongoDB Change Streams. Alterações feitas diretamente no banco não publicam SSE.
- Push notification, atualização com a PWA fechada, background sync ou service
  worker dedicado ao realtime.
- Aplicar eventos SSE a domínios diferentes de planos nesta entrega.
- Remover as confirmações de exclusão, proteção de navegação com trabalho local
  ou confirmações de conflito existentes nas telas de lista e detalhe.

## Projetos e documentação afetados

- API e endpoints:
  - novo documento vivo `api/docs/sdd/endpoints/realtime-events.md` para
    `GET /realtime/events`;
  - `api/docs/sdd/endpoints/global-training-plans.md` para a publicação posterior
    ao commit e seus caminhos degradados;
  - `api/docs/sdd/base/01-arquitetura.md` para o padrão de realtime, conexões Redis
    e execução na Vercel;
  - `api/docs/sdd/base/02-endpoints-e-contratos.md` para o contrato de streaming,
    quando necessário.
- UI e rotas:
  - `ui/docs/sdd/base/01-arquitetura.md` para o lifecycle transversal do
    `EventSource`, registro de consumidores e reconciliação;
  - `ui/docs/sdd/routes/global-training-plan.md`;
  - `ui/docs/sdd/routes/global-training-plan-detail.md`;
  - `ui/docs/sdd/routes/global-training-plan-workout.md`.
- Fluxos:
  - `docs/sdd/flows/gestao-planos-treino-globais.md`.
- Contratos em `@dall-fit/types`:
  - evento público discriminado de invalidação;
  - recurso realtime inicialmente restrito a `global-training-plan`;
  - estado `present|deleted`, com versão obrigatória apenas quando o aggregate
    permanece existente;
  - nenhum DTO interno do Redis, principal autenticado ou identificador da origem
    integra o pacote público.
- Decisões arquiteturais:
  - criar `docs/sdd/adr/ADR-0008-sse-e-invalidacao-realtime.md` para registrar SSE
    unidirecional, Redis Pub/Sub at-most-once, reconciliação HTTP e a rejeição de
    WebSocket/Streams neste caso de uso;
  - preservar ADR-0004, ADR-0005 e ADR-0006, acrescentando relação sem substituir
    sessão revogável, CAS ou transporte de versão.
- Handlers e fixtures MSW:
  - handler de stream com `text/event-stream`, conexão pronta, heartbeat, evento
    externo, desconexão e reconexão;
  - mutações de planos publicam no mock somente depois do sucesso efetivo e não
    ecoam para o `clientInstanceId` originador;
  - cenários determinísticos para as três telas e para falha da leitura canônica.
- Mocks de repositories/caches nos unitários da API:
  - publisher Redis, subscriber dedicado, hub local e falha de publicação;
  - commands de plano comprovam publicação somente após efeito confirmado.
- Fixtures MongoDB/Redis nos E2E:
  - Redis efêmero real para Pub/Sub e sessão;
  - MongoDB efêmero vigente, sem replica set porque Change Streams não fazem parte
    da solução;
  - seed e cURL reproduzíveis para abrir o stream e provocar uma mutação em outra
    conexão.

## Requisitos funcionais

### Contrato do stream

1. `GET /realtime/events` é uma leitura autenticada, não exige CSRF e responde
   `text/event-stream` somente depois de a sessão ser validada. Cada abertura
   consome uma política configurável própria de rate limit, inicialmente
   30/minuto por sessão e IP; heartbeat e eventos da conexão já aberta não consomem
   novas quotas.
2. A UI abre o stream cross-origin com `EventSource` nativo e
   `withCredentials: true`; não cria Axios, `fetch` ou client paralelo para o
   transporte SSE.
3. Cada documento do navegador gera um `clientInstanceId` UUID aleatório somente
   em memória. O valor:
   - identifica a conexão na query validada do endpoint;
   - é enviado em `X-Client-Instance-Id` nas mutations da instância Axios;
   - não é cookie, sessão, identidade, segredo ou dado persistente;
   - não entra em Analytics nem é registrado integralmente em logs.
4. Uma publicação com origem conhecida não é entregue à conexão de mesmo
   `clientInstanceId`. Outras abas, janelas, PWAs e dispositivos recebem o evento,
   inclusive quando pertencem à mesma pessoa ou ao mesmo admin.
5. Clientes sem `X-Client-Instance-Id` continuam compatíveis: a mutation funciona
   e seu evento é entregue a todas as conexões autorizadas.
6. O stream emite eventos nomeados:
   - `realtime-ready`, após o subscriber estar apto a encaminhar eventos;
   - `resource-invalidated`, com o contrato compartilhado;
   - heartbeat sem dado de domínio, ignorado pela UI.
7. O evento de invalidação informa apenas `resource`, `resourceId`, `state` e,
   para `state: present`, a `version` canônica. Nomes, descrições, exercícios,
   pessoa, sessão, draft, URL assinada e payload da mutation não atravessam SSE.
8. A conexão usa headers que impeçam cache e transformação/buffering indevidos,
   envia heartbeat a cada 20 segundos e encerra seus timers/listeners quando o
   browser desconecta.
9. A configuração versionada da Vercel usa Fluid Compute e `maxDuration` de 300
   segundos. A aplicação conclui cada stream de forma controlada em até 270
   segundos e informa retry de 3 segundos; o `EventSource` reconecta
   automaticamente e recebe outro `realtime-ready`. Encerramento anterior pela
   plataforma continua sendo um caminho normal e recuperável.
10. Não há promessa de replay por `Last-Event-ID`. Todo `realtime-ready`, inicial
    ou posterior, manda a UI revalidar as queries realtime ativas registradas. Essa
    leitura canônica fecha a janela entre query/stream e recupera eventos perdidos
    enquanto o cliente, Redis ou runtime estava desconectado.

### Publicação e distribuição

11. Toda mutation efetiva de plano publica exatamente uma invalidação depois do
    commit MongoDB e com a versão resultante. Criação usa `present` com versão
    zero; exclusão usa `deleted` sem inventar uma versão persistida.
12. Validação rejeitada, falta de permissão, falha técnica pré-commit, conflito
    CAS, rollback e operação no-op não publicam evento.
13. Falha de `PUBLISH` depois do commit é registrada de forma sanitizada, mas não
    converte um write confirmado em erro HTTP e não tenta reverter MongoDB. O
    cliente originador recebe a response canônica; os demais convergem por
    reconexão, revalidação ou CAS.
14. O canal Pub/Sub é composto exclusivamente pelo `RedisKeyService`, inclui o
    namespace vigente de ambiente/preview e não mistura deployments.
15. A conexão Redis regular continua atendendo sessão, rate limit, health e
    `PUBLISH`. Um client ioredis separado e dedicado entra em subscriber mode. A
    infraestrutura multiplexa cada mensagem recebida somente para conexões SSE
    locais autorizadas.
16. O subscriber dedicado é criado/reutilizado por runtime, possui lifecycle,
    timeout, TLS, reconexão limitada, listener de erro e encerramento coerentes com
    a Vercel. Nenhum client ou subscription é criado por evento publicado.
17. Redis Pub/Sub é deliberadamente at-most-once e não guarda histórico. O
    contrato admite duplicidade, perda e ordem de chegada diferente entre
    reconexões; `version`, invalidação idempotente e leitura canônica tornam esses
    casos seguros.
18. O endpoint valida sessão antes de abrir a conexão e filtra o audience antes de
    cada encaminhamento local. Eventos de planos globais só chegam a pessoas com
    acesso administrativo; a infraestrutura permite políticas de audience de
    outros domínios sem enviar essa política no payload público.

### Lifecycle reutilizável da UI

19. Existe no máximo um `EventSource` por documento autenticado. O recurso vive em
    infraestrutura transversal, enquanto cada domínio registra seu handler sem
    fazer `core` importar módulos de rota.
20. O bridge realtime de planos permanece montado em toda a branch administrativa,
    cobrindo lista, detalhe, workout e caches inativos entre essas rotas.
21. Logout, primeiro `401`, troca de identidade ou teardown da geração fecha o
    `EventSource`, remove listeners, limpa eventos pendentes e impede callbacks na
    sessão seguinte.
22. Depois de 60 segundos continuamente oculto, o documento fecha o stream para
    reduzir conexão, bateria e custo. Voltar a ficar visível cancela esse timer ou
    abre uma conexão nova, e reconcilia as queries registradas no
    `realtime-ready` antes de confiar novamente em eventos incrementais.
23. Falha ou indisponibilidade do SSE não bloqueia leitura nem escrita e não mostra
    erro global recorrente. As queries normais, recuperação manual e CAS continuam
    funcionais; a volta do stream provoca reconciliação.
24. Payload desconhecido, malformado, com recurso não registrado ou versão inválida
    é ignorado com diagnóstico sanitizado, sem invalidar toda a aplicação nem
    encerrar a sessão.
25. Eventos repetidos são coalescidos por recurso/aggregate e a maior versão
    observada prevalece. Uma versão igual ou inferior à já confirmada não regride o
    coordenador nem provoca refetch redundante.

### Comportamento das três telas

26. A lista invalida as páginas de planos afetadas por criação, alteração ou
    exclusão externa. Queries ativas refazem a leitura; queries inativas ficam
    stale. Paginação e canonicalização de `page` continuam vigentes.
27. Um evento de outro plano não fecha modal nem apaga draft em edição na lista.
    Para o mesmo plano com trabalho recuperável, o coordenador pausa e conserva a
    recuperação de conflito já documentada nessa rota.
28. O detalhe invalida e refaz sua leitura para refletir nome, descrição, criação,
    exclusão e contagem de workouts. Sem trabalho local, a tela aplica a response
    canônica automaticamente. Com draft/tarefa recuperável do mesmo aggregate,
    pausa e conserva a recuperação de conflito vigente do detalhe.
29. No editor de workout, evento mais novo do mesmo `trainingPlanId` alcança a tela
    mesmo quando a alteração externa ocorreu em outro workout, pois a versão e o
    CAS pertencem ao aggregate inteiro.
30. Se o editor estiver limpo e a fila ociosa, a query canônica é refeita e nome,
    exercícios, ordem, contagem, imagem e versão aplicáveis são atualizados sem
    alerta. O editor deve aceitar uma nova representação canônica limpa; não pode
    conservar estado local antigo apenas porque o componente permaneceu montado.
31. Se existir draft, dirty patch, debounce, erro recuperável, linha temporária,
    operação estrutural ou tarefa enfileirada, o evento externo impede novas
    gravações daquele aggregate e mostra o mesmo alerta persistente usado pelo
    conflito `412`.
32. Uma mutation já na cabeça da fila não é presumida como cancelada pelo evento.
    A maior versão externa fica pendente; o resultado HTTP terminal decide se a
    versão local já convergiu ou se a fila entra em conflito.
33. O alerta do editor informa que o plano mudou em outro lugar, que a recarga é
    necessária para continuar e que alterações locais serão descartadas. Ele
    oferece diretamente `Descartar e recarregar`, sem abrir `AlertDialog`.
34. Ao acionar `Descartar e recarregar`:
    - o botão entra em pending e impede clique duplicado;
    - a UI executa a leitura canônica imediatamente;
    - falha de rede/servidor mantém draft, alerta e fila pausada, com erro e nova
      tentativa no próprio alerta;
    - sucesso reseta o coordenador com a versão recebida, remonta/reconcilia o
      editor, descarta drafts e libera gravações;
    - `TRAINING_PLAN_NOT_FOUND` conduz à lista e `WORKOUT_NOT_FOUND` conduz ao
      detalhe, sem manter uma tela irrecuperável.
35. O alerta de resultado incerto de timeout continua separado: `Verificar dados`
    faz leitura canônica e preserva drafts conforme o contrato vigente. A remoção
    da modal de conflito não transforma timeout em descarte automático.
36. O `AlertDialog` de saída do editor continua protegendo navegação com trabalho
    local. A mudança elimina somente a confirmação adicional aberta pelo alerta de
    conflito.

## Requisitos não funcionais

- Acessibilidade:
  - `realtime-ready` e atualizações automáticas silenciosas não roubam foco nem
    anunciam cada refetch;
  - o alerta de conflito possui título, descrição e erro persistente, e seu botão
    expõe nome e estado pending;
  - uma atualização canônica limpa preserva foco quando o controle correspondente
    continua existindo; remoção externa move o foco para um alvo previsível;
  - nenhum fluxo depende apenas de cor, toast ou animação.
- Performance:
  - um stream por documento autenticado, um subscriber Redis dedicado por runtime
    e multiplexação local para conexões concorrentes;
  - payloads pequenos de invalidação, heartbeat sem dado de domínio e coalescência
    de eventos repetidos;
  - somente queries ativas refazem request imediatamente; caches inativos são
    marcados stale;
  - a própria aba não duplica GET a cada autosave bem-sucedido;
  - conexão oculta é fechada depois de 60 segundos e sempre reconcilia ao
    retornar;
  - a configuração da Vercel considera duração, Fluid Compute, memória provisionada
    e encerramento/reconexão esperados, sem assumir processo permanente.
- Segurança e privacidade:
  - cookie `HttpOnly`, sessão revogável, CORS credenciado e audience são aplicados
    antes de qualquer dado de domínio;
  - SSE é GET sem efeito persistente e não exige token CSRF; mutations continuam
    exigindo origem, CSRF e rate limit;
  - CSP `connect-src` permanece limitada à origem exata da API;
  - eventos não contêm conteúdo de plano, pessoa, arquivo, URL assinada, cookie,
    token ou credencial;
  - `clientInstanceId` é efêmero, não identifica pessoa, não é persistido e não
    aparece integralmente em logs/Analytics;
  - principal e audience internos do Redis nunca atravessam `@dall-fit/types` nem
    chegam ao browser.
- Observabilidade:
  - API registra abertura/fechamento, duração, motivo sanitizado, quantidade de
    conexões locais, publicação, recebimento, supressão da origem e falhas de Redis
    sem payload integral, pessoa, sessão ou IDs de cliente;
  - heartbeat não produz log por conexão;
  - falha de publish posterior ao commit usa warning distinguível de falha do
    write;
  - logs seguem `NomeDaClasse -> nomeDoMetodo -> etapa:` e `requestId` quando
    houver request; eventos Redis fora da request não inventam correlação;
  - Analytics pode registrar apenas estados enumerados de conexão/reconciliação se
    o catálogo vivo for ampliado, nunca evento individual ou identificador.

## Critérios de aceite

### Cenário 1 — Duas instâncias recebem atualização da lista

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=realtime`.
- Given: duas páginas do navegador abriram a lista e possuem
  `clientInstanceId` distintos.
- When: a primeira cria, edita ou exclui um plano e a mutation é confirmada.
- Then: a primeira aplica sua response normal sem refetch causado pelo próprio
  evento; a segunda refaz a lista ativa e apresenta o estado canônico sem refresh
  manual.

### Cenário 2 — Detalhe acompanha alteração externa

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001?mockAuth=admin&mockTrainingPlans=realtime`.
- Given: o detalhe está limpo em um cliente e outro cliente altera o mesmo plano ou
  seus workouts.
- When: o evento `resource-invalidated` com versão superior chega.
- Then: nome, descrição, workouts, contagens e versão aplicáveis convergem pela
  query canônica sem fechar a rota nem exibir conflito desnecessário.

### Cenário 3 — Editor limpo reflete exercício alterado em outro dispositivo

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=realtime`.
- Given: computador e celular exibem o mesmo workout, e o celular não possui
  trabalho local.
- When: o computador confirma alteração de nome, campo, ordem, linha ou imagem.
- Then: o celular refaz o GET, apresenta a representação nova e avança a versão do
  coordenador sem modal, alerta ou intervenção manual.

### Cenário 4 — Atualização externa durante draft usa somente o alerta

- Forma de validar: mesmo link do cenário 3, com duas páginas Playwright.
- Given: o segundo cliente possui draft/debounce local ainda não confirmado.
- When: o primeiro confirma outra mutação do mesmo plano.
- Then: o segundo preserva o draft visível, pausa novas gravações e mostra alerta
  com `Descartar e recarregar`; o clique não abre `AlertDialog` e inicia o GET
  diretamente.

### Cenário 5 — Descarte acontece somente depois da leitura bem-sucedida

- Forma de validar: link do cenário 3 com o stream realtime e a leitura seguinte
  configurada para falhar uma vez no MSW.
- Given: o alerta preserva um rascunho local e a fila está pausada.
- When: a primeira tentativa de `Descartar e recarregar` falha e a segunda retorna
  o recurso canônico.
- Then: a falha mantém rascunho, alerta e pausa; a tentativa bem-sucedida descarta,
  atualiza a tela, reinicializa a versão e libera a fila, tudo no próprio alerta.

### Cenário 6 — Aggregate removido externamente possui saída terminal

- Forma de validar: links dos cenários 2 e 3 com exclusão pelo outro cliente.
- Given: a pessoa está no detalhe ou editor quando outro admin exclui o plano ou o
  workout correspondente.
- When: a reconciliação canônica confirma `TRAINING_PLAN_NOT_FOUND` ou
  `WORKOUT_NOT_FOUND`.
- Then: a UI encerra o contexto irrecuperável e navega respectivamente para lista
  ou detalhe, com feedback acessível e sem loop de reload.

### Cenário 7 — Perda do stream converge na reconexão

- Forma de validar: cenário MSW realtime que fecha o stream, altera a fixture
  enquanto desconectado e aceita a reconexão.
- Given: Redis Pub/Sub/SSE perdeu um evento durante a desconexão.
- When: `EventSource` reconecta e recebe `realtime-ready`.
- Then: as queries realtime registradas são revalidadas e a UI converge sem exigir
  replay, `Last-Event-ID` ou a ocorrência de outro write.

### Cenário 8 — SSE indisponível não remove a proteção de concorrência

- Forma de validar: links normais com o handler de stream indisponível e duas
  mutations reais simuladas com versões concorrentes.
- Given: o cliente não consegue manter conexão realtime.
- When: outro cliente incrementa a versão e o cliente desatualizado tenta gravar.
- Then: o sistema continua utilizável, o CAS responde
  `412 TRAINING_PLAN_VERSION_CONFLICT` e o mesmo alerta direto preserva o draft e
  oferece descarte/reload, sem retry ou merge silencioso.

### Cenário 9 — Endpoint autentica e distribui somente ao audience permitido

- Forma de validar: cenário vivo de `api/docs/sdd/endpoints/realtime-events.md`,
  com seed e dois cURLs completos, um `curl -N` para o stream e outro para a
  mutation.
- Given: conexões sem sessão, de pessoa comum e de admin tentam acompanhar eventos
  de planos globais.
- When: um write administrativo efetivo é confirmado.
- Then: ausência de sessão é rejeitada, pessoa comum não recebe o evento de plano e
  admin recebe somente o envelope mínimo de invalidação.

### Cenário 10 — Publicação respeita o commit e degrada com segurança

- Forma de validar: cenários vivos dos endpoints de planos e E2E com Redis
  efêmero.
- Given: existem caminhos de sucesso efetivo, no-op, conflito, falha pré-commit e
  falha de Redis posterior ao commit.
- When: cada mutation é executada.
- Then: somente o sucesso efetivo tenta publicar exatamente uma vez; a falha de
  publish não muda a response canônica nem o efeito MongoDB, e os demais caminhos
  não produzem evento.

### Cenário 11 — Duas abas da mesma pessoa continuam independentes

- Forma de validar: Playwright abre duas páginas no mesmo contexto autenticado.
- Given: as abas compartilham a sessão, mas possuem `clientInstanceId` distintos.
- When: uma aba salva um exercício.
- Then: apenas a conexão que originou a mutation é suprimida; a outra recebe a
  invalidação e atualiza como qualquer outro dispositivo.

### Cenário 12 — Lifecycle de sessão e documento não vaza conexão

- Forma de validar: Vitest do recurso realtime e Playwright da branch
  autenticada.
- Given: existe um stream aberto com listeners e reconciliação pendente.
- When: ocorre logout, `401`, troca de pessoa, documento oculto/visível ou unmount
  definitivo.
- Then: a conexão anterior é fechada e limpa uma vez; callbacks antigos não
  atualizam cache da nova geração; a volta visível abre no máximo uma conexão e
  reconcilia no `realtime-ready`.

### Cenário 13 — Streaming funciona no deployment Vercel

- Forma de validar: deployment Preview com duas sessões/abas e inspeção do stream
  no Network.
- Given: API usa Fluid Compute e a configuração de duração adotada pela entrega.
- When: a conexão permanece ociosa, recebe heartbeat, recebe uma invalidação e é
  encerrada pela aplicação/plataforma.
- Then: headers/chunks não ficam bufferizados até o fim, o evento chega antes do
  encerramento, a reconexão ocorre e a leitura canônica converge.

## Estratégia de entrega e compatibilidade

1. Introduzir o contrato compartilhado e a infraestrutura genérica sem remover o
   HTTP, a versão ou o coordenador atual.
2. Criar o publisher/subscriber Redis, hub autorizado e endpoint SSE antes de
   acoplar o domínio de planos.
3. Adicionar `X-Client-Instance-Id` como header opcional e compatível. Atualizar
   CORS, Axios e mocks atomicamente; clientes antigos continuam funcionando.
4. Publicar eventos nas operações de mutation aplicáveis somente quando elas
   realmente alterarem o aggregate. Implantar API antes ou junto da UI é seguro:
   UI antiga ignora o endpoint, e API antiga apenas mantém a UI nova em modo
   degradado sem SSE.
5. Montar o lifecycle realtime e o bridge de planos na branch administrativa.
   Aplicar primeiro invalidação/reconciliação nas telas limpas e depois integrar
   o estado recuperável ao coordenador.
6. Remover a modal de conflito do editor somente quando o alerta direto cobrir
   pending, sucesso, falha, not-found e conflito originado tanto por SSE quanto por
   `412`.
7. Atualizar na mesma implementação os SDDs vivos e criar a ADR-0008. A feature
   validada permanece inalterada.
8. Validar localmente, nos E2E e em Preview. O rollout não considera SSE uma
   dependência de disponibilidade para writes; CAS permanece obrigatório em todas
   as fases.

## Plano de testes

- Unitários da API:
  - serialização/validação do evento e do `clientInstanceId`;
  - publisher usa canal namespaced, envelope interno e falha soft pós-commit;
  - subscriber dedicado não reutiliza conexão em command mode;
  - hub filtra audience e origem, multiplexa e remove conexão encerrada;
  - ready, heartbeat, cleanup e erro do Observable/stream;
  - cada família de command de plano publica em sucesso efetivo e não publica em
    no-op, conflito ou falha.
- E2E da API:
  - autenticação/CORS/content type do endpoint;
  - Redis real entrega evento de uma request a uma conexão aberta por outra
    instância lógica;
  - mesma origem é suprimida e outra origem recebe;
  - pessoa sem admin não recebe evento de plano;
  - commit MongoDB precede publish e falha pós-commit não altera o sucesso;
  - teardown fecha subscriber, timers, app, MongoDB e Redis sem handles pendentes.
- Unitários/Vitest da UI:
  - factory de `EventSource`, uma conexão por documento, credenciais, eventos
    nomeados e cleanup;
  - client ID efêmero e header somente nas mutations;
  - ready inicial/reconectado, visibilidade e ciclo de sessão;
  - parsing defensivo, versão monotônica, coalescência e registro de handlers;
  - bridge de planos invalida lista, detalhe e workouts sem `core` conhecer rotas;
  - coordenador resolve evento durante idle, draft e task em execução;
  - editor limpo aceita representação externa; editor dirty preserva rascunho;
  - alerta direto cobre pending, falha, sucesso e not-found sem `AlertDialog`;
  - teardown impede writes na geração seguinte.
- MSW:
  - stream realista com `ReadableStream`/`text/event-stream`, ready, heartbeat,
    invalidação, fechamento e reconexão;
  - estado por cenário/contexto sem interferência entre Playwrights paralelos;
  - nenhuma request escapa para API real e PWA continua desabilitada nos testes.
- Playwright:
  - duas páginas para lista, detalhe e editor;
  - atualização automática quando limpo;
  - draft concorrente, alerta direto, falha de reload e descarte bem-sucedido;
  - remoção externa e navegação terminal;
  - desconexão/reconexão recuperando evento perdido;
  - mesma sessão com IDs de instância diferentes;
  - proteção de navegação existente permanece funcional.
- Verificação manual de Preview:
  - streaming sem buffering, heartbeat, duração finita, reconexão, cookies/CORS,
    duas máquinas e ausência de eco da origem.
- Quality gates:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`.

## Riscos e decisões

- SSE foi escolhido porque o fluxo é unidirecional e transporta invalidação, não
  colaboração bidirecional. O beta público de WebSocket da Vercel não oferece
  benefício necessário que justifique adotá-lo nesta demanda.
- O stream nunca carrega o estado canônico. Essa decisão limita payload, exposição
  e acoplamento e faz TanStack Query continuar proprietário da leitura.
- Redis Pub/Sub foi escolhido para fan-out efêmero entre runtimes porque perda é
  recuperada por refetch. Redis Streams/outbox adicionariam persistência,
  retenção, consumidores e operação incompatíveis com o valor deste sinal.
- O maior risco funcional é perder evento durante desconexão. `realtime-ready`
  sempre acompanhado de revalidação canônica é condição da entrega, não uma
  otimização opcional.
- O maior risco operacional é manter Functions e memória provisionada enquanto
  conexões estão abertas. Um stream por documento, Fluid Compute, heartbeat
  controlado, encerramento quando oculto e duração finita limitam esse custo; uso e
  duração devem ser conferidos em Preview.
- O maior risco de UX é sobrescrever draft ao aplicar uma query externa. O handler
  consulta o estado recuperável antes do refetch; somente editor limpo aplica
  automaticamente. Em estado dirty, o descarte é explícito no texto do alerta.
- O maior risco de consistência é o evento chegar antes da response de uma
  mutation concorrente. A origem é suprimida, versões são monotônicas e uma tarefa
  já iniciada termina pelo HTTP/CAS antes da decisão de recuperação.
- Publicação não é transacional com MongoDB. Falha posterior ao commit não pode
  transformar sucesso em erro ambíguo; a reconciliação periódica e o CAS assumem a
  recuperação.
- A conexão autenticada longa amplia a janela entre validações de sessão/permissão.
  O servidor filtra audience, a UI fecha no teardown e a duração finita obriga
  nova autenticação; o endpoint continua enviando apenas IDs opacos e versão.
- O `clientInstanceId` evita uma leitura duplicada por autosave sem confundir abas
  da mesma pessoa. Ele é correlação efêmera de transporte, não identidade nem
  mecanismo de autorização.
- A infraestrutura é extensível por registro de recursos e policies de audience,
  mas esta entrega não cria handlers ou contratos hipotéticos para domínios sem
  consumidor atual.

## Condições esperadas da entrega

- Critérios de aceite atendidos.
- Contratos, endpoints, rotas e fluxos afetados atualizados.
- ADR-0008 criada com a decisão transversal vigente.
- MSW, mocks unitários, E2E e Playwright atualizados conforme o impacto.
- Migração entre produtor e consumidores compatível.
- SSE validado localmente e em Preview da Vercel.
- CAS e recuperação por `412` continuam funcionais sem o stream.
- Revisão final remove componentes, estados e testes da modal de conflito que
  ficarem sem uso, preservando os `AlertDialog` ainda usados por exclusão e
  navegação.
- Quality gates da raiz aprovados.
