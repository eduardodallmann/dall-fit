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
privacidade e no-op em falha. Componentes e providers substituem a fronteira
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
duas abas Chromium, preservando um draft até o reload se tornar seguro.

A fundação Capacitor possui testes unitários para seleção injetável do adapter,
detecção Android, fallback Web diante de bridge ausente ou plataforma inesperada e
imutabilidade do snapshot. Testes de configuração verificam identidade do app,
`webDir`, ausência de servidor remoto, alinhamento dos pacotes Capacitor,
`minSdkVersion` e encadeamento build-before-sync. Um teste executável do ESLint
comprova que imports `@capacitor/*` falham fora de `core/platform/native` e são
aceitos dentro da fronteira.

A autenticação Android acrescenta testes de inicialização/cancelamento do Google,
envelope versionado e UUID, isolamento entre mesma conta e conta diferente, falha
de limpeza, expiração, logout local independente da revogação remota, Bearer sem
cookie/CSRF, diálogo destrutivo e regras de backup para API 29/30 e 31+. Credential
Manager, Keystore, backup/restore e reinstalação reais continuam validações manuais
em emulador ou aparelho.

Os gates web não exigem Android SDK. Sync, execução e APK debug são validações
locais explícitas conforme o SDD do workspace; smoke em dispositivo ou emulador
API 29+ permanece manual enquanto CI e release Android não forem adotados.

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
```

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
