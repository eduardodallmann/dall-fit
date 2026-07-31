# Endpoints de autenticação

## Objetivo funcional

Iniciar e concluir o login Google e oferecer uma entrada equivalente, restrita a
local/teste, para automação sem o provedor externo.

## Referências técnicas

| Papel      | Símbolo                                                                                      | Responsabilidade neste fluxo              |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Controller | [`AuthController`](../../../src/auth/controllers/auth.controller.ts)                         | cookies, redirects e entrada HTTP         |
| DTO        | [`GoogleCallbackQueryDto`](../../../src/auth/dto/google-callback-query.dto.ts)               | valida código, state e erros do callback  |
| DTO        | [`TestLoginDto`](../../../src/auth/dto/test-login.dto.ts)                                    | valida identidade exclusivamente fictícia |
| Command    | [`StartGoogleLoginCommand`](../../../src/auth/commands/start-google-login.command.ts)        | prepara início OAuth                      |
| Command    | [`CompleteGoogleLoginCommand`](../../../src/auth/commands/complete-google-login.command.ts)  | valida retorno, cadastra e cria sessão    |
| Command    | [`TestLoginCommand`](../../../src/auth/commands/test-login.command.ts)                       | substitui somente a identidade externa    |
| Integração | [`GoogleOAuthService`](../../../src/auth/services/google-oauth.service.ts)                   | SDK Google e validação OpenID Connect     |
| Sessão     | [`AuthSessionService`](../../../src/auth/services/auth-session.service.ts)                   | emite e valida JWT próprio                |
| Domínio    | [`FindOrCreatePersonService`](../../../src/person/services/find-or-create-person.service.ts) | criação idempotente da pessoa             |
| Repository | [`MongoPersonRepository`](../../../src/person/repositories/mongo-person.repository.ts)       | criação protegida por índice único        |

## Contrato HTTP resumido

### `POST /auth/google`

- público, sem entrada;
- grava cookies temporários `dall_fit_oauth_state` e
  `dall_fit_oauth_nonce`, com dez minutos;
- responde `200` com `{ data: { authorizationUrl } }`;
- a UI navega para a URL recebida;
- não idempotente quanto aos valores aleatórios gerados.

### `GET /auth/google`

- público, sem entrada;
- responde `302` para o Google;
- grava cookies temporários `dall_fit_oauth_state` e
  `dall_fit_oauth_nonce`, com dez minutos;
- seguro e não idempotente quanto aos valores aleatórios gerados.

### `GET /callback`

- público, recebe `code` e `state`, ou `error`;
- metadados adicionais devolvidos pelo Google são descartados antes da validação;
- compara o state do query ao cookie e valida o nonce no ID token;
- em sucesso grava `dall_fit_session`, limpa cookies temporários e responde `302`
  para `${UI_URL}/me`;
- em falha limpa cookies temporários e responde `302` para
  `${UI_URL}/?authError=oauth_failed`, sem sessão.

### `POST /auth/test-login`

- disponível somente quando `AUTH_TEST_BYPASS_ENABLED=true`, ambiente não é
  produção e `x-auth-test-key` corresponde à configuração;
- recebe identidade fictícia completa e executa o mesmo cadastro e emissão de
  sessão;
- rejeita campos adicionais, inclusive tentativas de enviar `isAdmin`;
- responde `204`, grava `dall_fit_session` e não chama Google;
- fora das condições responde `404`, evitando divulgar o recurso.

## Fluxo completo

### 1. Início — `AuthController.prepareGoogleLogin` e `startGoogleLogin`

Os dois métodos chamam `StartGoogleLoginCommand.execute`. O command gera `state` e
`nonce` e chama `GoogleOAuthService.createAuthorizationUrl`.
O service usa os scopes `openid email profile`, `response_type=code`,
`access_type=online`, `state`, `nonce` e `prompt=select_account`.

Ambos os métodos gravam cookies temporários. O POST devolve a URL em JSON à UI; o
GET redireciona diretamente.

### 2. Callback — `AuthController.completeGoogleLogin`

