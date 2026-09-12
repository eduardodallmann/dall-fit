# AGENTS Instructions

## Fonte de verdade

Antes de alterar código, configuração, contratos, testes ou comportamento:

1. Leia `docs/sdd/README.md` e todos os documentos em `docs/sdd/base/`.
2. Leia os ADRs, features e fluxos afetados em `docs/sdd/`.
3. Se a mudança afetar a API, leia `api/docs/sdd/README.md`,
   `api/docs/sdd/base/` e os documentos de `api/docs/sdd/endpoints/` afetados.
4. Se a mudança afetar a UI, leia `ui/docs/sdd/README.md`,
   `ui/docs/sdd/base/` e os documentos de `ui/docs/sdd/routes/` afetados.

Os documentos vivos do SDD descrevem o comportamento e as decisões vigentes. Não
implemente uma solução que os contradiga. Quando a demanda mudar a verdade atual,
atualize-os na mesma mudança. Features de demandas já entregues são registros
históricos e não
devem ser interpretadas como a verdade vigente.

Ao planejar ou implementar uma mudança que use ou configure dependências, siga
`docs/sdd/base/05-documentacao-oficial-das-tecnologias.md`: confirme as versões
instaladas, consulte seletivamente as fontes oficiais das tecnologias afetadas e
valide a API contra os tipos e o código locais. Documentação externa não substitui
nem prevalece sobre o SDD.

## Roteamento por escopo

- decisões de workspace, arquitetura transversal, contratos compartilhados,
  features históricas e jornadas ponta a ponta pertencem a `docs/sdd/`;
- comportamento HTTP e arquitetura exclusiva do backend pertencem a
  `api/docs/sdd/`;
- comportamento de tela e arquitetura exclusiva do frontend pertencem a
  `ui/docs/sdd/`;
- não duplique detalhes locais no SDD da raiz: referencie o documento proprietário.

## Features e documentação viva

- toda demanda ou atividade com escopo e critérios de aceite próprios cria uma
  feature em `docs/sdd/features/` antes da implementação, mesmo quando afeta
  somente um projeto;
- features não registram status, ciclo de vida ou datas de conclusão;
- a feature pode ser refinada somente durante a fase de especificação;
- depois que a demanda for entregue, nunca edite, renomeie, mova ou remova sua
  feature; uma correção ou evolução cria outra feature e referencia a anterior
  quando útil;
- fluxos ponta a ponta vivem em `docs/sdd/flows/`;
- toda alteração observável de endpoint atualiza
  `api/docs/sdd/endpoints/`;
- toda alteração de comportamento, estado, navegação, validação ou integração de
  uma tela atualiza `ui/docs/sdd/routes/`;
- screenshots de layout são complementos opcionais: se
  `ui/docs/sdd/routes/assets/<route-slug>/` contiver imagens, inspecione-as e valide
  exclusivamente o layout conforme
  `ui/docs/sdd/base/06-referencias-visuais-de-layout.md`; se a pasta não existir ou
  estiver vazia, não exija, gere nem valide screenshots;
- decisões transversais difíceis de reverter são registradas em `docs/sdd/adr/`;
- use os templates do nível proprietário;
- documentos em `base/`, `flows/`, `endpoints/` e `routes/` descrevem somente o
  estado atual, não um histórico de tickets.

## Bugfixes diretos (quando solicitados sem feature SDD)

- correções de bug, ajustes de comportamento ou refatorações, e que expressamente
solicitados que não exigem sem feature SDD **devem atualizar a documentação viva afetada na mesma entrega**;
- não há pausa para autorização: implemente a correção, atualize os SDDs vivos
  (endpoints, routes, flows, ADRs se aplicável) e execute os quality gates;
- a regra de "não altere features históricas" continua valendo: features em
  `docs/sdd/features/` são registros imutáveis após entrega.

## Gate obrigatório entre feature e implementação

Criar, escrever, documentar, detalhar, revisar ou refinar uma feature autoriza
somente a fase de especificação:

