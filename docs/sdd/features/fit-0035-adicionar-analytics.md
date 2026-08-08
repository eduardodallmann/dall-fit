# Feature Spec: Adicionar Vercel Analytics

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0035`](https://github.com/eduardodallmann/dall-fit/issues/35).
- Problema: a SPA publicada na Vercel não inclui o componente cliente do Vercel
  Analytics e, portanto, não registra as visualizações de páginas da aplicação na
  plataforma.
- Resultado: o bundle de produção da UI monta uma única instância do componente
  oficial Vercel Analytics na raiz da aplicação e uma fronteira única de
  instrumentação de eventos. A plataforma passa a receber visualizações das rotas da
  SPA e eventos sem conteúdo para as interações relevantes, inclusive nas navegações
  do TanStack Router, sem alterar a interface, a navegação, os contratos HTTP ou os
  fluxos de produto.
- Referências:
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/04-testes-e-qualidade.md`;
  - [Vercel Analytics — Quickstart para Create React App](https://vercel.com/docs/analytics/quickstart?framework=create-react-app#add-the-analytics-component-to-your-app).
  - documentação oficial da API de eventos customizados do Vercel Analytics,
    confirmada na versão instalada durante a implementação.
- Features relacionadas: não se aplica.

## Escopo

### Incluído

- adicionar `@vercel/analytics` às dependências de produção da UI, em versão
  compatível com React 19, Vite 8 e a configuração instalada;
- renderizar `Analytics` de `@vercel/analytics/react` uma única vez no bootstrap
  global da UI, ao lado da árvore de aplicação já existente;
- preservar o acompanhamento de visualizações nas transições client-side da SPA,
  sem recarregar o documento;
- criar uma fronteira interna única, tipada e sem efeitos no produto para emitir os
  eventos customizados por meio da API oficial da dependência;
- instrumentar todas as ações atualmente disponíveis na UI: links de navegação,
  botões, itens de dropdown, paginação, acionadores e itens de disclosure, foco e
  término de edição dos campos, submissões, retries e as aberturas, confirmações e
  fechamentos de overlays;
- registrar o resultado observável de ações assíncronas de login, tema, instalação e
  atualização da PWA e mutations de planos, sem duplicar eventos por uma única ação;
- estabelecer a convenção obrigatória para que controles e superfícies interativas
  adicionados em implementações futuras recebam instrumentação na mesma mudança;
- atualizar a documentação viva da arquitetura da UI para registrar a integração
  global, a fronteira de eventos, o catálogo vigente e a política de privacidade;
- atualizar as rotas e fluxos afetados com os eventos observáveis e incluir cobertura
  proporcional para preservar a composição global, a emissão e a ausência de
  conteúdo sensível.

### Não incluído

- criar cookies próprios, identificadores de usuário, tags de terceiros, uma segunda
  SDK de telemetria, dashboard próprio ou integração com outra ferramenta;
- enviar nomes, e-mails, tokens, dados de treino, parâmetros sensíveis de URL ou
  qualquer dado pessoal à analytics, inclusive valores digitados, mensagens de erro
  de campo, IDs de plano ou treino, URL completa e `mock*` params;
- alterar rotas, autenticação, chamadas Axios, contratos compartilhados, API,
  handlers MSW ou fixtures;
- alterar a configuração de deploy, domínios, dashboard, retenção ou consentimento
  administrados pela Vercel;
- criar interface, banner de consentimento ou preferência de opt-out;
- instrumentar o PWA, Service Worker ou testes Playwright com uma implementação
  paralela de analytics.

## Projetos e documentação afetados

- API e endpoints: não se aplica — não há mudança no backend nem no tráfego HTTP da
  API.
- UI e rotas:
  - `ui/package.json` e o lockfile passam a declarar a dependência oficial;
  - o bootstrap global monta o componente oficial junto da árvore existente e expõe
    somente a fronteira interna de eventos, sem criar cliente de analytics paralelo;
  - os componentes de menu, tema, PWA, login e planos e suas rotas proprietárias
    emitem os eventos do catálogo desta feature;
  - `ui/docs/sdd/base/01-arquitetura.md` registra a integração global, a fronteira e
    as regras de dados; `ui/docs/sdd/base/04-testes-e-qualidade.md` registra a
    estratégia de testes;
  - `ui/docs/sdd/routes/root.md`, `dash.md`, `global-training-plan.md` e
    `global-training-plan-detail.md` registram as interações instrumentadas. A rota
    de workout não possui controle próprio no estado atual, mas registra seus retries
    quando exibidos.
- Fluxos: `login-google.md` e `gestao-planos-treino-globais.md` documentam os eventos
  de início e resultado dos passos que já coordenam UI e API, sem alterar sua
  sequência.
- Contratos em `@dall-fit/types`: não se aplica.
- Decisões arquiteturais: não exige ADR; é a integração oficial, local e reversível
  de observabilidade de página no frontend já hospedado na Vercel.
- Handlers e fixtures MSW: não se aplica — não há request à API do Dall Fit.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

1. A UI declara `@vercel/analytics` como dependência de produção, com versão
   confirmada durante a implementação contra o manifesto, lockfile, tipos locais e
   documentação oficial.
2. A aplicação monta uma única instância de `Analytics` de
   `@vercel/analytics/react` como parte da composição global React.
3. O componente não substitui nem impede `AppProviders`, `App` ou o
   `RouterProvider`; a aplicação mantém a mesma árvore de providers, rotas,
   autenticação e navegação existentes.
4. Uma visita à aplicação implantada na Vercel registra visualização da página na
   plataforma, conforme o comportamento do componente oficial.
5. Navegações internas entre rotas da SPA continuam sem reload do documento e são
   acompanhadas pelo componente oficial conforme suportado pela integração.
6. Cada evento contém no máximo `event_name`, `route`, `surface`, `control`,
   `action`, `outcome` e propriedades enumeradas deste documento. Propriedades
   opcionais ausentes não são substituídas por strings vazias, URLs ou dados de
   domínio.
7. A UI não expõe controles, textos, erros ou estados de loading adicionais para
   analytics.
8. Falha, indisponibilidade ou bloqueio da coleta de analytics não impede render,
   autenticação, navegação, PWA ou qualquer interação do produto.

### Catálogo de eventos e propriedades

Todos os nomes são estáveis, em `snake_case`, e os valores são constantes
enumeradas. O contexto comum é `route` (somente pathname estático, com segmentos
dinâmicos normalizados), `surface` e `control`; nunca contém query, hash, URL
completa, identificador, texto visível arbitrário ou valor de campo.

| Evento | Quando emitir | Propriedades permitidas além do contexto comum |
| --- | --- | --- |
| `ui_navigation_selected` | Link de menu, breadcrumb, nome de plano/treino ou paginação leva a outro destino | `destination`, `navigation_kind` (`menu`, `breadcrumb`, `row_link`, `pagination`) |
| `ui_button_pressed` | Botão não coberto por evento mais específico é ativado | `action` |
| `ui_menu_opened` | Trigger de menu lateral móvel ou dropdown de ações é aberto | `menu` (`application`, `row_actions`) |
| `ui_menu_action_selected` | Item Editar ou Excluir é escolhido no dropdown | `menu`, `action` |
| `ui_overlay_opened` | Modal de criar/editar ou confirmação de exclusão passa a aberto | `overlay`, `mode` quando aplicável (`create`, `edit`) |
| `ui_overlay_closed` | Modal, alert dialog ou drawer deixa de estar aberto | `overlay`, `reason` (`cancel`, `close_trigger`, `backdrop`, `escape`, `submit`, `confirm`, `navigation`, `breakpoint`) |
| `ui_field_focused` | Campo recebe foco pela primeira vez em cada abertura de formulário/edição | `form`, `field` |
| `ui_field_completed` | Campo perde foco após alteração | `form`, `field`, `state` (`empty`, `valid`, `invalid`) |
| `ui_form_submitted` | Formulário válido é submetido | `form`, `mode` (`create`, `edit`, `inline_edit`) |
| `ui_operation_started` | Ação assíncrona de login, tema, PWA ou mutation é aceita pela UI | `operation` |
| `ui_operation_completed` | Login, tema, PWA ou mutation iniciada pelo usuário termina | `operation`, `outcome` (`success`, `error`, `dismissed`, `unavailable`) |
| `ui_retry_requested` | Uma ação Tentar novamente é ativada | `resource` (`training_plans`, `training_plan`, `workout`) |
| `ui_disclosure_toggled` | Instruções de instalação são abertas ou fechadas | `disclosure`, `state` (`open`, `closed`) |

`ui_button_pressed` não é emitido em adição aos eventos específicos da mesma
interação. O resultado é emitido apenas quando a operação chega a um estado terminal;
pending, exceções técnicas e payloads não são registrados.

### Inventário obrigatório da UI atual

- **Entrada e PWA:** `Entrar com Google` emite início e resultado de login;
  `Atualizar agora` e `Agora não` emitem a decisão e o resultado de atualização;
  `Instalar aplicativo` emite início e resultado do prompt; `Como instalar` emite a
  alternância do disclosure.
- **Shell autenticado:** `Abrir menu`, o close trigger, backdrop, `Escape` e o
  fechamento por breakpoint registram o ciclo do drawer; links `Home` e `Planos de
  treino` registram navegação; o seletor de tema registra intenção e resultado.
- **Lista de planos:** `Novo plano`, links de plano, breadcrumb, anterior/próxima e
  páginas da paginação, retries, trigger e itens do dropdown, cancelar, criar,
  salvar e excluir são rastreados. Abertura e fechamento do formulário e da
  confirmação de exclusão seguem os eventos de overlay.
- **Formulários de plano:** `Nome` e `Descrição` nos modais e na edição inline
  emitem somente foco e término com estado. Nunca emitem conteúdo, tamanho, máscara,
  contagem de caracteres ou mensagem de validação. Submissão e cancelamento emitem
  os eventos de formulário, overlay ou botão aplicáveis.
- **Detalhe e treino:** lápis de edição, salvar/cancelar inline, `Novo treino`, links
  e breadcrumb de treino, dropdown e confirmação de exclusão, além dos retries,
  seguem o mesmo catálogo. A criação e exclusão de treino registram somente o tipo
  da operação e o resultado, nunca seus IDs ou nomes.
- **Futuras superfícies:** todo novo botão, link acionável, input, textarea, select,
  checkbox, radio, slider, paginação, menu, disclosure, modal, drawer, alert dialog,
  toast com ação ou fluxo assíncrono deve mapear-se a um evento existente ou justificar
  e especificar um novo evento em sua própria feature e no catálogo vivo antes da
  implementação.

## Requisitos não funcionais

- Acessibilidade: a integração não cria conteúdo visual, foco, região viva nem
  interfere na ordem de leitura ou operação por teclado.
- Performance: usar exclusivamente o pacote oficial e uma montagem global; não
  introduzir polling, chamadas Axios, listeners globais de clique ou captura de cada
  tecla. Campos não emitem por `change`/tecla e a fronteira descarta emissão repetida
  no mesmo ciclo de interação.
- Segurança e privacidade: configurar somente os eventos customizados e propriedades
  enumerados nesta feature; nunca transmitir dados pessoais, credenciais, tokens,
  payloads HTTP, conteúdo de treinos, identificadores de pessoa/plano/treino,
  valores/erros de formulários, URL completa, query ou hash. Variáveis `VITE_*` novas
  não são necessárias e nenhum segredo pode ser incorporado ao bundle.
- Observabilidade: Vercel Analytics é a única observabilidade introduzida. Não usar
  `console.*`, logs locais, data attributes usados como coleta paralela ou uma segunda
  SDK de telemetria.

## Critérios de aceite

### Cenário 1 — Carregar analytics na aplicação publicada

- Forma de validar: abrir a implantação de produção da UI na Vercel e confirmar no
  dashboard Vercel Analytics, após a latência normal da plataforma, que a visita foi
  recebida.
- Given: o projeto Vercel possui Analytics habilitado e a UI contém o build com a
  dependência oficial.
- When: uma pessoa abre uma rota pública da aplicação implantada.
- Then: a UI renderiza normalmente, sem conteúdo visual adicional ou erro de
  analytics.
- And: a visualização fica disponível no Vercel Analytics.

### Cenário 2 — Interagir sem perda de privacidade

- Forma de validar: `http://localhost:3000/`, com MSW habilitado quando necessário,
  e teste automatizado da composição global.
- Given: a UI foi inicializada com a fronteira de analytics isolada no teste.
- When: a pessoa abre o formulário de plano, preenche os dois campos, cancela,
  navega, usa paginação e abre/fecha a confirmação de exclusão.
- Then: são emitidos somente os eventos e propriedades permitidos para essas ações.
- And: nome, descrição, IDs, e-mail, query de mock, valores digitados e mensagens de
  validação não aparecem nas emissões.

### Cenário 3 — Operações e overlays têm eventos únicos

- Forma de validar: `http://localhost:3000/global/training-plan?mockAuth=admin` e
  testes Vitest/Playwright da rota com a fronteira isolada.
- Given: a lista de planos está carregada.
- When: a pessoa abre o menu de ações, escolhe Excluir, cancela e então confirma uma
  exclusão; em outra interação cria ou edita um plano.
- Then: cada abertura e fechamento tem uma razão correta; menu, escolha, submissão e
  resultado terminal são emitidos uma vez por interação.

### Cenário 4 — Navegar sem regressão da SPA

- Forma de validar: `http://localhost:3000/`, com MSW habilitado quando necessário,
  e teste automatizado da composição global.
- Given: a UI foi inicializada com o componente oficial de analytics.
- When: a pessoa navega pela rota pública e conclui o caminho de login mockado até
  `/dash`, ou usa uma navegação interna equivalente disponível.
- Then: o TanStack Router preserva a navegação client-side, sem reload do documento
  nem alteração dos providers, e o componente de analytics continua montado uma
  única vez.

### Cenário 5 — Coleta indisponível não bloqueia o produto

- Forma de validar: teste Vitest com o módulo de analytics isolado conforme o padrão
  de testes existente; não se aplica uma simulação da infraestrutura da Vercel.
- Given: a aplicação inicia em um ambiente em que a coleta não produz dados.
- When: uma rota é renderizada e a pessoa interage com a UI.
- Then: a árvore de rotas continua disponível e nenhum erro técnico de analytics é
  mostrado ao usuário.

## Estratégia de entrega e compatibilidade

1. Confirmar a versão compatível de `@vercel/analytics` e consultar novamente o
   quickstart oficial durante a implementação.
2. Consultar a base arquitetural da UI e os tipos instalados antes de escolher o
   ponto exato de composição global.
3. Instalar a dependência com pnpm no workspace proprietário, atualizando somente o
   manifesto da UI e o lockfile compartilhado.
4. Montar o componente oficial no menor ponto comum a todas as rotas e criar somente
   a fronteira interna tipada necessária para centralizar schema, normalização e
   no-op seguro; não criar provider, client ou event bus paralelo.
5. Instrumentar o inventário desta feature por componentes proprietários, sem
   delegação global de eventos, e atualizar o inventário se a UI vigente divergir.
6. Atualizar base, rotas e fluxos afetados junto da implementação para que o
   comportamento vigente não dependa desta feature histórica.
7. Revisar `api/` e `ui/` por código sem uso ao final da implementação.

## Plano de testes

- UI:
  - adicionar ou ajustar o teste da composição global para garantir que analytics é
    montado sem remover o `RouterProvider`;
  - testar a fronteira por schema, normalização de rota, no-op em falha e rejeição
    dos campos proibidos;
  - testar cada grupo de eventos do inventário por interação acessível, incluindo
    foco/término dos campos, ciclo de overlays, navegação, menu, paginação, PWA, tema
    e resultados de sucesso/erro;
  - manter o módulo de analytics isolado no teste para não emitir dados reais e
    preservar os testes de rotas e fluxos existentes como regressão.
- Verificação manual:
  - abrir uma implantação Vercel com Analytics habilitado;
  - visitar uma rota pública e executar uma navegação interna;
  - confirmar que a aplicação não mostra elementos, erros ou mudanças de navegação
    atribuíveis à integração;
  - confirmar as visualizações no dashboard após o prazo de processamento da
    Vercel.
- MSW e API: nenhum handler, fixture ou teste de backend novo; não há alteração da
  fronteira HTTP da aplicação. Os handlers existentes são usados somente para tornar
  observáveis os resultados de operações instrumentadas.
- Quality gates após a implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`;
  - `pnpm -C api test:e2e` não é exigido especificamente, pois endpoint, wiring,
    MongoDB e Redis não mudam.

## Riscos e decisões

- O pacote não está instalado e a API precisa ser confirmada na versão escolhida. A
  decisão é usar o componente oficial documentado e validar sua exportação nos tipos
  locais antes de escrever a composição.
- Montar analytics por rota pode duplicar a coleta e deixar novas rotas sem
  instrumentação. A decisão é usar uma única montagem global.
- Eventos customizados são necessários para medir a interação solicitada, mas podem
  elevar o risco de privacidade. A decisão é limitar o schema a nomes e propriedades
  enumeradas, sem conteúdo, identificadores ou URL completa, e impedir emissão em
  teclado/change global ou em dados de domínio.
- Instrumentar cada componente por conta própria pode divergir nomes e duplicar
  envios. A decisão é usar uma fronteira única tipada, com chamadas locais explícitas
  nos pontos em que a intenção do usuário é conhecida.
- Rastrear cada tecla, o texto do input ou mesmo seu tamanho não melhora a decisão de
  produto de forma proporcional. A decisão é registrar somente foco inicial e
  término, com estado enumerado.
- A coleta é gerenciada externamente e pode ter atraso, ad blockers ou configuração
  de projeto. Testes locais protegem a composição e a ausência de regressão; o
  recebimento final é conferido em uma implantação Vercel com Analytics habilitado.
- A integração não deve ser emulada por MSW, pois não é uma integração com a API do
  Dall Fit e o pacote oficial é quem controla sua coleta.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Uma única instância do componente oficial montada globalmente
- Dependência de produção e lockfile compatíveis e atualizados
- Rotas, providers, navegação e PWA preservados
- Catálogo atual e regra para futuras superfícies interativas implementados sem
  duplicidade de eventos
- Nenhum dado pessoal, segredo, conteúdo de formulário, identificador ou URL sensível
  enviado pela integração
- Testes proporcionais de composição, schema, privacidade, emissão e regressões de UI
  aprovados
- Documentação viva de arquitetura, testes, rotas e fluxos atualizada na implementação
- Revisão de código sem uso concluída em `api/` e `ui/`
- Quality gates da raiz e Playwright aprovados
