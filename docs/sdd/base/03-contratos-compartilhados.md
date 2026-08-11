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
- requests do editor cobrem nome do treino, criação por tipo, PATCH parcial do
  exercício, ordem final completa e imagem. Respostas de mutação expõem o recurso
  público; a versão resultante é transportada pelo `ETag` HTTP.
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
