# Feature Spec: Padronização de erros e preparação operacional da API

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0027` — [issue #27](https://github.com/eduardodallmann/dall-fit/issues/27)
- Problema: a API possui corpos de erro funcionais próximos de `ApiError`, mas
  falhas geradas pelo framework e exceções inesperadas ainda escapam desse
  contrato. O callback OAuth converte indiscriminadamente falhas técnicas de
  Google, MongoDB, Redis e emissão da sessão em erro comum do protocolo, e a
  aplicação não oferece correlação de requests, probes operacionais nem ativação
  explícita dos hooks de encerramento. A rota protegida `GET /` devolve apenas
  `Hello World!` e não possui finalidade operacional.
- Resultado: toda resposta de erro HTTP usa um contrato estável e inclui o mesmo
  identificador correlacionado aos logs da requisição; erros esperados do OAuth
  continuam recuperáveis sem esconder falhas técnicas; a aplicação possui
  liveness, readiness conjunta de MongoDB e Redis e encerramento gracioso; a rota
  raiz de exemplo é removida e passa naturalmente a responder o `404` global
  normalizado.
- Referências:
  - `packages/types/src/contracts.ts`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/base/02-endpoints-e-contratos.md`;
  - `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
  - `api/docs/sdd/endpoints/auth.md`;
  - `api/docs/sdd/endpoints/root.md`;
  - `api/src/redis/redis-client.service.ts`;
  - `docs/sdd/adr/ADR-0004-sessao-revogavel-redis-e-csrf.md`;
  - [NestJS — Exception filters](https://docs.nestjs.com/exception-filters);
  - [NestJS — Async Local Storage](https://docs.nestjs.com/recipes/async-local-storage);
  - [NestJS — Lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events);
  - [NestJS — Health checks](https://docs.nestjs.com/recipes/terminus).
- Features relacionadas:
  - `FIT-0001` — introduziu o fluxo OAuth, o contrato de erros funcionais e a rota
    raiz protegida;
  - `FIT-0004` — introduziu outro erro HTTP funcional estável e reforçou a
    necessidade de preservá-lo no tratamento transversal;
  - `FIT-0026` — introduziu PKCE, sessão revogável, CSRF, rate limiting e o client
    Redis compartilhado que agora também precisa participar da readiness e do
    encerramento gracioso.

## Escopo

### Incluído

- contexto por request baseado no `AsyncLocalStorage` nativo do Node.js;
- geração ou propagação segura de `x-request-id` em toda requisição HTTP;
- inclusão do identificador no header de toda resposta, nos logs executados no
  contexto da requisição e no corpo de todo `ApiError`;
- inclusão de `X-Request-Id` nos headers permitidos e expostos pelo CORS exato
  vigente, sem relaxar origem, métodos, credenciais ou as demais proteções da
  FIT-0026;
- logger global compatível com o `Logger` do NestJS, preservando mensagens e
  contextos vigentes e acrescentando o identificador aos metadados estruturados;
- exception filter global injetável, registrado por `APP_FILTER`, que captura
  erros HTTP e exceções desconhecidas;
- preservação de status, `code`, `message` e `details` dos erros funcionais já
  estruturados pela aplicação;
- normalização do `404` do framework, de indisponibilidades operacionais e do
  `500` inesperado em `ApiError`, sem expor detalhes internos;
- extensão de `ApiError` com `details` e `requestId` obrigatórios e migração
  atômica dos produtores, testes, handlers e fixtures que constroem esse contrato;
- restrição do tratamento recuperável do callback OAuth aos erros esperados do
  protocolo e da identidade, permitindo que falhas técnicas alcancem o filter
  global;
- limpeza dos cookies temporários de state, nonce e PKCE verifier em qualquer
  término do callback, sem criar ou substituir cookie de sessão quando o fluxo
  falhar;
- ativação de `enableShutdownHooks()` antes de a aplicação começar a escutar;
- adição de `@nestjs/terminus` compatível com a versão instalada do NestJS;
- `GET /health` público como probe de liveness, sem consultar dependências;
- `GET /ready` público como probe de readiness, com pings reais à conexão Mongoose
  e ao client ioredis compartilhado;
- readiness indisponível durante encerramento ou quando MongoDB ou Redis não
  responderem;
- remoção de `GET /`, do controller, command, providers, testes e documentação que
  existirem exclusivamente para o `Hello World!`;
- atualização dos SDDs vivos, contratos, mocks e testes afetados somente na futura
  fase de implementação.

### Não incluído

- implementar a feature durante a fase de especificação;
- manter redirecionamento, alias ou resposta de compatibilidade em `GET /`;
- transformar `/health` ou `/ready` em substitutos da rota raiz;
- autenticação ou autorização dos probes;
- métricas, tracing distribuído, OpenTelemetry, plataforma externa de logs ou
  alertas;
- adicionar `nestjs-cls` ou outra dependência para contexto assíncrono;
- criar outro client, pool, conexão ou fallback Redis para health check;
- probe ativo do Google OAuth: o provedor é uma integração acionada pelo login,
  não uma dependência que deve retirar toda a API de readiness;
- alterar a política de retry, timeout ou disponibilidade do Google;
- configurar probes em Vercel, Kubernetes ou outro ambiente externo;
- criar endpoint artificial para forçar exceções somente para testes;
- alterar telas, navegação ou apresentação da UI;
- definir atraso operacional de shutdown sem existir requisito do ambiente de
  deploy.

## Projetos e documentação afetados

- API e endpoints:
  - infraestrutura transversal de request context, logger e exception filter;
  - `api/src/main.ts`, `api/src/configure-application.ts`, CORS e composição do
    módulo raiz;
  - módulo operacional próprio para `GET /health` e `GET /ready`, com controller,
    commands e services/indicadores coerentes com as camadas vigentes;
  - extensão mínima de `RedisClientService` para o ping de readiness pelo mesmo
    client singleton, sem exportar o objeto ioredis;
  - remoção de `AppController`, `GetRootCommand` e artefatos exclusivos de
    `GET /`;
  - refinamento da limpeza HTTP do callback e do limite de captura em
    `CompleteGoogleLoginCommand` e `GoogleOAuthService`;
  - atualização de `api/docs/sdd/base/01-arquitetura.md`,
    `02-endpoints-e-contratos.md` e `06-logging-e-rastreabilidade.md`;
  - criação de um documento vivo para os probes, atualização de
    `api/docs/sdd/endpoints/auth.md` e remoção de
    `api/docs/sdd/endpoints/root.md` na implementação;
  - revisão dos demais documentos de endpoint para apontarem ao contrato global de
    erro com `requestId` sem duplicar a regra.
- UI e rotas:
  - nenhuma mudança observável de rota ou tela;
  - handlers MSW passam a produzir `ApiError` completo e o header `x-request-id`
    em todas as respostas simuladas da API, inclusive erros e `204`, sem criar
    estado ou tratamento visual novo.
- Fluxos:
  - `docs/sdd/flows/login-google.md` passa a distinguir falha esperada de OAuth de
    falha técnica inesperada no callback.
- Contratos em `@dall-fit/types`:
  - `ApiError.details` deixa de ser opcional e `requestId: string` passa a ser
    obrigatório;
  - respostas de sucesso preservam seus contratos atuais e recebem correlação
    somente no header HTTP.
- Decisões arquiteturais:
  - não exige ADR; `AsyncLocalStorage`, filter global e Terminus são decisões
    locais e substituíveis dentro da arquitetura vigente da API.
- Handlers e fixtures MSW:
  - atualizar todos os erros simulados para respeitar o contrato e evitar fixtures
    incompletas.
- Mocks de repositories/caches nos unitários da API:
  - mocks do fluxo OAuth devem distinguir `OAuthCallbackError` de falhas técnicas;
  - mocks das fronteiras de MongoDB e Redis são usados nos unitários da readiness.
- Fixtures MongoDB/Redis nos E2E:
  - os processos efêmeros já vigentes validam readiness disponível e a
    indisponibilidade isolada de cada dependência;
  - nenhuma segunda instância ou tecnologia de infraestrutura é adicionada.

## Requisitos funcionais

1. Para cada request, o middleware deve aceitar o valor recebido em
   `x-request-id` somente quando houver exatamente uma ocorrência, com 1 a 128
   caracteres ASCII e aderente a
   `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. Valor ausente, repetido, combinado pelo
   parser HTTP, malformado ou acima do limite deve ser descartado e substituído
   por `crypto.randomUUID()`.
