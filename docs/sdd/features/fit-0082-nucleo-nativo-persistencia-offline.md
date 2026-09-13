# Feature Spec: Núcleo nativo de persistência offline no Android

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #82](https://github.com/eduardodallmann/dall-fit/issues/82).
- Problema: o Android já possui container Capacitor, autenticação nativa e uma port
  provisória de dados locais, mas ainda não existe uma fonte local que possa ser
  usada tanto pela UI quanto pelo futuro WorkManager com o WebView fechado. Manter
  dados offline no JavaScript ou em IndexedDB criaria dois proprietários e impediria
  a coordenação nativa de transações, arquivos, fila e concorrência.
- Resultado: o projeto Android recebe um motor nativo único, apoiado pelo SQLite e
  pelo diretório interno privado do aplicativo, e um plugin Capacitor local e tipado.
  UI e consumidores nativos compartilham o mesmo serviço, os mesmos dados e o mesmo
  lock; operações compostas são transacionais, migrations são versionadas e a
  limpeza de conta coordena linhas e arquivos sem expor SQL, paths ou uma segunda
  implementação Web.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [ADR-0012 — Capacitor Android e fronteira de plataforma](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md);
  - [ADR-0013 — sessões Web e nativas isoladas](../adr/ADR-0013-sessoes-web-e-native-isoladas.md);
  - [FIT-0079 — fundação Capacitor Android](fit-0079-estruturar-aplicativo-capacitor-android.md);
  - [FIT-0080 — autenticação Bearer nativa](fit-0080-autenticacao-bearer-nativa-api.md);
  - [FIT-0081 — login e isolamento de conta](fit-0081-login-isolamento-conta-android.md);
  - [código nativo local no Capacitor](https://capacitorjs.com/docs/android/custom-code);
  - [criação de plugins Capacitor](https://capacitorjs.com/docs/plugins/creating-plugins);
  - [`SQLiteOpenHelper`](https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper);
  - [`SQLiteDatabase`](https://developer.android.com/reference/android/database/sqlite/SQLiteDatabase);
  - [armazenamento interno específico do aplicativo](https://developer.android.com/training/data-storage/app-specific).
- Features relacionadas: FIT-0079 fornece a fronteira Capacitor; FIT-0081 fornece
  `NativeLocalDataPort` e as regras de troca/logout que esta entrega passa a atender
  concretamente. As issues 83, 87, 88 e 89 usarão o núcleo para preparação,
  sincronização, WorkManager e treino, sem transferir a propriedade do storage ao
  JavaScript. A issue 92 acrescentará migrations reais de evolução e bloqueio por
  versão do aplicativo.

O repositório usa Capacitor `8.5.2`, Android mínimo API 29, Java no projeto nativo
e compile/target SDK 36. A implementação usará o `SQLiteOpenHelper` do Android,
cujo create/upgrade/downgrade é executado transacionalmente, e o plugin local
registrado no `MainActivity`, conforme a API oficial do Capacitor. Não será
adicionada uma biblioteca ORM ou um plugin SQLite de terceiros nesta fundação.

## Escopo

### Incluído

- criar um serviço Android independente do WebView que seja o único proprietário
  do SQLite, do diretório privado offline, dos metadados de arquivos e do lock global;
- criar e registrar um plugin Capacitor local, fino, que traduza chamadas e eventos
  entre TypeScript e o serviço nativo sem conter regras de persistência;
- substituir o adapter provisório de `NativeLocalDataPort` pelo adapter da bridge,
  mantendo a orquestração de conta da FIT-0081;
- criar schema base versionado para conta local, plano preparado, sessão ativa,
  snapshot por execução, estado operacional de sincronização, metadado de arquivo
  e metadado do motor;
- guardar plano, sessão e snapshot como agregados JSON opacos e versionados, com
  apenas IDs, revisão, estado operacional e timestamps necessários normalizados;
- fornecer comandos atômicos de leitura/substituição/remoção desses agregados,
  sem antecipar o formato de domínio definido pelas features consumidoras;
- fornecer registro, conclusão, consulta e remoção de arquivos privados por IDs e
  paths relativos controlados exclusivamente pelo motor;
- serializar operações mutáveis por um lock justo e único da instância do motor,
  compartilhado pelo plugin e por futuros consumidores nativos;
- expor um snapshot de estado observável com revisão monotônica e eventos
  best-effort, sempre reparáveis por nova leitura canônica;
- executar criação e migrations incrementalmente, em ordem, sem editar uma
  migration que já tenha sido distribuída;
- recuperar automaticamente uma migration interrompida por rollback/reexecução e,
  diante de falha irrecuperável ou downgrade incompatível, recriar banco e arquivos;
- manter o reset por migration invisível para a pessoa: sem toast, alerta, modal,
  Analytics ou mudança de rota; registrar somente diagnóstico técnico sanitizado e
  metadado não sensível da última recuperação;
- tornar limpeza de conta e reset completos idempotentes, fechados a concorrência e
  coordenados entre linhas, arquivos e metadados;
- adicionar testes TypeScript da bridge e testes Android instrumentados com SQLite
  e filesystem reais para schema, concorrência, migrations, falhas e recuperação;
- atualizar, na futura implementação, os SDDs vivos transversais e da UI e registrar
  a decisão arquitetural do motor nativo único em ADR.

### Não incluído

- normalizar workouts, exercícios, séries, cargas ou demais campos dos payloads de
  plano, sessão e snapshot;
- download ou atualização de plano, imagem ou vídeo e regras de validade de sete dias;
- regras de execução, timers, conclusão, cancelamento ou resumo de treino;
- client HTTP nativo, envio, coalescência, backoff, retry ou classificação de erros;
- WorkManager, unique work, periodic work, foreground service ou execução de
  JavaScript com o WebView fechado;
- lease Redis, takeover, conflito, protocolo de snapshots da API ou mudança de
  endpoint e contrato compartilhado;
- tela de pendências, comunicação visual de sync ou aviso visual de reset;
- IndexedDB, localStorage ou cache PWA para plano, sessão, snapshot, fila ou mídia;
- criptografia adicional do banco ou dos arquivos, biometria e novas permissões de
  armazenamento; o sandbox interno do Android é a proteção desta etapa;
- suporte iOS, backup de dados offline, CI Android, assinatura ou publicação;
- um pacote/plugin publicável, ORM ou dependência SQLite de terceiros.

## Projetos e documentação afetados

- API e endpoints: não afetados; nenhuma request HTTP nasce nesta entrega.
- UI e rotas: `ui` recebe contratos exclusivos do cliente, adapter da bridge,
  plugin/serviço Android, schema e testes. Nenhuma rota ou apresentação muda;
  portanto não há documento de rota nem referência visual a atualizar.
- Fluxos: nenhum fluxo ponta a ponta muda nesta infraestrutura.
- Contratos em `@dall-fit/types`: não afetados; a bridge e os payloads locais são
  internos da UI/Android e não representam HTTP compartilhado.
- Decisões arquiteturais: criar ADR para SQLite/filesystem sob propriedade do motor
  nativo, plugin local fino, payloads opacos e ausência de IndexedDB nativo.
- Handlers e fixtures MSW: não afetados porque não existe tráfego HTTP novo.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.
- SDD transversal: atualizar a arquitetura para registrar a propriedade única do
  motor Android e os comandos Android de teste que forem adicionados.
- SDD da UI: atualizar arquitetura e qualidade com bridge, serviço, schema,
  recuperação silenciosa, isolamento Web e matriz de testes nativos.

## Requisitos funcionais

1. O motor é um serviço Android reutilizável sem dependência de `Activity`, WebView
   ou React. Plugin Capacitor e futuros Workers obtêm a mesma instância por uma
   composição de escopo da aplicação.
2. O plugin local é registrado explicitamente no `MainActivity`. O objeto
   TypeScript usa `registerPlugin` com interface concreta; nomes, argumentos,
   retornos, erros e eventos coincidem com a anotação e os métodos Java.
3. Somente arquivos dentro da fronteira nativa de `ui/src/core/platform/native/`
   importam ou chamam o plugin. Web/PWA usa adapter explícito que não inicializa
   bridge e informa indisponibilidade da persistência offline.
4. O serviço usa um banco privado nomeado e um `SQLiteOpenHelper` com versão inteira
   positiva. Foreign keys são habilitadas antes de create/upgrade; schema e índices
   são declarados por migrations incrementais imutáveis.
5. A migration inicial cria:
   - metadado do motor em linha singleton, incluindo revisão de estado, geração de
     reset e categoria opcional da última recuperação;
   - uma conta local por instalação;
   - no máximo um plano preparado e uma sessão ativa para a conta;
   - no máximo um snapshot corrente por ID de execução, permitindo várias
     execuções concluídas ainda pendentes;
   - um estado de sincronização por execução, separado do conteúdo do snapshot;
   - metadados de arquivos vinculados à conta e, quando aplicável, ao plano.
6. A bridge oferece `bindAccount(personId)` para a identidade canônica recebida da
   API. A operação cria a conta quando vazia, é idempotente para a mesma pessoa e
   rejeita outra pessoa até `clearAccountDataAtomically` concluir. O coordenador
   chama essa operação depois de validar uma sessão recuperada e durante a confirmação
   de login; assim uma instalação atual recebe banco vazio sem perder sua sessão.
   Plano, sessão e snapshot possuem `payloadVersion` e `payload` JSON opaco; o motor
   valida o envelope, IDs, tipos primitivos, timestamps ISO e JSON serializável, mas
   não interpreta workouts, exercícios, cargas ou regras futuras de domínio.
7. Metadados normalizados usam revisões inteiras monotônicas, timestamps ISO com
   timezone e estados enumerados definidos pela bridge. Campo ou estado ainda sem
   consumidor não é criado como ponto de extensão hipotético.
8. Cada comando composto abre no máximo uma transação de escrita, grava o agregado
   completo e seus metadados ou não altera nada. Não existe API pública de SQL,
   transação arbitrária, patch de JSON ou path absoluto.
9. Substituir ou remover plano e arquivos exige o ID/revisão esperados. O motor
   oferece a primitive atômica, mas a issue 83 decidirá quando acioná-la e quais
   mídias do plano anterior podem ser descartadas.
10. Gravar uma sessão ou snapshot exige a conta relacionada e uma revisão superior
    à persistida; revisão repetida é idempotente e revisão regressiva é rejeitada
    sem alteração. Sessão e snapshot guardam seu `planId`, mas não dependem da linha
    do plano preparado corrente, permitindo preservar uma execução baseada em
    snapshot anterior quando a preparação mudar futuramente.
11. O estado de sincronização é atualizado por compare-and-set de revisão dentro da
    mesma transação do snapshot quando o comando exigir. Esta feature cobre apenas
    a primitive; estados de fila, backoff e HTTP pertencem à issue 87.
12. Dados sincronizados podem ser removidos por ID e revisão esperada. Uma resposta
    tardia não remove um snapshot mais novo criado enquanto a operação anterior
    estava em andamento.
13. O diretório offline fica sob o armazenamento persistente interno do aplicativo,
    separado de cache e sem permissão Android adicional. O banco persiste somente
    paths relativos gerados/validados pelo motor; `..`, path absoluto, symlink e
    escape do diretório raiz são rejeitados.
14. Um arquivo nasce com ID e metadado em estado temporário, é escrito em nome
    temporário e só se torna disponível depois de fechamento, validação e rename no
    mesmo filesystem. Falha ou morte antes da conclusão deixa item indisponível e
    removível pela recuperação; bytes ou URLs não atravessam esta bridge ainda.
15. Leituras de arquivo devolvem somente ID, estado e metadados sanitizados. O path
    absoluto permanece interno e nunca entra em JavaScript, log, Analytics ou banco.
16. Toda mutação do serviço passa por um lock justo de processo, compartilhado pela
    instância única. O lock serializa plugin e futuros Workers; transações SQLite
    continuam sendo a fronteira de atomicidade e a morte do processo libera o lock.
17. O lock não é uma lease persistida, não sobrevive à morte do processo e não é
    exposto como callback JavaScript. Operação concorrente aguarda a região crítica
    ou recebe o resultado idempotente; nunca executa uma segunda escrita em paralelo.
18. `getState` devolve um snapshot canônico que inclui revisão monotônica,
    inicialização, presença de conta/plano/sessão, quantidade de snapshots
    pendentes, quantidade de arquivos por estado e recuperação técnica mais recente.
    Não devolve payloads, IDs pessoais, paths ou detalhes de erro.
19. Após commit, o plugin emite `stateChanged` best-effort com o mesmo resumo e sua
    revisão. Perda, duplicação ou atraso de evento é reparado por `getState`; ao
    iniciar/retomar, a UI lê estado canônico em vez de depender de replay de eventos.
20. `hasPendingChanges` usa o estado canônico do motor e considera sessão ativa ou
    snapshot ainda não sincronizado. Plano preparado, arquivo que pode ser baixado
    novamente e temporário abandonado não são pendência da pessoa. A FIT-0081
    continua decidindo quando pedir confirmação de logout; o adapter deixa de
    responder um valor fixo.
21. `clearAccountDataAtomically` bloqueia novas operações, torna imediatamente
    inacessíveis os arquivos da conta, remove em transação todas as suas linhas e
    conclui a exclusão física antes de resolver. Restos de uma interrupção ficam em
    área de descarte interna, nunca são associados a outra conta e são removidos na
    próxima inicialização.
22. A limpeza é idempotente. Falha de SQLite ou filesystem rejeita a operação,
    mantém o motor fechado para ativação de outra conta e permite retry seguro, sem
    estado misto visível. O UUID da instalação e o secure storage continuam sob a
    propriedade e as regras da FIT-0081.
23. Abertura de banco novo aplica a migration inicial integralmente. Upgrade aplica
    cada passo consecutivo até a versão alvo; migration ausente, downgrade ou falha
    que persiste depois de fechar o handle e repetir uma vez a abertura são
    classificados como recuperação irrecuperável.
24. Uma interrupção durante migration não publica schema parcial: a transação sofre
    rollback e a próxima abertura repete o passo. Se a abertura ainda falhar, o motor
    fecha handles, isola e remove banco, journal/WAL e diretórios offline, cria schema
    limpo e só então volta a aceitar comandos.
25. O reset por migration ou corrupção é silencioso para a pessoa. Um único log
    Android registra categoria enumerada, versões de origem/destino e classe da
    exceção, sem mensagem livre, stack, SQL, payload, pessoa, ID ou path. O banco
    novo registra geração e categoria da recuperação para `getState`, sem gerar UI
    ou Analytics.
26. Se nem o reset puder concluir, a inicialização falha fechada e a bridge rejeita
    comandos com código estável e mensagem sanitizada. Ela não usa IndexedDB, storage
    Web ou um banco paralelo como fallback.

## Requisitos não funcionais

- Acessibilidade: não há nova superfície visual. O reset deliberadamente invisível
  não altera foco, rota, toast, modal ou região anunciada.
- Performance:
  - inicialização, migrations e I/O executam fora da thread principal;
  - a instância do helper e o executor são reutilizados, sem abrir banco por comando;
  - eventos transportam apenas resumo; payloads completos são lidos sob demanda;
  - índices existem somente para lookup/ordenação operacional já consumida.
- Segurança e privacidade:
  - banco e arquivos ficam no armazenamento interno privado e continuam excluídos
    de cloud backup e transferência device-to-device pelas regras vigentes;
  - nenhuma permissão de storage, URI compartilhável ou path absoluto é introduzido;
  - SQL, nomes de arquivo e erros não aceitam valores usados como código/path sem
    validação; queries usam argumentos vinculados;
  - payload, pessoa, IDs, conteúdo de treino e arquivos não entram em logs, eventos
    de resumo ou Analytics;
  - a ausência deliberada de criptografia adicional não permite exportar o banco ou
    reduzir a proteção do sandbox.
- Observabilidade:
  - falhas expõem códigos estáveis por categoria, nunca mensagens SQLite como
    contrato funcional;
  - diagnósticos ficam no Logcat do momento da falha e no metadado técnico mínimo
    de recuperação; não há log persistente em arquivo nem telemetria offline;
  - reset automático e operações normais não produzem comunicação para a pessoa.
- Concorrência: nenhuma chamada resolve antes do commit/efeito terminal que promete;
  listener é notificado somente depois do commit e fora do lock.
- Manutenibilidade: bridge TypeScript, plugin e serviço possuem responsabilidades
  separadas; migrations distribuídas são imutáveis; schema e contratos não contêm
  regras especulativas das próximas issues.
- Compatibilidade: Android API 29+ e Capacitor `8.5.2` são preservados. Web/PWA,
  quality gates web e build sem Android SDK continuam independentes do motor.
- Limite de execução: a implementação deve caber em uma sessão de até cinco horas.
  Para isso usa Java, APIs Android existentes, plugin local, schema enxuto e payloads
  opacos; não normaliza domínio nem implementa consumidores futuros.

## Critérios de aceite

### Cenário 1 — UI e consumidor nativo compartilham a fonte

- Forma de validar: teste Android instrumentado do serviço e plugin e smoke no APK
  debug; reprodução por URL não se aplica porque não há rota nova.
- Given: o plugin grava um agregado por meio do motor.
- When: outro consumidor nativo obtém a instância do serviço e lê o mesmo ID.
- Then: ambos observam o mesmo valor/revisão no SQLite e não existe IndexedDB ou
  implementação paralela.

### Cenário 2 — Snapshot composto é atômico

- Forma de validar: teste Android instrumentado com falha injetada antes do commit.
- Given: existe snapshot confirmado na revisão N.
- When: a gravação da revisão N+1 falha entre payload e estado de sincronização.
- Then: a leitura retorna integralmente N, sem payload parcial, revisão avançada ou
  estado operacional divergente.

### Cenário 3 — Concorrência não perde a revisão mais nova

- Forma de validar: teste Android instrumentado com duas threads e barreiras reais.
- Given: duas chamadas disputam a mesma execução.
- When: elas tentam persistir revisões consecutivas ou remover a revisão anterior.
- Then: o lock e a precondição serializam as escritas, a revisão final é monotônica
  e uma resposta tardia não remove o snapshot mais novo.

### Cenário 4 — Agregados permanecem opacos ao motor

- Forma de validar: testes do serviço com dois payloads versionados de shapes distintos.
- Given: os envelopes possuem IDs, versões e timestamps válidos.
- When: plano, sessão e snapshot são gravados e lidos.
- Then: o JSON é preservado sem normalização de exercícios ou regras de treino, e
  o motor decide apenas integridade, relacionamento e revisão.

### Cenário 5 — Arquivo incompleto nunca fica disponível

- Forma de validar: teste Android instrumentado com diretório temporário e falhas de I/O.
- Given: um metadado temporário foi criado.
- When: a escrita é interrompida antes da conclusão ou o rename falha.
- Then: nenhuma leitura o apresenta como pronto e a inicialização seguinte remove o
  temporário sem afetar arquivos concluídos.

### Cenário 6 — Evento perdido é reparado pela leitura

- Forma de validar: Vitest do adapter e teste Android do plugin/listener.
- Given: o motor comita uma mudança enquanto nenhum listener está ativo.
- When: a bridge é iniciada ou retomada e chama `getState`.
- Then: recebe a revisão e os contadores canônicos atuais sem depender de replay.

### Cenário 7 — Migration interrompida é retomada

- Forma de validar: teste Android instrumentado com banco fixture em versão anterior
  e falha que force rollback da migration.
- Given: o banco contém dados e uma migration é interrompida antes do commit.
- When: o processo abre novamente a mesma versão alvo sem a falha injetada.
- Then: o passo é reexecutado integralmente, os dados permanecem coerentes e nenhum
  reset é registrado.

### Cenário 8 — Falha irrecuperável recria silenciosamente

- Forma de validar: teste Android instrumentado com fixture incompatível/falha
  repetida e captura do logger nativo sanitizado.
- Given: o banco e os arquivos contêm plano e snapshots pendentes.
- When: a migration não consegue concluir nem ser reaberta de forma segura.
- Then: o motor remove banco e arquivos, cria schema vazio, incrementa a geração de
  reset e volta a operar; nenhum toast, modal, Analytics ou navegação é produzido.

### Cenário 9 — Limpeza de conta remove linhas e arquivos

- Forma de validar: teste Android instrumentado e Vitest do fluxo da FIT-0081.
- Given: a conta possui plano, sessão, snapshots, estados e arquivos concluídos ou
  temporários.
- When: troca de conta ou logout chama `clearAccountDataAtomically`.
- Then: nenhum artefato permanece acessível, a exclusão física termina antes do
  sucesso e repetir o comando produz o mesmo estado vazio.

### Cenário 10 — Falha de limpeza impede mistura de contas

- Forma de validar: teste Android com falha de SQLite/filesystem e Vitest do
  coordenador nativo.
- Given: a conta A ainda possui estado e a autenticação obteve a conta B.
- When: a limpeza local rejeita.
- Then: o motor não ativa dados de B, permanece fechado para nova escrita até retry
  seguro e nenhum artefato de A é apresentado como pertencente a B.

### Cenário 11 — Web/PWA não acessa storage nativo

- Forma de validar: `pnpm build`, Vitest de fronteira e busca de imports.
- Given: a aplicação executa no navegador.
- When: o snapshot de plataforma e a port Web são usados.
- Then: plugin, SQLite e filesystem não são carregados, nenhum dado offline entra em
  IndexedDB/localStorage e o comportamento online vigente permanece inalterado.

## Estratégia de entrega e compatibilidade

1. Registrar a ADR do motor nativo único e atualizar contratos locais da UI sem
   alterar contratos HTTP.
2. Implementar o schema v1, helper, migrations, executor serial e serviço Android,
   mantendo o código independente do plugin e do WebView.
3. Implementar primitives de agregados, compare-and-set, arquivos e limpeza com
   envelopes mínimos e payloads opacos.
4. Implementar abertura/recuperação, descarte de temporários e reset silencioso com
   diagnóstico sanitizado.
5. Registrar o plugin no app, criar contrato/adapter TypeScript e conectar a port
   vigente da FIT-0081, preservando o fallback Web.
6. Adicionar testes Android e TypeScript, scripts locais estritamente necessários,
   atualizar SDDs vivos e executar os gates.

A mudança é compatível com a FIT-0081: `hasPendingChanges` e
`clearAccountDataAtomically` mantêm seus contratos e deixam de usar o adapter vazio,
enquanto `bindAccount` acrescenta o vínculo explícito. O schema v1 não precisa de
dados legados porque nenhuma feature anterior criou o banco; uma sessão segura já
existente vincula sua pessoa ao banco novo no primeiro bootstrap, e artefatos Web
não são migrados para o Android.

Rollback de uma versão distribuída não oferece downgrade do banco. Uma build mais
antiga encontra schema incompatível e executa o reset silencioso definido nesta
feature. Antes da primeira release Android, rollback de desenvolvimento pode limpar
os dados locais explicitamente. Depois que uma migration for distribuída, ela é
imutável e uma correção usa uma nova versão.

## Plano de testes

- Vitest:
  - adapter chama somente a bridge Android e o fallback Web não registra plugin;
  - validação dos envelopes, mapeamento de erros e tipos dos comandos/eventos;
  - `hasPendingChanges` usa o estado canônico e limpeza integra troca/logout;
  - listener perdido, duplicado e tardio é reconciliado por revisão/`getState`;
  - reset técnico não emite Analytics nem aciona apresentação.
- Android instrumentado com banco e filesystem reais:
  - criação do schema v1, constraints, foreign keys e índices;
  - round-trip de agregados opacos e revisões idempotente/regressiva;
  - atomicidade de snapshot + estado diante de falha injetada;
  - disputa entre threads, exclusão tardia e lock liberado após exceção;
  - arquivo temporário, conclusão, escape de path e limpeza de órfãos;
  - limpeza completa, repetida, interrompida e retomada;
  - migration incremental, rollback por interrupção, reabertura, downgrade e
    falha irrecuperável com reset;
  - sanitização do diagnóstico e ausência de payload/ID/path;
  - plugin e serviço observam a mesma instância e o mesmo estado.
- Configuração/fronteira:
  - plugin registrado antes do `BridgeActivity` concluir a criação;
  - imports Capacitor permanecem confinados ao adapter nativo;
  - banco/files continuam cobertos pelas exclusões de backup API 29/30 e 31+;
  - nenhuma nova permissão de armazenamento ou dependência SQLite é adicionada.
- Validação manual Android:
  - instalar APK debug, criar estado por harness de desenvolvimento, matar/reabrir
    processo e confirmar persistência/estado canônico;
  - executar limpeza e reset e inspecionar banco/diretório pelo Device File Explorer;
  - confirmar que falha recuperada não mostra comunicação na UI;
  - confirmar que nenhum dado sensível aparece no Logcat.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm android:sync`;
  - `pnpm android:build:debug`;
  - comando local documentado para os testes Android instrumentados em emulador ou
    dispositivo API 29+.

`pnpm -C api test:e2e` e `pnpm test:integration` não são exigidos porque nenhum
endpoint, wiring backend, rota ou cenário integrado de UI muda. Se a implementação
exigir uma dessas mudanças, ela sai do contrato validado e a feature volta ao
refinamento.

## Riscos e decisões

- A issue permanece única conforme decisão do refinamento. O limite de cinco horas
  é protegido por schema enxuto, payloads JSON opacos, Java/API Android existentes,
  plugin local e ausência de HTTP, WorkManager e regras de treino.
- `SQLiteOpenHelper` foi escolhido em vez de Room, ORM ou plugin comunitário porque
  o motor precisa de poucas tabelas operacionais, migrations explícitas e controle
  direto das transações, sem adicionar geração, runtime ou uma segunda bridge.
- O payload opaco evita cristalizar nesta issue os contratos das issues 83/85/89.
  A contrapartida é que consultas de domínio internas ao JSON não existem; cada
  agregado é lido/substituído integralmente e metadados operacionais ficam em colunas.
- O lock é de processo e o SQLite é a fronteira durável. Persistir um lease local
  criaria recuperação de lock abandonado sem necessidade: WebView e WorkManager
  executarão no mesmo processo, e morte do processo encerra a região crítica
  enquanto rollback/journal preserva o banco.
- Eventos são hints e nunca a fonte de verdade. Essa semântica permite que mudanças
  feitas com WebView fechado apareçam na próxima leitura sem exigir replay persistido.
- SQLite não torna exclusão de filesystem parte da mesma transação. O motor resolve
  isso tornando o diretório inacessível, usando descarte interno e limpeza idempotente;
  sucesso só é devolvido depois que linhas e arquivos foram removidos.
- O reset irrecuperável é intencionalmente invisível para a pessoa, conforme o
  refinamento. Isso aceita perda silenciosa de pendências em favor da recuperação
  automática; dados confirmados poderão ser baixados novamente pelas features futuras.
- O metadado da recuperação não é um log de conteúdo: guarda apenas geração e
  categoria para diagnóstico/teste e não produz UI, Analytics ou persistência de stack.
- Ausência de cifra adicional foi decidida na issue. Banco e arquivos continuam
  privados pelo sandbox, excluídos de backup e sem exportação; introduzir criptografia
  no futuro exigirá migração e nova decisão.
- O contrato não expõe bytes nem URL de arquivo nesta etapa. Ele prepara lifecycle e
  metadados atômicos; download e consumo da mídia entram na issue 83.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- SQLite e arquivos privados sob um único motor nativo
- UI, futuro WorkManager e plugin preparados para compartilhar serviço e lock
- Schema e migrations versionados com recuperação/reset silencioso testados
- Agregados JSON opacos com metadados operacionais normalizados
- Snapshot, estado de sync e exclusão protegidos por transação e revisão
- Arquivos temporários nunca publicados e limpeza coordenada/idempotente
- Nenhum dado offline privado persistido em IndexedDB no canal nativo
- Web/PWA, autenticação nativa e regras de backup preservados
- ADR, bases transversais e bases da UI afetadas atualizadas
- Testes TypeScript e Android nativos cobrindo concorrência, migration e recuperação
- Revisão de código sem uso concluída em API e UI
- Quality gates web e validações Android aplicáveis aprovados
