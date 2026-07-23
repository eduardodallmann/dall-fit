# Governança do SDD

## Hierarquia

O SDD possui três contextos:

1. raiz: coordenação do monorepo e comportamento ponta a ponta;
2. `api/`: comportamento e arquitetura de backend;
3. `ui/`: comportamento e arquitetura de frontend.

Quando documentos parecerem conflitantes, o documento proprietário do detalhe deve
ser corrigido e os documentos de coordenação devem apontar para ele.

## Natureza dos documentos

| Diretório                 | Natureza  | Responsabilidade                                               |
| ------------------------- | --------- | -------------------------------------------------------------- |
| `docs/sdd/base/`          | Viva      | Padrões e arquitetura transversal vigentes                     |
| `docs/sdd/features/`      | Histórica | Demanda, atividade, decisões e validação de uma entrega        |
| `docs/sdd/flows/`         | Viva      | Comportamento ponta a ponta vigente                            |
| `docs/sdd/adr/`           | Histórica | Decisões arquiteturais e suas substituições                    |
| `api/docs/sdd/base/`      | Viva      | Arquitetura e padrões vigentes do backend                      |
| `api/docs/sdd/endpoints/` | Viva      | Comportamento vigente dos endpoints                            |
| `ui/docs/sdd/base/`       | Viva      | Arquitetura e padrões vigentes do frontend                     |
| `ui/docs/sdd/routes/`     | Viva      | Comportamento e referências visuais vigentes das rotas e telas |

Documentação viva é atualizada no mesmo trabalho que muda o sistema e descreve
somente a verdade atual. Documentação histórica preserva o contexto de uma
atividade ou decisão em seu momento e não é reescrita para acompanhar o sistema.

## Quando criar documentos

- feature: antes da implementação de uma demanda ou atividade com escopo, critérios
  de aceite e decisões próprios, a partir de `templates/feature-spec.md`; ela pode
  afetar um ou vários projetos;
- fluxo: ao introduzir ou mudar uma jornada que coordena API e UI;
- endpoint: ao introduzir ou mudar comportamento HTTP observável;
- rota: ao introduzir ou mudar comportamento observável de uma tela;
- ADR: antes de consolidar uma decisão transversal com trade-offs relevantes.

Uma correção exclusivamente editorial, sem demanda nem mudança de comportamento,
pode atualizar apenas a documentação viva. Uma feature spec nunca substitui
endpoint, rota, fluxo ou base.

## Registro histórico de uma feature

Uma feature não possui status, datas de criação ou conclusão nem seção de
encerramento. O ticket relacionado e o histórico do repositório já preservam a
cronologia da atividade.

Enquanto orienta a implementação, a feature pode receber refinamentos de
requisitos, decisões, cenários e riscos. Antes de considerar a demanda entregue,
deve-se:

1. atualizar todos os endpoints, rotas, flows, bases e contratos vivos afetados;
2. atualizar os testes, mocks, seeds e referências visuais aplicáveis;
3. executar as validações aplicáveis ou registrar a justificativa de dispensa;
4. concluir a definição de pronto.

Depois que a demanda for entregue, o arquivo deixa de acompanhar o sistema:

- não editar conteúdo, checklist ou links;
- não renomear, mover ou remover o arquivo;
- não adequar o texto ao comportamento atual.

Se uma entrega precisar de correção, complemento ou evolução posterior, criar uma
nova feature e relacioná-la à anterior quando a relação ajudar a compreender a
demanda. O original permanece como registro do escopo que orientou aquela entrega.

O nome do arquivo também é histórico e estável:

- com ticket: `<ticket-em-minusculas>-<slug>.md`;
- sem ticket: `<slug-descritivo-e-unico>.md`.

Links de uma feature para documentação viva indicam os artefatos afetados pela
entrega. Como o destino pode evoluir, seu conteúdo futuro não deve ser usado para
reinterpretar o que a feature histórica entregou.

## Referências

Links entre documentos usam caminhos relativos e apontam para arquivos, não para
conversas ou tickets inacessíveis. Tickets podem aparecer como identificador e
contexto, nunca como única fonte de requisitos.

Exemplos e fixtures não contêm tokens, credenciais ou dados pessoais reais.

## Agentes de IA

Ferramentas de IA entram no projeto pelos arquivos:

- `AGENTS.md`: instrução central para Codex e agentes compatíveis;
- `CLAUDE.md`: entrada do Claude;
- `GEMINI.md`: entrada do Gemini;
- `.github/copilot-instructions.md`: entrada do GitHub Copilot.

`AGENTS.md` roteia o agente para o SDD transversal e para o SDD proprietário de API
ou UI. Os arquivos específicos de ferramenta apenas apontam para essa instrução
central, evitando políticas divergentes.

O SDD continua sendo a fonte de verdade. Arquivos de agente resumem a política e
não devem introduzir arquitetura, comportamento ou quality gates que não estejam
documentados aqui. Toda mudança na organização do SDD atualiza os pontos de entrada
na mesma alteração.
