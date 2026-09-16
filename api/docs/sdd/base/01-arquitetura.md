# Arquitetura base da API

## Stack

A API usa NestJS 11, TypeScript, Node.js, Mongoose para MongoDB, ioredis para
Redis e Terminus para probes operacionais. `@nestjs/config` carrega o ambiente e uma função baseada em Zod valida e
tipa seus valores antes do bootstrap. O entrypoint é
`src/main.ts`, a composição raiz está em `src/app.module.ts` e funcionalidades
futuras devem ser organizadas em módulos por domínio.

O servidor HTTP usa a porta `4000` por padrão e aceita requests da origem da UI em
`http://localhost:3000`. Ambos os valores são configuráveis por ambiente.

## Tempo real transversal

`RealtimeModule` oferece stream SSE autenticado e publicação genérica de
invalidações. Escritas efetivas publicam após o commit pelo client Redis de
comandos; uma conexão ioredis exclusiva permanece em modo subscriber por runtime
e distribui envelopes aos streams locais. Falha de publicação é best-effort. O
payload nunca replica entidades e reconexões fazem nova leitura HTTP. O projeto
Vercel está configurado com Fluid Compute e maxDuration de 300 segundos no
dashboard; o stream encerra voluntariamente antes desse limite.

## Aggregate de planos, concorrência e integrações

`TrainingPlanModule` mantém `TrainingPlan -> Workout -> Exercise` em um documento
MongoDB. O top-level usa `versionKey: 'version'`; workouts têm timestamps e o array
de exercícios usa discriminador `type` com cinco schemas estritos. Limites de 25
workouts, 50 exercícios e 12 MiB são regras de produto. Leituras internas calculam
`$bsonSize`, contagens e máximo por workout e emitem `aggregateNearLimit` a partir
de 8 MiB, 20 ou 40, sem conteúdo do documento.

Toda mutação de aggregate existente exige a versão inteira canônica no header
`X-Resource-Version`, compara owner/IDs/versão na mesma operação e incrementa
exatamente uma vez. Leituras e sucessos que preservam o aggregate devolvem a
versão atual no mesmo header. O adapter usa `lean`, projeções e retorno mínimo;
falha do CAS faz uma inspeção projetada para distinguir not-found de `412`. A
listagem tem page máxima 100, ordem
`createdAt/_id` decrescente e warning único a partir de 1600 globais.

O mesmo módulo possui duas fronteiras HTTP: `/global/training-plans` deriva escopo
administrativo e `/training-plans` deriva a pessoa da sessão. Árvores próprias
continuam em `training_plans`; catálogo, seleção opcional e jobs usam coleções
separadas. Uma referência resolve o global vivo e nunca aceita mutations. A API
persiste snapshot/job antes de iniciar, por HTTP HMAC, o projeto Nitro documentado
em `workflow/docs/sdd`; timeout ambíguo deixa o job recuperável.

`YoutubeReferenceService` normaliza allowlist e consulta apenas o thumbnail do host
fixo. `ExerciseImageService` valida até 10 MiB/40 MP, rejeita animação, remove
metadata e gera WebP 160x160 e 1080x1920 sem ampliação. `BlobStorageService`
encapsula `@vercel/blob` no store privado identificado pelo valor opaco de
`BLOB_STORE_ID`. Produção/Preview usam OIDC gerenciado pela Vercel; a aplicação não
recebe nem passa `BLOB_READ_WRITE_TOKEN`, não deriva hostname do ID e não configura
uma URL paralela. `put` usa `access: 'private'`; `head`, `del` e `list` selecionam
o mesmo store por OIDC. Todo novo par de variantes compartilha um `imageAssetId`
opaco no pathname `exercise-images/{imageAssetId}/{thumbnail|display}.webp`.
Uploads normais geram um ID novo antes do primeiro `put`, desabilitam o sufixo
aleatório do SDK e não sobrescrevem outro asset.

