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
- a feature pode ser refinada enquanto orienta a implementação;
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

## Regras do monorepo

- execute comandos agregadores a partir da raiz;
- ESLint e Prettier têm configuração única na raiz;
- API e UI não importam arquivos internos uma da outra;
- contratos TypeScript usados pelos dois projetos vivem em `@dall-fit/types`;
- exportações compartilhadas são feitas por `packages/types/src/index.ts`;
- atualize produtor, consumidores, testes e SDD atomicamente ao mudar um contrato.

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
