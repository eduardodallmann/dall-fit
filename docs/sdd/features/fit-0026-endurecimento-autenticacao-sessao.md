# Feature Spec: Endurecimento de autenticação, cookies e ciclo de vida da sessão

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0026` —
  [issue #26](https://github.com/eduardodallmann/dall-fit/issues/26).
- Problema: a autenticação Google já protege identidade e cookies com `state`,
  `nonce`, escopos mínimos, validação do ID token e `HttpOnly`, porém a fronteira
  publicada ainda possui riscos relevantes: a sessão cross-site usa
  `SameSite=None` sem defesa CSRF explícita, o bypass pode ser habilitado fora de
  uma execução local por configuração insegura, endpoints sensíveis não possuem
  rate limiting distribuído e o JWT não pode ser revogado individualmente antes de
  expirar. Também faltam logout, validação de `issuer` e `audience`, PKCE S256,
  headers de segurança coordenados e atualização segura do perfil controlado pelo
  Google. A base atual já compila sob TypeScript estrito, mantém fronteiras Nest
  mínimas, bloqueia zoom por viewport e usa Vercel Analytics v2 globalmente; o
  endurecimento precisa preservar essas entregas posteriores e adaptar os eventos
  de login/logout sem ampliar a coleta.
- Resultado: manter temporariamente UI e API em sites `vercel.app` distintos e a
  sessão `SameSite=None`, mas compensar essa necessidade com token CSRF vinculado à
  sessão, validação estrita de origem, CORS mínimo, sessões registradas no Redis,
  logout revogável, rate limiting distribuído e endurecimento completo dos fluxos
  Google e de teste. A UI deve oferecer logout e continuar sem acesso JavaScript ao
  cookie da sessão, mantendo Analytics, PWA, viewport, privacidade, tipagem estrita
  e encapsulamento atuais.
- Referências:
  - [NestJS — CSRF protection](https://docs.nestjs.com/security/csrf);
  - [NestJS — Helmet](https://docs.nestjs.com/security/helmet);
  - [NestJS — Rate limiting](https://docs.nestjs.com/security/rate-limiting);
  - [Redis Cloud — integração com a Vercel](https://redis.io/docs/latest/operate/rc/cloud-integrations/vercel/);
  - [Redis Cloud — planos Essentials](https://redis.io/docs/latest/operate/rc/subscriptions/view-essentials-subscription/essentials-plan-details/);
  - [Redis Cloud — políticas de eviction](https://redis.io/docs/latest/operate/rc/databases/configuration/data-eviction-policies/);
  - [Redis — conexão do ioredis e TLS](https://redis.io/docs/latest/develop/clients/ioredis/connect/);
  - [Vercel Functions — ciclo de vida de conexões](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package);
  - [Vercel Analytics — configuração do pacote](https://vercel.com/docs/analytics/package);
  - [Vercel Analytics — privacidade e compliance](https://vercel.com/docs/analytics/privacy-policy);
  - [HeroUI — Button](https://heroui.com/en/docs/react/components/button);
  - [OWASP — CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html);
  - [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html);
  - [Google — OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect);
  - [RFC 7636 — Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636);
  - [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html).
- Features relacionadas:
  - `fit-0001-login-google.md`, origem do fluxo de identidade e da sessão atual;
  - `fit-0004-autorizacao-administrativa.md`, origem das mutações administrativas
    que receberão rate limiting e CSRF;
  - `fit-0005-gestao-planos-treino-globais.md`, operações administrativas
    sensíveis atualmente publicadas;
  - `fit-0019-tema-claro-escuro.md`, mutação autenticada da própria pessoa;
  - `fit-0031-typescript-estrito-fronteiras-publicas.md`, que tornou obrigatórios
    TypeScript estrito e exports mínimos dos módulos Nest antes desta implementação;
  - `fit-0033-bloqueio-zoom-pinca.md`, cuja política global de viewport deve ser
    preservada pelas mudanças de headers e bootstrap;
  - `fit-0035-adicionar-analytics.md`, que introduziu uma única montagem global do
    Vercel Analytics, uma fronteira tipada de eventos e regras de privacidade que
    também passam a reger login, logout e CSP desta entrega.

## Escopo

### Incluído

- manter o cookie de sessão de produção com `SameSite=None` e `Secure` enquanto UI
  e API permanecerem em sites `vercel.app` distintos;
- separar a decisão `Secure` da decisão `SameSite` e aplicar a política mínima
  necessária a cada cookie, inclusive criação e limpeza;
- iniciar o login por navegação top-level para `GET /auth/google`, permitindo que
  cookies temporários de OAuth usem `SameSite=Lax` mesmo no deploy HTTPS;
- adicionar PKCE S256 com `code_verifier` temporário protegido junto de `state` e
  `nonce`;
- criar uma defesa CSRF synchronizer-token vinculada à sessão no Redis e exigida
  em toda operação autenticada que possa alterar estado;
- validar a origem exata das mutações autenticadas e restringir CORS a origens,
  métodos e headers explicitamente configurados;
- substituir a confiança exclusivamente stateless do JWT por JWT curto associado
  a um registro de sessão revogável no Redis;
- validar algoritmo, assinatura, expiração, `issuer`, `audience`, `subject`,
  identificador de sessão e chave ativa do JWT;
- disponibilizar logout da sessão atual, com revogação server-side e limpeza
  idempotente do cookie;
- introduzir estratégia de rotação de chave de sessão com chave ativa e janela
  limitada para a chave anterior;
- aplicar rate limiting distribuído aos endpoints de autenticação, sessão,
  mutações autenticadas e mutações administrativas;
- integrar o Redis Cloud por `REDIS_URL`, com TLS obrigatório fora de local/teste,
  client reutilizável por runtime e ciclo de vida compatível com a execução
  serverless da Vercel;
- isolar chaves de sessão, CSRF e rate limiting por ambiente e operar dentro dos
  limites contratados de conexões, operações e memória, sem eviction silenciosa;
- definir falha rápida, reconexão limitada, observabilidade e comportamento seguro
  tanto para indisponibilidade quanto para reinicialização do dataset Redis;
- impedir que o bypass seja registrado fora de execução local/teste explicitamente
  habilitada e remover chaves conhecidas e ativações automáticas;
- aplicar headers de segurança na API e na UI, respeitando a comunicação cross-site,
  o redirecionamento Google, imagens de perfil, o PWA e o Vercel Analytics já
  instalado;
- preservar a única montagem global e a fronteira tipada de Analytics, adaptando
  somente os eventos afetados pela navegação direta de login e pela nova ação de
  logout, sem conteúdo sensível;
- preservar TypeScript estrito, a API pública mínima dos módulos Nest e a política
  global de viewport vigentes;
- atualizar nome, e-mail verificado e foto controlados pelo Google em logins
  posteriores, preservando identidade técnica, configurações e privilégios;
- cobrir API, UI, Redis, MongoDB, CORS, cookies, CSRF, rate limiting e headers com
  testes compatíveis com as fronteiras reais;
- atualizar os SDDs vivos e registrar a nova decisão arquitetural somente na fase
  de implementação autorizada.

### Não incluído

- domínio próprio, reverse proxy, gateway ou BFF same-origin;
- abandonar `SameSite=None` enquanto o deploy continuar cross-site;
- contornar bloqueio de cookies de terceiros com token no `localStorage`,
  `sessionStorage` ou JavaScript;
- tela para listar dispositivos, revogar outra sessão ou encerrar todas as sessões;
- autenticação machine-to-machine para cronjobs ou futuros backends;
- encaminhar o cookie ou o JWT de navegador para outros serviços;
- refresh token Google, acesso a APIs Google adicionais, novos provedores,
  passkeys ou autenticação por senha;
- alteração de papéis ou privilégios durante o login;
- mudança funcional nas regras de planos de treino ou de tema além das proteções
  transversais desta demanda;
- substituir Vercel Analytics, criar segundo client/event bus, ampliar seu catálogo
  além das interações afetadas ou adicionar consentimento/opt-out nesta demanda;
- alterar o bloqueio declarativo de zoom, layout, breakpoints ou comportamento de
  PWA já vigentes;
- relaxar `strict`, lint type-aware ou encapsulamento de repositories, adapters e
  models para acomodar a implementação;
- endpoint de coleta de relatórios CSP.

## Projetos e documentação afetados

- API e endpoints:
  - configuração validada de `REDIS_URL`, namespace e limites operacionais;
  - provider singleton do client `ioredis`, seu lifecycle e adapters consumidores;
  - `GET /auth/google` e `GET /callback`;
  - remoção de `POST /auth/google` depois da migração da UI para navegação direta;
  - novo `GET /auth/csrf`;
  - novo `POST /auth/logout`;
  - `POST /auth/test-login` somente local/teste;
  - `GET /auth/me` e `PATCH /auth/me/configs`;
  - todas as mutações administrativas de planos globais;
  - `api/docs/sdd/endpoints/auth.md`, documentação de pessoa atual e documentos
    proprietários das mutações administrativas.
- UI e rotas:
  - `/`, que passa a navegar diretamente para o início OAuth;
  - layout autenticado e `/dash`, que inicializam a proteção CSRF;
  - menu persistente e móvel, que passam a oferecer a ação `Sair`;
  - rotas administrativas de lista, detalhe e workout, cujas mutations passam a
    depender do bootstrap CSRF;
  - cliente Axios único, queries, mutations e tratamento de sessão expirada;
  - `App`, `src/core/analytics/index.ts` e os testes da fronteira, preservando uma
    única montagem do componente oficial e atualizando o catálogo tipado apenas
    para login e logout;
  - `ui/docs/sdd/base/01-arquitetura.md`,
    `ui/docs/sdd/base/04-testes-e-qualidade.md`, `ui/docs/sdd/routes/root.md`,
    `dash.md` e os documentos das três rotas administrativas afetadas.
- Fluxos:
  - atualizar `docs/sdd/flows/login-google.md`;
  - atualizar `docs/sdd/flows/gestao-planos-treino-globais.md` para incluir a
    obtenção do CSRF e a proteção transversal das mutations sem alterar suas regras
    de domínio;
  - criar ou atualizar o fluxo vivo de logout conforme a organização vigente na
    implementação.
- Contratos em `@dall-fit/types`:
  - adicionar o contrato de resposta de `GET /auth/csrf`;
  - remover `StartGoogleLoginResponse` caso nenhum consumidor permaneça após a
    remoção de `POST /auth/google`;
  - preservar o contrato público de `Person` e os erros estruturados existentes;
  - documentar `429 TOO_MANY_REQUESTS` e `403 CSRF_VALIDATION_FAILED` no nível
    proprietário, compartilhando tipos somente se houver consumidor tipado real.
- Decisões arquiteturais:
  - criar um ADR para sessão revogável, Redis e defesa CSRF no deploy cross-site;
  - atualizar ou substituir explicitamente as partes superadas de
    `ADR-0002-autenticacao-google-e-sessao.md`.
- Handlers e fixtures MSW:
  - token CSRF, logout, sessão revogada/expirada, falha CSRF, rate limiting e início
    OAuth por navegação;
  - no Playwright, o início fictício usa `GET` por navegação top-level na mesma
    origem controlada pelo Vite/MSW e redireciona para `/dash`, sem ressuscitar o
    contrato JSON removido;
  - Analytics continua isolado por mock de módulo nos testes próprios e não recebe
    handler MSW, pois não pertence à API do Dall Fit;
  - nenhum token, cookie ou segredo real nas fixtures.
- Mocks de repositories/caches nos unitários da API:
  - port de registro de sessão/CSRF e storage distribuído de rate limit;
  - repository de `Person` para atualização atômica de campos do provedor.
- Fixtures MongoDB/Redis nos E2E:
  - pessoas comuns e administradoras no MongoDB;
  - sessões ativas, revogadas e expiradas, token CSRF e contadores de rate limit no
    Redis efêmero, sempre isolados entre cenários.

## Requisitos funcionais

1. Em produção, a sessão continua em cookie `HttpOnly`, `Secure`, host-only,
   `Path=/` e `SameSite=None`, pois a UI e a API estão em sites `vercel.app`
   distintos. O cookie não declara `Domain` nem fica acessível ao JavaScript.
2. O cookie de produção deve usar prefixo `__Host-`. O ambiente HTTP local usa um
   nome não prefixado, `SameSite=Lax` e `Secure=false`. Criação e limpeza usam o
   mesmo nome, path, `SameSite` e `Secure`; a migração também limpa o nome legado.
3. `Secure` e `SameSite` deixam de ser derivados um do outro. A configuração
   valida combinações seguras e rejeita produção cross-site sem
   `SameSite=None + Secure`.
4. A UI inicia o login por navegação top-level para `GET /auth/google`. O endpoint
   público `POST /auth/google` e seu contrato JSON são removidos após a migração,
   evitando iniciar OAuth por uma request cross-site de subrecurso.
5. `state`, `nonce` e o novo `code_verifier` usam valores criptograficamente
   aleatórios, cookies temporários `HttpOnly`, host-only, `Secure` em produção,
   `SameSite=Lax`, `Path=/` e expiração máxima de dez minutos. Todos são apagados
   no callback feliz ou inválido.
6. O início OAuth deriva `code_challenge` por SHA-256 e Base64 URL-safe e envia
   `code_challenge_method=S256`. O callback somente troca o código quando recebe o
   `code_verifier` correspondente; ausência ou divergência encerra o fluxo sem
   sessão.
7. Ao concluir um login, a API cria um identificador de sessão aleatório, registra
   no Redis a sessão ativa com pessoa, expiração e material CSRF e emite JWT com
   `sub`, `jti`, `iss`, `aud`, `iat` e `exp`. O Redis não armazena o token bruto.
8. O guard valida algoritmo allowlisted, assinatura, chave identificada por `kid`,
   expiração, `issuer`, `audience`, `subject` e `jti`; depois exige que a sessão
   correspondente ainda esteja ativa no Redis e que a pessoa exista no MongoDB.
9. A validade absoluta permanece configurável, com padrão máximo de sete dias e
   sem extensão silenciosa nesta feature. O TTL do Redis nunca ultrapassa o `exp`
   do JWT.
10. A rotação assina novos JWTs somente com a chave ativa. Uma chave anterior pode
    permanecer exclusivamente para verificação durante no máximo a validade
    absoluta vigente; removê-la invalida os JWTs restantes dessa geração. Chaves
    desconhecidas e tokens sem `kid` são recusados.
11. `GET /auth/csrf` exige sessão ativa e devolve em JSON o token CSRF vinculado
    exclusivamente àquela sessão. A UI o mantém apenas em memória e o envia em
    `X-CSRF-Token` nas operações autenticadas `POST`, `PUT`, `PATCH` e `DELETE`. A
    resposta usa `Cache-Control: no-store` e não pode ser armazenada pelo browser,
    Service Worker, CDN ou TanStack Query em persistência durável.
12. Toda mutação autenticada exige simultaneamente cookie válido, token CSRF com
    comparação constante e header `Origin` exatamente pertencente à allowlist.
    Ausência, divergência ou origem não permitida responde
    `403 CSRF_VALIDATION_FAILED` sem executar controller, command, service ou
    persistência de domínio.
13. `GET /auth/google`, `GET /callback` e o bypass local não usam o token CSRF da
    sessão. O início não altera dados autenticados; o callback permanece protegido
    por `state`, `nonce` e PKCE; o bypass não é publicado. Nenhuma outra exceção é
    implícita.
14. CORS aceita credenciais somente para origens completas configuradas. Não aceita
    `*`, regex genérica ou sufixo `*.vercel.app`; previews precisam ser incluídos
    explicitamente ou usar ambiente dedicado. Métodos e headers permitidos são os
    mínimos consumidos pela UI, incluindo `X-CSRF-Token`, e respostas variáveis por
    origem incluem `Vary: Origin`. O desenvolvimento padrão continua permitindo
    exatamente `http://localhost:3000` contra a API em `http://localhost:4000`;
    `127.0.0.1`, outra porta, hostname de rede local ou origem do Playwright só são
    aceitos quando configurados explicitamente no ambiente que os utiliza.
