# Testes integrados com Playwright

## Objetivo e limite

Playwright é o padrão para testes integrados comportamentais do frontend. Ele sobe
a aplicação real com Vite, abre o Chromium e interage com a interface pela mesma
fronteira disponível ao usuário.

Esses testes validam a aplicação frontend de ponta a ponta dentro do navegador:
renderização, integrações entre componentes, requests do cliente HTTP, estados
produzidos pelo MSW e navegação entre rotas. Como a API é simulada, eles não são
E2E do sistema completo. O comportamento real do backend permanece coberto pelos
E2E da API.

Playwright não substitui Vitest:

- Vitest, JSDOM e Testing Library cobrem unidades, componentes, hooks, validações e
  branches locais;
- Playwright cobre comportamento integrado observável em uma rota e jornadas que
  atravessam várias rotas;
- E2E da API cobrem transporte HTTP, wiring e infraestrutura reais do backend.

Os testes Playwright não geram cobertura V8, não alimentam o LCOV e não existem
para elevar percentual de linhas.

## Rede e MSW

Testes integrados do frontend nunca acessam a API real. O `webServer` do Playwright
inicia o Vite com:

```env
VITE_ENABLE_API_MOCKS=true
```

O bootstrap da UI deve aguardar o Service Worker do MSW antes do primeiro render.
Se o worker não iniciar, a aplicação apresenta o fallback global e não prossegue
para a API real. Falha desse bootstrap e adapters do ciclo PWA ficam em Vitest. O
Workbox permanece desabilitado nesse servidor Playwright; o lifecycle real usa o
comando isolado `pnpm test:pwa-update`, que serve dois builds consecutivos sem MSW
e abre duas abas Chromium na mesma origem.
O cliente HTTP, services, hooks e componentes usados em produção permanecem reais;
somente a resposta da fronteira de rede é interceptada.

A única exceção técnica é a navegação top-level de
`GET /api/auth/google`: service workers não interceptam essa navegação como uma
request Axios. O Vite, já controlado pelo `webServer` do Playwright e somente com
mocks habilitados, responde `302 /dash`. Não há `page.route`, acesso à API real ou
atalho no componente; a UI percorre a mesma URL top-level de produção.

Quando a UI possuir uma variável para a URL da API, a configuração Playwright
define um valor local e fictício compatível com os handlers. Tokens, API keys e
credenciais usados nos testes são exclusivamente locais e reconhecíveis como
fictícios.

Toda request precisa de handler explícito. O handler sentinela descrito em
`05-mocks-de-api.md` retorna `501 MOCK_NOT_IMPLEMENTED` para uma operação sem
cenário, impedindo acesso acidental ao backend.

Não usar `page.route`, mock do cliente HTTP ou substituição de módulos para simular
a API em testes integrados. Handlers e fixtures MSW são a fonte única dos cenários
de rede no desenvolvimento, no Vitest e no Playwright.

## Organização

A configuração executável está em
[`ui/playwright.config.ts`](../../../playwright.config.ts), e o setup compartilhado
está em [`ui/tests/setup.ts`](../../../tests/setup.ts). Não reproduzir esses
arquivos neste SDD.

- `tests/integration/routes/<flow>/<route>.spec.ts` valida uma rota isolada,
  iniciando diretamente pelo link reproduzível documentado nela;
- `tests/integration/flows/<flow>.spec.ts` valida a jornada entre rotas, incluindo
  avanço, retorno, bloqueios, decisões e dados preservados;
- `tests/integration/helpers/` contém somente preparação transversal, como montagem
  de URL e contexto fictício;
- helpers não escondem ações ou asserts que expressem regras do cenário.

Um flow da raiz pode descrever UI e API. Seu spec Playwright valida somente a
jornada observável no frontend com MSW. Os endpoints reais participantes são
validados separadamente pelos E2E da API e ambos aparecem na cobertura automatizada
do documento de flow.

O spec de flow não repete todos os estados já cobertos nos specs de rota. O caminho
feliz completo deve começar pela entrada documentada e atravessar as etapas reais
quando essa continuidade for o comportamento relevante. Cenários alternativos
podem começar no estado reproduzível mais próximo para manter isolamento e clareza.

## Relação com os cenários do SDD

Todo cenário relevante de `routes/` ou `flows/` recebe cobertura proporcional ao
risco:

- comportamento isolado ou puramente local fica no Vitest;
- interação real de usuário, integração entre partes da tela e navegação ficam no
  Playwright;
- contrato e infraestrutura reais do backend ficam nos E2E da API;
- cenário não automatizado registra a justificativa no documento vivo.

O título do teste Playwright deve manter o identificador e o nome do cenário
documentado:

```ts
test.describe('Rota profile', () => {
  test('Cenário 1 — Carregamento com sucesso', async ({ page }) => {
    await page.goto('/profile');

    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible();
  });
});
```

O exemplo de query só é válido quando ela pertencer ao contrato real da aplicação.
Não criar query, header ou parâmetro de produção apenas para selecionar mock.
Preferir path, query, body ou identificadores fictícios que já façam parte do
contrato. Quando isso não bastar, seguir o seletor exclusivo de desenvolvimento
definido em `05-mocks-de-api.md`.

Cada teste inicia seu próprio estado, não depende da ordem da suíte e não reutiliza
estado mutável deixado por outro teste.

