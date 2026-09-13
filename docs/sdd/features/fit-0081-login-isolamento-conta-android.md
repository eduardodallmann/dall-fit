# Feature Spec: Login e isolamento de conta no Android

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #81](https://github.com/eduardodallmann/dall-fit/issues/81).
- Problema: o container Android já executa a UI compartilhada e a API já troca uma
  identidade Google por uma sessão Bearer nativa, mas o aplicativo ainda inicia o
  OAuth Web, não conserva a credencial no Android Keystore e não possui uma
  fronteira local que impeça uma conta de acessar dados deixados por outra no mesmo
  aparelho.
- Resultado: no Android, a ação existente `Entrar com Google` abre o Google Sign-In
  nativo, troca o ID token pelo Bearer da API e mantém uma única conta local
  vinculada a um UUID aleatório da instalação. A sessão fica cifrada com chave do
  Android Keystore, o canal Web/PWA permanece inalterado e login, expiração, troca
  de conta, logout e reinstalação aplicam regras explícitas de preservação ou
  limpeza dos dados locais.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [rotas e comportamento](../../../ui/docs/sdd/base/02-rotas-e-comportamento.md);
  - [componentes e estilização](../../../ui/docs/sdd/base/03-componentes-e-estilizacao.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [mocks de API](../../../ui/docs/sdd/base/05-mocks-de-api.md);
  - [testes integrados Playwright](../../../ui/docs/sdd/base/07-testes-integrados-playwright.md);
  - [rota pública](../../../ui/docs/sdd/routes/root.md);
  - [fluxo de login Google](../flows/login-google.md);
  - [ADR-0012 — Capacitor Android e fronteira de plataforma](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md);
  - [ADR-0013 — sessões Web e nativas isoladas](../adr/ADR-0013-sessoes-web-e-native-isoladas.md);
  - [FIT-0079 — fundação Capacitor Android](fit-0079-estruturar-aplicativo-capacitor-android.md);
  - [FIT-0080 — autenticação Bearer nativa na API](fit-0080-autenticacao-bearer-nativa-api.md);
  - [Sign in with Google via Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation);
  - [Android Keystore](https://developer.android.com/privacy-and-security/keystore);
  - [regras e recomendações de backup Android](https://developer.android.com/privacy-and-security/risks/backup-best-practices);
  - [`@capawesome/capacitor-google-sign-in`](https://capawesome.io/docs/plugins/google-sign-in/);
  - [`@aparajita/capacitor-secure-storage`](https://github.com/aparajita/capacitor-secure-storage).
- Features relacionadas: FIT-0079 fornece o runtime e a fronteira de adapters;
  FIT-0080 fornece `POST /auth/native/session`, Bearer nos endpoints protegidos e
  `DELETE /auth/native/session`. A issue 82 criará o SQLite, arquivos e primitives
  atômicas do motor offline; esta feature define a fronteira de limpeza consumida
  por ele sem antecipar seu schema. A issue 84 criará registro, lease e takeover
  de instalação no servidor.

O repositório usa Capacitor `8.5.2`. Durante o refinamento, as versões compatíveis
consultadas foram `0.1.4` de `@capawesome/capacitor-google-sign-in`, cujo peer
aceita Capacitor 8 e cuja implementação Android usa Credential Manager, e `8.0.0`
de `@aparajita/capacitor-secure-storage`, que cifra valores com AES-GCM e chave
gerada no Android Keystore. A implementação deve confirmar novamente versões,
APIs, tipos locais e dependências transitivas antes de fixá-las no lockfile.

## Escopo

### Incluído

- instalar os dois plugins especializados aprovados, mantendo imports Capacitor e
  de plugins dentro da fronteira nativa de `ui/src/core/platform/native/`;
- configurar o Google Sign-In com o client Web/server usado pela API e com o
  cadastro OAuth Android correspondente a `com.dallfit.app` e às assinaturas de
  desenvolvimento/produção, sem versionar segredo ou `google-services.json`;
- fazer o botão existente iniciar Credential Manager somente após ação explícita
  da pessoa no Android; não abrir prompt automático no carregamento;
- enviar somente o Google ID token a `POST /auth/native/session`, descartar o token
  Google após a troca e aceitar como identidade apenas a `Person` devolvida pela
  API;
- persistir um envelope nativo mínimo com Bearer, expiração e `personId` por meio
  do secure storage e gerar um UUID v4 aleatório por instalação;
- manter o Bearer fora de cookie, localStorage, sessionStorage, IndexedDB, cache
  persistente da PWA, logs, Analytics e mensagens de erro;
- disponibilizar o Bearer em memória somente pelo adapter durante o processo e
  injetá-lo no client Axios único para requests Android autenticadas;
- adaptar bootstrap, probe, proteção de rotas e logout para sessão `web | native`,
  sem pedir CSRF no canal nativo e sem alterar cookie/CSRF no canal Web;
- coordenar login da mesma conta, troca de conta, expiração, logout e falhas sem
  permitir que estado privado da geração anterior alcance a seguinte;
- definir uma port nativa de dados locais com consulta de pendências e limpeza
  atômica. Nesta entrega, o adapter concreto limpa somente os artefatos que já
  existem; a issue 82 implementará a mesma port sobre SQLite e arquivos, sem mudar
  a regra de orquestração;
- mostrar confirmação de logout no Android somente quando houver pendências, com
  `Cancelar` e `Sair e apagar dados`;
- excluir de Auto Backup e transferência device-to-device o secure storage, UUID,
  vínculo de conta, bancos, pendências e arquivos privados do motor offline, tanto
  nas regras de Android 12+ quanto nas regras legadas necessárias ao mínimo API 29;
- adicionar testes de adapters, orquestração, UI, headers, isolamento de geração e
  configuração Android, além de validações manuais em emulador ou aparelho;
- atualizar, na futura implementação, os SDDs vivos da arquitetura/qualidade da UI,
  a rota `/`, o fluxo de login e os documentos transversais realmente alterados.

### Não incluído

- alterações nos endpoints ou contratos de FIT-0080, refresh token ou renovação
  silenciosa da sessão Bearer;
- leitura client-side de claims do Google ID token ou do Bearer para decidir conta,
  autorização ou expiração canônica;
- Firebase Authentication, scopes Google adicionais, acesso ao Drive ou persistência
  de access token/server auth code do Google;
- prompt automático, One Tap no carregamento ou mudança visual do botão Google no
  PWA;
- schema SQLite, migrations, primitives de treino, plano preparado, fila, lock,
  snapshots, arquivos de mídia ou WorkManager, pertencentes às issues seguintes;
- endpoint de registro da instalação, lease, takeover ou sua interface detalhada;
  nesta etapa uma reinstalação apenas produz outro UUID e não recupera a identidade
  anterior;
- suporte nativo a iOS;
- biometria, PIN local, hardware ID, IMEI, advertising ID ou fingerprinting;
- backup de credencial ou dados offline, mesmo cifrado;
- CI, assinatura ou publicação Android.

## Projetos e documentação afetados

- API e endpoints: nenhum comportamento de backend muda. A UI consome os cenários
  vigentes de `POST /auth/native/session`, endpoints protegidos por Bearer e
  `DELETE /auth/native/session` documentados em
  `api/docs/sdd/endpoints/auth.md`.
- UI e rotas: `ui` recebe dependências, ports/adapters nativos, armazenamento
  seguro, coordenador de conta/sessão, header Bearer, bootstrap por canal e o
  diálogo destrutivo de logout. A rota `/` mantém composição e texto principais,
  mas seu botão escolhe OAuth top-level na Web e Credential Manager no Android.
- Fluxos: `docs/sdd/flows/login-google.md` passa a descrever os ramos Web e Android,
  incluindo preservação/limpeza local.
- Contratos em `@dall-fit/types`: sem novos contratos. A implementação reutiliza
  `CreateNativeSessionRequest`, `CreateNativeSessionResponse`, `Person` e
  `ApiError` publicados por FIT-0080.
- Decisões arquiteturais: ADR-0012 e ADR-0013 permanecem válidas. Criar uma nova ADR
  somente se a implementação precisar mudar a fronteira de adapters, o isolamento
  de canais ou a propriedade futura do motor nativo.
- Handlers e fixtures MSW: preservar os handlers Web atuais e acrescentar somente
  cenários necessários para exercer a troca nativa em Vitest/Playwright sem token
  real. O seletor de mock continua exclusivo de desenvolvimento.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica; os endpoints permanecem cobertos
  pela FIT-0080.
- Android: Gradle/dependências geradas pelos plugins, configuração OAuth pública,
  manifest e dois arquivos de regras de backup. Nenhuma chave de assinatura ou
  credencial real é versionada.

## Requisitos funcionais

1. O snapshot de plataforma passa a indicar explicitamente a disponibilidade de
   autenticação nativa. O adapter Web continua determinístico e nunca importa,
   inicializa nem chama os plugins.
2. A composição injeta ports de Google Sign-In, credencial segura e dados locais,
   permitindo doubles diretos em testes. Componentes, hooks e domínio de sessão
   não importam plugins.
3. No Web/PWA, `Entrar com Google` conserva exatamente a navegação top-level para
   `GET /auth/google`, a sessão por cookie, o bootstrap CSRF e o logout vigentes.
4. No Android sem sessão válida, a mesma ação visível inicializa e abre o fluxo
   nativo. O aplicativo não apresenta seletor de conta no mount, em background ou
   sem gesto explícito.
5. O plugin é inicializado com o client ID Web/server esperado por
   `POST /auth/native/session`. O cadastro OAuth Android usa package name e SHA das
   assinaturas autorizadas; esses dados públicos são configuráveis por ambiente
   sem incluir client secret no bundle.
6. Cancelamento do seletor mantém a entrada pública e reabilita a ação sem alerta
   técnico. Falha recuperável apresenta mensagem genérica e permite nova ação;
   chamadas concorrentes de login são impedidas.
7. Em sucesso, somente `idToken` é enviado no body estrito da troca. Perfil,
   `userId`, e-mail e nome retornados diretamente pelo plugin nunca estabelecem a
   identidade local. O ID token fica apenas em memória pelo tempo da request e é
   descartado em todos os términos.
8. A response `201` precisa conter `tokenType: 'Bearer'`, `accessToken`,
   `expiresAt` e `person`. O cliente não decodifica o JWT e usa `person.id` como
   vínculo canônico da conta.
9. Na primeira execução, o adapter gera UUID v4 por fonte criptograficamente segura
   e o persiste uma única vez. Leituras posteriores na mesma instalação devolvem o
   mesmo valor; ausência, corrupção irrecuperável ou reinstalação gera outro UUID.
   O valor não deriva do aparelho, conta ou credencial.
10. O envelope seguro é gravado como uma única unidade versionada contendo somente
    Bearer, `expiresAt` e `personId`. UUID e metadados auxiliares podem permanecer
    em chave separada, mas pertencem à mesma área nativa excluída de backup.
11. O secure storage é a única persistência do Bearer. O valor só atravessa a
    bridge para memória quando uma request autenticada precisar dele e não integra
    estado React serializável, QueryClient, URL, storage Web ou diagnóstico.
12. Ao iniciar, um envelope ausente, corrompido ou ilegível é removido e tratado
    como sessão ausente. Uma expiração local evidente evita request inútil, mas a
    API continua sendo autoridade: `401` em qualquer Bearer encerra a geração
    autenticada mesmo antes de `expiresAt`.
13. Uma sessão nativa recuperada consulta `GET /auth/me` por Bearer. O bootstrap
    protegido não chama `GET /auth/csrf`; mutações posteriores usam o mesmo Bearer
    e não recebem `X-CSRF-Token`. Cookies eventualmente presentes não são usados
    pelo canal Android.
14. Se não existe vínculo anterior, o login confirma o novo envelope e `personId`
    depois de preparar a geração limpa. Se o `person.id` novo coincide com o vínculo
    local, substitui a credencial expirada/antiga e preserva pendências e arquivos.
15. Se o `person.id` novo difere do vínculo local, o coordenador solicita limpeza
    atômica de todos os dados e arquivos da conta anterior antes de confirmar o
    novo envelope. Não há pergunta de confirmação para troca de conta.
16. Falha na limpeza impede a ativação da nova conta. O novo Bearer é revogado em
    best effort, não é persistido e nenhum dado da nova pessoa é preparado ou
    exposto; a conta anterior continua isolada ou o aplicativo permanece
    desconectado conforme o resultado atômico da port, sempre sem estado misto.
17. Depois da confirmação de uma nova credencial, o Bearer anterior é revogado em
    best effort. Falha remota não desfaz a identidade local já coerente nem deixa o
    token anterior acessível no dispositivo.
18. Expiração ou `401` remove o Bearer e encerra a geração React/Query atual, mas
    preserva UUID, vínculo `personId`, pendências e arquivos. A nova autenticação da
    mesma conta recupera esse estado; outra conta aciona a limpeza obrigatória.
19. O ciclo de sessão existente continua abortando requests, cancelando e limpando
    queries privadas, CSRF em memória, drafts e callbacks da geração encerrada.
    Troca de identidade executa esse teardown antes de publicar a nova pessoa.
20. No logout Android, a port consulta se há pendências locais. Sem pendências, o
    logout prossegue diretamente. Com pendências, um `AlertDialog` informa a perda
    local e oferece exatamente `Cancelar` e `Sair e apagar dados`.
21. `Cancelar` fecha o diálogo, conserva sessão e dados e não chama logout remoto,
    Google Sign-Out, limpeza nem Analytics de conclusão.
22. A confirmação captura o Bearer somente em memória, encerra a geração, remove
    atomicamente envelope, vínculo de conta, dados e arquivos e preserva o UUID da
    instalação. Em seguida tenta `DELETE /auth/native/session` e limpa o estado do
    Credential Manager. A limpeza local termina mesmo se rede, API ou sign-out do
    Google falhar.
23. Após logout confirmado, a raiz pública é exibida com replace e sem probe que
    restaure a sessão encerrada. Uma futura ação no botão volta a oferecer seleção
    de conta; falha remota pode gerar feedback genérico, mas nunca reintroduz dados
    removidos.
24. As regras Android excluem de cloud backup e transferência device-to-device
    todas as SharedPreferences do secure storage/identidade, bancos, arquivos e
    diretórios destinados a pendências. Devem existir regras para API 31+ via
    `dataExtractionRules` e para API 29/30 via `fullBackupContent`.
25. Restauração ou reinstalação não recupera Bearer, vínculo, UUID, banco ou
    pendências. A instalação gera novo UUID; registro e takeover remoto permanecem
    indisponíveis até a issue 84 e não são simulados silenciosamente.

## Requisitos não funcionais

- Acessibilidade:
  - botão, loading e erros conservam nomes acessíveis e foco visível;
  - o diálogo de logout usa `AlertDialog` HeroUI, foco inicial seguro em
    `Cancelar`, trap de foco, teclado e retorno do foco ao gatilho;
  - pending impede duplo acionamento sem remover a informação de estado;
  - cancelamento nativo não é anunciado como erro.
- Performance:
  - plugins são inicializados uma vez no runtime Android e nunca carregados no
    caminho Web;
  - leitura do secure storage é única por bootstrap e requests reutilizam a
    credencial apenas em memória dentro da geração ativa;
  - login, logout e limpeza não possuem retry automático nem concorrência paralela.
- Segurança e privacidade:
  - ID token e Bearer são segredos; não entram em logs, erros, toast, Analytics,
    fixtures, snapshots ou ferramentas de desenvolvimento persistentes;
  - somente a API valida identidade e claims; dados fornecidos diretamente pelo
    plugin são não confiáveis para autorização e vínculo;
  - nenhuma credencial Google adicional é solicitada ou persistida;
  - o UUID identifica somente a instalação e não é correlacionado a hardware;
  - falhas fecham o acesso em vez de usar cookie Web, sessão stateless ou dados de
    outra conta como fallback;
  - configurações do bundle são públicas e nunca contêm client secret.
- Observabilidade:
  - diagnósticos registram somente etapa, plataforma e categoria enumerada, sem
    pessoa, UUID, token, provider payload ou path de arquivo;
  - Analytics diferencia início e resultado enumerado do login/logout nativo, sem
    emitir conta escolhida, cancelamento técnico ou dados do diálogo;
  - falha de limpeza é distinguível de falha Google/API sem revelar conteúdo local.
- Manutenibilidade:
  - versões dos plugins permanecem compatíveis com a linha Capacitor 8;
  - toda integração de plugin fica atrás de ports e adapters nativos;
  - a port de dados locais expressa comportamento necessário agora, não schema ou
    comandos hipotéticos da issue 82.
- Compatibilidade: Android mínimo API 29 é preservado; PWA, navegador, build Web e
  gates sem Android SDK continuam funcionando.

## Critérios de aceite

### Cenário 1 — PWA conserva o login Web

- Forma de validar: `http://localhost:3000/?mockAuth=unauthenticated` e flow
  Playwright de login existente.
- Given: a aplicação executa no navegador.
- When: a pessoa aciona `Entrar com Google`.
- Then: o documento navega para `GET /auth/google`, usa cookie/CSRF após o retorno
  e nenhum plugin ou Bearer nativo participa.

### Cenário 2 — Login Android cria sessão protegida

- Forma de validar: APK debug em emulador/aparelho com OAuth Android de teste e
  inspeção do tráfego sanitizado; o endpoint é o cenário vivo de
  `POST /auth/native/session` em `api/docs/sdd/endpoints/auth.md`.
- Given: instalação sem sessão e conta Google disponível.
- When: a pessoa aciona o botão, escolhe a conta e a API aceita o ID token.
- Then: a UI privada recebe a `Person`, requests usam Bearer sem CSRF e o envelope
  fica somente no secure storage protegido pelo Keystore.

### Cenário 3 — Cancelamento e falha de login são recuperáveis

- Forma de validar: Vitest com adapters injetados e teste manual Android.
- Given: a entrada pública está pronta.
- When: a pessoa cancela o seletor ou Google/API falha.
- Then: permanece pública, a ação volta a ficar disponível, cancelamento não vira
  erro e nenhum token ou vínculo parcial é persistido.

### Cenário 4 — Nova autenticação da mesma conta preserva pendências

- Forma de validar: Vitest do coordenador com port de dados contendo pendências.
- Given: o Bearer expirou, mas UUID, vínculo e pendências da pessoa A permanecem.
- When: a API devolve novamente a pessoa A.
- Then: somente o envelope seguro é substituído e a limpeza de dados não é chamada.

### Cenário 5 — Conta diferente limpa antes de ser ativada

- Forma de validar: Vitest do coordenador com ordem de chamadas e port atômica.
- Given: a instalação está vinculada à pessoa A e contém dados locais.
- When: o login retorna a pessoa B.
- Then: dados, arquivos, vínculo e credencial de A são limpos antes de B ser
  confirmada, sem pergunta e sem estado observável que combine as duas contas.

### Cenário 6 — Falha de limpeza bloqueia a troca

- Forma de validar: Vitest com falha injetada na port de dados.
- Given: a pessoa A possui estado local e o login obteve sessão para B.
- When: a limpeza atômica falha.
- Then: B não é persistida nem publicada, seu Bearer recebe revogação best effort e
  o aplicativo não prepara dados de B sobre o estado de A.

### Cenário 7 — Expiração preserva o estado da conta

- Forma de validar: Vitest do interceptor/lifecycle e teste de componente da
  proteção de rota.
- Given: uma sessão Android ativa recebe `401` ou alcança a expiração local.
- When: o lifecycle encerra a geração.
- Then: remove o Bearer e volta à entrada, mas preserva UUID, `personId` e
  pendências para uma reautenticação da mesma conta.

### Cenário 8 — Logout com pendências exige decisão destrutiva

- Forma de validar: teste de componente acessível com port de pendências.
- Given: há pendências locais e a pessoa aciona `Sair` no Android.
- When: o diálogo é exibido.
- Then: `Cancelar` preserva tudo; `Sair e apagar dados` limpa o estado local e
  encerra a sessão, com foco e teclado corretos.

### Cenário 9 — Logout local independe da API

- Forma de validar: Vitest do fluxo com timeout, erro HTTP e rejeição do Google
  Sign-Out.
- Given: a pessoa confirmou o logout destrutivo.
- When: `DELETE /auth/native/session` ou a limpeza do Credential Manager falha.
- Then: credencial, vínculo e dados locais continuam removidos, o UUID é preservado
  e a aplicação termina pública sem restaurar a geração anterior.

### Cenário 10 — Reinstalação e restauração não ressuscitam estado

- Forma de validar: inspeção dos XMLs, teste de configuração e teste manual com
  backup/restore ou desinstalação/reinstalação em Android API 29 e API 31+.
- Given: a instalação possuía sessão, UUID e dados privados.
- When: seus dados são restaurados em outra instalação ou o app é removido e
  instalado novamente.
- Then: nenhum artefato sensível reaparece, outro UUID é criado e o aplicativo
  exige novo login; takeover não ocorre sem ação futura explícita.

### Cenário 11 — Bearer não alcança armazenamento Web ou telemetria

- Forma de validar: unitários dos adapters/interceptors/Analytics e inspeção manual
  do WebView.
- Given: login e requests Android foram concluídos.
- When: storages Web, cache de query, logs, eventos e mensagens são inspecionados.
- Then: não contêm ID token, Bearer, UUID ou payload pessoal do plugin.

## Estratégia de entrega e compatibilidade

1. Confirmar APIs e versões dos dois plugins contra Capacitor `8.5.2`, seus tipos
   instalados e a documentação oficial Android; fixar versões compatíveis e
   sincronizar o projeto Android.
2. Estender o contrato de plataforma e criar ports de Google, secure credential e
   dados locais com doubles, preservando o fallback Web.
3. Implementar o envelope versionado, UUID da instalação e regras de leitura,
   corrupção e expiração.
4. Implementar o coordenador de login/conta e integrar a troca HTTP sem persistir o
   ID token.
5. Tornar o client e o bootstrap conscientes do canal, injetando Bearer no Android
   e mantendo cookie/CSRF na Web.
6. Integrar a ação de login e o logout com diálogo condicional e teardown de
   geração.
7. Configurar as regras de backup para API 29/30 e API 31+, cobrindo também os
   diretórios que a issue 82 ocupará.
8. Atualizar SDDs vivos, mocks e testes aplicáveis; sincronizar e validar o projeto
   Android.

A adoção é compatível porque o branch Web continua usando os mesmos endpoints,
cookie, CSRF e apresentação. O envelope possui versão própria para que formato
desconhecido falhe fechado. Antes de existir SQLite, a port concreta não inventa
banco ou pendências; quando a issue 82 a implementar, o coordenador já exigirá
consulta e limpeza atômicas sem alterar a política desta feature.

Rollback remove os plugins e o branch nativo, restaura o snapshot de plataforma e
mantém o PWA funcional. Qualquer secure storage legado fica inacessível ao código;
um rollback distribuído não deve reativar cookie dentro do Android nem restaurar
dados locais de outra pessoa.

## Plano de testes

- Vitest de unidades e adapters:
  - seleção/injeção dos adapters e fallback Web sem import nativo;
  - inicialização única, gesto explícito, cancelamento e códigos de erro do Google;
  - criação/estabilidade/corrupção do UUID e envelope seguro versionado;
  - descarte do ID token em sucesso, falha, cancelamento e troca interrompida;
  - primeira conta, mesma conta, conta diferente, falha de limpeza e ordem das
    etapas;
  - expiração local, `401`, teardown concorrente e callbacks tardios;
  - header Bearer apenas no Android, ausência de CSRF e ausência de cookie como
    fallback;
  - logout sem pendências, cancelado, confirmado, API indisponível e Google
    Sign-Out rejeitado;
  - redaction de token, UUID e dados pessoais em diagnósticos/Analytics.
- Testes de componentes:
  - botão Web preservado e botão Android pending sem duplicidade;
  - erro genérico e retry de login;
  - `AlertDialog` somente com pendências, ações exatas, foco, teclado e bloqueio
    durante a limpeza.
- MSW:
  - troca nativa fictícia com response tipada e sem segredo real;
  - identidade inválida, indisponibilidade e logout nativo;
  - asserts de body/header sem fazer o navegador integrado acessar a API real.
- Playwright:
  - executar a jornada Web existente como regressão;
  - cobrir somente estados que podem ser compostos com adapters falsos no browser;
    Credential Manager e Keystore reais permanecem fora do Playwright.
- Configuração Android:
  - dependências compatíveis e imports confinados à fronteira nativa;
  - manifest referencia `dataExtractionRules` e `fullBackupContent`;
  - regras excluem shared preferences, databases, files e root/no-backup aplicáveis;
  - `pnpm android:sync` e `pnpm android:build:debug` aprovam.
- Validação manual Android:
  - login real em API 29+ com conta autorizada e seletor cancelado;
  - reinício do processo recupera sessão sem armazenamento Web;
  - conta diferente limpa antes de abrir conteúdo privado;
  - expiração seguida da mesma conta preserva pendências com adapter de teste;
  - desinstalação/reinstalação e backup/restore não recuperam estado;
  - nenhum token aparece no Logcat, DevTools ou Analytics.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`;
  - `pnpm android:sync`;
  - `pnpm android:build:debug`.

`pnpm -C api test:e2e` não é exigido por esta feature enquanto nenhum endpoint,
wiring, MongoDB ou Redis mudar. Se a implementação revelar alteração no backend,
ela sai do contrato validado e a feature deve voltar ao refinamento.

## Riscos e decisões

- Foram aprovados plugins especializados: `@capawesome/capacitor-google-sign-in`
  para o Credential Manager e `@aparajita/capacitor-secure-storage` para a cifra
  apoiada pelo Android Keystore. Um plugin nativo próprio aumentaria controle, mas
  ultrapassaria o limite de cinco horas ao somar OAuth, criptografia, bridge e
  testes; um plugin social amplo adicionaria provedores sem consumidor.
- O login nativo ocorre somente por clique no botão existente. Não há prompt
  automático porque ele mudaria a experiência da entrada e poderia abrir seleção
  de conta sem intenção explícita.
- O secure storage oferece implementação Web em localStorage, mas ela nunca é
  usada pelo produto: o import e a chamada ficam no adapter Android e o adapter Web
  é explícito. Um teste de fronteira protege essa restrição.
- O token precisa alcançar transitoriamente a memória JavaScript para o Axios
  vigente enviar requests, mas nunca é persistido por APIs Web ou estado
  serializável. Mover o transporte HTTP inteiro para o motor nativo pertence às
  issues de sincronização/WorkManager.
- A API, e não o perfil devolvido pelo plugin, define `personId`. Isso evita confiar
  em payload client-side e permite que Web e Android compartilhem a mesma pessoa.
- Expiração remove somente a sessão, enquanto logout confirmado remove a conta e
  seus dados. Essa diferença é necessária para reautenticar a mesma conta sem
  perder pendências e, ao mesmo tempo, tornar o logout uma saída explícita e segura.
- O UUID sobrevive a logout e troca de conta porque identifica a instalação, não a
  pessoa. Ele não sobrevive a reinstalação/restore, impedindo que backup transforme
  outra instalação na anterior.
- A issue 82 ainda não criou SQLite nem arquivos. Esta feature define somente a
  port já consumida pela decisão de troca/logout e um adapter concreto para os
  artefatos existentes; não cria schema provisório. A atomicidade de dados futuros
  será implementada no motor nativo antes de qualquer pendência real existir.
- Revogação remota é best effort nos caminhos em que segurança local exige avanço.
  Manter dados/token acessíveis porque a rede falhou seria mais perigoso; a sessão
  servidor restante continua limitada pela expiração absoluta e deixa de estar
  disponível no aparelho.
- Regras explícitas para Android 12+ e versões anteriores são necessárias porque o
  mínimo do produto é API 29 e `allowBackup` isoladamente não representa de modo
  suficiente cloud backup e transferência entre dispositivos.
- As versões dos plugins são atuais, porém o plugin Google ainda está em série
  `0.1.x`. A fronteira de ports reduz o acoplamento; incompatibilidade confirmada
  na implementação é motivo para retornar ao refinamento, não para trocar
  silenciosamente a dependência aprovada.
- O escopo cabe no limite de até cinco horas porque reutiliza UI, Axios, lifecycle,
  contratos e endpoints existentes, escolhe plugins prontos e não antecipa SQLite,
  lease, takeover ou WorkManager. Se os plugins exigirem código nativo próprio ou
  mudanças de API, a demanda deve ser dividida antes de implementar.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- PWA e cookie/CSRF Web preservados
- Google Sign-In Android iniciado apenas por gesto explícito
- Bearer protegido pelo Keystore e ausente de armazenamento Web/telemetria
- UUID aleatório por instalação sem identificador de hardware
- Mesma conta preserva pendências; conta diferente limpa antes de ser ativada
- Logout destrutivo local independe do resultado remoto
- Backup, restore e reinstalação não ressuscitam sessão ou dados privados
- Contratos, rotas, fluxo e documentação base afetados atualizados
- MSW e testes dos adapters/fluxos atualizados conforme o impacto
- Revisão de código sem uso concluída em API e UI
- Quality gates Web e validações Android aplicáveis aprovados
