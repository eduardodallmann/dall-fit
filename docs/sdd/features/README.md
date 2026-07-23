# Features

Este diretório preserva o histórico das demandas e atividades executadas no
monorepo. Uma feature é criada antes da implementação, a partir de
`../templates/feature-spec.md`, e deve ser autocontida o suficiente para orientar a
execução e validar a entrega sem depender de conversas externas.

A feature pode afetar somente API, somente UI, pacotes ou configurações da raiz, ou
coordenar vários projetos. Os detalhes do comportamento atual continuam nos
documentos vivos proprietários: `base/`, `flows/`, endpoints e rotas.

Uma feature não registra status, ciclo de vida, data de criação ou data de
conclusão. Ela pode ser refinada enquanto orienta a implementação. Depois que a
demanda for entregue, o arquivo nunca é editado, renomeado, movido ou removido. Uma
mudança posterior exige uma nova feature, com referência à anterior quando útil.

Uma feature histórica pode divergir do sistema atual. Para conhecer o comportamento
vigente, consultar `flows/`, `api/docs/sdd/endpoints/`,
`ui/docs/sdd/routes/` e os documentos `base/`.

## Nomes

- Com ticket: `<ticket-em-minusculas>-<slug>.md`.
- Sem ticket: `<slug-descritivo-e-unico>.md`.

O arquivo deve manter o mesmo nome por toda a sua vida.
