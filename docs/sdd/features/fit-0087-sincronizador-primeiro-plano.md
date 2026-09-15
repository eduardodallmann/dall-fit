# Feature Spec: Sincronizador nativo em primeiro plano

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #87](https://github.com/eduardodallmann/dall-fit/issues/87).
- Problema: o motor nativo da FIT-0082 já persiste atomicamente um snapshot corrente
  e um estado `pending` por execução, e a API das FIT-0085/0086 já aceita snapshots
  completos idempotentes. Ainda não existe o consumidor Android que retire essas
  pendências do SQLite, envie-as sequencialmente e preserve uma alteração criada
  durante o request.
- Resultado: enquanto o processo do aplicativo estiver ativo, um único motor nativo
  de sincronização por instalação observa os snapshots pendentes, reivindica uma
  revisão por vez, envia `PUT /training/offline-snapshot` com Bearer nativo, remove
  somente a revisão confirmada, aplica retry recuperável e conserva no SQLite os
  caminhos que dependem de ação futura. Gravações locais continuam imediatas e nunca
  aguardam a rede.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [documentação oficial das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [endpoint de snapshot offline](../../../api/docs/sdd/endpoints/offline-training-snapshot.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [ADR-0012 — Capacitor Android e fronteira de plataforma](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md);
  - [ADR-0013 — sessões Web e nativas isoladas](../adr/ADR-0013-sessoes-web-e-native-isoladas.md);
  - [ADR-0014 — motor nativo de persistência offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [ADR-0015 — lease offline de treino](../adr/ADR-0015-lease-offline-de-treino-no-redis.md);
  - [FIT-0081 — login e isolamento de conta Android](fit-0081-login-isolamento-conta-android.md);
  - [FIT-0082 — núcleo nativo de persistência offline](fit-0082-nucleo-nativo-persistencia-offline.md);
  - [FIT-0084 — lease Redis](fit-0084-lease-redis-plano-instalacao-pessoa.md);
  - [FIT-0085 — ingestão de snapshots](fit-0085-receber-snapshots-idempotentes-treino-api.md);
  - [FIT-0086 — terminais e conflitos offline](fit-0086-finalizar-cancelar-resolver-conflitos-execucoes-offline.md);
  - [Android `ConnectivityManager`](https://developer.android.com/reference/android/net/ConnectivityManager);
  - [Android `HttpURLConnection`](https://developer.android.com/reference/java/net/HttpURLConnection);
  - [Android `SQLiteOpenHelper`](https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper).
- Features relacionadas: a FIT-0081 fornece a sessão nativa; a FIT-0082 fornece o
  banco, o snapshot por execução, `sync_state` e o lock justo; as FIT-0085/0086
  fornecem o protocolo HTTP completo. A issue 88 reutilizará o mesmo motor no
  WorkManager; a issue 89 produzirá os snapshots da jornada; a issue 90 consumirá
  os estados que exigem login, takeover, resolução ou descarte.

## Escopo

### Incluído

- evoluir por migration incremental a tabela `sync_state` existente, sem criar uma
  segunda fila ou duplicar o payload de `snapshots`;
- atribuir a cada execução uma sequência local monotônica e estável, independente do
  UUID e preservada quando uma revisão nova substitui seu snapshot;
- acrescentar ao `OfflineStorageService` primitives transacionais de claim,
  reagendamento, bloqueio, ação necessária, remoção condicionada e recuperação de
  claim interrompido;
- criar um motor Android de escopo da aplicação, reutilizável futuramente pelo
  WorkManager e sem dependência de `Activity`, WebView ou React;
- impedir dois loops ou uploads da mesma instalação em paralelo, coalescendo todo
  gatilho recebido durante uma passagem em uma nova passagem posterior;
- usar `HttpURLConnection`, já disponível no Android e adotado pelo downloader
  vigente, atrás de uma port injetável e testável;
- enviar individual e sequencialmente o request v1 já produzido pelo snapshot local
  para `PUT /training/offline-snapshot`;
- obter o Bearer vigente pelo coordenador nativo da FIT-0081 e entregá-lo somente em
  memória ao motor durante o processo ativo, sem nova persistência ou cópia do token;
- classificar integralmente os sucessos e erros documentados pelo endpoint, com
  retry exponencial com jitter e respeito a `Retry-After`;
- observar mudança local, conectividade restaurada, abertura/resume e ação
  `Sincronizar agora`;
- expor leitura canônica e evento best-effort de estado da sincronização pela bridge;
- persistir, de forma privada e limitada ao caminho afetado, os detalhes seguros
  exigidos pela futura resolução da issue 90;
- descartar silenciosamente somente um erro permanente isolado que tenha sido
  superado pelo sucesso de uma execução local posterior;
- acrescentar testes Java locais, testes Android instrumentados e Vitest da bridge e
  do coordenador TypeScript.

### Não incluído

- `WorkManager`, `JobScheduler`, `AlarmManager`, execução com o processo encerrado
  ou qualquer garantia de sincronização em segundo plano;
- Android Foreground Service, notificação persistente ou permissão associada;
- produzir snapshots a partir das ações da rota Treinar;
- registrar, renovar ou tomar o lease; o request enfileirado já possui o fence
  produzido pelo consumidor futuro;
- telas, indicadores visuais, resumo provisório, login, takeover, comparação ou
  confirmação de descarte;
- executar automaticamente uma escolha `local | server` ou fazer merge de conflito;
- endpoint, contrato HTTP ou alteração de backend;
- lote de snapshots, requests paralelos, upload de mídia ou analytics offline;
- persistência de Bearer, logs ou telemetria adicional;
- suporte iOS, IndexedDB ou implementação equivalente na Web/PWA.

## Projetos e documentação afetados

- API e endpoints: nenhum código ou contrato muda. A implementação valida seu
  parser contra `api/docs/sdd/endpoints/offline-training-snapshot.md` e seus tipos
  públicos vigentes.
- UI e rotas: nenhuma rota ou apresentação muda. Atualizar na implementação os
  documentos vivos de arquitetura e testes da UI para registrar motor, bridge,
  lifecycle, conectividade e cobertura nativa.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` para substituir a menção
  ao sincronizador futuro pela capacidade nativa entregue, sem declarar a jornada
  offline da issue 89 como existente.
- Contratos em `@dall-fit/types`: não alterar. A bridge usa contratos exclusivos da
  UI e o HTTP consome o JSON v1 vigente.
- Decisões arquiteturais: atualizar a ADR-0014 somente se necessário para registrar
  que foreground e futuro Worker reutilizam o mesmo motor e a mesma fila; não criar
  uma ADR nem um segundo lock sem nova decisão transversal.
- Handlers e fixtures MSW: não se aplica; a UI Web não realiza request novo e o
  transporte nativo é validado por doubles Java.
- Mocks de repositories/caches nos unitários da API: não se aplica; a API não muda.
- Fixtures MongoDB/Redis nos E2E: não se aplica; a API não muda.
- Android: migration do banco, primitives no serviço proprietário, motor de sync,
  transporte HTTP, observador de conectividade, composição singleton, plugin e
  testes.

## Modelo persistido e concorrência

1. `snapshots` continua sendo a única proprietária do payload completo e conserva
   no máximo uma revisão corrente por `execution_id`.
2. A migration seguinte evolui `sync_state`; ela não cria `sync_queue`. Além da
   revisão do snapshot e dos metadados vigentes, o estado passa a guardar somente:
   - `queue_sequence`, inteiro monotônico atribuído uma vez por execução;
   - `status`: `pending | in_flight | retry_wait | blocked | action_required`;
   - `attempt_count` da revisão corrente;
   - `next_attempt_at` opcional;
   - `reason` opcional de enum fechada e sanitizada;
   - `action_details_json` opcional, apenas para o detalhe seguro devolvido pela API
     que a issue 90 precisará apresentar ou resolver;
   - revisão operacional e timestamp vigentes do motor.
3. A sequência vem de contador monotônico nos metadados do motor. UUID, timestamps
   do cliente e ordem lexicográfica nunca decidem qual execução é posterior.
4. `putSnapshot` conserva `queue_sequence` da execução, substitui o payload somente
   por revisão superior e, na mesma transação, aponta `sync_state` para essa revisão
   como `pending`, zera retry e remove erro/detalhe da revisão superada.
5. O claim escolhe a menor `queue_sequence` elegível, confronta a revisão e muda
   somente aquela linha para `in_flight` dentro do lock justo e da transação SQLite.
   Payload e metadados reclamados são copiados para memória; nenhum lock do storage
   permanece adquirido durante rede, espera ou backoff.
6. Uma revisão N+1 gravada durante o upload N volta a linha para `pending`. A resposta
   de N só pode remover ou alterar N; compare-and-set falha diante de N+1 e a passagem
   seguinte envia o snapshot novo.
7. Ao iniciar o motor depois de morte do processo, todo `in_flight` sem proprietário
   em memória volta atomicamente para `pending`. O endpoint idempotente torna seguro
   repetir um request aceito cuja resposta não foi observada.
8. Um executor serial e um sinal de passagem ativa formam o lock global de sync da
   instância singleton. Um gatilho concorrente apenas marca `runAgain`; ele não abre
   outro upload, não cancela o request atual e não cria uma segunda fila. O lock justo
   do `OfflineStorageService` continua proprietário das regiões SQLite curtas.
9. `clearAccountDataAtomically` interrompe novos claims, invalida a credencial em
   memória, aguarda/cancela localmente o loop sem interpretar request remoto como
   rejeitado e remove snapshots, estados e detalhes junto da conta. Resposta tardia
   de uma geração encerrada não alcança outra conta.

## HTTP, autenticação e retry

1. O transporte usa exatamente `PUT /training/offline-snapshot`, JSON UTF-8,
   `Authorization: Bearer <token>` e `Accept: application/json`. Nunca envia cookie
   nem CSRF e não segue redirect para outro host ou downgrade de HTTPS.
2. O request persistido pela produtora futura corresponde integralmente a
   `PutOfflineTrainingSnapshotV1Request`; o motor trata seu `snapshot` como JSON
   opaco, confronta apenas envelope, IDs e revisão normalizados e não recalcula
   regras de treino.
3. O adapter TypeScript obtém o Bearer pela port da FIT-0081 somente quando inicia
   ou acorda uma passagem e o entrega ao plugin em memória. O plugin e o SQLite não
   persistem, duplicam ou emitem o valor. A ausência de Bearer conserva a fila em
   pausa global de autenticação.
4. A URL-base vem da configuração vigente da UI, é entregue sem segredo à bridge e
   validada antes do uso: HTTPS fora do desenvolvimento; HTTP permitido somente nos
   hosts locais aceitos pelo ambiente de desenvolvimento.
5. Conexão e leitura possuem timeouts finitos de 15 e 30 segundos. O corpo de
   sucesso/erro é limitado antes de ser materializado e o `disconnect` ocorre em
   `finally`. Parser inválido nunca converte resposta desconhecida em aceite.
6. Rede, timeout, `408`, `429`, `500`, `502`, `503`, `504` e
   `OFFLINE_TRAINING_SYNC_IN_PROGRESS` são temporários. Demais `5xx` também são
   temporários, salvo contrato futuro explicitamente documentado em contrário.
7. Retry automático usa base de um segundo, multiplicador dois, jitter uniforme de
   50% para cada lado e teto de 60 segundos. Relógio, sleeper e fonte de aleatoriedade
   são injetáveis. `Retry-After` válido, em segundos ou data HTTP, prevalece e é
   limitado entre um segundo e quinze minutos; valor inválido usa o backoff comum.
8. Cada revisão recebe no máximo cinco tentativas automáticas consecutivas por
   passagem. Ao atingir o limite, permanece em `retry_wait`; mudança de revisão,
   conectividade restaurada, resume ou `Sincronizar agora` abre uma nova passagem
   sem apagar a contagem diagnóstica e sem perder o snapshot.
9. Enquanto aguarda retry, o motor pode processar outra execução elegível. O timer
   existe somente enquanto o processo está ativo; morte do processo conserva
   `next_attempt_at`, e abertura posterior reavalia o instante.

## Matriz de resultados

1. `200` só confirma remoção quando `data` corresponde à execução e revisão
   reclamadas e possui um estado conhecido:
   - `accepted`, `duplicate`, `completed`, `duplicate-completed`, `cancelled` ou
     `duplicate-cancelled` removem apenas a revisão reclamada;
   - `resolved-local` ou `resolved-server` também podem removê-la quando uma futura
     escolha explícita da issue 90 tiver produzido aquele request;
   - corpo ausente, malformado, divergente ou estado desconhecido preserva a fila e
     vira falha de protocolo isolada.
2. `401 AUTHENTICATION_REQUIRED` e `403 NATIVE_SESSION_REQUIRED` invalidam a
   credencial em memória, pausam globalmente novos uploads, preservam todas as
   pendências e notificam o coordenador da FIT-0081 para encerrar a geração
   autenticada. Nova autenticação da mesma pessoa acorda a fila preservada.
3. `400 AUTH_TRANSPORT_AMBIGUOUS` é falha global de implementação/protocolo; nenhum
   snapshot é removido e o motor não entra em loop.
4. `409 OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT` preserva a versão local e grava
   `action_required: conflict` com `serverVersion`, `conflictToken` e
   `allowedResolution` seguros. O caminho aguarda a issue 90; não escolhe versão.
5. `409 OFFLINE_TRAINING_EXECUTION_IMMUTABLE` preserva a versão local e grava
   `action_required: discard-local-only` com estado terminal e eventual resumo
   canônico. O descarte exige o fluxo futuro já decidido na issue 90.
6. `409 OFFLINE_TRAINING_CONFLICT_TOKEN_STALE` preserva a versão e volta o caminho
   para obtenção de conflito corrente; não reutiliza token obsoleto.
7. `409 OFFLINE_LEASE_REVOKED` grava `action_required: lease-revoked`; `410
   OFFLINE_LEASE_EXPIRED` grava `action_required: lease-expired`. Nenhum deles
   remove ou retenta automaticamente o snapshot.
8. `400 VALIDATION_ERROR`, `413 OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE` e outro `4xx`
   definitivo não mapeado deixam a revisão em `blocked` com motivo sanitizado e
   continuam a fila. Uma resposta que determine atualização obrigatória usa
   `action_required: update-required` e pausa globalmente novos uploads.
9. `429` usa `Retry-After` conforme a regra anterior. `408`, falhas temporárias,
   indisponibilidade e I/O preservam a revisão em `retry_wait`.
10. Depois que uma execução de sequência S sincroniza com sucesso, o motor remove
    silenciosamente snapshots `blocked` de sequência menor que S. Não remove por
    essa regra `action_required`, `retry_wait`, a execução corrente, uma sequência
    maior nem dado de outra conta.

## Gatilhos e estado observável

1. Gravação de snapshot: depois do commit, agenda uma passagem com debounce de 500
   milissegundos. Escritas adicionais apenas renovam o snapshot corrente e o sinal.
2. Abertura ou resume: o coordenador confere conta e Bearer, reconcilia `in_flight`
   órfão, lê o estado canônico e agenda imediatamente quando houver elegível.
3. Conectividade: um único `registerDefaultNetworkCallback` por processo agenda ao
   receber uma rede padrão utilizável. O callback não executa I/O longo, é removido
   no teardown e exige somente `ACCESS_NETWORK_STATE`.
4. `Sincronizar agora`: abre uma passagem imediatamente e rearma retries temporários;
   se outra passagem estiver ativa, marca `runAgain` sem interromper seu upload.
5. O plugin acrescenta `triggerSync`, `getSyncState` e o evento camelCase
   `syncStateChanged`. O evento é hint best-effort; montagem e resume sempre reparam
   perda, atraso ou duplicação por `getSyncState`.
6. O resumo público não expõe payload, pessoa, Bearer, fence, token de conflito,
   erro bruto ou ID de execução. Ele informa apenas revisão observável, estado
   `idle | syncing | pending | authentication-required | action-required`, total
   pendente e existência de ação necessária.
7. Sucesso comum, coalescência, retry e erro permanente isolado não produzem toast,
   modal, notificação ou Analytics. A issue 90 decidirá a apresentação dos estados
   de ação já discriminados.

## Requisitos não funcionais

- Acessibilidade: nenhuma superfície visual muda. Eventos futuros não substituem
  leitura canônica nem anunciam sucesso operacional comum.
- Performance:
  - persistência local nunca espera rede ou backoff;
  - existe no máximo um request da instalação em voo;
  - coalescência mantém um payload por execução e usa CAS de revisão;
  - consultas usam a sequência indexada e materializam somente o item reclamado.
- Segurança e privacidade:
  - Bearer permanece no secure storage vigente e somente em memória durante uso;
  - banco, detalhes de ação e snapshots continuam privados, fora de backup e
    removidos na limpeza da conta;
  - redirects de autenticação, payloads, tokens, IDs pessoais e conteúdo do treino
    nunca entram em logs, eventos, exceções da bridge ou Analytics;
  - Web/PWA não registra callback, plugin ou armazenamento alternativo.
- Observabilidade:
  - logs usam `NomeDaClasse -> nomeDoMetodo -> etapa:` e somente categorias,
    contagens, revisões técnicas e transições sanitizadas;
  - início/fim de passagem, claim, resultado HTTP classificado, retry e recuperação
    são distinguíveis sem registrar body ou headers;
  - logs permanecem apenas no logcat e não são persistidos pelo aplicativo.
- Compatibilidade:
  - API mínima 29 permanece inalterada;
  - a migration é incremental, transacional e imutável depois de distribuída;
  - não se adiciona dependência HTTP nem um segundo proprietário do banco;
  - o motor aceita um futuro disparador WorkManager pela mesma entrada nativa.

## Critérios de aceite

### Cenário 1 — mudanças rápidas enviam somente a revisão corrente

- Forma de validar: teste Android instrumentado do SQLite e teste Java do motor;
  URL não se aplica porque não há rota nova.
- Given: a execução possui N e recebe N+1 e N+2 antes do claim.
- When: o debounce abre a passagem.
- Then: existe um payload local, N+2 é reclamado e apenas N+2 é enviado.

### Cenário 2 — alteração durante request não se perde

- Forma de validar: teste Android com barreiras e transporte controlado.
- Given: N está em voo.
- When: N+1 é commitado antes da resposta de N e N recebe sucesso.
- Then: a remoção condicionada de N não toca N+1, `runAgain` abre outra passagem e
  N+1 é enviado depois, sem request paralelo.

### Cenário 3 — gatilhos concorrentes não duplicam upload

- Forma de validar: teste Java com mudança, resume, rede e chamada manual concorrentes.
- Given: existe pendência e um upload está bloqueado pela barreira do teste.
- When: todos os gatilhos ocorrem.
- Then: permanece um request em voo e no máximo uma nova passagem fica sinalizada.

### Cenário 4 — morte depois do aceite permite replay

- Forma de validar: teste instrumentado que deixa a linha `in_flight` e recria a
  composição do motor.
- Given: a API pode ter aceitado N, mas o processo morreu antes do commit local.
- When: o aplicativo abre novamente.
- Then: N volta a `pending`, é reenviado e `accepted` ou `duplicate` remove somente N.

### Cenário 5 — falha temporária preserva e retenta

- Forma de validar: teste Java com relógio, jitter e transporte injetados.
- Given: o transporte retorna rede indisponível, `503`, `429` com e sem
  `Retry-After`, e por fim `200 accepted`.
- When: a passagem executa.
- Then: os atrasos obedecem à política, nenhum snapshot é removido antes do `200` e
  o sucesso final limpa a revisão reclamada.

### Cenário 6 — autenticação expirada pausa globalmente

- Forma de validar: Vitest do coordenador e teste Java do classificador.
- Given: há duas execuções e a primeira recebe `401 AUTHENTICATION_REQUIRED`.
- When: o motor classifica a resposta.
- Then: ambas permanecem locais, nenhum outro upload começa com aquele Bearer e a
  geração autenticada é encerrada; login posterior da mesma pessoa acorda a fila.

### Cenário 7 — conflito fica disponível para resolução futura

- Forma de validar: teste Android com erro tipado e detalhe seguro do endpoint.
- Given: uma revisão recebe `OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT`.
- When: a resposta é persistida.
- Then: o snapshot local permanece, somente o detalhe seguro fica associado a ele,
  o caminho não retenta sozinho e o resumo público informa ação necessária.

### Cenário 8 — erro isolado não bloqueia e pode ser superado

- Forma de validar: teste instrumentado com sequências locais A < B.
- Given: A está `blocked` por validação e B está `pending`.
- When: B sincroniza com sucesso.
- Then: B é removida e A é descartada silenciosamente; um item
  `action_required` nas mesmas condições não seria descartado.

### Cenário 9 — execuções usam ordem local, não ordem do UUID

- Forma de validar: teste Android com UUIDs cuja ordem lexicográfica contradiz a
  ordem de criação.
- Given: A foi enfileirada antes de B.
- When: ambas ficam elegíveis.
- Then: o claim escolhe A pela `queue_sequence`; atualizar A não muda sua sequência.

### Cenário 10 — sincronização manual não cancela request

- Forma de validar: teste Java com upload lento.
- Given: N está em voo.
- When: `Sincronizar agora` é acionado.
- Then: N continua, uma passagem posterior é sinalizada e nunca existem dois uploads.

### Cenário 11 — evento perdido é reparado

- Forma de validar: Vitest do adapter e teste Android do plugin.
- Given: o estado muda sem listener ativo.
- When: a bridge monta ou retoma e chama `getSyncState`.
- Then: recebe revisão, estado e contagem canônicos sem depender do replay do evento.

### Cenário 12 — Web/PWA e privacidade permanecem intactos

- Forma de validar: Vitest, testes de fronteira e inspeção de storage/logcat.
- Given: a aplicação executa na Web ou uma sincronização Android falha.
- When: adapters, logs, eventos, Analytics e armazenamento são inspecionados.
- Then: Web/PWA não acessa o plugin; nenhum Bearer, payload, token de conflito ou
  identificador pessoal aparece fora das fronteiras privadas previstas.

## Estratégia de entrega e compatibilidade

1. Evoluir o schema com migration transacional de `sync_state`, contador monotônico
   e índice de elegibilidade; preservar snapshots `pending` existentes e atribuir-lhes
   sequência determinística pela ordem atual `updated_at, execution_id` apenas na
   migração.
2. Acrescentar ao `OfflineStorageService` as primitives CAS e sua recuperação,
   mantendo-o como único proprietário do SQLite e de seu lock.
3. Implementar classificador, backoff e transporte como unidades Java injetáveis;
   confirmar assinatura e lifecycle contra a API Android disponível no SDK vigente.
4. Compor um único motor no `OfflineStorageProvider`, sem segurar lock de banco
   durante I/O e sem Android Foreground Service.
5. Ligar mudança do banco e conectividade ao motor; estender plugin, adapter e
   coordenador TypeScript para credencial efêmera, abertura/resume, teardown e estado.
6. Adicionar testes por camada, atualizar somente então os SDDs vivos afetados,
   revisar código sem uso em API e UI e executar todos os gates aplicáveis.

O rollout antecede o produtor da issue 89. Portanto, a migration precisa preservar
fixtures e pendências do motor, mas não precisa converter um formato HTTP legado. Uma
build anterior ignora as colunas novas somente antes de qualquer distribuição; depois
que a migration for distribuída, downgrade segue o reset seguro já documentado pelo
motor. Rollback funcional desliga gatilhos e uploads, deixando os snapshots locais
para uma versão compatível posterior; não apaga pendências como compensação.

## Plano de testes

- Java local:
  - matriz completa de status/códigos/resultados do endpoint;
  - corpo malformado, response divergente e limite de leitura;
  - backoff, jitter, teto, cinco tentativas e `Retry-After` nos dois formatos;
  - executor único, `runAgain`, debounce e nenhuma interrupção do upload manual;
  - autenticação global, erro isolado, ação necessária e continuidade da fila;
  - redaction de Bearer, payloads, IDs e detalhes.
- Android instrumentado com SQLite real:
  - migration a partir do schema vigente, constraints, rollback e ordem inicial;
  - claim CAS, N+1 durante N, remoção tardia e sequência monotônica;
  - recuperação de `in_flight`, troca/limpeza de conta e isolamento de geração;
  - descarte apenas de `blocked` anterior e preservação de `action_required`;
  - singleton compartilhado entre plugin e consumidor nativo;
  - registro único e teardown do callback de conectividade;
  - evento best-effort e leitura canônica do estado.
- Vitest:
  - contrato da bridge e adapter nativo;
  - montagem, abertura/resume, `Sincronizar agora`, 401 e teardown do coordenador;
  - fallback Web sem registro ou chamada nativa;
  - imports Capacitor permanecem confinados à fronteira vigente.
- Validação manual:
  - APK debug em API 29+ com modo avião, reconexão, background/resume e morte do
    processo;
  - confirmar no inspetor que o Bearer não entra no SQLite e que o logcat está
    sanitizado.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm android:sync`;
  - `pnpm android:build:debug`;
  - `pnpm android:test` em dispositivo ou emulador conectado.

`pnpm -C api test:e2e` e `pnpm test:integration` não são exigidos por esta feature
enquanto endpoint e cenários de rota permanecerem inalterados.

## Riscos e decisões

- A fila evolui `sync_state` em vez de duplicar `snapshots`; isso preserva a fonte
  única e a coalescência por revisão estabelecidas pela FIT-0082.
- `queue_sequence` resolve a noção de execução posterior sem ordenar UUID v4 ou
  confiar no relógio do aparelho.
- O motor possui exclusão mútua de passagem, mas usa o lock vigente do storage apenas
  nas transações curtas. Segurar o lock durante HTTP quebraria a resposta local
  imediata exigida pelo ticket.
- O Bearer cruza a bridge somente para memória no momento de uma request, permissão
  já estabelecida pela FIT-0081. A issue 88 deverá fornecer ao mesmo motor uma fonte
  nativa utilizável sem WebView, sem mudar fila, HTTP ou classificação.
- Conflito, imutabilidade e lease exigem decisão humana futura; removê-los nesta
  feature impediria a issue 90. Erro de validação isolado, por outro lado, pode ser
  descartado depois de uma execução posterior aceita porque o ticket assume essa
  perda explicitamente.
- Cinco tentativas limitam uma passagem em primeiro plano sem transformar falha
  temporária em perda. Gatilhos posteriores rearmam o processamento; a issue 88
  acrescentará agendamento durável.
- `HttpURLConnection` evita dependência nova, corresponde ao downloader existente e
  permite timeouts, headers e encerramento explícitos. Pool específico ou OkHttp não
  é requisito desta entrega.
- `ConnectivityManager` é apenas um hint: possuir rede não garante internet, e o
  resultado real continua sendo decidido pelo transporte e pela política de retry.
- O escopo permanece dentro da sessão prevista ao reutilizar banco, plugin, sessão e
  endpoint atuais, evitar UI, WorkManager, backend, nova dependência e nova ADR.

## Condições esperadas da entrega

- Snapshot corrente e estado de sync permanecem atômicos no motor existente
- Coalescência por revisão e remoção condicionada protegem alteração durante request
- Um único upload sequencial por instalação, sem bloquear gravação local
- Ordem entre execuções definida por sequência monotônica, nunca pelo UUID
- Request e matriz de respostas compatíveis com o endpoint vigente
- Retry temporário preserva fila e ações futuras preservam seus dados seguros
- 401 pausa globalmente e erro permanente isolado não bloqueia execuções posteriores
- Mudança, conectividade, abertura/resume e sincronização manual cobertos
- Eventos mínimos reparáveis por leitura canônica, sem nova apresentação
- Web/PWA, privacidade, API mínima e ausência de foreground service preservados
- SDDs vivos afetados atualizados somente durante a implementação autorizada
- Revisão de código sem uso e quality gates aplicáveis aprovados
