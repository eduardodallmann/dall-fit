# Endpoint `GET /app-compatibility/android`

## Objetivo funcional

Publicar a política mínima de compatibilidade do aplicativo Android antes que uma
build antiga prepare, inicie ou sincronize trabalho incompatível. O consumidor é
exclusivamente a composição nativa e o Worker; Web/PWA não consulta este recurso.

## Referências técnicas

| Papel | Símbolo e arquivo | Responsabilidade |
| --- | --- | --- |
| Controller | [`AppCompatibilityController`](../../../src/app-compatibility/controllers/app-compatibility.controller.ts) | recebe a leitura pública, aplica rate limit e devolve a response `no-store` |
| Command | [`GetAndroidAppCompatibilityCommand`](../../../src/app-compatibility/commands/get-android-app-compatibility.command.ts) | orquestra a leitura e monta o envelope de sucesso |
| Service | [`AndroidAppCompatibilityService`](../../../src/app-compatibility/services/android-app-compatibility.service.ts) | lê a configuração já validada e produz a política Android |
| Configuração | [`validateEnvironment`](../../../src/config/environment.ts) | exige mínimo inteiro positivo e URL HTTPS da listagem de `com.dallfit.app` |
| Saída | [`AndroidAppCompatibilityResponse`](../../../../packages/types/src/contracts.ts) | compartilha plataforma, mínimo, contrato de sync e URL da loja |

Não há DTO de entrada, repository, MongoDB, Redis, mensageria ou serviço externo.

## Contrato HTTP resumido

- Método e path: `GET /app-compatibility/android`.
- Autenticação e autorização: públicas; não usa cookie, Bearer ou CSRF.
- Rate limit: bucket público próprio por IP, configurado por
  `RATE_LIMIT_APP_COMPATIBILITY_LIMIT` e
  `RATE_LIMIT_APP_COMPATIBILITY_WINDOW_MS`.
- Entrada: sem body, path param ou query.
- Saída: `ApiResponse<AndroidAppCompatibility>`, com exatamente
  `platform: 'android'`, `minimumVersionCode`, `syncContractVersion` e `storeUrl`.
- Sucesso: `200` e `Cache-Control: no-store`.
- Dados sensíveis: nenhum; a URL é pública e logs omitem seu valor.
- Idempotência: leitura determinística da configuração vigente.

## Fluxo completo

### 1. Entrada — `AppCompatibilityController`

O controller recebe a leitura sem dados funcionais. O `RateLimitGuard` deriva o IP
segundo a configuração de proxy já validada e consome somente o bucket público. Se
o limite permitir, chama o command; nenhuma sessão é montada para este fluxo.

### 2. Orquestração — `GetAndroidAppCompatibilityCommand`

O command chama `AndroidAppCompatibilityService.getPolicy`, recebe o objeto já
tipado e o envolve em `{ data }`. Não escolhe plataforma por request, não possui
branch de banco e não consulta runtime externo.

### 3. Service e configuração

`AndroidAppCompatibilityService` lê `ANDROID_MIN_VERSION_CODE` e
`ANDROID_PLAY_STORE_URL` do `ConfigService`, fixa a plataforma Android e usa
`ANDROID_SYNC_CONTRACT_VERSION` como contrato aceito. Valores ausentes, não
inteiros/positivos ou URL que não seja a listagem HTTPS de `com.dallfit.app`
impedem o bootstrap; não existe fallback em runtime.

### 4. Saída

O command devolve o envelope ao controller. O controller mantém `no-store`; o
middleware transversal acrescenta `x-request-id`. Nenhum estado é persistido.

## Mapa de caminhos possíveis

| Caminho | Gatilho | Sequência interna | Resultado HTTP | Efeitos colaterais |
| --- | --- | --- | --- | --- |
| Política vigente | IP dentro do limite | Controller → Command → Service → ConfigService | `200` | nenhum |
| Rate limit | bucket excedido | Guard interrompe antes do command | `429 RATE_LIMIT_EXCEEDED` | somente contador em memória |
| Configuração inválida | bootstrap | validação do ambiente interrompe a aplicação | não há listener HTTP | nenhum estado de domínio |

## Cenários detalhados

### Cenário 1 — política compatível

**Seed:** não se aplica — a response usa somente configuração validada e não
acessa estado persistido.

**cURL**

```bash
curl --include http://localhost:4000/app-compatibility/android
```

- Given: `ANDROID_MIN_VERSION_CODE=1` e a URL oficial estão configurados.
- When: a leitura pública é feita dentro do limite.
- Then: responde `200`, `no-store` e o envelope Android completo.
- Persistência, cache, mensagem ou chamada externa: nenhuma.

### Cenário 2 — rate limit excedido

**Seed:** não se aplica — o cenário usa somente o bucket público efêmero.

**cURL**

```bash
for request in $(seq 1 61); do
  curl --silent --output /dev/null --write-out '%{http_code}\n' \
    http://localhost:4000/app-compatibility/android
done
```

- Given: limite local padrão de 60 leituras por minuto para o mesmo IP.
- When: a 61ª leitura chega na janela.
- Then: o guard responde `429 RATE_LIMIT_EXCEEDED` antes do command.
- Efeitos: nenhum acesso a MongoDB, domínio ou integração externa.

### Cenário 3 — configuração inválida

**Seed:** não se aplica — a falha precede a inicialização de qualquer endpoint.

**Comando reproduzível**

```bash
ANDROID_MIN_VERSION_CODE=0 \
ANDROID_PLAY_STORE_URL='https://example.test/app' \
pnpm -C api start
```

- Given: mínimo inválido ou URL fora da listagem oficial.
- When: o ambiente é validado no bootstrap.
- Then: a aplicação encerra antes de escutar a porta, sem registrar os valores
  brutos e sem política degradada.

## Regras de negócio cobertas por testes

| Regra | Teste unitário | Teste E2E | Mock ou fixture |
| --- | --- | --- | --- |
| configuração obrigatória e URL oficial | `environment.spec.ts` | não se aplica | ambiente isolado |
| formato exato e `no-store` | service/command | `offline-training-lease.e2e-spec.ts` | ConfigService |
| consumo nativo, falha e latência | coordenador Vitest | não se aplica | handlers/fixtures MSW de compatibilidade |

## Operação do mínimo

Primeiro publique e confirme a nova build na Play Store. Depois implante um backend
compatível com a build antiga e a nova, valide migration e sync das duas e somente
então eleve `ANDROID_MIN_VERSION_CODE` e faça redeploy. Reduzir o mínimo não reverte
schema SQLite nem torna um APK antigo seguro.

## Fora do comportamento atual

- iOS, PWA, live update e instalação silenciosa;
- Play In-App Updates ou consulta à Play Store pelo backend;
- versão mínima baseada em `versionName`;
- armazenamento, identificação ou autorização de aparelho.
