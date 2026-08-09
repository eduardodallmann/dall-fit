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
  contrato. O callback OAuth converte indiscriminadamente falhas técnicas em erro
  comum do protocolo, e a aplicação não oferece correlação de requests, probes
  operacionais nem ativação explícita dos hooks de encerramento. A rota protegida
  `GET /` devolve apenas `Hello World!` e não possui finalidade operacional.
- Resultado: toda resposta de erro HTTP usa um contrato estável e inclui o mesmo
  identificador correlacionado aos logs da requisição; erros esperados do OAuth
  continuam recuperáveis sem esconder falhas técnicas; a aplicação possui
  liveness, readiness do MongoDB e encerramento gracioso; a rota raiz de exemplo é
  removida e passa naturalmente a responder o `404` global normalizado.
- Referências:
  - `packages/types/src/contracts.ts`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/base/02-endpoints-e-contratos.md`;
  - `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
  - `api/docs/sdd/endpoints/auth.md`;
  - `api/docs/sdd/endpoints/root.md`;
  - [NestJS — Exception filters](https://docs.nestjs.com/exception-filters);
  - [NestJS — Async Local Storage](https://docs.nestjs.com/recipes/async-local-storage);
  - [NestJS — Lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events);
  - [NestJS — Health checks](https://docs.nestjs.com/recipes/terminus).
- Features relacionadas:
  - `FIT-0001` — introduziu o fluxo OAuth, o contrato de erros funcionais e a rota
    raiz protegida;
  - `FIT-0004` — introduziu outro erro HTTP funcional estável e reforçou a
    necessidade de preservá-lo no tratamento transversal.

## Escopo

### Incluído

- contexto por request baseado no `AsyncLocalStorage` nativo do Node.js;
- geração ou propagação segura de `x-request-id` em toda requisição HTTP;
- inclusão do identificador no header de toda resposta, nos logs executados no
  contexto da requisição e no corpo de todo `ApiError`;
- logger global compatível com o `Logger` do NestJS, preservando mensagens e
  contextos vigentes e acrescentando o identificador aos metadados estruturados;
- exception filter global injetável, registrado por `APP_FILTER`, que captura
  erros HTTP e exceções desconhecidas;
- preservação de status, `code`, `message` e `details` dos erros funcionais já
  estruturados pela aplicação;
- normalização do `404` do framework, de indisponibilidades operacionais e do
  `500` inesperado em `ApiError`, sem expor detalhes internos;
- extensão de `ApiError` com `requestId: string` obrigatório e migração atômica dos
  produtores, testes, handlers e fixtures que constroem esse contrato;
- restrição do tratamento recuperável do callback OAuth aos erros esperados do
  protocolo e da identidade, permitindo que falhas técnicas alcancem o filter
  global;
- limpeza dos cookies temporários do OAuth em qualquer término do callback, sem
  criar cookie de sessão quando o fluxo falhar;
- ativação de `enableShutdownHooks()` antes de a aplicação começar a escutar;
- adição de `@nestjs/terminus` compatível com a versão instalada do NestJS;
- `GET /health` público como probe de liveness, sem consultar dependências;
- `GET /ready` público como probe de readiness, com ping real à conexão Mongoose;
- readiness indisponível durante encerramento ou quando o MongoDB não responder;
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
- health check de Redis enquanto nenhum client Redis participa do wiring da
  aplicação;
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
  - `api/src/main.ts`, `api/src/configure-application.ts` e composição do módulo
    raiz;
  - módulo operacional próprio para `GET /health` e `GET /ready`;
  - remoção de `AppController`, `GetRootCommand` e artefatos exclusivos de
    `GET /`;
  - refinamento do limite de captura em `CompleteGoogleLoginCommand` e
    `GoogleOAuthService`;
  - atualização de `api/docs/sdd/base/01-arquitetura.md`,
    `02-endpoints-e-contratos.md` e `06-logging-e-rastreabilidade.md`;
  - criação de um documento vivo para os probes, atualização de
    `api/docs/sdd/endpoints/auth.md` e remoção de
    `api/docs/sdd/endpoints/root.md` na implementação;
  - revisão dos demais documentos de endpoint para apontarem ao contrato global de
    erro com `requestId` sem duplicar a regra.
- UI e rotas:
  - nenhuma mudança observável de rota ou tela;
  - handlers MSW que simulam erros passam a produzir `ApiError` completo e o
    header `x-request-id` quando o cenário o exigir.
- Fluxos:
  - `docs/sdd/flows/login-google.md` passa a distinguir falha esperada de OAuth de
    falha técnica inesperada no callback.
- Contratos em `@dall-fit/types`:
  - `ApiError` recebe `requestId: string` obrigatório;
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
  - mocks de MongoDB são usados nos unitários do readiness; Redis não participa.
- Fixtures MongoDB/Redis nos E2E:
  - MongoDB efêmero valida readiness disponível e indisponível;
  - nenhuma fixture ou inicialização Redis nova.

## Requisitos funcionais

1. Para cada request, o middleware deve aceitar o valor recebido em
   `x-request-id` somente quando for uma string não vazia, de no máximo 128
   caracteres e composta por caracteres seguros para correlação. Valor ausente,
   repetido, malformado ou acima do limite deve ser descartado e substituído por
   `crypto.randomUUID()`.
2. O identificador escolhido deve ser armazenado no contexto assíncrono antes dos
   guards, pipes, interceptors, controllers e filters, e deve permanecer estável
   até o término da resposta.
3. Toda resposta HTTP, inclusive `204`, redirect e erro, deve expor o identificador
   no header `x-request-id`. O valor inválido enviado pelo consumidor nunca deve
   ser refletido.
4. Todo log emitido por `Logger` durante um request deve receber `requestId` nos
   metadados estruturados sem obrigar controllers, commands, services e
   repositories a repetir manualmente o campo. Logs de bootstrap ou tarefas sem
   request continuam válidos sem esse campo.
5. O filter global deve produzir o formato abaixo em todo erro:

   ```json
   {
     "code": "RESOURCE_NOT_FOUND",
     "message": "Resource not found.",
     "details": {},
     "requestId": "8c0f3da5-4f80-4eb2-bf3d-92b512f0ec2e"
   }
   ```

6. Um `HttpException` cujo body interno já possua `code`, `message` e `details`
   válidos deve manter esses campos e seu status HTTP. O filter acrescenta somente
   o `requestId` e não expõe outras propriedades do objeto original.
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
    nível `error`, `requestId`, método HTTP, path sanitizado, nome da exceção e stack
    somente no canal de log. Erros funcionais já registrados antes do `throw` não
    devem ser duplicados como erro técnico.
11. `CompleteGoogleLoginCommand` deve converter em redirect de falha somente
    `OAuthCallbackError`. Entram nessa categoria callback incompleto ou divergente,
    autorização negada, código de autorização inválido/expirado e identidade/claims
    inválidas conhecidas.
12. Falha de rede, timeout, resposta `5xx` do Google, erro de MongoDB, falha ao
    assinar a sessão, erro de programação ou qualquer exceção desconhecida não deve
    ser convertida em `oauth_failed`: ela sobe ao tratamento global e termina em
    `500 INTERNAL_SERVER_ERROR` sem sessão.
13. `GoogleOAuthService` pode traduzir para `OAuthCallbackError` somente rejeições
    reconhecidas do protocolo; erros de configuração, infraestrutura ou resposta
    inesperada permanecem técnicos. Os testes devem fixar essa fronteira sem
    depender da rede real.
14. Os cookies `dall_fit_oauth_state` e `dall_fit_oauth_nonce` devem ser limpos no
    sucesso, no erro esperado e no erro técnico. O cookie `dall_fit_session` existe
    somente após conclusão integral do caminho feliz.
15. `GET /health` deve ser público e responder `200` quando o processo Nest consegue
    atender requests. Ele não consulta MongoDB, Redis, Google nem outra dependência.
16. `GET /ready` deve ser público e responder `200` somente quando a aplicação não
    está encerrando e um ping Mongoose ao MongoDB conclui dentro do timeout definido
    pelo módulo de health. O payload de sucesso pode seguir `HealthCheckResult` do
    Terminus e expor somente o nome lógico `mongodb` e o estado.
17. MongoDB indisponível, timeout ou encerramento em curso deve fazer `GET /ready`
    responder `503 SERVICE_UNAVAILABLE` pelo contrato global. A resposta não expõe
    host, URI, credencial, driver error ou stack.
18. Redis não participa da readiness enquanto continuar ausente do wiring. Quando
    um fluxo futuro adicionar seu client em runtime, a mesma entrega deverá ampliar
    o probe e sua documentação.
19. A aplicação deve chamar `enableShutdownHooks()` antes de `listen()`, permitindo
    que `SIGTERM`, `SIGINT` e `app.close()` acionem os hooks suportados pelo ambiente
    e aguardem o fechamento assíncrono das dependências gerenciadas pelo Nest.
20. `GET /` deixa de existir. Nenhum guard de sessão, controller ou command deve ser
    executado nesse path; a resposta deve ser o `404 RESOURCE_NOT_FOUND` público do
    filter global.

## Requisitos não funcionais

- Acessibilidade: não se aplica — não há interface visual ou interação de usuário.
- Performance:
  - correlação adiciona somente geração/validação de uma string, acesso ao
    `AsyncLocalStorage` e enriquecimento do log;
  - liveness não executa I/O externo;
  - readiness usa timeout finito e não cria nova conexão por request.
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
    indisponibilidade transitória do banco.

## Critérios de aceite

### Cenário 1 — Erro funcional preservado e correlacionado

- Forma de validar: cenário vivo de um endpoint autenticado e E2E da API.
- Given: um request possui um `x-request-id` válido e alcança um erro funcional já
  estruturado, como `AUTHENTICATION_REQUIRED`.
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

- Forma de validar: unitário do middleware e E2E da API.
- Given: o request envia `x-request-id` vazio, repetido, longo demais ou com
  caracteres fora da política.
- When: a requisição entra na aplicação.
- Then: a API gera um UUID novo e usa somente esse valor no header, nos logs e no
  eventual `ApiError`.

### Cenário 5 — Falha OAuth esperada

- Forma de validar: cenário vivo do callback com state divergente, unitários do
  command/service e E2E já existente.
- Given: callback, código ou identidade é rejeitado por uma condição conhecida do
  protocolo.
- When: o callback é processado.
- Then: cookies temporários são limpos, não há sessão e o navegador recebe o
  redirect vigente para `/?authError=oauth_failed`.

### Cenário 6 — Falha técnica durante OAuth

- Forma de validar: unitários do command/controller com falhas de Google, MongoDB e
  assinatura da sessão; E2E quando a falha puder ser induzida sem serviço externo.
- Given: o callback passou pelas validações do protocolo, mas uma dependência falha
  tecnicamente.
- When: o command recebe uma exceção diferente de `OAuthCallbackError`.
- Then: a exceção chega ao filter, responde `500 INTERNAL_SERVER_ERROR`, limpa os
  cookies temporários, não cria sessão e não redireciona como falha comum de OAuth.

### Cenário 7 — Liveness independente

- Forma de validar: cenário vivo de `GET /health`, seed `não se aplica`, cURL e
  E2E.
- Given: a aplicação está aceitando requests, independentemente do estado do
  MongoDB.
- When: o probe chama `GET /health`.
- Then: recebe `200` com estado `ok` e correlação, sem acessar dependências.

### Cenário 8 — Readiness disponível

- Forma de validar: cenário vivo de `GET /ready`, MongoDB efêmero e E2E.
- Given: a aplicação está ativa e a conexão Mongoose responde ao ping.
- When: o probe chama `GET /ready`.
- Then: recebe `200`, estado `ok` e dependência lógica `mongodb: up`.

### Cenário 9 — Readiness indisponível

- Forma de validar: E2E que interrompe o MongoDB efêmero depois do bootstrap e
  chama o cenário vivo de `GET /ready`.
- Given: o processo HTTP continua ativo, mas o MongoDB deixou de responder.
- When: o probe chama `GET /ready`.
- Then: recebe `503 SERVICE_UNAVAILABLE` correlacionado, enquanto `GET /health`
  continua respondendo `200`.

### Cenário 10 — Encerramento gracioso

- Forma de validar: teste da composição do bootstrap e E2E de lifecycle por
  `app.close()`; o comportamento de sinais é coberto pela API oficial do NestJS e
  por teste de processo somente se permanecer determinístico no CI.
- Given: a aplicação terminou o bootstrap e possui recursos gerenciados pelo Nest.
- When: recebe encerramento suportado ou `app.close()`.
- Then: executa os hooks na ordem do Nest, deixa de ficar ready e aguarda o teardown
  assíncrono antes de concluir.

## Estratégia de entrega e compatibilidade

- A entrega futura é atômica: request context, logger e filter entram juntos para
  que nenhum erro seja emitido sem correlação.
- A inclusão obrigatória de `requestId` em `ApiError` altera o contrato estrutural;
  API, UI, MSW e testes são migrados no mesmo commit, sem período com produtor e
  consumidores divergentes.
- O header `x-request-id` é aditivo para respostas de sucesso e redirects; seus
  bodies permanecem inalterados.
- `/health` e `/ready` são aditivos e não reutilizam `/`. A remoção de `GET /` é
  intencionalmente incompatível, porém não existe consumidor funcional documentado;
  qualquer chamada passa a receber o `404` padronizado.
- A implementação adiciona Terminus somente após confirmar a versão compatível com
  NestJS 11 no lockfile e nos tipos instalados.
- Os SDDs vivos são atualizados junto da implementação, não nesta fase de
  especificação.

## Plano de testes

- unitários do middleware para aceitação, rejeição e geração de request IDs;
- unitários do contexto/logger para isolamento entre requests concorrentes,
  enriquecimento estruturado e ausência segura fora de request;
- unitários do filter para erro funcional, `404`, `503`, outro `HttpException`,
  exceção desconhecida, sanitização e ausência de log técnico duplicado;
- unitários do OAuth para cada erro esperado e para propagação de rede, `5xx`,
  MongoDB, assinatura de sessão e exceção desconhecida;
- unitários do controller de callback para limpeza de cookies em sucesso, falha
  esperada e falha técnica;
- unitários do módulo de health para liveness sem indicadores e readiness com ping
  Mongoose disponível, indisponível e em timeout;
- E2E serial para contrato de erro e correlação, `GET /` removido, `/health`,
  `/ready`, MongoDB interrompido e fechamento da aplicação;
- atualizar E2E existentes cujos asserts de erro passam a exigir `requestId` e
  `x-request-id`;
- atualizar handlers/fixtures MSW e seus testes para o novo `ApiError`;
- executar `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`, `pnpm build` e
  `pnpm -C api test:e2e` na fase de implementação.

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

## Riscos e decisões

- Request IDs fornecidos por clientes facilitam correlação entre sistemas, mas
  podem permitir injeção ou cardinalidade excessiva; a validação limita tamanho,
  caracteres e multiplicidade antes de reutilizá-los.
- `AsyncLocalStorage` evita tornar toda a árvore request-scoped e dispensa uma
  dependência adicional, mas exige teste de isolamento assíncrono e montagem do
  middleware antes do restante do pipeline.
- O logger global deve acrescentar metadata sem alterar o prefixo textual
  `NomeDaClasse -> nomeDoMetodo -> etapa:` já adotado pelo projeto.
- Preservar somente corpos funcionais explicitamente estruturados impede que
  mensagens internas padrão do framework ou de bibliotecas virem contrato público.
- O callback técnico deixa de redirecionar para a UI e passa a devolver erro HTTP
  genérico. Essa diferença é intencional: evita classificar indisponibilidade ou
  defeito como rejeição recuperável do usuário.
- Readiness depende apenas do MongoDB porque ele é a única infraestrutura conectada
  ao runtime vigente. Redis será incluído quando possuir client real; Google não é
  probeado para evitar indisponibilidade em cascata e chamadas externas sem
  finalidade funcional.
- Terminus padroniza lifecycle e indicadores, mas sua resposta de falha não pode
  escapar do `ApiError`; o filter continua sendo a fronteira pública final.
- A rota raiz não recebe compatibilidade temporária por decisão explícita desta
  feature.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Quality gates da raiz aprovados