O DTO garante strings não vazias. Se o Google retornar `error`, ou se parâmetros
obrigatórios/cookies estiverem ausentes, o command escolhe o branch de falha.

No caminho principal:

1. `CompleteGoogleLoginCommand` compara `state` por igualdade constante.
2. Chama `GoogleOAuthService.exchangeCode`, que troca o código e valida o ID token
   para client ID, issuer, expiração e nonce.
3. O service exige `sub`, nome, e-mail verificado e aceita foto anulável. Retorna
   apenas o contrato de identidade necessário.
4. O command prepara a entrada de `FindOrCreatePersonService`.
5. O service prepara o objeto de persistência e chama
   `PersonRepository.findOrCreateByGoogleSubject`.
6. O adapter consulta pelo `sub` e cria sob proteção de índice único. Em pessoa
   nova, persiste os três dados pessoais sem `isAdmin`; em pessoa existente,
   devolve o documento vigente sem alterar a presença do campo administrativo. Se
   duas criações concorrerem, a que receber chave duplicada carrega o documento
   vencedor.
7. Chama `AuthSessionService.createSession`, que assina JWT contendo somente
   `sub=<personId>`.
8. Monta o resultado de redirect e cookie.
9. O controller grava a sessão, limpa cookies OAuth e redireciona.

Falhas de integração ou persistência não criam cookie de sessão. O erro técnico é
tratado sem expor detalhes e o navegador volta à UI com código genérico.

### 3. Bypass — `AuthController.testLogin`

`TestAuthBypassGuard` valida ambiente, flag e chave. Depois do DTO,
`TestLoginCommand` prepara a mesma identidade interna que o adapter Google
produziria, chama `FindOrCreatePersonService` e `AuthSessionService`, e o controller
grava o cookie. A validação whitelist rejeita `isAdmin` e qualquer campo que não
pertença à identidade fictícia.

## Mapa de caminhos possíveis

| Caminho            | Gatilho                            | Sequência resumida                                       | Resultado HTTP                 | Efeito                             |
| ------------------ | ---------------------------------- | -------------------------------------------------------- | ------------------------------ | ---------------------------------- |
| preparar OAuth     | POST da UI                         | Controller → Command → GoogleOAuthService                | `200` com URL                  | cookies temporários                |
| início direto      | GET público                        | Controller → Command → GoogleOAuthService                | `302` Google                   | cookies temporários                |
| callback novo      | claims válidas, pessoa ausente     | Controller → Command → Google → Person → Mongo → Session | `302 /me`                      | cria pessoa sem `isAdmin` e sessão |
| callback existente | claims válidas, pessoa presente    | mesmo fluxo, branch existente                            | `302 /me`                      | preserva pessoa e cria sessão      |
| callback inválido  | erro, state/nonce/claims inválidos | Controller/Command interrompe                            | `302 /?authError=oauth_failed` | limpa temporários                  |
| bypass válido      | local/teste + chave                | Guard → Controller → Command → Person → Session          | `204`                          | pessoa/sessão                      |
| bypass bloqueado   | produção, flag/chave inválida      | Guard interrompe                                         | `404`                          | nenhum                             |

## Cenários detalhados

### Cenário 1 — Preparar login Google

**Seed:** não se aplica — a operação gera estado temporário e não consulta banco.

**cURL**

```bash
curl --request GET \
  --url http://localhost:4000/auth/google \
  --include
```

- Given: API configurada com credencial válida
- When: chama `GET /auth/google`
- Then: recebe `302`, Location do Google e dois cookies temporários protegidos

O fluxo usado pela UI chama a variante JSON:

```bash
curl --request POST \
  --url http://localhost:4000/auth/google \
  --include
```

Ela responde `200` com `authorizationUrl` e os mesmos cookies.

### Cenário 2 — Primeiro login fictício local

**Seed**

```bash
pnpm -C api seed -- auth:person-new
```

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: local-auth-test-key' \
  --include \
  --data '{"googleSubject":"google-new-001","name":"Alex Runner","email":"alex.runner@example.test","photoUrl":"https://example.test/alex.png"}'