15. `POST /auth/logout` valida origem e, quando houver sessão ativa, também CSRF;
    remove somente o registro atual do Redis, limpa cookies atuais e legados e
    responde `204`. Repetição, cookie ausente ou sessão já expirada também termina
    em `204` e limpa o cookie, sem recriar estado.
16. Depois do logout, qualquer cópia do JWT da sessão revogada recebe `401` e não
    acessa dados protegidos, mesmo que assinatura e `exp` ainda sejam válidos.
17. Se o Redis estiver indisponível, login não deve emitir uma sessão tratada como
    válida e endpoints protegidos falham fechados com erro técnico sanitizado. Não
    existe fallback para validação stateless do JWT.
18. `configure-google-oauth.mjs` deixa de habilitar o bypass e de gravar uma chave
    conhecida. A configuração padrão permanece desabilitada e não contém segredo
    funcional no `.env.example`.
19. O bypass somente é registrado quando o runtime está explicitamente marcado
    como local ou teste, a flag própria está ativa e uma chave aleatória de pelo
    menos 32 bytes foi fornecida. Runtime ausente, publicado, CI não E2E, Vercel,
    produção ou combinação incoerente falha no bootstrap ou não registra a rota.
20. A chave do bypass usa comparação constante, nunca aparece em logs e é
    diferente por ambiente. Fora das condições válidas, `POST /auth/test-login`
    responde `404` porque a rota não existe.
