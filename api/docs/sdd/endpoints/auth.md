# Endpoints de autenticação

## Objetivo funcional

Iniciar e concluir OAuth Google com PKCE para a Web, trocar Google ID token por
Bearer no Android, criar sessões revogáveis isoladas por canal, entregar o segredo
anti-CSRF Web e encerrar cada sessão sem expor credenciais ou depender de estado
somente no processo da API.

## Referências técnicas

| Papel      | Símbolo                                                                                               | Responsabilidade                                   |
| ---------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Controller | [`AuthController`](../../../src/auth/controllers/auth.controller.ts)                                  | cookies, redirects, status e chamadas dos commands |
| Command    | [`StartGoogleLoginCommand`](../../../src/auth/commands/start-google-login.command.ts)                 | cria state, nonce, verifier e challenge            |
| Command    | [`CompleteGoogleLoginCommand`](../../../src/auth/commands/complete-google-login.command.ts)           | valida callback, sincroniza pessoa e cria sessão   |
| Command    | [`CreateNativeSessionCommand`](../../../src/auth/commands/create-native-session.command.ts)           | valida identidade e cria sessão Bearer             |
| Command    | [`LogoutCommand`](../../../src/auth/commands/logout.command.ts)                                       | revoga a sessão ativa                              |
| Service    | [`GoogleOAuthService`](../../../src/auth/services/google-oauth.service.ts)                            | URL Google, troca do código e validação OIDC       |
| Service    | [`AuthSessionService`](../../../src/auth/services/auth-session.service.ts)                            | JWT técnico, rotação e vínculo ao registro Redis   |
| Adapter    | [`SessionStoreService`](../../../src/redis/session-store.service.ts)                                  | sessão revogável com TTL absoluto                  |
| Proteção   | [`RateLimitGuard`](../../../src/auth/guards/rate-limit.guard.ts)                                      | quota distribuída e `Retry-After`                  |
| Proteção   | [`CsrfGuard`](../../../src/auth/guards/csrf.guard.ts)                                                 | token e Origin exatos                              |
| Proteção   | [`SessionAuthGuard`](../../../src/auth/guards/session-auth.guard.ts)                                   | resolve cookie ou Bearer sem ambiguidade           |
| Proteção   | [`OptionalNativeSessionGuard`](../../../src/auth/guards/optional-native-session.guard.ts)              | logout Bearer idempotente                          |
| Middleware | [`OAuthCallbackCookiesMiddleware`](../../../src/auth/middleware/oauth-callback-cookies.middleware.ts) | limpa cookies antes de guards e pipes              |

## Contrato HTTP resumido

### `GET /auth/google`

- público, top-level navigation e único início OAuth suportado;
- cria três cookies `HttpOnly` de no máximo dez minutos: state, nonce e PKCE
  verifier, todos `SameSite=Lax`;
- responde `302` para Google com PKCE S256;
- limite: 10 chamadas por 10 minutos e IP.

`POST /auth/google` não existe e responde `404`. Não há response compartilhada de
preparação da URL.

### `GET /callback`

- recebe os parâmetros Google, compara state em tempo constante, exige os três
  cookies temporários e valida o ID token;
- sincroniza nome, e-mail e foto somente quando mudaram, preservando
  `googleSubject`, `isAdmin`, configs e `createdAt`;
- cria sessão Redis antes de entregar cookie e redireciona a `/dash`;
- consentimento negado, callback incompleto/divergente, `invalid_grant`, ID token
  ausente e rejeição OIDC conhecida redirecionam a
  `/?authError=oauth_failed` sem cookie de sessão;
- erro inesperado do provedor, configuração, rede, timeout, resposta 5xx,
  MongoDB, Redis ou código responde `500 INTERNAL_SERVER_ERROR`, sem redirect e
  sem nova sessão;
- sempre limpa os três cookies temporários, inclusive em validação, rate limit e
  falha técnica; não limpa uma sessão preexistente;
- limite: 30 chamadas por 10 minutos e IP.

### `POST /auth/test-login`