2. O identificador escolhido deve ser armazenado no contexto assíncrono e aplicado
   ao response antes de qualquer middleware capaz de encerrar a requisição,
   incluindo Helmet e CORS. Ele deve estar disponível nos guards, pipes,
   interceptors, controllers e filters e permanecer estável até o término da
   resposta.
3. Toda resposta HTTP, inclusive preflight `OPTIONS`, `204`, redirect, erro de
   CORS e erro da aplicação, deve expor o identificador no header
   `x-request-id`. O valor inválido enviado pelo consumidor nunca deve ser
   refletido. O CORS deve permitir o request header `X-Request-Id` e expor o
   response header `X-Request-Id` ao JavaScript da origem já autorizada, sem
   ampliar a allowlist vigente.
4. Todo log emitido por `Logger` durante um request deve receber `requestId` nos
   metadados estruturados sem obrigar controllers, commands, services e
   repositories a repetir manualmente o campo. A implementação global injetável
   deve preservar níveis, mensagem, argumentos opcionais, contexto e stack aceitos
   pelo `LoggerService`; logs de bootstrap são preservados por buffering e logs de
   tarefas sem request continuam válidos sem `requestId`.
5. O filter global deve produzir o formato abaixo em todo erro:

   ```json
   {
     "code": "RESOURCE_NOT_FOUND",
     "message": "Resource not found.",
     "details": {},
     "requestId": "8c0f3da5-4f80-4eb2-bf3d-92b512f0ec2e"
   }
   ```

