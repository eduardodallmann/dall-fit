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
`make`, compilador C e as ferramentas de build do sistema. A versão do binário é
fixada no [`package.json` da raiz](../../../../package.json), e o binário compilado
permanece no cache local do pacote.

O ambiente local e o CI precisam das ferramentas exigidas pelo pacote e devem
manter cache do resultado para não recompilar o Redis em toda instalação.

Não usar `ioredis-mock` ou implementação JavaScript equivalente nos E2E. Esses
pacotes são mocks adequados apenas a testes unitários e não garantem semântica real
de comandos, TTL, atomicidade ou locks.

## Uso em desenvolvimento local

Os mesmos pacotes de processos locais também sustentam `pnpm -C api dev:infra`, mas
o ciclo de vida de desenvolvimento não é compartilhado com os E2E:

- desenvolvimento usa portas fixas compatíveis com `api/.env.example`;
- os dados duram somente até o encerramento da sessão de desenvolvimento;
- reloads do Nest não reiniciam os bancos;
- E2E continuam criando instâncias próprias em portas temporárias, com isolamento e
  limpeza por cenário;
- um teste nunca reutiliza nem limpa os bancos iniciados por `dev:infra`.

O uso comum dos binários reduz pré-requisitos locais e preserva a regra de não
introduzir Docker, sem transformar os bancos de desenvolvimento em fixtures globais
dos testes.

## Ciclo de vida E2E

1. Iniciar MongoDB e Redis antes de compor o módulo Nest.
2. Configurar as URLs temporárias no módulo de configuração de teste.
3. Marcar explicitamente o runtime E2E antes do import dinâmico de `AppModule`;
   esse marcador só autoriza o bypass com `NODE_ENV=test`, flag própria e chave
   forte, inclusive quando o executor define `CI=true`.
4. Inicializar a aplicação e garantir a criação dos índices.
5. Antes de cada cenário, limpar documentos e executar `flushDb` no Redis dedicado.
6. Inserir fixtures mínimas para o cenário.
7. Executar requests com Supertest.
8. Validar resposta e efeitos persistidos.
9. Ao final, fechar aplicação, clients, MongoDB e Redis, mesmo se um teste falhar.

Os E2E não substituem repositories, models nem clients de infraestrutura. Apenas as
URLs e credenciais apontam para instâncias efêmeras.

## Fixtures e cenários

O E2E vigente de autenticação e `Person` está em
[`api/test/auth.e2e-spec.ts`](../../../test/auth.e2e-spec.ts). Seeds locais são
resolvidos por [`api/test/seeds/cli.ts`](../../../test/seeds/cli.ts). Esses arquivos,
e não uma árvore reproduzida no SDD, são a fonte de verdade da organização atual.

A readiness usa os mesmos processos e clients da aplicação. A suíte
[`api/test/operational.e2e-spec.ts`](../../../test/operational.e2e-spec.ts) cria
ambientes isolados, encerra apenas MongoDB ou apenas Redis e confirma o `503`
genérico sem compartilhar indisponibilidade com outras suítes.

Quando factories ou helpers compartilhados surgirem por reutilização real, devem
permanecer sob `api/test/`, próximos dos cenários consumidores e com nomes
orientados ao domínio.

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

E2E nunca executam em paralelo. A configuração executável e canônica está em
[`api/vitest.config.e2e.ts`](../../../vitest.config.e2e.ts) e garante execução
serial entre arquivos e dentro de cada arquivo. Também é proibido marcar testes ou
suites como `concurrent`.

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
- `mongodb-memory-server` e `redis-memory-server` estão instalados e atendem os E2E
  de autenticação, `Person` e planos globais com versões e lifecycle fixados.