- existe somente com flag explícita em local/teste fora de Vercel e CI;
- exige `x-auth-test-key` aleatória com pelo menos 32 bytes e body validado;
- cria a mesma sessão real usada pelo OAuth e responde `204`;
- limite: 5 chamadas por minuto e IP; fora do contexto responde `404`.

### `POST /auth/native/session`

- público e exclusivo da troca de identidade do aplicativo Android;
- aceita somente `{ "identityToken": string }`, com JSON estrito;
- valida o ID token pelo `GoogleOAuthService` para a audience exata do client
  Web/server configurado, além de assinatura, issuer, expiração, `sub`, nome,
  e-mail e `email_verified`;
- cria ou sincroniza a mesma pessoa usada pela Web e emite JWT com audience nativa
  e registro Redis `channel: native`;
- responde `201` com `tokenType: Bearer`, `accessToken`, `expiresAt` e `person`,
  além de `Cache-Control: no-store`, sem criar cookie;
- identidade inválida responde `401 GOOGLE_IDENTITY_INVALID`; erro técnico do
  Google ou infraestrutura segue o filtro global;
- limite: 10 chamadas por 10 minutos e IP, em bucket separado.

### `GET /auth/csrf`

- exige sessão Web ativa e pessoa ainda existente; Bearer nativo recebe
  `403 CSRF_NOT_AVAILABLE`;
- responde `200 { "data": { "token": "..." } }` e
  `Cache-Control: no-store`;
- limite: 30 chamadas por minuto e sessão+IP.

### `POST /auth/logout`

- sem sessão ou com cookie JWT inválido responde `204` e limpa cookies, de forma
  idempotente;
- com sessão Redis ativa exige `Origin` igual a `UI_URL` e `X-CSRF-Token` válido,
  revoga o `jti`, limpa os nomes atual e legado e responde `204`;
- limite: 30 chamadas por minuto e sessão+IP; sem sessão usa bucket anônimo por IP.

### `DELETE /auth/native/session`

- considera somente `Authorization: Bearer <token>` e nunca usa cookie para revogar
  a sessão nativa;
- Bearer nativo ativo tem o `jti` removido do Redis e recebe `204`;
- header ausente/malformado, JWT inválido/expirado ou sessão já revogada também
  recebe `204`, sem body, cookie ou indicação de existência;
- falha Redis ao verificar ou remover sessão potencialmente ativa responde
  `503 AUTHENTICATION_UNAVAILABLE`;
- limite: 30 chamadas por minuto e sessão+IP; sem sessão usa bucket anônimo por IP.

## Sessão e cookies

O JWT usa HS256 e exige `sub`, `jti`, `iss`, `aud`, `iat`, `exp` e `kid`. A Web usa
`AUTH_SESSION_AUDIENCE` e o Android usa `AUTH_NATIVE_SESSION_AUDIENCE`; ambos
compartilham chave, issuer e duração, mas não são intercambiáveis. O `kid`
seleciona somente a chave ativa ou a anterior dentro da janela configurada; chave
desconhecida, algoritmo diferente ou claim inválida recebe `401`. A validade
absoluta máxima é sete dias e não há renovação deslizante. Redis guarda apenas
canal, personId, CSRF e expiração sob o `jti`; o JWT bruto nunca é persistido.
Registro legado sem canal é inválido e exige novo login.

Local/teste usa `dall_fit_session`, `HttpOnly`, path `/`, `SameSite=Lax` e sem
`Secure`. Produção/preview usa `__Host-dall_fit_session`, `HttpOnly`, `Secure`,
host-only, path `/` e `SameSite=None` para o deploy cross-site vigente. Dataset
Redis perdido torna JWTs anteriores inativos; a aplicação não reconstrói sessão a
partir do token.

## Fluxo completo

1. `AuthController.startGoogleLogin` aplica `RateLimitGuard`, chama
   `StartGoogleLoginCommand`, grava os cookies temporários e redireciona.
