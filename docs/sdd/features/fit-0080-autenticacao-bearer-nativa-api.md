# Feature Spec: Autenticação Bearer nativa na API

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #80](https://github.com/eduardodallmann/dall-fit/issues/80).
- Problema: a API autentica a Web exclusivamente por cookie `HttpOnly` associado a
  uma sessão revogável no Redis e protege mutações com CSRF. O aplicativo Android
  Capacitor precisa autenticar também um motor nativo, inclusive quando executado
  pelo WorkManager sem WebView, mas não pode transportar cookie nem depender de
  estado mantido pelo JavaScript.
- Resultado: a API recebe um Google ID token obtido pelo Android, valida sua
  autenticidade e audiência, aplica a mesma política de pessoa da Web e emite uma
  sessão Bearer revogável de duração absoluta igual à sessão Web. Endpoints
  protegidos distinguem os canais `web` e `native` sem enfraquecer cookie/CSRF, e o
  Android possui logout idempotente próprio.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da API](../../../api/docs/sdd/base/01-arquitetura.md);
  - [endpoints e contratos HTTP](../../../api/docs/sdd/base/02-endpoints-e-contratos.md);
  - [testes e qualidade da API](../../../api/docs/sdd/base/03-testes-e-qualidade.md);
  - [mocks e bancos de teste](../../../api/docs/sdd/base/04-mocks-e-bancos-de-teste.md);
  - [seeds e cURLs de cenário](../../../api/docs/sdd/base/05-seeds-e-curls-de-cenario.md);
  - [logging e rastreabilidade](../../../api/docs/sdd/base/06-logging-e-rastreabilidade.md);
  - [endpoints de autenticação](../../../api/docs/sdd/endpoints/auth.md);
  - [ADR-0004 — sessão revogável e CSRF](../adr/ADR-0004-sessao-revogavel-redis-e-csrf.md);
  - [OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect);
  - [autenticação Android com backend](https://developers.google.com/identity/sign-in/android/backend-auth);
  - [`OAuth2Client.verifyIdToken`](https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest/google-auth-library/oauth2client#verifyidtoken).
- Features relacionadas: a FIT-0079 criou a fundação Capacitor e a fronteira de
  plataforma. A issue 81 consumirá este contrato para implementar Google Sign-In,
  Keystore, identidade da instalação e isolamento local de conta; não antecipar
  essas responsabilidades nesta entrega.

A documentação oficial determina que ID tokens recebidos de aplicativos clientes
sejam enviados por HTTPS e validados no servidor quanto a assinatura, issuer,
audience e expiração. O `google-auth-library` instalado permite informar uma ou
mais audiências esperadas a `verifyIdToken`; a implementação deve confirmar essa
API novamente contra os tipos locais da versão instalada.

## Escopo

### Incluído

- criar `POST /auth/native/session` para trocar um Google ID token por uma sessão
  nativa do Dall Fit;
- validar o ID token com o adapter oficial já adotado, aceitando somente a audiência
  Web/server configurada para o backend e recusando token destinado a outro client;
- reutilizar a política vigente de identidade baseada no `sub` Google e o mesmo
  fluxo de criação/sincronização de `Person`, sem cadastro paralelo para Android;
- emitir JWT Bearer técnico revogável, com expiração absoluta e sem refresh token;
- distinguir criptograficamente a sessão nativa da Web por audiência própria e
  persistir o canal da sessão no registro Redis;
- aceitar Bearer nativo nos endpoints autenticados da API e dispensar CSRF somente
  quando a sessão verificada estiver inequivocamente marcada como `native`;
- preservar a exigência de cookie e CSRF para toda mutação autenticada pelo canal
  `web`;
- rejeitar requests protegidas que tragam simultaneamente cookie de sessão e
  `Authorization: Bearer`, sem escolher uma credencial por precedência;
- criar `DELETE /auth/native/session` como logout nativo idempotente;
- definir contratos compartilhados de request e response, códigos de erro estáveis,
  configuração, rate limit, documentação, seeds e cURLs reproduzíveis;
- cobrir emissão, autenticação, expiração, revogação, separação de canais, falhas de
  dependência e redaction com testes unitários e E2E;
- atualizar os SDDs vivos e, se a implementação alterar a decisão arquitetural
  aceita sobre sessão, registrar uma ADR que complemente ou substitua a ADR-0004.

### Não incluído

- tela, botão ou fluxo Google Sign-In dentro do aplicativo Android;
- dependências Android de Credential Manager/Google Identity Services;
- armazenamento do Bearer no Keystore ou sua exposição por bridge Capacitor;
- UUID de instalação, vínculo local de conta, troca de conta ou limpeza de dados do
  dispositivo;
- refresh silencioso, refresh token Google ou refresh token do Dall Fit;
- SQLite, plano preparado, lease offline, snapshots, fila de sincronização,
  WorkManager ou execução de treino offline;
- mudanças no OAuth Authorization Code + PKCE da Web, nos cookies vigentes ou no
  transporte CSRF da Web;
- persistência do Google ID token ou do JWT Bearer bruto no MongoDB ou Redis;
- revogação global de todas as sessões de uma pessoa ou gerenciamento remoto de
  dispositivos;
- suporte nativo a iOS.

## Projetos e documentação afetados

- API e endpoints: `AuthModule`, endpoint de autenticação, configuração validada,
  guards/decorators transversais e todos os endpoints já protegidos passam a
  reconhecer o transporte autenticado resolvido. O documento vivo
  `api/docs/sdd/endpoints/auth.md` recebe os novos endpoints, seus fluxos, todos os
  branches, seeds e cURLs. Os demais documentos de endpoint só mudam quando sua
  descrição vigente afirmar exclusivamente cookie/CSRF ou precisar explicitar a
  nova autenticação aceita.
- UI e rotas: nenhuma tela, rota, request ou comportamento da Web muda nesta
  feature. A UI Web não consome o endpoint nativo e não recebe o Bearer.
- Fluxos: o login Google Web permanece inalterado. Não criar ainda um fluxo Android
  ponta a ponta, pois obtenção e armazenamento da credencial pertencem à issue 81.
- Contratos em `@dall-fit/types`: adicionar request e response da criação da sessão
  nativa. O request contém somente `identityToken`; a response contém `tokenType:
  'Bearer'`, `accessToken`, `expiresAt` em ISO 8601 e a representação pública
  `person`. O pacote não expõe `jti`, canal Redis, segredo, claims internos nem
  detalhes do Google.
- Decisões arquiteturais: complementar a política da ADR-0004 com dois transportes
  isolados sobre o mesmo mecanismo revogável. A implementação deve decidir, após
  avaliar o alcance final do texto vivo, entre nova ADR e substituição explícita;
  não editar a ADR histórica existente.
- Handlers e fixtures MSW: não afetados nesta feature, porque a UI Web não chama os
  novos endpoints. A issue 81 introduzirá doubles na fronteira Android adequada.
- Mocks de repositories/caches nos unitários da API: ampliar mocks do serviço
  Google, pessoa e sessão/Redis para incluir validação nativa, canal e falhas.
- Fixtures MongoDB/Redis nos E2E: acrescentar identidades fictícias e registros de
  sessão `web | native`, mantendo processos efêmeros reais e execução serial.
- Ambiente: declarar uma audiência própria para o JWT de sessão nativa. A audiência
  esperada do Google ID token continua sendo o client Web/server configurado, que o
  Android usará ao solicitar o token na issue 81; não aceitar uma lista aberta de
  client IDs nem confiar em audience fornecida no body.

## Requisitos funcionais

1. `POST /auth/native/session` é público, aceita JSON estrito
   `{ "identityToken": string }`, rejeita campo ausente, vazio ou adicional com
   `400 VALIDATION_ERROR` e nunca aceita o token em query string.
2. O endpoint possui rate limit distribuído por IP, configurável e independente
   dos buckets de início/callback/bypass Web. Excesso responde
   `429 RATE_LIMIT_EXCEEDED` com `Retry-After` e não valida novamente o token Google.
3. O controller valida e registra apenas a presença e os nomes de campos, chama um
   command proprietário e devolve a response montada por ele; nunca registra nem
   transforma o conteúdo do Google ID token.
4. O command chama, nesta ordem, o service Google para validar a identidade, o
   serviço vigente de criação/sincronização de pessoa e o serviço de sessão para
   emitir uma sessão `native`. Nenhuma sessão é criada antes da identidade e da
   pessoa estarem válidas.
5. A validação Google usa `verifyIdToken` e exige assinatura válida, issuer Google,
   audience exatamente igual ao client Web/server configurado, expiração válida,
   `sub`, nome, e-mail e `email_verified: true`. Um ID token para outro client é
   inválido mesmo que tenha assinatura Google válida.
6. Ausência, malformação, expiração, assinatura inválida, audience incorreta ou
   claims obrigatórias inválidas responde `401 GOOGLE_IDENTITY_INVALID` com mensagem
   genérica e sem revelar o motivo verificável ao cliente. Erros inesperados de
   rede/chaves do Google, configuração, MongoDB ou Redis preservam o tratamento
   técnico vigente e não são mascarados como credencial inválida.
7. A pessoa é identificada exclusivamente pelo mesmo `sub` Google usado pela Web.
   Pessoa nova é criada e pessoa existente tem nome, e-mail e foto sincronizados
   pelas regras vigentes, preservando `isAdmin`, `configs` e `createdAt`.
8. A response de sucesso é `201` com `Cache-Control: no-store` e o contrato
   `{ data: { tokenType: "Bearer", accessToken, expiresAt, person } }`. A API não
   cria cookie, não devolve CSRF e não devolve token Google, refresh token, `jti` ou
   segredo.
9. O Bearer é um JWT HS256 emitido pela chave ativa vigente, com `sub`, `jti`,
   `iss`, `aud`, `iat`, `exp` e `kid`. Sua audience é exclusiva do canal nativo e
   diferente da audience Web; sua duração absoluta usa exatamente
   `AUTH_SESSION_TTL_SECONDS` e nunca é renovada por uso.
10. O registro Redis associado persiste `personId`, `expiresAt`, material CSRF
    compatível com o schema interno comum e o discriminador obrigatório
    `channel: 'native'`. O JWT bruto não é persistido. Sessões Web existentes e
    novas recebem `channel: 'web'`; não inferir permanentemente o canal somente pela
    origem da request.
11. A verificação de sessão resolve primeiro o transporte. Ausência dos dois resulta
    em `401 AUTHENTICATION_REQUIRED`; dois transportes simultâneos resultam em
    `400 AUTH_TRANSPORT_AMBIGUOUS`; um header fora do esquema exato `Bearer <token>`
    ou com valor vazio resulta em `401 AUTHENTICATION_REQUIRED`.
12. Depois de resolver um único transporte, a API valida algoritmo, chave,
    assinatura, issuer, audience correspondente ao transporte, claims, presença e
    expiração do registro Redis, igualdade de `personId`, `expiresAt` e `channel`, e
    existência da pessoa no MongoDB. Qualquer divergência funcional resulta em
    `401 AUTHENTICATION_REQUIRED`; Redis indisponível continua falhando fechado com
    `503 AUTHENTICATION_UNAVAILABLE`.
13. O guard anexa à request a pessoa, a sessão verificada e o canal autenticado. Os
    commands e serviços de domínio continuam recebendo a mesma identidade de pessoa
    e não passam a interpretar cookie ou header.
14. Leituras autenticadas aceitam uma sessão Web ou nativa válida. Mutações com
    sessão `web` continuam exigindo `Origin` exatamente igual a `UI_URL` e
    `X-CSRF-Token` em comparação constante; mutações com sessão `native` não exigem
    nem interpretam esses dois valores como CSRF.
15. A dispensa de CSRF depende exclusivamente do `channel: 'native'` autenticado e
    coerente com audience e Redis. A mera presença do header `Authorization`, de
    user-agent Android, de origem ausente ou de execução pelo Capacitor nunca
    desabilita CSRF.
16. `GET /auth/csrf` permanece exclusivo do canal Web. Uma sessão nativa válida
    nesse endpoint recebe erro estável que não devolve token CSRF e não altera a
    sessão.
17. `DELETE /auth/native/session` considera somente o header Bearer e não aceita
    cookie como autenticação do logout nativo. Bearer ativo e coerente tem seu `jti`
    removido e recebe `204`.
18. O logout nativo é idempotente: Bearer ausente, malformado, inválido, expirado ou
    já revogado também recebe `204`, sem body, `Set-Cookie` ou indicação de que a
    sessão existia. Redis indisponível ao tentar verificar ou revogar uma sessão
    potencialmente ativa responde `503 AUTHENTICATION_UNAVAILABLE`; não informa
    sucesso sem confirmar a revogação.
19. `POST /auth/logout` conserva integralmente a semântica Web vigente, inclusive
    cookie, proteção CSRF condicional, limpeza dos nomes de cookie e status `204`.
    Ele não revoga Bearer nem muda de comportamento quando recebe apenas
    `Authorization`.
20. O mecanismo de rotação de chave continua verificando chave anterior somente na
    janela configurada e para a audience/canal esperados. Rotacionar a chave ativa
    não converte uma sessão Web em nativa ou vice-versa.
21. Expiração ou revogação afeta somente autenticação e sincronização remota. A API
    não ordena, sinaliza nem executa limpeza de dados pendentes no dispositivo; o
    novo login posterior pode criar outra sessão para a mesma pessoa.

## Requisitos não funcionais

- Acessibilidade: não se aplica diretamente, pois não há interface visual. Erros e
  contratos estáveis devem permitir que a futura UI Android comunique expiração sem
  interpretar mensagens humanas.
- Performance:
  - após a emissão, uma request Bearer usa a mesma ordem de custo da sessão Web: uma
    leitura Redis e uma leitura projetada de pessoa no MongoDB;
  - a validação Google ocorre somente na troca inicial, nunca em cada request
    autenticada;
  - não criar client Google, Redis ou MongoDB por request;
  - rate limit antecede a chamada externa de validação do ID token.
- Segurança e privacidade:
  - Google ID token e Bearer são segredos e nunca aparecem em logs, erros,
    fixtures, query params, MongoDB ou Redis;
  - criação da sessão exige HTTPS em ambientes publicados e devolve
    `Cache-Control: no-store`;
  - audience do ID token é uma allowlist configurada no servidor, nunca um valor
    escolhido pelo request;
  - JWT Web e nativo usam audiences distintas e o registro Redis confirma o canal;
  - credenciais simultâneas são rejeitadas antes de autorização ou efeito de
    domínio;
  - a dispensa de CSRF não pode ser alcançada por header sem Bearer nativo válido;
  - respostas de autenticação não permitem distinguir sessão revogada de sessão
    inexistente além dos códigos públicos definidos.
- Observabilidade:
  - seguir `NomeDaClasse -> nomeDoMetodo -> etapa:` em todo método criado ou
    alterado;
  - logs podem registrar presença, tamanho categorizado, nomes de claims, canal,
    status, código e IDs técnicos necessários, nunca valores de tokens, nome,
    e-mail ou foto;
  - testes específicos protegem a redaction do body `identityToken`, do header
    `Authorization`, da response `accessToken` e dos erros do adapter Google;
  - não criar tracing externo, persistência de logs no Android ou auditoria de
    dispositivo nesta entrega.
- Compatibilidade: a Web mantém paths, cookies, audiences, responses, CORS e CSRF
  vigentes. A mudança de schema Redis deve invalidar de forma segura ou migrar
  compativelmente sessões Web sem discriminador, conforme estratégia definida na
  implementação e registrada no SDD/ADR; nunca classificá-las como nativas.

## Critérios de aceite

### Cenário 1 — Emissão de sessão nativa para pessoa existente

- Forma de validar: cenário vivo de `POST /auth/native/session` com seed e cURL no
  endpoint de autenticação.
- Given: ID token Google válido para o client Web/server configurado e pessoa já
  vinculada ao mesmo `sub`.
- When: o token é enviado no body JSON do endpoint nativo.
- Then: recebe `201`, `no-store`, pessoa pública e Bearer com expiração absoluta; o
  Redis contém sessão `native`, nenhum cookie é criado e nenhum token aparece nos
  logs.

### Cenário 2 — Criação de pessoa pela identidade nativa

- Forma de validar: cenário vivo de `POST /auth/native/session` com seed e cURL no
  endpoint de autenticação.
- Given: ID token Google válido cujo `sub` ainda não existe no MongoDB.
- When: a troca nativa é concluída.
- Then: uma única pessoa é criada pelas mesmas regras da Web e a response contém
  essa representação pública junto da sessão Bearer.

### Cenário 3 — Token Google inválido ou para outro client

- Forma de validar: cenários vivos separados no endpoint de autenticação, com
  double local seguro do Google, seed e cURLs reproduzíveis.
- Given: ID token malformado, expirado, com assinatura inválida, claims inválidas ou
  audience diferente da configurada.
- When: tenta criar a sessão nativa.
- Then: recebe `401 GOOGLE_IDENTITY_INVALID`, sem pessoa nova, sessão Redis, cookie
  ou detalhe que permita classificar externamente a falha criptográfica.

### Cenário 4 — Uso do Bearer em leitura e mutação

- Forma de validar: cenários vivos dos endpoints protegidos com seed e cURLs
  Bearer reproduzíveis.
- Given: sessão nativa válida e ativa no Redis.
- When: lê um recurso autenticado e executa uma mutação sem headers CSRF.
- Then: ambos reconhecem a mesma pessoa e a mutação prossegue porque o canal
  verificado é `native`, sem alterar a política do domínio.

### Cenário 5 — Cookie Web continua protegido por CSRF

- Forma de validar: regressão E2E vigente de autenticação e mutação Web.
- Given: cookie Web válido.
- When: executa uma mutação sem `Origin` ou sem `X-CSRF-Token` válido.
- Then: recebe `403 CSRF_VALIDATION_FAILED`, e adicionar um header Authorization
  inválido não converte a request em nativa nem dispensa a proteção.

### Cenário 6 — Credenciais simultâneas são rejeitadas

- Forma de validar: cenário vivo de endpoint protegido com seed e cURL contendo
  cookie e Bearer fictícios válidos.
- Given: a request apresenta ao mesmo tempo sessão Web e sessão nativa válidas,
  inclusive quando pertencem à mesma pessoa.
- When: acessa qualquer endpoint protegido compartilhado.
- Then: recebe `400 AUTH_TRANSPORT_AMBIGUOUS` antes do domínio, sem escolher pessoa,
  consumir CSRF ou produzir efeito.

### Cenário 7 — Expiração e revogação são absolutas

- Forma de validar: cenários vivos com relógio controlado, seed Redis e cURLs no
  endpoint de autenticação.
- Given: um Bearer ultrapassou `exp` ou seu registro foi removido.
- When: tenta acessar endpoint protegido.
- Then: recebe `401 AUTHENTICATION_REQUIRED`; nenhum uso renova JWT ou TTL e novo
  acesso exige outra troca de identidade Google.

### Cenário 8 — Logout nativo idempotente

- Forma de validar: cenário vivo de `DELETE /auth/native/session` com seed e cURLs
  repetidos.
- Given: primeiro uma sessão Bearer ativa e depois o mesmo token já revogado, um
  token inválido ou nenhum header.
- When: o logout nativo é chamado em cada condição.
- Then: todas as chamadas funcionais recebem `204`; a sessão ativa é removida uma
  única vez, não há cookie/body e a resposta não revela se o registro existia.

### Cenário 9 — Falha Redis permanece fechada

- Forma de validar: E2E com Redis efêmero interrompido e cenário vivo justificado
  como automatizado por exigir infraestrutura isolada.
- Given: um Bearer potencialmente válido e Redis indisponível.
- When: autentica ou tenta logout.
- Then: recebe `503 AUTHENTICATION_UNAVAILABLE`, nenhum endpoint protegido executa
  seu domínio e o logout não declara revogação sem confirmação.

### Cenário 10 — Transporte Web não sofre regressão

- Forma de validar: E2E de login local, sessão, CSRF, logout, rotação e reset já
  existentes em `api/test/auth.e2e-spec.ts`.
- Given: cliente Web usa somente cookie.
- When: percorre os endpoints atuais.
- Then: contratos, cookies, audience, rate limits, redirects e proteções permanecem
  iguais aos vigentes antes desta feature.

## Estratégia de entrega e compatibilidade

1. Introduzir os contratos públicos e a configuração validada para audiência da
   sessão nativa e rate limit da troca, preservando defaults e variáveis Web.
2. Separar no serviço Google a validação reutilizável de ID token da troca de código
   OAuth, mantendo tratamento funcional e técnico coerente entre os dois fluxos.
3. Generalizar emissão/verificação e registro Redis para o discriminador fechado
   `web | native`, com audiences correspondentes e sem duplicar o mecanismo
   criptográfico.
4. Criar command/controller da troca e resposta `no-store`; não gravar cookie.
5. Resolver cookie/Bearer em uma fronteira única de autenticação e propagar o canal
   verificado para guards de leitura, mutação, administração e treino.
6. Tornar a proteção CSRF condicional ao canal verificado, mantendo-a obrigatória
   para Web e inexistente para native.
7. Criar logout nativo separado e manter o endpoint Web sem branches Bearer.
8. Atualizar unitários, E2E, seeds/cURLs, contratos e documentação viva; executar
   regressão de todos os endpoints protegidos e revisar API/UI por código sem uso.

A mudança de transporte é aditiva no HTTP, mas o novo discriminador torna o schema
de sessão Redis explícito. Sessões Web antigas sem `channel` nunca podem ser
promovidas a nativas. A implementação pode invalidá-las em rollout coordenado ou
aceitá-las temporariamente apenas como `web`, desde que a escolha seja documentada,
testada, limitada a no máximo uma validade absoluta de sessão e não amplie CSRF.
Rollback remove os endpoints e a aceitação de Bearer; sessões nativas restantes no
Redis tornam-se inutilizáveis e expiram pelo TTL, sem migração MongoDB.

## Plano de testes

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

- Unitários:
  - DTO estrito da troca e response sem campos internos;
  - validação Google válida e rejeições por assinatura, issuer, audience, expiração,
    e-mail não verificado e claims obrigatórias;
  - separação entre rejeição funcional do token e erro técnico do provider;
  - command de troca: ordem Google → pessoa → sessão e ausência de efeitos após cada
    falha;
  - emissão com audiences e canais `web | native`, expiração comum e rotação;
  - verificação cruzada recusando JWT nativo em registro Web e JWT Web em registro
    nativo;
  - resolução de cookie, Bearer, ausência e ambiguidade;
  - CSRF obrigatório para Web e dispensado apenas após sessão nativa válida;
  - logout nativo ativo, ausente, inválido, expirado, revogado e Redis indisponível;
  - sanitização/redaction de identity token, Bearer e dados pessoais em todas as
    novas camadas.
- E2E serial com MongoDB e Redis efêmeros reais:
  - troca válida para pessoa nova e existente usando double controlado somente na
    fronteira Google;
  - validação e erro da troca, rate limit e `Cache-Control: no-store`;
  - persistência/TTL/canal Redis e ausência de cookie;
  - leitura e mutação por Bearer sem CSRF;
  - mutação Web sem CSRF ainda rejeitada;
  - cookie e Bearer simultâneos rejeitados, inclusive para a mesma pessoa;
  - sessão expirada, revogada, de audience errada, de canal divergente e após reset
    do Redis;
  - logout nativo repetido e sem credencial;
  - rotação de chave e falha fechada com Redis indisponível;
  - regressão integral do login/callback/test-login/csrf/logout Web.
- Contrato e reprodução:
  - atualizar `api/test/seeds/cli.ts` com fixtures fictícias mínimas;
  - garantir que cada cenário do endpoint possua seed ou justificativa e cURL
    copiável, sem token real ou placeholder indefinido;
  - confirmar que os tipos compartilhados são consumidos pela API e ficam prontos
    para o cliente da issue 81, sem adicionar consumidor Web artificial.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`.

## Riscos e decisões

- Os canais são separados em duas camadas: audience do JWT impede que um token
  assinado para Web seja aceito como nativo, e `channel` no Redis impede divergência
  entre o token e o estado revogável. Usar apenas o header como sinal de canal seria
  insuficiente para dispensar CSRF com segurança.
- Cookie e Bearer simultâneos são rejeitados com
  `400 AUTH_TRANSPORT_AMBIGUOUS`. Mesmo quando representam a mesma pessoa, aceitar
  um por precedência esconderia bugs de transporte e poderia aplicar a política
  CSRF errada.
- `DELETE /auth/native/session` é separado e idempotente. Misturá-lo ao logout Web
  acrescentaria branches de CSRF e limpeza de cookie a uma operação usada pelo
  motor Android; uma rota própria mantém os contratos auditáveis.
- O Google ID token solicitado pelo Android usa o client Web/server como audience,
  conforme a integração oficial com backend. O cadastro OAuth Android vincula
  pacote e assinatura do aplicativo, mas não vira uma audience escolhida pelo body
  nem uma allowlist permissiva na API.
- A response devolve pessoa junto do Bearer para que o futuro cliente possa vincular
  a conta local pelo `personId` sem uma segunda request. Isso não antecipa Keystore,
  UUID nem política de limpeza da issue 81.
- Erros funcionais de ID token compartilham um código genérico para reduzir
  enumeração e acoplamento a mensagens do SDK. Falhas técnicas continuam distintas
  para evitar que indisponibilidade seja interpretada como necessidade de trocar de
  conta.
- A sessão nativa conserva material CSRF no registro comum mesmo sem usá-lo. Isso
  mantém uma estrutura única e evita caminhos condicionais de persistência; a
  segurança não depende desse valor, mas do canal verificado. Se os tipos locais
  mostrarem que remover o campo da variante nativa simplifica sem duplicação, essa
  alteração muda a decisão registrada e exige retornar ao refinamento.
- Aceitar Bearer nos guards já usados pelos endpoints existentes amplia a superfície
  autenticável, mas não muda autorização de pessoa/admin nem regras de domínio.
  Cada decorator deve ser revisado para impedir uma dispensa de CSRF baseada apenas
  na ausência de cookie.
- O escopo foi limitado para caber em até cinco horas: reutiliza Google, JWT, Redis,
  pessoa, erro e testes já existentes; adiciona dois endpoints e generaliza uma
  fronteira de autenticação. Se a implementação exigir plugin Android, fluxo de UI,
  Keystore ou protocolo offline, o trabalho deve parar e permanecer na issue 81 ou
  posteriores.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints e documentação base afetados atualizados
- Sessões Web e nativas isoladas por audience e canal Redis
- Cookie/CSRF Web preservados sem regressão
- Troca Google nativa e logout Bearer reproduzíveis
- Nenhum identity token, Bearer ou dado pessoal exposto em logs ou persistência
- MSW não alterado sem consumidor Web
- Mocks unitários e fixtures E2E atualizados conforme o impacto
- Migração de sessões Web legadas segura e documentada
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz e E2E da API aprovados
