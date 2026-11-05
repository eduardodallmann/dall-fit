# Contratos compartilhados

## Objetivo

`packages/types` publica o pacote interno `@dall-fit/types`. Ele evita duplicação e
divergência em estruturas conhecidas pela API e pela UI.

## Conteúdo permitido

- contratos de request e response;
- entidades e value objects puramente estruturais;
- IDs, paginação e erros serializáveis;
- enums ou constantes de domínio usados pelos dois projetos.

## Conteúdo proibido

- DTO exclusivo de transporte interno do backend;
- props, eventos ou tipos exclusivos de componentes React;
- serviços, validações com efeito colateral ou acesso a ambiente;
- modelos de banco de dados ou detalhes do ORM;
- respostas especulativas para endpoints ainda inexistentes.

## Convenções

1. O backend é o proprietário do contrato HTTP, mas qualquer alteração consumida
   pela UI atualiza `@dall-fit/types` na mesma mudança.
2. Tipos representam o payload serializado, não classes com decorators do Nest.
3. Datas atravessam HTTP como strings e devem indicar a semântica no tipo concreto.
4. Alterações incompatíveis exigem migração coordenada entre produtores e
   consumidores e, quando não forem locais e reversíveis, um ADR.
5. Exportações públicas são feitas apenas por `packages/types/src/index.ts`.
6. Usar `import type` quando não houver valor em runtime.

## Consumo

```ts
import type { ApiResponse, Entity } from '@dall-fit/types';
```

O barrel público contém somente contratos, entidades e valores com consumidores
vigentes no monorepo. Tipos auxiliares ou enums sem consumidor não são mantidos
como pontos de extensão hipotéticos.

## Contratos vigentes de autenticação

- `Person` é a representação pública compartilhada da pessoa autenticada. Contém
  `id`, `name`, `email`, `photoUrl`, `createdAt`, `updatedAt`, o objeto obrigatório
  `configs` e pode conter
  `isAdmin: true`. A ausência de `isAdmin` representa uma pessoa não
  administradora; o contrato não materializa `false`.
- `Theme` aceita somente `light | dark`. `PersonConfigs.theme` é opcional e sua
  ausência representa uma pessoa sem preferência explícita; a API nunca inventa
  um valor a partir do sistema operacional.
- `UpdateCurrentPersonConfigsRequest` aceita somente `theme`, e
  `UpdateCurrentPersonConfigsResponse` devolve a `Person` pública atualizada.
- `CurrentPersonResponse` envolve `Person` em `ApiResponse`.
- `CsrfTokenResponse` envolve o token anti-CSRF da sessão em `ApiResponse`; a UI
  o conserva somente em memória.
- `CreateNativeSessionRequest` contém somente o Google ID token obtido pelo cliente
  Android. `CreateNativeSessionResponse` devolve `tokenType: 'Bearer'`, o
  `accessToken`, sua expiração ISO e a mesma `Person` pública usada pela Web. Claims,
  `jti`, canal Redis e token Google permanecem internos da API.
- o identificador Google, documentos MongoDB, cookies e payloads de sessão são
  detalhes exclusivos da API e não pertencem ao pacote.
- `photoUrl` é anulável porque o claim de foto do provedor não é garantido.

## Contrato transversal de erro

`ApiError` é obrigatório em toda resposta de erro da API e contém sempre
`code`, `message`, `details` e `requestId`. `details` é um objeto não anulável,
mesmo quando vazio; `requestId` é o mesmo valor devolvido no header
`x-request-id`. Consumidores tomam decisões por status e `code`, nunca por
`message`, `details` ou pelo identificador de correlação.

## Contratos vigentes de planos de treino

`RealtimeResourceInvalidation` é o contrato transversal do evento SSE
`resource-invalidated`. Ele identifica `resource`, `resourceId` e `state`;
`present` inclui a versão canônica e `deleted` não inclui versão. Origem,
audiência, identidade e conteúdo permanecem internos da API.

- `TrainingPlanSummary` expõe ID, nome, descrição, `version` inteira a partir de
  zero e timestamps, sem ownership ou workouts.
- `TrainingPlanDetails` acrescenta resumos de workouts com ID, nome e
  `exerciseCount`, sem o array de exercícios.
- requests de criação exigem nome/descrição; requests de edição são parciais.
- a coleção global usa `CollectionResponse<TrainingPlanSummary>` e as respostas de
  item usam `ApiResponse`.
- `TrainingPlanWorkoutDetails` representa uma leitura projetada do editor com
  plano pai mínimo, timestamps, versão e exercícios na ordem persistida.
- `BodyArea`/`BODY_AREAS` definem os 16 locais aceitos. `Exercise` é uma union
  discriminada por `type` entre `youtube-short`, `image`, `youtube-long`, `pause`
  e `duration`; campos alheios ao discriminador não existem e somente
  `ImageExercise.image` aceita `null`.
- `DurationExercise` exige minutos e pode transportar instrução curta e ID de
  vídeo demonstrativo. Ambos são opcionais para manter compatibilidade com os
  exercícios por duração já existentes.