1. antes de escrever o arquivo, identifique as decisões ainda pendentes e conduza
   com o usuário o questionário ramificado definido em
   `docs/sdd/base/04-governanca-do-sdd.md`; não repita certezas, aceite de duas a N
   opções ou uma única confirmação, reabra uma certeza se um ramo posterior mudar
   sua premissa e informe `decisão X de Y` quando houver estimativa útil, ajustando
   o total conforme os ramos; se nada estiver pendente, não faça perguntas;
2. crie ou altere apenas o arquivo autocontido em `docs/sdd/features/`, usando o
   template da raiz;
3. não altere código, configuração, contratos executáveis, mocks ou testes;
4. não atualize `base/`, ADRs, flows, endpoints ou routes para descrever um
   comportamento que ainda não foi implementado;
5. encerre o turno após apresentar a feature e aguarde a validação do usuário.

A implementação só pode começar após uma mensagem posterior e explícita do usuário,
como `implemente a feature <arquivo>` ou `pode iniciar a implementação da feature
<arquivo>`. A autorização precisa ocorrer depois que a feature tiver sido
apresentada; mencionar implementação no pedido inicial de criação da feature não
remove a pausa obrigatória.

Depois da autorização, trate a feature validada como contrato: implemente código,
configuração, contratos, mocks e testes e atualize os SDDs vivos afetados na mesma
entrega, sem alterar silenciosamente a feature. Se a implementação exigir mudança
de escopo ou decisão registrada nela, pare, retorne à fase de especificação e
aguarde nova validação e nova ordem de implementação.

Quando o usuário disser explicitamente para não criar feature, não crie uma. Essa
exceção é comum em ajustes estruturantes dos SDDs base; nesse caso, execute somente
o escopo solicitado, que pode ser `docs-only` ou incluir implementação conforme a
ordem explícita.

## Regras do monorepo

- execute comandos agregadores a partir da raiz;
- ESLint e Prettier têm configuração única na raiz;
- API e UI não importam arquivos internos uma da outra;
- imports internos da API e da UI usam `~/*`, sempre resolvido para o `src/` do
  próprio projeto;
- imports compartilhados usam pacotes públicos `@dall-fit/*`; não use alias
  genérico `@/*` nem caminhos internos de outro projeto;
- contratos TypeScript usados pelos dois projetos vivem em `@dall-fit/types`;
- exportações compartilhadas são feitas por `packages/types/src/index.ts`;
- atualize produtor, consumidores, testes e SDD atomicamente ao mudar um contrato.

## Design system da UI

- consulte `ui/docs/sdd/base/03-componentes-e-estilizacao.md` e o catálogo oficial
  do HeroUI antes de construir ou alterar uma tela;
- use componentes existentes de `@heroui/react` antes de criar equivalentes
  locais e preserve sua semântica, composição e acessibilidade;
- componentes próprios e reutilizáveis vivem em `ui/src/core/components/`;
  componentes exclusivos ficam na rota proprietária;
- componentes visuais próprios separam composição em `index.tsx` e funções de
  apresentação em `styles.ts`;
- não escreva classes Tailwind literais, `tv` ou estilos inline no JSX de
  composição; `styles.ts` concentra classes e variantes, e `index.tsx` aplica
  somente os resultados tipados dessas funções em `className`;
- use `tv`, `VariantProps` e funções de variantes de `@heroui/styles`; não adicione
  dependência direta de `tailwind-variants`;
- para confirmar APIs atuais, consulte os arquivos oficiais
  `https://heroui.com/react/llms.txt`, `llms-components.txt` e
  `llms-patterns.txt` depois de ler o SDD.

## Arquitetura da UI

- TanStack Router usa árvore manual tipada em `ui/src/routes/routes.tsx`; não use
  roteamento baseado em arquivos;
- estado de servidor usa TanStack Query pelo `QueryClientProvider` global;
- formulários usam TanStack Form e composição tipada;
- requests usam uma única instância Axios baseada em `VITE_API_URL`; componentes
  não usam `fetch` nem criam clients paralelos;
