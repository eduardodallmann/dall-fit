# Endpoints da pessoa atual

## Objetivo funcional

Devolver a representação pública da pessoa vinculada à sessão válida, incluindo a
condição administrativa e suas configurações, e permitir que ela atualize somente
o próprio tema sem expor um CRUD geral de pessoas.

## Referências técnicas

| Papel      | Símbolo                                                                                                    | Responsabilidade               |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Guard      | [`SessionAuthGuard`](../../../src/auth/guards/session-auth.guard.ts)                                       | valida sessão e carrega pessoa |
| Service    | [`FindPersonByIdService`](../../../src/person/services/find-person-by-id.service.ts)                       | solicita a pessoa da sessão    |
| Repository | [`MongoPersonRepository`](../../../src/person/repositories/mongo-person.repository.ts)                     | carrega e mapeia o documento   |
| Decorator  | [`CurrentPerson`](../../../src/auth/decorators/current-person.ts)                                          | extrai a pessoa validada       |
| Controller | [`AuthController.getCurrentPerson`](../../../src/auth/controllers/auth.controller.ts)                      | chama o command                |
| Command    | [`GetCurrentPersonCommand`](../../../src/auth/commands/get-current-person.command.ts)                      | monta a resposta pública       |
| DTO        | [`UpdateCurrentPersonConfigsDto`](../../../src/auth/dto/update-current-person-configs.dto.ts)              | valida somente `theme`         |
| Command    | [`UpdateCurrentPersonConfigsCommand`](../../../src/auth/commands/update-current-person-configs.command.ts) | orquestra a atualização        |
| Service    | [`UpdatePersonThemeService`](../../../src/person/services/update-person-theme.service.ts)                  | atualiza o tema da sessão      |
| Saída      | [`CurrentPersonResponse`](../../../../packages/types/src/contracts.ts)                                     | contrato compartilhado         |

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

Toda `Person` pública contém `configs`. Quando o documento não possui tema, a API
devolve `configs: {}` sem gravar ou inferir um default; quando existe, devolve
`configs: { theme: "light" | "dark" }`.

### `PATCH /auth/me/configs`

- Autenticação: cookie `dall_fit_session` obrigatório; nenhum ID é aceito
- Entrada: exatamente `{ "theme": "light" | "dark" }`
- Saída: `{ data: Person }` atualizada
- Status: `200`, `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`
- Persistência: altera atomicamente somente `configs.theme` e `updatedAt`
- Idempotência: repetir o tema já salvo mantém o mesmo estado e não cria recurso

## Fluxo completo

### 1. Proteção — `SessionAuthGuard.canActivate`

O guard lê o cookie, chama `AuthSessionService` para validar o JWT e recebe o ID
técnico da pessoa. Depois chama `FindPersonByIdService`, que acessa
`MongoPersonRepository.findById`.

O repository mapeia os campos persistidos para `PersonEntity`. Ele inclui
`isAdmin: true` somente quando esse valor existe no documento; uma pessoa comum
permanece sem a chave. Também garante `configs: {}` para documentos novos ou
históricos sem configuração, preservando `theme` somente quando persistido. O
guard anexa a entidade ao request. Cookie ausente, token
inválido/expirado ou pessoa removida terminam com `401` antes do controller.

### 2. Entrada — `AuthController.getCurrentPerson`

`CurrentPerson` extrai a entidade já validada. O controller registra somente o ID
técnico, chama `GetCurrentPersonCommand.execute` e devolve o resultado do command.

### 3. Orquestração — `GetCurrentPersonCommand.execute`

O command mapeia explicitamente ID, nome, e-mail, foto, configs e timestamps, sem
expor `googleSubject`. Quando a entidade possui `isAdmin: true`, inclui a
propriedade; caso contrário, omite-a. Não há service, repository ou consulta
adicional para determinar autorização.

## Fluxo completo de `PATCH /auth/me/configs`

### 1. Proteção e validação

`SessionAuthGuard` valida a sessão e carrega a pessoa como no GET. O
`ValidationPipe` aplica `UpdateCurrentPersonConfigsDto`: body vazio, valor fora de
`light | dark` ou propriedade adicional termina com `400 VALIDATION_ERROR` antes
do command.

### 2. Entrada — `AuthController.updateCurrentPersonConfigs`

O controller registra somente ID técnico e nomes de campos, chama
`UpdateCurrentPersonConfigsCommand.execute` com a pessoa da sessão e o DTO e
devolve seu resultado.

### 3. Orquestração e persistência

`UpdateCurrentPersonConfigsCommand` prepara ID e tema para
`UpdatePersonThemeService`. O service chama exclusivamente
`MongoPersonRepository.updateTheme`, que usa uma única atualização por `_id`, com
`$set` em `configs.theme`, validators e retorno do documento atualizado; os
timestamps do schema atualizam `updatedAt`. O repository mapeia a entidade, o
service preserva a falha de pessoa removida como `401`, e o command monta a
`Person` pública completa sem `googleSubject`.

## Mapa de caminhos possíveis