MongoDB persiste somente pathname/key, dimensões e o ETag opaco recebido no
upload. Imagens legadas sem esse campo têm o ETag resolvido por `head` ao iniciar
uma clonagem, com a mesma concorrência limitada da hidratação. Depois da
autorização da request, `ExerciseImageService` emite um delegation token por pathname exato com
`issueSignedToken`, operação `get` e validade de quinze minutos, e o converte com
`presignUrl` privado e cache do Blob. As duas variantes compartilham a expiração;
a hidratação limita-se a quatro imagens simultâneas, no máximo oito emissões. Token,
pathname e signed URL nunca são registrados. Upload parcial, falha de assinatura
ou falha pré-CAS compensam blobs novos; limpezas pós-commit podem ser retomadas por
`pnpm -C api images:reconcile` (dry-run por padrão; `--execute` é explícito).
Essa reconciliação preserva tanto referências materializadas quanto origens do
snapshot e destinos já confirmados de jobs de clone não terminais.
`autoIndex` é `true` somente em `local|test`. Preview/produção usam `false` e
`pnpm -C api indexes:apply -- --execute` com
`INDEX_OPERATION_CONFIRMATION=apply-dall-fit-indexes-v3`. O comando cria primeiro
os índices únicos/compostos conhecidos e remove somente o nome legado exato; não
usa `syncIndexes()`.

## Assistente de planos

`TrainingPlanAssistantModule` é uma fronteira separada do CRUD. Sessões sensíveis
ficam em `training_plan_assistant_sessions`, com índice parcial único por pessoa,
CAS por versão, expiração lógica e TTL de sete dias. Confirmações removem a sessão
e deixam por 24 horas somente um recibo com hash e IDs. Controllers e commands não
acessam repository ou provider; `TrainingPlanAssistantSessionService` orquestra
triagem, catálogo, estado, idempotência e o bridge de materialização.

Conhecimento, catálogo de força e atividades cronometradas e dois seeds globais
são JSONs versionados e validados por Zod no runtime aquecido. O catálogo contém
vídeos de força, cardio sem mídia e alongamentos com demonstração opcional. O
provider possui apenas interpretar,
reformular e propor. Fake sustenta testes; Groq usa chave server-side, timeout,
budget máximo de completion e saída estruturada. Modelos registrados como
compatíveis recebem JSON Schema estrito ou best-effort; os demais usam JSON Object
Mode. Em todos os modos o parse Zod e a triagem locais continuam soberanos. Erros
transitórios de rede, `429` e `5xx` recebem no máximo um retry com espera limitada,
e o circuit breaker compartilhado usa o singleton Redis sem alterar readiness.

Produção/preview falham fechados quando a flag ativa não vier acompanhada de Groq,
credencial, ZDR e aprovação de privacidade. A flag desligada impede nova sessão e
chamada externa, mas não impede GET/DELETE e os fluxos manuais continuam intactos.

## Imports internos e compartilhados

Imports de arquivos em `src/` usam `~/*`, resolvido para o `src/` exclusivo da
API. A configuração é compartilhada por TypeScript, build/watch do Nest e Vitest,
incluindo E2E:

```ts
import { AppService } from '~/app.service';
```

Contratos do monorepo são consumidos pela API por seus pacotes públicos no
namespace `@dall-fit/*`, como `@dall-fit/types`. `~/` nunca aponta para a UI ou
para outro pacote do workspace, e `@/*` não é um alias válido.

## Responsabilidades por camada

Para cada domínio, preferir:

```text
src/<domain>/
├── <domain>.module.ts
├── controllers/       # transporte HTTP
├── commands/          # orquestração completa de cada endpoint/caso de uso
├── services/          # regras e operações de um assunto específico
├── domain/            # regras e tipos exclusivos da API
├── dto/               # validação de entrada/saída do Nest
└── repositories/      # portas e adaptadores de persistência
```

### Controller

Todo fluxo de endpoint começa no controller. Ele possui somente estas
responsabilidades:

1. receber e validar a entrada pelo DTO ou tipo de transporte;
2. registrar a entrada de forma segura, conforme
   `06-logging-e-rastreabilidade.md`;
