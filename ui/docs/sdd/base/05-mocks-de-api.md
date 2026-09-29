# Mocks de API com MSW

## Objetivo

Permitir desenvolvimento e testes do frontend sem disponibilidade do backend,
preservando o mesmo cliente HTTP, as mesmas URLs e os mesmos contratos usados em
produção.

Mock Service Worker intercepta requests na fronteira de rede:

- no navegador, por Service Worker;
- no Vitest, pelo servidor Node do MSW;
- no Playwright, pelo mesmo Service Worker enquanto a aplicação real roda no
  Chromium.

Não inserir condicionais de mock em componentes, hooks, services ou no cliente HTTP.
O client Axios e o MSW usam a mesma base `VITE_API_URL`; trocar entre backend real
e mock não altera URLs nem contratos da aplicação.

## Estrutura

Quando a primeira integração HTTP for criada, adotar:

```text
src/mocks/
├── browser.ts
├── server.ts
├── handlers/
│   ├── index.ts
│   └── <operation>.ts
└── fixtures/
    └── <resource>.ts
```

- `browser.ts` cria o worker para desenvolvimento;
- `server.ts` cria o servidor usado pelo Vitest;
- `handlers/index.ts` compõe todos os handlers e mantém a proteção contra requests
  sem cenário;
- cada arquivo de operação cobre um endpoint ou grupo coeso;
- fixtures são tipadas com contratos de `@dall-fit/types`.

Browser e testes consomem a mesma lista de handlers para evitar contratos
divergentes.

## Ativação no desenvolvimento

Mocks são opt-in. Quando implementados, a variável será:

```env
VITE_API_URL=http://localhost:4000
VITE_ENABLE_API_MOCKS=true
```

O bootstrap só importa e inicia `browser.ts` quando:

- o Vite estiver em modo de desenvolvimento; e
- a variável possuir exatamente o valor `true`.

A aplicação aguarda o worker antes do primeiro render, evitando requests que escapem
antes da interceptação. Builds de produção não importam nem iniciam o worker.

`public/mockServiceWorker.js` é gerado pelo MSW, permanece versionado para que
desenvolvimento e Playwright funcionem imediatamente e não deve ser editado
manualmente.

O service worker do PWA é uma infraestrutura diferente. Ele permanece
explicitamente desabilitado no Vite de desenvolvimento e no servidor usado pelo
Playwright, enquanto o MSW é habilitado nesses ambientes. No build de produção o
inverso se aplica: o Workbox é emitido e o MSW não é importado. O arquivo
`mockServiceWorker.js` também é excluído do precache do PWA, impedindo que um
worker intercepte o escopo ou o tráfego pertencente ao outro.

## Regra obrigatória

Toda request HTTP nova ou alterada inclui handlers e fixtures na mesma mudança.
Cobrir, quando aplicável:

- sucesso representativo;
- recurso vazio ou inexistente;
- erros funcionais;
- falhas técnicas;
- latência para comportamento de loading;
- variações determinadas naturalmente por path, query, headers ou body.

Uma mutation recuperável precisa de respostas determinísticas suficientes para
exercitar sucesso, falha antes da confirmação, retry e latência. Os erros preservam
a combinação real de status e `code`, inclusive quando dois erros compartilham o
mesmo status, para impedir classificação por `message`. O cenário mantém estado
somente quando isso for necessário para observar a sequência e o reinicia entre
testes.

Quando houver atualização otimista, o mock permite provocar falha depois do efeito
local para validar rollback restrito e preservação de mudanças posteriores. Quando
o contrato usar versão por aggregate, o estado do handler valida a precondição,
incrementa a versão somente em sucesso e oferece sequências controláveis para:

- mutations concorrentes na mesma fila;
- nova mutation depois que a fila ficou ociosa;
- leitura atrasada com versão anterior;
- conflito de domínio exato e recuperação por leitura canônica;
- aggregates diferentes sem estado compartilhado.

Seletores e fixtures continuam mínimos: não criar um cenário separado quando um
override local do teste expressar melhor uma falha isolada.

Não alterar o contrato de produção apenas para selecionar um cenário mockado. Quando
a própria request não permitir a seleção, documentar um seletor exclusivo de
desenvolvimento que não seja enviado em produção.

## Requests sem handler

Nos testes, qualquer request não reconhecida encerra o teste com erro por meio de
`onUnhandledRequest: 'error'`.

No navegador, a lista de handlers termina com uma proteção para a URL base da API.
Uma operação sem handler explícito recebe `501` com um erro estável como
`MOCK_NOT_IMPLEMENTED`, em vez de alcançar acidentalmente o backend real.

O handler de proteção sempre fica por último.

## Testes

`tests/setup.ts` deverá:

1. iniciar `mockServer` antes da suíte;
2. usar `onUnhandledRequest: 'error'`;
3. restaurar handlers sobrescritos após cada teste;
4. limpar estados mutáveis mantidos pelos handlers após cada teste;
5. encerrar o servidor após a suíte.

