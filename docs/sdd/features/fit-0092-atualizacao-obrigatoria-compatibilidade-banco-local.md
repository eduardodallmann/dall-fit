# Feature Spec: Atualização obrigatória e compatibilidade do banco local Android

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #92](https://github.com/eduardodallmann/dall-fit/issues/92).
- Problema: o bundle Android é distribuído pelas lojas e pode continuar instalado
  depois que a API, o contrato de sincronização ou o SQLite evoluírem. Sem uma
  política coordenada, uma versão antiga pode iniciar trabalho que não conseguirá
  enviar, enquanto uma atualização pode descartar pendências antes de migrá-las.
- Resultado: a API publica a versão Android mínima aceita e recusa sincronização
  incompatível com código estável. O aplicativo consulta essa política na abertura,
  no resume e ao recuperar conectividade, bloqueia uma versão obsoleta sem impedir
  um treino já iniciado, leva a pessoa à Play Store e preserva as pendências durante
  a atualização. A versão nova abre e migra o SQLite antes de liberar o
  sincronizador; somente uma migration irrecuperável pode recriar os dados, com
  aviso explícito de perda.
- Referências locais:
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [documentação oficial das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da API](../../../api/docs/sdd/base/01-arquitetura.md);
  - [endpoints e contratos HTTP](../../../api/docs/sdd/base/02-endpoints-e-contratos.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [rota Treinar](../../../ui/docs/sdd/routes/training.md);
  - [rota de execução](../../../ui/docs/sdd/routes/training-workout.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [endpoint de snapshot offline](../../../api/docs/sdd/endpoints/offline-training-snapshot.md);
  - [ADR-0012 — Capacitor Android e fronteira de plataforma](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md);
  - [ADR-0014 — motor nativo de persistência offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [versionamento Android](https://developer.android.com/studio/publish/versioning);
  - [`PackageInfo`](https://developer.android.com/reference/android/content/pm/PackageInfo);
  - [`SQLiteOpenHelper`](https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper);
  - [links para a Google Play](https://developer.android.com/distribute/marketing-tools/linking-to-google-play).
- Features relacionadas:
  - [FIT-0079](fit-0079-estruturar-aplicativo-capacitor-android.md) criou o container
    Android com bundle local e sem live update;
  - [FIT-0082](fit-0082-nucleo-nativo-persistencia-offline.md) criou o SQLite e a
    recuperação silenciosa que esta demanda substitui somente no aviso de perda;
  - [FIT-0087](fit-0087-sincronizador-primeiro-plano.md) e
    [FIT-0088](fit-0088-sincronizar-workmanager-app-fechado.md) criaram o motor de
    sincronização em foreground e background;
  - [FIT-0089](fit-0089-adaptar-jornada-treinar-execucao-offline.md) tornou o
    SQLite a autoridade da execução Android;
  - [FIT-0090](fit-0090-integrar-resumo-provisorio-takeover-conflitos-ui.md)
    reservou a categoria `update-required` para esta entrega.

O estado vigente usa Capacitor `8.5.2`, Android mínimo API 29, target/compile SDK
36, WorkManager `2.11.2`, `versionCode 1`, `versionName 1.0` e schema SQLite v3.
O Android usa `versionCode` crescente como identidade comparável; `versionName` é
somente apresentação. O `SQLiteOpenHelper` mantém upgrades transacionais, e o link
da loja usa o application ID vigente `com.dallfit.app`.

## Escopo

### Incluído

- criar contrato e endpoint público somente de leitura para a compatibilidade
  Android, com versão mínima configurada operacionalmente e URL oficial da loja;
- validar configuração no bootstrap e documentar o procedimento seguro para elevar
  a versão mínima somente depois que a build correspondente estiver disponível;
- obter do pacote instalado o `versionCode`/`versionName` reais e expô-los à
  composição Android por uma bridge nativa mínima;
- consultar a política na abertura, no resume e ao recuperar conectividade, com
  deduplicação de requests concorrentes;
- conservar monotonicamente no armazenamento privado não restaurável a maior
  versão mínima já observada, para que ficar offline não reverta um bloqueio
  conhecido;
- não bloquear por si só quando nenhuma política foi obtida e a rede está
  indisponível ou a consulta falha; validade do plano e demais regras continuam
  vigentes;
- introduzir a superfície global acessível de atualização obrigatória e uma ação
  que abre a listagem de `com.dallfit.app` na Play Store;
- permitir que um treino local já iniciado termine depois da detecção, sem enviar,
  e bloquear novo treino, preparação, takeover e sincronização;
- fazer foreground e WorkManager reconhecerem `update-required` como estado
  persistente e não repetível até existir uma versão compatível;
- enviar a versão do app e a versão do contrato de sync em toda tentativa nativa
  de snapshot e fazer a API recusar clientes incompatíveis com erro estável;
- evoluir o SQLite por migration incremental posterior ao schema v3, preservando
  plano, sessão, snapshots, ordem da fila, ações e conclusão provisória existentes;
- abrir e migrar o banco antes de inicializar ou acordar o sincronizador da versão
  nova;
- manter retry de abertura e rollback transacional; somente depois de falha
  irrecuperável recriar banco, sidecars e arquivos e informar explicitamente que
  dados offline pendentes podem ter sido perdidos;
- testar upgrades com pendências reais e a retomada da fila somente após migration
  bem-sucedida;
- atualizar os SDDs vivos, endpoint, rotas, fluxo e decisão arquitetural afetados
  somente na futura implementação autorizada.

### Não incluído

- live update, bundle remoto, CodePush ou alteração do bundle sem loja;
- download ou instalação silenciosa, Play In-App Updates ou garantia de que a loja
  concluirá a atualização;
- publicação inicial, assinatura, Play Console, CI/release Android ou distribuição
  por outra loja;
- downgrade suportado, restauração de backup incompatível ou rollback para APK com
  `versionCode` menor;
- iOS, PWA, Web ou política de versão mínima para outros clientes;
- migração de dados entre aparelhos, exportação manual ou recuperação server-side
  de pendências que só existiam no aparelho;
- alteração do payload de domínio `OfflineTrainingSnapshotV1`, merge de versões ou
  criação de um protocolo v2 nesta entrega;
- comunicação preventiva sobre atraso, restrições ou natureza best-effort do
  agendamento em background;
- notificação Android de atualização obrigatória com o app fechado; o Worker
  persiste o bloqueio e a superfície aparece na próxima abertura;
- novas screenshots. As referências visuais vigentes serão preservadas e
  verificadas somente nos estados equivalentes.

## Projetos e documentação afetados

- API e endpoints:
  - criar documento vivo para `GET /app-compatibility/android`;
  - atualizar o endpoint `PUT /training/offline-snapshot` com os headers de versão
    e o erro de incompatibilidade;
  - validar as configurações `ANDROID_MIN_VERSION_CODE` e
    `ANDROID_PLAY_STORE_URL` e documentar sua operação;
  - atualizar arquitetura, contratos HTTP, seeds/cURLs e E2E afetados.
- UI e rotas:
  - a composição Android recebe coordenador de compatibilidade, bridge de versão,
    superfície global e abertura nativa da Play Store;
  - `/training` bloqueia novas sessões/preparação/takeover; a rota de workout
    preserva apenas a sessão que já estava ativa até seu terminal;
  - atualizar `ui/docs/sdd/base/01-arquitetura.md`,
    `ui/docs/sdd/base/04-testes-e-qualidade.md`,
    `ui/docs/sdd/routes/dash.md`, `ui/docs/sdd/routes/training.md` e
    `ui/docs/sdd/routes/training-workout.md` conforme a superfície transversal;
  - Web/PWA permanece inalterado e não consulta o endpoint.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` com detecção, exceção da
  sessão ativa, bloqueio do sync, atualização, migration e retomada.
- Contratos em `@dall-fit/types`: adicionar a resposta de compatibilidade Android,
  os valores de plataforma/contrato necessários e os headers documentados; o erro
  continua no formato `ApiError`.
- Decisões arquiteturais: registrar nova ADR que substitui a parte da ADR-0014 que
  tornava invisível o reset por migration. Preservar SQLiteOpenHelper, migrations
  imutáveis, reset como último recurso e ausência de downgrade.
- Handlers e fixtures MSW: adicionar sucesso compatível, versão obsoleta, falha e
  latência do endpoint; o ramo Web não chama esses handlers.
- Mocks de repositories/caches nos unitários da API: não há repository novo; os
  unitários substituem o service de política/configuração no command e a validação
  de versão no fluxo de snapshot.
- Fixtures MongoDB/Redis nos E2E: reutilizar sessão Bearer, lease e snapshot
  existentes. A política não cria coleção nem chave Redis nova.
- Android: bridge de versão/loja, coordenador, gate global, headers do transporte,
  estado `update-required`, migration v3 para a próxima versão e testes
  instrumentados com banco real.

## Requisitos funcionais

### Política e contrato HTTP

1. `GET /app-compatibility/android` é público, não usa sessão, cookie, CSRF,
   MongoDB ou Redis e aplica rate limit de leitura pública por IP. Responde `200`,
   `Cache-Control: no-store` e `ApiResponse<AndroidAppCompatibility>`.
2. A response contém exatamente `platform: 'android'`,
   `minimumVersionCode` inteiro positivo, `syncContractVersion` inteiro positivo e
   `storeUrl` HTTPS da listagem oficial. `versionName` mínimo não participa da
   decisão porque não é ordenável.
3. A API lê `ANDROID_MIN_VERSION_CODE` e `ANDROID_PLAY_STORE_URL` pela configuração
   validada. Valor ausente, não inteiro/positivo, URL não HTTPS ou URL que não aponte
   para `com.dallfit.app` impede o bootstrap sem registrar o valor bruto.
4. A operação para elevar o mínimo é: publicar e confirmar a nova build na Play
   Store; implantar backend compatível com a build antiga e a nova; validar migration
   e sync; só então elevar `ANDROID_MIN_VERSION_CODE` e redeployar. Reduzir o valor
   não é estratégia de downgrade do SQLite.
5. `PUT /training/offline-snapshot` recebe `X-App-Version-Code` e
   `X-Sync-Contract-Version`. A versão do app vem do pacote instalado; a versão do
   contrato vem do snapshot persistido depois da migration, nunca de texto ou
   relógio controlado pelo usuário.
6. O endpoint valida os headers antes de adquirir lock ou tocar Redis/MongoDB.
   Versão menor que o mínimo, contrato diferente do aceito, ausência inválida ou
   formato inválido responde `409 APP_UPDATE_REQUIRED`, inclui em `details` somente
   a versão mínima, a versão de contrato aceita e a URL pública da loja, e não
   altera snapshot, lease, recibo ou TTL.
7. Para rollout inicial, request legado sem headers é identificado como app
   `versionCode 1` e contrato de sync `1`. Enquanto o mínimo continuar `1`, o
   snapshot v1 atual permanece aceito; depois que o mínimo avançar, a ausência é
   recusada. Não há confiança de segurança nesses headers: eles são negociação de
   compatibilidade, enquanto autenticação, lease e validação do payload continuam
   soberanos.

### Detecção e estado da aplicação

8. A bridge Android lê `PackageInfo.getLongVersionCode()` e `versionName` do pacote
   instalado. A UI não usa constante duplicada, variável Vite ou user agent para
   descobrir a versão.
9. O coordenador consulta a política depois de a bridge estar disponível e também
   em cada abertura, resume e recuperação de conectividade. Chamadas sobrepostas
   compartilham uma única operação; resposta de uma geração encerrada não altera a
   sessão ou a UI seguinte.
10. Uma resposta com `versionCode` instalado menor que `minimumVersionCode` grava
    monotonicamente a maior exigência conhecida em preferência privada excluída de
    backup e entra em `update-required`. Resposta posterior nunca reduz o mínimo
    observado; somente instalar uma build cujo código o satisfaça libera o estado.
11. Sem política previamente conhecida, indisponibilidade de rede, timeout ou erro
    `5xx` não cria bloqueio. O app continua pelas regras locais existentes, inclusive
    validade de sete dias. O próximo gatilho tenta novamente sem polling contínuo.
12. Se o backend recusar um snapshot com `APP_UPDATE_REQUIRED`, foreground e Worker
    persistem o mesmo estado usando os detalhes validados da response, interrompem
    a passagem sem backoff/retry e conservam toda a fila.
13. Com versão obsoleta e nenhuma sessão ativa, a superfície global substitui a
    navegação Android e informa que é necessário atualizar para continuar. Não
    exibe identidade, conteúdo privado, contagem ou conteúdo de pendências.
14. `Atualizar na Play Store` abre um `Intent.ACTION_VIEW` restrito ao pacote
    `com.android.vending` e à URL HTTPS validada. Se a Play Store não puder resolver
    o intent, o app oferece fallback seguro para a mesma URL HTTPS no navegador; a
    falha terminal permanece visível e repetível.

### Treino em andamento, bloqueios e sincronização

15. Se a atualização for detectada durante uma sessão local ativa, somente a rota
    do workout capturado continua utilizável. A pessoa pode concluir ou cancelar
    pelas mesmas transações locais; não há request de snapshot, preparação, lease,
    takeover ou início de outro workout.
16. O bloqueio não interrompe timer, não descarta sessão, não modifica snapshot e
    não força finalização. Sair da execução preserva o dado, mas a superfície global
    impede outra navegação funcional até a atualização.
17. Depois do terminal local, a UI volta ao bloqueio obrigatório. O snapshot
    `completed` ou `cancelled`, sua sequência e a apresentação provisória permanecem
    no SQLite sem tentativa de envio pela versão antiga.
18. Foreground, callback de conectividade, ação manual, one-time work e periodic
    work consultam o gate antes do transporte. `update-required` encerra a passagem
    com sucesso operacional para não criar loop do WorkManager; não remove unique
    work, fila ou credencial e não comunica limitações preventivas de agendamento.

### Migration e retomada depois da loja

19. A atualização instalada preserva o sandbox do app porque mantém application ID
    e assinatura. Antes de montar os coordenadores, acordar o Worker ou permitir
    qualquer sync, o motor abre o banco e aplica todas as migrations consecutivas.
20. A migration posterior ao schema v3 acrescenta os metadados explícitos de
    compatibilidade do produtor/contrato necessários à fila. Linhas existentes são
    classificadas como contrato v1, sem reordenar, reserializar ou apagar plano,
    sessão, snapshots, `queue_sequence`, `action_details_json` ou
    `latest_completion`.
21. A migration é incremental, transacional e imutável depois de distribuída.
    Banco novo cria diretamente o schema alvo; v1, v2 e v3 continuam atravessando
    todos os passos conhecidos na ordem. Falha interrompida faz rollback e nova
    abertura tenta uma vez com handle novo.
22. Depois de migration bem-sucedida, o coordenador compara a build instalada com o
    mínimo conhecido/consultado, valida a versão de cada envelope e só então muda
    `update-required` para `pending` e acorda o mesmo sincronizador. Ordem e revisão
    existentes continuam soberanas; nenhuma pendência é enviada antes disso.
23. Migration ausente, downgrade ou falha repetida é recuperação irrecuperável.
    Somente então o motor fecha handles, remove banco, sidecars e arquivos offline,
    cria schema vazio e registra fora do banco novo uma ocorrência sanitizada que
    sobreviva à recriação até ser reconhecida pela UI.
24. Após o reset concluir, a UI apresenta aviso persistente e acessível de que os
    dados offline não puderam ser migrados e foram redefinidos, podendo haver perda
    de treinos pendentes. A pessoa reconhece o aviso para continuar; não existe
    restauração fictícia, envio parcial ou fallback HTTP. Falha no próprio reset
    mantém o motor fechado e oferece retry sem liberar treino/sync.

## Requisitos não funcionais

- Acessibilidade:
  - a superfície obrigatória usa `main`, heading, descrição e ação com nomes
    visíveis, foco inicial previsível e contraste independente de cor;
  - a exceção do treino ativo não abre overlay sobre a execução nem rouba foco;
  - o aviso de reset usa `Alert`/`AlertDialog` sem dismiss acidental e só fecha após
    reconhecimento explícito.
- Performance:
  - uma consulta pequena por gatilho, single-flight e sem polling;
  - leitura de versão e preferência é local e constante;
  - migration mantém transações curtas e não faz rede sob lock SQLite;
  - nenhum scan de Redis/MongoDB ou processamento proporcional à fila no endpoint
    de compatibilidade.
- Segurança e privacidade:
  - endpoint e headers não recebem pessoa, instalação, token, snapshot ou dado de
    treino;
  - logs registram somente plataforma, classificação de compatibilidade, versões
    inteiras e códigos; não registram URL recebida, credencial ou conteúdo da fila;
  - preferências de compatibilidade não contêm identidade e são excluídas de backup;
  - o bloqueio não transforma header informado pelo cliente em autorização.
- Observabilidade:
  - API segue a política completa de logs por camada com valores sanitizados;
  - Android registra consulta, fonte do bloqueio, migration e reset apenas por
    categorias enumeradas, sem `console.*`, stack, SQL, path ou payload;
  - `APP_UPDATE_REQUIRED`, falha de consulta, migration concluída, reset concluído
    e reset falho permanecem distinguíveis.
- Resiliência:
  - falha de consulta sem mínimo conhecido falha aberta somente para o uso local já
    permitido; o backend continua a última barreira do sync;
  - mínimo conhecido não regride offline nem por response atrasada;
  - atualização, morte de processo e resume preservam fila até migration e gate
    concluírem.
- Compatibilidade:
  - Web/PWA, sessão por cookie, SSE e jornada online não mudam;
  - Android API 29+ e gates Web sem SDK Android continuam suportados;
  - contrato atual de snapshot continua v1; esta entrega adiciona negociação sem
    reinterpretar o payload histórico.
- Limite de execução: a futura implementação deve caber em uma sessão de até cinco
  horas. Ela reutiliza bridge/plugin, `update-required`, fila, WorkManager,
  SQLiteOpenHelper, API errors, MSW e superfícies existentes. In-App Updates,
  publicação, novo payload de sync, iOS ou recuperação remota exigem outra feature.

## Critérios de aceite

### Cenário 1 — versão compatível inicia normalmente

- Forma de validar: cenário vivo de `GET /app-compatibility/android` com seed `não
  se aplica` justificado e cURL completo, Vitest do coordenador e Android
  instrumentado com package info controlado.
- Given: a API exige versão 1 e o pacote instalado possui `versionCode 1`.
- When: o app abre online e consulta a política.
- Then: a navegação Android continua, o mínimo observado é salvo e sync/preparação
  permanecem disponíveis.

### Cenário 2 — primeira abertura offline não inventa bloqueio

- Forma de validar: Vitest do coordenador e smoke Android em modo avião.
- Given: nenhuma política foi obtida anteriormente, o plano local está válido e o
  app não alcança a API.
- When: abre o app offline.
- Then: a falha de consulta não bloqueia sozinha e continuam valendo a validade de
  sete dias, o lease local e as regras atuais.

### Cenário 3 — mínimo conhecido continua bloqueando offline

- Forma de validar: teste Android que persiste a política, recria o processo e
  remove a rede.
- Given: a versão 1 já observou mínimo 2.
- When: o app é reaberto offline.
- Then: permanece em atualização obrigatória, sem poder apagar a preferência ou
  voltar a treinar/sincronizar por ausência de rede.

### Cenário 4 — treino corrente pode terminar sem enviar

- Forma de validar: teste de componente/repository com sessão ativa e Android
  instrumentado com snapshot real.
- Given: uma sessão local está ativa quando a versão se torna obsoleta.
- When: a pessoa continua e finaliza ou cancela.
- Then: todas as ações são confirmadas no SQLite, nenhum transporte é chamado e o
  terminal permanece na fila; depois disso aparece o bloqueio global.

### Cenário 5 — versão obsoleta não inicia nem sincroniza

- Forma de validar: Vitest do repository/coordenadores e teste instrumentado do
  Worker.
- Given: não existe sessão ativa e o mínimo observado supera a versão instalada.
- When: tenta abrir Treinar, preparar, iniciar, fazer takeover, sincronizar
  manualmente ou executar o Worker.
- Then: nenhum caminho inicia trabalho ou rede de domínio; UI oferece a loja e o
  Worker encerra sem retry, preservando fila e ordem.

### Cenário 6 — backend recusa contrato incompatível

- Forma de validar: seed/cURL do endpoint de snapshot com headers ausentes,
  compatíveis, antigos, futuros e inválidos, complementado por E2E real.
- Given: mínimo operacional 2 ou versão de contrato diferente de 1.
- When: um snapshot válido tenta sincronizar com metadados incompatíveis.
- Then: recebe `409 APP_UPDATE_REQUIRED`; Redis, MongoDB, lease, lock, recibo e TTL
  não mudam. Request legado só é aceito enquanto o baseline 1 continuar válido.

### Cenário 7 — ação abre a listagem correta da Play Store

- Forma de validar: teste Android do Intent e teste de componente da superfície.
- Given: o app está bloqueado e a URL configurada identifica `com.dallfit.app`.
- When: aciona `Atualizar na Play Store`.
- Then: abre a Play Store sem chooser; ausência da loja usa a mesma URL HTTPS no
  navegador e falha terminal mantém retry acessível.

### Cenário 8 — update preserva e migra pendências antes do sync

- Forma de validar: teste instrumentado partindo de fixture schema v3 com sessão,
  snapshots de múltiplas execuções, ação, sequência e conclusão provisória.
- Given: a versão antiga foi encerrada com pendências e uma nova build compatível é
  instalada sobre o mesmo app.
- When: a nova versão abre.
- Then: a migration conclui antes do motor de sync; todas as linhas e ordens são
  preservadas/classificadas e somente depois a fila volta a `pending` e envia.

### Cenário 9 — migration interrompida faz rollback e retoma

- Forma de validar: teste Android com falha injetada durante o upgrade.
- Given: schema v3 contém pendências e a migration falha antes do commit.
- When: o handle é reaberto sem a falha.
- Then: o passo é reaplicado integralmente, nenhuma linha parcial fica visível, não
  há reset/aviso e as pendências são sincronizáveis depois do gate.

### Cenário 10 — reset irrecuperável é último recurso explícito

- Forma de validar: teste instrumentado com migration ausente/corrompida e teste de
  componente do aviso.
- Given: abrir e repetir a migration falham de forma irrecuperável.
- When: o motor executa a recuperação final.
- Then: banco, sidecars e arquivos são recriados; nenhum dado parcial é enviado; a
  UI informa a possível perda e exige reconhecimento. Se o reset falhar, o motor
  continua fechado e permite retry.

### Cenário 11 — Web/PWA permanece fora da política nativa

- Forma de validar: Vitest da seleção de plataforma e Playwright de regressão das
  rotas Web.
- Given: a aplicação roda no navegador ou PWA.
- When: abre, retoma, perde/recupera conexão e executa treino online.
- Then: não consulta compatibilidade Android, não envia headers nativos, não mostra
  Play Store e conserva o comportamento online vigente.

## Estratégia de entrega e compatibilidade

1. Adicionar contratos públicos, configuração validada, endpoint de leitura e
   negociação do snapshot com baseline legado 1; documentar seeds/cURLs e operação.
2. Acrescentar bridge de package info/Play Store e coordenador Android com estado
   monotônico e single-flight, sem conectar ainda os bloqueios destrutivos.
3. Evoluir o schema v3 incrementalmente, preencher metadados legados e provar a
   preservação de todas as pendências antes de liberar o sync.
4. Integrar headers e classificação `APP_UPDATE_REQUIRED` ao transporte foreground
   e Worker; persistir o estado sem retry ou remoção da fila.
5. Aplicar o gate global, a exceção exclusiva da sessão ativa, o bloqueio de novos
   trabalhos e a ação de loja.
6. Substituir o reset silencioso por recuperação ainda automática, porém seguida de
   aviso explícito; registrar a ADR substituta sem editar a ADR histórica.
7. Atualizar documentos vivos, handlers/fixtures, testes por camada, revisar código
   sem uso e executar os gates aplicáveis.

O rollout é compatível enquanto o mínimo permanece 1: clientes legados continuam
enviando snapshot v1 e a API os classifica pelo baseline. A nova build deve chegar
à loja e ser validada antes de elevar o mínimo. Elevar o mínimo é a operação que
ativa o bloqueio dos clientes anteriores; rollback de backend pode reduzir a
exigência HTTP, mas não torna seguro instalar APK antigo sobre schema novo. A fila
local nunca é limpa como parte normal da atualização.

## Plano de testes

- API unitária:
  - validação das variáveis, URL/pacote, response e `no-store`;
  - command/controller do endpoint sem acesso a MongoDB/Redis;
  - parsing de headers, baseline legado, versão menor/igual/maior, contrato
    divergente e `APP_UPDATE_REQUIRED` antes do lock;
  - logs sem credencial, pessoa, snapshot ou URL bruta.
- API E2E serial:
  - endpoint público, rate limit, contrato e `x-request-id`;
  - snapshot legado aceito no mínimo 1 e recusado após mínimo 2;
  - headers compatíveis/incompatíveis e ausência de efeitos em Redis/MongoDB/TTL.
- UI/Vitest:
  - single-flight na abertura/resume/reconexão, response atrasada e teardown;
  - desconhecido offline, mínimo persistido monotônico e desbloqueio só por build
    instalada compatível;
  - gate global, foco, deep link/fallback, sessão ativa e bloqueios de início/sync;
  - Web/PWA sem import, request, header ou superfície Android;
  - MSW para sucesso, obsolescência, falha e latência.
- Java/Android instrumentado:
  - package info real/controlado, preferência excluída de backup e intents;
  - migration v1→alvo, v2→alvo e v3→alvo com plano, sessão, fila, conflitos,
    terminais e conclusão provisória;
  - rollback/reexecução, migration ausente, reset concluído/falho e aviso reparável;
  - WorkManager não envia nem repete em bloqueio e retoma somente após migration;
  - morte do processo durante treino e durante update preserva a fila.
- Playwright:
  - regressão Web/PWA da jornada Treinar;
  - estados Android de UI usam capability/repository injetados e não simulam bridge
    ou SQLite por request HTTP;
  - verificar referências existentes de `/training` e workout apenas nos estados
    equivalentes, sem criar novas imagens.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`;
  - `pnpm android:sync`;
  - `pnpm android:build:debug`;
  - `pnpm android:test` em dispositivo ou emulador API 29+.

## Riscos e decisões

- `versionCode` é o único comparador porque o Android e a Play Store já o usam para
  ordenar builds; `versionName` permanece texto de apresentação.
- A política é pública para funcionar antes da sessão e não contém dado privado.
  Configuração server-side permite avanço operacional sem lançar outro backend.
- O mínimo observado é monotônico no aparelho para impedir que ficar offline ou
  receber response antiga contorne um bloqueio já conhecido. Falhar aberto antes
  da primeira consulta preserva a decisão confirmada de não bloquear apenas pela
  ausência de rede; o backend limita o risco recusando sync incompatível.
- A exceção da sessão ativa evita perder um treino em curso. Ela é estreita: não
  permite novo treino, preparação, takeover, sync ou navegação funcional geral.
- `409 APP_UPDATE_REQUIRED` é estável e distinto de autenticação, lease, conflito e
  indisponibilidade. O cliente nunca decide por mensagem.
- Baseline legado 1 permite rollout em duas etapas. Ausência não continua aceita
  depois que a configuração exige versão maior.
- A migration precede qualquer sync porque rotular um envelope antigo com a versão
  nova sem convertê-lo poderia enviar conteúdo incompatível. Metadados persistidos
  pertencem ao snapshot, não apenas ao processo corrente.
- O reset continua automático somente porque um banco irrecuperável não pode ser
  aberto para pedir confirmação sem criar outra fonte de verdade. A mudança desta
  feature é tornar a perda visível e reconhecida depois da recuperação, preservando
  reset como último recurso e falha fechada quando ele próprio não conclui.
- Não adotar Play In-App Updates mantém o limite da issue e a decisão de usar a loja
  como autoridade de distribuição. A ação apenas abre a listagem oficial.
- O escopo permanece em uma feature porque reutiliza infraestrutura pronta e não
  cria payload, tela de pendências, publicação ou serviço novo. Se a implementação
  exigir qualquer item fora do escopo, deve voltar ao refinamento em vez de exceder
  a sessão de cinco horas.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Política Android mínima configurável e operacionalmente documentada
- Versão instalada e contrato de sync negociados sem dado privado
- Treino corrente concluível localmente e nenhum trabalho novo pela versão antiga
- Pendências preservadas na atualização e migradas antes da retomada do sync
- Backend recusando incompatibilidade com código estável e sem efeito parcial
- Deep link da Play Store com fallback HTTPS seguro
- Reset de migration restrito ao último recurso e perda explicitamente comunicada
- Web/PWA, autenticação e jornada online preservados
- Contratos, endpoint, rotas, fluxo, bases e ADR afetados atualizados
- MSW, mocks unitários, E2E, Playwright e Android instrumentado atualizados
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz, E2E da API, integração UI e validações Android aprovados
