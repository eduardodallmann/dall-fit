# Feature Spec: Sincronizar pendências com WorkManager quando o app estiver fechado

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #88](https://github.com/eduardodallmann/dall-fit/issues/88).
- Problema: a FIT-0087 sincroniza a fila nativa somente enquanto o processo e a
  composição iniciada pelo WebView estão ativos. Uma pendência criada antes de o
  aplicativo ser fechado pode permanecer local mesmo depois de a conectividade
  voltar, até que a pessoa abra novamente o app.
- Resultado: toda nova pendência agenda um trabalho Android persistente e existe
  uma verificação periódica de contingência a cada seis horas. Ambos usam
  WorkManager apenas como disparador best-effort do mesmo `OfflineSyncEngine`, da
  mesma fila SQLite, do mesmo transporte, da mesma credencial Bearer nativa e do
  mesmo lock. O sistema operacional pode adiar a execução; abrir ou retomar o app
  continua acordando imediatamente o motor.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [documentação oficial das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [endpoint de snapshot offline](../../../api/docs/sdd/endpoints/offline-training-snapshot.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [ADR-0013 — sessões Web e nativas isoladas](../adr/ADR-0013-sessoes-web-e-native-isoladas.md);
  - [ADR-0014 — motor nativo de persistência offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [FIT-0081 — login e isolamento de conta Android](fit-0081-login-isolamento-conta-android.md);
  - [FIT-0082 — núcleo nativo de persistência offline](fit-0082-nucleo-nativo-persistencia-offline.md);
  - [FIT-0087 — sincronizador nativo em primeiro plano](fit-0087-sincronizador-primeiro-plano.md);
  - [WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent);
  - [definição de work requests](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work);
  - [trabalho único](https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/manage-work#unique-work);
  - [testes do WorkManager](https://developer.android.com/develop/background-work/background-tasks/testing/persistent);
  - [releases do WorkManager](https://developer.android.com/jetpack/androidx/releases/work).
- Features relacionadas: a FIT-0081 fornece o envelope Bearer cifrado e o ciclo de
  sessão; a FIT-0082 fornece o SQLite, o lock e a composição nativa reutilizável; a
  FIT-0087 fornece fila, claim, HTTP, classificação de respostas, retry e exclusão
  mútua. A FIT-0089 produzirá snapshots durante o treino offline, e a FIT-0090
  apresentará e resolverá estados que exigem ação humana.

O projeto usa Java, Android mínimo API 29 e compile/target SDK 36. A implementação
adicionará `androidx.work:work-runtime:2.11.2`, versão estável oficial compatível
com esse SDK, e `androidx.work:work-testing:2.11.2` somente para testes. Não usará
artefato KTX, multiprocess ou canal pre-release.

## Escopo

### Incluído

- adicionar WorkManager ao projeto Android e manter sua inicialização padrão no
  processo principal;
- criar um `Worker` Java normal, não expedited e sem promoção a foreground, que
  inicializa e aguarda uma passagem limitada do sincronizador sem Activity, WebView
  ou execução de JavaScript;
- criar um agendador nativo idempotente com nomes estáveis para um unique one-time
  work global da fila e um unique periodic work de contingência;
- agendar o trabalho único depois do commit de cada novo snapshot `pending`, sem
  transportar payload, Bearer, pessoa ou ID da execução no `Data` do WorkManager;
- registrar uma verificação periódica a cada seis horas;
- aplicar exclusivamente a constraint `NetworkType.CONNECTED`, sem exigir rede não
  tarifada, carregador, idle ou condição própria de bateria;
- reutilizar o mesmo envelope Bearer cifrado e sua expiração por uma leitura nativa
  segura disponível ao Worker, mantendo uma única persistência da credencial;
- disponibilizar ao processo recriado a URL-base não secreta validada que já
  configura o transporte da FIT-0087, sem depender do bundle JavaScript em execução;
- coordenar Worker e gatilhos de foreground pelo mesmo singleton e pela mesma
  exclusão mútua do motor;
- mapear o resultado terminal da passagem para `success` ou `retry` sem duplicar a
  matriz HTTP e sem transformar autenticação ou ação humana em loop automático;
- recuperar claim `in_flight` interrompido e conservar a revisão para replay
  idempotente depois de morte ou interrupção do processo;
- acrescentar testes Java/Android do Worker, do agendador, da credencial nativa, da
  concorrência e da persistência do agendamento;
- documentar, na futura implementação, a natureza best-effort e as limitações do
  agendamento Android nos SDDs vivos afetados.

### Não incluído

- push notification, Firebase, alarme exato, `AlarmManager` ou `JobScheduler`
  acessado diretamente;
- foreground service, Worker expedited, notificação persistente ou nova permissão;
- garantia de execução imediata, prazo máximo de envio ou comportamento em tempo
  real;
- aviso preventivo, toast, modal, indicador ou notificação de sucesso do trabalho;
- execução de JavaScript, React ou WebView em background;
- nova fila, lote HTTP, request paralelo ou cópia do payload fora do SQLite vigente;
- nova política de classificação HTTP, conflito, lease, descarte ou resolução;
- renovação silenciosa do Bearer, login em background ou seletor de conta;
- alteração de endpoint, backend, contrato compartilhado, Web/PWA ou suporte iOS;
- adaptação da rota Treinar para produzir snapshots, pertencente à FIT-0089;
- apresentação e resolução de `action_required`, pertencentes à FIT-0090;
- telemetria remota ou Analytics do trabalho em background.

## Projetos e documentação afetados

- API e endpoints: não afetados; o Worker reutiliza exatamente `PUT
  /training/offline-snapshot` e sua matriz vigente, sem mudar request ou response.
- UI e rotas: o projeto `ui/android` recebe dependência, Worker, agendador,
  configuração nativa e testes. Nenhuma rota ou apresentação muda; não há documento
  de rota, MSW, Playwright ou referência visual a atualizar.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` na implementação para
  registrar o disparo best-effort com o app fechado, sem antecipar a jornada da
  FIT-0089.
- Contratos em `@dall-fit/types`: não afetados.
- Decisões arquiteturais: a ADR-0014 já determina o singleton e o mesmo lock para
  plugin e Workers; atualizá-la somente para registrar o consumidor WorkManager se
  a implementação revelar consequência arquitetural ainda ausente, sem criar um
  segundo motor ou lock.
- Handlers e fixtures MSW: não se aplica; o transporte pertence ao processo nativo.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.
- SDD transversal: atualizar arquitetura e workspace para registrar o WorkManager,
  seu caráter best-effort e os comandos Android de validação aplicáveis.
- SDD da UI: atualizar arquitetura e testes com agendamento, bootstrap sem WebView,
  fonte nativa da sessão, política de resultado e matriz de testes.

## Modelo de agendamento e concorrência

1. Existe um único nome estável de one-time work para sincronização da instalação.
   Toda nova pendência chama `enqueueUniqueWork` com `ExistingWorkPolicy.KEEP`.
   Uma solicitação já enfileirada ou em execução atende a fila inteira; não existe
   um work, nome ou cadeia por execução.
2. Existe um segundo nome estável para o periodic work de contingência, registrado
   com intervalo de seis horas e `ExistingPeriodicWorkPolicy.KEEP`. Registrar
   novamente em inicializações futuras é idempotente e não reinicia sua cadência.
3. Os dois requests usam somente `NetworkType.CONNECTED`. A constraint representa
   conectividade disponível, não prova acesso à internet nem substitui a
   classificação real do transporte.
4. O one-time e o periodic work não carregam payload funcional em `Data`. Ao
   executar, consultam a fila canônica no SQLite e enviam as revisões elegíveis na
   ordem de `queue_sequence` definida pela FIT-0087.
5. O agendamento da nova pendência ocorre somente depois do commit que publicou
   snapshot e `sync_state`. Falha ao enfileirar não desfaz a gravação; abertura,
   resume, novo snapshot e periodic work continuam capazes de recuperá-la.
6. Worker, callback de conectividade, mudança local, abertura/resume e ação manual
   entram pelo mesmo `OfflineSyncEngine`. O motor mantém no máximo um upload em voo;
   gatilho simultâneo coalesce uma passagem posterior ou acompanha a passagem
   vigente, sem criar outro executor ou segurar o lock SQLite durante rede.
7. O Worker só conclui depois de receber do motor um resultado sanitizado da sua
   passagem. O contrato interno distingue ao menos: fila drenada/sem elegível,
   falha temporária reagendável, autenticação ausente ou inválida, ação necessária,
   bloqueio permanente e interrupção.
8. O Worker não executa sleeps longos para reproduzir todo o ciclo de retry em
   foreground. Ele reutiliza claim, transporte, classificação e transições da
   FIT-0087 e devolve `Result.retry()` quando resta falha temporária elegível;
   WorkManager aplica backoff exponencial. O foreground conserva seus retries
   curtos vigentes.
9. One-time e periodic requests configuram backoff exponencial inicial de 30
   segundos. `Retry-After` e `next_attempt_at` já persistidos pelo motor continuam
   impedindo claim prematuro; o WorkManager pode executar depois, nunca promete o
   instante exato.
10. Fila drenada, fila sem item elegível, estado `blocked`, `action_required`,
    atualização obrigatória, envelope ausente/expirado e `401` terminam em
    `Result.success()`: os dados locais permanecem quando previsto, mas o mesmo
    work não entra em loop. Nova autenticação, mudança de revisão, ação humana,
    abertura do app ou contingência periódica pode produzir outro disparo.
11. Falha temporária de rede/servidor, interrupção cooperativa do Worker ou erro
    técnico recuperável antes de um resultado terminal usa `Result.retry()`.
    Defeito permanente de configuração ou contrato termina sem loop e fica
    diagnosticável apenas por categoria sanitizada.

## Inicialização sem WebView e sessão

1. O Worker obtém `OfflineStorageService` e `OfflineSyncEngine` do mesmo
   `OfflineStorageProvider` de escopo da aplicação. Nenhuma classe depende de
   `MainActivity`, `Bridge`, `PluginCall`, React ou callback JavaScript para abrir o
   banco, recuperar claims ou executar HTTP.
2. O envelope v1 da FIT-0081 continua sendo a única persistência do Bearer. Uma
   port nativa de credencial lê a mesma área cifrada pelo Android Keystore e valida
   estritamente versão, `accessToken`, `expiresAt` e `personId`; não cria uma cópia
   em SQLite, preferences abertas, WorkManager `Data`, log ou arquivo.
3. A implementação confirma o formato contra `@aparajita/capacitor-secure-storage`
   `8.0.0`, atualmente instalado, e contra seu código Android local. Se a leitura
   direta do Worker exigir encapsulamento próprio, a migração mantém uma única
   cópia canônica, preserva sessões válidas e é atômica antes de remover o formato
   anterior; não mantém dois cofres ativos.
4. Envelope ausente, ilegível, inválido ou evidentemente expirado é tratado como
   ausência de autenticação e não aciona login. Corrupção ou expiração segue a
   limpeza segura vigente; UUID, vínculo e pendências permanecem preservados.
5. `401 AUTHENTICATION_REQUIRED` ou `403 NATIVE_SESSION_REQUIRED` invalida o
   envelope de forma idempotente mesmo sem coordenador TypeScript ativo, pausa o
   motor e termina o Worker sem retry. Quando o WebView voltar, o ciclo de sessão
   observa a ausência e permanece desconectado até gesto explícito.
6. A URL-base da API é configuração pública, não credencial. Depois de validada no
   primeiro bootstrap Android, fica disponível a consumidores nativos em storage
   privado mínimo. O Worker rejeita valor ausente, malformado, host não permitido ou
   HTTP fora dos hosts locais aceitos; nunca deriva URL de payload ou redirect.
7. Logout, troca de conta e teardown invalidam primeiro a geração do motor,
   cancelam o unique one-time work quando ele não pode mais usar a sessão e limpam
   a credencial conforme a FIT-0081. O periodic work pode permanecer registrado,
   pois sem envelope válido termina sem request e permite retomada após novo login.
8. Uma nova autenticação válida da mesma pessoa agenda imediatamente o unique work
   se houver pendência. Outra pessoa só pode sincronizar depois da limpeza atômica
   da conta anterior e do novo vínculo canônico.

## Recuperação, lifecycle e melhor esforço

1. WorkManager persiste os requests e pode executá-los depois de fechamento do app,
   morte do processo ou reinicialização do aparelho, sujeito às políticas do
   Android, constraints, cotas e otimizações de bateria.
2. O Worker não promete início imediato nem execução exatamente a cada seis horas.
   O intervalo periódico é a cadência solicitada; o sistema escolhe a janela real.
3. Se o processo morrer antes de concluir a transição local, o `in_flight` é
   recuperado para `pending` pelo motor. Repetir um request que a API pode ter aceito
   é seguro pela idempotência e pela remoção condicionada por revisão.
4. Se o Android interromper o Worker, ele coopera com o cancelamento, não inicia
   outro claim, libera recursos de rede e deixa o item recuperável. A próxima
   composição reconcilia eventual claim interrompido.
5. Abrir ou retomar o aplicativo nunca espera a cadência do WorkManager: o gatilho
   de foreground existente lê credencial e fila, rearma temporários quando previsto
   e solicita passagem imediata pelo mesmo motor.
6. Não há comunicação preventiva sobre melhor esforço e nenhuma conclusão comum
   gera UI ou notificação. Logs técnicos distinguem origem `foreground`,
   `one-time-worker` e `periodic-worker` apenas por enum sanitizada.

## Requisitos não funcionais

- Acessibilidade: não há nova superfície visual, anúncio, notificação ou mudança de
  foco e rota.
- Performance:
  - o Worker usa thread de background e passagem limitada, sem bloquear a main
    thread;
  - não materializa mais de um snapshot reclamado por vez nem cria request paralelo;
  - trabalhos únicos evitam acumular uma cadeia por mutação;
  - rede, lock e executor são encerrados ou reutilizados conforme seu proprietário.
- Segurança e privacidade:
  - Bearer permanece cifrado pelo Keystore e só existe em claro na memória pelo
    tempo necessário ao request;
  - WorkManager `Data`, tags, nomes, logs e diagnósticos não contêm Bearer, pessoa,
    execução, payload, URL assinada, conflito ou conteúdo de treino;
  - banco, secure storage e configuração privada continuam excluídos de backup e
    transferência entre aparelhos;
  - nenhum login, refresh de token ou escolha humana ocorre em background.
- Observabilidade:
  - cada método novo segue `NomeDaClasse -> nomeDoMetodo -> etapa:`;
  - enqueue, início, término, cancelamento e resultado registram somente origem,
    categoria, contagem e revisão técnica sanitizadas;
  - falha ao agendar e resultado do Worker são distinguíveis sem expor dados;
  - não há Analytics, log persistente próprio ou telemetria remota.
- Compatibilidade:
  - Android API 29+, Java e processo único permanecem vigentes;
  - `androidx.work` usa a versão estável `2.11.2` e sua API Java;
  - nomes de Workers e unique works são persistentes; uma futura renomeação exige
    compatibilidade explícita com requests já gravados pelo WorkManager;
  - Web/PWA, API, quality gates web e build sem Android SDK não ganham dependência
    runtime do WorkManager.
- Limite de execução: a implementação deve caber em uma sessão de até cinco horas.
  Para isso reutiliza integralmente fila, transporte, classificação, armazenamento,
  sessão e lock existentes; não cria UI, endpoint, foreground service, nova fila ou
  infraestrutura multiprocess.

## Critérios de aceite

### Cenário 1 — nova pendência agenda um único trabalho persistente

- Forma de validar: teste Android com WorkManager TestInitHelper e inspeção do
  `WorkInfo`; URL não se aplica porque não há rota nova.
- Given: a fila recebe várias revisões e execuções antes de existir conectividade.
- When: cada commit solicita agendamento.
- Then: existe somente um unique one-time work efetivo com constraint de rede, sem
  payload funcional, e o SQLite conserva apenas a revisão corrente por execução.

### Cenário 2 — contingência periódica usa seis horas e somente conectividade

- Forma de validar: teste do agendador e inspeção do request registrado.
- Given: o aplicativo inicializa sua composição nativa mais de uma vez.
- When: registra a contingência.
- Then: permanece um unique periodic work com intervalo de seis horas,
  `NetworkType.CONNECTED` e nenhuma restrição de Wi-Fi, carregador, idle ou bateria.

### Cenário 3 — processo sem WebView envia pela mesma fila

- Forma de validar: teste Android do Worker com SQLite, credencial e transporte
  controlado, sem criar Activity nem bridge Capacitor.
- Given: há envelope válido, URL-base válida e snapshot `pending` no motor.
- When: o WorkManager instancia o Worker em um processo recriado.
- Then: o Worker obtém os singletons nativos, reclama e envia pelo mesmo
  `OfflineSyncEngine`, e a confirmação remove somente a revisão aceita.

### Cenário 4 — Worker e foreground não enviam em paralelo

- Forma de validar: teste Android com barreiras no transporte e dois gatilhos
  concorrentes.
- Given: o foreground já possui um upload bloqueado no transporte.
- When: o Worker inicia para a mesma fila.
- Then: continua existindo no máximo um request em voo; o segundo gatilho coalesce
  ou acompanha a passagem e nenhuma revisão recebe upload concorrente.

### Cenário 5 — morte ou interrupção conserva replay idempotente

- Forma de validar: teste instrumentado que deixa `in_flight`, recria a composição e
  devolve resposta duplicada da API.
- Given: o processo termina depois do envio e antes do commit local.
- When: um Worker ou a abertura posterior recupera a fila.
- Then: o claim volta a `pending`, o request pode ser repetido e `duplicate` remove
  apenas a revisão correspondente, sem perder uma revisão mais nova.

### Cenário 6 — falha temporária usa retry sem loop interno longo

- Forma de validar: teste do Worker com relógio, WorkManager test driver e
  transporte temporariamente indisponível.
- Given: o motor classifica rede, timeout, `429` ou `5xx` como temporário.
- When: a passagem em background termina sem drenar o item.
- Then: o estado local continua recuperável, o Worker devolve `retry`, o request
  possui backoff exponencial de 30 segundos e não há segundo upload em paralelo.

### Cenário 7 — 401 não entra em loop

- Forma de validar: teste do Worker e da port nativa de credencial.
- Given: existe fila e o servidor responde `401 AUTHENTICATION_REQUIRED`.
- When: o motor classifica a resposta sem WebView ativo.
- Then: o envelope é invalidado uma vez, todas as pendências permanecem, nenhum
  novo upload usa o Bearer e o Worker termina em `success`, sem retry automático.

### Cenário 8 — ação necessária não entra em loop

- Forma de validar: teste parametrizado para conflito, imutabilidade, lease e
  atualização obrigatória.
- Given: o motor persiste `action_required` ou bloqueio permanente.
- When: a passagem do Worker termina.
- Then: o snapshot e detalhes seguros permanecem conforme a FIT-0087, o Worker
  devolve `success` e o WorkManager não repete automaticamente a ação humana.

### Cenário 9 — abrir o app retoma fila adiada

- Forma de validar: teste do coordenador TypeScript e teste Android do motor com um
  work ainda atrasado pelo scheduler.
- Given: existe pendência e o WorkManager ainda não a executou.
- When: a pessoa abre ou retoma o aplicativo com sessão e conectividade válidas.
- Then: o gatilho de foreground solicita passagem imediata pelo mesmo motor, sem
  aguardar o periodic work e sem criar request paralelo se o Worker começar junto.

### Cenário 10 — ausência de credencial ou configuração falha fechada

- Forma de validar: teste parametrizado do Worker com envelope ausente, expirado,
  corrompido e URL-base inválida.
- Given: a fila local existe, mas o processo nativo não pode montar uma request
  autenticada segura.
- When: o Worker inicia.
- Then: nenhum request é emitido, a fila permanece, não ocorre login ou fallback por
  cookie e o trabalho termina sem loop de retry permanente.

### Cenário 11 — melhor esforço permanece sem comunicação visual

- Forma de validar: inspeção da UI/manifest e teste das fronteiras nativas.
- Given: o Android adia, cancela ou conclui o trabalho comum.
- When: UI, notificações, permissões, eventos e Analytics são inspecionados.
- Then: não existe foreground service, notificação, toast ou comunicação preventiva;
  somente diagnóstico local sanitizado registra o caminho técnico.

## Estratégia de entrega e compatibilidade

1. Adicionar as dependências Java `work-runtime` e `work-testing` 2.11.2 nas
   configurações proprietárias do Android e preservar API mínima 29.
2. Encapsular a leitura nativa do envelope e da URL-base atrás de ports testáveis,
   mantendo uma única persistência Bearer e compatibilidade com instalações atuais.
3. Fazer o motor expor uma conclusão aguardável e sanitizada para consumidores
   nativos, sem duplicar transporte, classificação ou transições de fila.
4. Implementar o Worker e mapear somente resultados do motor para
   `success/retry`, com cancelamento cooperativo e recuperação de claim.
5. Implementar o agendador único, ligá-lo ao commit de snapshot, à autenticação e
   ao bootstrap Android, e manter abertura/resume como gatilho imediato separado.
6. Adicionar testes por camada e atualizar somente então os SDDs vivos afetados.
7. Revisar API e UI por código sem uso e executar os gates aplicáveis.

O rollout preserva pendências e sessões já gravadas. WorkManager mantém seu banco
próprio apenas para metadados de agendamento; ele não se torna fonte da fila. Uma
versão anterior do app ignora os requests somente antes de distribuição; depois de
distribuída, classe e nomes persistidos do Worker não podem ser removidos ou
renomeados sem migração. Desabilitar funcionalmente a capacidade cancela os works,
mas não apaga snapshots locais.

## Plano de testes

- Java local:
  - mapeamento de conclusão do motor para `success/retry`;
  - envelope válido, ausente, expirado, corrompido e limpeza após `401`;
  - URL-base válida e rejeição segura da configuração inválida;
  - cancelamento cooperativo, exceção temporária e falha permanente;
  - logs sem Bearer, payload, pessoa ou ID de domínio.
- WorkManager test runtime:
  - unique one-time com `KEEP` sob agendamentos concorrentes;
  - unique periodic com `KEEP`, seis horas e registro idempotente;
  - constraint exclusiva `CONNECTED` e backoff exponencial de 30 segundos;
  - execução, retry, cancelamento e persistência sem `Data` funcional.
- Android instrumentado com SQLite e Keystore reais:
  - Worker sem Activity/WebView lendo a mesma conta, fila e credencial;
  - singleton compartilhado com foreground e no máximo um upload;
  - processo interrompido, recuperação de `in_flight` e replay idempotente;
  - revisão nova durante upload antigo e remoção condicionada;
  - logout/troca de conta concorrentes e nenhuma resposta na geração nova;
  - `401`, `action_required` e bloqueio sem loop;
  - persistência do agendamento após recriação do processo.
- Vitest:
  - configuração da bridge/coordenador da sessão e da URL-base quando afetada;
  - abertura/resume continua acordando imediatamente o motor;
  - Web/PWA não importa, registra nem chama WorkManager ou credencial Android.
- Validação manual:
  - APK debug em API 29+ com modo avião, fechamento forçado do processo,
    reconexão e inspeção do work por Android Studio/`adb`;
  - confirmar execução sem abrir WebView, ausência de notificação/foreground
    service e ausência de Bearer no banco, WorkManager `Data` e logcat;
  - observar que otimizações de bateria podem adiar o trabalho e que abrir o app
    retoma a fila imediatamente.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm android:sync`;
  - `pnpm android:build:debug`;
  - `pnpm android:test` em dispositivo ou emulador conectado.

`pnpm -C api test:e2e` e `pnpm test:integration` não são exigidos enquanto endpoint,
wiring de backend, rota e cenário integrado de UI permanecerem inalterados.

## Riscos e decisões

- Um unique work global, e não um work por execução, corresponde à fonte única da
  FIT-0087: o motor já ordena e drena todas as pendências. `KEEP` evita substituir um
  upload ativo; a própria fila e `runAgain` absorvem revisões criadas nesse intervalo.
- O periodic work é contingência, não relógio exato. Modo Doze, app standby,
  quotas, fabricante e bateria podem adiar tanto one-time quanto periodic work.
- WorkManager agenda; o motor decide. Copiar status, backoff HTTP ou payload para o
  Worker criaria duas máquinas de estado divergentes.
- O backoff externo de 30 segundos evita um Worker longo. `next_attempt_at` continua
  sendo a barreira canônica de elegibilidade e impede retry antes do prazo do
  servidor mesmo se o scheduler acordar cedo.
- `401` e ação necessária terminam o work corrente como sucesso operacional porque
  repetir sem mudança externa não pode avançar. Isso preserva a fila sem loop e
  permite novo disparo por login, nova revisão, ação humana ou contingência.
- Compartilhar o Bearer exige acesso nativo ao cofre vigente. A implementação não
  pode guardar uma segunda cópia para simplificar o Worker; eventual migração troca
  atomicamente o proprietário e preserva compatibilidade de sessões existentes.
- A URL-base pode ser persistida porque é pública, mas ainda é validada e privada ao
  aplicativo para impedir que estado corrompido redirecione o Bearer.
- WorkManager e o SQLite da aplicação possuem bancos diferentes por definição. O
  commit do snapshot precede o enqueue, e os gatilhos/periodic work reparam falha
  entre eles; não existe transação distribuída nem perda da pendência.
- O Worker normal preserva a proibição de foreground service. Se a passagem exceder
  a janela concedida, cancelamento e replay idempotente são preferíveis a promover o
  trabalho ou prometer conclusão imediata.
- A feature permanece dentro da sessão prevista porque reutiliza integralmente a
  FIT-0087, adota a inicialização padrão do WorkManager e não inclui UI, backend,
  multiprocess, refresh de credencial ou execução offline da rota Treinar.

## Condições esperadas da entrega

- Cada nova pendência agenda um único trabalho persistente da fila
- Contingência única de seis horas registrada idempotentemente
- Única constraint customizada é conectividade disponível
- Worker executa sem Activity, WebView ou JavaScript
- Mesmos SQLite, Bearer, motor, transporte e lock usados em foreground e background
- No máximo um upload em voo entre todos os gatilhos
- Interrupção preserva item recuperável e replay idempotente
- Falhas temporárias usam backoff; `401` e ação necessária não entram em loop
- Abertura/resume retoma imediatamente fila adiada pelo Android
- Nenhum foreground service ou comunicação preventiva introduzido
- Web/PWA, API, contratos e apresentação permanecem inalterados
- SDDs vivos afetados atualizados somente durante a implementação autorizada
- Revisão de código sem uso e quality gates aplicáveis aprovados
