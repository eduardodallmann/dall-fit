# Endpoints de dashboard

## Objetivo e hierarquia

`GET /dashboard` entrega orientação e métricas da própria pessoa autenticada;
`GET /admin/dashboard` entrega apenas agregados administrativos. A hierarquia é
[`DashboardController`](../../../src/dashboard/controllers/dashboard.controller.ts)
→ `GetDashboardCommand` ou `GetAdminDashboardCommand` →
[`DashboardService`](../../../src/dashboard/services/dashboard.service.ts) →
[`DashboardReadRepository`](../../../src/dashboard/repositories/dashboard-read.repository.ts).
O adapter
[`MongoDashboardReadRepository`](../../../src/dashboard/repositories/mongo-dashboard-read.repository.ts)
faz contagens, agrupamentos por data civil e limites no MongoDB.

O dashboard pessoal também chama
[`TrainingDashboardContextService`](../../../src/training/services/training-dashboard-context.service.ts),
interface pública do módulo de treino que resolve sessão Redis, seleção ativa e
última execução. Controllers e commands não acessam MongoDB ou Redis diretamente.
O calendário compartilhado está em
[`training-calendar.ts`](../../../src/training/domain/training-calendar.ts) e o
relógio injetável fornece um único `generatedAt` por response.

## Contratos HTTP

| Método e path                         | Proteção        | Sucesso                      |
| ------------------------------------- | --------------- | ---------------------------- |
| `GET /dashboard?timezone=<IANA>`       | `Authenticated` | `200 DashboardResponse`      |
| `GET /admin/dashboard?timezone=<IANA>` | `AdminOnly`     | `200 AdminDashboardResponse` |

Ambas as respostas usam `Cache-Control: private, no-store`. `timezone` é
obrigatório, não vazio e possui no máximo 100 caracteres. Falha estrutural retorna
`400 VALIDATION_ERROR`; identificador não reconhecido por `Intl.DateTimeFormat`
retorna `400 DASHBOARD_TIMEZONE_INVALID`. Sessão ausente retorna `401
AUTHENTICATION_REQUIRED`; pessoa comum no endpoint administrativo recebe `403
ADMIN_ACCESS_REQUIRED` antes de qualquer agregado.

Nenhum endpoint aceita ID de pessoa. O pessoal deriva `personId` exclusivamente da
sessão. O administrativo não devolve ID, nome, e-mail, foto ou execução de pessoa.

## Semântica temporal e métricas

- A semana civil começa na segunda e termina no domingo no timezone informado.
- Últimos 30 dias vão de `00:00` do 29º dia anterior a `00:00` do dia seguinte;
  portanto o intervalo acompanha horário de verão e não representa 720 horas.
- A tendência contém exatamente a semana parcial atual e as sete anteriores,
  ordenadas da mais antiga para a atual e preenchidas com zeros.
- Apenas `workout_executions.status=completed` conta, pela data `completedAt`.
- Duração soma `durationSeconds`; percentual completo é arredondado ao inteiro
  mais próximo e vale zero sem conclusões.
- Pessoas distintas são deduplicadas em cada período administrativo.

O read model pessoal filtra toda leitura por `personId`. Uma agregação `$facet`
produz dias e totais do período; o ramo de recentes ordena `completedAt/_id`
decrescente e limita cinco sem restringi-lo às oito semanas. O service preenche os
sete dias da semana e os oito buckets, calcula percentuais e serializa instantes
recentes em ISO 8601.

O read model administrativo executa agregações limitadas e previsíveis sobre
pessoas, execuções, catálogo, seleções e modelos globais. `topGlobalPlans` agrupa
referências por modelo, conta pessoas vinculadas e ativas, ordena por ativos,
vinculados, nome e ID e limita cinco. `activePlanCount` deduplica pessoas com ao
menos uma seleção, enquanto `activeSelectionCount` soma as entradas dos arrays.
Os índices de pessoa por criação, execução
por status/data, catálogo por tipo/modelo/pessoa e seleção por entrada sustentam
essas leituras.

## Próxima ação pessoal

`TrainingDashboardContextService` lê sessão e seleção ativa em paralelo:

1. sessão existente prevalece e produz `resume-workout` com o plano e workout do
   snapshot, mesmo se a seleção atual mudou;
2. sem sessão e sem plano executável, produz `select-plan`;
3. com vários ativos, produz `choose-training-plan` e encaminha a `/training` sem
   escolher um ID;
4. com um plano, consulta a última execução e escolhe ciclicamente o workout seguinte,
   ou o primeiro sem histórico, produzindo `start-workout` e `catalogEntryId`.

`currentWeek.workoutCount` usa o total do snapshot quando há sessão, o total do
plano ativo sem sessão ou `null` sem plano ou com vários ativos.

## Formato das respostas

`DashboardResponse.data` contém `generatedAt`, a união `nextAction`,
`currentWeek`, `last30Days`, oito itens em `weeklyTrend` e até cinco itens em
`recentWorkouts`. Datas civis usam `YYYY-MM-DD`; instantes usam ISO 8601.