6. Um `HttpException` cujo body interno já possua `code` e `message` como strings
   não vazias e `details` como objeto simples não nulo e não array deve manter
   esses campos e seu status HTTP. O filter acrescenta somente o `requestId` e não
   expõe outras propriedades do objeto original. Isso preserva, entre outros,
   `AUTHENTICATION_REQUIRED`, `ADMIN_ACCESS_REQUIRED`,
   `CSRF_VALIDATION_FAILED`, `RATE_LIMIT_EXCEEDED`,
   `AUTHENTICATION_UNAVAILABLE` e `RATE_LIMIT_UNAVAILABLE` introduzidos antes
   desta feature.
7. Um `404` não estruturado gerado pelo framework deve responder
   `RESOURCE_NOT_FOUND`, mensagem genérica e `details: {}`. Isso inclui qualquer
   método ou path sem rota, especialmente `GET /` após a remoção.
8. Uma indisponibilidade não estruturada com status `503` deve responder
   `SERVICE_UNAVAILABLE`; outro `HttpException` não estruturado deve preservar o
   status e usar `HTTP_ERROR`, mensagem genérica e `details: {}`.
9. Qualquer valor que não seja um `HttpException` conhecido deve responder `500`
   com `INTERNAL_SERVER_ERROR`, mensagem genérica, `details: {}` e `requestId`.
   Stack, nome de collection, URI, query, cookies, body e objeto da dependência não
   podem aparecer na resposta.
10. O ponto central deve registrar cada falha técnica inesperada uma única vez com
    nível `error`, `requestId`, método HTTP, path sanitizado, nome da exceção e
    stack somente no canal de log. Erros funcionais e indisponibilidades já
    traduzidas e registradas no ponto proprietário não devem ser duplicados pelo
    filter como erro técnico.
11. `CompleteGoogleLoginCommand` deve converter em redirect de falha somente
    `OAuthCallbackError`. Entram nessa categoria callback incompleto ou divergente,
    `error=access_denied`, código de autorização inválido/expirado e
    identidade/claims inválidas conhecidas. Outro valor de `callback.error` não é
    aceito genericamente como rejeição do usuário e deve seguir a classificação
    técnica segura definida para a integração.
