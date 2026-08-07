# ADR-0003: Modelagem dos planos de treino

- Status: `aceita`
- Data: `2026-08-07`
- Responsáveis: time Dall Fit

## Contexto

Planos de treino precisam ser reutilizáveis, começar como modelos globais
administrativos e futuramente admitir ownership pessoal. Cada plano contém
workouts, e cada workout conterá exercícios cuja edição ainda não faz parte do
produto atual. A modelagem precisa preservar atomicidade nas alterações locais da
árvore sem acoplar o plano ao documento de `Person`.

## Alternativas consideradas

### Coleções separadas por tipo de owner

Uma coleção para planos globais e outra para pessoais simplificaria filtros locais,
mas duplicaria schema, índices e evolução da mesma entidade. Mover ou clonar planos
entre os tipos também exigiria coordenação entre coleções.

### Plano embutido em `Person`

O ownership pessoal ficaria direto, porém planos globais não teriam proprietário
natural e o documento da pessoa cresceria junto da árvore completa de treinos.

### Coleção única com árvore embutida

Uma coleção `training_plans` usa `ownerPersonId: ObjectId | null` como único
discriminador. `null` representa plano global; um ID representará plano pessoal.
Workouts e exercícios ficam embutidos no documento proprietário.

## Decisão

Adotar a coleção única `training_plans`. Todo documento materializa
`ownerPersonId`; planos globais usam `null`. Workouts possuem `_id` próprio, nome e
array de exercícios, e ficam embutidos no plano. Exercícios também permanecerão
embutidos quando seu editor for introduzido.

O índice `{ ownerPersonId: 1, createdAt: -1 }` atende a separação por owner e a
ordenação vigente. Operações globais sempre incluem `ownerPersonId: null` no
filtro. A API pública projeta apenas resumos de workouts e `exerciseCount`, sem
expor ownership ou o array de exercícios.

## Consequências

### Positivas

- uma única entidade e um único caminho de evolução para planos globais e pessoais;
- criação e remoção de workout são alterações atômicas de um documento;
- exclusão do plano remove naturalmente toda sua árvore;
- leitura do detalhe não exige joins entre coleções;
- ownership permanece explícito sem inflar `Person`.

### Negativas e riscos

- o documento cresce com workouts e exercícios e permanece sujeito ao limite do
  MongoDB;
- edição concorrente de partes diferentes da árvore exige operações atômicas
  específicas e poderá demandar controle de versão no futuro;
- consultas isoladas e paginação de workouts/exercícios ficam menos naturais;
- migrar para coleções separadas depois de dados persistidos será custoso.

Se o tamanho real ou os padrões de consulta tornarem esses riscos concretos, uma
nova ADR deve avaliar a extração de workouts ou exercícios; esta decisão não
autoriza duplicar a árvore antecipadamente.

## Plano de adoção

1. Criar schema, índice, port e adapter MongoDB do domínio `training-plan`.
2. Persistir planos globais com `ownerPersonId: null` e workouts embutidos.
3. Projetar respostas sem ownership e sem exercícios.
4. Validar ownership, índice, projeções e mutações atômicas nos E2E com MongoDB
   efêmero.

## Links relacionados

- `../features/fit-0005-gestao-planos-treino-globais.md`
- `../flows/gestao-planos-treino-globais.md`
- `../../../api/docs/sdd/endpoints/global-training-plans.md`