`AdminDashboardResponse.data` contém `generatedAt`, `people`, `training`, oito
itens com treino e pessoas distintas em `weeklyTrend`, `plans` e até cinco
`topGlobalPlans`. As estruturas compartilhadas vivem em `@dall-fit/types`.

## Cenários reproduzíveis

O seed Web grava o cookie pronto em `/tmp/dall-fit-web-session-cookie.txt`.

### Cenário 1 — pessoa sem histórico

**Seed**

```bash
pnpm -C api seed -- dashboard:empty
```

**cURL completo**

```bash
curl --include 'http://localhost:4000/dashboard?timezone=America%2FSao_Paulo' \
  --header "cookie: $(cat /tmp/dall-fit-web-session-cookie.txt)"
```

A response traz `select-plan`, métricas zero, sete dias, oito buckets zero e lista
recente vazia.

### Cenário 2 — histórico pessoal e isolamento

**Seed**

```bash
pnpm -C api seed -- dashboard:personal
```

**cURL completo**

```bash
curl --include 'http://localhost:4000/dashboard?timezone=America%2FSao_Paulo' \
  --header "cookie: $(cat /tmp/dall-fit-web-session-cookie.txt)"
```

Somente a execução de `Dashboard Runner` participa dos indicadores e recentes. A
ação aponta ao workout seguinte do plano ativo.

### Cenário 3 — limite civil de timezone

**Seed**

```bash
pnpm -C api seed -- dashboard:timezone
```

**cURL completo**

```bash
curl --include 'http://localhost:4000/dashboard?timezone=America%2FSao_Paulo' \
  --header "cookie: $(cat /tmp/dall-fit-web-session-cookie.txt)"
```

A conclusão em `2026-09-28T03:00:00.000Z` pertence à segunda-feira local
`2026-09-28`. O E2E adicional cobre a semana de transição de DST em
`America/New_York`.

### Cenário 4 — agregados administrativos

**Seed**

```bash
pnpm -C api seed -- dashboard:admin
```

**cURL completo**

```bash
curl --include 'http://localhost:4000/admin/dashboard?timezone=America%2FSao_Paulo' \
  --header "cookie: $(cat /tmp/dall-fit-web-session-cookie.txt)"
```

A response agrega as pessoas fictícias e o modelo global sem expor os perfis.

### Cenário 5 — pessoa comum tenta ler agregados

**Seed**

```bash
pnpm -C api seed -- dashboard:personal
```

**cURL completo**

```bash
curl --include 'http://localhost:4000/admin/dashboard?timezone=UTC' \
  --header "cookie: $(cat /tmp/dall-fit-web-session-cookie.txt)"
```

O guard retorna `403 ADMIN_ACCESS_REQUIRED`; nenhum repository de dashboard é
consultado.

### Cenário 6 — timezone ausente ou desconhecido

**Seed** — prepara somente a sessão necessária para atravessar o guard; a
validação da query ocorre antes do read model.

```bash
pnpm -C api seed -- dashboard:personal
```

```bash
curl --include 'http://localhost:4000/dashboard' \
  --header "cookie: $(cat /tmp/dall-fit-web-session-cookie.txt)" \
&& curl --include 'http://localhost:4000/dashboard?timezone=Mars%2FOlympus' \
  --header "cookie: $(cat /tmp/dall-fit-web-session-cookie.txt)"
```

O primeiro request retorna `VALIDATION_ERROR`; o segundo,
`DASHBOARD_TIMEZONE_INVALID`.

## Cobertura automatizada

- `dashboard.service.spec.ts` cobre composição, zeros, arredondamento, buckets e
  deduplicação.
- `training-dashboard-context.service.spec.ts` cobre seleção, início e retomada.
- `training-calendar.spec.ts` cobre virada de mês/ano e horário de verão.
- `dashboard.e2e-spec.ts` usa MongoDB e Redis efêmeros para autenticação,
  autorização, isolamento, agregações, timezone, headers e ausência de PII.

## Aceite de termos como precondição

Depois dos guards de sessão/permissão/CSRF/quota e antes dos pipes/controllers de
negócio pessoal, a política exige recibo da publicação vigente. Pendência responde
`403 TERMS_ACCEPTANCE_REQUIRED`; ausência de publicação, `503 TERMS_NOT_CONFIGURED`;
consulta necessária indisponível, `503 TERMS_UNAVAILABLE`. Sem efeitos no domínio
deste endpoint. Os [cenários reproduzíveis de termos](terms.md) são proprietários
dessa fronteira; os seeds de negócio preparam recibos sintéticos explicitamente,
sem transformá-los em efeito do login.

`GET /admin/dashboard` usa `AdminOnly` e dispensa aceite depois de verificar papel.
`GET /dashboard` continua exigindo aceite mesmo quando chamado pelo administrador;
sem publicação responde `503`, e com publicação pendente, `403`, conforme os códigos
acima. A UI de `/dash` continua priorizando a leitura quando há pendência pessoal.