- requests do editor cobrem nome do treino, criação por tipo, PATCH parcial do
  exercício, ordem final completa e imagem. Respostas de mutação expõem o recurso
  público; leituras e sucessos que preservam o aggregate transportam a versão
  canônica no header `X-Resource-Version`.
- `ExerciseImage` publica `thumbnailUrl`, `displayUrl` e
  `signedUrlExpiresAt`. As duas URLs são capacidades privadas temporárias para
  leitura do mesmo ciclo de quinze minutos; não são identificadores estáveis nem
  podem ser persistidas pelo consumidor.
- `ownerPersonId`, documentos Mongoose, keys/dimensões internas do Blob e o
  original da imagem são exclusivos da API.

O pacote é compilado por `pnpm install` e novamente antes dos comandos agregadores
da raiz. Sua saída de runtime é CommonJS para ser compatível com a API NestJS,
que é emitida como CommonJS; a API e a UI devem consumir somente as exportações
públicas do pacote. Como o pnpm vincula o pacote à UI como dependência local, o
Vite o inclui explicitamente no pré-empacotamento de dependências para converter
suas exportações de runtime em ESM no servidor de desenvolvimento; o build de
produção faz a mesma interoperabilidade durante o bundling. Durante
desenvolvimento, execute
`pnpm -C packages/types build` após mudar uma exportação pública caso o consumidor
esteja sendo iniciado isoladamente.

## Checklist de alteração

- [ ] O tipo é realmente compartilhado por API e UI
- [ ] O nome descreve o domínio, não uma implementação
- [ ] Request, response e códigos de erro continuam coerentes com o endpoint
- [ ] Produtor e consumidores foram atualizados atomicamente
- [ ] Testes e documentação de endpoint/rota/fluxo foram atualizados
- [ ] Typecheck, testes, cobertura e build passaram

## Planos pessoais e clonagem

`ExerciseLibraryQuery` combina página, busca por nome e área opcional. A coleção
`ExerciseLibraryResponse` contém até 20 `ExerciseLibraryItem`, cada um com grupo,
referência de plano/workout/exercício global, versão da origem e `Exercise`
hidratado. A identidade do grupo é independente de mídia e URL assinada.
`CopyExercisesRequest` contém somente seleções ordenadas, sem conteúdo ou owner;
`CopyExercisesResponse` devolve o array criado. O header transporta a versão do
destino, enquanto cada seleção transporta a versão da origem. API e UI validam
limite com base no conjunto inteiro, incluindo itens ocultos pelos filtros.
Contratos e cenários proprietários estão no
[endpoint de biblioteca](../../../api/docs/sdd/endpoints/exercise-library.md).

O catálogo pessoal usa a união discriminada `PersonalTrainingPlanListItem`:

- `itemType: training-plan` identifica uma entrada `owned` ou
  `global-reference`, inclui `catalogEntryId` e o checkbox booleano `active`; a
  coleção informa `activeCount` para aplicar o limite global de cinco mesmo com
  paginação;
- `itemType: clone-job` identifica somente uma operação ainda visível, com
  estado, geração e progresso de imagens; não é um plano navegável;
- resumos e detalhes globais incluem `GlobalTrainingPlanUsage`, com pessoas
  vinculadas e pessoas que mantêm a referência ativa;
- a biblioteca global expõe previews limitados e os flags `referenced` e
  `cloneBlocked` sem entregar árvores completas.

O bridge API→Workflow tem envelope v1 mínimo, composto exclusivamente por
`cloneJobId` e `generation`. Snapshot, pessoa e conteúdo nunca atravessam esse
request; o Workflow os lê no MongoDB.

## Execução de treino

- `TrainingOverview` publica `availablePlans`, o plano temporariamente escolhido,
  cards de workout e uma coleção `offlinePreparations`, com validade e IDs de
  workout independentes por plano ativo. Com vários ativos e sem
  `catalogEntryId`, `plan` é nulo e os workouts ficam vazios; uma sessão em
  andamento continua soberana pelo snapshot mesmo após desativação.
- `TrainingWorkoutPreview` publica os cinco tipos de exercício e acrescenta
  `lastLoadsKg` aos exercícios de séries. Cada posição é inteiro de 0 a 9999 ou
  `null`; ausência de carga é um valor válido, não um erro. Imagem também publica
  `offlineMediaId`, hash opaco e estável do asset `display`, sem capacidade de
  acesso ao Blob.
- `TrainingSession` é o snapshot público versionado. Expõe timestamps ISO,
  exercício/séries concluídos e no máximo um `TrainingTimer`; detalhes de chave,
  TTL e mídia privada persistida permanecem exclusivos da API.
- mutations de carga e conclusão usam `TrainingLoadRequest` ou
  `CompleteRemainingTrainingSeriesRequest`; conclusão não obriga carga.

## Dashboard

- `DashboardResponse` envolve `Dashboard`, que publica `generatedAt`, próxima ação,
  sete dias da semana civil, totais dos últimos 30 dias, oito semanas de tendência
  e até cinco conclusões recentes da pessoa autenticada.
- `DashboardNextAction` é discriminada em `select-plan`,
  `choose-training-plan`, `start-workout` e `resume-workout`; vários ativos não
  elegem um deles e produzem `choose-training-plan`.
