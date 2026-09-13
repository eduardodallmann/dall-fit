# Feature Spec: Lease Redis por plano, instalação e pessoa

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #84](https://github.com/eduardodallmann/dall-fit/issues/84).
- Problema: a sessão Redis vigente representa uma única execução online e expira
  absolutamente em 24 horas. O protocolo offline precisa autorizar vários
  snapshots idempotentes produzidos por uma única instalação editora, sem tornar
  MongoDB proprietário de autorização efêmera e sem permitir que dados pertencentes
  a um lease expirado sejam importados depois de um novo registro.
- Resultado: a API oferece registro e takeover explícito de um lease Redis único
  por pessoa. O lease identifica o plano ativo, a instalação editora e uma geração
  opaca `leaseId`; nasce com sete dias, só é renovado depois de uma sincronização
  aceita e permite distinguir expiração de revogação. Operações concorrentes são
  linearizadas no Redis e nunca tornam duas instalações editoras.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da API](../../../api/docs/sdd/base/01-arquitetura.md);
  - [endpoints e contratos HTTP](../../../api/docs/sdd/base/02-endpoints-e-contratos.md);
  - [testes e qualidade da API](../../../api/docs/sdd/base/03-testes-e-qualidade.md);
  - [mocks e bancos de teste](../../../api/docs/sdd/base/04-mocks-e-bancos-de-teste.md);
  - [seeds e cURLs](../../../api/docs/sdd/base/05-seeds-e-curls-de-cenario.md);
  - [logging e rastreabilidade](../../../api/docs/sdd/base/06-logging-e-rastreabilidade.md);
  - [endpoints de treino](../../../api/docs/sdd/endpoints/training.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [ADR-0010 — sessão efêmera e histórico](../adr/ADR-0010-sessao-efemera-e-historico-de-treino.md);
  - [ADR-0013 — sessões Web e nativas isoladas](../adr/ADR-0013-sessoes-web-e-native-isoladas.md);
  - [ADR-0014 — motor nativo offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [FIT-0081 — login e isolamento de conta Android](fit-0081-login-isolamento-conta-android.md);
  - [FIT-0082 — núcleo nativo de persistência offline](fit-0082-nucleo-nativo-persistencia-offline.md);
  - [FIT-0083 — preparação do plano ativo](fit-0083-preparar-plano-ativo-midias-offline.md);
  - [scripting Lua do Redis](https://redis.io/docs/latest/develop/programmability/eval-intro/);
  - [`EXPIRE` do Redis](https://redis.io/docs/latest/commands/expire/);
  - [ioredis](https://github.com/redis/ioredis).
- Features relacionadas: FIT-0081 fornece sessão Bearer e UUID v4 aleatório da
  instalação; FIT-0083 prepara o plano ativo sem antecipar autorização remota. A
  issue 85 consumirá `leaseId`, validação e renovação ao aceitar snapshots; as
  issues 86 e 87 completarão estados terminais e o cliente sincronizador. Esta
  entrega não ingere conteúdo de execução.

As versões confirmadas no repositório são ioredis `5.11.1`,
`redis-memory-server` `0.17.0` e Redis `8.8.1` para desenvolvimento e E2E. A
documentação oficial confirma que scripts Lua executam atomicamente no servidor;
o ioredis vigente oferece `eval` e comandos customizados. A solução reutiliza o
singleton, os timeouts e o namespace Redis já existentes.

## Escopo

### Incluído

- criar uma única chave de lease por pessoa, composta exclusivamente pelo
  `RedisKeyService`, contendo `planId`, `installationId`, `leaseId` e `expiresAt`;
- resolver o plano ativo no servidor a partir da pessoa autenticada; o cliente não
  escolhe nem envia `personId` ou `planId`;
- criar `PUT /training/offline-lease` com body estrito `{ installationId }` para
  registro ou reutilização idempotente;
- criar `POST /training/offline-lease/takeover` com o mesmo body para substituição
  explícita da instalação editora;
- restringir os dois endpoints a sessão Bearer já validada como canal `native`;
  cookie Web não representa uma instalação Android e não acessa o recurso;
- devolver `ApiResponse` com `leaseId`, `planId`, `expiresAt` e `state`, sem ecoar
  `installationId` nem revelar qualquer dado do editor anterior;
- usar os estados públicos `created`, `unchanged`, `plan-rebound` e `taken-over`;
- gerar `leaseId` como identificador opaco, aleatório e imprevisível a cada criação,
  troca de plano ou takeover efetivo;
- iniciar uma validade de sete dias na criação, no rebind para outro plano ativo e
  no takeover efetivo;
- preservar `leaseId` e vencimento no registro repetido da mesma instalação/plano
  e na repetição de takeover pela instalação que já assumiu;
- recusar registro de outra instalação enquanto o lease estiver ativo, sem alterar
  valor ou TTL; takeover é o único caminho que pode substituir o editor;
- oferecer no service as operações coesas de registro, takeover, validação e
  renovação posterior a sync aceita, sem acesso Redis por controller ou command;
- validar atomicamente a tupla `leaseId` + `installationId` + `planId` antes de
  autorizar uso do lease;
- renovar atomicamente por mais sete dias somente a mesma tupla e somente pela
  operação explicitamente nomeada para sincronização já aceita;
- classificar lease ausente como expirado e divergência diante de um lease atual
  como revogada, inclusive para um `leaseId` antigo da mesma instalação;
- falhar fechado em erro, timeout, reset ou indisponibilidade Redis;
- implementar as transições condicionais com scripts Lua pequenos e determinísticos,
  sem `WATCH`, lock por processo, `KEYS`, `FLUSH*` ou conexão adicional;
- cobrir regras, corridas e TTL com unitários e E2E seriais usando Redis real
  efêmero;
- fornecer seeds e cURLs locais reproduzíveis para todos os caminhos HTTP.

### Não incluído

- ingestão, validação de conteúdo, ordenação ou persistência de snapshots;
- endpoint HTTP de validação ou renovação isolada; essas operações são fronteiras
  internas para a ingestão da issue 85;
- finalização, cancelamento, histórico MongoDB ou cálculo de métricas;
- criação de sessão offline paralela ao lease ou alteração da sessão online de 24
  horas definida pela ADR-0010;
- UI de takeover, conflito, expiração ou pendências;
- chamada dos novos endpoints pela UI, pelo plugin Android ou por WorkManager;
- alteração de SQLite, secure storage, UUID da instalação ou dados locais do
  aparelho revogado;
- identificação de hardware, fingerprinting ou metadados descritivos do aparelho;
- armazenamento do lease no MongoDB, tombstone durável ou job de limpeza;
- importação de snapshots pertencentes a lease expirado ou substituído;
- mudança da seleção de plano ativo ou takeover implícito durante login,
  preparação, reautenticação ou sincronização;
- múltiplos editores, merge automático ou recuperação server-side do aparelho
  anterior.

## Projetos e documentação afetados

- API e endpoints: criar domínio HTTP documentado em
  `api/docs/sdd/endpoints/offline-training-lease.md`; integrar controller, commands
  e service ao módulo de treino e ao Redis compartilhado; atualizar a arquitetura
  base da API e o catálogo de seeds.
- UI e rotas: nenhum comportamento de tela muda nesta entrega. A UI e os adapters
  Android serão consumidores em features posteriores.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` somente na implementação
  para registrar a nova autorização disponível no backend, sem declarar que o
  cliente já a utiliza.
- Contratos em `@dall-fit/types`: não alterar nesta entrega. Como ainda não existe
  consumidor UI, request e response permanecem DTOs/tipos exclusivos da API; a
  issue consumidora deverá promovê-los atomicamente quando necessário.
- Decisões arquiteturais: registrar uma ADR própria para a chave única por pessoa,
  o fence `leaseId`, TTL deslizante condicionado e ausência de autorização no
  MongoDB. A ADR-0010 continua proprietária da sessão online e não é substituída.
- Handlers e fixtures MSW: não se aplica, pois nenhum consumidor UI chama os
  endpoints nesta feature.
- Mocks de repositories/caches nos unitários da API: commands substituem o service;
  o service substitui o client/chave/relógio ou sua fronteira tipada, sem Redis
  real em unitários.
- Fixtures MongoDB/Redis nos E2E: preparar pessoa, sessão nativa, plano pessoal
  ativo e leases determinísticos; limpar somente as chaves do cenário no Redis
  efêmero dedicado.

## Requisitos funcionais

1. A identidade autenticada vem exclusivamente da sessão Bearer nativa verificada.
   `installationId` é UUID v4 estritamente validado e continua sendo apenas um
   identificador aleatório da instalação, sem prova de hardware ou identidade.
2. Antes de acessar Redis, o command resolve a seleção ativa pelo service vigente
   de planos pessoais. Ausência responde `404 ACTIVE_TRAINING_PLAN_NOT_FOUND` e
   não cria nem modifica lease.
3. A chave lógica é `offline-training-lease` por `personId`. Plano e instalação são
   campos do valor, não dimensões capazes de criar chaves concorrentes; assim uma
   pessoa nunca possui dois editores ativos por planos diferentes.
4. `PUT /training/offline-lease` executa uma única transição atômica:
   - chave ausente: grava nova tupla com novo `leaseId`, TTL de sete dias e estado
     `created`;
   - mesma instalação e mesmo plano: devolve a tupla vigente como `unchanged`, sem
     renovar nem reescrever seu TTL;
   - mesma instalação e outro plano ativo: troca plano e `leaseId`, inicia sete
     dias e devolve `plan-rebound`;
   - instalação diferente: não altera valor ou TTL e responde
     `409 OFFLINE_LEASE_TAKEOVER_REQUIRED`.
5. `POST /training/offline-lease/takeover` executa uma única transição atômica:
   - chave ausente: cria como `created`;
   - mesma instalação e mesmo plano: devolve `unchanged`, sem renovar TTL;
   - mesma instalação e outro plano: executa `plan-rebound`;
   - instalação diferente: substitui integralmente a tupla, cria outro `leaseId`,
     inicia sete dias e devolve `taken-over`.
6. Repetir takeover depois que a primeira resposta foi perdida encontra a mesma
   instalação/plano e devolve o mesmo `leaseId` como `unchanged`. A repetição não
   prolonga a validade e não revoga novamente.
7. `expiresAt` é timestamp ISO derivado do instante server-side usado na operação.
   O valor persistido e o TTL Redis representam o mesmo limite. Registro repetido
   nunca recalcula essa data.
8. A validação interna recebe pessoa, plano, instalação e `leaseId`. Chave ausente
   produz `410 OFFLINE_LEASE_EXPIRED`; lease atual com qualquer campo divergente
   produz `409 OFFLINE_LEASE_REVOKED`; coincidência integral devolve o lease sem
   tocar no TTL.
9. Depois de expirar, um registro pode criar novo lease até para a mesma instalação,
   mas sempre com outro `leaseId`. Snapshot antigo conserva o fence anterior e não
   pode ser validado ou importado sob a nova autorização.
10. A renovação interna recebe a mesma tupla somente depois que o chamador futuro
    classificou a sincronização como aceita. O script revalida todos os campos e,
    apenas em coincidência, atualiza `expiresAt` e TTL para sete dias contados do
    novo aceite; duplicata idempotente aceita também poderá renovar quando a issue
    85 assim definir como sync aceita.
11. Leitura, preparação do plano, login, registro, takeover, validação sem ingestão,
    erro de snapshot e qualquer chamada rejeitada nunca renovam o lease.
12. O service não recebe DTO HTTP e o command não recebe client/chave Redis. O
    controller valida, registra entrada sanitizada, chama seu command e devolve a
    response montada pelo command.
13. Uma corrida entre dois registros sobre chave ausente possui um único vencedor.
    O perdedor observa o valor já criado e recebe takeover obrigatório, sem janela
    intermediária na qual ambas as instalações sejam editoras.
14. Registro concorrente com takeover é ordenado pelo Redis. O resultado final
    corresponde à última transição efetivamente linearizada; toda response descreve
    o estado observado pela própria operação, e nenhum compare-and-set ocorre em
    memória do processo Nest.
15. Falha Redis em qualquer operação responde `503 OFFLINE_LEASE_UNAVAILABLE` nos
    endpoints e propaga erro técnico tipado na fronteira interna. Não existe
    autorização otimista, fallback MongoDB ou lease local por instância.
16. O takeover não apaga, lê nem devolve dados do aparelho anterior. O cliente
    revogado decidirá recuperação ou descarte local em features posteriores e não
    retomará sincronização automática.
17. Os endpoints usam `Cache-Control: private, no-store`; o CORS e o contrato
    `ApiError` vigentes permanecem. O rate limit reutiliza a política de lifecycle
    de treino por pessoa/sessão e IP, sem criar quota baseada em UUID informado
    pelo cliente.
18. Status de sucesso é `200` tanto para registro quanto para takeover. A response
    usa o estado explícito, evitando que idempotência dependa de alternar `200` e
    `201`.

## Requisitos não funcionais

- Acessibilidade: não se aplica diretamente; nenhuma UI é criada ou modificada.
- Performance:
  - cada operação usa uma chave e um script curto, com complexidade constante;
  - não há scan, polling, conexão por request ou coleção de histórico de leases;
  - scripts não executam I/O externo, loops sobre coleções ou trabalho proporcional
    ao número de pessoas.
- Segurança e privacidade:
  - somente sessão nativa autenticada acessa os endpoints;
  - `leaseId` é gerado por fonte criptograficamente segura e funciona apenas como
    fence dentro da identidade autenticada; não substitui o Bearer;
  - body não aceita `personId`, `planId`, TTL, estado ou identificador do editor
    anterior;
  - UUID, `leaseId`, pessoa, plano, token, chave Redis e valor persistido não são
    registrados, refletidos em erro ou expostos a outro editor;
  - Redis conserva somente autorização efêmera e nenhuma descrição do aparelho.
- Observabilidade:
  - todos os métodos seguem `Classe -> método -> etapa:` e registram entrada,
    dependências, branches e saída com resumos sanitizados;
  - logs podem conter apenas operação, estado público, flags de correspondência,
    duração restante arredondada e código de erro, nunca os identificadores ou o
    payload do lease;
  - corridas, takeover, expiração, revogação e indisponibilidade são distinguíveis
    por branch/código sem expor o editor.
- Resiliência: toda decisão que lê e escreve o lease é atômica no Redis. Timeout ou
  resposta ambígua é seguro para retry porque registro e takeover são idempotentes
  para a instalação que já ocupa o lease.
- Compatibilidade: a sessão online de treino, autenticação Web, CSRF e endpoints
  existentes permanecem inalterados. Reset do Redis expira leases e exige novo
  registro; não promove dados históricos.
- Limite de execução: a implementação deve caber em uma sessão de até cinco horas.
  Ela reutiliza módulo de treino, plano ativo, autenticação nativa, singleton Redis,
  key service, erros globais e infraestrutura E2E; não cria cliente Android,
  snapshot ou persistência MongoDB.

## Critérios de aceite

### Cenário 1 — primeira instalação registra o plano ativo

- Forma de validar: cenário vivo do novo endpoint com seed e cURL Bearer nativo.
- Given: pessoa autenticada possui plano ativo e nenhuma chave de lease.
- When: envia `PUT /training/offline-lease` com UUID válido.
- Then: recebe `200`, `state: created`, `planId`, `leaseId` e vencimento em sete
  dias; o Redis contém uma única chave por pessoa com TTL correspondente.

### Cenário 2 — registro repetido não renova

- Forma de validar: cenário vivo com relógio/seed controlados e cURLs repetidos,
  complementado pelo E2E que inspeciona TTL.
- Given: a mesma instalação e o mesmo plano já possuem lease ativo.
- When: repete o registro depois de parte da validade transcorrer.
- Then: recebe `unchanged`, o mesmo `leaseId` e o mesmo `expiresAt`; o TTL não volta
  a sete dias.

### Cenário 3 — troca de plano pela mesma instalação cria novo fence

- Forma de validar: seed que altera a seleção ativa entre duas chamadas e cURL do
  registro.
- Given: a instalação possui lease para A e a pessoa passa a ter B como plano
  ativo.
- When: a mesma instalação registra novamente.
- Then: recebe `plan-rebound`, `planId` de B, outro `leaseId` e sete dias novos; o
  lease de A não pode validar snapshots posteriores.

### Cenário 4 — outra instalação não toma o lease por registro

- Forma de validar: cenário vivo com lease da instalação A e cURL usando B.
- Given: A possui lease ativo.
- When: B chama o endpoint de registro.
- Then: recebe `409 OFFLINE_LEASE_TAKEOVER_REQUIRED`; identificadores de A não são
  devolvidos e valor, fence e TTL permanecem intactos.

### Cenário 5 — takeover troca o editor atomicamente

- Forma de validar: cenário vivo com lease de A e cURL de takeover por B, além de
  E2E com requests concorrentes.
- Given: A possui lease ativo.
- When: B executa takeover explícito.
- Then: B recebe `taken-over`, novo `leaseId` e sete dias; A deixa de validar e em
  nenhum instante observável existem dois editores.

### Cenário 6 — retry de takeover é idempotente

- Forma de validar: cURL de takeover repetido e inspeção controlada do TTL.
- Given: B já concluiu takeover, mas o cliente não confirmou a primeira response.
- When: B repete exatamente a operação.
- Then: recebe `unchanged` com o mesmo fence e vencimento; não há nova revogação nem
  renovação.

### Cenário 7 — expiração é diferente de revogação

- Forma de validar: E2E do service com relógio/TTL controlado e Redis efêmero;
  `não se aplica` a cURL nesta feature porque validação pertence à fronteira interna
  ainda sem endpoint de snapshot.
- Given: em um caso a chave expirou; em outro, takeover ou rebind deixou um lease
  atual divergente do fence apresentado.
- When: a validação interna é executada.
- Then: o primeiro caso produz `OFFLINE_LEASE_EXPIRED` e o segundo
  `OFFLINE_LEASE_REVOKED`, sem alterar TTL ou conteúdo.

### Cenário 8 — lease antigo não é ressuscitado

- Forma de validar: E2E do service com expiração, novo registro pela mesma UUID e
  tentativa de validar o fence anterior.
- Given: um lease expirou e a mesma instalação adquiriu outro para o plano.
- When: apresenta `installationId` atual com o `leaseId` antigo.
- Then: a validação é recusada como revogada diante do lease atual; nenhum snapshot
  histórico pode usar a autorização nova.

### Cenário 9 — somente sync aceita renova

- Forma de validar: unitário do service e E2E Redis chamando separadamente
  validação e renovação pós-aceite.
- Given: existe lease válido com TTL parcialmente consumido.
- When: registro, takeover idempotente, validação simples e erro funcional ocorrem,
  e depois a operação interna de sync aceita é executada.
- Then: somente a última operação atualiza `expiresAt` e devolve o TTL a sete dias.

### Cenário 10 — corrida de registros tem um vencedor

- Forma de validar: E2E Redis dispara simultaneamente registros de duas instalações
  para a mesma pessoa, sem usar testes `concurrent` da suíte.
- Given: não existe lease.
- When: duas operações chegam em paralelo ao Redis real.
- Then: exatamente uma recebe `created`; a outra recebe takeover obrigatório e a
  chave final contém somente o vencedor.

### Cenário 11 — ausência de plano ou sessão nativa falha antes do Redis

- Forma de validar: cenários vivos com seeds e cURLs de plano ausente, cookie Web e
  body inválido.
- Given: respectivamente não há plano ativo, o transporte é Web ou o UUID é
  inválido.
- When: registro ou takeover é solicitado.
- Then: a API devolve o erro estável correspondente sem criar, consultar ou renovar
  lease.

### Cenário 12 — indisponibilidade Redis falha fechada

- Forma de validar: E2E automatizado com Redis efêmero interrompido; o cenário vivo
  documenta `não se aplica` para seed/cURL por exigir isolamento da infraestrutura.
- Given: pessoa, sessão e plano são válidos, mas Redis está indisponível.
- When: registro ou takeover é solicitado.
- Then: recebe `503 OFFLINE_LEASE_UNAVAILABLE`; a API não declara autorização,
  takeover ou renovação.

## Estratégia de entrega e compatibilidade

1. Introduzir domínio e erros internos do lease, além dos DTOs API-only estritos.
2. Acrescentar o subject ao `RedisKeyService` e implementar scripts atômicos para
   registro/takeover e validação/renovação sobre o singleton vigente.
3. Criar o service público do domínio e commands separados para registro e
   takeover; ambos resolvem o plano ativo antes da transição Redis.
4. Criar controller nativo, respostas `no-store` e rate limit de lifecycle já
   existente, sem alterar guards Web globais.
5. Cobrir service, commands, controller, concorrência, TTL, falhas e redaction;
   acrescentar seeds/cURLs e documentação viva/ADR na implementação autorizada.

A mudança HTTP é aditiva e não possui consumidor nesta entrega. A chave não requer
migração porque o recurso ainda não existe. Deploy e rollback deixam chaves
inertes no namespace até o TTL; nenhum MongoDB precisa ser migrado ou limpo. Uma
versão posterior que promova os contratos a `@dall-fit/types` deve atualizar API,
UI, mocks e testes atomicamente.

Uma troca concorrente da seleção ativa e do registro não possui transação
MongoDB–Redis. Cada request usa o plano ativo resolvido antes de sua transição; a
próxima preparação/entrada registra novamente e executa `plan-rebound` pela mesma
instalação. A ingestão futura continuará obrigada a confrontar pessoa, plano,
instalação e fence, portanto uma leitura antiga não autoriza snapshot arbitrário.

## Plano de testes

- Unitários:
  - DTO aceita somente UUID v4 e rejeita campos adicionais;
  - commands resolvem plano, chamam o service com identidade server-side e montam
    cada estado/erro sem acessar Redis;
  - service cobre matriz de chave ausente, mesma instalação/plano, rebind,
    instalação diferente, takeover e retry;
  - validação diferencia ausência e divergência sem renovar;
  - renovação pós-aceite exige coincidência integral e move TTL exatamente uma vez;
  - falha/timeout Redis é traduzido sem fallback;
  - logs e erros não contêm pessoa, plano, instalação, `leaseId`, chave ou valor.
- E2E serial com MongoDB e Redis efêmeros reais:
  - autenticação Bearer nativa, rejeição de cookie Web e validação de body;
  - resolução de plano ativo e ausência da seleção;
  - criação, estados públicos, `Cache-Control`, erro uniforme e request ID;
  - registro repetido e retry de takeover preservam ID/expiração/PTTL;
  - rebind e takeover trocam fence e reiniciam sete dias;
  - registro por segunda instalação preserva valor e PTTL;
  - duas instalações correndo produzem um vencedor;
  - validação/renovação atômica, expiração real e fence antigo após novo registro;
  - Redis interrompido produz indisponibilidade fechada;
  - regressão das sessões online de treino e dos canais Web/native.
- Seeds e contrato:
  - fixtures fictícias e independentes para criação, idempotência, takeover
    obrigatório, takeover efetivo, plano ausente e UUID inválido;
  - cada cenário HTTP do endpoint vivo começa com seed ou justificativa e cURL
    completo usando Bearer local fictício, sem placeholders ou dados reais.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`.

## Riscos e decisões

- Foi escolhida uma chave por pessoa, com plano e instalação no valor. Chaves por
  plano permitiriam que duas instalações fossem editoras de planos diferentes da
  mesma pessoa, contrariando a exclusividade global.
- O plano é derivado no servidor. Aceitar `planId` do body transformaria o cliente
  em autoridade sobre qual plano recebe a autorização.
- `leaseId` evita o problema ABA: expirar e registrar novamente a mesma UUID não
  torna snapshots do lease anterior válidos. UUID continua identificando apenas a
  instalação; o fence identifica uma concessão específica.
- Registro da mesma instalação/plano e retry de takeover não renovam. Permitir que
  operações administrativas estendessem o prazo contrariaria a regra de que apenas
  sincronização aceita demonstra atividade válida.
- Rebind de plano gera nova validade porque representa uma concessão para outro
  plano ativo; snapshots do fence anterior não migram silenciosamente.
- Sem chave atual, a validação classifica expiração. Com chave divergente,
  classifica revogação. Não se mantém tombstone: os dois caminhos recusam dados, e
  o fence impede ressuscitá-los após novo registro.
- Lua é usado para linearizar leitura, comparação, escrita e TTL em uma ida ao
  Redis. Os scripts permanecem pequenos porque execução longa bloquearia outras
  atividades do servidor.
- Takeover exige apenas autenticação nativa e gesto/protocolo explícito no endpoint;
  confirmação visual pertence à UI futura. O endpoint nunca faz takeover por
  detectar UUID desconhecido.
- DTOs permanecem locais à API enquanto não existe consumidor. Publicá-los agora
  em `@dall-fit/types` criaria contrato compartilhado especulativo proibido pelo
  SDD.
- O escopo cabe no limite de cinco horas por reutilizar infraestrutura, plano ativo,
  autenticação, erros e E2E atuais. Se a implementação exigir UI, Android,
  snapshots, MongoDB ou coordenação transacional entre bancos, deve parar e
  retornar ao refinamento.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Uma única instalação editora por pessoa
- Plano ativo e identidade derivados no servidor
- Registro e takeover explícitos, atômicos e idempotentes
- Fence `leaseId` impede reutilização histórica após expiração ou substituição
- TTL de sete dias renovado somente por sincronização aceita
- Expiração, revogação, takeover obrigatório e Redis indisponível distinguíveis
- Nenhuma autorização offline persistida no MongoDB
- Sessão online de treino e canais Web/native preservados
- Contratos, endpoint, flow, arquitetura e ADR afetados atualizados
- Seeds, mocks unitários e E2E Redis atualizados conforme o impacto
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz e E2E da API aprovados
