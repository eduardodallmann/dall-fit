# Endpoint `GET /`

## Objetivo funcional

Confirmar que a API está disponível somente para uma pessoa com sessão válida.

## Referências técnicas

| Papel      | Símbolo                                                              | Responsabilidade neste fluxo         |
| ---------- | -------------------------------------------------------------------- | ------------------------------------ |
| Proteção   | [`Authenticated`](../../../src/auth/decorators/authenticated.ts)     | Aplica o guard de sessão             |
| Guard      | [`SessionAuthGuard`](../../../src/auth/guards/session-auth.guard.ts) | Valida sessão e existência da pessoa |
| Controller | [`AppController`](../../../src/app.controller.ts)                    | Recebe `GET /` e chama o command     |
| Command    | [`GetRootCommand`](../../../src/commands/get-root.command.ts)        | Monta a resposta estática            |
| Saída      | `string`                                                             | Texto devolvido ao consumidor        |

## Contrato HTTP resumido

- Método e path: `GET /`
- Autenticação: cookie `dall_fit_session` obrigatório
- Autorização/permissões: pessoa autenticada; sem papéis adicionais
- Entrada: não se aplica
- Saída: `string`
- Status de sucesso: `200 OK`
- Erro funcional: `401 AUTHENTICATION_REQUIRED`
- Dados sensíveis: cookie de sessão, nunca incluído na resposta ou logs
- Idempotência: GET seguro e idempotente

## Fluxo completo

### 1. Proteção — `SessionAuthGuard.canActivate`

O guard registra apenas presença do cookie, valida o JWT por
`AuthSessionService`, registra o resultado sanitizado, busca a pessoa pelo ID por
`FindPersonByIdService` e anexa a entidade ao request. Cookie, JWT e dados pessoais
ficam ocultos.

Nos branches cookie ausente, token inválido/expirado ou pessoa inexistente, registra
o código seguro e lança `401 AUTHENTICATION_REQUIRED` antes do controller.

### 2. Entrada — `AppController.getRoot`

O controller registra parâmetros vazios, chama `GetRootCommand.execute`, registra o
retorno do command e sua própria saída e devolve o texto.

### 3. Orquestração — `GetRootCommand.execute`

O command registra parâmetros vazios, monta `Hello World!`, registra a saída e a
devolve. Não há service de domínio ou repository neste trecho porque a única regra
do conteúdo é estática; autenticação já foi resolvida pelo guard transversal.

## Mapa de caminhos possíveis

| Caminho         | Gatilho                | Sequência interna                          | Resultado | Efeitos |
| --------------- | ---------------------- | ------------------------------------------ | --------- | ------- |
| Sessão válida   | cookie válido e pessoa | Guard → Controller → Command               | `200`     | Nenhum  |
| Sessão ausente  | sem cookie             | Guard interrompe                           | `401`     | Nenhum  |
| Sessão inválida | JWT inválido/expirado  | Guard → AuthSessionService → interrupção   | `401`     | Nenhum  |
| Pessoa removida | ID do JWT não existe   | Guard → FindPersonByIdService → repository | `401`     | Nenhum  |

## Cenários detalhados

### Cenário 1 — Pessoa autenticada

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
  --url http://localhost:4000/ \
  --cookie /tmp/dall-fit-cookie.txt
```

- Given: o bypass local está habilitado e a fixture existe
- When: o login fictício cria a sessão e o consumidor chama `GET /`
- Then: recebe `200` e `Hello World!`
- Efeitos colaterais: o login reutiliza a pessoa; o GET não possui efeitos

### Cenário 2 — Sessão ausente

**Seed:** não se aplica — o caminho termina antes de consultar MongoDB.

**cURL**

```bash
curl --request GET \
  --url http://localhost:4000/
```

- Given: o request não possui cookie
- When: chama `GET /`
- Then: recebe `401` com código `AUTHENTICATION_REQUIRED`
- Efeitos: controller e command não são executados

## Observabilidade e segurança

| Ordem | Classe e método                | Mensagem textual exata                                             | Dados sanitizados          | Dados ocultados |
| ----: | ------------------------------ | ------------------------------------------------------------------ | -------------------------- | --------------- |
|     1 | `SessionAuthGuard.canActivate` | `SessionAuthGuard -> canActivate -> params:`                       | presença do cookie e path  | cookie/JWT      |
|     2 | `SessionAuthGuard.canActivate` | `SessionAuthGuard -> canActivate -> authSessionService return:`    | ID técnico                 | token           |
|     3 | `SessionAuthGuard.canActivate` | `SessionAuthGuard -> canActivate -> findPersonByIdService return:` | encontrado e ID técnico    | dados pessoais  |
|     4 | `AppController.getRoot`        | `AppController -> getRoot -> params:`                              | objeto vazio               | não se aplica   |
|     5 | `AppController.getRoot`        | `AppController -> getRoot -> getRootCommand return:`               | tipo e tamanho da resposta | não se aplica   |
|     6 | `GetRootCommand.execute`       | `GetRootCommand -> execute -> return:`                             | tipo e tamanho da resposta | não se aplica   |
|     7 | `AppController.getRoot`        | `AppController -> getRoot -> return:`                              | tipo e tamanho da resposta | não se aplica   |

Branches de rejeição usam `SessionAuthGuard -> canActivate -> <motivo> error:` com
somente o código estável.

## Regras de negócio cobertas por testes

| Regra                          | Teste unitário                     | Teste E2E          | Mock ou fixture |
| ------------------------------ | ---------------------------------- | ------------------ | --------------- |
| resposta após autenticação     | `app.controller.spec.ts` e command | `auth.e2e-spec.ts` | pessoa MongoDB  |
| ausência de sessão é rejeitada | `session-auth.guard.spec.ts`       | `auth.e2e-spec.ts` | sem cookie      |
