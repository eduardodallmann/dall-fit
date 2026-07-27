# Copilot Instructions

Siga `AGENTS.md` e trate os SDDs como fonte de verdade.

Antes de sugerir ou alterar código, leia `docs/sdd/` e o SDD proprietário do escopo:
`api/docs/sdd/` para backend e `ui/docs/sdd/` para frontend. Atualize a documentação
viva, contratos, mocks e testes junto da implementação. Respeite os quality gates e
a estratégia de testes definida em `AGENTS.md`. Não altere features de demandas já
entregues: elas são registros históricos e uma evolução exige nova feature.

Pedidos para criar ou refinar uma feature autorizam somente seu SDD autocontido.
Encerre o trabalho depois de apresentá-lo; implemente e atualize os SDDs vivos
somente após uma ordem explícita do usuário em uma mensagem posterior.
