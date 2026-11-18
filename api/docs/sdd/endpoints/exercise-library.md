# Biblioteca e cópia de exercícios globais

## Objetivo funcional

Uma pessoa autenticada encontra exercícios dos modelos globais e copia um conjunto
para um treino próprio. Os exercícios continuam embutidos nas árvores; a biblioteca
é uma projeção, sem catálogo persistente adicional. A cópia cria conteúdo e assets
independentes, sem alterar o plano global nem a seleção de planos ativos.

Módulo proprietário: `TrainingPlanModule`. Consumidores: editor pessoal da
[rota de workout](../../../../ui/docs/sdd/routes/training-plan-workout.md) e
[fluxo de planos pessoais](../../../../docs/sdd/flows/gestao-planos-treino-pessoais.md).

## Referências técnicas

| Papel | Símbolo e arquivo | Responsabilidade |
| --- | --- | --- |
| Transporte | [ExerciseLibraryController](../../../src/training-plan/controllers/exercise-library.controller.ts) | autenticação, DTOs, versão e response |
| Entrada | [ExerciseLibraryQueryDto e CopyExercisesDto](../../../src/training-plan/dto/exercise-library.dto.ts) | filtros e seleção ordenada validada |
| Orquestração | [ExerciseLibraryCommand](../../../src/training-plan/commands/exercise-library.command.ts) | coordenar leitura, captura, mídia e commit |
| Biblioteca | [ExerciseLibraryService](../../../src/training-plan/services/exercise-library.service.ts) | identidade, filtros, paginação e seleção obsoleta |
| Destino | [PersonalTrainingPlanService](../../../src/training-plan/services/personal-training-plan.service.ts) | resolver catálogo próprio pela sessão |
| Cópia | [ExerciseCopyService](../../../src/training-plan/services/exercise-copy.service.ts) | validar capacidade/versão e efetuar append |
| Persistência | [MongoExerciseLibraryRepository](../../../src/training-plan/repositories/mongo-exercise-library.repository.ts) | projeção dos representantes e append CAS em um documento |
| Estado do destino | [TrainingPlanRepository](../../../src/training-plan/repositories/training-plan.repository.ts) | inspecionar existência, contagem e versão via adapter Mongo existente |
| Mídia | [ExerciseImageService](../../../src/training-plan/services/exercise-image.service.ts) e [BlobStorageService](../../../src/training-plan/services/blob-storage.service.ts) | cópia privada, ETag, assinatura e compensação |
| Contratos | [ExerciseLibraryResponse, ExerciseLibrarySelection e CopyExercisesResponse](../../../../packages/types/src/contracts.ts) | estruturas públicas exportadas por `@dall-fit/types` |

## Contrato HTTP resumido

| Operação | Entrada | Sucesso |
| --- | --- | --- |
| `GET /training-plans/exercise-library` | `page` entre 1 e 100, `search` opcional até 120 caracteres e `bodyArea` opcional de `BODY_AREAS` | `200`, até 20 grupos, total filtrado e referência técnica do representante |
| `POST /training-plans/:catalogEntryId/workouts/:workoutId/exercises/copy` | `X-Resource-Version` do destino e `selections` com 1–50 grupos únicos | `201`, array de exercícios criados na ordem solicitada e versão resultante no header |

Ambas exigem sessão comum, por cookie Web ou Bearer nativo. Escrita Web exige
origem/CSRF; Bearer segue a autorização nativa. Não se exige `isAdmin`. Mutações
usam a quota do editor. Responses usam `Cache-Control: private, no-store`.

Uma seleção contém grupo, IDs do plano/workout/exercício global e versão de origem.
Não aceita payload de exercício, owner ou mídia enviado pelo cliente. A resposta
publica `Exercise` hidratado, sem keys, dimensões internas ou credenciais Blob.

O POST não é idempotente entre confirmações diferentes. CAS impede repetir a mesma
versão. Resultado incerto exige releitura antes de outra confirmação; nunca se
atualiza a versão para repetir a intenção automaticamente.

## Fluxo completo

### Entrada e leitura

O controller valida filtros e chama `ExerciseLibraryCommand.list`. O command pede
ao `ExerciseLibraryService` os representantes filtrados e paginados. Este consome
a port `ExerciseLibraryRepository`; o adapter Mongo filtra `ownerPersonId: null`,
desmembra workouts/exercícios e normaliza espaços antes de agrupar com collation
portuguesa sem diferença de caixa/acentuação. A ordenação por `updatedAt` do plano
e IDs decrescentes precede a escolha da primeira ocorrência do grupo. Pausas têm
grupo próprio, distinto de exercícios cujo nome seja `Pausa`.

