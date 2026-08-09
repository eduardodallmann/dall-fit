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
  Google.
- Resultado: manter temporariamente UI e API em sites `vercel.app` distintos e a
  sessão `SameSite=None`, mas compensar essa necessidade com token CSRF vinculado à
  sessão, validação estrita de origem, CORS mínimo, sessões registradas no Redis,
  logout revogável, rate limiting distribuído e endurecimento completo dos fluxos
  Google e de teste. A UI deve oferecer logout e continuar sem acesso JavaScript ao
  cookie da sessão.
- Referências:
  - [NestJS — CSRF protection](https://docs.nestjs.com/security/csrf);
  - [NestJS — Helmet](https://docs.nestjs.com/security/helmet);
  - [NestJS — Rate limiting](https://docs.nestjs.com/security/rate-limiting);
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
  - `fit-0019-tema-claro-escuro.md`, mutação autenticada da própria pessoa.

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
- impedir que o bypass seja registrado fora de execução local/teste explicitamente
  habilitada e remover chaves conhecidas e ativações automáticas;
- aplicar headers de segurança na API e na UI, respeitando a comunicação cross-site,
  o redirecionamento Google, imagens de perfil e o PWA;
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
- endpoint de coleta de relatórios CSP.

## Projetos e documentação afetados

- API e endpoints:
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
  - cliente Axios único, queries, mutations e tratamento de sessão expirada.
- Fluxos:
  - atualizar `docs/sdd/flows/login-google.md`;
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
    `X-CSRF-Token` nas operações autenticadas `POST`, `PUT`, `PATCH` e `DELETE`.
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
    origem incluem `Vary: Origin`.
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
    service worker do PWA.
26. A UI obtém o token CSRF depois de confirmar a sessão, reutiliza-o em memória no
    cliente Axios único e nunca o persiste. Respostas de sessão inválida limpam
    cache privado e redirecionam para `/`; falha técnica do token não é tratada como
    logout silencioso.
27. Os menus persistente e móvel compartilham uma única mutation de logout. `Sair`
    fica indisponível durante a request, revoga a sessão, limpa dados privados do
    TanStack Query e navega com substituição de histórico para `/`, inclusive após
    resposta idempotente de sessão já ausente.

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
    mutation.
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
    sessão de navegador nunca é compartilhada entre serviços.
- Observabilidade:
  - registrar somente decisão e código sanitizado para login, PKCE, CSRF, sessão,
    logout, rate limit e atualização de perfil;
  - métricas distinguem falha de assinatura, claims, sessão revogada/ausente,
    Redis indisponível, CSRF, origem e throttling sem incluir valores recebidos;
  - `429` e falhas CSRF permitem correlação por request ID, não por token ou dado
    pessoal.
- Disponibilidade:
  - Redis passa a ser dependência crítica para autenticação e rate limiting;
  - indisponibilidade não abre bypass nem reativa validação stateless;
  - timeouts e falhas são rápidos, sanitizados e exercitados em testes.

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

- Forma de validar: testes HTTP da API, build/preview da UI e
  `http://localhost:3000/` no Playwright.
- Given: API e UI estão configuradas com as políticas de produção
- When: carrega a SPA, inicia login, conclui callback, mostra avatar e registra o
  PWA
- Then: os headers esperados estão presentes e nenhum recurso necessário é
  bloqueado; framing e origens não autorizadas continuam recusados

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

Os limites de rate limiting são defaults de segurança e permanecem configuráveis
por ambiente sem permitir zero, valores negativos ou desativação silenciosa em
produção. Alterá-los depois da entrega é mudança de configuração observável e deve
ser documentada.

Quando UI e API passarem a compartilhar o mesmo site registrável ou um BFF
same-origin, uma nova feature deve migrar a sessão para `SameSite=Lax` ou `Strict` e
reavaliar CORS. Esta feature não antecipa essa topologia.

## Plano de testes

- unitários do parser de ambiente e das combinações seguras de runtime, cookies,
  chaves, origem e CORS;
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
  ausente;
- testes dos headers HTTP da API e da configuração Vercel da UI;
- unitários/componentes da UI com MSW para bootstrap CSRF, inclusão do header,
  logout, 401, 403 e falha técnica;
- Playwright com Vite real e MSW Browser para login por navegação, mutation
  protegida e logout nos menus desktop e móvel;
- validação manual do OAuth Google real, pois o consentimento e o código de uso
  único não entram no CI;
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
- O synchronizer token protege CSRF, não XSS. CSP, ausência de persistência do token
  e práticas vigentes de React reduzem o risco, mas código executado na origem
  permitida continua podendo agir como a pessoa.
- Allowlist ampla de previews Vercel recriaria a vulnerabilidade. Cada preview
  autorizado precisa de origem exata e ambiente/API isolados.
- Rate limit por IP pode agrupar pessoas atrás de NAT. Combinar IP com sessão/pessoa
  após autenticação e permitir ajuste documentado reduz falsos positivos.
- A rotação com chave anterior cria uma janela intencional. Ela nunca ultrapassa o
  TTL máximo das sessões e a revogação Redis continua imediata.
- A invalidação das sessões existentes exige novo login após o deploy, impacto
  aceito para remover JWTs legados não revogáveis.
- Atualizar dados do Google melhora consistência, mas somente claims validadas podem
  alterar os três campos do provedor. Privilégios nunca derivam do provedor.
- Defaults de Helmet ou CSP podem conflitar com CORS cross-site, redirects, avatar
  e PWA. A política será explícita e testada, não aplicada cegamente.
- Sessão de navegador não é credencial de serviço. Cronjobs e futuros backends
  precisarão de feature própria para identidade de máquina, audience e permissões
  mínimas.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Quality gates da raiz aprovados