2. O command gera valores criptograficamente aleatórios e chama
   `GoogleOAuthService.createAuthorizationUrl` com challenge S256, sem expor o
   verifier ao provedor.
3. No callback, `OAuthCallbackCookiesMiddleware` agenda a expiração dos três
   cookies temporários depois do parser e antes de rate limit, validação e
   controller. O controller entrega query e os valores já lidos ao
   `CompleteGoogleLoginCommand`. O command valida state, chama
   `GoogleOAuthService.exchangeCode`, `FindOrCreatePersonService` e
   `AuthSessionService.createSession` nessa ordem.
4. O service Google troca o código com verifier e valida assinatura, issuer Google,
   audience, nonce, e-mail verificado e claims obrigatórias. Somente falhas OAuth
   esperadas são traduzidas para `OAuthCallbackError`; as demais preservam o fluxo
   técnico até o filtro global.
5. O repository da pessoa atualiza atomicamente apenas dados de perfil realmente
   alterados. A condição administrativa e configurações nunca vêm do provedor.
6. `AuthSessionService` assina com a chave ativa e chama `SessionStoreService`; se
   o Redis rejeitar a gravação por timeout, memória ou indisponibilidade, nenhum
   cookie é entregue.
7. Endpoints privados usam `SessionAuthGuard`: JWT, registro Redis e pessoa MongoDB
   precisam existir. Indisponibilidade Redis produz erro técnico sanitizado; token
   ou registro ausente produz `401 AUTHENTICATION_REQUIRED`.
8. Mutações executam sessão, rate limit e CSRF antes do controller. Preflight
   CORS é atendido antes dos guards e não consome quota.
9. Na troca nativa, o controller valida o DTO e chama
   `CreateNativeSessionCommand`. O command chama validação Google,
   `FindOrCreatePersonService` e emissão `native` nessa ordem, monta a response e
   nunca entrega cookie ou token CSRF.
10. `SessionAuthGuard` rejeita cookie e Bearer simultâneos com
    `400 AUTH_TRANSPORT_AMBIGUOUS`; um único transporte precisa coincidir com a
    audience JWT e o canal Redis. `CsrfGuard` dispensa CSRF somente depois de uma
    sessão `native` integralmente validada.

## Uso operacional do Redis

Uma instância aquecida usa uma conexão ioredis compartilhada. Fila offline fica
desabilitada; connect/command timeout, retry e backoff são limitados. A conexão é
fechada no shutdown e anexada ao lifecycle oficial da Vercel quando aplicável.
Todas as chaves recebem namespace de local, teste, produção ou deployment de
preview. Produção/preview exigem `rediss://` e não usam fallback local.

Máximo de comandos Redis por request no caminho atual:

| Caminho                          |                     Comandos |
| -------------------------------- | ---------------------------: |
| início Google                    |                     1 `EVAL` |
| callback/test-login bem-sucedido |           1 `EVAL` + 1 `SET` |
| troca nativa bem-sucedida        |           1 `EVAL` + 1 `SET` |
| leitura autenticada              |                      1 `GET` |
| CSRF                             |           1 `GET` + 1 `EVAL` |
| mutação autenticada/admin        |           1 `GET` + 1 `EVAL` |
| logout com sessão                | 1 `GET` + 1 `EVAL` + 1 `DEL` |
| logout nativo com sessão         | 1 `GET` + 1 `EVAL` + 1 `DEL` |

Os limites por usuário protegem abuso, mas não representam a quota global do
provedor. Com teto atual de 100 ops/s, o acompanhamento deve considerar a soma de
todos os requests e manter margem abaixo desse valor e das 30 conexões. Sessões e
contadores são pequenos, possuem TTL e respeitam o dataset de 30 MB. O Redis deve
usar `noeviction`: erro de escrita por memória falha fechado e nunca remove sessão
ou contador silenciosamente.

## Mapa de caminhos possíveis