O service gera identidade estável pelo nome normalizado, aplica busca parcial e
área do representante e ordena alfabeticamente antes de paginar. Uma ocorrência
antiga de outra área não muda o representante nem reaparece por causa do filtro.
O total conta grupos da interseção entre nome e área. Pausas aparecem apenas sem
restrição de área. MongoDB não devolve árvores completas ao consumidor.

O command hidrata somente as imagens da página, com a concorrência existente, e
monta `ExerciseLibraryResponse`. Lista vazia devolve `200` com total zero. Erro de
assinatura interrompe a leitura com `503 IMAGE_URL_SIGNING_FAILED`; a API não
devolve credenciais parciais. Falha Mongo inesperada segue o filtro global como
`500 INTERNAL_SERVER_ERROR`, sem alterar dados.

### Captura e preparação da cópia

1. O controller valida IDs e seleções aninhadas, interpreta a versão e chama
   `ExerciseLibraryCommand.copy`.
2. O command resolve o ID real do plano por
   `PersonalTrainingPlanService.resolveOwnedTrainingPlanId`. O service usa os
   repositories de catálogo/plano existentes. Entrada alheia ou inexistente é
   `404 TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND`; referência viva é
   `403 GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`.
3. `ExerciseCopyService.validate` consulta `TrainingPlanRepository.inspectTarget`
   com owner derivado da sessão. Valida workout, versão, soma de exercícios e
   tamanho atual, antes de qualquer cópia de mídia.
4. `ExerciseLibraryService.resolve` lê os representantes atuais e compara todos
   os IDs, grupos e versões com a seleção. Se algum mudou ou desapareceu, retorna
   `409 EXERCISE_LIBRARY_SELECTION_STALE`, com `details.staleGroupIds` para nova
   seleção explícita. Não troca uma ocorrência silenciosamente.
5. A captura bem-sucedida é o snapshot da tentativa. O command gera IDs novos,
   preserva os campos dos tipos e entrega o array a `ExerciseImageService`.
   Histórico, carga pessoal, ownership e identidade da origem não são copiados.

### Mídia e orçamento

Para cada imagem não nula, o service reserva um prefixo privado novo e copia
thumbnail/display pelo `BlobStorageService.copyVariant`. O SDK usa OIDC, operação
privada, destino sem overwrite e ETag da origem; se o ETag legado não existir,
consulta `head` primeiro. Até quatro imagens são processadas simultaneamente,
com no máximo oito variantes. O signal compartilhado limita a preparação a 45 s,
e cada operação Blob possui timeout menor. Os workers são drenados antes de limpar
destinos de uma falha, evitando que uma operação atrasada recrie um órfão.

Imagem nula e demais tipos não criam blobs. Falha de variante ou orçamento produz
`503 EXERCISE_IMAGE_COPY_FAILED`, sem append, e compensa somente keys novas. O
command assina todas as imagens copiadas antes do commit; falha de assinatura usa
`IMAGE_URL_SIGNING_FAILED` e também compensa. Exclusão global depois da captura
pode impedir uma cópia ainda não concluída, mas nunca remove o asset já copiado.

### Commit e saída

O command entrega o array pronto a `ExerciseCopyService.commit`. Seu repository
faz uma única atualização com owner, IDs, versão, capacidade e tamanho BSON
resultante no filtro. O array inteiro é acrescentado ao workout e a versão avança
uma vez. Nenhum item parcial fica visível.

Se o filtro não casar, o service reinspeciona o alvo: ausência de plano/workout,
versão antiga ou limite de exercícios recebem os erros correspondentes; estado
válido que excederia o BSON recebe `TRAINING_PLAN_SIZE_LIMIT_REACHED`. Essas
rejeições conhecidas permitem compensar a mídia nova. Se MongoDB rejeitar a
conexão depois do despacho, não se presume que a gravação falhou: o command retém
os assets e devolve `503 EXERCISE_COPY_RESULT_UNCERTAIN`. A UI deve reler o treino.

Sucesso monta `CopyExercisesResponse` com os novos exercícios na ordem solicitada
e devolve `X-Resource-Version`. Não chama YouTube nem Workflow para validar mídia
já existente. Sessão, CSRF e rate limit continuam pertencendo aos guards Redis;
falha dessa infraestrutura impede entrada no command.

## Mapa de caminhos possíveis

