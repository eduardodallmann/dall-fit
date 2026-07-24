# Mocks e bancos de teste

## Objetivo

Definir uma estratégia sem Docker para testes unitários e E2E, mantendo velocidade
nas regras isoladas e fidelidade na fronteira HTTP completa.

## Unitários de services

Services e casos de uso recebem repositories e caches por injeção de dependência.
O teste fornece objetos mockados com Vitest:

```ts
const userRepository = {
  findById: vi.fn(),
  save: vi.fn(),
};
```

O mock deve satisfazer a port consumida pelo service. Preferir tipos explícitos ou
`satisfies` para que uma mudança na interface quebre o teste no typecheck.

Cada cenário:

1. configura os retornos ou erros das dependências;
2. executa o service;
3. valida resultado ou erro;
4. valida chamadas relevantes e seus argumentos;
5. restaura os mocks.

Não repetir a implementação do repository dentro do mock. Um teste unitário valida
a reação do service ao contrato da dependência, não MongoDB, Redis ou o driver.

## E2E com MongoDB

`mongodb-memory-server` inicia um processo `mongod` real e retorna uma URI temporária.
O pacote é uma dependência de desenvolvimento da API e seu build script está
autorizado no workspace.
Usar:

- `MongoMemoryServer` para CRUD, queries e índices comuns;
- `MongoMemoryReplSet` com `wiredTiger` quando o comportamento usar transações ou
  change streams.

A versão do MongoDB deve ser fixada. O download do binário deve usar diretório de
cache conhecido no CI para evitar downloads em toda execução.

## E2E com Redis

`redis-memory-server` inicia um processo `redis-server` real em porta livre. Os E2E
usam o mesmo client e adapter usados em produção.
O pacote é uma dependência de desenvolvimento da API e seu build script está
autorizado no workspace. Seu `postinstall` baixa e compila o binário, exigindo
`make`, compilador C e as ferramentas de build do sistema. A versão `8.8.1` está
fixada em `redisMemoryServer.version` no `package.json` da raiz, e o binário
compilado permanece no cache local do pacote.

O ambiente local e o CI precisam das ferramentas exigidas pelo pacote e devem
manter cache do resultado para não recompilar o Redis em toda instalação.

Não usar `ioredis-mock` ou implementação JavaScript equivalente nos E2E. Esses
pacotes são mocks adequados apenas a testes unitários e não garantem semântica real
de comandos, TTL, atomicidade ou locks.

## Ciclo de vida E2E

1. Iniciar MongoDB e Redis antes de compor o módulo Nest.
2. Configurar as URLs temporárias no módulo de configuração de teste.
3. Inicializar a aplicação e garantir a criação dos índices.
4. Antes de cada cenário, limpar documentos e executar `flushDb` no Redis dedicado.
5. Inserir fixtures mínimas para o cenário.
6. Executar requests com Supertest.
7. Validar resposta e efeitos persistidos.
8. Ao final, fechar aplicação, clients, MongoDB e Redis, mesmo se um teste falhar.

Os E2E não substituem repositories, models nem clients de infraestrutura. Apenas as
URLs e credenciais apontam para instâncias efêmeras.

## Fixtures e cenários

Factories criam documentos válidos com defaults seguros e permitem overrides
explícitos:

```text
test/
├── fixtures/
│   ├── users.ts
│   └── sessions.ts
├── setup/
│   ├── mongodb.ts
│   └── redis.ts
└── app.e2e-spec.ts
```

Fixtures:

- não contêm dados pessoais, tokens ou credenciais reais;
- representam somente estados necessários;
- são determinísticas;
- não dependem da ordem de execução;
- não formam um dump global compartilhado por todos os testes.

Seeds reproduzíveis documentados nos endpoints podem reutilizar essas factories,
mas continuam idempotentes e independentes. Convenções de comando, segurança e
cURL estão em `05-seeds-e-curls-de-cenario.md`.

## Isolamento e execução serial

E2E nunca executam em paralelo. `vitest.config.e2e.ts` mantém
`fileParallelism: false`, o que limita a execução a um worker, e
`maxConcurrency: 1`, que impede concorrência dentro do arquivo. Também é proibido
marcar testes ou suites como `concurrent`.

A execução serial é uma decisão de confiabilidade, mesmo que databases e namespaces
pudessem ser isolados. Ela garante ordem previsível de setup, limpeza, seeds,
efeitos de MongoDB/Redis e teardown dos processos locais.

Não usar `dropDatabase` indiscriminadamente quando o cenário precisar validar
índices. Preferir limpar as collections preservando a estrutura criada pela
aplicação.

## Limites

- Docker não é requisito e não deve ser introduzido por essa estratégia.
- Não existe suíte `test:integration`.
- Unitários nunca iniciam bancos.
- E2E sempre usam adapters reais quando MongoDB ou Redis participarem do fluxo.
- E2E nunca executam em paralelo.
- `mongodb-memory-server` e `redis-memory-server` já estão instalados; setups,
  versões fixadas dos binários e lifecycle hooks entram com o primeiro E2E que
  usar cada banco.
