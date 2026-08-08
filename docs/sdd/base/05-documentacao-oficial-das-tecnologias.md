# Documentação oficial das tecnologias

## Objetivo

Agentes de IA e pessoas que planejam ou implementam mudanças devem confirmar APIs,
configurações e padrões nas fontes oficiais das tecnologias afetadas. Esse cuidado
reduz sugestões baseadas em versões antigas, mistura entre bibliotecas parecidas e
uso de APIs inexistentes.

Arquivos como `llms.txt` são índices de documentação preparados para consumo por
agentes. Eles facilitam a descoberta das páginas relevantes, mas não são instruções
específicas do Dall Fit nem substituem a leitura seletiva da documentação indicada.

## Ordem de autoridade

Quando as fontes divergirem, seguir esta ordem:

1. SDD e instruções vigentes do repositório;
2. versões instaladas nos `package.json`, lockfile, tipos e código local;
3. documentação oficial compatível com a versão instalada;
4. release notes, migrations e código-fonte oficial da dependência;
5. fontes de terceiros, somente quando as fontes oficiais forem insuficientes e
   com essa limitação declarada.

Uma possibilidade apresentada pela documentação externa não autoriza contrariar a
arquitetura, os contratos, os testes ou o design system registrados no SDD. A
documentação do fornecedor explica o que a tecnologia permite; o SDD decide como o
projeto a utiliza.

## Consulta durante o planejamento

Antes de consolidar uma solução que use ou configure uma dependência:

1. identificar as tecnologias realmente afetadas, sem consultar todo o catálogo;
2. confirmar o pacote e a versão nos manifests e no lockfile;
3. abrir o índice oficial otimizado para IA, quando existir, e selecionar somente
   as páginas pertinentes à decisão;
4. verificar compatibilidade, migrations e mudanças de API quando a documentação
   representar uma versão diferente da instalada;
5. confrontar a alternativa com o SDD proprietário e com os padrões já existentes
   no código;
6. registrar na especificação ou no plano as decisões resultantes da consulta, não
   uma cópia extensa da documentação externa.

Quando não houver formato específico para IA, usar a documentação oficial comum.
Não inventar um endpoint `llms.txt`, não tratar uma página HTML ou um redirect como
índice válido e não preferir agregadores não oficiais apenas por serem mais fáceis
de consumir.

## Consulta durante a implementação

Ao escrever ou revisar o código:

- reabrir a página oficial da API concreta que será usada, principalmente para
  assinaturas, opções, composição, ciclo de vida e comportamento de erro;
- validar a resposta da documentação contra os tipos e o código da versão
  instalada, que são a confirmação final da API disponível localmente;
- consultar migrations e release notes antes de adaptar exemplos de outra major;
- preservar as restrições locais mesmo quando o exemplo oficial adotar outra
  arquitetura;
- validar o resultado com typecheck, testes e demais quality gates aplicáveis.

Não baixar nem versionar cópias integrais da documentação de terceiros. Os links
permanecem externos para receber correções do mantenedor e evitar conteúdo local
desatualizado ou sem contexto de licença.

## Fontes oficiais otimizadas para IA

### Transversais e testes