- a UI local usa a porta `3000` e a API local usa a porta `4000`;
- siga `ui/docs/sdd/base/01-arquitetura.md` para providers, navegação, formulários,
  ambiente e integrações.

## Arquitetura da API

- o controller valida a entrada, registra log seguro, chama o command e devolve seu
  resultado;
- o command orquestra todo o endpoint, executa decisões, chama services, prepara
  seus contratos e monta a response;
- services possuem assuntos próprios, executam regras ou cálculos e encapsulam
  acesso a repository, Redis, serviço externo ou mensageria;
- repositories são acessados somente por services e recebem entidades, objetos ou
  arrays já preparados; nunca recebem ou constroem DTO HTTP;
- commands e controllers nunca acessam repositories diretamente;
- todo método de controller, command, service, repository ou adapter registra
  entrada, conclusão de etapas relevantes, retornos de dependências, branches
  escolhidos e saída conforme
  `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
- logs usam `NomeDaClasse -> nomeDoMetodo -> etapa:` e objetos estruturados sempre
  sanitizados; nunca use `console.*` nem registre segredo, dado pessoal, payload
  grande ou binário;
- métodos de classe nunca retornam diretamente uma expressão: atribuem o resultado,
  registram a representação sanitizada e então retornam o valor original;
- a documentação de endpoint explica humanamente toda essa hierarquia e todos os
  caminhos, referenciando símbolos e arquivos sem copiar o código;
- cada cenário de endpoint começa com um seed executável ou `não se aplica`
  justificado e um cURL completo que reproduz exatamente o caminho, conforme
  `api/docs/sdd/base/05-seeds-e-curls-de-cenario.md`.

## Testes e mocks

- a UI usa MSW na fronteira HTTP; toda request nova ou alterada exige handlers e
  fixtures conforme `ui/docs/sdd/base/05-mocks-de-api.md`;
- integrados da UI usam Playwright com Vite real, Chromium e MSW Browser; specs de
  rota ficam em `ui/tests/integration/routes/` e specs de flow em
  `ui/tests/integration/flows/`, conforme
  `ui/docs/sdd/base/07-testes-integrados-playwright.md`;
- Playwright nunca acessa a API real e não substitui os E2E do backend;
- unitários de services da API substituem repositories, caches e integrações
  externas por mocks Vitest;
- E2E da API usam Nest e adapters reais apontados para MongoDB e Redis efêmeros com
  `mongodb-memory-server` e `redis-memory-server`;
- testes unitários e integrados priorizam regras de negócio, não cobertura de
  linhas;
- E2E da API nunca executam em paralelo;
- não crie suíte, pasta ou comando `test:integration` no backend; esse nome é
  reservado aos integrados Playwright da UI;
- não introduza Docker na infraestrutura de testes;
- fixtures nunca contêm credenciais, tokens ou dados pessoais reais.

## Quality gates

Ao final de toda implementação, revise `api/` e `ui/` e remova componentes,
wrappers, hooks, funções, métodos, classes, helpers, imports, exports e arquivos
que tenham ficado sem uso. Confirme antes os usos indiretos por framework,
decorators, injeção de dependência, configuração, carregamento dinâmico ou API
pública; lint e typecheck não substituem essa inspeção.

Para mudanças em código, configuração, contratos executáveis, mocks, testes ou
comportamento observável, execute e aprove:

- `pnpm lint`
- `pnpm test`
- `pnpm test:coverage:ci`
- `pnpm build`

Mudanças de endpoint, wiring, MongoDB ou Redis executam também:

- `pnpm -C api test:e2e`

Depois da adoção do Playwright, mudanças em cenários integrados de rota ou flow
executam também:

- `pnpm test:integration`

Alterações exclusivamente em Markdown não exigem os gates de código. Nesse caso,
registre no resumo que os testes não foram executados por se tratar de uma mudança
`docs-only`.