3. chamar o command proprietário do endpoint;
4. registrar o retorno do command e o valor de saída;
5. devolver o resultado montado pelo command.

Controllers não possuem regras de negócio, `if` de domínio, montagem de response,
acesso a repository, chamada de serviço externo ou envio de mensageria. Guards,
pipes, interceptors e filters podem tratar preocupações HTTP transversais sem
transferir orquestração para o controller.

### Command

O command orquestra todo o fluxo do endpoint. Ele:

- recebe a entrada já validada pelo controller;
- avalia condições e executa os branches do caso de uso;
- monta o contrato de entrada esperado por cada service;
- chama services na ordem necessária;
- registra o retorno de cada service e todo branch escolhido;
- combina resultados e decide os próximos passos;
- monta a response final esperada pelo endpoint;
- registra o valor de saída;
- devolve essa response ao controller.

Cada endpoint possui um command proprietário, salvo quando a inexistência de fluxo
for explicitamente justificada. Commands não acessam repositories, clients de banco,
SDKs externos ou brokers diretamente.

### Service

Um service possui um assunto próprio e coeso. Ele concentra cálculos, regras e
operações reutilizáveis desse assunto. Conforme sua responsabilidade, pode:

- executar uma regra ou cálculo sem I/O;
- preparar entidades, objetos ou arrays completos e chamar um repository;
- encapsular acesso a serviço externo;
- encapsular publicação de mensagem ou evento;
- encapsular uma operação de cache ou Redis.

O service recebe o contrato preparado pelo command e realiza o mapeamento necessário
para suas dependências. Ele não conhece objetos HTTP, não monta a response do
endpoint e não assume a orquestração entre diferentes assuntos. Registra sua
entrada, branches, retornos ou conclusões das dependências e saída.

### Repository

Repositories são acessados exclusivamente por services. Um repository:

- executa persistência ou consulta;
- recebe entidades do sistema, objetos ou arrays já prontos;
- retorna entidades ou estruturas do sistema;
- conhece detalhes do mecanismo de persistência dentro do seu adapter.

Repositories nunca recebem DTO HTTP, nunca constroem DTO, nunca montam response,
nunca decidem fluxo de negócio e nunca são chamados diretamente por controller ou
command. Registram parâmetros sanitizados, resultado ou conclusão da infraestrutura
e retorno do método, sem expor queries, documentos ou credenciais.

### Dependências entre camadas

```text
Controller
└── Command
    ├── Service de domínio
    │   └── Repository
    ├── Service de integração
    │   └── Serviço externo
    ├── Service de mensageria
    │   └── Broker
    └── Service de dados temporários
        └── Redis
```

Módulos não acessam internals de outro domínio. Services não dependem de objetos
HTTP do Express, e infraestrutura implementa as abstrações definidas pela aplicação
ou domínio.

O array `exports` de cada módulo Nest representa sua interface pública efetivamente
consumida. `PersonModule` exporta somente `FindOrCreatePersonService`,
`FindPersonByIdService` e `UpdatePersonThemeService`; `MongooseModule`, o model, o
adapter MongoDB e a port `PersonRepository` permanecem internos. `AuthModule`
reexporta `PersonModule` porque seus guards públicos dependem de
`FindPersonByIdService` quando são aplicados em controllers de módulos consumidores.
Assim, `TrainingPlanModule` importa somente `AuthModule` para essa dependência e
resolve o grafo de autenticação sem depender diretamente do módulo de pessoa.

A estrutura cresce com necessidade real; não criar camadas vazias.

## Logging e retornos

Antes de Helmet, CORS e das rotas, `RequestContextMiddleware` valida ou cria
`x-request-id`, abre um contexto `AsyncLocalStorage` e grava o mesmo valor no
header da response. `RequestContextLogger`, instalado como logger global injetado,
acrescenta esse identificador aos metadados estruturados de todos os níveis sem
alterar mensagem, argumentos, contexto ou stack. O bootstrap usa buffering até o
logger estar disponível. A variável validada `LOG_LEVEL` configura nesse singleton
o nível mínimo de emissão e delega ao `ConsoleLogger` do NestJS sua cascata nativa;
o código continua chamando os níveis definidos pela política independentemente do
limiar operacional escolhido.

