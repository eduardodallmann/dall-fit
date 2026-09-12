# Governança do SDD

**SDD** significa **Spec-Driven Development** (Desenvolvimento Orientado por
Especificação). Neste projeto, a sigla também se refere ao conjunto de documentos
que registra as especificações, decisões, contratos e critérios de aceite usados
para orientar a implementação.

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

Quando o usuário declarar explicitamente que a atividade não cria feature, essa
decisão prevalece. Esse caminho é apropriado para ajustes estruturantes na
documentação base e outras mudanças cujo escopo explícito não representa uma
demanda a preservar em `features/`.

## Refinamento ramificado antes da feature

Após ler as fontes de verdade afetadas e antes de escrever ou refinar o arquivo de
uma feature, o agente deve separar:

- fatos e decisões já confirmados, que entram diretamente na futura spec;
- premissas inferidas, que precisam ser declaradas quando forem relevantes;
- decisões realmente pendentes, que formam um questionário ramificado.

O questionário trata uma decisão por vez para que cada resposta possa revelar,
eliminar ou reformular as próximas perguntas. Não existe quantidade fixa de
perguntas nem de alternativas: uma decisão pode ter de duas a N opções e pode ter
uma única proposta quando o objetivo for apenas confirmar uma consequência. As
alternativas devem ser concretas, mutuamente compreensíveis e informar impactos ou
trade-offs relevantes; quando houver recomendação técnica, ela deve ser indicada
com sua justificativa.

Fatos e escolhas já confirmados não são perguntados novamente. Uma certeza pode
voltar a ser uma decisão aberta quando uma resposta posterior invalidar a premissa
que a sustentava; nesse caso, o agente explica a dependência e reabre somente o
ponto afetado. O usuário também pode propor uma alternativa não antecipada, que
passa a integrar o ramo corrente.

Quando for possível estimar o percurso, o agente informa progresso aproximado no
formato `decisão X de Y`. O total não é uma promessa: deve ser atualizado quando
as respostas criarem ou eliminarem ramos. Se uma estimativa útil ainda não for
possível, o agente não inventa um número.

Pode não haver pergunta alguma quando o pedido, o SDD e decisões anteriores já
determinarem o escopo sem ambiguidade material. Encerrado o questionário, o agente
consolida as decisões, confirma que não restam pontos capazes de mudar escopo,
comportamento ou critérios de aceite e somente então escreve a feature. Essa etapa
não substitui o gate posterior entre a apresentação da feature e sua implementação.

## Separação entre especificação e implementação

A criação de uma feature é uma atividade `docs-only` isolada. Durante essa fase:

- somente o arquivo da feature é criado ou refinado;
- os documentos vivos são lidos como contexto, mas continuam descrevendo o sistema
  implementado no momento;
- código, configuração, contratos executáveis, mocks e testes não são alterados;
- a feature reúne autocontidamente todo o comportamento pretendido, impactos,
  cenários, decisões, riscos e validações planejadas;
- o agente apresenta o documento e encerra o trabalho para que o usuário o valide.

A implementação exige uma ordem explícita em uma mensagem posterior à apresentação
da feature. Pedidos para criar, documentar, detalhar, revisar ou refinar a feature
não concedem essa autorização, mesmo quando a implementação estiver completamente
descrita ou tiver sido mencionada no pedido inicial.

Após a autorização, a feature validada funciona como contrato da entrega. Código,
testes, mocks, contratos executáveis e documentos vivos são alterados juntos na
fase de implementação. A feature não é modificada silenciosamente para se adequar
ao código. Se surgir uma necessidade de mudar seu escopo ou uma decisão, a
implementação para, a feature volta à fase de especificação e uma nova ordem é
necessária depois da validação.

## Registro histórico de uma feature

Uma feature não possui status, checklists de progresso, datas de criação ou
conclusão nem seção de encerramento. O ticket relacionado e o histórico do
repositório já preservam a cronologia da atividade.

Durante a fase de especificação, a feature pode receber refinamentos de requisitos,
decisões, cenários e riscos. Depois que o usuário autoriza a implementação, seu
conteúdo permanece estável como o contrato validado. As condições esperadas da
entrega são declarativas, sem caixas que sejam marcadas durante o trabalho.

Depois que a demanda for entregue, o arquivo deixa de acompanhar o sistema:

- não editar conteúdo ou links;
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

Antes de planejar ou implementar APIs e configurações de dependências, agentes
seguem `05-documentacao-oficial-das-tecnologias.md`. Os índices oficiais otimizados
para IA ajudam a localizar a documentação atual, mas continuam subordinados às
versões instaladas e às decisões do SDD.

O SDD continua sendo a fonte de verdade. Arquivos de agente resumem a política e
não devem introduzir arquitetura, comportamento ou quality gates que não estejam
documentados aqui. Toda mudança na organização do SDD atualiza os pontos de entrada
na mesma alteração.
