# Feature Spec: Login com Google e proteção autenticada

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.

## Contexto e resultado esperado

- Ticket: `FIT-0001`
- Problema: a aplicação não identifica pessoas, não persiste cadastros e não
  consegue restringir telas ou endpoints a uma sessão válida.
- Resultado: uma pessoa entra com sua conta Google, ganha um cadastro `Person` no
  primeiro acesso, mantém uma sessão segura e acessa uma tela que mostra nome,
  e-mail e foto. API e UI passam a possuir mecanismos reutilizáveis de proteção.
- Referências:
  - configuração OAuth Web fornecida para `http://localhost:3000` e callback
    `http://localhost:4000/callback`;
  - credencial Google fornecida em JSON na raiz do workspace;
  - documentação oficial do fluxo OAuth 2.0 Web Server e OpenID Connect do Google.
- Features relacionadas: não se aplica — esta é a primeira demanda de produto.

## Escopo

### Incluído

- fluxo OAuth 2.0 Authorization Code iniciado pela UI e processado pela API;
- proteção contra CSRF e replay do callback por `state` e `nonce`;
- conversão local do JSON de credenciais Google para uma variável de ambiente
  base64, sem versionar ou registrar o segredo;
- entidade `Person` persistida no MongoDB, identificada pelo `sub` imutável do
  Google, com nome, e-mail e URL da foto;
- criação idempotente de `Person` no primeiro login;
- sessão assinada em cookie `HttpOnly`;
- decorator e guard reutilizáveis para endpoints;
- rota-pai protegida e reutilizável no TanStack Router;
- proteção do endpoint `GET /`;
- endpoint protegido de pessoa atual;
- rota pública `/` com ação para iniciar o login;
- rota protegida `/me` com os dados da pessoa autenticada;
- mocks MSW, testes Vitest, E2E da API com MongoDB efêmero e testes Playwright;
- mecanismo de login fictício restrito a ambiente local/teste.

### Não incluído

- autorização por papéis ou permissões;
- vinculação de mais de um provedor à mesma pessoa;
- refresh token ou acesso a APIs Google além dos scopes `openid email profile`;
- logout, revogação centralizada de sessão ou armazenamento de sessão no Redis;
- edição de perfil;
- migração ou importação de pessoas preexistentes.

## Projetos e documentação afetados

- API e endpoints:
  - `POST /auth/google`;
  - `GET /auth/google`;
  - `GET /callback`;
  - `POST /auth/test-login`;
  - `GET /auth/me`;
  - `GET /`.
- UI e rotas: `/` e `/me`.
- Fluxos: `docs/sdd/flows/login-google.md`.
- Contratos em `@dall-fit/types`: `Person`, `CurrentPersonResponse` e
  `StartGoogleLoginResponse`.
- Decisões arquiteturais:
  `docs/sdd/adr/ADR-0002-autenticacao-google-e-sessao.md`.
- Handlers e fixtures MSW: início fictício do login, pessoa atual autenticada,
  sessão ausente e falha técnica.
- Mocks de repositories/caches nos unitários da API: repository de `Person` e
  integração OAuth Google; Redis não participa.
- Fixtures MongoDB/Redis nos E2E: pessoas fictícias no MongoDB; Redis não se aplica
  porque a sessão é assinada e stateless.

## Requisitos funcionais

1. A rota `/` permanece pública e contém uma ação simples e acessível para iniciar
   o login Google.
2. A UI chama `POST /auth/google`; a API grava cookies temporários e devolve a URL
   do consentimento Google usando somente `openid email profile`, `state` e
   `nonce`. O browser navega para essa URL. `GET /auth/google` oferece início
   direto equivalente.
3. O callback rejeita ausência ou divergência de `state`, falha na troca do código,
   ID token inválido, e-mail não verificado ou claims obrigatórias ausentes.
4. O cadastro usa o claim `sub` como identidade Google estável. E-mail não é chave
   de identidade.
5. No primeiro login, a API persiste nome, e-mail e URL da foto. Logins
   concorrentes para o mesmo `sub` não criam duplicidade.
6. Depois do callback válido, a API cria uma sessão, limpa cookies temporários e
   redireciona para `http://localhost:3000/me`.
7. O guard da API valida assinatura e expiração da sessão e confirma que a pessoa
   ainda existe no MongoDB.
8. O endpoint raiz e `GET /auth/me` respondem somente com sessão válida.
9. A rota-pai protegida consulta `GET /auth/me` antes de carregar seus filhos;
   status `401` redireciona para `/`, e outras falhas permanecem observáveis.
10. `/me` exibe exclusivamente nome, e-mail e foto da pessoa autenticada.
11. O login fictício local/teste percorre persistência e criação de sessão reais,
    mas não chama o Google e não fica disponível em produção.

## Requisitos não funcionais

