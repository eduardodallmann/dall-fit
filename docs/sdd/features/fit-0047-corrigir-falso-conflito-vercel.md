# Feature Spec: Corrigir falso conflito de versão na Vercel

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0047`](https://github.com/eduardodallmann/dall-fit/issues/47).
- Problema: as mutações de planos de treino usam o header HTTP padrão `If-Match`
  como token de versão do aggregate. Em produção, a camada CDN/proxy da Vercel
  também avalia esse header e pode devolver `412 PRECONDITION_FAILED` fora da
  aplicação. No caso diagnosticado, o Nest validou a versão `7`, o MongoDB
  confirmou o CAS e incrementou o aggregate para `8`, mas a UI recebeu `412`,
  interpretou sucesso persistido como conflito e pausou a fila de gravações.
- Resultado: toda mutação de plano existente transporta a versão esperada por um
  header de domínio que não possui semântica condicional para a infraestrutura; a
  API continua executando CAS atômico, devolve a versão resultante explicitamente
  e reserva `412 TRAINING_PLAN_VERSION_CONFLICT` para conflitos reais, sem falso
  negativo depois de um write confirmado.
- Evidências do diagnóstico:
  - o log de produção registra `expectedVersion: 7`, estado atual `version: 7`,
    `updated: true` e retorno `version: 8` no mesmo `requestId`;
  - `GET /health` sem precondição responde `200`, enquanto o mesmo GET com
    `If-Match` divergente recebe resposta textual `412` com
    `x-vercel-error: PRECONDITION_FAILED`, sem `ApiError` ou `x-request-id` da API;
  - o E2E local do Nest responde corretamente porque não inclui a camada Vercel.
- Referências locais:
  - `docs/sdd/features/fit-0028-editor-exercicios-escalabilidade-concorrencia.md`;
  - `docs/sdd/adr/ADR-0005-limites-concorrencia-e-midia-dos-planos.md`;
  - `docs/sdd/base/03-contratos-compartilhados.md`;
  - `docs/sdd/flows/gestao-planos-treino-globais.md`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/base/02-endpoints-e-contratos.md`;
  - `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
  - `api/docs/sdd/endpoints/global-training-plans.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/05-mocks-de-api.md`;
  - `ui/docs/sdd/routes/global-training-plan.md`;
  - `ui/docs/sdd/routes/global-training-plan-detail.md`;
  - `ui/docs/sdd/routes/global-training-plan-workout.md`.
- Referências oficiais consultadas:
  - [RFC 9110, seção 13.1.1 — `If-Match`](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-match),
    que vincula a precondição à representação selecionada pelo URI alvo e exige
    sua avaliação antes da execução do método;
  - [RFC 9110, seção 13.2 — avaliação de precondições](https://www.rfc-editor.org/rfc/rfc9110.html#name-evaluation-of-preconditions);
  - [Vercel — funcionamento do CDN](https://vercel.com/docs/how-vercel-cdn-works),
    que confirma a passagem de toda request pela infraestrutura antes da Function;
  - [Vercel — CDN Cache](https://vercel.com/docs/caching/cdn-cache), para separar
    controle de cache da precondição de domínio.
- Features relacionadas:
  - `FIT-0028` introduziu a versão do aggregate, o ETag, o `If-Match`, o CAS e a
    fila FIFO; esta correção substitui somente o transporte HTTP da versão e
    preserva as regras de concorrência e recuperação;
  - `FIT-0027` define o `ApiError` e a correlação por `requestId`, que precisam
    continuar presentes nos conflitos gerados pela aplicação.

## Escopo

### Incluído

- substituir `If-Match` por `X-Resource-Version` nas onze operações que
  alteram um plano global existente;
- definir `X-Resource-Version` como inteiro decimal canônico e não negativo,
  transportando a versão esperada na request e a versão resultante na response;
- remover o ETag do contrato de concorrência do aggregate e impedir que a UI envie
  `If-Match` nas operações de planos;
- preservar o campo `version` nas representações JSON que já o possuem;
- preservar o CAS atômico, o incremento único, os no-ops idempotentes, os limites,
  a distinção de recursos ausentes e os códigos de erro atuais;
- manter `428 PRECONDITION_REQUIRED` para header ausente, `400 VALIDATION_ERROR`
  para versão malformada e `412 TRAINING_PLAN_VERSION_CONFLICT` para versão
  obsoleta de recurso existente;
- fazer a UI pausar a fila somente quando status e código identificarem um conflito
  real da API;
- atualizar CORS, services HTTP da UI, handlers e fixtures MSW, testes unitários,
  E2E da API e Playwright;
- acrescentar cobertura que diferencie o `ApiError` de domínio de uma resposta
  `412` externa ou malformada;
- validar o caminho feliz em deployment Vercel depois dos gates locais;
- criar um ADR que substitua a parte de concorrência HTTP da `ADR-0005`, sem
  reescrever a feature histórica `FIT-0028`;
- atualizar todos os SDDs vivos que atualmente descrevem ETag/`If-Match` como
  transporte da versão.

### Não incluído

- alterar a modelagem embutida de `TrainingPlan`, `Workout` ou `Exercise`;
- mudar o algoritmo de CAS, a granularidade top-level da versão ou o schema
  Mongoose;
- criar versão individual para workout ou exercício;
- retry automático, merge de drafts ou resolução automática de conflitos;
- mudar os limites de workouts, exercícios, BSON, rate limit ou upload;
- alterar contratos funcionais de criação, edição, exclusão, ordem ou mídia além do
  transporte da versão;
- introduzir Redis, lock distribuído, transação ou fila externa no domínio de
  planos;
- configurar cache CDN para dados autenticados como solução do falso conflito;
- manter suporte permanente ao `If-Match` legado;
- editar a feature histórica `FIT-0028` ou a `ADR-0005` depois de entregues.

## Projetos e documentação afetados

- API e endpoints:
  - substituir o parser de `If-Match` por um parser proprietário de
    `X-Resource-Version` e aplicar o mesmo contrato em todos os controllers de
    mutação do aggregate;
  - centralizar a escrita do header de versão resultante, inclusive em `204` e
    no-ops;
  - atualizar o CORS para permitir e expor `X-Resource-Version`, removendo
    `If-Match` e `ETag` da superfície de concorrência;
  - preservar controller → command → service → repository e a sanitização dos
    logs;
  - atualizar `api/docs/sdd/base/01-arquitetura.md` e
    `api/docs/sdd/endpoints/global-training-plans.md`, inclusive todos os cURLs.
- UI e rotas:
  - atualizar o service central de planos para enviar a versão numérica no novo
    header e ler a versão resultante do mesmo header;
  - preservar a fila FIFO e os drafts, mas exigir `status === 412` e
    `code === TRAINING_PLAN_VERSION_CONFLICT` antes de pausá-la;
  - atualizar os documentos das rotas de lista, detalhe e workout e
    `ui/docs/sdd/base/01-arquitetura.md`.
- Fluxos:
  - atualizar `docs/sdd/flows/gestao-planos-treino-globais.md` para descrever o
    header de domínio e a identificação estrita de conflito.
- Contratos em `@dall-fit/types`:
  - nenhum campo de request/response JSON muda;
  - `ApiError` e os campos `version` existentes permanecem inalterados;
  - não criar tipo compartilhado apenas para um nome de header HTTP interno aos
    adapters de API/UI.
- Decisões arquiteturais:
  - criar novo ADR que substitua exclusivamente a decisão de usar ETag/`If-Match`
    como transporte cross-URI do token do aggregate na `ADR-0005`;
  - manter vigentes as demais decisões da `ADR-0005` sobre limites, CAS, mídia e
    storage.
- Handlers e fixtures MSW:
  - validar `X-Resource-Version`, devolver o mesmo header com a versão
    resultante e rejeitar ausência, formato inválido e versão obsoleta como a API;
  - assegurar que nenhuma mutation mockada aceite silenciosamente `If-Match` como
    substituto.
- Mocks de repositories/caches nos unitários da API:
  - repositories mockados continuam recebendo `expectedVersion: number`; não há
    mudança em suas interfaces nem nos mocks de MongoDB, Blob ou YouTube;
  - Redis não se aplica ao transporte da versão.
- Fixtures MongoDB/Redis nos E2E:
  - reutilizar as fixtures de planos com versões determinísticas;
  - MongoDB e Redis efêmeros permanecem reais nos E2E, sem nova infraestrutura.

## Contrato pretendido

### Header de versão

- Nome canônico: `X-Resource-Version`.
- Request: obrigatório em toda mutação de plano existente e contém somente a
  versão atualmente conhecida, por exemplo `X-Resource-Version: 7`.
- Response: toda leitura de item e toda mutation bem-sucedida que conserva o
  aggregate devolve sua versão vigente no mesmo header, inclusive responses `204`
  e no-ops.
- Formato válido: `0` ou inteiro decimal sem sinal e sem zeros à esquerda, dentro
  do intervalo de inteiro seguro aceito pela aplicação.
- Header ausente responde `428 PRECONDITION_REQUIRED` com mensagem atualizada para
  mencionar `X-Resource-Version`.
- Valor repetido, combinado, vazio, negativo, decimal, exponencial, com espaços
  internos, zeros à esquerda, acima do inteiro seguro ou contendo outro token
  responde `400 VALIDATION_ERROR` antes do command.
- Versão válida mas obsoleta de um plano/workout/exercício existente responde
  `412 TRAINING_PLAN_VERSION_CONFLICT`, sem write nem incremento.
- O header não incorpora o ID do plano porque o target já é validado pelos params e
  o CAS inclui o `trainingPlanId`; a versão continua pertencendo ao aggregate.
- A aplicação deixa de produzir ETag canônico do aggregate e a UI deixa de expor,
  ler ou enviar ETag como token de concorrência.

### Fila e conflitos

- A fila injeta em cada operação a última versão confirmada pelo header de response.
- Sucesso atualiza a versão local antes de liberar a próxima operação.
- Resposta `412` só pausa a fila quando o body é um `ApiError` com
  `code: TRAINING_PLAN_VERSION_CONFLICT`.
- Um `412` textual, sem body, com `HTTP_ERROR`, com `x-vercel-error` ou com qualquer
  outro formato encerra apenas a operação atual como falha técnica; não declara
  conflito nem oferece descarte de drafts como se o servidor tivesse rejeitado o
  CAS.
- Não há retry automático em nenhum dos dois casos.

## Requisitos funcionais

1. Uma mutation com a versão vigente deve executar exatamente um write efetivo,
   incrementar a versão uma vez e devolver sucesso com a versão resultante.
2. A mutation seguinte na mesma fila deve usar a versão devolvida pela anterior.
3. No-op documentado deve devolver a versão vigente sem incrementar aggregate ou
   timestamps.
4. Uma versão realmente obsoleta deve ser rejeitada antes de qualquer alteração e
   manter a resposta estável `412 TRAINING_PLAN_VERSION_CONFLICT`.
5. O cliente deve preservar drafts e pausar a fila somente no conflito real.
6. Falha técnica externa com status `412` deve preservar o tratamento normal de
   erro da operação sem converter o estado do editor em conflito.
7. Todas as mutações de plano, workout, exercício, ordem e imagem devem obedecer ao
   mesmo contrato, sem exceção por método ou status de sucesso.
8. Requests de criação de um novo plano continuam sem versão porque o aggregate
   ainda não existe.

## Requisitos não funcionais

- Acessibilidade: alertas, confirmação de recarga, estados de saving e anúncios do
  editor permanecem inalterados; nenhum novo controle visual é necessário.
- Performance: não acrescentar leitura de aggregate, round trip, retry ou acesso a
  Redis; parsing do header permanece síncrono e constante.
- Segurança e privacidade:
  - o novo header contém somente versão numérica, sem ID, nome, URL ou dado pessoal;
  - CORS continua restrito à origem configurada e permite somente os headers
    necessários;
  - responses autenticadas não passam a ser cacheadas como parte desta correção;
  - fixtures e smoke tests nunca usam credenciais ou dados pessoais reais.
- Observabilidade:
  - logs de controller/command/service/repository continuam correlacionados por
    `requestId` e registram somente versão e identificadores já sanitizados;
  - conflito de domínio permanece observável dentro do Nest;
  - a validação em Vercel deve conferir ausência de `x-vercel-error` no sucesso e
    presença de `x-request-id` da API.

## Critérios de aceite

### Cenário 1 — mutation vigente retorna sucesso

- Forma de validar: cenário vivo de edição de workout/exercício em
  `api/docs/sdd/endpoints/global-training-plans.md`, com seed e cURL atualizados.
- Given: aggregate global existente na versão `7`.
- When: envia PATCH válido com `X-Resource-Version: 7`.
- Then: recebe `200`, `ApiResponse` canônico e `X-Resource-Version: 8`; o MongoDB
  contém a alteração uma vez e versão `8`.

### Cenário 2 — fila encadeia a versão resultante

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin`.
- Given: duas alterações estão enfileiradas no mesmo aggregate.
- When: a primeira response confirma a próxima versão.
- Then: a segunda request usa o novo valor de `X-Resource-Version`, ambas têm
  sucesso e a fila não pausa.