12. Falha de rede, timeout, resposta `5xx` do Google, erro de MongoDB, erro ou
    timeout do Redis, falha ao assinar ou registrar a sessão, erro de programação
    ou qualquer exceção desconhecida não deve ser convertida em `oauth_failed`:
    ela sobe ao tratamento global e termina em `500 INTERNAL_SERVER_ERROR`.
    Nenhum novo registro ou cookie de sessão é entregue nesse caminho; os `503`
    estruturados vigentes continuam restritos às fronteiras que já traduzem
    indisponibilidade operacional fora desse callback.
13. `GoogleOAuthService` pode traduzir para `OAuthCallbackError` somente rejeições
    reconhecidas por allowlist: `invalid_grant` na troca do código, ausência de ID
    token e falha criptográfica ou semântica conhecida na validação da identidade.
    `invalid_client`, outra falha de configuração, rede, timeout, resposta `5xx`,
    payload inesperado de erro ou exceção desconhecida permanecem técnicos. Os
    testes devem fixar essa fronteira contra os tipos e formatos da versão
    instalada de `google-auth-library`, sem depender da rede real.
14. Os cookies `dall_fit_oauth_state`, `dall_fit_oauth_nonce` e
    `dall_fit_oauth_code_verifier` devem ser marcados para limpeza na fronteira HTTP
    específica de `GET /callback` depois do parser de cookies e antes de rate
    limit, pipes e command. Assim, sucesso, callback inválido, `429`, erro esperado
    e erro técnico propagado conservam os três `Set-Cookie` de expiração. No erro
    esperado ou técnico, o callback não cria nem substitui
    `dall_fit_session`/`__Host-dall_fit_session`; uma sessão que já existia antes
    de iniciar outro login não faz parte da limpeza dos cookies temporários.
15. `GET /health` deve ser público e responder `200` quando o processo Nest consegue
    atender requests. O endpoint não exige autenticação, CSRF ou rate limit e não
    consulta MongoDB, Redis, Google nem outra dependência.
16. `GET /ready` deve ser público e responder `200` somente quando a aplicação não
    está encerrando, um ping Mongoose ao MongoDB e um `PING` no client ioredis
    compartilhado concluem dentro de timeouts finitos. O payload de sucesso segue
    `HealthCheckResult` do Terminus e expõe somente os nomes lógicos `mongodb` e
    `redis` com estado `up`; o `requestId` permanece apenas no header de respostas
    de sucesso.
17. MongoDB ou Redis indisponível, timeout de qualquer ping ou encerramento em
    curso deve fazer `GET /ready` responder `503 SERVICE_UNAVAILABLE` pelo contrato
    global. A resposta não expõe host, URI, credencial, driver error, stack nem o
    payload detalhado de falha do Terminus. `GET /health` continua independente e
    disponível enquanto o servidor aceitar requests.
18. O indicador Redis deve reutilizar `RedisClientService` e sua única conexão
    ioredis, sem acessar o client diretamente fora do módulo proprietário, criar
    conexão por probe ou alterar as políticas de retry, offline queue, namespace e
    lifecycle estabelecidas pela FIT-0026.
19. A aplicação deve chamar `enableShutdownHooks()` antes de `listen()`, permitindo
    que `SIGTERM` e `SIGINT` acionem os hooks suportados pelo ambiente. Tanto esses
    sinais quanto `app.close()` devem aguardar a ordem de lifecycle do Nest 11, o
    fechamento assíncrono do client Redis e as demais dependências gerenciadas,
    preservando a integração vigente com o lifecycle da Vercel.
20. `GET /` deixa de existir. Nenhum guard de sessão, controller ou command deve ser
    executado nesse path; a resposta deve ser o `404 RESOURCE_NOT_FOUND` público do
    filter global.

## Requisitos não funcionais

- Acessibilidade: não se aplica — não há interface visual ou interação de usuário.
- Performance:
  - correlação adiciona somente geração/validação de uma string, acesso ao
    `AsyncLocalStorage` e enriquecimento do log;
  - liveness não executa I/O externo;
  - readiness executa somente um ping por dependência, usa timeouts finitos e não
    cria nova conexão por request.
