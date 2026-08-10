# Feature Spec: Editor administrativo de exercícios com persistência escalável e concorrente

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Tickets:
  - [`FIT-0028`](https://github.com/eduardodallmann/dall-fit/issues/28), ticket
    principal desta feature;
  - [`FIT-0017`](https://github.com/eduardodallmann/dall-fit/issues/17), absorvido
    integralmente por esta feature e não implementado separadamente.
- Problema: a rota administrativa de workout ainda é somente um stub e o array de
  exercícios permanece como `Mixed[]`. O sistema não oferece editor, contratos ou
  integrações de mídia para exercícios e também não possui limites explícitos de
  crescimento, controle de concorrência, ordenação estável, política de índices ou
  consultas adequadas para o crescimento do aggregate embutido.
- Resultado: uma pessoa administradora abre um workout global, edita seu nome e
  mantém uma lista ordenável de cinco tipos de exercício, com autosave por linha,
  imagens processadas no backend e validação real de referências do YouTube. A API
  persiste subdocumentos discriminados e tipados, protege todas as mutações com
  precondição de versão, aplica limites de domínio mensuráveis e mantém consultas,
  índices e escritas proporcionais ao dado necessário.
- Referências locais:
  - `docs/sdd/features/fit-0005-gestao-planos-treino-globais.md`;
  - `docs/sdd/adr/ADR-0003-modelagem-dos-planos-de-treino.md`;
  - `docs/sdd/flows/gestao-planos-treino-globais.md`;
  - `docs/sdd/base/03-contratos-compartilhados.md`;
  - `docs/sdd/base/05-documentacao-oficial-das-tecnologias.md`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/base/02-endpoints-e-contratos.md`;
  - `api/docs/sdd/base/05-seeds-e-curls-de-cenario.md`;
  - `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
  - `api/docs/sdd/endpoints/global-training-plans.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/base/05-mocks-de-api.md`;
  - `ui/docs/sdd/base/07-testes-integrados-playwright.md`;
  - `ui/docs/sdd/routes/global-training-plan.md`;
  - `ui/docs/sdd/routes/global-training-plan-detail.md`;
  - `ui/docs/sdd/routes/global-training-plan-workout.md`.
- Referências oficiais consultadas no planejamento:
  - Mongoose 9.8 instalado: [schemas, version key, índices e
    `autoIndex`](https://mongoosejs.com/docs/guide.html),
    [subdocumentos](https://mongoosejs.com/docs/subdocs.html),
    [discriminadores embutidos](https://mongoosejs.com/docs/discriminators.html#embedded-discriminators-in-arrays),
    [`lean`](https://mongoosejs.com/docs/tutorials/lean.html) e
    [`findOneAndUpdate`](https://mongoosejs.com/docs/tutorials/findoneandupdate);
  - MongoDB: [limite BSON de 16
    MiB](https://www.mongodb.com/docs/manual/reference/limits/#mongodb-limit-BSON-Document-Size),
    [custo de `skip` e paginação por
    intervalo](https://www.mongodb.com/docs/manual/reference/method/cursor.skip/#using-range-queries)
    e [índices para ordenação
    composta](https://www.mongodb.com/docs/manual/tutorial/sort-results-with-indexes/#sort-on-multiple-fields);
  - NestJS 11: [upload multipart e validação de
    arquivo](https://docs.nestjs.com/techniques/file-upload);
  - HeroUI 3.2 instalado: [`llms-components.txt`](https://heroui.com/react/llms-components.txt)
    e [`llms-patterns.txt`](https://heroui.com/react/llms-patterns.txt);
  - TanStack Query 5.101 instalado: [atualizações
    otimistas](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
    e [cancelamento de
    queries](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation);
  - dnd kit: [React quickstart](https://dndkit.com/react/quickstart/) e
    [acessibilidade por teclado](https://docs.dndkit.com/guides/accessibility);
  - YouTube Data API v3: [`videos.list`](https://developers.google.com/youtube/v3/docs/videos/list);
  - Vercel Blob: [SDK para upload e
    exclusão](https://vercel.com/docs/vercel-blob/using-blob-sdk);
  - Sharp: [construtor e limites de
    entrada](https://sharp.pixelplumbing.com/api-constructor/),
    [resize](https://sharp.pixelplumbing.com/api-resize/) e
    [saída WebP](https://sharp.pixelplumbing.com/api-output/#webp).
- Features relacionadas:
  - `FIT-0004` fornece `AdminOnly` e `adminRoute`;
  - `FIT-0005` fornece o aggregate `TrainingPlan`, os sete endpoints atuais e as
    três rotas administrativas, deixando o editor como evolução explícita;
  - `FIT-0027` define o contrato uniforme de erro usado pelos novos códigos.

## Escopo

### Incluído

- substituir o stub da rota
  `/global/training-plan/:trainingPlanId/workout/:workoutId` pelo editor completo;
- contratos discriminados compartilhados para cinco tipos de exercício e para o
  enum de local do corpo;
- schemas Mongoose de subdocumentos discriminados, sem `Mixed[]`;
- timestamps de workout e versão numérica no aggregate `TrainingPlan`;
- leitura isolada do workout com todos os seus exercícios, sem paginação;
- edição do nome do workout;
- criação, edição parcial com autosave, exclusão e reordenação de exercícios;
- upload, substituição e remoção da imagem de um exercício `image`;
- normalização e validação de existência de vídeos pela YouTube Data API v3;
- miniatura derivada do YouTube e referências do Vercel Blob no contrato HTTP;
- concorrência otimista explícita por ETag e `If-Match` em todas as mutações de um
  plano existente, inclusive nos sete endpoints atuais;
- limites de 25 workouts por plano, 50 exercícios por workout e campos com tamanho
  finito, com alertas mensuráveis antes do limite BSON;
- paginação atual limitada, ordenação determinística e índice composto alinhado;
- leituras `lean`/projetadas quando hidratação não for necessária e escritas que
  retornam somente projeção ou resultado de escrita exigido pelo caso de uso;
- `autoIndex` habilitado em local/teste e desabilitado em preview/produção, com
  aplicação explícita e versionada dos índices de produção;
- migração dos documentos existentes para versão, timestamps e novo schema;
- processamento seguro de imagens, adapters para YouTube e Vercel Blob e
  reconciliação de blobs órfãos;
- handlers, fixtures e seletores MSW para todas as requests e estados novos;
- unitários, E2E da API e Playwright proporcionais aos caminhos e riscos;
- atualização dos SDDs vivos, ADR e fontes oficiais somente durante a implementação
  autorizada.

### Não incluído

- planos pessoais, clonagem de planos globais ou associação de plano a pessoa;
- CRUD genérico de workouts ou exercícios fora do contexto
  `TrainingPlan -> Workout -> Exercise`;
- alteração do tipo de um exercício depois de criado;
- paginação, busca ou filtros dentro do editor, pois o limite é 50 exercícios;
- carga/peso, progressão, prescrição por pessoa, execução do treino ou histórico;
- upload do arquivo original para armazenamento permanente;
- vídeo hospedado pela aplicação, edição de vídeo ou thumbnails próprias do
  YouTube;
- inferir se um vídeo é efetivamente Short pela duração; `youtube-short` e
  `youtube-long` são tipos editoriais escolhidos pela pessoa administradora;
- transcodificação de animações; imagens animadas são rejeitadas;
- edição ou exclusão em lote;
- cursor na listagem de planos nesta entrega; ficam definidos o limite e o gatilho
  objetivo para a migração;
- Redis, cache de backend, broker, fila externa ou tracing distribuído;
- mudança da concorrência de `Person`: o controle de versão pertence ao aggregate
  compartilhado de planos. `Person` conserva atualizações atômicas de campos
  isolados, embora suas leituras e projeções sejam auditadas;
- screenshots ou regressão visual, pois não existem imagens nas pastas de assets
  das três rotas afetadas.

## Projetos e documentação afetados

- API e endpoints:
  - ampliar `TrainingPlanModule` com commands proprietários por endpoint, services
    coesos para exercícios, YouTube, imagens e limite do aggregate, sem acesso de
    command a repository;
  - ampliar `GlobalTrainingPlansController` ou separar controller apenas se o
    agrupamento continuar por recurso, preservando a mesma hierarquia;
  - atualizar `api/docs/sdd/endpoints/global-training-plans.md` com os sete
    endpoints modificados e os oito endpoints do editor;
  - atualizar `api/docs/sdd/base/01-arquitetura.md` com versão, limites, adapters,
    gestão de índices e integrações;
  - atualizar `.env.example`, validação de ambiente e CSP/CORS quando aplicável;
  - criar scripts versionados de migração, índices e reconciliação de imagens;
  - `auth.md` e `current-person.md` não mudam de contrato.
- UI e rotas:
  - substituir `workout-page.tsx` e sua composição pelo editor;
  - atualizar lista e detalhe para transportar versão/ETag e tratar conflitos nas
    mutações já existentes;
  - manter componentes exclusivos na rota, exceto o componente próprio de
    seleção/upload de imagem, que pertence a `ui/src/core/components/` conforme o
    contrato transversal definido pela FIT-0017;
  - atualizar os três documentos em `ui/docs/sdd/routes/global-training-plan*.md`;
  - atualizar `ui/docs/sdd/base/01-arquitetura.md` para coordenação de mutações,
    Analytics e CSP, e `ui/docs/sdd/base/05-mocks-de-api.md` para os cenários;
  - nenhuma referência visual precisa ser criada.
- Fluxos:
  - atualizar `docs/sdd/flows/gestao-planos-treino-globais.md` para terminar no
    editor real, incluindo conflitos, mídia e autosave.
- Contratos em `@dall-fit/types`:
  - `BodyArea`, union `Exercise`, requests/responses do editor e `version` nas
    representações de plano consumidas pela UI;
  - exports somente por `packages/types/src/index.ts`;
  - tipos Mongoose, chaves internas do Blob e contratos dos adapters continuam
    exclusivos da API.
- Decisões arquiteturais:
  - atualizar ou substituir por novo ADR a decisão da `ADR-0003`, registrando por
    que o aggregate continua embutido agora que há limites, versão e critérios de
    saída;
  - registrar no mesmo ADR a consistência eventual da limpeza do storage e sua
    reconciliação, pois MongoDB e Vercel Blob não compartilham transação.
- Handlers e fixtures MSW:
  - ampliar `training-plans.ts` com leitura do workout, cada mutação, ETag,
    conflitos, limites, YouTube, upload e falhas de imagem;
  - estado isolado por seletor e reiniciado por teste;
  - multipart é validado pelo handler sem converter arquivo em base64.
- Mocks de repositories/caches nos unitários da API:
  - commands mockam services; services de domínio mockam
    `TrainingPlanRepository`; serviços de integração mockam suas ports;
  - adapters de YouTube e Blob nunca fazem rede em unitários;
  - Redis não se aplica.
- Fixtures MongoDB/Redis nos E2E:
  - MongoDB efêmero contém plano global/pessoal, versão, workouts nos limites e
    todos os tipos de exercício;
  - adapters determinísticos de YouTube e Blob substituem somente os serviços
    externos; repository MongoDB, Nest, guards, DTOs e transporte permanecem reais;
  - Redis efêmero continua participando da sessão, CSRF e rate limit, não do
    domínio de planos.

## Contratos pretendidos

### Versão e precondição do aggregate

- `TrainingPlanSummary`, `TrainingPlanDetails` e o detalhe do workout expõem
  `version: number`, inteiro a partir de zero.
- O schema top-level usa `versionKey: 'version'`; subdocumentos não possuem versão
  própria.
- Todo GET de item devolve o header forte e canônico
  `ETag: "training-plan:<trainingPlanId>:<version>"`.
- Toda response bem-sucedida que mantém o aggregate existente devolve o ETag da
  versão resultante, inclusive `204`.
- Toda mutação de plano existente exige exatamente um `If-Match` forte no formato
  canônico. Tag fraca, lista, wildcard ou formato alheio ao plano é inválido.
- Ausência responde `428 PRECONDITION_REQUIRED`; tag malformada responde
  `400 VALIDATION_ERROR`; versão obsoleta de um recurso ainda existente responde
  `412 TRAINING_PLAN_VERSION_CONFLICT`.
- CORS passa a permitir `If-Match` e expor `ETag`, além dos headers vigentes.
- Cada mutação efetiva compara owner, IDs e versão no mesmo filtro atômico e
  incrementa a versão exatamente uma vez. Reordenação já idêntica e remoção de uma
  imagem já nula são no-op idempotentes: mantêm versão, timestamps e ETag.
- Se o filtro condicional não casar, uma leitura mínima distingue plano, workout
  ou exercício ausente de conflito de versão, sem recuperar o documento completo.
- A UI nunca reenvia automaticamente uma mutação após `412`. Ela preserva drafts,
  interrompe a fila daquele aggregate e exige decisão explícita de recarregar os
  dados antes de voltar a salvar.

### Enum compartilhado de local do corpo

```ts
type BodyArea =
  | 'stretching'
  | 'abdomen'
  | 'quadriceps'
  | 'mobility'
  | 'other'
  | 'chest'
  | 'shoulder'
  | 'triceps'
  | 'back'
  | 'biceps'
  | 'lower-back'
  | 'glutes'
  | 'calf'
  | 'adductor'
  | 'hamstrings'
  | 'cardio';
```

Labels exclusivos da UI:

| Valor técnico | Label             |
| ------------- | ----------------- |
| `stretching`  | Alongamentos      |
| `abdomen`     | Abdômen           |
| `quadriceps`  | Quadríceps        |
| `mobility`    | Mobilidade        |
| `other`       | Outros            |
| `chest`       | Peito             |
| `shoulder`    | Ombro             |
| `triceps`     | Tríceps           |
| `back`        | Costas            |
| `biceps`      | Bíceps            |
| `lower-back`  | Lombar            |
| `glutes`      | Glúteo            |
| `calf`        | Panturrilha       |
| `adductor`    | Adutor            |
| `hamstrings`  | Posterior de coxa |
| `cardio`      | Cardio            |

### Union discriminada de exercícios

Campos inexistentes em um tipo não são materializados como `null`. Apenas
`ImageExercise.image` aceita `null` por regra de domínio.

```ts
interface YoutubeShortExercise {
  id: string;
  type: 'youtube-short';
  name: string;
  youtubeId: string;
  thumbnailUrl: string;
  bodyArea: BodyArea;
  restSeconds: number;
  sets: number;
  repetitions: number;
}

interface ImageExercise {
  id: string;
  type: 'image';
  name: string;
  image: {
    thumbnailUrl: string;
    displayUrl: string;
  } | null;
  bodyArea: BodyArea;
  restSeconds: number;
  sets: number;
  repetitions: number;
}

interface YoutubeLongExercise {
  id: string;
  type: 'youtube-long';
  name: string;
  youtubeId: string;
  thumbnailUrl: string;
  bodyArea: BodyArea;
}

interface PauseExercise {
  id: string;
  type: 'pause';
  restSeconds: number;
}

interface DurationExercise {
  id: string;
  type: 'duration';
  name: string;
  bodyArea: BodyArea;
  durationMinutes: number;
}

type Exercise =
  | YoutubeShortExercise
  | ImageExercise
  | YoutubeLongExercise
  | PauseExercise
  | DurationExercise;
```

### Limites e validação do domínio

| Dado                         | Regra                                             |
| ---------------------------- | ------------------------------------------------- |
| workouts por plano           | máximo 25                                         |
| exercícios por workout       | máximo 50                                         |
| nome de workout              | trim, 1–120 caracteres                            |
| nome de exercício aplicável  | trim, 1–40 caracteres                             |
| `youtubeId` persistido       | exatamente 11 caracteres em `[A-Za-z0-9_-]`       |
| `bodyArea`                   | um dos 16 valores compartilhados                  |
| descanso de exercício comum  | inteiro de 0 a 3600 segundos                      |
| descanso do tipo `pause`     | inteiro de 1 a 3600 segundos                      |
| séries                       | inteiro de 1 a 100                                |
| repetições                   | inteiro de 1 a 1000                               |
| duração                      | inteiro de 1 a 1440 minutos                       |
| imagem de entrada            | JPEG, PNG ou WebP, até 10 MiB e até 40 megapixels |
| key interna de cada variante | máximo 512 caracteres                             |
| URL persistida de variante   | máximo 2048 caracteres                            |
| página da lista de planos    | inteiro de 1 a 100, 20 itens por página           |

- O backend e o schema aplicam os mesmos limites; propriedades extras e campos de
  outro discriminador são rejeitados.
- A combinação dos limites de quantidade e tamanho mantém o pior caso legal abaixo
  do limite operacional de 12 MiB. Um E2E de fronteira confirma o tamanho com
  `$bsonSize`; o limite físico do MongoDB de 16 MiB nunca é usado como limite de
  produto.
- Atingir 25 workouts responde `409 WORKOUT_LIMIT_REACHED`; atingir 50 exercícios
  responde `409 EXERCISE_LIMIT_REACHED`; tentativa que violar a margem de 12 MiB
  responde `409 TRAINING_PLAN_SIZE_LIMIT_REACHED`.
- Leituras internas do editor calculam tamanho BSON, quantidade de workouts e maior
  quantidade de exercícios. A partir de 8 MiB, 20 workouts ou 40 exercícios em um
  workout, a API emite `warn` estruturado `aggregateNearLimit`, sem conteúdo do
  plano.
- Uma nova ADR deve reavaliar a separação de workouts/exercícios antes de elevar
  qualquer limite, ao aparecer o primeiro plano com 8 MiB ou ao produto exigir
  consulta/paginação independente de exercícios.

### Defaults de criação

- `youtube-short`: `Novo exercício`, `ZA8gs8XP2bs`, `other`, 60 segundos,
  3 séries e 12 repetições;
- `image`: `Novo exercício`, `image: null`, `other`, 60 segundos, 3 séries e
  12 repetições;
- `youtube-long`: `Novo exercício`, `2isq0vuKruE` e `other`;
- `pause`: 60 segundos;
- `duration`: `Novo exercício`, `other` e 15 minutos.

O POST recebe somente `type`. A API aplica e valida os defaults antes de persistir
e acrescenta o exercício ao fim. Nos tipos YouTube, `thumbnailUrl` é sempre
`https://img.youtube.com/vi/{youtubeId}/default.jpg`, derivada e nunca persistida.

## Endpoints pretendidos

### Operações existentes modificadas

| Método e path                                                       | Mudança                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET /global/training-plans`                                        | ordem estável, índice novo, `page <= 100`, lean e `version` |
| `POST /global/training-plans`                                       | response nasce com `version: 0` e ETag                      |
| `GET /global/training-plans/:trainingPlanId`                        | projeção inclui `version` e ETag                            |
| `PATCH /global/training-plans/:trainingPlanId`                      | exige `If-Match`, CAS e projeção mínima                     |
| `DELETE /global/training-plans/:trainingPlanId`                     | exige `If-Match`, usa resultado de escrita e limpa imagens  |
| `POST /global/training-plans/:trainingPlanId/workouts`              | exige `If-Match`, aplica limite e cria timestamps           |
| `DELETE /global/training-plans/:trainingPlanId/workouts/:workoutId` | exige `If-Match`, usa resultado de escrita e limpa imagens  |

Todos continuam filtrando `ownerPersonId: null`. Conhecer um ID pessoal continua
produzindo `404 TRAINING_PLAN_NOT_FOUND`.

### Buscar o editor do workout

`GET /global/training-plans/:trainingPlanId/workouts/:workoutId`

```ts
{
  data: {
    id: string;
    name: string;
    version: number;
    trainingPlan: {
      id: string;
      name: string;
    };
    exercises: Exercise[];
    createdAt: string;
    updatedAt: string;
  };
}
```

- Uma request traz todo o necessário para editor, cabeçalho e breadcrumb.
- Exercícios seguem exatamente a ordem física persistida e não têm paginação.
- A projeção retorna somente o workout alvo e os dados mínimos do plano.
- Tipos YouTube recebem `thumbnailUrl` derivada; tipos imagem recebem somente URLs
  públicas, nunca keys internas.

### Alterar nome do workout

`PATCH /global/training-plans/:trainingPlanId/workouts/:workoutId`

Body `{ name: string }`. Responde `200` com `{ id, name, updatedAt }` em `data` e
o ETag novo. Exige `If-Match`.

### Criar exercício

`POST /global/training-plans/:trainingPlanId/workouts/:workoutId/exercises`

Body `{ type: Exercise['type'] }`. Responde `201` com o `Exercise` completo em
`data` e o ETag novo. Exige `If-Match`.

### Alterar exercício

`PATCH /global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId`

- Recebe somente campos editáveis presentes e exige ao menos um campo.
- `id`, `type`, `image` e `thumbnailUrl` não são editáveis neste endpoint.
- Valida contra o tipo persistido e rejeita campos de outro tipo.
- Nos tipos YouTube, aceita ID ou URL suportada, normaliza, valida existência e
  devolve exercício completo com ID e thumbnail canônicos.
- Responde `200` com o exercício completo em `data` e ETag novo.

Referências aceitas:

```text
ZA8gs8XP2bs
https://youtu.be/ZA8gs8XP2bs
https://www.youtube.com/watch?v=ZA8gs8XP2bs
https://youtube.com/shorts/ZA8gs8XP2bs
```

Hosts, paths, protocolos, parâmetros ou IDs fora da allowlist são rejeitados antes
de chamar o YouTube. A API consulta `videos.list` com o ID normalizado e só aceita
um vídeo existente, processado, não privado e incorporável. Ausência ou vídeo
incompatível responde `400 INVALID_YOUTUBE_REFERENCE`; timeout, quota ou falha
técnica responde `503 YOUTUBE_VALIDATION_UNAVAILABLE` e não persiste a alteração.

### Excluir exercício

`DELETE /global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId`

Responde `204`, ETag novo e remove as variantes do storage quando existirem. Exige
`If-Match`.

### Reordenar exercícios

`PUT /global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/order`

Body `{ exerciseIds: string[] }`, representando a ordem final completa. IDs devem
ser únicos, conhecidos, pertencer ao workout e cobrir todos os exercícios atuais.
Responde `204` e ETag; repetir a ordem atual é um no-op idempotente.

### Upload ou substituição de imagem

`PUT /global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId/image`

- `multipart/form-data`, exatamente um campo `file`, sem base64;
- somente exercício `image`;
- exige `If-Match` e aplica limite de corpo antes de processar;
- responde `200` com `{ data: { image: { thumbnailUrl, displayUrl } } }` e ETag.

Fluxo:

1. validar plano/workout/exercício, versão, tipo, assinatura real, tamanho, dimensões
   e ausência de animação;
2. corrigir orientação, remover metadata e gerar WebP sem ampliação:
   `thumbnail` dentro de 160x160 e `display` dentro de 1080x1920, preservando
   proporção;
3. enviar as duas variantes com nomes únicos e prefixo determinístico
   `training-exercises/` ao store público;
4. persistir ambas as referências em uma única mutação condicional somente depois
   dos dois uploads;
5. em falha/conflito anterior ao commit, preservar a imagem anterior e tentar
   remover toda variante nova parcial;
6. depois do commit, remover as variantes antigas de forma idempotente.

### Remover imagem

`DELETE /global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId/image`

Remove apenas a associação e as variantes, preservando o exercício. Responde `204`
e ETag. Exercício `image` já sem arquivo é no-op idempotente; outro tipo responde
`400 INVALID_EXERCISE_TYPE`.

### Endpoints propositalmente ausentes

```text
GET /exercises/:id
GET /workouts
GET /global/training-plans/:id/exercises
PUT do workout inteiro
PUT do training plan inteiro
PUT genérico do exercício inteiro
```

## Persistência, consultas e índices

- `training_plans` continua como coleção única e `ownerPersonId` como único
  discriminador de ownership.
- `workouts` e `exercises` continuam embutidos; a ordem física dos arrays é a ordem
  pública. Não existe campo `order` redundante.
- O array de exercícios usa schema base com `discriminatorKey: 'type'` e cinco
  discriminadores embutidos. Todos possuem `_id`; subdocumentos não possuem
  version key.
- Workouts passam a possuir `createdAt` e `updatedAt`. Qualquer mutação em seu nome,
  exercícios ou imagem atualiza `workout.updatedAt`, `TrainingPlan.updatedAt` e a
  versão top-level.
- Imagens persistem somente key, URL, largura e altura de `thumbnail` e `display`.
  O original e `thumbnailUrl` do YouTube não são persistidos.
- A listagem usa projeção lean, ordem
  `{ createdAt: -1, _id: -1 }` e índice
  `{ ownerPersonId: 1, createdAt: -1, _id: -1 }`.
- O desempate por `_id` torna páginas determinísticas quando timestamps coincidem.
- `page` continua offset para preservar a UX atual, mas é limitado a 100. A UI
  limita sua paginação ao mesmo valor mesmo quando `total` for maior.
- Ao total alcançar 1600 planos globais, a API emite warning de capacidade no
  máximo uma vez por runtime aquecido. A migração para cursor deve estar entregue
  antes de 2000 planos ou antes de elevar a página máxima; essa mudança exige
  feature própria e contrato de navegação.
- Leitura de detalhe/workout usa aggregate/projeção POJO. Leituras simples apenas
  para mapear usam `lean`; nenhuma consulta hidrata documentos sem necessidade de
  getters, validação ou `save`.
- DELETE que precisa somente confirmar usa `deleteOne`/`updateOne` e resultado de
  escrita. PATCH que precisa responder recurso usa projeção mínima do item
  alterado, nunca o aggregate completo.
- A mesma auditoria aplica `lean` e projeções às leituras de `Person` que apenas
  mapeiam resultado, sem mudar seu contrato nem introduzir versão nesse domínio.

### Estratégia de índices por ambiente

- Local e teste: `autoIndex: true`, preservando criação automática e E2E de índice.
- Preview e produção: `autoIndex: false`, derivado de `RUNTIME_ENVIRONMENT`, sem
  flag permissiva ou fallback.
- Um comando protegido e versionado cria explicitamente todos os índices vigentes,
  inclusive o único de `people.googleSubject` e o novo composto de planos.
- A migração cria o índice novo antes de remover pelo nome exato o índice antigo.
  Não usa `syncIndexes()` destrutivo sem plano explícito e nunca derruba índice por
  descoberta genérica.
- O deploy só promove código que consulta pelo índice novo depois de sua criação
  confirmada. Falha de criação interrompe o rollout.

### Migração de dados

1. Fazer preflight e interromper se existir exercício legado não vazio, pois não há
   contrato histórico seguro para converter `Mixed` silenciosamente.
2. Materializar `version: 0` em planos sem versão.
3. Materializar timestamps ausentes dos workouts usando `TrainingPlan.createdAt`
   e `TrainingPlan.updatedAt` correspondentes.
4. Validar todos os documentos contra os limites e o schema pretendido.
5. Criar o índice composto novo, validar sua presença e remover somente o índice
   antigo conhecido.
6. Tornar a migração idempotente, restrita ao ambiente alvo e incapaz de registrar
   nomes, descrições ou exercícios.

## Storage, imagens e integrações externas

- Dependências novas previstas na implementação: `@vercel/blob`, `sharp`,
  `@types/multer` e os pacotes oficiais estáveis do dnd kit necessários à lista
  sortable. As versões serão fixadas no lockfile e validadas contra os tipos locais
  antes do uso.
- `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN` e `YOUTUBE_API_KEY` são variáveis
  exclusivas da API; tokens/chaves são segredos e nunca chegam à UI, fixtures ou
  logs.
- Timeout de YouTube é finito e configurado/validado. A API não segue URL fornecida
  pelo cliente; chama somente o host fixo do Google após extrair um ID válido.
- O store é público porque as imagens são conteúdo de treino servido diretamente
  por URL. Escrita e exclusão continuam autenticadas pelo token da API.
- Como MongoDB e Blob não possuem transação comum, a associação no MongoDB é a
  verdade. Limpeza antiga ocorre depois do commit e é idempotente.
- Falha na limpeza posterior não reverte uma mutação já confirmada: emite warning
  seguro e fica recuperável por comando de reconciliação. O comando lista somente
  `training-exercises/`, compara keys com referências MongoDB e remove órfãos sem
  tocar outros prefixes.
- A reconciliação possui dry-run por padrão, execução destrutiva explícita, resumo
  por contagem e testes. Keys/URLs integrais e binários não entram em logs.
- Exclusão definitiva de exercício, workout ou plano coleta as referências antes
  da escrita condicional, confirma a remoção no MongoDB e então exclui as variantes.

## Requisitos funcionais da UI

### Entrada, cabeçalho e estados da rota

1. A rota continua filha de `adminRoute` e usa a nova query do workout em vez do
   detalhe resumido do plano.
2. Breadcrumb: `Home / Planos de treino / <plano> / <workout>`, com links tipados e
   sem IDs/placeholders em falhas.
3. Primeira entrada sem cache mostra skeleton estrutural. Refetch com cache mantém
   o editor e exibe alerta não bloqueante quando falhar.
4. O cabeçalho mostra o título da página `Treino`, o nome do workout e botão
   icon-only de lápis. Ativar troca o nome por `Input` com salvar/cancelar,
   semelhante à edição de título do GitHub.
5. Salvar o nome atualiza cache otimisticamente, entra na fila do aggregate, usa
   `toast.promise`, substitui pela resposta canônica e faz rollback em falha.
6. `TRAINING_PLAN_NOT_FOUND` e `WORKOUT_NOT_FOUND` têm estados persistentes com
   retorno ao ancestral aplicável.
7. `412` mostra `Alert` persistente de concorrência, mantém drafts visíveis,
   bloqueia novas gravações e oferece `Recarregar dados`. Recarregar avisa que os
   drafts locais serão descartados, limpa-os somente após confirmação e refaz GET.

### Lista interativa

8. A lista tem aparência tabular responsiva, mas usa lista semântica e grids
   próprios, nunca `Table` HeroUI, porque os tipos possuem campos diferentes.
9. Cada item contém handle no início, campos próprios, `Chip` do tipo, status de
   salvamento e exclusão no final. A ordem visual é a ordem da API.
10. Em viewport estreito, cada item reorganiza campos em blocos com labels; não
    depende de scroll horizontal para editar.
11. O handle é operável por ponteiro, toque e teclado, fornece instruções e anuncia
    posição. Ícones são decorativos e botões icon-only têm nomes contextuais.
12. A lista usa dnd kit em API compatível com React 19 e oferece sensor de teclado.
    Nenhuma alteração é persistida durante o movimento; apenas ao soltar.

### Campos por tipo

- `youtube-short`: Nome, vídeo, miniatura somente leitura, local do corpo,
  descanso, séries e repetições.
- `image`: Nome, upload/substituição/remoção de imagem, miniatura quando existente,
  local do corpo, descanso, séries e repetições.
- `youtube-long`: Nome, vídeo, miniatura somente leitura e local do corpo.
- `pause`: descanso.
- `duration`: Nome, local do corpo e duração em minutos.

`Input`, `Select`, `NumberField`, `Chip`, `Spinner`, `Dropdown`, `Popover`,
`Button` e `Alert` vêm do HeroUI. O seletor de arquivo é composição própria em
`ui/src/core/components/` porque o catálogo não oferece o contrato necessário; ele
usa input de arquivo nativo com label e ações acessíveis, sem recriar componentes
existentes.

### Autosave e coordenação de mutações

13. Cada linha possui debounce independente de 3 segundos. A última mudança feita
    dentro da janela substitui o PATCH pendente daquela linha.
14. Ao disparar, envia somente campos alterados da linha; nunca envia workout,
    outras linhas, `type`, imagem ou valores derivados.
15. Timers são independentes, mas todas as mutações do mesmo plano passam por uma
    fila FIFO única que injeta o ETag mais recente. Isso evita que duas linhas da
    própria sessão concorram pela mesma versão do aggregate.
16. Enquanto uma linha estiver enfileirada ou salvando, o `Spinner` ocupa o local
    da exclusão. Outras linhas continuam editáveis e seus timers continuam
    independentes.
17. Se a linha mudar durante um request, a resposta canônica atualiza somente os
    campos que não receberam edição mais recente; o novo draft permanece dirty e
    será salvo em outra passagem.
18. Sucesso de autosave não mostra toast. Falha mostra toast seguro e conserva o
    draft para nova edição/tentativa; não reverte o texto digitado.
19. Em tipos YouTube, a miniatura atual permanece até o PATCH concluir. Sucesso
    troca ID e URL pelos valores canônicos; falha mantém miniatura anterior.
20. Ao desmontar/navegar com timers ou drafts pendentes, a UI tenta esvaziar a fila
    já iniciada e apresenta confirmação de navegação para trabalho ainda não
    enviado; não usa request síncrona ou `beforeunload` para fingir garantia.

### Adicionar, reordenar e excluir

21. `Adicionar` abre `Dropdown` com YouTube Short, YouTube Longo, Imagem, Pausa e
    Duração.
22. Selecionar cria linha temporária ao fim com defaults, enfileira POST e troca o
    ID temporário pelo real. Falha remove a linha e mostra erro.
23. Ao soltar uma reordenação, a UI aplica ordem otimista e envia todos os IDs uma
    vez. Falha restaura ordem anterior; `412` também ativa o estado de conflito.
24. Excluir abre `Popover` de confirmação. Confirmar remove a linha otimisticamente;
    falha restaura item, draft e posição.
25. Adição, reordenação e exclusão respeitam a fila e usam o ETag resultante da
    operação anterior. Não são repetidas automaticamente.

### Imagem

26. `image: null` mostra ação de upload e nenhum placeholder semelhante a mídia
    cadastrada.
27. Imagem existente mostra a variante `thumbnail`, indicação textual, ação de
    substituir e ação de remover apenas a imagem.
28. Upload/substituição/remoção são mutações imediatas e independentes do debounce
    JSON, mas passam pela fila de versão.
29. Durante upload, a UI valida preliminarmente tipo/tamanho, envia `FormData`,
    mostra loading local e conserva imagem anterior. O backend continua sendo a
    autoridade da validação.
30. Sucesso atualiza as URLs; falha preserva a imagem anterior e mostra toast. A UI
    nunca lê arquivo para base64 nem persiste o arquivo local.

### Analytics e privacidade

- Expandir o catálogo tipado para nome do workout, adicionar/tipo, handle,
  reordenação, exclusão, campos, upload, substituição, remoção, retry e resolução
  de conflito.
- Cada operação aceita emite um início e um terminal `success|error`; conflito usa
  `error` e a ação explícita de recarregar usa retry.
- Drag não emite por movimento; somente a reordenação confirmada.
- Nunca enviar IDs, nomes, URLs, arquivo, tamanho, valor do campo, ordem completa,
  conteúdo do exercício, código de erro externo ou seletor `mock*`.

## Requisitos não funcionais

- Acessibilidade:
  - lista semântica, headings, labels e agrupamento por exercício;
  - drag acessível por teclado e live region com instrução/posição;
  - foco preservado em autosave e restaurado após popover/dropdown;
  - erros associados aos campos e status de saving anunciado sem depender de cor;
  - miniaturas possuem texto alternativo derivado somente do nome já visível;
  - toast não é a única informação para conflito, falha inicial ou validação.
- Performance:
  - no máximo 50 linhas e uma request inicial projetada;
  - PATCH por exercício, nunca update do workout inteiro;
  - consultas POJO/lean e projeções mínimas;
  - fila coalesce alterações da mesma linha ainda não enviadas;
  - imagens compactadas, sem original armazenado e sem ampliação;
  - paginação da coleção limitada e indexada.
- Segurança e privacidade:
  - `AdminOnly`, CSRF, origem e rate limit em todos os endpoints;
  - mutations JSON do editor usam limite próprio de 120/minuto por
    administradora+IP, dimensionado para a fila e 50 linhas; upload/substituição de
    imagem usa 10/minuto por administradora+IP; as demais mutações administrativas
    conservam 30/minuto;
  - validação por magic bytes, limite de bytes/pixels e remoção de metadata;
  - host fixo/ID estrito elimina SSRF na validação do YouTube;
  - CSP da UI permite imagens somente da origem vigente, `img.youtube.com` e do
    domínio público exato do Vercel Blob necessário ao store;
  - tokens, API key, blobs, nomes e payloads nunca entram em logs.
- Observabilidade:
  - logs seguem controller -> command -> services -> adapters/repository;
  - registrar IDs técnicos, versão esperada/resultante, campos alterados, tipo como
    enum, contagens, bytes/dimensões resumidos e branch;
  - não registrar referência do YouTube informada, URLs/keys integrais, arquivo,
    imagem, nome, body, resposta externa ou documento;
  - warnings excepcionais: aggregate próximo do limite, lista próxima de cursor,
    conflito, indisponibilidade do YouTube e limpeza de Blob pendente.
- Confiabilidade:
  - timeouts finitos em YouTube e Blob;
  - sem retry automático de mutation pela UI;
  - upload compensa variantes novas antes do commit sempre que possível;
  - reconciliação cobre órfãos restantes sem transação distribuída.
- Componentização e estilo:
  - componentes HeroUI existentes antes de equivalentes locais;
  - composição em `index.tsx`/arquivos de tela e apresentação exclusivamente em
    `styles.ts` com `tv` de `@heroui/styles`;
  - nenhum Tailwind literal ou estilo inline no JSX;
  - partes com estado/branch próprio extraídas e testáveis.

## Erros estáveis relevantes

```text
400 VALIDATION_ERROR
400 INVALID_YOUTUBE_REFERENCE
400 INVALID_EXERCISE_ORDER
400 INVALID_EXERCISE_TYPE
401 AUTHENTICATION_REQUIRED
403 ADMIN_ACCESS_REQUIRED
404 TRAINING_PLAN_NOT_FOUND
404 WORKOUT_NOT_FOUND
404 EXERCISE_NOT_FOUND
409 WORKOUT_LIMIT_REACHED
409 EXERCISE_LIMIT_REACHED
409 TRAINING_PLAN_SIZE_LIMIT_REACHED
412 TRAINING_PLAN_VERSION_CONFLICT
413 IMAGE_TOO_LARGE
415 UNSUPPORTED_IMAGE_TYPE
428 PRECONDITION_REQUIRED
503 YOUTUBE_VALIDATION_UNAVAILABLE
503 IMAGE_UPLOAD_FAILED
```

`message` e `details` não dirigem lógica da UI. Falha de limpeza posterior ao
commit não muda uma response bem-sucedida; ela é observável e reconciliável.

## Critérios de aceite

### Cenário 1 — Carregar editor completo

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin`.
- Given: plano global e workout contêm os cinco tipos.
- When: a rota é aberta sem cache.
- Then: skeleton precede uma única leitura; breadcrumb, cabeçalho e 50 ou menos
  exercícios aparecem na ordem da API, com campos próprios e ETag preservado.

### Cenário 2 — Acesso e ownership permanecem protegidos

- Forma de validar: cenários vivos da rota e endpoint com links, seeds e cURLs.
- Given: pessoa comum ou ID de plano pessoal.
- When: tenta abrir ou mutar o editor global.
- Then: UI redireciona a pessoa comum; API responde `403` ou
  `404 TRAINING_PLAN_NOT_FOUND` sem expor dados pessoais.

### Cenário 3 — Editar nome com concorrência

- Forma de validar: link do cenário 1 e cenário E2E do PATCH.
- Given: editor possui ETag atual.
- When: salva nome válido.
- Then: cache muda otimisticamente, request envia `If-Match`, versão incrementa e
  response/ETag canônicos encerram `toast.promise`.

### Cenário 4 — Debounce independente e fila por aggregate

- Forma de validar: Playwright no link do cenário 1.
- Given: duas linhas editáveis.
- When: valores das duas mudam várias vezes em menos de 3 segundos.
- Then: há no máximo um PATCH inicial por linha com o último draft; as requests são
  serializadas e a segunda usa o ETag devolvido pela primeira.

### Cenário 5 — Falha de autosave preserva trabalho

- Forma de validar: cenário MSW `update-exercise-error`.
- Given: linha possui miniatura e valor confirmado.
- When: edição falha depois do debounce.
- Then: draft digitado e miniatura anterior permanecem, spinner encerra, erro é
  anunciado e não há toast de sucesso.

### Cenário 6 — Conflito externo não sobrescreve

- Forma de validar: cenário MSW `version-conflict` e cenário E2E de duas versões.
- Given: outro cliente incrementou a versão.
- When: a fila envia ETag antigo.
- Then: API responde `412` sem mutar; UI não repete, preserva drafts, pausa a fila
  e exige recarga confirmada.

### Cenário 7 — Criar cada tipo com defaults do backend

- Forma de validar: editor e cenários E2E dos cinco tipos.
- Given: workout abaixo do limite.
- When: seleciona cada item do dropdown.
- Then: linha temporária aparece ao fim, POST envia somente `type`, ID real e
  defaults canônicos substituem o temporário; YouTube já retorna thumbnail.

### Cenário 8 — Normalizar e validar YouTube

- Forma de validar: cenário vivo do PATCH com adapter determinístico.
- Given: vídeo público/incorporável existente.
- When: envia URL curta, watch ou shorts.
- Then: persiste somente ID e responde thumbnail derivada; inexistente retorna
  `INVALID_YOUTUBE_REFERENCE` e indisponibilidade retorna
  `YOUTUBE_VALIDATION_UNAVAILABLE`, ambos sem alterar MongoDB.

### Cenário 9 — Reordenar com todos os IDs

- Forma de validar: editor por ponteiro e teclado, mais cURL vivo.
- Given: três exercícios.
- When: move o terceiro para o primeiro lugar.
- Then: UI muda uma vez, PUT envia ordem completa, MongoDB troca o array
  atomicamente e a leitura seguinte preserva a ordem; falha restaura o snapshot.

### Cenário 10 — Ordem inválida não produz efeito

- Forma de validar: cenário vivo do endpoint com seed e cURL.
- Given: ordem contém duplicado, desconhecido ou omite item.
- When: chama PUT.
- Then: `400 INVALID_EXERCISE_ORDER`, mesma versão e mesmo array.

### Cenário 11 — Excluir exercício com rollback

- Forma de validar: cenário MSW `delete-exercise-error`.
- Given: linha possui posição e draft conhecidos.
- When: confirma no Popover e DELETE falha.
- Then: linha retorna à posição, draft é preservado e toast seguro anuncia falha.

### Cenário 12 — Upload inicial processa duas variantes

- Forma de validar: cenário E2E multipart com adapter Blob determinístico.
- Given: exercício `image` com `image: null` e arquivo JPEG válido.
- When: envia o campo `file`.
- Then: backend orienta/remove metadata, produz WebP dentro de 160x160 e
  1080x1920 sem ampliar, persiste referências após ambos uploads e retorna URLs.

### Cenário 13 — Substituição falha sem perder imagem anterior

- Forma de validar: cenário do endpoint que falha no segundo upload ou no CAS.
- Given: exercício já possui duas variantes.
- When: substituição falha antes do commit.
- Then: MongoDB e UI conservam imagem anterior e novas variantes parciais são
  removidas ou detectáveis pela reconciliação.

### Cenário 14 — Remover apenas imagem

- Forma de validar: cenário vivo do DELETE de imagem.
- Given: exercício `image` possui arquivo.
- When: confirma remover imagem.
- Then: exercício continua na mesma posição com `image: null`, versão incrementa e
  variantes são excluídas; repetir com imagem nula é no-op idempotente.

### Cenário 15 — Exclusões em cascata limpam mídia

- Forma de validar: E2E de exercício, workout e plano com imagens.
- Given: árvore possui várias referências de Blob.
- When: exclui exercício, workout ou plano com ETag atual.
- Then: MongoDB remove o alvo atomicamente e todas as variantes coletadas são
  entregues à limpeza; falhas remanescentes aparecem no dry-run da reconciliação.

### Cenário 16 — Limites impedem crescimento indevido

- Forma de validar: cenários vivos e E2E com 25 workouts/50 exercícios.
- Given: aggregate está no limite relevante.
- When: tenta acrescentar mais um item.
- Then: recebe o `409` específico sem mudar versão, ordem ou tamanho.

### Cenário 17 — Documento de fronteira permanece abaixo de 12 MiB

- Forma de validar: E2E MongoDB com todos os campos em máximos legais e `$bsonSize`.
- Given: maior aggregate permitido pelo contrato.
- When: valida o documento persistido.
- Then: tamanho é menor que 12 MiB e nenhuma operação depende de chegar a 16 MiB.

### Cenário 18 — Listagem é determinística e limitada

- Forma de validar: cenário vivo de listagem e E2E de índice.
- Given: planos compartilham `createdAt` e existem dados pessoais intercalados.
- When: consulta páginas 1 e 100.
- Then: somente globais aparecem em ordem `createdAt/_id` decrescente, sem
  duplicidade entre páginas, com projeção lean e índice composto; página 101 é
  `VALIDATION_ERROR`.

### Cenário 19 — Índices não são criados no bootstrap publicado

- Forma de validar: testes de configuração e execução segura do comando de índice.
- Given: runtimes local, test, preview e produção.
- When: compõe a conexão.
- Then: `autoIndex` é true apenas em local/teste; comando explícito cria o índice
  novo antes da aplicação e não remove índices desconhecidos.

### Cenário 20 — Migração recusa `Mixed` legado desconhecido

- Forma de validar: teste do script em MongoDB efêmero.
- Given: existe exercício legado não vazio sem discriminador reconhecido.
- When: executa preflight.
- Then: migração falha antes de escrita ou índice, informa apenas IDs técnicos e
  exige decisão explícita de dados.

### Cenário 21 — Acessibilidade da reordenação

- Forma de validar: Playwright no editor.
- Given: pessoa usa somente teclado.
- When: focaliza o handle, inicia, move e solta um exercício.
- Then: posição é anunciada, foco permanece no item e a mesma mutation de ordem é
  produzida sem depender de ponteiro ou cor.

### Cenário 22 — CSP e segredos

- Forma de validar: build, testes de ambiente e inspeção dos headers.
- Given: editor possui miniaturas YouTube e Blob.
- When: UI carrega as imagens.
- Then: CSP permite somente hosts declarados; API key/token não aparecem no bundle,
  responses, logs ou fixtures.

## Estratégia de entrega e compatibilidade

1. Adicionar contratos compatíveis (`version`, unions e responses) e preparar
   schemas/scripts sem ativar precondição antes da migração.
2. Executar preflight, backfill e criação do índice novo; falhar o rollout diante
   de exercício legado desconhecido ou limite violado.
3. Publicar API que emite ETag e aceita `If-Match`, mantendo uma janela coordenada
   somente para o cliente anterior se API/UI não tiverem deploy atômico.
4. Publicar UI com versão, fila, editor, MSW e tratamento de conflitos.
5. Tornar `If-Match` obrigatório para toda mutação de plano existente, remover a
   compatibilidade temporária e validar os clientes publicados antes de considerar
   a entrega concluída. A flag temporária não permanece como configuração final.
6. Habilitar adapters/segredos, ajustar CSP e validar upload/YouTube em preview com
   dados fictícios.
7. Remover o índice antigo somente depois de confirmar uso do novo e manter
   `autoIndex` desligado em runtimes publicados.
8. Atualizar todos os SDDs vivos e ADR na mesma entrega autorizada, sem alterar esta
   feature validada.

## Plano de testes

- Contratos compartilhados:
  - narrowing exaustivo dos cinco discriminadores;
  - `BodyArea`, requests parciais, versão e exports públicos;
  - produtor e consumidor rejeitam campos incompatíveis.
- Unitários da API:
  - DTOs, parsing estrito de ETag/If-Match, limites e erros;
  - um command por endpoint cobrindo ordem de services, compensações e responses;
  - service de concorrência para CAS, no-op, conflito e not-found;
  - defaults, validação discriminada, ordem completa e tamanho;
  - normalizador YouTube, allowlist e mapeamento de falhas;
  - processamento de imagem, limites, metadata, dimensões e compensações;
  - services mockam repository e ports; nenhum unitário inicia rede/banco.
- E2E serial da API:
  - autenticação, admin, CSRF, origem, rate limit e `x-request-id`;
  - todos os endpoints, status, bodies, ETag e códigos estáveis;
  - duas mutações com a mesma versão, garantindo um sucesso e um `412`;
  - ownership global em todas as operações;
  - schema/discriminadores, ordem, no-op, limites, tamanho BSON e índice;
  - multipart real com Sharp e adapter de Blob determinístico;
  - adapters de YouTube/Blob simulam sucesso, ausência, timeout e falhas parciais;
  - migração e scripts em MongoDB efêmero preservando índices.
- Unitários/componentes da UI:
  - query keys e services retornam payload + ETag;
  - timers fake cobrem debounce/coalescência sem testar tempo real;
  - fila usa versão resultante, pausa em conflito e não faz retry;
  - merge de resposta não apaga edição mais recente;
  - otimismos/rollbacks de título, criação, ordem e exclusão;
  - upload via FormData e preservação de imagem;
  - todos os tipos, limites, labels, loading, erro e acessibilidade;
  - Analytics valida enum e ausência de dados proibidos.
- MSW:
  - handlers tipados para sucesso, loading, not-found, conflito, limites, erros de
    cada mutation, YouTube e imagem;
  - ETag incrementa no estado isolado e `If-Match` é validado;
  - multipart não vira JSON/base64;
  - sentinela permanece por último e Playwright nunca alcança API real.
- Playwright:
  - sucesso, loading, falha inicial/background e deep link;
  - edição de nome, dois autosaves, criação dos cinco tipos, reordenação por
    ponteiro e teclado, exclusão e imagens;
  - rollback e conflito sem sobrescrita;
  - navegação com drafts pendentes;
  - proteção administrativa e breadcrumbs;
  - nenhum `page.route`, timeout fixo ou API real.
- Quality gates após implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`.

## Riscos e decisões

- O aggregate embutido continua favorecendo leitura, clonagem e ordenação atômica,
  mas agora possui fronteiras concretas. Ele deixa de ser uma decisão ilimitada:
  8 MiB, 25/50 ou necessidade de consulta independente acionam reavaliação.
- Versão top-level conflita também alterações em linhas diferentes feitas por
  administradores distintos. Isso é intencional: a alternativa de merge implícito
  poderia perder reordenação, exclusão ou troca de imagem. A fila evita conflitos
  criados pelo próprio cliente sem esconder concorrência externa.
- Debounces independentes não significam writes simultâneos no mesmo documento.
  Separar agendamento de edição da serialização do aggregate preserva a UX e o CAS.
- Offset continua aceitável enquanto o conjunto acessível é no máximo 2000 itens.
  Ordenação por `_id`, limite 100 e warning em 1600 impedem crescimento silencioso;
  cursor será uma mudança explícita, não uma otimização invisível.
- Vercel Blob e MongoDB não oferecem commit único. Persistir referências somente
  após os dois uploads protege a imagem anterior; limpeza posterior idempotente e
  reconciliação tratam órfãos sem introduzir broker nesta entrega.
- Validar existência pelo YouTube Data API custa quota e depende de serviço externo.
  O sistema falha sem persistir quando a validação está indisponível, em vez de
  aceitar referência incerta.
- URLs do YouTube são derivadas; URLs do Blob são persistidas com keys internas
  porque o SDK precisa delas para gestão e o contrato HTTP não deve expô-las.
- O limite de imagem protege memória/CPU em runtime serverless. O arquivo fica em
  memória somente dentro de 10 MiB e nunca é logado ou preservado como original.
- Habilitar version key em `TrainingPlan` exige backfill e atualização explícita em
  operadores atômicos; confiar apenas no `optimisticConcurrency` de `save()` não
  protegeria os `updateOne/findOneAndUpdate` usados pelo adapter.
- `autoIndex` em produção pode causar carga e rollout imprevisível. A criação
  versionada dos índices antecede o código e não usa sincronização destrutiva
  genérica.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- FIT-0017 integralmente absorvida e nenhum segundo arquivo de feature criado
- Editor real substitui o stub sem CRUD genérico adicional
- Cinco tipos tipados ponta a ponta, sem `Mixed[]` ou campos estranhos com `null`
- Limites 25/50, margem BSON e gatilhos de reavaliação validados
- ETag/If-Match em todas as mutações do aggregate e conflito sem sobrescrita
- Autosave por linha com fila, coalescência, preservação de draft e sem toast de sucesso
- YouTube normalizado/validado e thumbnails derivadas
- Imagens WebP em duas variantes, sem original/base64 e com reconciliação de órfãos
- Ownership global aplicado em toda query e mutação
- Ordenação estável, paginação limitada, projeções lean e índice composto novo
- `autoIndex` desligado em preview/produção e índices geridos explicitamente
- Migração idempotente e incapaz de converter legado desconhecido silenciosamente
- CORS, CSP, ambiente, rate limits e segredos atualizados com segurança
- SDDs vivos e ADR afetados atualizados na implementação autorizada
- MSW, unitários, E2E e Playwright cobrindo caminhos felizes, limites e falhas
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz, E2E da API e integrados da UI aprovados