`GlobalExceptionFilter`, registrado por `APP_FILTER`, é a única fronteira pública
para erros HTTP e falhas não tratadas. Ele aplica o contrato descrito em
`02-endpoints-e-contratos.md`; falhas técnicas inesperadas são registradas uma vez
com método, path sem query, nome e stack no canal de erro. Falhas já traduzidas e
registradas pelo adapter Redis não são duplicadas.

Todo método de classe que participa de um fluxo da API registra:

1. entrada e parâmetros sanitizados;
2. conclusão de cada etapa interna relevante;
3. retorno ou conclusão de cada dependência;
4. cada branch escolhido;
5. resultado imediatamente antes de devolvê-lo.

Um método nunca retorna diretamente uma expressão. Ele atribui o resultado a uma
variável, prepara uma representação segura para observabilidade, registra
`NomeDaClasse -> nomeDoMetodo -> return:` e só então retorna o valor original.

O formato completo, níveis, exemplos, segurança, volume e exceções estão em
`06-logging-e-rastreabilidade.md`.

## Contratos

DTOs com decorators permanecem na API. O formato estrutural compartilhado com a UI
fica em `@dall-fit/types`, conforme
`../../../../docs/sdd/base/03-contratos-compartilhados.md`.

O backend é a fonte de verdade do contrato HTTP. Mudanças incompatíveis devem ser
coordenadas com consumidores antes de remover campos ou alterar semântica.

## Persistência e dados temporários

- MongoDB é o banco NoSQL principal.
- Redis armazena dados temporários, caches, sessões, locks ou idempotência conforme
  o caso de uso.
- a execução de treino mantém um snapshot por pessoa no Redis com TTL absoluto e
  CAS; somente resumo final e perfil de cargas são consolidados no MongoDB,
  conforme a ADR-0010.
- a autorização de edição offline mantém uma chave de lease por pessoa no Redis.
  Plano e instalação ficam no valor, e um `leaseId` cerca cada concessão. Scripts
  Lua linearizam registro, takeover, validação e renovação; somente sincronização
  já aceita renova os sete dias, conforme a ADR-0015.
- snapshots offline em andamento permanecem no Redis. Ao concluir ou cancelar, um
  recibo terminal imutável e único por pessoa + execução é consolidado no MongoDB;
  conclusão também usa `workout_executions` e os perfis de carga canônicos. O
  snapshot Redis só é removido por comparação de execução, revisão e hash depois
  da persistência durável.
- Mongoose e ioredis são os clients oficiais de produção.
- services dependem de ports de repository ou cache, não de clients ou models
  concretos.
- adapters de MongoDB e Redis implementam essas ports e permanecem na camada de
  infraestrutura.

Nos testes unitários de services, as ports são substituídas por mocks Vitest. Nos
E2E, os adapters reais usam processos efêmeros iniciados por
`mongodb-memory-server` e `redis-memory-server`, conforme
`04-mocks-e-bancos-de-teste.md`.

`MongooseModule` é inicializado pela aplicação porque o domínio `Person` persiste
cadastros e valida a existência da pessoa em toda sessão autenticada. `RedisModule`
mantém uma única instância compartilhada de ioredis por runtime aquecido. Ela usa
TLS obrigatório em produção/preview, namespace por ambiente e deployment de
preview, fila offline desabilitada, tentativas e timeouts limitados e encerramento
no lifecycle do Nest. Na Vercel, a mesma conexão é anexada ao lifecycle oficial de
Fluid Compute; não existe conexão, pool ou fallback por request.