- Segurança e privacidade:
  - request IDs aceitos externamente possuem tamanho e caracteres limitados;
  - nenhum erro devolve stack, payload, query, segredo, cookie, PII, URI ou detalhe
    de infraestrutura;
  - probes são públicos, mas expõem apenas estado agregado e nomes lógicos;
  - o logger preserva todas as regras de sanitização vigentes.
- Observabilidade:
  - o mesmo `requestId` aparece no header, no `ApiError` e em todos os logs do
    request;
  - falhas inesperadas possuem um único registro central pesquisável;
  - liveness e readiness são distintos para evitar reiniciar processo saudável por
    indisponibilidade transitória de MongoDB ou Redis.
- Disponibilidade:
  - readiness representa todas as dependências críticas do runtime vigente;
  - falha de MongoDB ou Redis retira a instância da readiness sem transformar a
    dependência em motivo para falha da liveness.

## Critérios de aceite

### Cenário 1 — Erro funcional preservado e correlacionado

- Forma de validar: cenário vivo de um endpoint autenticado e E2E da API.
- Given: um request possui um `x-request-id` válido e alcança um erro funcional já
  estruturado, como `AUTHENTICATION_REQUIRED`, ou uma indisponibilidade já
  traduzida, como `AUTHENTICATION_UNAVAILABLE`.
- When: o filter global processa a exceção.
- Then: status, `code`, `message` e `details` são preservados; body, header e logs
  usam exatamente o mesmo `requestId`.

### Cenário 2 — Path inexistente e rota raiz removida

- Forma de validar: cenário vivo do contrato global com seed `não se aplica` e
  cURL para `GET http://localhost:4000/`, além de E2E.
- Given: não existe controller para `/`.
- When: o consumidor chama `GET /` sem sessão.
- Then: recebe `404`, `RESOURCE_NOT_FOUND`, `details: {}` e `requestId`; nenhuma
  autenticação ou resposta `Hello World!` é executada.

### Cenário 3 — Erro técnico inesperado

- Forma de validar: unitário do filter e E2E por falha controlada de uma dependência
  já existente; não criar rota artificial.
- Given: uma dependência lança uma exceção desconhecida.
- When: a exceção alcança o tratamento global.
- Then: recebe `500 INTERNAL_SERVER_ERROR` correlacionado, sem detalhe técnico, e
  existe um único log central sanitizado com a stack.

### Cenário 4 — Request ID externo inválido

- Forma de validar: unitário do middleware e E2E da API, incluindo preflight CORS.
- Given: o request envia `x-request-id` vazio, repetido, longo demais ou com
  caracteres fora da política.
- When: a requisição entra na aplicação.
- Then: a API gera um UUID novo e usa somente esse valor no header, nos logs e no
  eventual `ApiError`; a origem autorizada consegue enviar e ler `X-Request-Id`
  sem alteração das demais regras de CORS.

### Cenário 5 — Falha OAuth esperada

- Forma de validar: cenário vivo do callback com state divergente, unitários do
  command/service e E2E já existente.
- Given: callback, código ou identidade é rejeitado por uma condição conhecida do
  protocolo.
- When: o callback é processado.
- Then: os três cookies temporários são limpos, nenhuma sessão nova é criada e o
  navegador recebe o redirect vigente para `/?authError=oauth_failed`.

### Cenário 6 — Falha técnica durante OAuth

- Forma de validar: unitários do command e da fronteira HTTP com falhas de Google,
  MongoDB, Redis, assinatura e registro da sessão; E2E quando a falha puder ser
  induzida sem serviço externo.
- Given: o callback passou pelas validações do protocolo, mas uma dependência falha
  tecnicamente.
- When: o command recebe uma exceção diferente de `OAuthCallbackError`.
- Then: a exceção chega ao filter, responde `500 INTERNAL_SERVER_ERROR`, limpa os
  três cookies temporários, não entrega sessão nova e não redireciona como falha
  comum de OAuth.