| Caminho | Resultado | Efeito |
| --- | --- | --- |
| consulta, busca vazia ou sem resultado | `200` | leitura projetada, assinatura da página |
| cópia válida | `201` | um append, uma versão, assets novos |
| query/body/IDs inválidos | `400 VALIDATION_ERROR` | nenhum |
| sessão ausente, transporte ambíguo, CSRF ou quota | contratos de autenticação | nenhum write de domínio |
| referência ou catálogo alheio | `403` ou `404` conforme acima | nenhum |
| versão ausente/antiga | `428 PRECONDITION_REQUIRED` ou `412 TRAINING_PLAN_VERSION_CONFLICT` | nenhum append |
| seleção obsoleta | `409 EXERCISE_LIBRARY_SELECTION_STALE` | nenhuma mídia copiada |
| soma acima de 50 ou BSON resultante no limite | `409 EXERCISE_LIMIT_REACHED` ou `TRAINING_PLAN_SIZE_LIMIT_REACHED` | nenhum append |
| mídia/assinatura | `503` específico | compensação dos novos destinos |
| commit incerto | `503 EXERCISE_COPY_RESULT_UNCERTAIN` | pode haver commit completo; assets retidos |

Todos os erros possuem `ApiError` e correlação. A reconciliação operacional protege
assets referenciados e só remove órfãos com pelo menos 24 h, para não alcançar
uploads e cópias ainda anteriores ao CAS.

## Cenários detalhados

Os seeds usam IDs exclusivos FIT107 e gravam somente uma credencial Bearer
fictícia local em `/tmp/dall-fit-exercise-library-token.txt`, com permissão `0600`,
e o body em `/tmp/dall-fit-exercise-copy.json`. Exigem infraestrutura local e
`AUTH_SESSION_SECRET` de desenvolvimento. Não dependem de bypass OAuth. Os demais
globais locais podem aparecer na biblioteca; os cenários usam nomes FIT107.

### Cenário 1 — agrupamento, busca e área do representante

**Seed**

```bash
pnpm -C api seed -- exercise-library:ready
```

**cURL**

```bash
curl --include --get http://localhost:4000/training-plans/exercise-library \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --data-urlencode 'page=1' --data-urlencode 'search=agachamento fit107' \
  --data-urlencode 'bodyArea=quadriceps'
```

- Given: dois globais com mesmo nome e áreas diferentes, sendo o mais novo de quadríceps.
- When: consulta nome e área.
- Then: `200`, um grupo, parâmetros e identidade da ocorrência mais recente. Trocar
  a área do mesmo cURL para `back` produz total zero, sem escolher a ocorrência antiga.

### Cenário 2 — cópia em lote e conflito por repetição da versão

**Seed**

```bash
pnpm -C api seed -- exercise-library:ready
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
```

- Given: treino próprio vazio, v0, e seleção de dois exercícios globais.
- When: confirma o lote.
- Then: `201`, dois IDs novos, campos preservados e versão 1. Repetir exatamente
  esse cURL recebe `412 TRAINING_PLAN_VERSION_CONFLICT` e não duplica o conjunto.

### Cenário 3 — seleção de origem obsoleta

**Seed**

```bash
pnpm -C api seed -- exercise-library:stale
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
```

- Given: a seleção capturou origem v0 e o seed prepara sua v1.
- When: envia a seleção antiga.
- Then: `409 EXERCISE_LIBRARY_SELECTION_STALE`, grupos afetados em `details`, sem mídia ou append.

### Cenário 4 — capacidade insuficiente

**Seed**

```bash
pnpm -C api seed -- exercise-library:limit
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
```

- Given: há 49 exercícios e o lote possui dois.
- When: solicita a cópia.
- Then: `409 EXERCISE_LIMIT_REACHED`, sem append parcial nem avanço de versão.

### Cenário 5 — tamanho BSON resultante

**Seed**

```bash
pnpm -C api seed -- exercise-library:size
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
```

- Given: árvore fictícia abaixo de 12 MiB, sem espaço para os dois exercícios.
- When: o repository compara o BSON candidato no próprio filtro CAS.
- Then: `409 TRAINING_PLAN_SIZE_LIMIT_REACHED`, árvore original preservada.

### Cenário 6 — referência somente leitura

**Seed**

```bash
pnpm -C api seed -- exercise-library:read-only
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
```

- Given: o catálogo aponta para uma referência global.
- When: tenta mutação por request direta.
- Then: `403 GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`, antes da preparação de mídia.

### Cenário 7 — catálogo inexistente ou alheio

