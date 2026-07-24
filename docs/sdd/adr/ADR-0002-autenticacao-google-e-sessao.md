# ADR-0002: Autenticação Google e sessão

- Status: `aceita`
- Data: `2026-07-24`
- Responsáveis: time Dall Fit

## Contexto

A primeira autenticação do produto precisa usar Google, cadastrar pessoas no
MongoDB, proteger API e UI e continuar testável sem automação de uma conta Google.
A credencial disponível é de um cliente OAuth Web com callback no backend.

O navegador e a API são aplicações separadas em portas diferentes. A UI não pode
receber o client secret nem assumir a responsabilidade de autorizar endpoints.

## Alternativas consideradas

### Token Google enviado pela UI em todo request

Reduz endpoints próprios, mas acopla a sessão da aplicação à duração e ao formato
do token externo, expõe mais material OAuth ao JavaScript e força a API a validar o
provedor em cada request.

### Passport com sessão server-side no Redis

Oferece estratégias prontas e revogação central, porém introduz armazenamento de
sessão, ciclo de vida Redis e abstrações maiores que a necessidade atual.

### Authorization Code no backend e sessão assinada em cookie

Mantém o segredo e a troca de código no servidor, permite cookie `HttpOnly`, separa
a identidade Google da sessão Dall Fit e não exige Redis neste primeiro escopo. A
contrapartida é não haver revogação individual antes da expiração.

## Decisão

1. A API executa OAuth 2.0 Authorization Code e OpenID Connect com o adapter oficial
   `google-auth-library`.
2. O request usa `openid email profile`, `state` aleatório e `nonce` aleatório.
   Valores temporários ficam em cookies `HttpOnly`, `SameSite=Lax` e de curta
   duração e são removidos no callback.
3. O adapter valida o ID token, audience, issuer, expiração, nonce, e-mail
   verificado e claims obrigatórias.
4. `Person` usa o claim `sub` como chave Google única. Nome, e-mail e URL da foto
   são persistidos no primeiro login; e-mail não identifica o cadastro.
5. A API emite um JWT HMAC próprio em cookie `HttpOnly`. O payload possui somente o
   ID técnico da pessoa. A sessão expira em sete dias por padrão.
6. O guard reutilizável valida o JWT e busca a pessoa no MongoDB. A UI usa uma rota
   layout sem path com `beforeLoad`, TanStack Query e `GET /auth/me`; isso melhora
   navegação, mas não substitui autorização no servidor.
7. O JSON de credenciais é transportado em
   `GOOGLE_OAUTH_CREDENTIALS_BASE64`. A API decodifica e valida o documento no
   bootstrap. Um script local converte o arquivo fornecido e atualiza `.env` sem
   imprimir o segredo.
8. Testes e desenvolvimento podem habilitar `POST /auth/test-login` somente fora
   de produção e com uma chave separada. Esse endpoint substitui apenas a resposta
   do Google e percorre persistência, sessão e cookie reais.
9. Playwright usa MSW Browser. O handler de início de login redireciona para `/me`
   e `GET /auth/me` devolve fixtures ou `401` por seletor exclusivo de mocks.

## Consequências

### Positivas

- segredo e tokens Google não entram no bundle da UI;
- JavaScript não acessa o cookie da sessão;
- identidade externa e sessão interna ficam desacopladas;
- proteção da API continua sendo a fronteira efetiva;
- o fluxo é testável sem credencial, conta ou disponibilidade do Google;
- MongoDB é a única infraestrutura nova em runtime.

### Negativas e riscos

- sessões não podem ser revogadas individualmente antes da expiração;
- rotação do segredo encerra todas as sessões;
- o guard realiza consulta MongoDB em cada request protegido;
- cookies exigem CORS com credenciais e configuração correta de `Secure`;
- habilitar o bypass em produção seria uma vulnerabilidade; o schema de ambiente
  rejeita essa combinação.

## Plano de adoção

1. Introduzir contratos compartilhados, módulo `Person` e MongoDB.
2. Introduzir módulo de autenticação, adapter Google, sessão e guard.
3. Proteger endpoints e publicar `GET /auth/me`.
4. Adotar Axios, TanStack Query no router, MSW e rota protegida da UI.
5. Adotar Playwright e E2E com MongoDB efêmero.
6. Avaliar Redis, revogação e logout quando houver requisito de segurança ou
   múltiplos dispositivos.

## Links relacionados

- `../features/fit-0001-login-google.md`
- `../flows/login-google.md`
- `../../../api/docs/sdd/endpoints/auth.md`
- `../../../api/docs/sdd/endpoints/current-person.md`
- `../../../ui/docs/sdd/routes/root.md`
- `../../../ui/docs/sdd/routes/me.md`