### Cenário 7 — Liveness independente

- Forma de validar: cenário vivo de `GET /health`, seed `não se aplica`, cURL e
  E2E.
- Given: a aplicação está aceitando requests, independentemente do estado de
  MongoDB e Redis.
- When: o probe chama `GET /health`.
- Then: recebe `200` com estado `ok` e correlação, sem acessar dependências.
- And: a correlação aparece no header, sem alterar o body de sucesso do probe.

### Cenário 8 — Readiness disponível

- Forma de validar: cenário vivo de `GET /ready`, MongoDB e Redis efêmeros e E2E.
- Given: a aplicação está ativa, a conexão Mongoose e o client ioredis
  compartilhado respondem aos pings.
- When: o probe chama `GET /ready`.
- Then: recebe `200`, estado `ok`, dependências lógicas `mongodb: up` e
  `redis: up`, além do `x-request-id` somente no header.

### Cenário 9 — Readiness indisponível por dependência crítica

- Forma de validar: E2E isolados que interrompem, um por vez, MongoDB e Redis
  efêmeros depois do bootstrap e chamam `GET /ready`.
- Given: o processo HTTP continua ativo, mas uma das duas dependências deixou de
  responder.
- When: o probe chama `GET /ready` em cada cenário.
- Then: recebe `503 SERVICE_UNAVAILABLE` correlacionado, enquanto `GET /health`
  continua respondendo `200`; nenhuma conexão alternativa é criada.

### Cenário 10 — Encerramento gracioso

- Forma de validar: teste da composição do bootstrap, teste do estado de shutdown
  do Terminus e E2E de lifecycle por `app.close()`; sinais usam teste de processo
  somente se permanecer determinístico no CI.
- Given: a aplicação terminou o bootstrap e possui recursos gerenciados pelo Nest.
- When: inicia encerramento suportado ou recebe `app.close()`.
- Then: uma readiness ainda aceita durante a janela de shutdown responde `503`, os
  hooks executam na ordem do Nest 11 e o fechamento assíncrono do Redis e das
  demais dependências termina antes de `app.close()` resolver.

## Estratégia de entrega e compatibilidade

- A entrega futura é atômica: request context, logger e filter entram juntos para
  que nenhum erro seja emitido sem correlação.
- A obrigatoriedade de `details` e `requestId` em `ApiError` altera o contrato
  estrutural; API, UI, MSW e testes são migrados no mesmo commit, sem período com
  produtor e consumidores divergentes.
- O header `x-request-id` é aditivo para respostas de sucesso e redirects; seus
  bodies permanecem inalterados. A configuração CORS acrescenta somente os nomes
  necessários às listas exatas de request e response headers.
- `/health` e `/ready` são aditivos e não reutilizam `/`. A remoção de `GET /` é
  intencionalmente incompatível, porém não existe consumidor funcional documentado;
  qualquer chamada passa a receber o `404` padronizado.
- A revisão confirmou `@nestjs/common` e `@nestjs/core` 11.1.28,
  `@nestjs/mongoose` 11.0.4, Mongoose 9.8.0 e ioredis 5.11.1 no workspace. A versão
  oficial vigente de `@nestjs/terminus` consultada foi 11.1.1, cujos peers aceitam
  NestJS 11 e `@nestjs/mongoose` 11; a implementação deve instalar e travar a
  versão compatível, validar seus tipos locais e usar `HealthIndicatorService`
  para o indicador Redis próprio, sem adicionar `@nestjs/axios`.
- A readiness inclui Redis desde a primeira entrega porque a FIT-0026 já o tornou
  dependência crítica de autenticação, CSRF e rate limiting. O indicador reutiliza
  o provider existente e não cria uma segunda política de conexão.
- Os SDDs vivos são atualizados junto da implementação, não nesta fase de
  especificação.

## Plano de testes

- unitários do middleware para aceitação, rejeição e geração de request IDs;
- unitários do contexto/logger para isolamento entre requests concorrentes,
  enriquecimento estruturado, preservação da assinatura do `LoggerService`,
  buffering do bootstrap e ausência segura fora de request;
