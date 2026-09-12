# Feature Spec: Estruturar o aplicativo Capacitor para Android

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #79](https://github.com/eduardodallmann/dall-fit/issues/79).
- Problema: o Dall Fit possui uma UI React/Vite distribuída como Web/PWA, mas ainda
  não possui um container Android versionado nem uma fronteira que impeça a camada
  React de se acoplar diretamente às APIs nativas necessárias às próximas etapas de
  treino offline.
- Resultado: a mesma UI continua gerando o Web/PWA atual e passa a ser empacotável
  em um projeto Android Capacitor, com bundle local de produção, API mínima 29,
  comandos locais reproduzíveis e um núcleo tipado de plataforma/capacidades com
  implementações Web e Capacitor substituíveis em testes.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [instalação PWA](fit-0011-instalacao-pwa.md);
  - [atualização silenciosa da PWA](fit-0068-atualizacao-silenciosa-segura-pwa.md);
  - [instalação oficial do Capacitor](https://capacitorjs.com/docs/getting-started);
  - [workflow oficial do Capacitor](https://capacitorjs.com/docs/basics/workflow);
  - [configuração oficial do Capacitor](https://capacitorjs.com/docs/config);
  - [Android no Capacitor](https://capacitorjs.com/docs/android);
  - [migração oficial para Capacitor 8](https://capacitorjs.com/docs/updating/8-0).
- Features relacionadas: FIT-0011 e FIT-0068 permanecem responsáveis pelo PWA. As
  issues 80 a 93 evoluirão autenticação nativa, persistência, sincronização,
  experiência offline e release sem ampliar esta fundação.

Na elaboração desta spec, a documentação oficial estável apresenta o Capacitor 8;
a documentação `next` do Capacitor 9 não é base para esta entrega. O repositório já
usa Node 24, compatível com o requisito Node 22+ do Capacitor 8. Na implementação,
os pacotes oficiais devem adotar a versão 8 estável mais recente compatível e manter
`@capacitor/core`, `@capacitor/android` e `@capacitor/cli` alinhados.

## Escopo

### Incluído

- adicionar Capacitor 8 à aplicação `ui`, sem criar outra aplicação web;
- configurar `appId`/namespace `com.dallfit.app`, nome `Dall Fit` e `webDir` igual
  ao diretório de saída real do Vite;
- gerar e versionar o projeto nativo em `ui/android`, tratando-o como código-fonte
  editável e não como artefato descartável;
- configurar Android mínimo API 29 e preservar os valores de compile/target SDK
  compatíveis com o template oficial da versão de Capacitor adotada;
- garantir que build e sync de produção usem o bundle Vite local e não dependam de
  servidor remoto;
- oferecer comandos locais na UI e delegadores na raiz para build web + sync,
  abertura no Android Studio, execução e build debug Android;
- criar um contrato mínimo e tipado para descrever o runtime atual e suas
  capacidades de fundação, com adapters Web e Capacitor;
- manter imports de `@capacitor/*` confinados à configuração e à camada de adapter
  nativo, com fiscalização automatizada no ESLint;
- adicionar testes proporcionais para configuração, seleção do adapter, fallback
  Web e detecção Android;
- atualizar, na futura implementação, a documentação viva transversal e da UI para
  registrar o projeto nativo, comandos, requisitos locais e fronteira arquitetural;
- registrar um ADR para a decisão transversal de usar Capacitor e adapters de
  capacidades sobre a UI compartilhada.

### Não incluído

- iOS ou criação de projeto Xcode;
- autenticação Google nativa, Bearer token, armazenamento seguro ou renovação de
  credenciais;
- SQLite, schema local, plano preparado, sessão offline ou fila de snapshots;
- sincronização em foreground, WorkManager, notificações ou foreground service;
- alterações funcionais nas telas, rotas, API, Workflow ou `@dall-fit/types`;
- IndexedDB, Background Sync ou persistência privada na PWA;
- ícones e splash definitivos, assinatura, AAB release, Play Console, publicação,
  flavors de ambiente ou CI Android, reservados à issue 93;
- live update do bundle, download de JavaScript remoto ou atualização fora das
  lojas;
- ports hipotéticos para capacidades das próximas issues antes de existir um
  consumidor real.

## Projetos e documentação afetados

- API e endpoints: não afetados.
- UI e rotas: `ui` recebe dependências, configuração Capacitor, `ui/android`,
  scripts, núcleo de plataforma/capacidades e testes. Nenhuma rota muda seu
  comportamento observável nesta etapa. A implementação atualiza apenas os
  documentos base da UI realmente alterados.
- Fluxos: nenhum fluxo funcional muda; não criar flow antecipado para treino
  offline.
- Contratos em `@dall-fit/types`: não afetados; os tipos de runtime são exclusivos
  do cliente e permanecem em `ui`.
- Decisões arquiteturais: criar ADR sobre a UI única em Web/PWA e Capacitor, o
  versionamento do projeto `ui/android`, o bundle embarcado e a fronteira de
  adapters.
- Handlers e fixtures MSW: não afetados porque não há request HTTP nova.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.
- SDD transversal: atualizar arquitetura do monorepo, workspace/qualidade e o
  catálogo de fontes oficiais com os documentos oficiais do Capacitor usados.
- Automação: não alterar GitHub Actions nesta feature. O build Android é exposto por
  scripts locais; CI, assinatura e release pertencem à issue 93.

## Requisitos funcionais

1. A aplicação Capacitor usa a UI existente de `ui`; não existe fork de telas,
   router, estilos ou estado para Android.
2. `capacitor.config.ts` usa `appId: 'com.dallfit.app'`, `appName: 'Dall Fit'` e
   aponta `webDir` para o bundle produzido pelo build Vite da UI.
3. A configuração de produção não contém `server.url`, `allowNavigation` para o
   host da aplicação nem `cleartext: true`. Um servidor externo só pode ser
   habilitado por comando/configuração local explicitamente de desenvolvimento e
   nunca pode contaminar o sync ou build de produção.
4. O projeto `ui/android` é versionado com Gradle Wrapper e arquivos nativos
   necessários para que outra pessoa consiga abri-lo e compilá-lo após instalar os
   pré-requisitos documentados.
5. `minSdkVersion` é 29. `compileSdkVersion`, `targetSdkVersion`, Android Gradle
   Plugin, Gradle Wrapper e demais versões geradas permanecem coerentes com o
   template oficial do Capacitor 8 adotado; apenas o mínimo do produto é elevado.
6. Um comando de sync de produção sempre executa primeiro o build Vite apropriado e
   depois `cap sync android`, impedindo que um bundle antigo seja copiado por
   acidente.
7. A raiz oferece comandos delegadores com nomes explícitos para preparar/sincronizar
   Android, abrir Android Studio, executar em dispositivo/emulador e produzir APK
   debug. Os scripts não fazem assinatura release nem exigem segredo.
8. `pnpm build` continua executável no ambiente web/CI atual sem exigir Android SDK
   ou Android Studio; a compilação nativa permanece em comando Android explícito.
9. O núcleo de plataforma expõe um valor discriminado e exaustivo para os runtimes
   suportados nesta etapa (`web` e `android`) e um retrato imutável das capacidades
   de fundação. Não usa strings livres nem leitura duplicada de globals nos
   componentes.
10. Um adapter Web explícito devolve o fallback Web/PWA determinístico e nunca tenta
    acessar bridge ou plugin nativo. Um adapter Capacitor encapsula a detecção
    oficial do runtime e devolve o mesmo contrato público.
11. A seleção do adapter ocorre em um ponto de composição da UI e permite injeção
    direta em testes. Componentes, rotas e hooks consomem somente o contrato público
    da aplicação.
12. Imports de `@capacitor/core` ou futuros plugins `@capacitor/*` são proibidos no
    restante de `ui/src` e permitidos somente na camada nativa declarada. A regra é
    verificada automaticamente pelo lint e possui escopo simples de estender quando
    uma capability real for implementada.
13. O núcleo não declara suporte a treino offline nesta etapa e não cria interfaces
    vazias para autenticação, storage, sync ou notificações. Cada issue posterior
    adicionará seu port, adapters e capabilities quando houver comportamento e
    consumidores concretos.
14. O build Web/PWA mantém manifest, service worker, prompt/atualização e deploy
    vigentes; Capacitor não substitui nem desabilita o canal web.

## Requisitos não funcionais

- Acessibilidade: não há mudança visual ou de interação. Qualquer tela atual deve
  conservar semântica, foco, teclado e responsividade dentro do WebView.
- Performance: o runtime Capacitor básico não pode introduzir plugin não utilizado,
  duplicação de bundle ou carregamento condicional por tela. O bundle Android é o
  mesmo build otimizado da UI.
- Segurança e privacidade:
  - produção executa somente assets embarcados;
  - nenhum segredo, keystore, credencial ou URL privada é versionado;
  - nenhum plugin ou permissão Android adicional é instalado sem necessidade desta
    etapa;
  - a configuração de desenvolvimento remoto é opt-in e não altera defaults de
    produção;
  - o adapter não registra detalhes de dispositivo nem dados pessoais.
- Observabilidade: esta fundação não cria Analytics ou logging nativo. Falhas de
  configuração/build devem terminar os comandos com código diferente de zero e
  mensagem acionável, sem fallback silencioso para bundle antigo ou servidor.
- Manutenibilidade: dependências Capacitor oficiais ficam alinhadas na mesma major e
  minor; projeto nativo, scripts e documentação formam um único caminho canônico.
- Compatibilidade: Node 24 vigente é preservado; Android 10/API 29 é o mínimo do
  produto; Web/PWA continua sem depender de Android SDK.

## Critérios de aceite

### Cenário 1 — Build Web/PWA preservado

- Forma de validar: `pnpm build` e `pnpm test:pwa-update` na raiz.
- Given: dependências instaladas sem Android SDK disponível.
- When: os comandos web vigentes são executados.
- Then: a UI, o manifest e o service worker são produzidos sem tentar compilar
  Gradle e sem importar código nativo incompatível com o navegador.

### Cenário 2 — Preparação Android usa bundle recém-gerado

- Forma de validar: comando agregador Android documentado e inspeção do diretório
  de assets sincronizado em `ui/android`.
- Given: o diretório de saída Vite está ausente ou contém um marcador antigo.
- When: o comando local de preparação/sync Android é executado.
- Then: ele primeiro gera o bundle Vite atual, sincroniza Android e o projeto nativo
  contém o marcador novo; falha no build impede o sync.

### Cenário 3 — Aplicativo de produção abre assets locais

- Forma de validar: APK debug gerado pelo comando local, instalado em emulador ou
  dispositivo API 29+, com o servidor web da aplicação desligado.
- Given: o projeto foi preparado pela configuração de produção.
- When: `Dall Fit` é aberto sem acesso ao host web da aplicação.
- Then: a UI inicial vem do bundle embarcado e nenhuma navegação tenta carregar
  `server.url` ou outro host de live reload.

### Cenário 4 — Android mínimo API 29

- Forma de validar: inspeção do Gradle/manifest merged e build em imagem API 29.
- Given: o projeto Android versionado foi gerado com Capacitor 8.
- When: sua configuração efetiva é avaliada e o APK debug é instalado.
- Then: `minSdkVersion` efetivo é 29 e o aplicativo inicia no Android 10 sem elevar
  silenciosamente o mínimo.

### Cenário 5 — Detecção tipada no Android

- Forma de validar: testes unitários do adapter e smoke no aplicativo Android.
- Given: a bridge Capacitor informa runtime Android.
- When: o ponto de composição resolve o ambiente.
- Then: o contrato público devolve `platform: 'android'` e as capabilities de
  fundação nativas esperadas, sem expor o objeto Capacitor ao componente consumidor.

### Cenário 6 — Fallback Web explícito

- Forma de validar: testes unitários/JSDOM e abertura local da PWA.
- Given: a bridge nativa não existe.
- When: o mesmo ponto de composição resolve o ambiente.
- Then: o adapter Web devolve `platform: 'web'`, não chama plugin, não lança erro e
  não anuncia capabilities Android ou treino offline.

### Cenário 7 — Fronteira de imports fiscalizada

- Forma de validar: teste da configuração ESLint ou fixture inválida controlada,
  além de `pnpm lint`.
- Given: um componente ou rota tenta importar `@capacitor/core` ou outro
  `@capacitor/*` diretamente.
- When: o lint da raiz é executado.
- Then: a violação falha com indicação da camada de adapter permitida; imports
  dentro do adapter autorizado continuam válidos.

### Cenário 8 — Projeto reproduzível por outra pessoa

- Forma de validar: clone limpo em ambiente com Node 24, pnpm, JDK/Android Studio e
  SDKs documentados.
- Given: não existem `node_modules`, `ui/dist`, caches Gradle nem configuração local.
- When: a pessoa instala dependências, executa o comando de preparação e abre ou
  compila o projeto Android.
- Then: não precisa regenerar manualmente `ui/android`, adivinhar versões ou obter
  segredo; o APK debug é produzido.

## Estratégia de entrega e compatibilidade

1. Confirmar novamente a release estável mais recente da major 8 e instalar
   `core`, `android` e `cli` alinhados; não adotar documentação `next`/major 9.
2. Inicializar o Capacitor dentro de `ui`, gerar `ui/android`, elevar apenas
   `minSdkVersion` para 29 e versionar o projeto nativo completo.
3. Separar configuração canônica de produção de qualquer live reload local; o
   caminho padrão sempre usa `ui/dist`.
4. Criar scripts locais idempotentes na UI e delegadores na raiz, sem adicionar
   Android ao `pnpm build` ou ao workflow de pull request atual.
5. Introduzir o contrato mínimo de runtime/capabilities, adapters Web/Capacitor,
   composição injetável e a restrição de imports antes de qualquer plugin futuro.
6. Adicionar testes de decisão/configuração e validar build Web, PWA, sync e APK
   debug.
7. Atualizar SDDs vivos e registrar o ADR somente junto da implementação, sem
   descrever iOS, offline ou release ainda inexistentes.

A mudança é aditiva. Rollback remove configuração, dependências, scripts, camada de
adapter e `ui/android`, devolvendo a UI ao estado exclusivamente Web/PWA; nenhum dado
ou migração precisa ser revertido. Alterar futuramente `appId` exigirá migração de
namespace/aplicativo, por isso `com.dallfit.app` é estabelecido já nesta fundação.

## Plano de testes

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

- Unitários da UI:
  - narrowing exaustivo de `web | android`;
  - adapter Web sem bridge e sem acesso nativo;
  - adapter Capacitor com detecção simulada;
  - seleção/injeção do adapter e retrato imutável das capabilities;
  - comportamento explícito para valor de plataforma inesperado, sem promovê-lo a
    Android por coerção.
- Configuração e arquitetura:
  - `appId`, `appName`, `webDir` e ausência de `server.url` no modo de produção;
  - regra ESLint que rejeita imports Capacitor fora da camada permitida;
  - `minSdkVersion = 29` e coerência das versões oficiais Capacitor/Android;
  - scripts de preparação encadeando build antes de sync e propagando falhas.
- Regressão Web/PWA:
  - suíte unitária da UI;
  - build Vite/PWA e teste de atualização existente;
  - nenhum Android SDK necessário para os gates web existentes.
- Smoke Android local:
  - sync partindo de `dist` ausente;
  - build APK debug pelo Gradle Wrapper/CLI documentado;
  - instalação e abertura em API 29 com servidor web desligado;
  - identificação `com.dallfit.app`, nome `Dall Fit` e runtime `android`.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:pwa-update`;
  - comandos Android locais documentados para sync e APK debug.

## Riscos e decisões

- Capacitor 8 é a major estável confirmada durante a especificação; a documentação
  `next` já expõe a major 9, mas adotar prerelease criaria instabilidade sem ganho
  para a fundação. A implementação reconfirma o patch/minor estável e alinha os três
  pacotes oficiais.
- O Capacitor suporta Android abaixo da API 29, porém o produto escolhe Android 10
  como mínimo. Elevar somente `minSdkVersion` preserva o template suportado e reduz
  combinações legadas a testar.
- Versionar `ui/android` aumenta o volume de arquivos e exige revisar diffs gerados,
  mas permite customização nativa, builds reproduzíveis e evolução segura pelas
  próximas issues. Regenerá-lo em cada clone perderia alterações nativas futuras.
- Incluir Gradle no `pnpm build` quebraria ambientes web sem SDK e aumentaria o
  tempo do gate atual. Scripts Android explícitos preservam o ciclo web; CI/release
  completo continua reservado à issue 93.
- `server.url` simplifica live reload, mas também pode transformar o aplicativo em
  casca remota se vazar para produção. O default local embarcado e a separação
  explícita do modo de desenvolvimento eliminam essa ambiguidade.
- Antecipar ports de autenticação, storage e sync produziria abstrações sem
  consumidor e provavelmente erradas. Esta entrega fixa apenas o contrato de
  plataforma/capabilities e a regra de dependência; cada capacidade real expande a
  fronteira na issue proprietária.
- Uma regra de lint por path depende de uma camada nativa canônica. O custo de
  manter esse caminho é menor que o risco de plugins se espalharem por componentes
  e tornarem o build Web/PWA frágil.
- O APK debug prova a fundação, não a prontidão para loja. Assinatura, AAB, ícones,
  permissões finais, ambientes e publicação permanecem critérios exclusivos da
  issue 93.
- O escopo foi deliberadamente limitado à fundação e cabe em uma sessão de até
  cinco horas: dependências/configuração, projeto Android gerado, scripts, um único
  núcleo de adapters, testes proporcionais e documentação. Qualquer descoberta que
  exija capability funcional deve retornar ao refinamento ou à issue posterior, não
  ser absorvida silenciosamente.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Capacitor 8 oficial com `core`, `android` e `cli` alinhados
- `com.dallfit.app`, `Dall Fit`, bundle local e API mínima 29 configurados
- Projeto `ui/android` versionado e APK debug reproduzível localmente
- Scripts Android explícitos sem tornar Android SDK requisito do build Web/CI atual
- Contrato mínimo de runtime/capabilities e adapters Web/Capacitor testáveis
- Imports Capacitor confinados e fiscalizados automaticamente
- Nenhuma capability das issues seguintes antecipada
- Web/PWA, manifest, service worker e atualização existentes preservados
- Documentação viva e ADR afetados atualizados junto da implementação
- Nenhum segredo, assinatura, permissão ou host remoto de produção introduzido
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz, regressão PWA e smoke Android local aprovados