| Caminho                 | Gatilho                              | Resultado                            | Efeitos                |
| ----------------------- | ------------------------------------ | ------------------------------------ | ---------------------- |
| pessoa comum            | sessão válida e pessoa sem `isAdmin` | `200` com `Person`, sem a chave      | nenhum                 |
| pessoa administradora   | sessão válida e `isAdmin: true`      | `200` com `Person` e `isAdmin: true` | nenhum                 |
| documento sem tema      | `configs.theme` ausente              | `200` com `configs: {}`              | nenhum                 |
| atualização válida      | tema `light` ou `dark`               | `200` com `Person` atualizada        | MongoDB                |
| atualização idempotente | tema igual ao persistido             | `200` com mesmo tema                 | `updatedAt` atualizado |
| body inválido           | vazio, valor inválido ou campo extra | `400 VALIDATION_ERROR`               | nenhum                 |
| cookie ausente          | sem sessão                           | `401 AUTHENTICATION_REQUIRED`        | nenhum                 |
| token inválido/expirado | falha JWT                            | `401 AUTHENTICATION_REQUIRED`        | nenhum                 |
| pessoa removida         | repository devolve vazio             | `401 AUTHENTICATION_REQUIRED`        | nenhum                 |
| MongoDB indisponível    | falha técnica ao carregar `Person`   | `500` genérico                       | nenhum                 |

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
- Then: recebe `200` com id, nome, e-mail, foto, timestamps e `configs: {}`, sem
  `isAdmin`
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

### Cenário 4 — Pessoa atual com tema explícito

**Seed**

```bash
pnpm -C api seed -- auth:person-theme-light
```

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-theme-cookie.txt \
  --data '{"googleSubject":"google-theme-light-001","name":"Theme Runner","email":"theme.runner@example.test","photoUrl":null}' \
&& curl --request GET \
  --url http://localhost:4000/auth/me \
  --cookie /tmp/dall-fit-theme-cookie.txt
```

- Given: a pessoa possui `configs.theme: light`
- When: chama `GET /auth/me`
- Then: recebe `200` com `data.configs.theme: light`
- Efeitos: nenhum

### Cenário 5 — Documento legado sem configs

**Seed**

```bash
pnpm -C api seed -- auth:person-legacy
```

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-legacy-cookie.txt \
  --data '{"googleSubject":"google-legacy-001","name":"Legacy Runner","email":"legacy.runner@example.test","photoUrl":null}' \
&& curl --request GET \
  --url http://localhost:4000/auth/me \
  --cookie /tmp/dall-fit-legacy-cookie.txt
```

- Given: o documento não possui `configs`
- When: chama `GET /auth/me`
- Then: recebe `200` com `data.configs: {}`
- Efeitos: o documento continua sem `configs`; não há backfill

### Cenário 6 — Atualizar tema da pessoa atual

**Seed**

```bash
pnpm -C api seed -- auth:person-theme-dark
```

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-theme-update-cookie.txt \
  --data '{"googleSubject":"google-theme-dark-001","name":"Theme Runner","email":"theme.runner@example.test","photoUrl":null}' \
&& curl --request PATCH \
  --url http://localhost:4000/auth/me/configs \
  --header 'content-type: application/json' \
  --cookie /tmp/dall-fit-theme-update-cookie.txt \
  --data '{"theme":"light"}'
```

- Given: a pessoa autenticada possui tema `dark`
- When: envia exatamente `{ "theme": "light" }`
- Then: recebe `200` com a `Person` pública e `configs.theme: light`
- Efeitos: somente `configs.theme` e `updatedAt` são alterados; repetir o mesmo
  request mantém o tema `light` e não cria documento

### Cenário 7 — Rejeitar body de configuração inválido

**Seed**

```bash
pnpm -C api seed -- auth:person-theme-dark
```

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: local-auth-test-key' \
  --cookie-jar /tmp/dall-fit-theme-invalid-cookie.txt \
  --data '{"googleSubject":"google-theme-dark-001","name":"Theme Runner","email":"theme.runner@example.test","photoUrl":null}' \
&& curl --request PATCH \
  --url http://localhost:4000/auth/me/configs \
  --header 'content-type: application/json' \
  --cookie /tmp/dall-fit-theme-invalid-cookie.txt \
  --data '{"theme":"system"}'
```

- Given: a sessão é válida e o tema persistido é `dark`
- When: envia valor inválido; body vazio e `{ "theme": "light", "extra": true }`
  seguem o mesmo caminho de validação
- Then: recebe `400 VALIDATION_ERROR`
- Efeitos: documento e `updatedAt` permanecem inalterados

### Cenário 8 — Atualização sem sessão

**Seed:** não se aplica — o guard interrompe antes do MongoDB.

**cURL**

```bash
curl --request PATCH \
  --url http://localhost:4000/auth/me/configs \
  --header 'content-type: application/json' \
  --data '{"theme":"dark"}'
```

- Given: nenhum cookie de sessão
- When: tenta atualizar o próprio tema
- Then: recebe `401 AUTHENTICATION_REQUIRED`
- Efeitos: nenhum

## Regras de negócio cobertas por testes

| Regra                          | Teste unitário                       | Teste E2E          | Fixture                   |
| ------------------------------ | ------------------------------------ | ------------------ | ------------------------- |
| mapeamento público comum/admin | `get-current-person.command.spec.ts` | `auth.e2e-spec.ts` | `Person` sem/com a chave  |
| promoção e revogação na sessão | guard reutiliza entidade             | `auth.e2e-spec.ts` | alteração do documento    |
| sessão ausente                 | `session-auth.guard.spec.ts`         | `auth.e2e-spec.ts` | sem cookie                |
| pessoa removida                | `session-auth.guard.spec.ts`         | `auth.e2e-spec.ts` | sessão seguida de remoção |
| configs explícita ou ausente   | `get-current-person.command.spec.ts` | `auth.e2e-spec.ts` | pessoa com tema/legado    |
| atualização e resposta pública | command e service próprios           | `auth.e2e-spec.ts` | tema claro/escuro         |
| idempotência e validação       | DTO pelo pipe                        | `auth.e2e-spec.ts` | body válido/inválido      |