- unitários do filter para erro funcional, `404`, `503`, outro `HttpException`,
  exceção desconhecida, sanitização e ausência de log técnico duplicado;
- unitários do OAuth para `invalid_grant`, identidade inválida e para propagação de
  `invalid_client`, rede, timeout, `5xx`, MongoDB, Redis, assinatura/registro de
  sessão e exceção desconhecida;
- unitários da fronteira HTTP do callback para limpeza de cookies em sucesso,
  validação rejeitada, rate limit, falha esperada e falha técnica, sempre incluindo
  state, nonce e verifier;
- unitários do módulo de health para liveness sem indicadores, readiness com pings
  Mongoose/Redis disponíveis, indisponíveis e em timeout, reutilização do client e
  estado de shutdown;
- E2E serial para contrato de erro e correlação, `GET /` removido, `/health`,
  `/ready`, MongoDB e Redis interrompidos isoladamente e fechamento da aplicação;
- E2E de CORS para aceitação/exposição de `X-Request-Id` sem regressão de Origin,
  credenciais, métodos, CSRF e headers já permitidos;
- atualizar E2E existentes cujos asserts de erro passam a exigir `requestId` e
  `x-request-id`;
- atualizar handlers/fixtures MSW e seus testes para o novo `ApiError` e para o
  header em respostas de sucesso, erro e `204`;
- executar `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`, `pnpm build` e
  `pnpm -C api test:e2e` na fase de implementação; executar também
  `pnpm test:integration` porque a fronteira MSW compartilhada será alterada.

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

## Riscos e decisões

- Request IDs fornecidos por clientes facilitam correlação entre sistemas, mas
  podem permitir injeção ou cardinalidade excessiva; a validação limita tamanho,
  caracteres e multiplicidade antes de reutilizá-los. O identificador continua
  sendo dado não confiável e nunca participa de autenticação, autorização, CSRF,
  rate limit ou escolha de namespace.
- `AsyncLocalStorage` evita tornar toda a árvore request-scoped e dispensa uma
  dependência adicional, mas exige teste de isolamento assíncrono e montagem do
  middleware antes do restante do pipeline.
- O logger global deve acrescentar metadata sem alterar o prefixo textual
  `NomeDaClasse -> nomeDoMetodo -> etapa:` já adotado pelo projeto nem reinterpretar
  contexto, stack ou argumentos opcionais. O bootstrap precisa bufferizar logs até
  aplicar a instância injetada para não perder falhas de inicialização.
- Preservar somente corpos funcionais explicitamente estruturados impede que
  mensagens internas padrão do framework ou de bibliotecas virem contrato público.
- O callback técnico deixa de redirecionar para a UI e passa a devolver erro HTTP
  genérico. Essa diferença é intencional: evita classificar indisponibilidade ou
  defeito como rejeição recuperável do usuário.
- Readiness depende de MongoDB e Redis porque ambos estão conectados e são críticos
  no runtime vigente. Isso pode retirar a instância do tráfego por uma falha Redis
  mesmo quando rotas puramente públicas ainda responderiam, mas é coerente com a
  falha fechada de autenticação e rate limiting decidida na FIT-0026. Google não é
  probeado para evitar indisponibilidade em cascata e chamadas externas sem
  finalidade funcional.
- Terminus padroniza lifecycle e indicadores. Seu `HealthCheckResult` é preservado
  somente no sucesso; o payload detalhado de falha não pode escapar do `ApiError`,
  e o filter continua sendo a fronteira pública final.
- Shutdown hooks por sinais dependem do suporte do ambiente. A integração Vercel
  já existente continua responsável pelo lifecycle serverless; a feature não
  promete que a plataforma entregará `SIGTERM` nem cria atraso artificial.
- A rota raiz não recebe compatibilidade temporária por decisão explícita desta
  feature.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Readiness cobre MongoDB e o client Redis singleton sem conexão paralela
- CORS permite e expõe somente `X-Request-Id` além dos headers exatos vigentes
- Quality gates da raiz aprovados