| Tecnologia | Fonte oficial                                                                                                             | Consultar quando                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Vitest     | [`llms.txt`](https://vitest.dev/llms.txt) e [Writing Tests with AI](https://vitest.dev/guide/learn/writing-tests-with-ai) | Configuração, mocks, execução, cobertura e escrita de testes unitários ou E2E da API  |
| Prettier   | [`llms.txt`](https://prettier.io/llms.txt)                                                                                | Configuração, plugin de imports, integração com ESLint ou comportamento de formatação |

### API e dados

| Tecnologia | Fonte oficial                                       | Consultar quando                                                                               |
| ---------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Mongoose   | [`llms.txt`](https://mongoosejs.com/llms.txt)       | Schemas, models, queries, índices, middleware, validação, timestamps e integração TypeScript   |
| MongoDB    | [`llms.txt`](https://www.mongodb.com/docs/llms.txt) | Semântica do banco, operadores, índices, atomicidade, transações e compatibilidade do servidor |
| Redis      | [`llms.txt`](https://redis.io/llms.txt)             | Comandos, tipos de dados, TTL, atomicidade, locks, persistência e compatibilidade do servidor  |
| Zod        | [`llms.txt`](https://zod.dev/llms.txt)              | Schemas, parsing, refinements, transformação e inferência de tipos                             |

Mongoose é a fonte primária para o código de persistência porque a API não consome
o MongoDB Node.js Driver diretamente. O
[`llms.txt` do driver](https://www.mongodb.com/docs/drivers/node/current/llms.txt)
é complementar apenas quando o comportamento investigado estiver abaixo da
abstração do Mongoose; ele não autoriza introduzir acesso direto ao driver.

O índice do Redis descreve a semântica do servidor. A API concreta do client
continua sendo confirmada no repositório oficial do ioredis, referenciado abaixo;
uma fonte não substitui a outra.

### UI

| Tecnologia      | Fonte oficial                                                                                                                                                                              | Consultar quando                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React           | [`llms.txt`](https://react.dev/llms.txt)                                                                                                                                                   | Componentes, hooks, efeitos, renderização e APIs do React                                                                                                    |
| Vite            | [`llms.txt`](https://vite.dev/llms.txt)                                                                                                                                                    | Configuração, plugins, ambiente, build, desenvolvimento e assets                                                                                             |
| TanStack Router | [`llms.txt`](https://tanstack.com/router/latest/llms.txt)                                                                                                                                  | Declaração manual da árvore, contexto, loaders, navegação e tipagem de rotas                                                                                 |
| TanStack Query  | [`llms.txt`](https://tanstack.com/query/latest/llms.txt)                                                                                                                                   | Queries, mutations, cache, invalidação e atualizações otimistas                                                                                              |
| TanStack Form   | [`llms.txt`](https://tanstack.com/form/latest/llms.txt)                                                                                                                                    | Composição tipada, campos, validação, submissão e estado do formulário                                                                                       |
| HeroUI          | [`llms.txt`](https://heroui.com/react/llms.txt), [`llms-components.txt`](https://heroui.com/react/llms-components.txt) e [`llms-patterns.txt`](https://heroui.com/react/llms-patterns.txt) | Componentes, composição, acessibilidade e padrões visuais, sempre junto das [regras locais da UI](../../../ui/docs/sdd/base/03-componentes-e-estilizacao.md) |
| Vite PWA        | [`llms.txt`](https://vite-pwa-org.netlify.app/llms.txt)                                                                                                                                    | Manifest, registro, atualização, precache, Workbox e integração com Vite                                                                                     |
| Lucide          | [`llms.txt`](https://lucide.dev/llms.txt)                                                                                                                                                  | API React, imports, acessibilidade, tamanho, stroke e limitações dos ícones                                                                                  |
| Fontsource      | [`llms.txt`](https://fontsource.org/llms.txt)                                                                                                                                              | Pacotes de fontes, imports, variable fonts, subsets e carregamento local                                                                                     |

## Fontes oficiais sem índice `llms.txt` adotado

Ausência de índice otimizado não reduz a obrigação de consulta. Para as tecnologias
abaixo, usar a documentação oficial comum ou o recurso específico para agentes
indicado na tabela.

| Tecnologia          | Fonte oficial                                                                                                                                                                            | Observação                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NestJS              | [Documentação](https://docs.nestjs.com/)                                                                                                                                                 | O path usual `/llms.txt` não entrega um índice textual válido; consultar as páginas de controllers, providers, módulos, testing e técnicas afetadas                    |
| TypeScript          | [Documentação](https://www.typescriptlang.org/docs/)                                                                                                                                     | Confirmar `tsconfig`, resolução de módulos, tipos e comportamento da versão instalada                                                                                  |
| pnpm                | [Documentação](https://pnpm.io/)                                                                                                                                                         | Consultar para workspaces, lockfile, scripts e instalação                                                                                                              |
| ESLint              | [Documentação](https://eslint.org/docs/latest/)                                                                                                                                          | Consultar para flat config, regras, plugins e migrações                                                                                                                |
| Tailwind CSS        | [Documentação](https://tailwindcss.com/docs)                                                                                                                                             | As regras locais de HeroUI e `styles.ts` continuam prevalecendo sobre exemplos genéricos                                                                               |
| Axios               | [Documentação](https://axios.rest/)                                                                                                                                                      | Consultar para configuração da instância, interceptors, erros e requests; componentes continuam proibidos de criar clients próprios                                    |
| MSW                 | [Documentação](https://mswjs.io/docs/)                                                                                                                                                   | Consultar handlers, lifecycle e APIs de browser/Node sem contrariar a fronteira HTTP definida no SDD da UI                                                             |
| Testing Library     | [Documentação](https://testing-library.com/docs/)                                                                                                                                        | Consultar queries acessíveis, `user-event` e matchers orientados ao comportamento                                                                                      |
| Playwright          | [Documentação de testes](https://playwright.dev/docs/intro) e [Test Agents](https://playwright.dev/docs/test-agents)                                                                     | A página de agentes é uma fonte oficial específica para IA, mas não autoriza gerar novos arquivos de instrução nem substituir a estratégia Playwright + MSW do projeto |
| ioredis             | [Repositório oficial](https://github.com/redis/ioredis)                                                                                                                                  | Consultar comandos, conexões, erros e comportamento do client Redis                                                                                                    |
| Google Auth Library | [Referência Node.js](https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest) e [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) | Consultar autenticação, validação de token e OAuth/OIDC com atenção especial à segurança                                                                               |
| Workbox             | [Documentação](https://developer.chrome.com/docs/workbox/)                                                                                                                               | Complementa Vite PWA quando a mudança alcançar estratégias ou APIs próprias do service worker gerado                                                                   |

Bibliotecas pequenas ou auxiliares não precisam de uma entrada permanente somente
porque oferecem documentação consumível por IA. Ao afetar uma delas, localizar sua
fonte oficial no planejamento e adicionar ao catálogo apenas quando ela passar a
orientar decisões recorrentes do projeto.

## Manutenção do catálogo

Ao adicionar uma dependência central, atualizar sua major ou alterar sua
responsabilidade arquitetural:

1. verificar se o mantenedor publica `llms.txt`, documentação em Markdown,
   instruções de agente ou apenas documentação convencional;
2. validar o conteúdo retornado, não apenas o status HTTP ou o nome do path;
3. registrar somente fontes oficiais e diretamente relacionadas ao pacote usado;
4. atualizar este catálogo se a consulta for recorrente ou relevante para decisões;
5. manter detalhes exclusivos da API ou da UI no SDD proprietário e referenciá-los
   daqui, sem duplicação.
