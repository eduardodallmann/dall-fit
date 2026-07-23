# ADR-0001: Estratégia de mocks e bancos de teste

- Status: `aceita`
- Data: `2026-07-23`
- Responsáveis: time Dall Fit

## Contexto

O monorepo precisa permitir desenvolvimento do frontend sem disponibilidade da API
e validar o backend em dois níveis: regras isoladas e comportamento HTTP completo.
MongoDB será o banco NoSQL e Redis armazenará dados temporários.

A estratégia deve funcionar sem Docker e evitar uma camada de testes de integração
entre os testes unitários e os E2E.

## Alternativas consideradas

### Mocks somente no nível dos repositories

Mantém os testes rápidos, mas não valida controllers, módulos, serialização, queries,
índices, TTL nem a integração real com MongoDB e Redis.

### Suíte intermediária `test:integration`

Testaria adapters isoladamente contra bancos locais. Foi rejeitada para reduzir
níveis, comandos e manutenção. A validação de infraestrutura será exercitada pelos
E2E.

### Bancos em containers Docker

Forneceria isolamento e proximidade com produção, mas introduziria Docker como
pré-requisito local e de CI. Foi rejeitada para este projeto.

### Emuladores JavaScript de MongoDB e Redis

Seriam simples de iniciar, porém poderiam divergir em comandos, índices, TTL,
atomicidade e comportamento de rede. Foram rejeitados nos E2E.

## Decisão

### Frontend

O frontend usa Mock Service Worker (MSW) na fronteira HTTP:

- no desenvolvimento, o Service Worker simula a API no navegador;
- nos testes Vitest, o servidor Node do MSW reutiliza os mesmos handlers;
- nos testes integrados Playwright, a aplicação real roda no Chromium e o Service
  Worker reutiliza os mesmos handlers sem acessar o backend;
- handlers e fixtures são organizados por operação e cenário;
- componentes, hooks e serviços continuam usando o cliente HTTP real da aplicação.

Specs Playwright de rota validam uma tela isolada. Specs de flow validam a jornada
entre telas. Essa suíte é E2E dentro do frontend, mas não substitui os E2E da API.

### Backend unitário

Testes unitários usam Vitest. Ao testar services ou casos de uso:

- repositories, caches e integrações externas são substituídos por mocks;
- não se inicia MongoDB nem Redis;
- o teste valida regra, orquestração, argumentos e tratamento de retornos e erros;
- commands substituem services quando o objetivo for testar orquestração;
- controllers podem substituir commands quando o objetivo for testar apenas o
  transporte.

### Backend E2E

Testes E2E iniciam a aplicação Nest completa e usam:

- `mongodb-memory-server` para iniciar um processo MongoDB efêmero;
- `redis-memory-server` para iniciar um processo Redis efêmero;
- Supertest para exercer a fronteira HTTP;
- dados mínimos semeados para cada cenário.

Essas bibliotecas iniciam binários locais reais sem Docker. Os E2E não substituem
repositories nem o cliente Redis: usam os adapters de produção apontados para URLs
temporárias.

No backend, não haverá script, pasta ou suíte `test:integration`.

## Consequências

### Positivas

- unitários continuam rápidos e determinísticos;
- E2E validam wiring, transporte, persistência, índices e Redis em conjunto;
- frontend desenvolve e testa cenários sem depender do backend;
- Playwright valida rotas e jornadas no navegador com a mesma camada MSW usada no
  desenvolvimento;
- não há dependência de Docker;
- a estratégia possui apenas dois níveis no backend.

### Negativas e riscos

- a primeira execução pode baixar binários de MongoDB e Redis;
- `redis-memory-server` pode exigir toolchain local para compilar o Redis;
- versões dos binários precisam ser fixadas e armazenadas em cache no CI;
- processos devem ser sempre encerrados, inclusive após falha;
- E2E serão mais lentos que testes unitários e sempre executarão de forma serial.

## Plano de adoção

1. Configurar MSW junto da primeira integração HTTP da UI.
2. Configurar Playwright junto do primeiro cenário integrado de rota ou flow.
3. Introduzir ports de repository e cache junto dos primeiros services da API.
4. Adicionar `mongodb-memory-server` e `redis-memory-server` junto dos adapters de
   MongoDB e Redis.
5. Configurar setup e teardown globais e execução serial dos E2E.
6. Fixar versões dos binários e cacheá-los no CI.
7. Autorizar scripts de instalação no `pnpm-workspace.yaml` somente para pacotes que
   efetivamente precisarem baixar ou compilar binários.

Até essas integrações existirem, a decisão permanece normativa, mas não exige
dependências sem uso no workspace.

## Links relacionados

- `../../../api/docs/sdd/base/03-testes-e-qualidade.md`
- `../../../api/docs/sdd/base/04-mocks-e-bancos-de-teste.md`
- `../../../ui/docs/sdd/base/04-testes-e-qualidade.md`
- `../../../ui/docs/sdd/base/05-mocks-de-api.md`
- `../../../ui/docs/sdd/base/07-testes-integrados-playwright.md`
