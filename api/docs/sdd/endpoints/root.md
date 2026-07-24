# Endpoint `GET /`

## Objetivo funcional

Confirmar que o scaffold inicial da aplicação responde a uma chamada HTTP.

Este é um endpoint técnico temporário e não representa a arquitetura exigida para
endpoints de produto.

## Referências técnicas

| Papel      | Símbolo                                           | Responsabilidade neste fluxo                                       |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Controller | [`AppController`](../../../src/app.controller.ts) | Recebe `GET /` e devolve o resultado                               |
| Command    | Não existe no scaffold atual                      | Exceção temporária; novos endpoints não podem repetir esse formato |
| Service    | [`AppService`](../../../src/app.service.ts)       | Produz a mensagem estática                                         |
| Saída      | `string`                                          | Texto simples devolvido ao consumidor                              |

## Contrato HTTP resumido

- Método e path: `GET /`
- Autenticação: não se aplica no scaffold atual
- Entrada: não se aplica
- Saída: `string`
- Status: `200 OK`
- Idempotência: o GET é seguro e idempotente

## Fluxo completo atual

### 1. Entrada — `AppController`

O Nest direciona `GET /` para `AppController.getHello`. Como não existem parâmetros,
body ou headers de negócio, não há entrada para validar.

O controller atual não registra log explícito. Essa ausência pertence ao scaffold e
é uma exceção temporária a
[`06-logging-e-rastreabilidade.md`](../base/06-logging-e-rastreabilidade.md).

### 2. Chamada direta ao `AppService`

O controller chama diretamente `AppService.getHello`. Não existe command, branch ou
orquestração porque o scaffold apenas devolve um valor estático.

Essa chamada direta é uma exceção documentada e temporária. Quando o endpoint for
removido ou transformado em comportamento de produto, deverá receber um command e
seguir `../base/01-arquitetura.md`.

### 3. Saída

`AppService.getHello` devolve `Hello World!`. O controller retorna esse texto, e o
Nest responde com status `200`.

Não há repository, MongoDB, Redis, mensageria ou serviço externo nesse fluxo.

### 4. Exceção de logging

`AppController.getHello` e `AppService.getHello` ainda não registram entrada,
retorno da dependência ou saída e usam retornos diretos. O endpoint técnico foi
criado antes da política de logging e permanece como exceção documentada porque
esta demanda não altera código.

Qualquer mudança futura nesses métodos deve remover a exceção e aplicar
integralmente o padrão de entrada, retorno da dependência e saída antes de devolver
o valor.

## Mapa de caminhos possíveis

| Caminho              | Gatilho         | Sequência interna    | Resultado                | Efeitos |
| -------------------- | --------------- | -------------------- | ------------------------ | ------- |
| Aplicação disponível | Chamada `GET /` | Controller → Service | `200` com `Hello World!` | Nenhum  |

Não existem validações, branches ou erros funcionais definidos. Falhas de bootstrap
ou infraestrutura acontecem fora do comportamento deste endpoint.

## Cenários detalhados

### Cenário 1 — Aplicação disponível

**Seed:** não se aplica — o endpoint não consulta MongoDB, Redis ou qualquer estado
prévio.

**cURL**

```bash
curl --request GET \
  --url http://localhost:4000/
```

- Given: a API foi iniciada com sucesso
- When: o consumidor chama `GET /`
- Sequência interna:
  1. `AppController` recebe a chamada
  2. `AppController` chama `AppService`
  3. `AppService` devolve a mensagem estática
- Then: o consumidor recebe status `200` e o texto `Hello World!`
- Efeitos colaterais: não se aplica
- Logs: não se aplica nesta versão — exceção técnica documentada acima

## Regras cobertas por testes

| Regra                                      | Teste                                                           |
| ------------------------------------------ | --------------------------------------------------------------- |
| O controller devolve a mensagem do service | [`app.controller.spec.ts`](../../../src/app.controller.spec.ts) |
| A aplicação responde via HTTP              | [`app.e2e-spec.ts`](../../../test/app.e2e-spec.ts)              |