- `AdminDashboardResponse` envolve somente agregados de pessoas, treino e planos,
  oito buckets com pessoas ativas distintas e até cinco modelos globais com
  contagens. Não existe entidade ou ID de pessoa nessa estrutura.
- Datas civis de dashboard usam `YYYY-MM-DD`; `generatedAt`, `completedAt` e demais
  instantes continuam strings ISO 8601. Duração permanece em segundos e
  percentuais já chegam como inteiros.
- `WorkoutExecutionSummary` é o resultado durável com métricas, áreas treinadas e
  os sete dias da semana calculados no timezone informado na finalização.
- respostas seguem `ApiResponse`; mutations de sessão devolvem a versão também no
  header `X-Resource-Version`.
- `PutOfflineTrainingSnapshotV1Request` publica o envelope estrito do snapshot
  Android: identidade da instalação, fence, execução, revisão, timestamp cliente
  e `OfflineTrainingSnapshotV1`, discriminado em `in-progress`, `completed` ou
  `cancelled`. A árvore bruta captura plano, workouts, workout executado,
  exercícios/séries e timer sem totais derivados, pessoa, validade, mídia ou
  capacidades temporárias. A resolução opcional leva a escolha explícita
  `local | server` e o token do conflito observado.
- `AndroidAppCompatibilityResponse` publica `platform: 'android'`, o
  `minimumVersionCode`, a constante positiva `ANDROID_SYNC_CONTRACT_VERSION` e a
  URL HTTPS oficial da listagem. `AppUpdateRequiredDetails` repete somente o
  mínimo, o contrato aceito e a URL pública quando o sync é recusado. O transporte
  envia `X-App-Version-Code` e `X-Sync-Contract-Version`; esses headers negociam
  compatibilidade e não substituem autenticação, lease ou validação do snapshot.
- `RegisterOfflineTrainingLeaseRequest` contém somente o UUID v4 da instalação.
  `OfflineTrainingLeaseResponse` publica fence, vencimento e o estado `created |
  unchanged | taken-over`; a concessão pertence à pessoa e instalação, não a um
  plano singular. Pessoa e instalação não retornam.
- `OfflineTrainingSnapshotResult` diferencia aceite, duplicata, conclusão,
  cancelamento e resolução local/servidor; identifica o estado do snapshot e
  devolve os metadados server-side aplicáveis. Conclusão inclui o mesmo
  `WorkoutExecutionSummary` da jornada online.
- Conflitos comparáveis usam `OfflineTrainingSnapshotConflictDetails` com a versão
  completa segura do servidor e escolha `local-or-server`. Execuções já terminais
  são imutáveis e retornam somente `discard-local-only`, estado terminal e o
  resumo canônico quando houver. O token é opaco e só vale enquanto a versão
  observada continuar corrente.

## Assistente de planos de treino

- `TrainingPlanAssistantSession` é a projeção pública retomável. Expõe estado,
  versão, histórico, pergunta/respostas rápidas, resultado público da triagem,
  preview e timestamps ISO; answers estruturados, materialização, provider e
  chaves de operação nunca atravessam HTTP.
- `TrainingPlanAssistantStatus` limita a UI a `collecting`, `clarifying`, `ready`,
  `generating`, `preview` ou `blocked`; `completed` é uma transição interna antes
  da exclusão e não pertence ao contrato público.
- `TrainingPlanAssistantDraft` publica apenas a estrutura revisável já resolvida
  contra o catálogo: plano, workouts, duração estimada e exercícios tipados. Os
  itens podem ser exercícios por séries ou atividades por duração; uma atividade
  por duração pode incluir instrução curta e vídeo demonstrativo opcional.
- create/message/draft usam requests próprios. Mensagem leva
  `clientMessageId`; draft leva ajuste opcional; versão e chave idempotente
  permanecem headers HTTP.
- `TrainingPlanAssistantConfirmationResponse` devolve somente
  `catalogEntryId` e `trainingPlanId`. A entrada nasce `owned`, inativa e não
  contém referência a provider, prompt ou resposta de saúde.

## Termos versionados

[`packages/types/src/terms.ts`](../../../packages/types/src/terms.ts), exportado pelo
index público, define `TermsFields`, `TermsDocument`, `TermsSummary`, `TermsList`,
`TermsPublication`, `TermsReference`, `TermsAcceptance`, `TermsAccess`, `CurrentTerms`,
`AcceptedTerms` e os requests de criar/publicar/aceitar. Revisão técnica de rascunho
e número jurídico publicado são distintos. `TermsAccess` é union discriminada
`accepted | required | not-configured`; somente `accepted` contém recibo próprio,
com os dois literais `true`, hash e referência correspondentes.

`RealtimeResourceInvalidation` admite `resource=terms`, ID, `state=present` e número
da publicação em `version`, sem HTML, contato ou recibo. O evento acelera refetch,
mas não é comprovante de concordância. Detalhes de autorização, status, campos e
limites estão nos [endpoints de termos](../../../api/docs/sdd/endpoints/terms.md).