`SessionStoreService` cria, lê e remove sessões revogáveis discriminadas por canal
`web | native`. Registros anteriores sem canal são inválidos e expiram pelo TTL;
eles nunca são promovidos implicitamente. `RateLimitService` usa
um script Lua atômico que executa incremento, TTL e leitura da janela em um único
comando Redis. Somente `RedisKeyService` compõe as chaves injetando o namespace;
nenhum adapter executa `KEYS`, `FLUSH*` ou limpeza por prefixo em runtime publicado.
Falha, timeout, saturação, reset do dataset ou rejeição por `noeviction` nunca
desabilitam autenticação, CSRF ou rate limit: o caminho protegido falha fechado.
A leitura pública de compatibilidade Android é a exceção deliberada: para não
tocar Redis, usa uma janela fixa em memória por IP, limitada a 10.000
identificadores por runtime. Ela não protege sessão nem mutação; instâncias podem
ter janelas independentes.

`OfflineTrainingLeaseService`, no módulo de treino, usa o mesmo singleton e uma
chave `offline-training-lease` por pessoa. Ele não recebe DTO HTTP nem persiste no
MongoDB. Os endpoints são exclusivos de sessão Bearer nativa; commands resolvem o
plano ativo antes de chamar o service. Falha do Redis vira indisponibilidade
específica, sem autorização otimista ou lease local por instância.

O mesmo módulo recebe snapshots Android v1 em uma chave
`offline-training-snapshot` por pessoa. Validação Zod e hash canônico acontecem
antes da região crítica. Antes de ambos, o `AppCompatibilityModule` valida a
versão do pacote e do contrato informadas pelo transporte. Cliente incompatível
recebe `APP_UPDATE_REQUIRED` sem lock nem acesso a Redis ou MongoDB. Um lock Redis
curto por instalação usa token e release
condicionado; sob ele, um único script Lua confronta lease, execução, revisão e
hash, resolve conflitos por token da versão observada e grava o agregado completo
com lease e snapshot no mesmo `PXAT` de sete dias. Replay idêntico e escolha da
versão do servidor não escrevem nem renovam.

Snapshots `completed` reutilizam `TrainingService` para métricas, perfis e resumo
semanal; snapshots `cancelled` não criam histórico. Ambos geram recibo em
`offline_training_terminal_receipts`, com índice único de pessoa + execução, antes
da limpeza condicionada do Redis. O recibo torna retries idempotentes mesmo depois
da limpeza ou expiração do lease e impede que uma execução terminal seja
ressuscitada. A árvore capturada determina o resultado; apenas a elegibilidade dos
perfis de carga consulta o plano atual, como na finalização online.

`AppCompatibilityModule` também expõe a política pública Android sem sessão,
MongoDB ou Redis. `ANDROID_MIN_VERSION_CODE` e `ANDROID_PLAY_STORE_URL` são
obrigatórios e validados no bootstrap; a URL deve ser HTTPS e apontar para
`com.dallfit.app`. O endpoint usa rate limit público por IP e `no-store`. A
elevação do mínimo ocorre somente após a build correspondente estar disponível na
Play Store e depois de backend, migration e sync terem sido validados com as duas
versões; reduzir o valor não constitui downgrade do banco local.

`OperationalModule` expõe liveness em `GET /health` sem dependências e readiness
em `GET /ready`. A readiness usa Terminus para pingar a conexão Mongoose vigente e
o mesmo singleton ioredis, ambos com espera finita; não cria client ou pool
adicional. Durante shutdown ela responde indisponível. O bootstrap habilita os
shutdown hooks antes de escutar, e o encerramento aguarda os lifecycles do MongoDB,
Redis e integração Vercel já existentes.

O domínio `Person` expõe ports de repository aos services. O adapter MongoDB mantém
índice único para o identificador `sub` do Google e mapeia documentos para entidades
antes de devolvê-los. Uma pessoa administradora possui `isAdmin: true`; pessoas
comuns omitem o campo. Não existe default `false`, coleção separada nem consulta
adicional para descobrir essa condição. A preferência opcional de tema fica em
`configs.theme`, aceita somente `light | dark` e não possui default. Documentos
novos ou históricos sem a configuração continuam sem o campo persistido, enquanto
a representação pública garante `configs: {}`. A atualização da própria pessoa usa
o fluxo controller → command → `UpdatePersonThemeService` → repository e altera
atomicamente somente `configs.theme` e `updatedAt`.

