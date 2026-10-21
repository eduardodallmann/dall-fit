# Testes e qualidade da UI

## Ferramentas

- Vitest com ambiente JSDOM;
- Testing Library e `user-event`;
- `@testing-library/jest-dom` para matchers semânticos;
- Mock Service Worker para requests HTTP;
- Playwright com Chromium para testes integrados comportamentais;
- V8 para cobertura;
- ESLint type-aware com React Hooks e Fast Refresh configurados na raiz.

As duas unidades referenciadas pelo build da UI compilam com `strict: true`:
`tsconfig.app.json` cobre aplicação e testes, enquanto `tsconfig.node.json` cobre
as configurações de Vite e Playwright. Nenhuma delas desabilita individualmente
uma verificação da família estrita.

## Unitários e componentes

Testes usam `*.test.ts` ou `*.test.tsx` próximos ao código. O setup comum fica em
`tests/setup.ts`.

Preferir queries acessíveis (`role`, nome, label e texto) e interação realista com
`user-event`. Testar comportamento percebido pelo usuário, não estado interno ou
detalhes de implementação.

Quando o comportamento depender da API, o teste usa o servidor Node do MSW e o
mesmo handler disponível no desenvolvimento. Não mockar `fetch`, o cliente HTTP ou
o módulo de service diretamente em testes de rota. Overrides locais com
`mockServer.use(...)` são permitidos para erros e casos específicos e devem ser
restaurados após cada teste.

Fluxos autenticados cobrem a confirmação da pessoa seguida pelo bootstrap do token
CSRF, mantido somente em memória. Testes de mutation validam o header aplicado pelo
client Axios único; cenários de `401`, falha técnica do CSRF e logout verificam
respectivamente limpeza privada, recuperação sem logout simulado e teardown local
mesmo quando a revogação remota falha. A matriz também cobre query ativa,
revalidação, `401` concorrentes, perda de `isAdmin`, CSRF single-flight/renovado e
geração nova sem estado privado antigo.

Vercel Analytics é isolado nos testes: a composição global substitui o componente
oficial para confirmar uma única montagem sem carregar coleta externa; testes da
fronteira substituem apenas `track` e validam schema, normalização, deduplicação,
privacidade, bloqueio anterior ao SDK enquanto offline, `beforeSend` defensivo e
ausência de replay ao reconectar. Componentes e providers substituem a fronteira
interna para verificar os eventos produzidos por interações acessíveis. Valores de
campos, IDs, query e mensagens de erro não podem aparecer nos asserts de emissão.
Diagnósticos sistêmicos testam somente as categorias `bootstrap`, `render` e
`pwa_registration`; objetos `Error`, stacks e conteúdo técnico nunca entram no
mock do transporte.

Playwright mantém a integração real entre componentes e navegação, mas não cria
handler MSW, `page.route` ou implementação paralela para Analytics. Recebimento de
pageviews no dashboard da Vercel é uma verificação manual de implantação.

## Testes integrados

Playwright sobe a UI real com Vite, habilita o MSW no navegador e cobre:

- comportamento integrado de uma rota;
- interação entre componentes, hooks e cliente HTTP;
- estados retornados pelos handlers MSW;
- navegação e dados preservados entre rotas de um flow.

Specs de rota vivem em `tests/integration/routes/`; specs de jornada vivem em
`tests/integration/flows/`. Eles não acessam a API real, não geram cobertura e não
substituem os E2E do backend. Organização, configuração e comandos estão em
`07-testes-integrados-playwright.md`.

## Princípio de teste

Testes unitários, de componentes e integrados priorizam regras de negócio e
comportamentos observáveis. Cada teste deve proteger uma decisão, validação, estado,
caminho de navegação, resposta da API ou risco descrito no SDD.

Cobertura de linhas é um indicador de lacunas, não o objetivo do teste. Não criar
testes que apenas renderizem componentes, chamem funções triviais ou reproduzam
detalhes internos para aumentar a métrica sem validar uma regra.

## Cobertura mínima de comportamento

Cada rota deve receber cobertura proporcional entre Vitest e Playwright, quando
aplicável:

- render inicial e caminho feliz;
- loading, vazio, sucesso e erro;
- validações e bloqueio de avanço;
- navegação;
- interação por teclado e foco;
- respostas relevantes da API;
- regressões descritas no SDD da rota.

Toda mutation nova ou alterada seleciona, conforme o risco documentado, cenários
que comprovem:

- caminho feliz, estado pending observável e prevenção de submissão duplicada;
- aplicação da response canônica e encerramento do formulário, edição ou
  confirmação somente depois do sucesso;
- falha genérica com loading encerrado, draft preservado, erro persistente e retry
  ou cancelamento seguro;
- classificação funcional pela combinação de status e `code`, sem decisão por
  texto de mensagem;
- rollback restrito ao efeito da própria operação, preservando mudanças posteriores
  e alvos não relacionados;
- resposta tardia incapaz de sobrescrever intenção ou resposta mais nova;
- término explícito de promises, inclusive nos caminhos rejeitados;
- acessibilidade de espera, erro, bloqueio, foco e proteção de navegação quando
  houver trabalho recuperável.