- Acessibilidade: ações usam semântica de link ou botão adequada; foto possui texto
  alternativo; loading e erros possuem conteúdo textual; foco segue a navegação.
- Performance: a consulta da pessoa atual usa TanStack Query com a política global;
  o guard realiza uma única busca indexada por `_id`.
- Segurança e privacidade:
  - segredo OAuth e segredo de sessão existem somente no ambiente;
  - cookie de sessão é `HttpOnly`, `SameSite=Lax`, possui expiração e usa `Secure`
    fora do HTTP local;
  - token de sessão contém somente o ID técnico de `Person`;
  - logs não contêm nome, e-mail, foto, código OAuth, token, cookie ou segredo;
  - o JSON original de credenciais e arquivos `.env` permanecem ignorados.
- Observabilidade: controllers, commands, services, guards, repositories e adapter
  Google seguem o formato de logging da API com dados sanitizados.

## Critérios de aceite

### Cenário 1 — Primeiro login cria a pessoa

- Forma de validar: cenários “Primeiro login fictício local” e “Callback Google
  válido para pessoa nova” em `api/docs/sdd/endpoints/auth.md`.
- Given: não existe `Person` para o `sub` retornado pelo provedor
- When: o login termina com claims válidas
- Then: existe uma única `Person` com nome, e-mail e foto, e uma sessão válida é
  criada

### Cenário 2 — Login repetido não duplica cadastro

- Forma de validar: cenário “Login fictício de pessoa existente” em
  `api/docs/sdd/endpoints/auth.md`.
- Given: já existe `Person` para o `sub`
- When: a pessoa entra novamente
- Then: o cadastro é reutilizado e nenhuma duplicidade é criada

### Cenário 3 — Endpoint protegido rejeita sessão ausente

- Forma de validar: cenário “Sessão ausente” em
  `api/docs/sdd/endpoints/current-person.md` e no endpoint raiz.
- Given: o request não possui cookie de sessão
- When: chama `GET /auth/me` ou `GET /`
- Then: recebe `401 AUTHENTICATION_REQUIRED` sem acessar conteúdo protegido

### Cenário 4 — Rota pública inicia login

- Forma de validar: `http://localhost:3000/`.
- Given: a pessoa está na rota pública
- When: aciona `Entrar com Google`
- Then: a UI chama `POST /auth/google` e navega para a URL devolvida

### Cenário 5 — Rota protegida exibe a pessoa

- Forma de validar: `http://localhost:3000/me` com MSW habilitado.
- Given: o handler MSW representa uma sessão válida
- When: a rota protegida é carregada
- Then: nome, e-mail e foto fictícios são exibidos

### Cenário 6 — Rota protegida redireciona sem sessão

- Forma de validar:
  `http://localhost:3000/me?mockAuth=unauthenticated` com MSW habilitado.
- Given: o handler MSW responde `401`
- When: a rota protegida é carregada
- Then: a pessoa retorna para `/` e os dados privados não são renderizados

## Estratégia de entrega e compatibilidade

A demanda introduz contratos novos, sem consumidores anteriores. O endpoint raiz
mantém sua resposta de sucesso, porém passa a exigir autenticação. O JSON de
credenciais é convertido localmente pelo script da API; apenas o nome da variável e
um exemplo fictício são versionados.

## Plano de testes

- unitários do parser de ambiente, adapter OAuth, serviço de sessão, guard,
  services de `Person` e commands;
- E2E serial da API com MongoDB efêmero para criação, reutilização, sessão válida e
  rejeições;
- componentes da UI com MSW Node para sucesso e ausência de sessão;
- Playwright com Vite real e MSW Browser para a jornada pública → login fictício →
  `/me`, acesso direto autenticado e redirecionamento sem sessão;
- quality gates completos, `pnpm -C api test:e2e` e `pnpm test:integration`.

## Riscos e decisões

- E-mail pode mudar; o cadastro usa `sub`.
- Um cookie stateless não oferece revogação individual antes da expiração; isso é
  aceito neste primeiro escopo e mitigado por expiração de sete dias e rotação do
  segredo.
- Cookies entre portas locais funcionam por host, mas a UI deve usar Axios com
  `withCredentials` e a API deve habilitar CORS com credenciais.
- O mecanismo fictício seria crítico se habilitado em produção; validação de
  ambiente impede essa combinação e exige uma chave local fictícia.
- A navegação externa do Google não é automatizada. MSW simula somente suas
  fronteiras; a integração real é isolada em unitários e verificada manualmente com
  a credencial local.

## Definição de pronto

- [ ] Critérios de aceite atendidos
- [ ] Contratos, endpoints, rotas e fluxos afetados atualizados
- [ ] MSW, mocks unitários e E2E foram atualizados conforme o impacto
- [ ] Migração entre produtor e consumidores é compatível
- [ ] Quality gates da raiz aprovados ou dispensa `docs-only` registrada