### Cenário 3 — conflito real permanece protegido

- Forma de validar: cenário vivo de conflito em
  `api/docs/sdd/endpoints/global-training-plans.md`, com seed e cURL atualizados.
- Given: aggregate existente em versão superior à versão enviada.
- When: mutation usa um `X-Resource-Version` válido e obsoleto.
- Then: recebe `412 TRAINING_PLAN_VERSION_CONFLICT` no formato `ApiError`, com
  `x-request-id`, sem alteração, incremento ou retry.

### Cenário 4 — precondição ausente ou inválida

- Forma de validar: cenário vivo de precondição em
  `api/docs/sdd/endpoints/global-training-plans.md`, com seed e cURL atualizados.
- Given: aggregate existente.
- When: omite o header ou envia cada classe inválida documentada.
- Then: ausência recebe `428 PRECONDITION_REQUIRED`, formato inválido recebe
  `400 VALIDATION_ERROR` e nenhum command/write é executado.

### Cenário 5 — resposta 412 alheia ao domínio

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=update-exercise-error`.
- Given: MSW devolve `412` sem `code: TRAINING_PLAN_VERSION_CONFLICT`, simulando
  uma resposta de infraestrutura.
- When: o autosave falha.
- Then: a operação anuncia falha e preserva o draft, mas a fila não entra no estado
  de conflito nem oferece recarga destrutiva.

### Cenário 6 — contrato CORS

- Forma de validar: E2E de preflight da API; seed não se aplica porque OPTIONS não
  acessa domínio nem persistência.
- Given: origem permitida solicita uma mutation.
- When: preflight informa `X-Resource-Version`.
- Then: a API permite e expõe o novo header, não anuncia `If-Match` como parte do
  contrato de planos e mantém origem, credentials e métodos vigentes.

### Cenário 7 — smoke em Vercel

- Forma de validar: deployment Vercel da API e UI com conta administrativa e
  aggregate controlado para teste; o write deve ser uma edição intencional e
  reversível, nunca uma repetição automática do request de produção diagnosticado.
- Given: UI carregou a versão vigente do aggregate.
- When: uma alteração de exercício é salva pela aplicação publicada.
- Then: o browser recebe sucesso com `X-Resource-Version`, `x-request-id` e sem
  `x-vercel-error`; a UI confirma o estado e mantém a fila ativa.

## Estratégia de entrega e compatibilidade

1. Implementar e validar API, UI, MSW, testes e SDDs atomicamente no repositório.
2. Publicar a API antes da UI. A UI antiga já está sujeita ao falso `412`; não há
   caminho confiável de compatibilidade para `If-Match` através da Vercel.
3. A nova API exige somente `X-Resource-Version`; não aceitar ambos os headers
   nem escolher precedência entre eles.
4. Publicar a UI imediatamente depois e executar o smoke controlado.
5. Não existe migração de MongoDB, Redis, Blob ou dados: a versão persistida e o CAS
   continuam iguais.
6. Rollback coordenado de API e UI é possível sem migração de dados, mas restaura o
   defeito de produção e não é considerado estado operacional aceitável.

## Plano de testes

- Unitários da API:
  - parsing de zero, inteiros canônicos e limites seguros;
  - ausência, repetição/combinação e cada classe de formato inválido;
  - escrita e exposição da versão resultante nos controllers;
  - preservação dos branches de conflito e ausência nos services.
- E2E da API, serial com MongoDB e Redis efêmeros:
  - todas as mutations enviam o novo header;
  - sucesso, `204`, no-op, conflito real, ausência e formato inválido;
  - preflight permite/expõe o novo header;
  - nenhuma mutation depende de `If-Match`.
- Unitários da UI:
  - service envia e lê `X-Resource-Version` em JSON, DELETE, PUT e multipart;
  - fila avança versão depois de sucesso;
  - somente `412 + TRAINING_PLAN_VERSION_CONFLICT` pausa a fila;
  - `412` externo/malformado segue como falha técnica sem pausa.
- MSW:
  - handlers validam o novo header e devolvem versão coerente;
  - sentinela impede requests sem handler;
  - estado isolado preserva sucesso e conflito real.
- Playwright:
  - autosave consecutivo usa versões crescentes;
  - conflito real preserva drafts e permite recarga confirmada;
  - falha técnica não apresenta conflito.
- Deployment:
  - smoke controlado confirma sucesso através da camada Vercel e diferencia os
    headers da API dos headers de erro da plataforma.
- Quality gates:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`.