Testes reutilizam os handlers padrão. Para um cenário específico:

```ts
mockServer.use(
  http.get('/resource', () =>
    HttpResponse.json(
      createMockApiError('RESOURCE_UNAVAILABLE', 'Resource unavailable.'),
      createMockResponseInit({ status: 503 }),
    ),
  ),
);
```

O teste continua renderizando a rota e interagindo pela interface; não chama handlers
diretamente.

No Playwright, a UI inicia com `VITE_ENABLE_API_MOCKS=true` e usa `browser.ts`.
Não substituir os handlers por `page.route` nem mockar o cliente HTTP. Cada spec
seleciona o cenário pelos dados reais da request ou pelo mecanismo exclusivo de
desenvolvimento documentado. Seguir `07-testes-integrados-playwright.md`.

## Erros e latência

Handlers retornam os mesmos status, códigos e formatos documentados no endpoint.
Loading é produzido com `delay(...)` no handler, não com temporizadores artificiais
no componente.

Toda response mockada da API Dall Fit — sucesso, erro, `204` ou redirect — inclui
`x-request-id`. Erros incluem também `requestId` idêntico no body e os quatro
campos obrigatórios de `ApiError`. O helper compartilhado de mocks centraliza esse
valor para evitar divergência; o middleware Vite da navegação OAuth segue a mesma
regra.

Erros do frontend são documentados na rota; contratos HTTP permanecem no SDD da API.

## Segurança das fixtures

- nenhum dado pessoal real;
- nenhum token ou credencial real;
- IDs reconhecíveis como fictícios;
- valores mínimos e determinísticos;
- tipos compartilhados usados para detectar divergência;
- fixtures não carregam dumps de ambientes.

## Estado de adoção

MSW foi adotado com autenticação. Os handlers vigentes cobrem pessoa atual, CSRF,
logout e mutações. A navegação de documento `GET /api/auth/google`, que não passa
pelo `fetch` interceptável do Service Worker, usa no Playwright um middleware
exclusivo do Vite que responde redirect fictício para `/dash`. No modo mock, a
query exclusiva `mockAuth` faz o
client enviar `x-dall-fit-mock-auth` com o cenário selecionado; o header nunca é
enviado quando mocks estão desabilitados e não pertence ao contrato da API.

`GET /auth/me` devolve a
fixture autenticada sem `isAdmin` por padrão, a fixture com `isAdmin: true` no
seletor `admin`, `401` no seletor `unauthenticated` e erro técnico no seletor
`error`. Os seletores `theme-light`, `theme-dark` e `theme-unset` controlam a
reconciliação do tema; `theme-save-error` e `theme-save-error-unset` exercem os
dois rollbacks. `PATCH /auth/me/configs` mantém estado por seletor, valida o body e
devolve a `Person` atualizada ou a falha selecionada. `GET /auth/csrf` devolve
token fictício no-store e `POST /auth/logout` com sucesso revoga a sessão do seletor: adiciona-o a
`revokedSessions` e emite `Set-Cookie: dall-fit-revoked=<scenario>; Path=/;
SameSite=Lax`. `GET /auth/me` retorna `401` quando o seletor está em
`revokedSessions` (mesmo worker ativo) ou quando o `Cookie Store API` encontra o
cookie `dall-fit-revoked` correspondente (sobrevive a reinícios do Service Worker em
recargas de página). O middleware exclusivo do Vite em `/api/auth/google` limpa o
cookie com `Max-Age=0` para permitir novo login após logout. O estado de autenticação é
reiniciado depois de cada teste Vitest e permanece isolado entre contextos
Playwright.

Os handlers também cobrem `POST /auth/native/session` com body estrito contendo
somente `identityToken`, response Bearer inteiramente fictícia e
`DELETE /auth/native/session` idempotente. Eles exercitam service, coordenador e
headers em Vitest; o Playwright no browser continua validando apenas o ramo Web e
nunca simula Credential Manager ou Keystore reais.

