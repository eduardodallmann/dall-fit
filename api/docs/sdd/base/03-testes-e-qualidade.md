# Testes e qualidade da API

## Ferramentas

- Vitest para testes unitários e E2E;
- SWC pelo `unplugin-swc` para preservar decorators e metadata do Nest;
- Supertest para chamadas HTTP em E2E;
- `mongodb-memory-server` para MongoDB efêmero nos E2E;
- `redis-memory-server` para Redis efêmero nos E2E;
- V8 para cobertura;
- ESLint type-aware com regras Node definidas na raiz.

O `tsconfig.json` da API compila produção, testes, seeds e scripts com
`strict: true`, sem desabilitar verificações da família estrita. A verificação
adicional `noFallthroughCasesInSwitch` permanece ativa explicitamente, e o ESLint
rejeita `any` explícito pela configuração type-aware transversal.

`mongodb-memory-server` e `redis-memory-server` são usados pelos E2E de
autenticação, pessoa, planos globais e probes operacionais. As suítes exercitam os
adapters reais, inclusive a indisponibilidade isolada de cada dependência na
readiness, e controlam integralmente o lifecycle dos dois processos efêmeros.

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

### Bootstrap do artefato de produção

`pnpm -C api test:e2e` recompila a API antes de executar a suíte. Além dos cenários
que importam TypeScript pelo SWC, inclui
[`compiled-bootstrap.e2e-spec.ts`](../../../test/compiled-bootstrap.e2e-spec.ts),
que executa `dist/src/main.js` diretamente em outro processo Node, sem Vitest,
SWC ou loader TypeScript dentro desse processo.

O cenário reproduz o `ERR_REQUIRE_ESM` quando `require(esm)` está desabilitado e
valida a inicialização habilitando explicitamente `--experimental-require-module`
em `NODE_OPTIONS` no subprocesso, conforme o requisito de runtime descrito em
[`01-arquitetura.md`](01-arquitetura.md#runtime-e-build-de-produção). O teste não
depende de arquivo de configuração de deploy nem consulta o painel da Vercel;
a configuração do ambiente publicado continua sendo uma responsabilidade
operacional. MongoDB e Redis são efêmeros e reais; o processo recebe somente
ambiente de teste explícito e um diretório temporário vazio para não carregar o
`.env` local. Liveness e readiness respondem `200`, e `/auth/me` sem sessão responde
`401 AUTHENTICATION_REQUIRED`, com correlação. O teardown encerra aplicação,
bancos e diretório temporário mesmo após falha.

Esse smoke protege formato de módulo, resolução de imports, assets e bootstrap
do build. Ele não substitui a validação de um novo deployment na Vercel nem afirma
emular seu loader proprietário.

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