21. Rate limiting usa contadores atômicos no Redis e a identidade apropriada:
    origem/IP confiável antes do login e pessoa/sessão, com IP como dimensão
    secundária, depois do login. `OPTIONS` não consome quota.
22. Os limites iniciais são configuráveis e falham no bootstrap quando inválidos:
    - `GET /auth/google`: 10 tentativas por 10 minutos por IP;
    - `GET /callback`: 30 tentativas por 10 minutos por IP;
    - `POST /auth/test-login`: 5 tentativas por minuto por IP local;
    - `GET /auth/csrf` e `POST /auth/logout`: 30 requests por minuto por sessão e
      IP;
    - mutações autenticadas comuns: 60 requests por minuto por pessoa e IP;
    - mutações administrativas: 30 requests por minuto por pessoa administradora e
      IP.
23. Ao exceder limite, a API responde `429 TOO_MANY_REQUESTS`, inclui
    `Retry-After`, não executa o caso de uso e não revela se conta, pessoa ou
    privilégio existem. A extração de IP confia somente na fronteira de proxy
    explicitamente configurada para o deploy.
24. Em login posterior, a identidade continua sendo o `sub` imutável. Nome, e-mail
    verificado e foto retornados pelo Google são atualizados atomicamente somente
    quando mudarem. `googleSubject`, `isAdmin`, `configs`, `createdAt` e qualquer
    outro campo não controlado pelo provedor são preservados; `updatedAt` muda
    somente quando o perfil efetivamente muda.