Planos globais usam fixtures tipadas e handlers para as quinze operações em arquivos
`training-plans.ts`. A query exclusiva `mockTrainingPlans` vira o header
`x-dall-fit-mock-training-plans` somente com mocks ativos; nenhum dos dois pertence
ao contrato real. A navegação entre lista, detalhe e workout só serializa esse
seletor quando os mocks estão ativos; em produção, os links omitem a query. Cenários
de mutation mantêm estado separado por valor do seletor,
evitando interferência entre jornadas Playwright paralelas. No Vitest, o setup
global limpa esse estado depois de cada teste, pois `resetHandlers()` restaura os
handlers do MSW, mas não dados mutáveis mantidos pelos módulos. Há sucesso, vazio,
not-found, loading prolongado para validar skeletons e falhas relevantes com
latência; a proteção sentinela continua por último. O estado conserva `version`,
valida `X-Resource-Version`, devolve o valor resultante no mesmo header, incrementa
a versão por mutação efetiva e mantém ordem/imagem. O header legado `If-Match` não
satisfaz a precondição. `large-pagination` disponibiliza mais de 2000 itens e
`two-pages` permite consultar uma página HTTP válida acima do total.
`version-conflict`, `update-exercise-error`, `delete-exercise-error`,
`reorder-error` e `image-error` cobrem concorrência, drafts e rollbacks do editor;
as mutações de imagem esperam `300ms` para tornar o pending observável.
`image-ready` entrega mídia existente e `image-signed-url-expired` entrega primeiro
URLs fictícias expiradas e depois um
novo par, enquanto um handler da origem privada responde `403` ou imagem mínima de
acordo com a query fictícia. Delegation/signature dos mocks são marcadores
determinísticos, nunca credenciais reais, e nenhuma request escapa para a rede.

O mesmo seletor `mockTrainingPlans` controla o handler separado
`training-plan-assistant.ts`. Os valores `assistant-collecting`,
`assistant-resumed`, `assistant-multiple-answers`, `assistant-clarifying`,
`assistant-health-clarification`, `assistant-blocked`, `assistant-emergency`,
`assistant-preview`, `assistant-provider-error`, `assistant-version-conflict` e
`assistant-abandon` cobrem a máquina pública sem chamar API ou provider reais.
Estado mutável preserva versão e retomada por seletor, é limpo no setup global e
valida `X-Resource-Version`, UUIDs e idempotência. As fixtures são sintéticas e o
handler nunca grava conversa em storage nem envia conteúdo para Analytics.
`csrf-refresh` rejeita o primeiro write protegido e aceita somente a repetição
explícita com o token renovado; `timeout` mantém a leitura indefinida para testes
com relógio/abort controlados.
IDs criados são determinísticos; multipart exige um `File` no campo `file` e nunca
é convertido em JSON/base64. Upload devolve signed URLs fictícias e expiração ISO
conforme `ExerciseImage`.

O seletor `mockTraining` cobre visão geral, prévia, sessão, timer e conclusão do
fluxo Treinar. A visão geral inclui validade offline determinística e a projeção do
plano ativo; previews de imagem podem fornecer signed URLs fictícias e
`offlineMediaId` sem acionar a bridge no navegador. Os cenários
`sdd-session-running`, `sdd-pause-running` e
`sdd-workout-complete` reutilizam respectivamente os estados funcionais homônimos
sem o prefixo, mas fixam o relógio da fixture em `2026-08-01T12:00:00.000Z`. Eles
existem exclusivamente para produzir referências visuais determinísticas; testes
comportamentais continuam usando os cenários temporais normais.
O mesmo grupo possui handlers para `PUT /training/offline-lease` e
`POST /training/offline-lease/takeover`, com UUID fictício e response determinística,
permitindo testar registro e transferência da preparação Android sem persistência
real. O browser Web não registra nem chama o plugin
nativo; estados do repository Android são injetados diretamente nos testes de UI.

O seletor `mockDashboard` vira o header fictício
`x-dall-fit-mock-dashboard` somente em desenvolvimento com MSW. Os valores
`empty`, `personal` e `session-running` controlam a leitura pessoal; `admin`
fornece também agregados. `personal-error` e `admin-error` falham nas duas requests
automáticas (tentativa inicial e único retry transitório) e aceitam a repetição
explícita seguinte, permitindo validar erro, Analytics e recuperação reais. O
estado de tentativas é limpo pelo setup global entre testes.

## Sessão fictícia através da navegação OAuth

Para jornadas que atravessam documentos, o cookie exclusivamente fictício
`dall-fit-mock-session` aceita `unauthenticated`, `authenticated` ou `admin`.
Handlers de autenticação usam esse estado quando o seletor de request é ausente
ou `authenticated`; outros seletores explícitos preservam seus cenários existentes.
A preparação de Playwright define esse cookie no contexto, sem alterar componentes
ou requests de produção. O estado é isolado por contexto do navegador.

O middleware OAuth do Vite consulta `dall-fit-mock-login`: `admin` escolhe a pessoa
administradora, `oauth-failed` retorna a `/?authError=oauth_failed` sem autenticar,
e ausência/outro valor conclui como pessoa comum. Sucesso define a sessão fictícia,
limpa a revogação fictícia e continua respondendo `302 /dash`. A intenção é retomada
somente pelo Router real. Falha preserva a sessão fictícia anterior e a intenção
local válida; mudar o cookie de preparação permite testar nova tentativa.
`mockAuth` não é restaurado como parte do destino, evitando reintroduzir um seletor
permanente de anonimato depois de autenticar. Seletores de dados das rotas continuam
sendo usados somente com mocks habilitados.