O domínio `training-plan` usa a coleção `training_plans` e o fluxo completo
controller → command → `TrainingPlanService` → `TrainingPlanRepository`. Planos
globais possuem `ownerPersonId: null`; workouts e exercícios ficam embutidos. O
adapter mantém o índice `{ ownerPersonId: 1, createdAt: -1 }`, projeta somente
resumos públicos e executa `$push`/`$pull` atômicos. Redis não participa. A decisão
está em
`../../../../docs/sdd/adr/ADR-0003-modelagem-dos-planos-de-treino.md`.

## Infraestrutura de desenvolvimento local

O comando abaixo inicia MongoDB e Redis reais em processos locais, sem Docker:

```bash
pnpm -C api dev:infra
```

O MongoDB usa `127.0.0.1:27017`, database `dall-fit`, e o Redis usa
`127.0.0.1:6379`, em conformidade com `api/.env.example`. As versões dos binários
são fixadas no `package.json` da raiz. As portas não são substituídas
automaticamente: se estiverem ocupadas, o comando falha para evitar que a API se
conecte a um processo ou endereço inesperado. O MongoDB usa `wiredTiger` com
`dbPath` fixo em `api/.data/mongodb/`; o diretório é criado pelo orquestrador,
ignorado pelo Git e nunca limpo automaticamente no startup ou shutdown. Seeds
continuam explícitos e não são executados ao subir a infraestrutura.

`pnpm -C api dev` executa `dev:infra` e `start:dev` juntos. O orquestrador encerra o
outro processo se infraestrutura ou API terminar, e sinais de encerramento fecham
MongoDB e Redis. Reloads do Nest e novas sessões de desenvolvimento reutilizam os
dados do MongoDB, enquanto o Redis continua efêmero e é descartado a cada
encerramento. O comando `pnpm dev` da raiz mantém sua interface e inicia esse ciclo
da API em paralelo ao Vite da UI. Unitários não iniciam bancos, e E2E permanecem
isolados em instâncias temporárias próprias sem acessar o diretório persistente.

## Configuração e segurança

- variáveis de ambiente são carregadas globalmente por `ConfigModule` e validadas
  antes do bootstrap pelo schema Zod em
  [`src/config/environment.ts`](../../../src/config/environment.ts);
- a validação converte `PORT` para número, aplica os padrões locais, rejeita
  protocolos inválidos de MongoDB e Redis, informa todas as chaves inválidas sem
  expor seus valores e preserva variáveis predefinidas não pertencentes ao schema;
