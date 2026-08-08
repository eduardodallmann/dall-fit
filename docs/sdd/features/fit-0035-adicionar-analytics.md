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
  oficial Vercel Analytics na raiz da aplicação. A plataforma passa a receber
  visualizações das rotas da SPA, inclusive nas navegações do TanStack Router, sem
  alterar a interface, a navegação, os contratos HTTP ou os fluxos de produto.
- Referências:
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/04-testes-e-qualidade.md`;
  - [Vercel Analytics — Quickstart para Create React App](https://vercel.com/docs/analytics/quickstart?framework=create-react-app#add-the-analytics-component-to-your-app).
- Features relacionadas: não se aplica.

## Escopo

### Incluído

- adicionar `@vercel/analytics` às dependências de produção da UI, em versão
  compatível com React 19, Vite 8 e a configuração instalada;
- renderizar `Analytics` de `@vercel/analytics/react` uma única vez no bootstrap
  global da UI, ao lado da árvore de aplicação já existente;
- preservar o acompanhamento de visualizações nas transições client-side da SPA,
  sem recarregar o documento;
- atualizar a documentação viva da arquitetura da UI para registrar a integração
  global e a dependência;
- incluir cobertura proporcional para preservar que a composição global monta o
  componente de analytics sem afetar o `RouterProvider`.

### Não incluído

- criar eventos customizados, métricas de produto, funis, tags, cookies próprios,
  identificadores de usuário ou integração com ferramenta de terceiros;
- enviar nomes, e-mails, tokens, dados de treino, parâmetros sensíveis de URL ou
  qualquer dado pessoal à analytics;
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
  - `ui/src/app.tsx` ou o ponto global equivalente monta o componente oficial junto
    da árvore existente, sem criar provider ou cliente paralelo;
  - `ui/docs/sdd/base/01-arquitetura.md` registra o Vercel Analytics como integração
    global da UI;
  - rotas individuais permanecem inalteradas, pois a instrumentação é transversal e
    não modifica comportamento observável de uma tela.
- Fluxos: não se aplica — a sequência de autenticação e navegação não muda.
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
6. A UI não expõe controles, textos, erros ou estados de loading adicionais para
   analytics.
7. Falha, indisponibilidade ou bloqueio da coleta de analytics não impede render,
   autenticação, navegação, PWA ou qualquer interação do produto.

## Requisitos não funcionais

- Acessibilidade: a integração não cria conteúdo visual, foco, região viva nem
  interfere na ordem de leitura ou operação por teclado.
- Performance: usar exclusivamente o pacote oficial e uma montagem global; não
  introduzir listeners, polling, chamadas Axios ou instrumentação manual por rota.
- Segurança e privacidade: não configurar eventos customizados nem transmitir dados
  pessoais, credenciais, tokens, payloads HTTP, conteúdo de treinos ou identificador
  da pessoa autenticada. Variáveis `VITE_*` novas não são necessárias e nenhum
  segredo pode ser incorporado ao bundle.
- Observabilidade: Vercel Analytics é a única observabilidade introduzida. Não usar
  `console.*`, logs locais ou uma segunda SDK de telemetria.

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

### Cenário 2 — Navegar sem regressão da SPA

- Forma de validar: `http://localhost:3000/`, com MSW habilitado quando necessário,
  e teste automatizado da composição global.
- Given: a UI foi inicializada com o componente oficial de analytics.
- When: a pessoa navega pela rota pública e conclui o caminho de login mockado até
  `/dash`, ou usa uma navegação interna equivalente disponível.
- Then: o TanStack Router preserva a navegação client-side, sem reload do documento
  nem alteração dos providers, e o componente de analytics continua montado uma
  única vez.

### Cenário 3 — Coleta indisponível não bloqueia o produto

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
4. Montar o componente oficial no menor ponto comum a todas as rotas, sem criar
   abstração ou provider próprio.
5. Atualizar `ui/docs/sdd/base/01-arquitetura.md` junto da implementação para que o
   comportamento vigente não dependa desta feature histórica.
6. Revisar `api/` e `ui/` por código sem uso ao final da implementação.

## Plano de testes

- UI:
  - adicionar ou ajustar o teste da composição global para garantir que analytics é
    montado sem remover o `RouterProvider`;
  - manter o módulo de analytics isolado no teste para não emitir dados reais;
  - preservar os testes de rotas e fluxos existentes como regressão.
- Verificação manual:
  - abrir uma implantação Vercel com Analytics habilitado;
  - visitar uma rota pública e executar uma navegação interna;
  - confirmar que a aplicação não mostra elementos, erros ou mudanças de navegação
    atribuíveis à integração;
  - confirmar as visualizações no dashboard após o prazo de processamento da
    Vercel.
- MSW e API: nenhum handler, fixture ou teste de backend novo; não há alteração da
  fronteira HTTP da aplicação.
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
- Events customizados ou identificação da pessoa autenticada elevariam o risco de
  privacidade sem fazer parte do pedido. A decisão é limitar a entrega a
  visualizações padrão do Vercel Analytics.
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
- Nenhum dado pessoal, segredo ou evento customizado enviado pela integração
- Teste proporcional de composição e regressões de UI aprovados
- Documentação viva da arquitetura da UI atualizada na implementação
- Revisão de código sem uso concluída em `api/` e `ui/`
- Quality gates da raiz e Playwright aprovados
