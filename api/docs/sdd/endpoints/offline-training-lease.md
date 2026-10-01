# Endpoints de lease offline de treino

## Objetivo funcional

`PUT /training/offline-lease` registra idempotentemente uma instalação Android
como editora offline da pessoa autenticada. `POST
/training/offline-lease/takeover` transfere explicitamente essa concessão de outra
instalação. Existe um único lease por pessoa e ele autoriza snapshots dos vários
planos preparados; não existe vínculo do lease com um plano singular.

## Hierarquia e contratos

O fluxo é `OfflineTrainingLeaseController` →
`RegisterOfflineTrainingLeaseCommand | TakeoverOfflineTrainingLeaseCommand` →
`PersonalTrainingPlanService` e `OfflineTrainingLeaseService`. O command exige ao
menos um plano ativo antes de acessar Redis. O controller valida exclusivamente
`installationId` UUID v4 e devolve `OfflineTrainingLeaseResponse`.

A resposta contém `leaseId`, `expiresAt` e `state`, cujo valor é `created`,
`unchanged` ou `taken-over`. Pessoa, instalação e plano não atravessam a fronteira
pública. Os endpoints aceitam somente sessão nativa Bearer; cookie Web, transportes
mistos, origem ou CSRF não concedem acesso.

## Persistência e atomicidade

`OfflineTrainingLeaseService` usa a chave Redis namespaced
`offline-training-lease:<personId>`. O valor interno contém `personId`,
`installationId`, `leaseId` e `expiresAt`. Um script Lua cria a concessão com
`PXAT`, devolve o valor existente para a mesma instalação, exige takeover para
instalação diferente ou troca o fence quando o takeover foi confirmado.

Validação e renovação comparam pessoa, instalação e `leaseId`; o plano do snapshot
é validado pelo contrato de conteúdo, não pelo lease. Apenas uma revisão nova de
snapshot aceita renova atomicamente o valor por sete dias. Duplicatas e falhas não
renovam. Ausência gera `OFFLINE_LEASE_EXPIRED`; divergência gera
`OFFLINE_LEASE_REVOKED`. Falha fechada de Redis produz `503
OFFLINE_LEASE_UNAVAILABLE`.

## Caminhos

| Caminho | Gatilho | Resultado | Efeito |
| --- | --- | --- | --- |
| criação | nenhum lease e ao menos um ativo | `200 created` | fence novo por sete dias |
| repetição | mesma instalação | `200 unchanged` | preserva fence e vencimento |
| mudança de ativos | mesma instalação | `200 unchanged` | lease independe dos planos |
| disputa | instalação diferente | `409 OFFLINE_LEASE_TAKEOVER_REQUIRED` | preserva atual |
| takeover | confirmação por instalação diferente | `200 taken-over` | novo fence |
| sem ativos | conjunto vazio | `404 ACTIVE_TRAINING_PLAN_NOT_FOUND` | Redis não é acessado |
| body inválido | UUID ausente ou inválido | `400 VALIDATION_ERROR` | command não é acessado |

Todas as respostas usam `Cache-Control: private, no-store`. Logs registram somente
estado e categoria; pessoa, instalação, chave Redis e fence não são registrados.

## Cenários reproduzíveis

### Criação e repetição

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:create
```

**cURL completo**

```bash
TOKEN='<TOKEN_NATIVE_DO_SEED>'
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer ${TOKEN}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"11111111-1111-4111-8111-111111111111"}'
```

Sem lease, retorna `created`; a repetição pela mesma instalação retorna
`unchanged` com o mesmo `leaseId`.

### Takeover necessário

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:takeover-required
```

**cURL completo**

```bash
TOKEN='<TOKEN_NATIVE_DO_SEED>'
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer ${TOKEN}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"22222222-2222-4222-8222-222222222222"}'
```

Retorna `409 OFFLINE_LEASE_TAKEOVER_REQUIRED` sem expor a instalação atual.

### Takeover confirmado

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:takeover
```

**cURL completo**

```bash
TOKEN='<TOKEN_NATIVE_DO_SEED>'
curl --include --request POST http://localhost:4000/training/offline-lease/takeover \
  --header "authorization: Bearer ${TOKEN}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"22222222-2222-4222-8222-222222222222"}'
```

Retorna `taken-over` com fence novo; snapshots do fence anterior passam a ser
revogados.

### Sem plano ativo

**Seed**

```bash
pnpm -C api seed -- offline-training-lease:no-active-plan
```

**cURL completo**

```bash
TOKEN='<TOKEN_NATIVE_DO_SEED>'
curl --include --request PUT http://localhost:4000/training/offline-lease \
  --header "authorization: Bearer ${TOKEN}" \
  --header 'content-type: application/json' \
  --data '{"installationId":"11111111-1111-4111-8111-111111111111"}'
```

Retorna `404 ACTIVE_TRAINING_PLAN_NOT_FOUND` antes de acessar Redis.

## Cobertura

- unitários cobrem as transições Lua, falha fechada, ausência de ativos e tradução
  HTTP;
- E2E usa Redis real efêmero e comprova idempotência, mudança do conjunto ativo
  sem rebind, takeover, TTL e autenticação nativa;
- a ingestão proprietária e os fences estão documentados em
  [`offline-training-snapshot.md`](offline-training-snapshot.md).

## Fora do escopo

- múltiplos leases simultâneos por pessoa;
- renovação por leitura ou repetição;
- histórico ou tombstone de lease no MongoDB;
- escolha de plano persistida no lease.