- `api/.env.example` declara:
  - `PORT`, porta HTTP, com padrão local `4000`;
  - `LOG_LEVEL`, nível mínimo dos logs, com padrão `log` e valores nativos
    `verbose`, `debug`, `log`, `warn`, `error` ou `fatal`;
  - `TRUST_PROXY_HOPS`, quantidade explícita de proxies confiáveis para cálculo do
    IP usado em rate limit;
  - `CORS_ORIGIN`, origem permitida, com padrão local
    `http://localhost:3000`;
  - `MONGODB_URI`, URI do MongoDB principal;
  - `REDIS_URL`, URI do Redis, obrigatória e `rediss://` em produção/preview;
  - `REDIS_NAMESPACE`, base do namespace; preview acrescenta hash do deployment;
  - `REDIS_CONNECT_TIMEOUT_MS` e `REDIS_COMMAND_TIMEOUT_MS`, limites de espera;
  - pares `RATE_LIMIT_*_LIMIT` e `RATE_LIMIT_*_WINDOW_MS` para início/callback
    Google, troca nativa, bypass local, sessão, mutações autenticadas e
    administrativas; aceitam somente inteiros positivos e as janelas têm mínimo de
    um segundo;
  - `TRAINING_PLAN_ASSISTANT_*`, com flag, provider/modelo, chave Groq, timeout,
    budget máximo de completion, confirmações de ZDR/privacidade e quotas próprias
    de mensagem, draft e confirmação;
  - `UI_URL`, destino dos redirecionamentos após autenticação;
  - `GOOGLE_OAUTH_CREDENTIALS_BASE64`, JSON de cliente OAuth Web codificado em
    base64;
  - `AUTH_SESSION_SECRET`, chave HMAC com pelo menos 32 caracteres;
  - `AUTH_SESSION_ACTIVE_KEY_ID`, `AUTH_SESSION_ISSUER`,
    `AUTH_SESSION_AUDIENCE` e `AUTH_NATIVE_SESSION_AUDIENCE`, identidade
    criptográfica da chave e audiences isoladas dos tokens Web e Android;
  - trio opcional `AUTH_SESSION_PREVIOUS_SECRET`,
    `AUTH_SESSION_PREVIOUS_KEY_ID` e `AUTH_SESSION_PREVIOUS_VALID_UNTIL`, aceito
    somente durante no máximo uma validade absoluta de sessão;
  - `AUTH_SESSION_TTL_SECONDS`, validade da sessão;
  - `AUTH_COOKIE_SECURE`, ativação explícita do atributo `Secure` e seleção
    temporária da política `SameSite` compatível com o deploy;
  - `AUTH_TEST_BYPASS_ENABLED` e `AUTH_TEST_BYPASS_KEY`, mecanismo restrito de
    local/teste;
- `AUTH_TEST_BYPASS_E2E_ENABLED` não pertence ao `.env` de aplicação: é um
  marcador interno definido pelas suítes E2E antes da composição Nest. Em CI, o
  bypass só é aceito quando esse marcador, `NODE_ENV=test`, a flag e a chave forte
  estão presentes; Vercel, preview e produção permanecem recusados;
- o `.env` local não é versionado;
- local/teste usam por padrão `redis://127.0.0.1:6379`; produção/preview não
  possuem fallback e exigem Redis TLS e namespace próprios;
- segredos e dados pessoais não aparecem em logs, fixtures ou documentação;
- todo log segue a sanitização e a redaction definidas em
  `06-logging-e-rastreabilidade.md`;
- autenticação e autorização são aplicadas por guards;
- erros internos não expõem stack trace ou detalhes de infraestrutura;
- toda entrada externa é validada antes de chegar ao domínio.

Novos recursos de persistência, autenticação ou mensageria exigem atualização deste
documento e ADR quando houver decisão transversal relevante.

## Autenticação vigente

O módulo `AuthModule` implementa OAuth 2.0 Authorization Code, OpenID Connect e
PKCE S256 no backend. A credencial Google nunca chega à UI. `GET /auth/google`
cria `state`, `nonce` e verifier aleatórios em cookies temporários, e
`GoogleOAuthService` envia somente o challenge, troca o código com o verifier e
valida assinatura, issuer, audience, nonce, `sub`, e-mail verificado, nome e
e-mail. `POST /auth/google` não existe.

`SessionAuthGuard` é a fronteira reutilizável de endpoints privados. Ele aceita
exatamente um transporte: o cookie `dall_fit_session` em local/teste ou
`__Host-dall_fit_session` em ambiente seguro para o canal Web, ou
`Authorization: Bearer` para o canal Android nativo. Presença simultânea é
rejeitada. O guard valida `alg`, `kid`, assinatura, `sub`, `jti`, `iss`, `aud`,
`iat` e `exp`, exige audience e canal Redis correspondentes e então consulta
`Person` no MongoDB.
`Authenticated` aplica o guard e `CurrentPerson` entrega a entidade já validada ao
controller. O token contém somente claims técnicos; o JWT bruto nunca é persistido
no Redis. Cada sessão dura no máximo sete dias, sem renovação deslizante, e o TTL
do registro nunca ultrapassa `exp`.