25. Headers da API são aplicados antes de rotas, parser de cookies e CORS. Headers
    da UI são configurados na borda da Vercel. A política deve cobrir, no mínimo,
    MIME sniffing, framing, referrer, HTTPS em produção, permissões e CSP da UI,
    sem bloquear CORS credenciado, callback/redirecionamento Google, avatares ou
    service worker do PWA. A CSP também preserva a única montagem de
    `@vercel/analytics` v2: script, pageviews e eventos customizados usam os
    endpoints dinâmicos same-origin fornecidos pela configuração da Vercel, sem
    acoplamento a um path fixo de intake; `connect-src` permite ainda somente a
    origem exata da API configurada. A política não recorre a `*` nem amplia fontes
    apenas para fazer uma integração funcionar.
26. A UI obtém o token CSRF depois de confirmar a sessão, reutiliza-o em memória no
    cliente Axios único e nunca o persiste. O layout autenticado só disponibiliza
    mutations depois que `GET /auth/me` e `GET /auth/csrf` concluírem; a falha
    técnica do token apresenta estado recuperável, sem limpar a pessoa, encerrar a
    sessão ou redirecionar silenciosamente. Respostas `401` limpam token CSRF e
    caches privados e redirecionam para `/`; `403 CSRF_VALIDATION_FAILED` não é
    repetido automaticamente, para não duplicar uma mutation.
27. Os menus persistente e móvel compartilham uma única mutation de logout. `Sair`
    fica indisponível durante a request, revoga a sessão, limpa dados privados do
    TanStack Query e navega com substituição de histórico para `/`, inclusive após
    resposta idempotente de sessão já ausente. Falha técnica mantém a pessoa na
    rota autenticada, reabilita a ação e apresenta feedback acessível para nova
    tentativa; não limpa cache como se o logout tivesse sido confirmado.
28. A mudança de `POST /auth/google` para navegação top-level remove a preparação
    assíncrona da URL na UI. A ativação de `Entrar com Google` emite somente
    `ui_operation_started` para `google_login` imediatamente antes da navegação; a
    UI não fabrica `ui_operation_completed=success` por ter calculado um `href` nem
    persiste estado para correlacionar o retorno externo. O callback feliz ou falho
    continua observável pelo comportamento das rotas e pageviews, sem enviar
    `state`, query, URL de autorização ou erro técnico ao Analytics.
29. A nova ação `Sair` amplia o enum vigente da fronteira de Analytics com
    `operation=logout` e emite exatamente um `ui_operation_started` por ativação e
    um `ui_operation_completed` terminal com `success` para qualquer `204`
    idempotente ou `error` para falha técnica. Bootstrap CSRF, redirects automáticos
    por `401`, falhas CSRF e decisões internas de rate limit não criam eventos de
    produto. Nenhuma emissão contém pessoa, sessão, cookie, CSRF, origem, IP,
    resposta, query ou mensagem de erro, e a coleta nunca atrasa revogação, limpeza
    ou navegação.
30. A composição continua com uma única instância de `Analytics`; não surge
    provider, client, transporte ou listener global paralelo. Falha, bloqueio por
    CSP/ad blocker ou indisponibilidade da coleta não altera login, bootstrap CSRF,
    mutation autenticada, logout, limpeza de cache ou navegação.
31. Todo código novo ou alterado mantém `strict: true`, não introduz `any`, casts
    duplos ou suppressions para contornar tipos e preserva a fronteira pública
    vigente dos módulos Nest. Novos services de pessoa, sessão, CSRF e Redis só são
    exportados quando existir consumidor real; repositories, adapters, models e
    clients permanecem encapsulados. `TrainingPlanModule` continua consumindo a
    autenticação exclusivamente por `AuthModule`, sem importar `PersonModule` ou
    infraestrutura de sessão diretamente.
32. Headers, CSP, bootstrap e a nova ação não alteram a meta viewport global, o
    bloqueio declarativo de zoom, a política de seleção de texto, a única instância
    dos providers ou a separação entre Service Worker do PWA e MSW. Requests da API,
    respostas autenticadas e o token CSRF permanecem fora do precache.
33. Em produção e preview, `REDIS_URL` é obrigatória, não possui fallback para o
    endereço local e aceita exclusivamente uma connection string TLS. `redis://`
    permanece válido somente em local e teste; `rediss://` é exigido nos runtimes
    publicados. A validação informa apenas a chave e o protocolo inválidos, sem
    registrar URL, host, usuário, senha ou parâmetros da conexão.
34. A composição Nest cria no máximo um client `ioredis` compartilhado pelos
    adapters em cada runtime aquecido. Controller, command, service, guard e
    adapter nunca criam client por request. O client é reutilizado entre requests,
    encerrado no shutdown do processo e, quando o deploy usar Fluid Compute,
    integrado à API oficial de lifecycle da Vercel compatível com a versão
    instalada, sem criar um pool paralelo.
35. Conexão, comandos e reconexão possuem timeouts e tentativas máximas explícitos.
    O client pode reconectar com backoff limitado depois de falha transitória, mas
    nenhuma request aguarda indefinidamente em offline queue nem ultrapassa o
    timeout HTTP da API. Esgotadas as tentativas da operação, aplica-se a falha
    fechada do requisito 17.
36. Toda chave Redis recebe namespace validado que identifica o ambiente e o
    assunto (`session`, `csrf` ou `rate-limit`). Produção, cada preview autorizado,
    local, teste e Playwright nunca compartilham namespace; quando dois ambientes
    usam o mesmo banco físico, os adapters só constroem chaves sob o prefixo
    injetado e não aceitam namespace fornecido por request. Nenhuma rotina de
    aplicação executa `FLUSH*`, `KEYS` ou limpeza por prefixo em banco publicado.
37. O desenho considera como envelope inicial do Redis conectado até 30 conexões
    simultâneas, 100 operações por segundo e 30 MB de dataset. A implementação
    documenta e mede o número máximo de comandos Redis de cada caminho protegido,
    mantém margem abaixo do limite de conexões e não confunde as quotas de
    rate limiting por pessoa/IP com a capacidade global do provedor. Atingir limite
    de conexão, throughput ou memória nunca desativa sessão, CSRF ou throttling.
38. A política do banco permanece `noeviction`: sessões e contadores não podem ser
    removidos silenciosamente para liberar memória. Falha de escrita por memória
    cheia segue o requisito 17. Se o dataset for reiniciado ou perdido, todo JWT
    cujo registro de sessão desapareceu recebe `401`, sessões novas só são emitidas
    depois que a gravação for confirmada e os contadores de rate limiting recomeçam
    vazios; o JWT nunca restaura sessão ou contador ausente.