```

- Given: a fixture garante ausência do `sub`
- When: o bypass recebe identidade válida
- Then: responde `204`, cria uma pessoa sem `isAdmin` e envia cookie de sessão

### Cenário 3 — Login fictício de pessoa existente

**Seed**

```bash
pnpm -C api seed -- auth:person-existing
```

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: local-auth-test-key' \
  --include \
  --data '{"googleSubject":"google-existing-001","name":"Ignored Name","email":"ignored@example.test","photoUrl":null}'
```

- Given: existe `Person` da fixture
- When: o bypass é executado novamente
- Then: responde `204`, reutiliza a pessoa sem `isAdmin` e não sobrescreve nem
  duplica o cadastro

### Cenário 4 — Login fictício de administrador existente

**Seed**

```bash
pnpm -C api seed -- auth:person-admin
```

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: local-auth-test-key' \
  --include \
  --data '{"googleSubject":"google-admin-001","name":"Ignored Admin","email":"ignored.admin@example.test","photoUrl":null}'
```

- Given: existe `Person` com `isAdmin: true`
- When: o bypass é executado novamente
- Then: responde `204`, preserva `isAdmin: true` e não sobrescreve nem duplica a
  pessoa

### Cenário 5 — Bypass bloqueado

**Seed:** não se aplica — a proteção interrompe antes do MongoDB.

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: invalid-key' \
  --data '{"googleSubject":"google-new-001","name":"Alex Runner","email":"alex.runner@example.test","photoUrl":null}'
```

- Given: a chave não corresponde
- When: chama o bypass
- Then: recebe `404` e nenhum cadastro ou cookie é criado

### Cenário 6 — Callback com state divergente

**Seed:** não se aplica — o fluxo termina antes da integração e do banco.

**cURL**

```bash
curl --request GET \
  --url 'http://localhost:4000/callback?code=fake-code&state=wrong-state&iss=https%3A%2F%2Faccounts.google.com&scope=email+profile+openid&authuser=0&prompt=consent' \
  --cookie 'dall_fit_oauth_state=expected-state; dall_fit_oauth_nonce=fake-nonce' \
  --include
```

- Given: query e cookie possuem states diferentes, e a query contém os metadados
  adicionais enviados pelo Google
- When: chama o callback
- Then: ignora os metadados adicionais, limpa cookies temporários e redireciona com
  erro genérico, sem chamar Google

O callback feliz real não possui cURL estático porque o código Google é de uso
único. Ele é validado manualmente pelo início do cenário 1; unitários substituem o
adapter e o E2E usa o cenário 2 para persistência e sessão.

## Regras de negócio cobertas por testes

| Regra                         | Teste unitário                            | Teste E2E                        | Mock ou fixture        |
| ----------------------------- | ----------------------------------------- | -------------------------------- | ---------------------- |
| state/nonce e claims válidas  | commands e `google-oauth.service.spec.ts` | divergência de state             | adapter Google mockado |
| primeiro cadastro             | `find-or-create-person.service.spec.ts`   | `auth.e2e-spec.ts`               | MongoDB efêmero        |
| concorrência/reutilização     | service e repository                      | `auth.e2e-spec.ts`               | índice único           |
| condição admin preservada     | `find-or-create-person.service.spec.ts`   | `auth.e2e-spec.ts`               | pessoa com `isAdmin`   |
| escalação pelo body rejeitada | DTO/ValidationPipe                        | `auth.e2e-spec.ts`               | body fictício          |
| bypass bloqueado              | guard                                     | `auth.e2e-spec.ts`               | chave fictícia         |
| sessão emitida                | `auth-session.service.spec.ts`            | cookie usado em endpoint privado | segredo fictício       |

## Fora do comportamento atual

- refresh token e APIs Google adicionais;
- atualização dos dados pessoais em logins posteriores;
- promoção ou revogação administrativa por endpoint;
- logout e revogação;
- bypass habilitado em produção.