| Gatilho                            | Resultado                                 | Efeito                                            |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| OAuth válido                       | `302 /dash`                               | perfil criado/sincronizado, sessão Redis e cookie |
| callback esperado inválido         | `302 /?authError=oauth_failed`            | cookies temporários limpos                        |
| callback falha tecnicamente        | `500 INTERNAL_SERVER_ERROR`               | cookies temporários limpos; sem sessão/redirect   |
| sessão ativa                       | endpoint privado continua                 | Redis lido e pessoa relida no MongoDB             |
| JWT válido sem registro após reset | `401`                                     | nenhum estado reconstruído                        |
| mutação sem CSRF/Origin exato      | `403 CSRF_VALIDATION_FAILED`              | nenhum efeito de domínio                          |
| quota excedida                     | `429 RATE_LIMIT_EXCEEDED` + `Retry-After` | contador preservado; cookies do callback limpos   |
| Redis indisponível/saturado        | erro técnico sanitizado                   | proteção permanece ativa, sem fallback            |
| logout válido                      | `204`                                     | sessão removida e cookies limpos                  |
| logout sem sessão                  | `204`                                     | cookies limpos                                    |
| identidade Google nativa válida    | `201` + Bearer                            | pessoa sincronizada e sessão nativa criada        |
| identidade Google nativa inválida  | `401 GOOGLE_IDENTITY_INVALID`             | nenhum estado criado                              |
| Bearer nativo ativo                | endpoint privado continua                 | Redis e pessoa relidos                            |
| cookie e Bearer simultâneos        | `400 AUTH_TRANSPORT_AMBIGUOUS`            | nenhum domínio executado                          |
| logout nativo ativo ou inativo     | `204`                                     | sessão ativa removida quando existir              |

## Cenários detalhados

### Cenário 1 — Iniciar OAuth com PKCE

**Seed:** não se aplica — a etapa cria somente valores temporários.

```bash
curl --include --request GET \
  --url http://localhost:4000/auth/google \
  --cookie-jar /tmp/dall-fit-oauth-cookie.txt
```

- Given: Redis local disponível
- When: inicia o login
- Then: recebe `302`, três cookies `SameSite=Lax` e URL com
  `code_challenge_method=S256`

### Cenário 2 — Login local, CSRF e logout

**Seed**

```bash
pnpm -C api seed -- auth:person-existing
```

```bash
curl --request POST --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: <CHAVE_LOCAL_ALEATORIA>' \
  --cookie-jar /tmp/dall-fit-session.txt \
  --data '{"googleSubject":"google-existing-001","name":"Taylor Fit","email":"taylor.fit@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent --request GET --url http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-session.txt | jq --raw-output '.data.token')" \
&& curl --include --request POST --url http://localhost:4000/auth/logout \
  --header 'origin: http://localhost:3000' \
  --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-session.txt
```

- Given: bypass local explicit e sessão criada no Redis
- When: obtém CSRF e encerra a sessão
- Then: recebe `204`, o `jti` é removido e os cookies são limpos

### Cenário 3 — Callback com state divergente

**Seed:** não se aplica — a validação termina antes do MongoDB.

```bash
curl --include --request GET \
  --url 'http://localhost:4000/callback?code=fake-code&state=wrong-state' \
  --header 'cookie: dall_fit_oauth_state=expected-state; dall_fit_oauth_nonce=fake-nonce; dall_fit_oauth_code_verifier=fake-verifier'
```

- Given: state da query difere do cookie
- When: chama o callback
- Then: redireciona com erro genérico, limpa os três cookies e não cria sessão

### Cenário 4 — Rate limit distribuído

**Seed:** não se aplica — apenas o contador Redis é usado.

```bash
for attempt in $(seq 1 11); do
  curl --include --request GET --url http://localhost:4000/auth/google
done
```

- Given: as chamadas partem do mesmo IP dentro de dez minutos
- When: a décima primeira chamada é feita
- Then: recebe `429 RATE_LIMIT_EXCEEDED` e `Retry-After`

### Cenário 5 — Reset do dataset

**Seed:** não se aplica — exige ambiente efêmero isolado de teste; nunca execute
limpeza global no Redis publicado.