## Requisitos não funcionais

- Acessibilidade:
  - `Sair` usa controle semântico, nome acessível e estado disabled observável;
  - loading e falha técnica do logout possuem feedback textual/toast e não prendem
    foco no drawer móvel;
  - nenhuma proteção de segurança depende de gesto inacessível ou informação apenas
    visual.
- Performance:
  - validação protegida adiciona no máximo uma leitura indexada de sessão no Redis,
    além da consulta MongoDB já existente;
  - rate limiting usa operações Redis atômicas com TTL e não percorre chaves;
  - o token CSRF é reutilizado durante a sessão e não exige nova request por
    mutation;
  - um único client multiplexado atende cada runtime aquecido, sem conexão por
    request, e o consumo de comandos dos caminhos autenticados é medido contra o
    teto global de 100 operações por segundo;
  - tamanho de chaves, sessões, material CSRF e contadores é medido com a
    serialização real; o orçamento considera expiração, cardinalidade simultânea e
    overhead do Redis antes de ocupar os 30 MB disponíveis.
- Manutenibilidade:
  - contratos e configurações novas são representados por tipos concretos sob o
    TypeScript estrito vigente, sem ampliar barrels ou exports por uso hipotético;
  - a fronteira de Analytics continua sendo o único catálogo de eventos da UI, e a
    fronteira Axios continua sendo o único ponto de requests à API;
  - ports de Redis pertencem ao assunto de sessão, CSRF ou rate limit que
    encapsulam e não são expostas diretamente a controllers ou commands.
- Segurança e privacidade:
  - cookies, JWTs, identificadores de sessão, material CSRF, código/verifier OAuth,
    chaves e dados pessoais nunca são registrados;
  - nenhum token de sessão ou CSRF entra em URL, storage do navegador, fixture ou
    mensagem de erro;
  - CORS, CSRF, `SameSite`, `Origin`, rate limiting e headers são camadas
    complementares, não substitutas;
  - XSS na origem permitida continua sendo um risco e deve ser reduzido por CSP,
    escaping e ausência de tokens persistidos em JavaScript;
  - futuros backends e cronjobs devem usar identidade de máquina própria; esta
    sessão de navegador nunca é compartilhada entre serviços;
  - Analytics não recebe token, identificador, claim, origem, IP, URL completa,
    query, hash, payload HTTP, dado pessoal ou motivo técnico de falha; a política
    já vigente da FIT-0035 permanece aplicável à nova ação e aos fluxos alterados.
- Observabilidade:
  - registrar somente decisão e código sanitizado para login, PKCE, CSRF, sessão,
    logout, rate limit e atualização de perfil;
  - métricas distinguem falha de assinatura, claims, sessão revogada/ausente,
    Redis indisponível, CSRF, origem e throttling sem incluir valores recebidos;
  - `429` e falhas CSRF permitem correlação por request ID, não por token ou dado
    pessoal;
  - métricas operacionais acompanham conexões abertas, reconexões, latência e erro
    de comando, operações por segundo, memória usada e falhas `noeviction`, com
    alertas antes dos limites contratados e sem labels de alta cardinalidade;
  - logs operacionais da API e eventos de produto do Vercel Analytics permanecem
    responsabilidades distintas: nenhum log é encaminhado à fronteira de Analytics
    e nenhum evento de UI substitui os logs sanitizados de segurança.
- Disponibilidade:
  - Redis passa a ser dependência crítica para autenticação e rate limiting;
  - indisponibilidade não abre bypass nem reativa validação stateless;
  - timeouts e falhas são rápidos, sanitizados e exercitados em testes;
  - uma conexão encerrada pode ser restabelecida dentro dos limites configurados,
    mas requests não ficam pendentes indefinidamente durante a recuperação;
  - perda ou reinicialização do dataset invalida as sessões ausentes e reinicia os
    contadores, sem reconstrução a partir de JWT, cookie ou estado da aplicação.

## Critérios de aceite

### Cenário 1 — Deploy mantém sessão cross-site com proteção mínima

- Forma de validar: cenário de cookie de produção em
  `api/docs/sdd/endpoints/auth.md`.
- Given: UI e API estão em sites `vercel.app` distintos e HTTPS
- When: o callback conclui um login válido
- Then: a sessão é criada com `HttpOnly`, `Secure`, `SameSite=None`, `Path=/`, sem
  `Domain` e com prefixo `__Host-`, enquanto cookies OAuth usam `SameSite=Lax`

### Cenário 2 — OAuth usa state, nonce e PKCE S256

- Forma de validar: cenários de início e callback em
  `api/docs/sdd/endpoints/auth.md`.
- Given: a pessoa navega para `GET /auth/google`
- When: o Google retorna um authorization code
- Then: a troca somente ocorre com `state`, `nonce` e `code_verifier` válidos e
  todos os cookies temporários são limpos

### Cenário 3 — Mutação autenticada exige CSRF e origem

- Forma de validar: cenário vivo de `PATCH /auth/me/configs` com seed e cURL.
- Given: existe sessão ativa e a UI obteve o token por `GET /auth/csrf`
- When: envia mutation com cookie, origem permitida e `X-CSRF-Token` correspondente
- Then: a operação é executada normalmente

### Cenário 4 — CSRF ausente ou inválido falha antes do domínio

- Forma de validar: cenários de falha CSRF no endpoint autenticado e nos E2E.
- Given: existe cookie de sessão, mas token CSRF está ausente ou divergente
- When: envia uma mutation autenticada
- Then: recebe `403 CSRF_VALIDATION_FAILED` e nenhum dado é alterado

### Cenário 5 — Origem não permitida não usa a sessão

- Forma de validar: cenário E2E de origem hostil.
- Given: existe sessão válida no navegador
- When: uma origem não allowlisted tenta uma mutation com credenciais
- Then: preflight ou validação de `Origin` impede a operação e nenhuma response
  privada fica acessível

### Cenário 6 — Logout revoga imediatamente a sessão atual

- Forma de validar: `http://localhost:3000/dash` e cenários de logout em
  `api/docs/sdd/endpoints/auth.md`.
- Given: pessoa autenticada possui sessão ativa e token CSRF
- When: aciona `Sair`
- Then: a API remove a sessão do Redis, limpa cookies, a UI apaga cache privado e
  navega para `/`; reutilizar o JWT revogado recebe `401`