`AdminOnly` é o ponto de extensão para endpoints administrativos. Ele aplica
`SessionAuthGuard` e depois `AdminAuthorizationGuard`; o segundo guard reutiliza a
`Person` anexada ao request e permite somente `isAdmin: true`, sem acessar banco ou
service novamente. Pessoa autenticada sem a chave recebe
`403 ADMIN_ACCESS_REQUIRED`. As sete operações de planos globais aplicam essa
proteção no controller proprietário.

JWTs Web usam `AUTH_SESSION_AUDIENCE`; JWTs nativos usam a audience distinta
`AUTH_NATIVE_SESSION_AUDIENCE`. Ambos usam a mesma chave, issuer, duração absoluta,
rotação e registro revogável, mas não são intercambiáveis. Cookies de sessão usam
`HttpOnly`, path `/` e expiração configurada. Em local/teste
usam nome sem prefixo, `SameSite=Lax` e sem `Secure`; em produção/preview usam
prefixo `__Host-`, `Secure`, host-only e `SameSite=None`. Os cookies temporários de
`state`, `nonce` e verifier duram no máximo dez minutos, usam sempre
`SameSite=Lax` e são removidos por middleware HTTP específico do callback depois
do parser de cookies e antes de guards, pipes e command. Assim a limpeza acontece
também em validação, rate limit e falha técnica; o cookie de sessão preexistente
não é tocado por essa limpeza.

`POST /auth/native/session` valida o Google ID token para a audience server/Web,
sincroniza a pessoa e devolve sessão Bearer nativa com `Cache-Control: no-store`.
`DELETE /auth/native/session` revoga essa sessão e é idempotente para credencial
ausente ou inativa. `GET /auth/csrf` aceita somente sessão Web e devolve seu segredo
com `Cache-Control: no-store`. Mutações autenticadas por cookie exigem
simultaneamente `X-CSRF-Token` comparado em tempo constante e `Origin` exatamente
igual a `UI_URL`; uma sessão nativa já verificada dispensa CSRF. `POST /auth/logout` é
idempotente quando não há sessão válida; quando há, aplica a proteção, remove o
registro Redis e limpa nomes atual e legado do cookie.

Rate limits distribuídos usam sessão/pessoa e IP conforme o endpoint. Início
Google aceita 10/10min/IP; troca nativa 10/10min/IP; callback 30/10min/IP; bypass
5/min/IP; CSRF e logouts
30/min/sessão+IP; mutações autenticadas comuns 60/min/pessoa+IP; administrativas
30/min/admin+IP. Preflight não consome quota. Excesso responde `429` estruturado e
`Retry-After`. Depois da correlação da request, a API usa Helmet e parser de
cookies; CORS credenciado mantém origem e métodos exatos, aceita somente os headers
contratados, inclusive `Authorization` e `Idempotency-Key`, e expõe apenas `X-Request-Id` e
`X-Resource-Version`; `trust proxy` permanece explícito.

No callback OAuth, somente negação de consentimento, callback ausente ou
divergente, `invalid_grant`, ID token ausente e rejeições OIDC conhecidas retornam
redirect genérico para a entrada pública. Erro inesperado do provedor,
configuração, rede, timeout, resposta 5xx, MongoDB, Redis ou código propaga ao
filtro global e termina em `500`, sem redirect e sem nova sessão.

Essa política `SameSite=None` é uma compatibilidade temporária do deploy, não o
estado de segurança desejado em definitivo. Quando frontend e backend compartilharem
o mesmo site registrável, os helpers de criação e limpeza devem voltar a emitir
`SameSite=Lax` também com `Secure=true`, e os testes e esta documentação devem ser
atualizados na mesma mudança.

O bypass de autenticação aceita somente runtime local/teste fora da Vercel e CI,
flag explícita e chave aleatória de pelo menos 32 bytes comparada em tempo
constante. Fora desse contexto o endpoint se comporta como inexistente. O script
de configuração OAuth não habilita bypass nem grava chave conhecida.