Para aggregates versionados com fila compartilhada, a cobertura inclui ainda:

- duas operações enfileiradas enquanto a primeira está pendente, em ordem FIFO;
- uma segunda operação iniciada depois que a primeira concluiu e a fila ficou
  ociosa, usando a versão resultante da primeira;
- leitura ou remontagem atrasada incapaz de regredir a versão corrente;
- aggregates diferentes executando de forma independente;
- conflito exato pausando somente o aggregate afetado, sem retry ou merge
  silencioso, e liberação apenas após recuperação canônica;
- falha não classificada como conflito sem avanço indevido da versão e com a
  continuidade segura definida pelo domínio.
- teardown de sessão cancelando trabalho em execução/espera e removendo versão,
  pausa e ID antes de uma geração nova.

Políticas HTTP transversais possuem testes parametrizados para timeout, rede,
cancelamento e status permanentes/transitórios. Queries comprovam propagação de
`AbortSignal`; cancelamento não emite feedback de erro; mutations não fazem retry;
upload valida seu timeout específico. Bootstrap, Error Boundary e PWA comprovam
fallback acionável e recuperação sem tela vazia ou bloqueio do web app.

O ciclo PWA possui testes próprios para relógio de uma hora, revalidação
`no-store`, deduplicação, offline, retomada, espera por `activated`, mudança de
controle, `redundant`, timeout, abort, retry, diagnóstico e reload único. A
fronteira de segurança cobre múltiplos owners, cleanup e mutations globais; os
formulários e editores registram seus estados recuperáveis pela mesma fronteira.
Como o Playwright integrado usa MSW Browser e mantém Workbox desabilitado,
`pnpm test:pwa-update` executa separadamente dois builds reais na mesma origem e
duas abas Chromium, preservando um draft até o reload se tornar seguro. O mesmo
gate audita o service worker gerado e o conteúdo real de Cache Storage, abre uma
rota privada pelo app shell sem rede, comprova ausência de requests privados e de
crescimento do cache, preserva a URL e valida a remontagem ao reconectar.

Vitest cobre a fonte compartilhada de conectividade, foco inicial da superfície
global, retry explícito, ocultação integral da árvore Web/PWA e bypass Android.
Playwright alterna a rede depois do bootstrap para comprovar que identidade e ações
privadas somem, a rota permanece estável e o shell reaparece somente após a
reconexão.

A fundação Capacitor possui testes unitários para seleção injetável do adapter,
detecção Android, fallback Web diante de bridge ausente ou plataforma inesperada e
imutabilidade do snapshot. Testes de configuração verificam identidade do app,
`webDir`, ausência de servidor remoto, alinhamento dos pacotes Capacitor,
`minSdkVersion` e encadeamento build-before-sync. Um teste executável do ESLint
comprova que imports `@capacitor/*` falham fora de `core/platform/native` e são
aceitos dentro da fronteira.

O script `test` executa também os contratos de dependências do tooling em
`tests/dependency-compatibility.test.mjs`. Eles carregam o parser Xcode do
Capacitor sem `require(esm)` e validam geração de IDs e serialização em memória
para proteger o override de UUID documentado no SDD do workspace. Esses testes
não executam Xcode nem representam um build iOS.

A autenticação Android acrescenta testes de inicialização/cancelamento do Google,
envelope versionado e UUID, isolamento entre mesma conta e conta diferente, falha
de limpeza, expiração, logout local independente da revogação remota, Bearer sem
cookie/CSRF, diálogo destrutivo e regras de backup para API 29/30 e 31+. Credential
Manager, Keystore, backup/restore e reinstalação reais continuam validações manuais
em emulador ou aparelho.

O motor offline acrescenta Vitest para o adapter da bridge, vínculo de conta,
pendências e limpeza, além de testes instrumentados Java com SQLite e filesystem
reais. A matriz nativa cobre round-trip de payload opaco, revisão regressiva e
idempotente, transação composta de snapshot, disputa entre threads, lifecycle de
arquivo temporário, limpeza repetida, rollback de migration e reset reconhecível de
banco incompatível. Testes de configuração protegem registro antecipado do plugin,
ausência de permissões de armazenamento e exclusões de backup. Como eventos são
best-effort, consumidores reparam ausência ou atraso consultando `getState`.

A preparação de treino acrescenta Vitest do coordenador para coalescência,
composição best-effort, commit essencial anterior à mídia, ausência de signed URL
no payload, validade e falhas não bloqueantes. Testes instrumentados protegem a
validade devolvida pela bridge e impedem que uma revisão atrasada conclua arquivo
de um plano já substituído. Status HTTP/tipo/tamanho/corpo, redirects HTTPS,
sincronização e promoção atômica pertencem ao downloader Java; o smoke final exige
APK e dispositivo/emulador.