```bash
curl --request GET \
  --url http://localhost:4000/auth/me \
  --cookie /tmp/dall-fit-session-anterior-ao-reset.txt
```

- Given: o dataset efêmero foi reiniciado depois da emissão do cookie
- When: o cookie antigo acessa endpoint privado
- Then: recebe `401`; um novo login só funciona após novo `SET` bem-sucedido

### Cenário 6 — Falha técnica no callback

**Seed:** não se aplica — falhas de provedor e infraestrutura são isoladas por
mock unitário ou infraestrutura efêmera automatizada.

```bash
curl --include --request GET \
  --url 'http://localhost:4000/callback?error=temporarily_unavailable' \
  --header 'cookie: dall_fit_oauth_state=state; dall_fit_oauth_nonce=nonce; dall_fit_oauth_code_verifier=verifier'
```

- Given: o provedor devolve um erro fora da allowlist funcional
- When: chama o callback
- Then: recebe `500 INTERNAL_SERVER_ERROR`, sem `Location` e sem novo cookie de
  sessão, mas com os três cookies temporários expirados

### Cenário 7 — Google ID token nativo inválido

**Seed:** não se aplica — a validação da identidade termina antes de MongoDB ou da
criação da sessão Redis.

```bash
curl --include --request POST \
  --url http://localhost:4000/auth/native/session \
  --header 'content-type: application/json' \
  --data '{"identityToken":"invalid-local-google-id-token"}'
```

- Given: o token não é um ID token assinado pelo Google para o client Web/server
- When: solicita a troca nativa
- Then: recebe `401 GOOGLE_IDENTITY_INVALID`, sem cookie, pessoa ou sessão

O caminho válido depende de uma identidade emitida pelo Google e é coberto pelo E2E
com double no limite do provider. Tokens reais nunca são incorporados a seed,
fixture ou documentação.

### Cenário 8 — Bearer nativo em endpoint protegido

**Seed**

```bash
pnpm -C api seed -- auth:native-session
```

```bash
curl --include --request GET \
  --url http://localhost:4000/auth/me \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)"
```

- Given: pessoa e sessão nativa fictícias foram criadas no MongoDB e Redis locais
- When: o Bearer acessa uma leitura protegida
- Then: recebe `200` com a pessoa pública e nenhum cookie é necessário

### Cenário 9 — Transportes simultâneos

**Seed**

```bash
pnpm -C api seed -- auth:native-session
```

```bash
curl --include --request GET \
  --url http://localhost:4000/auth/me \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
  --header 'cookie: dall_fit_session=ambiguous-local-cookie'
```

- Given: a request contém cookie e Bearer, independentemente da validade individual
- When: acessa um endpoint protegido compartilhado
- Then: recebe `400 AUTH_TRANSPORT_AMBIGUOUS` antes de validar uma identidade

### Cenário 10 — Logout nativo idempotente

**Seed**

```bash
pnpm -C api seed -- auth:native-session
```

```bash
curl --include --request DELETE \
  --url http://localhost:4000/auth/native/session \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)" \
&& curl --include --request DELETE \
  --url http://localhost:4000/auth/native/session \
  --header "authorization: Bearer $(cat /tmp/dall-fit-native-session-token.txt)"
```

- Given: a primeira chamada recebe Bearer ativo e a segunda recebe o mesmo Bearer
  já revogado
- When: o logout nativo é repetido
- Then: ambas respondem `204`, sem body ou cookie; acessos posteriores recebem
  `401 AUTHENTICATION_REQUIRED`

## Cobertura automatizada

- unitários: PKCE, validação nativa Google, classificação de falhas, audiences e
  canais JWT/Redis, rotação, limpeza de cookies, resolução de transporte e guards;
- E2E serial com MongoDB e Redis efêmeros reais: sessões Web e nativa, CSRF por
  canal, ambiguidade, logouts, reset, rate limit, CORS e preflight em
  `api/test/auth.e2e-spec.ts`;
- Playwright cobre somente a jornada da UI; o consentimento Google real permanece
  manual porque exige serviço e conta externos.
