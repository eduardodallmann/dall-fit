# Feature Spec: Preparar release e rollout inicial na Play Store

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #93](https://github.com/eduardodallmann/dall-fit/issues/93).
- Problema: o Android já incorpora autenticação nativa, persistência offline,
  preparação, execução, sincronização em foreground e WorkManager, resolução de
  conflitos e atualização obrigatória, mas ainda não possui um caminho release
  reproduzível. O projeto usa assets provisórios do template, não assina AAB de
  produção, não separa a configuração publicada da configuração local e não possui
  automação ou checklist suficiente para repetir uma submissão segura.
- Resultado: o repositório produz localmente e no GitHub Actions um AAB release
  reproduzível de `com.dallfit.app`, assinado por uma chave de upload separada e
  pronto para Play App Signing. A chave de assinatura do aplicativo permanece sob
  custódia do proprietário e é importada uma única vez na Play Console. A primeira
  versão é validada no teste interno e, depois do smoke obrigatório, liberada
  manualmente para 100% da produção, com o offline disponível para todas as pessoas
  e sem feature flag.
- Referências locais:
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [documentação oficial das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [ADR-0012 — Capacitor Android e fronteira de plataforma](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md);
  - [ADR-0013 — sessões Web e native isoladas](../adr/ADR-0013-sessoes-web-e-native-isoladas.md);
  - [ADR-0014 — motor nativo de persistência offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [ADR-0016 — compatibilidade Android e recuperação visível](../adr/ADR-0016-compatibilidade-android-e-recuperacao-visivel.md);
  - [assinatura de aplicativos Android](https://developer.android.com/studio/publish/app-signing);
  - [preparação para release](https://developer.android.com/studio/publish/preparing);
  - [versionamento Android](https://developer.android.com/studio/publish/versioning);
  - [upload de AAB na Play Console](https://developer.android.com/studio/publish/upload-bundle);
  - [preparação e rollout de uma release](https://support.google.com/googleplay/android-developer/answer/9859348);
  - [ícones adaptativos](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive);
  - [SplashScreen](https://developer.android.com/develop/ui/views/launch/splash-screen);
  - [secrets no GitHub Actions](https://docs.github.com/actions/concepts/security/secrets).
- Features relacionadas:
  - [FIT-0079](fit-0079-estruturar-aplicativo-capacitor-android.md) criou o container
    Capacitor, fixou `com.dallfit.app`, API mínima 29 e reservou assinatura, assets,
    ambientes, CI e publicação para esta demanda;
  - [FIT-0081](fit-0081-login-isolamento-conta-android.md) introduziu Credential
    Manager, secure storage e exclusões de backup que precisam ser verificadas com
    as assinaturas definitivas;
  - [FIT-0088](fit-0088-sincronizar-workmanager-app-fechado.md) estabeleceu o
    comportamento best-effort em background, sem Foreground Service;
  - [FIT-0090](fit-0090-integrar-resumo-provisorio-takeover-conflitos-ui.md) tornou
    notificações contextuais e opcionais;
  - [FIT-0091](fit-0091-manter-pwa-online-sem-persistencia-privada.md) preservou o
    canal Web/PWA e reservou a promoção do Android para uma release real;
  - [FIT-0092](fit-0092-atualizacao-obrigatoria-compatibilidade-banco-local.md)
    estabeleceu `versionCode`, migração e atualização pela Play Store.

O estado de partida usa Capacitor `8.5.2`, application ID `com.dallfit.app`, API
mínima 29, compile/target SDK 36, Android Gradle Plugin `8.13.0`, Gradle Wrapper
`8.14.3`, `versionCode 2`, `versionName 1.0`, schema SQLite v4 e WorkManager
`2.11.2`. O manifest declara somente `INTERNET`, `ACCESS_NETWORK_STATE` e
`POST_NOTIFICATIONS`; banco, credencial, UUID, preferências e arquivos privados já
possuem regras de exclusão de backup para API 29/30 e 31+.

## Escopo

### Incluído

- criar build type release de produção que sempre embarque o bundle Vite local,
  use HTTPS para a API real, mantenha mocks desativados e falhe diante de variável
  ausente, URL local/insegura ou configuração incompatível;
- configurar assinatura release sem caminho, senha, alias, keystore, chave privada
  ou conteúdo codificado no repositório, em argumentos de linha de comando ou em
  logs;
- adotar Play App Signing com chave de assinatura do aplicativo gerada e custodiada
  pelo proprietário, importada na Play Console, e chave de upload distinta usada
  localmente e no CI;
- documentar geração, custódia, backup, importação, certificados públicos,
  fingerprints, rotação da chave de upload e recuperação sem expor material
  privado;
- gerar AAB release assinado por comando canônico na raiz e registrar o caminho
  determinístico do artefato, versão, SHA-256, package name e certificado de upload;
- criar workflow manual de release Android com GitHub Environment protegido,
  configuração pública por environment variables e material de upload somente em
  secrets;
- manter publicação na Play Console manual: o CI produz e preserva o AAB verificável,
  mas não cria release, não envia bundle e não promove track;
- manter `versionCode` como inteiro estritamente crescente e `versionName` como
  apresentação; documentar o incremento e fazer o workflow rejeitar artefato cuja
  identidade diverge do Gradle versionado;
- substituir os ícones e splash provisórios pelo símbolo vigente do Dall Fit,
  derivado da fonte vetorial versionada, com ícone adaptativo, round/legacy,
  camada monocromática e SplashScreen compatível com API 29+;
- revisar manifest merged, componentes exportados e paths do `FileProvider`,
  mantendo somente capacidades efetivamente usadas;
- preservar `POST_NOTIFICATIONS` como única permissão runtime, solicitada apenas no
  contexto já definido; não adicionar storage, localização, câmera, foreground
  service, instalação de pacotes ou permissões de publicidade;
- validar que cloud backup, transferência entre aparelhos, desinstalação e
  reinstalação não restauram sessão, UUID, política de compatibilidade, SQLite,
  fila, mídia nem diagnóstico de migration;
- produzir checklist versionado para cadastro e revisão da Play Console: identidade
  do app, Play App Signing, OAuth Android, ficha da loja, política de privacidade,
  segurança dos dados, classificação de conteúdo, países/preço, acesso para revisão,
  permissões, target API, teste interno, produção e arquivamento das evidências;
- executar smoke da build distribuída pelo teste interno, não de um APK debug,
  cobrindo login, uso online, primeira preparação, modo avião, reconexão,
  WorkManager com app fechado, notificação recusada/concedida, atualização sobre
  dados pendentes e reinstalação;
- liberar manualmente a mesma versão aprovada no teste interno para 100% da
  produção, sem rollout percentual, feature flag ou público funcional restrito;
- atualizar os SDDs vivos e decisões afetados somente na futura implementação
  autorizada.

### Não incluído

- iOS, outra loja, distribuição direta de APK ou sideload como canal suportado;
- live update, bundle JavaScript remoto, CodePush ou alteração do app fora da loja;
- upload, submissão, promoção ou publicação automatizada na Play Console;
- service account da Google Play Developer API no repositório ou no CI;
- rollout percentual de produção, teste aberto permanente ou feature flag para o
  offline;
- novo recurso de treino, alteração de endpoint, payload, SQLite, política de
  compatibilidade ou regra de sincronização;
- analytics offline persistido, crash reporter novo, coleta de identidade do
  aparelho ou telemetria nativa adicional;
- Foreground Service, trabalho expedited ou garantia de horário do WorkManager;
- novos flavors para staging/QA. Debug continua sendo o caminho local e release é
  o único ambiente Android publicável;
- criação de branding novo. Os assets Android materializam a identidade Dall Fit
  já versionada; mudança de marca exige outra demanda;
- guardar a chave privada de assinatura do aplicativo no GitHub. Ela é usada apenas
  no enrolamento inicial do Play App Signing e permanece em custódia offline;
- prometer aprovação, prazo de revisão ou disponibilidade da Play Store, que são
  decisões externas do Google e da conta proprietária.

## Projetos e documentação afetados

- API e endpoints: nenhum comportamento HTTP muda. A URL de produção já existente
  é entrada pública do build Android; a implementação apenas confirma HTTPS e
  compatibilidade com `GET /app-compatibility/android`, autenticação e sync.
- UI e rotas: nenhuma rota muda. `ui/android`, `capacitor.config.ts`, scripts e
  validação de ambiente recebem configuração de release, assinatura, assets,
  permissões e testes. Atualizar os documentos base da UI, sem criar screenshots de
  rota.
- Fluxos: atualizar o fluxo de execução de treino apenas com a validação de release,
  atualização pela loja e smoke distribuído, sem mudar a jornada funcional.
- Contratos em `@dall-fit/types`: não afetados.
- Decisões arquiteturais: registrar uma ADR de assinatura, custódia, automação e
  promoção Android. Ela fixa chave própria no Play App Signing, upload key separada,
  build manual protegido e publicação manual.
- Handlers e fixtures MSW: não afetados; o AAB release rejeita mocks e os testes Web
  continuam usando a fronteira vigente.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não há fixture nova; o smoke usa contas e dados de
  teste autorizados no ambiente publicado, sem registrar credenciais no repositório.
- Automação: adicionar workflow Android de `workflow_dispatch`, isolado do workflow
  de pull request e associado ao environment protegido `android-production`.
- Operação: adicionar runbook de release Android e checklist da Play Console em
  documentação viva de workspace/UI, sem inserir segredo ou dado pessoal.

## Requisitos funcionais

### Configuração, versão e artefato

1. O release Android compila exatamente a UI produzida pelo build Vite executado na
   mesma operação e sincronizada pelo Capacitor antes do Gradle. `dist` anterior não
   pode ser reutilizado quando build ou sync falhar.
2. A configuração release exige `VITE_API_URL` HTTPS, sem localhost, loopback,
   IP privado ou credencial embutida, e `VITE_GOOGLE_SERVER_CLIENT_ID` não vazio.
   `VITE_ENABLE_API_MOCKS` deve estar ausente ou ser `false`; qualquer divergência
   encerra antes de produzir o AAB.
3. Valores Vite são públicos dentro do bundle. A documentação não classifica API URL
   nem OAuth client ID como segredo e proíbe inserir token, senha, client secret ou
   credencial privada em variável `VITE_*`.
4. Existe um único application ID publicável, `com.dallfit.app`, e um único build
   type release. Debug conserva a configuração local e não pode ser promovido para a
   loja.
5. `versionCode` e `versionName` ficam em fonte versionada e auditável. Toda release
   posterior incrementa `versionCode`; o runbook explica o incremento, a relação com
   a política de compatibilidade e a impossibilidade de reutilizar um código já
   recebido pela Play Console.
6. A primeira submissão desta demanda preserva `versionCode 2` e `versionName 1.0`,
   já associados ao schema v4. Se a Play Console já tiver consumido o código 2 antes
   da promoção, o código deve ser incrementado em uma mudança explícita e a política
   de compatibilidade deve ser reavaliada; o workflow nunca decide isso sozinho.
7. O comando release da raiz produz
   `ui/android/app/build/outputs/bundle/release/app-release.aab` assinado, imprime
   somente metadados públicos e falha com mensagem acionável quando configuração,
   ferramenta ou credencial estiver ausente.
8. Uma verificação posterior confirma package name, `versionCode`, `versionName`,
   assinatura de upload, ausência de debuggable e SHA-256 do arquivo. Falha em
   qualquer verificação impede que o artefato seja anunciado como publicável.

### Assinatura e segredos

9. O proprietário gera uma chave de assinatura do aplicativo com validade
   compatível com a vida esperada do produto, mantém ao menos duas cópias offline
   cifradas sob controle distinto e importa essa chave no Play App Signing durante
   o cadastro inicial.
10. A chave de assinatura do aplicativo, seu keystore e senhas nunca entram no
    repositório, GitHub Actions ou runner. Somente seus certificados públicos e
    fingerprints podem ser documentados ou cadastrados em provedores.
11. Uma chave de upload diferente assina os AAB enviados. O keystore de upload e
    suas senhas ficam fora do repositório; no CI, são secrets do environment
    `android-production`, liberados apenas após aprovação do responsável.
12. O workflow reconstrói o keystore em diretório temporário com permissão mínima,
    não mostra conteúdo ou senha, não os passa por argumentos observáveis, mascara
    valores derivados quando necessário e remove o arquivo temporário mesmo após
    falha.
13. Nomes dos secrets são documentados sem valores. Devem distinguir keystore
    codificado, senha do store, alias e senha da key; configuração pública usa
    variables do environment e não secrets sem necessidade.
14. O certificado público da chave de assinatura distribuída pela Play Store é
    cadastrado no client OAuth Android de `com.dallfit.app`. O certificado de upload
    não o substitui para instalações entregues pela loja; fingerprints de debug
    continuam limitadas ao desenvolvimento.
15. O runbook descreve como pedir reset da chave de upload comprometida/perdida sem
    trocar a chave de assinatura do aplicativo. Perda da chave própria antes de sua
    importação ou falha de custódia é bloqueador explícito da primeira publicação.

### CI e promoção

16. O workflow de release é acionado somente por `workflow_dispatch`, usa versão de
    Node e pnpm vigentes, JDK/Android SDK compatíveis com o projeto e actions externas
    fixadas por commit imutável.
17. O job possui somente `contents: read`, não roda em pull request ou fork e associa
    o job assinado ao environment protegido `android-production`. Ausência de secret
    produz falha, nunca AAB unsigned ou assinado com debug.
18. Antes do bundle, o workflow instala por lockfile, executa validação de ambiente,
    `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`, `pnpm build` e testes Android
    locais que não dependam de dispositivo. Ele não substitui os instrumentados nem
    o smoke manual.
19. O artefato arquivado contém somente AAB, checksum e manifesto textual de
    metadados públicos. Keystore, `.env`, credenciais, logs sensíveis, caches,
    relatórios com segredo ou APK universal não entram no artifact.
20. O CI não usa credencial da Play Console. Uma pessoa autorizada baixa o artefato
    aprovado, confere checksum/metadados e faz upload manual no teste interno.
21. A mesma release aprovada no teste interno é promovida na Play Console para
    produção; não se recompila outro AAB entre tracks. Antes da promoção, o checklist
    exige smoke completo, ausência de bloqueio conhecido e conferência da ficha.
22. A produção é liberada diretamente para 100% dos países selecionados no cadastro,
    sem rollout por percentual. Interrupção antes da promoção é permitida; depois da
    liberação, correção usa novo `versionCode`, nunca substituição silenciosa.

### Identidade visual, manifest e privacidade

23. O símbolo vetorial vigente do Dall Fit é a fonte dos assets Android. O ícone
    adaptativo possui foreground/background dentro da safe zone, versão
    monocromática temática e fallbacks round/legacy para API 29+; não mantém o robô
    ou texto do template Capacitor.
24. A splash usa `androidx.core:core-splashscreen`, fundo coerente com a aplicação e
    o símbolo central, sem Activity exclusiva, timer artificial, animação bloqueante
    ou segunda tela de abertura.
25. Ícone e splash são verificados em API 29 e API 36, temas claro/escuro quando o
    sistema os aplicar e máscaras de launcher distintas, sem corte, distorção,
    fundo transparente acidental ou flash do asset provisório.
26. O manifest merged release declara somente `INTERNET`,
    `ACCESS_NETWORK_STATE` e `POST_NOTIFICATIONS`. Qualquer permissão trazida por
    dependência deve ser justificada ou removida antes da release.
27. `POST_NOTIFICATIONS` continua opcional: recusar ou não responder não impede
    autenticação, preparação, treino, persistência ou sincronização. API 29–32 não
    recebem prompt runtime inexistente.
28. O `FileProvider` mantém `exported=false`, grants temporários e somente o path
    privado necessário à mídia offline. Paths genéricos de external storage ou
    cache que não tenham consumidor comprovado são removidos.
29. Regras de backup e transferência excluem toda raiz privada usada pelo app em
    API 29/30 e 31+. A validação cobre shared preferences, database, files,
    no-backup/device-protected storage e secure storage efetivamente usados.
30. Desinstalar e reinstalar pela Play Store cria instalação limpa: não restaura
    Bearer, pessoa, UUID, mínimo de compatibilidade, plano, sessão, fila, mídia,
    decisão de notificação ou aviso de migration. Dados canônicos já sincronizados
    continuam no servidor e retornam somente após novo login.
31. O formulário de segurança dos dados e a política de privacidade refletem o
    comportamento implementado, incluindo login, dados de treino, notificações
    opcionais, transporte HTTPS, armazenamento local privado e ausência de
    persistência de diagnósticos offline. O checklist não inventa declaração legal;
    exige revisão humana antes da submissão.

### Smoke e publicação

32. O teste interno instala o pacote pela própria Play Store em ao menos um aparelho
    API 29 e um aparelho API 33+ ou 36. Pelo menos uma execução usa aparelho físico
    para validar Credential Manager, notificação e comportamento do sistema em
    background.
33. O smoke online valida primeira instalação, abertura, login Google com o
    certificado distribuído, navegação, preparação do plano, execução e sync sem
    erro de configuração ou atualização obrigatória indevida.
34. O smoke offline prepara o plano online, ativa modo avião, inicia e termina um
    workout, encerra o aplicativo, restaura conectividade e confirma envio posterior
    da fila sem Foreground Service.
35. O smoke de update instala a build anterior autorizada, mantém sessão/snapshot
    pendente, atualiza pela Play Store e confirma preservação, migration e retomada
    somente depois do gate de compatibilidade.
36. O smoke de reinstalação cria estado privado, desinstala, reinstala pela loja e
    confirma estado limpo. Restore ou transferência assistida é exercitado quando o
    aparelho de teste oferecer o mecanismo, sem transformar indisponibilidade do
    laboratório em aprovação automática.
37. O smoke registra versão, modelo/API, track, resultado e evidências sanitizadas,
    nunca credencial, identidade real, payload de treino ou screenshot com dado
    pessoal.
38. A promoção a 100% da produção exige todos os checks obrigatórios da Play Console,
    políticas e formulários concluídos, teste interno aprovado e URL de atualização
    da API apontando para a listagem oficial de `com.dallfit.app`.

## Requisitos não funcionais

- Acessibilidade:
  - ícone e splash não substituem informações necessárias por cor ou animação;
  - a UI embarcada preserva as garantias vigentes e o prompt de notificação continua
    contextual, com alternativa explícita;
  - screenshots e textos da ficha da loja passam por revisão legível, mas sua
    criação editorial não altera telas nesta demanda.
- Performance:
  - release usa otimizações suportadas sem introduzir minificação às cegas; qualquer
    ativação futura de shrink/obfuscation exige validar bridge Capacitor, plugins,
    Workers e regras de keep;
  - assets Android não duplicam bitmaps desnecessários nem aumentam o AAB sem
    justificativa;
  - o smoke observa abertura e trabalho em background, mas não cria promessa de
    execução imediata do WorkManager.
- Segurança e privacidade:
  - chave de assinatura própria fica offline; CI recebe somente a chave de upload;
  - nenhum segredo aparece em Git, artifact, cache, output, argumento de processo,
    Gradle properties versionadas ou bundle Vite;
  - runner é efêmero e o job tem permissão mínima e aprovação de environment;
  - somente HTTPS de produção e permissões Android indispensáveis são aceitas;
  - dados reais de pessoa não são usados como fixture ou evidência.
- Observabilidade:
  - CI registra etapas, versões das ferramentas, metadados públicos, checksum e
    falhas classificadas sem conteúdo sensível;
  - o app mantém a observabilidade já definida: analytics apenas online e nenhum
    diagnóstico offline persistido;
  - checklist registra falhas do smoke por categoria, sem adicionar SDK de crash ou
    telemetria nesta entrega.
- Reprodutibilidade:
  - clone limpo, versões fixadas, lockfile e Gradle Wrapper geram o mesmo conteúdo a
    partir do mesmo commit e configuração pública; assinatura pode alterar bytes de
    envelope, por isso a identidade operacional é commit + versão + SHA-256 do AAB
    efetivamente promovido;
  - build local e CI usam o mesmo script canônico e as mesmas validações.
- Compatibilidade:
  - Android API 29+ continua suportado; Web/PWA e gates sem Android SDK não passam a
    depender da assinatura;
  - application ID e chave de assinatura não mudam entre teste interno e produção;
  - a build release preserva schema v4, atualização obrigatória e snapshots v1.
- Limite de execução: a futura implementação deve caber em uma sessão de até cinco
  horas. O trabalho reutiliza Gradle, Capacitor, assets existentes, GitHub Actions e
  smoke/runbook; automação da Play API, flavors, minificação nova ou branding novo
  exigem outra feature.

## Critérios de aceite

### Cenário 1 — AAB release reproduzível e assinado

- Forma de validar: comando Android release documentado em clone limpo e workflow
  manual no mesmo commit; reprodução por URL não se aplica porque é um artefato
  nativo.
- Given: configuração pública válida e chave de upload autorizada disponíveis fora
  do repositório.
- When: o comando canônico ou workflow é executado.
- Then: produz AAB de `com.dallfit.app`, versão esperada, não debuggable, assinado
  pela upload key, com checksum e metadados verificáveis.

### Cenário 2 — segredo ausente ou configuração insegura falha fechado

- Forma de validar: testes do script/configuração e execução controlada do workflow
  sem cada entrada obrigatória.
- Given: keystore/senha ausente, mocks ativos, API HTTP/local ou OAuth client ID
  vazio.
- When: o release é solicitado.
- Then: termina antes do AAB publicável, informa qual categoria está inválida e não
  mostra nem preserva segredo.

### Cenário 3 — chaves possuem responsabilidades separadas

- Forma de validar: inspeção do Play App Signing, certificados públicos e runbook
  por pessoa autorizada; valores privados não fazem parte da evidência.
- Given: chave própria de assinatura e chave distinta de upload foram geradas.
- When: o aplicativo é cadastrado e o primeiro AAB é enviado.
- Then: a Play Console distribui com a chave de assinatura importada, aceita o AAB
  pela upload key e o CI não possui a chave de assinatura do aplicativo.

### Cenário 4 — identidade visual definitiva funciona entre APIs

- Forma de validar: instalação da build release em API 29 e API 36, com inspeção do
  launcher, overview e cold/warm start.
- Given: a build usa os assets derivados do símbolo Dall Fit vigente.
- When: launcher aplica máscaras/tema e o aplicativo inicia.
- Then: ícone adaptativo/legacy e splash são reconhecíveis, não cortam o símbolo e
  não exibem assets provisórios ou splash duplicada.

### Cenário 5 — manifest release contém somente permissões necessárias

- Forma de validar: relatório/manifest merged do release e testes Android de
  configuração.
- Given: todas as dependências e plugins da release foram mesclados.
- When: permissões, componentes exportados e FileProvider são auditados.
- Then: permanecem apenas rede, estado de rede e notificação opcional; não há
  storage, foreground service ou path genérico sem uso.

### Cenário 6 — backup, restore e reinstalação não recuperam dados privados

- Forma de validar: testes instrumentados e smoke da distribuição interna em API
  29 e API 31+.
- Given: existem sessão, UUID, plano, mídia, fila e preferências privadas.
- When: ocorre backup/restore, transferência suportada ou desinstalação/reinstalação.
- Then: nenhum desses dados retorna; após reinstalação, a pessoa precisa autenticar
  e preparar novamente.

### Cenário 7 — primeira preparação e execução em modo avião

- Forma de validar: smoke manual do AAB instalado pelo teste interno.
- Given: instalação limpa, login válido e plano ativo ainda não preparado.
- When: a pessoa prepara online, entra em modo avião, executa e termina o treino.
- Then: plano e mídia disponível funcionam localmente, o terminal fica na fila e
  nenhuma request ou fallback Web é exigido.

### Cenário 8 — reconexão com aplicativo fechado sincroniza best-effort

- Forma de validar: smoke manual com conectividade e WorkManager inspecionados.
- Given: existe snapshot pendente e o aplicativo foi encerrado.
- When: a conectividade retorna e o sistema concede execução ao Worker.
- Then: o snapshot é enviado uma vez, ou permanece preservado para o próximo gatilho
  quando o sistema adiar o trabalho; não existe Foreground Service.

### Cenário 9 — update pela Play Store preserva pendências

- Forma de validar: duas versões no teste interno e banco real com fila pendente.
- Given: a versão anterior contém sessão ou snapshot e a versão seguinte possui
  `versionCode` maior.
- When: a atualização é instalada pela Play Store.
- Then: sandbox e assinatura permanecem compatíveis, migration ocorre antes do sync
  e a fila retoma sem perda, reordenação ou envio prematuro.

### Cenário 10 — notificação permanece opcional

- Forma de validar: smoke em API 29 e API 33+ com permissão recusada e concedida.
- Given: a explicação contextual é apresentada depois da preparação aplicável.
- When: a pessoa recusa, adia ou concede a permissão.
- Then: somente a notificação muda; treino offline e sincronização mantêm a mesma
  capacidade.

### Cenário 11 — teste interno antecede a produção

- Forma de validar: histórico das releases na Play Console e checklist sanitizado.
- Given: o AAB verificado foi enviado manualmente ao teste interno.
- When: todos os smokes e formulários obrigatórios são concluídos.
- Then: exatamente a mesma versão é promovida, sem recompilação, para produção.

### Cenário 12 — produção é liberada integralmente

- Forma de validar: configuração da release na Play Console por pessoa autorizada.
- Given: a versão passou pelo teste interno e não possui bloqueio conhecido.
- When: a release de produção é iniciada.
- Then: a disponibilização é configurada para 100% do público dos países escolhidos,
  sem rollout percentual nem feature flag de offline.

### Cenário 13 — nova release exige incremento explícito

- Forma de validar: teste da validação de metadados e tentativa controlada com código
  repetido ou divergente.
- Given: uma versão já foi aceita pela Play Console.
- When: outra release é preparada.
- Then: `versionCode` precisa ser maior, `versionName` é revisado e a relação com o
  mínimo compatível é verificada antes de gerar o artefato.

## Estratégia de entrega e compatibilidade

1. Consolidar validação da configuração release e um único script canônico para
   build Vite, sync Capacitor, bundle Gradle, inspeção e checksum.
2. Configurar signing release por entradas externas, atualizar ignores e adicionar
   testes que impeçam fallback para debug/unsigned e vazamento de segredo.
3. Gerar os assets Android a partir da marca vigente, modernizar a SplashScreen e
   auditar manifest merged, FileProvider e regras de backup.
4. Criar o workflow manual protegido que executa gates, reconstrói somente a upload
   key temporária, produz/verifica o AAB e publica artifact mínimo.
5. Criar ADR e runbook com cerimônia das duas chaves, fingerprints OAuth,
   versionamento, checklist Play Console, teste interno, smoke e promoção manual.
6. Validar local e CI sem assinatura real versionada. A configuração dos secrets,
   importação da app signing key e ações na Play Console exigem o proprietário
   autorizado e são registradas apenas por evidências públicas/sanitizadas.
7. Enviar o AAB ao teste interno, executar todos os smokes e promover a mesma versão
   para 100% da produção. Se qualquer smoke falhar, corrigir com nova build e
   `versionCode` maior quando o anterior já tiver sido consumido pela Play Console.

Não existe rollback binário para uma versão já instalada com schema mais novo. Uma
falha antes da produção interrompe a promoção; uma falha depois da produção exige
release corretiva com `versionCode` maior e uso da política de atualização da
FIT-0092 quando necessário. Reduzir o mínimo da API, trocar chave/application ID ou
republicar bytes diferentes sob o mesmo código não é estratégia de rollback.

## Plano de testes

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

- Configuração e scripts:
  - release válido, API HTTPS e mocks desativados;
  - ausência de cada variável/secret e valores inseguros;
  - build antecede sync e falha impede reaproveitamento de `dist`;
  - metadata, assinatura, debuggable e checksum do AAB;
  - nenhum keystore, properties privado ou `.env` rastreável pelo Git.
- Gradle/Android:
  - `bundleRelease` assinado com fixture efêmera exclusiva de teste;
  - application ID, SDKs, versões e manifest merged;
  - permissões exatas, componentes exportados e paths do FileProvider;
  - resources de adaptive/round/legacy/monochrome e SplashScreen;
  - testes Java locais e instrumentados vigentes.
- GitHub Actions:
  - somente dispatch manual, environment protegido e permissões mínimas;
  - secrets não disponíveis em PR/fork e ausência falha fechado;
  - actions fixadas por commit, toolchain compatível e artifact mínimo;
  - cleanup do keystore no caminho de sucesso e falha.
- Privacidade:
  - backup/restore API 29/30 e 31+;
  - desinstalação/reinstalação;
  - permissão de notificação recusada/concedida;
  - auditoria do bundle e logs por segredo ou configuração proibida.
- Smoke do teste interno:
  - instalação limpa, login e online;
  - primeira preparação, modo avião e terminal local;
  - reconexão em foreground e com app fechado;
  - notificação em API 33+;
  - update com pendências e reinstalação limpa;
  - abertura da Play Store pelo bloqueio de compatibilidade.
- Regressão:
  - Web/PWA continua construindo sem Android SDK ou secrets;
  - testes unitários/UI, Playwright e PWA update vigentes;
  - API E2E confirma autenticação, lease, snapshot e compatibilidade usados no
    smoke, embora nenhum endpoint seja alterado.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`;
  - `pnpm test:pwa-update`;
  - testes Android locais e instrumentados documentados;
  - build release local e workflow manual com secrets autorizados.

## Riscos e decisões

- A chave própria de assinatura oferece custódia e portabilidade, mas sua perda ou
  comprometimento é mais grave que delegar sua geração ao Google. Por isso ela não
  chega ao CI, possui cópias offline cifradas e é separada da upload key redefinível.
- Play App Signing continua sendo usado: importar chave própria não significa
  distribuir APK autoassinado nem evitar a infraestrutura da Play Store.
- A release vai diretamente de teste interno a 100% da produção. Isso simplifica o
  lançamento inicial e atende à decisão de não restringir funcionalidade, mas amplia
  o impacto de regressão; o smoke da mesma versão e a promoção manual são gates
  obrigatórios.
- O CI gera artefato, mas não publica. Automatizar upload exigiria service account,
  permissões Play e política de promoção que a issue exclui sem credenciais
  autorizadas.
- Variáveis Vite são inspecionáveis no bundle. Tratá-las como configuração pública e
  falhar diante de segredo `VITE_*` evita uma falsa sensação de proteção.
- `versionCode 2` já representa schema v4 embora seja a primeira release pública.
  Preservá-lo evita dissociar package info e migration; se a Play Console já tiver
  usado esse código, o incremento será explícito, nunca implícito no CI.
- Ativar minificação no último passo da primeira release aumenta risco sobre bridge,
  reflexão e Workers. Ela permanece fora desta demanda; tamanho do AAB é medido e
  uma otimização futura pode ser especificada com testes próprios.
- Emulador não reproduz integralmente Credential Manager, Play Store, Doze e políticas
  OEM. O smoke combina limites de API com pelo menos um aparelho físico instalado
  pelo track interno.
- A ficha da loja e formulários legais dependem de conta, países e declarações do
  proprietário. O repositório fornece checklist verificável, mas não inventa texto
  jurídico nem armazena evidência pessoal.
- A execução foi limitada para caber em até cinco horas: um build type, um ambiente
  publicável, um workflow manual, assets derivados, auditoria e runbook. Flavors,
  publicação automática, telemetria nova e redesign foram excluídos.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- AAB release reproduzível, verificável e assinado pela chave de upload
- Chave própria de assinatura importável no Play App Signing e mantida fora do CI
- Chave de upload separada, secrets protegidos e procedimento de reset documentado
- Configuração Android de produção HTTPS, sem mocks e sem segredo no bundle
- `versionCode` crescente e procedimento de incremento reproduzível
- Ícones e splash definitivos derivados da identidade Dall Fit vigente
- Manifest, FileProvider, permissões e exclusões de backup auditados
- Workflow manual produzindo apenas artefato e metadados públicos necessários
- Checklist da Play Console e runbook de release/submissão atualizados
- Smoke do track interno cobrindo online, offline, reconexão, app fechado, update e
  reinstalação
- Mesma versão promovida manualmente do teste interno para 100% da produção
- Offline disponível a todas as pessoas da release, sem feature flag
- Web/PWA e comportamento funcional vigente preservados
- Documentação viva e ADR afetados atualizados junto da implementação
- Quality gates da raiz, API, UI/PWA e Android aplicáveis aprovados