### Mutações assíncronas críticas

Quando uma mutation possuir draft recuperável, efeito otimista, navegação protegida
ou concorrência entre partes da tela, Playwright cobre pelo menos o percurso
observável de maior risco descrito na rota ou no flow. O teste interage pelos
controles reais e comprova o estado da superfície durante pending, o resultado
terminal e a possibilidade de recuperação; toast isolado não é evidência de que a
operação terminou corretamente.

Falhas de rollback são exercitadas com uma mudança posterior ou um alvo não
relacionado presente, para provar que a reversão não restaura um snapshot amplo.
Respostas tardias são verificadas por seu efeito visível final, sem acessar estado
interno do React. Quando sair descartaria trabalho recuperável, o cenário cobre a
confirmação acessível e tanto permanecer quanto prosseguir quando essas decisões
fizerem parte do contrato.

Para aggregates versionados, não basta disparar duas ações enquanto a primeira
ainda está pendente. Um cenário de regressão também conclui a primeira operação,
espera a fila ficar ociosa e só então inicia a segunda, comprovando que a versão
resultante foi propagada. Remontagem com leitura atrasada, conflito e independência
entre aggregates entram no Playwright quando atravessarem componentes ou rotas;
a matriz restante permanece em Vitest conforme
`04-testes-e-qualidade.md`.

## Configuração

[`ui/playwright.config.ts`](../../../playwright.config.ts) é a fonte de verdade da
configuração. Ela mantém os seguintes invariantes:

- specs carregados de `tests/integration`;
- execução no Chromium;
- Vite real iniciado na porta exclusiva `3100`;
- MSW Browser habilitado e apontado para uma URL local fictícia;
- trace preservado na primeira repetição;
- servidor existente não reutilizado por padrão.

A porta `3100` é exclusiva dos testes integrados e evita colisão com o Vite usado
manualmente. Por padrão, não reutilizar servidor existente. A reutilização é
permitida apenas para depuração local explícita com
`PLAYWRIGHT_REUSE_SERVER=true`, depois de confirmar que o servidor da porta `3100`
foi iniciado com MSW habilitado.

Playwright pode executar arquivos em paralelo. Por isso, fixtures e seletores de
cenário não podem depender de memória global mutável, ordem ou dados compartilhados
entre testes. A regra de execução serial aplica-se somente aos E2E do backend.

## Scripts

[`ui/package.json`](../../../package.json) é a fonte de verdade dos comandos de
execução, depuração, interface interativa e instalação do Chromium.
[`package.json`](../../../../package.json) expõe o agregador
`test:integration` da raiz.

Esse nome não cria uma suíte intermediária no backend. A API continua possuindo
somente unitários e E2E.

## Como executar

Na primeira utilização da máquina, instalar o Chromium:

```bash
pnpm -C ui test:integration:install
```

Executar toda a suíte a partir da raiz:

```bash
pnpm test:integration
```

Executar diretamente no projeto da UI:

```bash
pnpm -C ui test:integration
```

Abrir a interface interativa ou o debugger:

```bash
pnpm -C ui test:integration:ui
pnpm -C ui test:integration:debug
```

Executar somente um spec ou cenário:

```bash
pnpm -C ui exec playwright test tests/integration/routes/<flow>/<route>.spec.ts
pnpm -C ui exec playwright test --grep 'Cenário 1'
```

Em CI, quando a imagem precisar também das dependências de sistema e oferecer
`sudo` não interativo:

```bash
pnpm -C ui test:integration:install:ci
pnpm test:integration
```

O CI executa testes unitários e cobertura antes da suíte integrada. Relatórios HTML,
traces e resultados ficam em `ui/playwright-report/` e `ui/test-results/` e não são
versionados.

## Critérios para um teste estável

- consultar elementos por role, nome, label ou texto acessível;
- interagir como o usuário, evitando acesso ao estado interno do React;
- esperar estados observáveis, nunca usar timeout fixo para sincronização;
- usar `delay(...)` no handler MSW para estados de loading;
- validar requests pelo navegador somente quando método, URL, headers ou payload
  forem parte do comportamento relevante;
- usar dados mínimos, fictícios e determinísticos;
- cobrir caminho feliz, branches, erros e navegação conforme risco;
- para sessão, cobrir expiração após mount, revogação de privilégio, recuperação
  CSRF sem reenvio automático e ausência de estado privado da geração anterior;
- não duplicar no Playwright toda combinação já protegida em nível unitário.

## Layout e screenshots

Playwright comportamental não exige screenshot. A validação visual continua
condicionada à existência de referências em
`routes/assets/<route-slug>/`, conforme
`06-referencias-visuais-de-layout.md`.

Quando houver regressão visual automatizada, suas golden images executáveis ficam
junto dos testes Playwright e não substituem as imagens curadas do SDD.

## Estado de adoção

Playwright cobre a jornada de login e a gestão administrativa de planos globais.
Nesta última, valida também URL e janela de paginação, permanência de overlays em
falha, propagação de versão entre adições consecutivas, drafts de autosave,
conflito de domínio, exclusão durante debounce, rollback de ordem, reordenação por
teclado e o `AlertDialog` que protege a saída.
Configuração, scripts, Chromium, MSW Browser, specs de rota/flow e ignores seguem
o contrato desta página.
