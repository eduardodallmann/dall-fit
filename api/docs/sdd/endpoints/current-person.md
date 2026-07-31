# Endpoint `GET /auth/me`

## Objetivo funcional

Devolver a representação pública da pessoa vinculada à sessão válida, incluindo a
condição administrativa quando presente, para proteger rotas e exibir seu perfil.

## Referências técnicas

| Papel      | Símbolo                                                                                | Responsabilidade               |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| Guard      | [`SessionAuthGuard`](../../../src/auth/guards/session-auth.guard.ts)                   | valida sessão e carrega pessoa |
| Service    | [`FindPersonByIdService`](../../../src/person/services/find-person-by-id.service.ts)   | solicita a pessoa da sessão    |
| Repository | [`MongoPersonRepository`](../../../src/person/repositories/mongo-person.repository.ts) | carrega e mapeia o documento   |
| Decorator  | [`CurrentPerson`](../../../src/auth/decorators/current-person.ts)                      | extrai a pessoa validada       |
| Controller | [`AuthController.getCurrentPerson`](../../../src/auth/controllers/auth.controller.ts)  | chama o command                |
| Command    | [`GetCurrentPersonCommand`](../../../src/auth/commands/get-current-person.command.ts)  | monta a resposta pública       |
| Saída      | [`CurrentPersonResponse`](../../../../packages/types/src/contracts.ts)                 | contrato compartilhado         |

## Contrato HTTP resumido

- Método e path: `GET /auth/me`
- Autenticação: cookie `dall_fit_session` obrigatório
- Autorização: pessoa da sessão ainda existente; o endpoint não exige
  administrador
- Entrada: não se aplica
- Saída comum: `{ data: Person }`, sem `isAdmin`
- Saída administrativa: `{ data: Person }`, com `isAdmin: true`
- Status: `200`, `401 AUTHENTICATION_REQUIRED`
- Dados sensíveis: nome, e-mail e foto aparecem somente na resposta autorizada
- Idempotência: GET seguro e idempotente

`Person.isAdmin` é opcional e aceita somente `true`. Sua ausência representa
implicitamente uma pessoa não administradora no backend e no frontend; a resposta
nunca materializa `isAdmin: false`.

## Fluxo completo

### 1. Proteção — `SessionAuthGuard.canActivate`

O guard lê o cookie, chama `AuthSessionService` para validar o JWT e recebe o ID
técnico da pessoa. Depois chama `FindPersonByIdService`, que acessa
`MongoPersonRepository.findById`.

O repository mapeia os campos persistidos para `PersonEntity`. Ele inclui
`isAdmin: true` somente quando esse valor existe no documento; uma pessoa comum
permanece sem a chave. O guard anexa a entidade ao request. Cookie ausente, token
inválido/expirado ou pessoa removida terminam com `401` antes do controller.

### 2. Entrada — `AuthController.getCurrentPerson`

`CurrentPerson` extrai a entidade já validada. O controller registra somente o ID
técnico, chama `GetCurrentPersonCommand.execute` e devolve o resultado do command.

### 3. Orquestração — `GetCurrentPersonCommand.execute`

O command mapeia explicitamente ID, nome, e-mail, foto e timestamps, sem expor
`googleSubject`. Quando a entidade possui `isAdmin: true`, inclui a propriedade;
caso contrário, omite-a. Não há service, repository ou consulta adicional para
determinar autorização.

## Mapa de caminhos possíveis

| Caminho                 | Gatilho                              | Resultado                            | Efeitos |
| ----------------------- | ------------------------------------ | ------------------------------------ | ------- |
| pessoa comum            | sessão válida e pessoa sem `isAdmin` | `200` com `Person`, sem a chave      | nenhum  |
| pessoa administradora   | sessão válida e `isAdmin: true`      | `200` com `Person` e `isAdmin: true` | nenhum  |
| cookie ausente          | sem sessão                           | `401 AUTHENTICATION_REQUIRED`        | nenhum  |
| token inválido/expirado | falha JWT                            | `401 AUTHENTICATION_REQUIRED`        | nenhum  |
| pessoa removida         | repository devolve vazio             | `401 AUTHENTICATION_REQUIRED`        | nenhum  |
| MongoDB indisponível    | falha técnica ao carregar `Person`   | `500` genérico                       | nenhum  |

Promoção e revogação são operações externas a este endpoint. Como o guard relê
`Person` em cada request, adicionar `isAdmin: true` ou remover a chave passa a ser
observado na próxima chamada sem substituir a sessão.

## Cenários detalhados

### Cenário 1 — Pessoa atual não administradora

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
  --cookie-jar /tmp/dall-fit-cookie.txt \
  --data '{"googleSubject":"google-existing-001","name":"Taylor Fit","email":"taylor.fit@example.test","photoUrl":"https://example.test/avatar.png"}' \
&& curl --request GET \
  --url http://localhost:4000/auth/me \
  --cookie /tmp/dall-fit-cookie.txt
```

- Given: a fixture existe sem `isAdmin` e a sessão local é válida
- When: chama `GET /auth/me`
- Then: recebe `200` com id, nome, e-mail, foto e timestamps, sem `isAdmin`
- Efeitos: nenhum

### Cenário 2 — Pessoa atual administradora

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
  --cookie-jar /tmp/dall-fit-admin-cookie.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":"https://example.test/admin-avatar.png"}' \
&& curl --request GET \
  --url http://localhost:4000/auth/me \
  --cookie /tmp/dall-fit-admin-cookie.txt
```

- Given: a fixture possui `isAdmin: true` e a sessão local é válida
- When: chama `GET /auth/me`
- Then: recebe `200` com os dados públicos e `isAdmin: true`
- Efeitos: nenhum

### Cenário 3 — Sessão ausente

**Seed:** não se aplica — o guard interrompe antes do MongoDB.

**cURL**

```bash
curl --request GET \
  --url http://localhost:4000/auth/me
```

- Given: nenhum cookie
- When: chama o endpoint
- Then: recebe `401` com `AUTHENTICATION_REQUIRED`

## Regras de negócio cobertas por testes

| Regra                          | Teste unitário                       | Teste E2E          | Fixture                   |
| ------------------------------ | ------------------------------------ | ------------------ | ------------------------- |
| mapeamento público comum/admin | `get-current-person.command.spec.ts` | `auth.e2e-spec.ts` | `Person` sem/com a chave  |
| promoção e revogação na sessão | guard reutiliza entidade             | `auth.e2e-spec.ts` | alteração do documento    |
| sessão ausente                 | `session-auth.guard.spec.ts`         | `auth.e2e-spec.ts` | sem cookie                |
| pessoa removida                | `session-auth.guard.spec.ts`         | `auth.e2e-spec.ts` | sessão seguida de remoção |