### Cenário 7 — JWT valida contexto e registro server-side

- Forma de validar: testes unitários do serviço de sessão e E2E de endpoint
  protegido.
- Given: JWT possui assinatura válida, mas `iss`, `aud`, `kid`, `jti` ou registro
  Redis é inválido/ausente
- When: chama endpoint protegido
- Then: recebe `401` sem consultar ou devolver recurso privado

### Cenário 8 — Redis indisponível falha fechado

- Forma de validar: teste unitário e E2E controlado de falha de cache.
- Given: Redis não consegue validar ou registrar sessão
- When: ocorre login ou acesso protegido
- Then: a API devolve erro técnico sanitizado, não emite sessão utilizável e não
  aceita somente o JWT

### Cenário 9 — Bypass não é publicável por acidente

- Forma de validar: cenários de bootstrap e rota ausente em
  `api/docs/sdd/endpoints/auth.md`.
- Given: runtime está ausente, publicado, em produção, na Vercel ou com configuração
  incompleta
- When: a aplicação inicia ou recebe `POST /auth/test-login`
- Then: a combinação insegura é recusada ou a rota responde `404`, sem chave padrão
  conhecida e sem efeito colateral do configurador OAuth

### Cenário 10 — Rate limit bloqueia abuso sem executar caso de uso

- Forma de validar: cenários `429` dos endpoints de autenticação e de uma mutação
  administrativa.
- Given: o chamador consumiu a quota da janela configurada
- When: repete a operação sensível
- Then: recebe `429 TOO_MANY_REQUESTS` com `Retry-After`, sem persistência, sessão
  nova ou revelação de identidade

### Cenário 11 — Login posterior atualiza apenas perfil do provedor

- Forma de validar: cenário de pessoa Google existente em
  `api/docs/sdd/endpoints/auth.md`.
- Given: existe pessoa com `isAdmin`, `configs` e perfil Google antigo
- When: novo login retorna nome, e-mail verificado ou foto diferentes
- Then: somente os campos do provedor e `updatedAt` são alterados; identidade,
  privilégios, configurações e `createdAt` permanecem intactos

### Cenário 12 — Headers protegem sem quebrar a aplicação

- Forma de validar: testes HTTP da API, build/preview da UI, Playwright local e uma
  implantação Vercel com Analytics habilitado.
- Given: API e UI estão configuradas com as políticas de produção
- When: carrega a SPA, inicia login, conclui callback, mostra avatar e registra o
  PWA, pageview e evento customizado
- Then: os headers esperados estão presentes e nenhum recurso necessário é
  bloqueado; framing e origens não autorizadas continuam recusados, e a CSP não
  depende de um path fixo do intake resiliente do Analytics v2

### Cenário 13 — Desenvolvimento local padrão continua funcional

- Forma de validar: `http://localhost:3000/`, API em
  `http://localhost:4000` e cenários locais dos endpoints de autenticação.
- Given: a UI e a API usam os defaults locais documentados, sem HTTPS
- When: a pessoa inicia login, confirma a sessão, obtém CSRF e executa uma mutation
- Then: CORS aceita exatamente `http://localhost:3000`, cookies locais usam nome
  não prefixado, `SameSite=Lax` e `Secure=false`, e login, mutation e logout
  funcionam normalmente contra o Redis efêmero em `redis://127.0.0.1:6379`
- And: trocar para `127.0.0.1`, outra porta ou hostname sem atualizar a allowlist
  não é aceito silenciosamente

### Cenário 14 — Falha no bootstrap CSRF não simula logout

- Forma de validar: `http://localhost:3000/dash` com o cenário MSW de falha técnica
  em `GET /auth/csrf` e teste do layout autenticado.
- Given: `GET /auth/me` confirmou a pessoa, mas a obtenção do token CSRF falhou
- When: o layout autenticado termina seu bootstrap
- Then: apresenta erro recuperável, não habilita mutations, não limpa a pessoa nem
  o cache privado e não redireciona para `/` como se a sessão fosse inválida

### Cenário 15 — Analytics acompanha a mudança sem conteúdo sensível

- Forma de validar: testes da fronteira de Analytics, da rota `/`, do menu e do
  logout, com o transporte oficial isolado.
- Given: a única instância global do Analytics e a fronteira tipada estão montadas
- When: a pessoa aciona o login por navegação e depois executa logout em uma sessão
  fictícia independente
- Then: login emite somente o início antes da navegação; logout emite um início e
  um resultado terminal `success|error`, sem duplicidade
- And: sessão, CSRF, pessoa, origem, IP, URL de autorização, query e erro técnico
  não aparecem nas propriedades, e falha de coleta não bloqueia nenhuma ação

### Cenário 16 — Conexão Redis publicada é segura, reutilizada e isolada

- Forma de validar: testes do parser de ambiente e do provider Redis, E2E com
  namespaces distintos e smoke test sanitizado no deploy.
- Given: a API inicia em produção ou preview com `REDIS_URL` e namespace próprios
- When: o mesmo runtime atende múltiplas requests e acessa sessão e rate limiting
- Then: usa TLS e um único client reutilizado, não cria conexão por request e não
  expõe a connection string em logs ou erros
- And: os adapters não constroem nem operam chaves pertencentes a outro ambiente

### Cenário 17 — Limite operacional não remove proteções

- Forma de validar: testes do adapter para timeout, limite de conexões, throughput
  e erro de memória, complementados por inspeção das métricas sanitizadas.
- Given: o Redis se aproxima ou atinge um dos limites de 30 conexões, 100 operações
  por segundo ou 30 MB sob política `noeviction`
- When: uma operação de sessão, CSRF ou rate limiting não pode ser concluída
- Then: a API falha rapidamente e de forma fechada, sem aceitar JWT stateless,
  ignorar CSRF, desativar throttling ou remover chaves silenciosamente
- And: a condição é observável sem connection string, token, IP ou dado pessoal

### Cenário 18 — Reinicialização do dataset não recupera estado pelo JWT

- Forma de validar: E2E serial que cria sessão e contador, limpa exclusivamente o
  Redis efêmero de teste e repete as operações com o mesmo JWT.
- Given: uma sessão e um contador existiam, mas o dataset Redis foi reiniciado
- When: o JWT anterior chama endpoint protegido e uma nova autenticação é iniciada
- Then: o JWT anterior recebe `401`, o contador ausente recomeça vazio e uma nova
  sessão só é entregue depois que seu registro Redis for confirmado
