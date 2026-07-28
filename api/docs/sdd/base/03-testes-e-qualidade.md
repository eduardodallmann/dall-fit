# Testes e qualidade da API

## Ferramentas

- Vitest para testes unitários e E2E;
- SWC pelo `unplugin-swc` para preservar decorators e metadata do Nest;
- Supertest para chamadas HTTP em E2E;
- `mongodb-memory-server` para MongoDB efêmero nos E2E;
- `redis-memory-server` para Redis efêmero nos E2E;
- V8 para cobertura;
- ESLint type-aware com regras Node definidas na raiz.

`mongodb-memory-server` é usado pelos E2E do domínio `Person`. O ciclo de vida do
Redis efêmero continua sem setup enquanto nenhum adapter Redis participar de um
fluxo.

## Princípio de teste

Testes unitários e E2E existem prioritariamente para validar regras de negócio,
decisões, caminhos alternativos, falhas e efeitos observáveis. Cobertura de linhas
ajuda a localizar lacunas, mas não justifica por si só um teste.

Cada teste deve responder qual regra, cenário ou risco ele protege. Evitar testes
que apenas executem código trivial, repitam a implementação ou aumentem a métrica
sem validar comportamento relevante.

## Níveis de teste

Existem somente dois níveis no backend.

### Unitário

- usa `*.spec.ts` junto do código;
- não inicia Nest completo, MongoDB ou Redis;
- services e casos de uso substituem repositories, caches e integrações externas
  por mocks Vitest tipados;
- commands substituem services por mocks e cobrem toda decisão e orquestração do
  endpoint;
- controllers substituem commands quando o objetivo é validar somente transporte;
- cada teste configura retornos, erros e expectativas necessários ao cenário e
  restaura os mocks ao final;
- valida regras, decisões, argumentos enviados e tratamento de dependências.

Um unitário de service não usa repository in-memory nem adapter real. O comportamento
de persistência é validado pelos E2E.

### E2E

- usa `test/*.e2e-spec.ts`;
- inicia a aplicação Nest completa;
- usa Supertest na fronteira HTTP;
- usa adapters reais de MongoDB e Redis;
- inicia bancos efêmeros sem Docker;
- semeia somente os dados necessários ao cenário;
- valida status, payload e efeitos persistidos observáveis;
- encerra aplicação, clients e processos locais ao terminar.

Não criar pasta, config, script ou suíte `test:integration`. Casos que precisem
validar queries, índices, TTL ou wiring pertencem aos E2E.

E2E sempre executam de forma serial. A configuração usa `fileParallelism: false`
para limitar os arquivos a um worker e `maxConcurrency: 1` para impedir concorrência
dentro do arquivo. Testes ou suites não podem usar `test.concurrent` ou
`describe.concurrent`.

## Comandos locais

```bash
pnpm -C api test
pnpm -C api test:watch
pnpm -C api test:coverage
pnpm -C api test:coverage:ci
pnpm -C api test:e2e
pnpm -C api typecheck
```

Os gates completos são executados na raiz. Cobertura inclui todo código de produção
selecionado na configuração, inclusive arquivos ainda não importados pelos testes.
E2E são um gate comportamental próprio e não existem apenas para elevar cobertura.

## Regras e cenários esperados

Todo caso de uso cobre:

- caminho feliz;
- validações e limites;
- autorização quando aplicável;
- erros funcionais;
- falhas de dependências e política de recuperação;
- idempotência ou concorrência quando aplicável.

As regras e caminhos descritos no SDD do endpoint orientam a seleção dos testes.
Não excluir código testável apenas para elevar a métrica, nem criar teste sem regra
associada apenas para cobrir uma linha. Arquivos declarativos ou de bootstrap podem
ser excluídos quando o comportamento é coberto em nível superior.

Não verificar cada chamada do logger apenas para espelhar a implementação. Logs
recebem asserts quando forem requisito de auditoria, identificarem branch
operacional relevante, acionarem monitoramento ou protegerem redaction de dados
sensíveis. Sanitizadores e payloads com risco de vazamento devem ter testes
específicos. Seguir `06-logging-e-rastreabilidade.md`.

O ciclo de vida dos bancos, isolamento e fixtures segue
`04-mocks-e-bancos-de-teste.md`.
