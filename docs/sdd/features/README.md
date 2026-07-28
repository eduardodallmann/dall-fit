# Features

Este diretório preserva o histórico das demandas e atividades executadas no
monorepo. Uma feature é criada antes da implementação, a partir de
`../templates/feature-spec.md`, e deve ser autocontida o suficiente para orientar a
execução e validar a entrega sem depender de conversas externas.

O pedido para criar, documentar, detalhar, revisar ou refinar uma feature altera
somente seu arquivo. Não autoriza código, configuração, contratos executáveis,
mocks, testes nem mudanças antecipadas nos SDDs vivos. Depois de apresentar a
feature, o agente encerra o trabalho e aguarda uma mensagem posterior e explícita
do usuário autorizando a implementação.

A feature pode ser refinada em quantos turnos forem necessários antes dessa
autorização. Quando validada, passa a ser o contrato estável da implementação. Uma
necessidade de mudar seu escopo ou decisões interrompe a implementação e devolve a
feature à fase de especificação.

A feature pode afetar somente API, somente UI, pacotes ou configurações da raiz, ou
coordenar vários projetos. Os detalhes do comportamento atual continuam nos
documentos vivos proprietários: `base/`, `flows/`, endpoints e rotas.

Uma feature não registra status, checklist de progresso, ciclo de vida, data de
criação ou data de conclusão. Depois que a demanda for entregue, o arquivo nunca é
editado, renomeado, movido ou removido. Uma mudança posterior exige uma nova
feature, com referência à anterior quando útil.

Quando o usuário disser explicitamente para não criar feature, não criar arquivo
neste diretório e seguir apenas o escopo solicitado.

Uma feature histórica pode divergir do sistema atual. Para conhecer o comportamento
vigente, consultar `flows/`, `api/docs/sdd/endpoints/`,
`ui/docs/sdd/routes/` e os documentos `base/`.

## Nomes

- Com ticket: `<ticket-em-minusculas>-<slug>.md`.
- Sem ticket: `<slug-descritivo-e-unico>.md`.

O arquivo deve manter o mesmo nome por toda a sua vida.