- And: cookie, JWT ou estado em memória nunca recriam sessão ou contador ausente

## Estratégia de entrega e compatibilidade

A entrega coordenará API e UI porque a exigência CSRF passa a fazer parte de todas
as mutações autenticadas. O deploy deve publicar as duas aplicações na mesma janela
e invalidar sessões antigas; não existirá modo permanente que aceite mutation sem
CSRF para compatibilidade.

JWTs atuais não possuem `jti`, `iss`, `aud`, `kid` nem registro no Redis e serão
recusados depois da mudança. A pessoa precisará entrar novamente. A API limpa o
cookie legado ao concluir novo login, logout ou detectar sessão antiga, evitando
dois cookies concorrentes.

O início do login muda de POST JSON para navegação GET. A UI deve migrar antes da
remoção do contrato compartilhado e dos testes antigos na mesma implementação.
Bookmarks ou links existentes de `GET /auth/google` continuam válidos.

No desenvolvimento e no Playwright, o sucesso fictício acompanha a nova fronteira
real: `VITE_API_URL` permanece na mesma origem controlada pelo Vite durante o teste,
o MSW intercepta a navegação `GET /auth/google` e responde com redirect para
`/dash`. Não permanece service, mutation, response JSON ou handler de
`POST /auth/google` apenas para facilitar o teste. O OAuth real continua sendo
validado manualmente porque código e consentimento Google não entram no CI.

A FIT-0035 já está implementada antes desta entrega. A migração preserva o
componente global e a fronteira existentes, altera o enum tipado apenas para
`logout` e ajusta a semântica de `google_login` ao fato de que não existe mais uma
preparação assíncrona na UI. A CSP publicada deve aceitar a configuração dinâmica
same-origin do Analytics v2 e a origem exata da API, sem hardcode do path de intake,
sem segundo transporte e sem ampliar os dados coletados. O recebimento final de
pageview e evento continua sendo uma validação manual de deploy, não um handler MSW.

A FIT-0031 também já está incorporada. A implementação adiciona providers e ports
sob `strict: true`, mantém repositories e adapters Redis/Mongo internos aos módulos
proprietários e preserva a composição em que `TrainingPlanModule` depende apenas da
fronteira pública de `AuthModule`. Se um novo service de `Person` precisar ser
consumido por autenticação, somente esse service entra no export público; o
repository nunca é exposto para encurtar o fluxo.

A FIT-0033 não exige migração funcional: `index.html` e sua meta viewport permanecem
inalterados. Os novos headers são aplicados pela configuração de borda e não por
reescrita do documento ou listener de gesto.

Os limites de rate limiting são defaults de segurança e permanecem configuráveis
por ambiente sem permitir zero, valores negativos ou desativação silenciosa em
produção. Alterá-los depois da entrega é mudança de configuração observável e deve
ser documentada.

A implantação vincula `REDIS_URL` somente aos ambientes que utilizarão o recurso e
fornece um namespace explícito e distinto a cada um. O bootstrap publicado rejeita
URL sem TLS, namespace ausente ou opções que permitam espera indefinida. O provider
Redis compartilha um único client entre os adapters do runtime, registra o lifecycle
oficial da Vercel quando aplicável e preserva o encerramento normal do Nest. A
validação do deploy usa apenas conexão e métricas sanitizadas; credenciais e
connection strings nunca entram em saída de comando, documento ou evidência.

O envelope inicial de 30 conexões, 100 operações por segundo e 30 MB é tratado como
limite global de infraestrutura, separado das quotas funcionais de rate limiting.
A implementação mede comandos e tamanho real dos registros, mantém `noeviction` e
define alertas anteriores à saturação. Exceder qualquer limite segue falha fechada;
não existe redução automática das proteções para conservar capacidade.

Quando UI e API passarem a compartilhar o mesmo site registrável ou um BFF
same-origin, uma nova feature deve migrar a sessão para `SameSite=Lax` ou `Strict` e
reavaliar CORS. Esta feature não antecipa essa topologia.

## Plano de testes

- unitários do parser de ambiente e das combinações seguras de runtime, cookies,
  chaves, origem e CORS, incluindo o default `localhost:3000` e rejeição de host,
  protocolo ou porta não allowlisted; para Redis, produção/preview exigem
  `REDIS_URL` TLS e namespace, enquanto local/teste preservam
  `redis://127.0.0.1:6379`;
- unitários do provider `ioredis` para instância única por runtime, reutilização por
  adapters, lifecycle Vercel condicional, shutdown, timeout, reconexão limitada e
  ausência de espera indefinida na offline queue;
- unitários dos adapters Redis para namespaces de sessão, CSRF e rate limiting,
  isolamento entre ambientes, proibição de comandos globais e sanitização de
  connection string e credenciais;
- testes do orçamento operacional para contabilizar comandos por caminho, tamanho
  serializado dos registros, margem de conexões, métricas e falha fechada diante de
  limite de throughput, conexão ou memória sob `noeviction`;
- unitários do configurador OAuth garantindo ausência de ativação do bypass e de
  chave conhecida;
- unitários de `state`, `nonce`, geração/verificação PKCE S256 e limpeza em todos os
  callbacks;
- unitários da sessão para claims obrigatórias, allowlist de algoritmo, `kid`,
  rotação, expiração, registro Redis, revogação, falha do Redis e ausência de
  fallback stateless;
- unitários e E2E da defesa CSRF para token válido, ausente, divergente, outra
  sessão, origem ausente e origem não permitida;
- unitários do throttler/storage Redis e testes de janela, chave, `Retry-After`,
  proxy confiável, concorrência e isolamento entre pessoas;
- unitários do repository de `Person` para atualização efetiva, ausência de
  alteração, corrida e preservação de `isAdmin`, `configs` e timestamps;
- E2E serial da API com MongoDB e Redis efêmeros para login, sessão ativa,
  expirada/revogada, logout idempotente, CSRF, rate limiting, perfil e bypass
  ausente, incluindo reinicialização controlada do dataset, rejeição do JWT antigo,
  contador reiniciado e confirmação da gravação antes de emitir nova sessão;
- testes dos headers HTTP da API e da configuração Vercel da UI, incluindo CSP,
  origem exata da API, PWA, avatar e ausência de fontes amplas desnecessárias;
- unitários/componentes da UI com MSW para bootstrap CSRF, inclusão do header,
  bloqueio de mutations até o token, logout, 401, 403, falha técnica e ausência de
  retry automático de mutation recusada por CSRF;
