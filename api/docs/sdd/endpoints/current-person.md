# Endpoint `GET /auth/me`

## Objetivo funcional

Devolver a representação pública da pessoa vinculada à sessão válida para proteger
rotas e exibir seu perfil.

## Referências técnicas

| Papel      | Símbolo                                                                               | Responsabilidade               |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| Guard      | [`SessionAuthGuard`](../../../src/auth/guards/session-auth.guard.ts)                  | valida sessão e carrega pessoa |
| Decorator  | [`CurrentPerson`](../../../src/auth/decorators/current-person.ts)                     | extrai a pessoa validada       |
| Controller | [`AuthController.getCurrentPerson`](../../../src/auth/controllers/auth.controller.ts) | chama o command                |
| Command    | [`GetCurrentPersonCommand`](../../../src/auth/commands/get-current-person.command.ts) | monta resposta pública         |
| Saída      | [`CurrentPersonResponse`](../../../../packages/types/src/contracts.ts)                | contrato compartilhado         |

## Contrato HTTP resumido

- Método e path: `GET /auth/me`
- Autenticação: cookie `dall_fit_session` obrigatório
- Autorização: pessoa da sessão ainda existente
- Entrada: não se aplica
- Saída: `{ data: Person }`
- Status: `200`, `401 AUTHENTICATION_REQUIRED`
- Dados sensíveis: nome, e-mail e foto aparecem somente na resposta autorizada;
  nunca nos logs
- Idempotência: GET seguro e idempotente

## Fluxo completo

`SessionAuthGuard` executa o mesmo fluxo documentado no endpoint raiz: valida cookie
e JWT, chama `FindPersonByIdService`, que usa `MongoPersonRepository`, e anexa a
entidade ao request. Qualquer falha funcional termina com `401`.

`AuthController.getCurrentPerson` registra somente o ID técnico, chama
`GetCurrentPersonCommand.execute`, registra um resumo dos campos presentes e
devolve a resposta. O command mapeia explicitamente os campos públicos, sem
`googleSubject`, registra somente ID e nomes de campos e retorna
`CurrentPersonResponse`.

## Mapa de caminhos possíveis

| Caminho                 | Gatilho                           | Resultado          | Efeitos |
| ----------------------- | --------------------------------- | ------------------ | ------- |
| sucesso                 | sessão válida e pessoa encontrada | `200` com `Person` | nenhum  |
| cookie ausente          | sem sessão                        | `401`              | nenhum  |
| token inválido/expirado | falha JWT                         | `401`              | nenhum  |
| pessoa removida         | repository devolve vazio          | `401`              | nenhum  |
| MongoDB indisponível    | falha técnica                     | `500` genérico     | nenhum  |

## Cenários detalhados

### Cenário 1 — Pessoa atual

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

- Given: pessoa fixture e sessão local válida
- When: chama `GET /auth/me`
- Then: recebe `200` com id, nome, e-mail, foto e timestamps da pessoa
- Efeitos: nenhum

### Cenário 2 — Sessão ausente

**Seed:** não se aplica — o guard interrompe antes do MongoDB.

**cURL**

```bash
curl --request GET \
  --url http://localhost:4000/auth/me
```

- Given: nenhum cookie
- When: chama o endpoint
- Then: recebe `401` com `AUTHENTICATION_REQUIRED`

## Observabilidade e segurança

Sequência normal:

1. `SessionAuthGuard -> canActivate -> params:`;
2. `SessionAuthGuard -> canActivate -> authSessionService return:`;
3. `FindPersonByIdService -> execute -> personRepository return:`;
4. `SessionAuthGuard -> canActivate -> findPersonByIdService return:`;
5. `AuthController -> getCurrentPerson -> params:`;
6. `GetCurrentPersonCommand -> execute -> response prepared:`;
7. `GetCurrentPersonCommand -> execute -> return:`;
8. `AuthController -> getCurrentPerson -> getCurrentPersonCommand return:`;
9. `AuthController -> getCurrentPerson -> return:`.

Todos os dados estruturados ocultam cookie, token, nome, e-mail, foto e
`googleSubject`.

## Regras de negócio cobertas por testes

| Regra              | Teste unitário                       | Teste E2E          | Fixture                   |
| ------------------ | ------------------------------------ | ------------------ | ------------------------- |
| mapeamento público | `get-current-person.command.spec.ts` | `auth.e2e-spec.ts` | Person MongoDB            |
| sessão ausente     | guard                                | `auth.e2e-spec.ts` | sem cookie                |
| pessoa removida    | guard                                | `auth.e2e-spec.ts` | sessão seguida de remoção |
