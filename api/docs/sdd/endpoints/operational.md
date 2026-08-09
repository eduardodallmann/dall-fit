# Probes operacionais

## Objetivo funcional

Expor liveness do processo e readiness das dependências obrigatórias sem exigir
autenticação, consumir rate limit ou revelar detalhes internos.

## Referências técnicas

| Papel      | Símbolo                                                                                   | Responsabilidade                                   |
| ---------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Controller | [`OperationalController`](../../../src/operational/controllers/operational.controller.ts) | recebe os dois GETs e chama o command proprietário |
| Command    | [`GetLivenessCommand`](../../../src/operational/commands/get-liveness.command.ts)         | monta a resposta estática de liveness              |
| Command    | [`GetReadinessCommand`](../../../src/operational/commands/get-readiness.command.ts)       | orquestra a consulta de readiness                  |
| Service    | [`ReadinessService`](../../../src/operational/services/readiness.service.ts)              | executa os indicadores pelo Terminus               |
| Indicador  | [`MongoHealthIndicator`](../../../src/operational/indicators/mongo-health.indicator.ts)   | executa ping real pela conexão Mongoose vigente    |
| Indicador  | [`RedisHealthIndicator`](../../../src/operational/indicators/redis-health.indicator.ts)   | traduz o PING do singleton Redis em up/down        |
| Adapter    | [`RedisClientService`](../../../src/redis/redis-client.service.ts)                        | usa a conexão ioredis compartilhada                |

## Contrato HTTP resumido

### `GET /health`

- público, sem autenticação, CSRF, rate limit ou consulta a dependência;
- responde sempre `200 { "status": "ok" }` enquanto o processo atende HTTP;
- não inclui estado de MongoDB ou Redis.

### `GET /ready`

- público, sem autenticação, CSRF ou rate limit;
- pinga somente `mongodb` e `redis`, com espera finita;
- em sucesso responde `200` no formato `HealthCheckResult` do Terminus, com
  exatamente esses dois indicadores em `details`, ambos `up`;
- MongoDB ou Redis indisponível, timeout ou shutdown responde o `ApiError`
  genérico `503 SERVICE_UNAVAILABLE`; a response nunca expõe o resultado detalhado
  do Terminus.

Ambos devolvem `x-request-id`. O root técnico anterior foi removido: `GET /` não
possui controller, command, autenticação ou efeito e responde o 404 global
`RESOURCE_NOT_FOUND`.

## Fluxo completo

### Liveness

`OperationalController.getLiveness` chama `GetLivenessCommand.execute`. O command
monta `{ status: "ok" }` sem chamar service, MongoDB ou Redis, e o controller
devolve essa resposta.

### Readiness

`OperationalController.getReadiness` chama `GetReadinessCommand.execute`, que
delega a `ReadinessService.check`. O service entrega duas funções ao
`HealthCheckService`: uma chama `MongoHealthIndicator.check`, que executa o comando
`ping` pela conexão Mongoose já injetada, e outra chama
`RedisHealthIndicator.check`. Os dois indicadores limitam a espera do probe a um
segundo. O indicador Redis usa
`RedisClientService.ping`, portanto não cria conexão, pool ou client paralelo; o
timeout próprio da readiness ainda preserva os limites internos do ioredis.

Quando ambos respondem, Terminus monta o resultado saudável e ele retorna pelo
command e controller. Indicador down ou estado de shutdown faz Terminus produzir
503; o filtro global descarta seus detalhes e monta somente o `ApiError` público.

## Mapa de caminhos possíveis

| Caminho              | Gatilho                       | Resultado                          | Efeito |
| -------------------- | ----------------------------- | ---------------------------------- | ------ |
| processo vivo        | `GET /health`                 | `200 { status: "ok" }`             | nenhum |
| dependências prontas | MongoDB e Redis respondem     | `200`, ambos indicadores `up`      | PINGs  |
| MongoDB indisponível | erro ou timeout no ping       | `503 SERVICE_UNAVAILABLE` genérico | nenhum |
| Redis indisponível   | erro ou timeout no PING       | `503 SERVICE_UNAVAILABLE` genérico | nenhum |
| encerramento         | shutdown hook já foi acionado | `503 SERVICE_UNAVAILABLE` genérico | nenhum |
| root removido        | `GET /`                       | `404 RESOURCE_NOT_FOUND`           | nenhum |

## Cenários detalhados

### Cenário 1 — Liveness

**Seed:** não se aplica — nenhuma dependência é consultada.

```bash
curl --include --request GET --url http://localhost:4000/health
```

- Given: o processo aceita HTTP
- When: chama liveness
- Then: recebe `200`, body exato e `x-request-id`

### Cenário 2 — Readiness saudável

**Seed:** não se aplica — o cenário exige somente MongoDB e Redis locais ativos.

```bash
curl --include --request GET --url http://localhost:4000/ready
```

- Given: as conexões existentes de MongoDB e Redis respondem dentro do limite
- When: chama readiness
- Then: recebe `200` e somente `mongodb`/`redis` como indicadores `up`

### Cenário 3 — Dependência indisponível

**Seed:** não se aplica — a indisponibilidade é reproduzida pelas infraestruturas
efêmeras isoladas da suíte E2E; não desligue uma dependência compartilhada.

```bash
curl --include --request GET --url http://localhost:4000/ready
```

- Given: MongoDB ou Redis isolado foi encerrado
- When: chama readiness
- Then: recebe `503 SERVICE_UNAVAILABLE` sem nomes, causas ou payload do indicador

### Cenário 4 — Root removido

**Seed:** não se aplica — não há domínio ou persistência.

```bash
curl --include --request GET --url http://localhost:4000/
```

- Given: a aplicação está iniciada
- When: chama o path sem endpoint
- Then: recebe `404 RESOURCE_NOT_FOUND`, sem autenticação

## Cobertura automatizada

- unitários dos commands, controller, service e indicadores MongoDB/Redis em
  `api/src/operational/operational.spec.ts`;
- contrato transversal, logger, correlação e filtro em
  `api/src/observability/*.spec.ts`;
- sucesso real em `api/test/auth.e2e-spec.ts` e indisponibilidade isolada de cada
  dependência em `api/test/operational.e2e-spec.ts`.