O sincronizador em primeiro plano acrescenta Vitest do coordenador para Bearer
efêmero, montagem, resume, expiração e teardown. A matriz Java separa classificação
HTTP, backoff, `Retry-After` e executor serial; testes instrumentados com SQLite real
cobrem migration v1→v2, sequência local, claim por revisão, alteração durante upload,
recuperação de `in_flight`, retry rearmado, erro isolado, ação necessária e limpeza
condicionada. Conectividade é hint testável por callback, e o smoke Android confirma
reconexão e ausência de Bearer no banco/logcat. Nenhum desses cenários cria request
Playwright ou MSW porque o transporte pertence ao processo nativo.

O WorkManager acrescenta testes de configuração para versão AndroidX, Application,
ausência de Foreground Service, unique work e fronteira do cofre. A matriz Android
instrumentada cobre requests com constraint exclusiva de conectividade, intervalo de
seis horas, backoff exponencial, passagem do mesmo motor, retry temporário, `401` sem
loop, envelope cifrado compatível e recuperação de snapshot. O smoke fecha o processo,
restaura conectividade e confirma envio sem Activity/WebView; atraso por política do
sistema operacional continua uma característica esperada, não uma falha do teste.

A execução offline acrescenta Vitest do repository/reducer para materialização,
revisão, confirmação posterior ao commit, validade e terminais. Testes Android com
SQLite real comprovam as transações compostas de sessão + snapshot e terminal +
remoção, inclusive CAS e rollback. Componentes e Playwright preservam a decisão
obrigatória de retomada/descarte e a equivalência do adapter HTTP; lifecycle,
relógio monotônico e modo avião completam a matriz no Android.

A integração da fila com a UI acrescenta cobertura para projeção provisória no
commit terminal, promoção canônica condicionada por execução/sequência, leitura da
menor ação, resolução CAS, token obsoleto, descarte terminal e limpeza de lease.
Componentes cobrem comparação completa, confirmação destrutiva, takeover e aviso
de autenticação. Instrumentados cobrem migration v2→v3, notificação deduplicada e
permissão opcional; negação nunca altera storage ou sincronização.

A compatibilidade obrigatória acrescenta Vitest para single-flight, falha aberta
sem política, mínimo nativo monotônico, exceção exclusiva do workout ativo,
superfície global, abertura repetível da loja e aviso de reset. Unitários/E2E da
API cobrem configuração, política pública e recusa antes das dependências. A matriz
Java valida package info, classificação exata de `APP_UPDATE_REQUIRED` e migrations
v1/v2/v3→v4 preservando envelope, fila, ação e conclusão provisória.

Os gates web não exigem Android SDK. Sync, execução, APK debug e testes
instrumentados permanecem comandos explícitos. O workflow manual de release roda
os gates web, testes Java locais e o build AAB assinado em environment protegido;
ele não substitui `connectedDebugAndroidTest` nem o smoke manual da build instalada
pelo teste interno em API 29 e API 33+/36.

Esses cenários não precisam existir todos no Playwright. Funções puras, hooks e
componentes cobrem a matriz combinatória; Playwright preserva os caminhos
observáveis de maior risco e a integração real entre tela, cliente e MSW.

Na gestão de planos, funções puras cobrem canonicalização e janela limitada de
paginação, merge por revisão de draft, reinserção e restauração de ordem. Testes de
hooks cobrem FIFO e versão por aggregate, independência entre planos, propagação da
versão entre mutations concorrentes e sequenciais separadas por um período ocioso,
classificação exata de conflito e rollback localizado. Playwright cobre overlays
recuperáveis, página acima do total, paginação grande, duas adições consecutivas,
autosave/conflito, exclusão durante debounce, ordem por teclado e proteção
acessível da navegação.

## Comandos

```bash
pnpm -C ui test
pnpm -C ui test:watch
pnpm -C ui test:coverage
pnpm -C ui test:coverage:ci
pnpm -C ui typecheck
pnpm test:pwa-update
pnpm android:build:release
pnpm android:test
```

`pnpm android:test` exige dispositivo ou emulador API 29+ conectado e uma JDK
compatível com o projeto. O comando sincroniza o bundle antes de executar
`connectedDebugAndroidTest`; ele permanece fora dos gates web e do workflow de
release porque exige dispositivo ou emulador. `pnpm android:build:release` exige a
configuração pública e a upload key descritas no runbook transversal, e produz AAB,
checksum e metadados somente depois de validar a assinatura.

Os gates completos são executados na raiz. Não excluir código testável apenas para
melhorar a métrica de cobertura e não criar testes sem comportamento relevante
apenas para aumentar essa métrica.

Configuração, handlers e política de requests não reconhecidas seguem
`05-mocks-de-api.md`.

Quando Playwright for adotado, os testes integrados executam separadamente por
`pnpm test:integration`, conforme `07-testes-integrados-playwright.md`. Eles não
fazem parte dos comandos de cobertura.

Referências de layout no SDD são opcionais. A comparação visual só é necessária
quando a pasta `routes/assets/<route-slug>/` contiver imagens e segue
`06-referencias-visuais-de-layout.md`. A ausência de imagens não representa falta de
cobertura e não cria um gate visual.