**Seed**

```bash
pnpm -C api seed -- exercise-library:not-found
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
```

- Given: a entrada não está no catálogo da sessão.
- When: solicita a cópia.
- Then: `404 TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND`; mesma resposta para entrada de outra pessoa.

### Cenário 8 — variante de origem indisponível

**Seed**

```bash
pnpm -C api seed -- exercise-library:image-failure
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
```

- Given: a imagem possui keys fictícias que não existem no store; também é
  reproduzível no ambiente local sem credencial OIDC configurada.
- When: a cópia não consegue obter ou copiar a variante.
- Then: `503 EXERCISE_IMAGE_COPY_FAILED`; o treino não recebe nenhum item do lote.
  O seed não envia arquivos nem modifica o store real.

### Cenário 9 — query inválida e ausência de sessão

**Seed**

```bash
pnpm -C api seed -- exercise-library:ready
```

**cURL**

```bash
curl --include 'http://localhost:4000/training-plans/exercise-library?bodyArea=invalid' \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)"
curl --include http://localhost:4000/training-plans/exercise-library
```

- Given: uma sessão local válida no primeiro request e nenhuma no segundo.
- When: consulta com filtro inválido ou sem sessão.
- Then: respectivamente `400 VALIDATION_ERROR` antes do command e
  `401 AUTHENTICATION_REQUIRED` antes de consultar o domínio.

### Cenário 10 — precondição ausente e seleção inválida

**Seed**

```bash
pnpm -C api seed -- exercise-library:ready
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000101/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data '{"selections":[null]}'
```

- Given: o primeiro request omite a versão; o segundo possui um item inválido.
- When: solicita a cópia.
- Then: respectivamente `428 PRECONDITION_REQUIRED` e `400 VALIDATION_ERROR`, sem
  chamar a preparação de mídia ou alterar o destino.

### Cenário 11 — workout inexistente

**Seed**

```bash
pnpm -C api seed -- exercise-library:ready
```

**cURL**

```bash
curl --include --request POST \
  http://localhost:4000/training-plans/107000000000000000000020/workouts/107000000000000000000999/exercises/copy \
  --header "Authorization: Bearer $(cat /tmp/dall-fit-exercise-library-token.txt)" \
  --header 'Content-Type: application/json' --header 'X-Resource-Version: 0' \
  --data-binary @/tmp/dall-fit-exercise-copy.json
```

- Given: o catálogo é próprio, mas não contém o workout solicitado.
- When: valida o destino.
- Then: `404 WORKOUT_NOT_FOUND`, antes de capturar a origem ou copiar mídia.

## Regras de negócio cobertas por testes

- `exercise-library.service.spec.ts`: normalização, busca/área antes de paginação,
  ordem capturada e rejeição de origem obsoleta.
- `exercise-library.command.spec.ts`: IDs novos, assinatura pré-commit e diferença
  entre compensar CAS rejeitado e reter mídia em commit incerto.
- `training-plan.e2e-spec.ts`, cenários FIT107: agregação real, autorização,
  transporte, lote misto, mídia independente, falha de variante e commit incerto.
- `image-reconciliation.spec.ts`: período de proteção de cópias em andamento.

## Fora do comportamento atual

Não há referência viva de exercício, cópia de origem pessoal, job de Workflow ou
sucesso parcial. Perda de conexão depois do commit não autoriza repetir o lote.

## Aceite de termos como precondição

Depois dos guards de sessão/permissão/CSRF/quota e antes dos pipes/controllers de
negócio, a política exige recibo da publicação vigente. Pendência responde
`403 TERMS_ACCEPTANCE_REQUIRED`; ausência de publicação, `503 TERMS_NOT_CONFIGURED`;
consulta necessária indisponível, `503 TERMS_UNAVAILABLE`. Sem efeitos no domínio
deste endpoint. Os [cenários reproduzíveis de termos](terms.md) são proprietários
dessa fronteira; os seeds de negócio preparam recibos sintéticos explicitamente,
sem transformá-los em efeito do login.

## Imagens em exercícios de duração

A biblioteca identifica capacidade de imagem em `image` e `duration`, mantendo o
rótulo e os campos temporizados. `ExerciseImageService.toPublicExercise` assina
ambas; `copyExercises` copia suas duas variantes para um novo asset antes do CAS.
Compensação inclui duração, assinatura falha não publica lote parcial e resultado
incerto conserva destinos para releitura. A negociação de representação também
vale nesta resposta. Cópia, duplicação e exclusão da origem não compartilham assets.