- Playwright com Vite real e MSW Browser para login por navegação, mutation
  protegida e logout nos menus desktop e móvel; o handler de login usa `GET` por
  navegação e redirect, sem manter o POST JSON removido;
- testes da fronteira de Analytics e dos componentes afetados para a nova operação
  `logout`, a ausência de resultado fabricado na navegação de login, deduplicação,
  privacidade e no-op em falha; a montagem global continua testada uma única vez;
- regressão da meta viewport, da separação MSW/PWA, das rotas e dos providers pelos
  testes vigentes, sem introduzir teste trivial apenas para repetir configuração;
- validação manual do OAuth Google real, pois o consentimento e o código de uso
  único não entram no CI;
- validação manual em implantação Vercel com Analytics habilitado para confirmar que
  CSP e demais headers permitem pageview e evento customizado pelo intake dinâmico
  da versão 2, sem usar esse recebimento externo como dependência do CI;
- smoke test sanitizado no deploy para confirmar TLS, namespace, reutilização do
  client e emissão das métricas de conexão, latência, comandos e memória sem
  revelar `REDIS_URL`;
- na implementação: `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`,
  `pnpm build`, `pnpm -C api test:e2e` e `pnpm test:integration`.

## Riscos e decisões

- `SameSite=None` continua permitindo que o navegador anexe a sessão em contexto
  cross-site. A decisão é temporária e compensada por CSRF vinculado à sessão,
  origem exata, custom header, CORS mínimo e ausência de mutações por GET.
- Navegadores ou usuários podem bloquear cookies de terceiros. O login pode deixar
  de funcionar nesse caso; não haverá fallback que exponha token ao JavaScript. A
  solução definitiva é domínio compartilhado ou BFF, fora deste escopo.
- Subir Redis à condição de dependência crítica aumenta custo operacional e cria
  indisponibilidade possível, mas permite revogação real e contadores distribuídos.
  Falhar fechado é preferível a aceitar sessão ou abuso sem validação.
- A execução serverless pode multiplicar runtimes e conexões. Criar client por
  request esgotaria rapidamente o limite global; a decisão é reutilizar uma única
  conexão multiplexada por runtime, integrar seu lifecycle quando aplicável e
  observar a quantidade total sem abrir pool paralelo.
- Compartilhar o mesmo banco físico entre ambientes sem namespace misturaria
  sessões, revogações e quotas. A decisão é exigir prefixo validado por ambiente e
  assunto e proibir limpezas globais em runtime publicado.
- `noeviction` preserva a correção de sessões e contadores, mas transforma memória
  cheia em falha de escrita. Perda ou reinicialização do dataset também encerra as
  sessões registradas e reinicia as janelas de rate limiting; nenhum estado é
  reconstruído a partir do JWT, e ambas as condições permanecem observáveis e
  falham fechadas onde houver dependência de escrita ou validação.
- O synchronizer token protege CSRF, não XSS. CSP, ausência de persistência do token
  e práticas vigentes de React reduzem o risco, mas código executado na origem
  permitida continua podendo agir como a pessoa.
- Allowlist ampla de previews Vercel recriaria a vulnerabilidade. Cada preview
  autorizado precisa de origem exata e ambiente/API isolados.
- A mesma exatidão vale no desenvolvimento: `localhost`, `127.0.0.1`, a porta
  exclusiva do Playwright e um hostname de rede são origens diferentes. O default
  preserva `http://localhost:3000`; qualquer variação é configuração explícita do
  ambiente correspondente, não relaxamento global.
- Rate limit por IP pode agrupar pessoas atrás de NAT. Combinar IP com sessão/pessoa
  após autenticação e permitir ajuste documentado reduz falsos positivos.
- A rotação com chave anterior cria uma janela intencional. Ela nunca ultrapassa o
  TTL máximo das sessões e a revogação Redis continua imediata.
- A invalidação das sessões existentes exige novo login após o deploy, impacto
  aceito para remover JWTs legados não revogáveis.
- Atualizar dados do Google melhora consistência, mas somente claims validadas podem
  alterar os três campos do provedor. Privilégios nunca derivam do provedor.
- Defaults de Helmet ou CSP podem conflitar com CORS cross-site, redirects, avatar,
  PWA e Analytics. A versão 2 do Vercel Analytics recebe paths de script e intake
  dinâmicos na própria origem; allowlistar somente um path histórico pode quebrar a
  coleta após deploy, enquanto liberar origens amplas enfraquece a política. A
  decisão é permitir a própria origem, a origem exata da API e somente as demais
  fontes indispensáveis, validando o build implantado.
- O login por navegação top-level encerra o documento antes de a UI observar um
  resultado terminal. Emitir `success` ao calcular o destino produziria telemetria
  falsa; persistir correlação acrescentaria estado e risco de privacidade. A decisão
  é registrar somente o início na UI e deixar callback/rotas e pageviews expressarem
  o resultado observável sem identificador de correlação.
- Instrumentar logout pode vazar contexto de segurança ou atrasar a revogação se a
  coleta entrar no fluxo crítico. A decisão é emitir apenas operação e outcome
  enumerados pela fronteira já existente, absorver falhas e nunca aguardar
  Analytics para chamar a API, limpar cache ou navegar.
- Novos services e adapters de sessão podem incentivar exports amplos entre módulos.
  A decisão é manter os limites implementados pela FIT-0031: apenas services com
  consumidor real são públicos, e infraestrutura Redis/Mongo permanece interna.
- Sessão de navegador não é credencial de serviço. Cronjobs e futuros backends
  precisarão de feature própria para identidade de máquina, audience e permissões
  mínimas.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Desenvolvimento padrão em `localhost:3000`/`localhost:4000` preservado sem
  aceitar origens alternativas implicitamente
- Redis publicado usa TLS, namespace por ambiente, client reutilizável e lifecycle
  limitado, sem connection string em logs ou fallback para o endereço local
- Operação respeita o envelope de conexões, comandos e memória, mantém
  `noeviction` e falha fechada sem desativar sessão, CSRF ou rate limiting
- Reinicialização do dataset invalida sessões ausentes, reinicia contadores e não
  reconstrói estado a partir de JWT ou cookie
- Analytics global, catálogo tipado, privacidade, PWA, viewport e providers vigentes
  preservados
- TypeScript estrito e exports mínimos dos módulos Nest preservados
- Quality gates da raiz aprovados