## Riscos e decisões

- Decisão: usar header de domínio em vez de tentar desativar condicionalmente o
  comportamento da Vercel. Motivo: a concorrência pertence ao aggregate e cruza
  URIs diferentes, enquanto `If-Match` possui semântica sobre a representação do
  URI alvo; configuração de cache não oferece garantia equivalente ao CAS local.
- Decisão: usar o mesmo header para request e response. Isso elimina parsing de
  ETag pela UI e cobre responses `204` sem alterar bodies JSON.
- Decisão: nomear o header `X-Resource-Version`, sem referência a training plan.
  O transporte pode ser reutilizado por outros recursos versionados, enquanto cada
  endpoint continua responsável por definir a granularidade e a semântica de sua
  própria versão.
- Decisão: remover suporte legado em vez de aceitar dois mecanismos. Dois tokens
  permitiriam divergência e `If-Match` continuaria sujeito à avaliação antes de a
  request alcançar a aplicação.
- Risco: janela de deploy entre API e UI. Mitigação: API primeiro, UI em seguida e
  smoke imediato; o comportamento anterior já está defeituoso em produção.
- Risco: esquecer uma das onze mutations ou um handler MSW. Mitigação: helper
  central de request/response, busca final por `If-Match`/ETag no código vigente e
  E2E representativo de cada método e tipo de body.
- Risco: tratar qualquer `412` como conflito no futuro. Mitigação: decisão explícita
  e testes exigindo simultaneamente status e código estável.
- Risco: ETag automático do Express continuar aparecendo como validator de payload.
  Ele não pode ser usado pela UI como versão do aggregate nem ser exposto no CORS;
  a implementação deve remover somente o ETag canônico proprietário e confirmar
  que nenhum consumidor depende de um ETag automático.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Quality gates da raiz aprovados
