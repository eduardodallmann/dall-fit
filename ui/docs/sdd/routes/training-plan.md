# Rota `/training-plan`

## Objetivo funcional

Catálogo de planos de qualquer pessoa autenticada, inclusive admin. Reúne planos
próprios, referências globais e linhas transitórias de clonagem; nenhum global
aparece sem a pessoa usar ou clonar. A query `page` segue paginação canônica de 20.

## Elementos, ações e estados

O cabeçalho “Meus planos” possui dropdown “Novo plano”: “Criar novo plano” abre o
formulário existente; “Copiar um plano” abre a biblioteca global paginada com
resumo de workouts/exercícios e ações “Clonar”/“Usar esse plano”. Ao iniciar uma
dessas ações, ambas ficam imediatamente bloqueadas somente para a mesma origem
enquanto o request estiver pendente. Uma origem com clone ativo da mesma pessoa
continua bloqueada na modal após a confirmação do job.

O mesmo dropdown mantém em terceiro lugar “Me ajude a criar”. A opção abre uma
Modal HeroUI ampla e consulta primeiro a sessão canônica. Sem sessão, exibe aviso
de finalidade/retenção e só cria depois de “Aceitar e continuar”. Com sessão,
restaura histórico, pergunta, respostas rápidas, estado e preview. Escape,
backdrop, fechar ou reload não apagam; “Desistir” usa AlertDialog e exclusão
confirmada. Nenhuma resposta vai para storage, cache PWA ou Analytics.

A conversa mostra uma pergunta por vez, opções e campo livre irmãos. As opções são
atalhos e o texto livre pode usar paráfrases ou, na agenda, combinações próprias de
2 a 7 dias e 15 a 120 minutos. Frequência ou duração informada isoladamente é
preservada e a conversa pergunta somente o dado ausente; expressões como meia
hora, uma hora e uma hora e meia são aceitas. Resposta relacionada mas diferente
dos atalhos não recebe mensagem de assunto fora do escopo. Somente o novo turno é
anunciado em live region separada; histórico, pergunta, envio,
loading, erro e preview têm nomes/estados acessíveis. O histórico apresenta o label
humano de uma resposta rápida, nunca seu valor interno. Pending bloqueia novos
envios e navegação/reload, exceto a navegação canônica iniciada pela própria
confirmação concluída. Falha mantém texto e oferece retry com a mesma intenção;
conflito 412 refaz GET e não mescla. `blocked` mostra a mensagem canônica e não
renderiza geração/criação. `ready` oferece gerar preview; `preview` mostra plano,
workouts, exercícios, séries, repetições, descanso e duração estimada, permite
ajuste e só então confirmação. Sucesso invalida o catálogo e navega para o novo
`catalogEntryId`.

Quando uma mensagem adianta respostas objetivas de perguntas futuras não
sensíveis, o histórico confirma pelos labels quais fatos foram registrados e a
conversa não repete essas perguntas. Informação insuficiente para uma categoria
subjetiva permanece pendente: tempo de prática não define sozinho experiência, e
o esclarecimento reconhece o contexto antes de pedir somente a confirmação que
falta. Perguntas clínicas, maioridade e aceite final sempre aparecem na sua etapa
e não são preenchidos antecipadamente.

Na experiência, relatos como “treinei por um ano, mas estou parado há três meses”
mantêm a pergunta atual e recebem um esclarecimento sobre familiaridade com
exercícios e equipamentos; a interrupção objetiva é registrada e sua pergunta não
é repetida depois. O comportamento também vale quando o provider tenta inferir um
nível ou deixa de devolver a resposta antecipada.

Uma sessão bloqueada continua visível enquanto o modal permanece aberto para que
a pessoa leia a orientação terminal. Fechar o modal por qualquer mecanismo nesse
estado abandona e exclui a sessão; a próxima abertura retorna ao aceite inicial e
inicia uma conversa nova. Sessões ainda continuáveis permanecem retomáveis ao
fechar normalmente, e “Desistir” continua sendo a exclusão explícita em qualquer
estado.

A tabela possui Nome, Origem, Em uso, Atualização e Ações. O radio não é a primeira
coluna, possui um único `name`, fica desabilitado no item ativo e nunca desmarca ao
ser clicado. Pode não haver nenhum ativo. A seleção aplica imediatamente um realce
discreto e persistente às células da linha ativa; falha restaura o destaque
confirmado anterior. Plano próprio oferece editar/excluir; referência oferece
navegação e “Excluir”, que visualmente remove o item mas envia desvinculação sem
versão.

Job aparece como linha não navegável “Clonando”, com estado/progresso. Em
`failed|start-failed` oferece retry; enquanto não terminal oferece cancelar. A
lista consulta novamente a cada dois segundos enquanto houver job. Conclusão troca
a linha por plano próprio inativo; cancelamento remove a linha.

Loading usa empty/skeleton da tabela; vazio orienta criar ou escolher modelo; erro
mostra “Tentar novamente”. Mutations permanecem pending, invalidam catálogo e
biblioteca no sucesso e exibem toast/erro sem inventar estado concluído.

No workout de uma referência global, os exercícios formam uma lista ordenada de
cards de consulta. Cada card mostra posição, ícone, nome, área corporal traduzida,
tipo traduzido em `Chip` e métricas separadas por rótulo; IDs e outros valores
técnicos de mídia não são exibidos. Imagem e miniatura do YouTube ocupam uma área
compacta à direita, inclusive em viewport móvel. Clique ou teclado abre o mesmo
modal amplo usado pelo editor: imagem usa a variante `display`, e vídeos curto e
longo preservam respectivamente 9:16 e 16:9 e montam o player somente enquanto o
modal está aberto. Mídia ausente tem placeholder explícito. A tela conserva aviso
de somente leitura e não renderiza inputs nem ações de gravação, exclusão ou ordem.

## Integrações e navegação

- `GET/POST /training-plans`, `GET /training-plans/library`;
- `POST /training-plans/global-references`, `PUT /training-plans/active`;
- `POST/DELETE /training-plan-clone-jobs` e `POST .../retry`;
- `GET/POST/DELETE /training-plan-assistant/session`, mensagens, drafts e
  confirmação nos subpaths singulares;
- clique no nome avança para `/training-plan/:catalogEntryId`;
- SSE global invalida catálogo/biblioteca; polling limitado garante progresso se o
  stream for perdido.

Formulários próprios alterados e mutations pendentes registram bloqueadores na
fronteira global de reload. Draft preservado após falha continua impedindo que uma
atualização PWA pronta recarregue o documento; fechar, confirmar ou descartar o
formulário remove seu owner. Biblioteca, tabela, polling de clone e overlays sem
valor local alterado não bloqueiam por si só.

## Acessibilidade

Tabela possui headers semânticos, nome como row header, radio rotulado pelo plano,
menus/dropdown operáveis por teclado e ações de clone com labels específicos. A
linha inteira não é usada como controle de seleção.
No workout somente leitura, a ordem usa `ol`, cada mídia possui botão nomeado pelo
exercício, os modais têm heading e fechamento acessíveis e devolvem foco ao trigger.
No assistente, foco fica contido na Modal/AlertDialog, respostas rápidas formam um
grupo nomeado, o label do campo persiste e emergência usa texto direto sem
interação que atrase a leitura.

## Cenários funcionais e cobertura

1. `?mockAuth=person&mockTrainingPlans=personal-mixed`: próprio e referência na
   mesma tabela; troca do radio mantém somente um ativo.
2. `?mockAuth=admin&mockTrainingPlans=personal-mixed`: admin também vê “Meus
   planos”, mantendo “Planos globais” separado no menu.
3. `?mockAuth=person&mockTrainingPlans=clone-running`: ações mutuamente bloqueadas
   durante o início, linha bloqueada, progresso e cancelamento.
4. `?mockAuth=person&mockTrainingPlans=clone-failed`: retry e cancelamento.
5. `assistant-collecting`, `assistant-resumed` e `assistant-multiple-answers`:
   início, retomada canônica após reload, resposta e correção;
   `assistant-version-conflict`: verdade canônica em duas abas.
6. `assistant-clarifying` e `assistant-health-clarification`: ambiguidade sem
   inferência segura nem geração.
7. `assistant-blocked` e `assistant-emergency`: encaminhamento sem preview.
8. `assistant-preview`: estrutura completa, ajuste, confirmação e navegação.
9. `assistant-provider-error`: erro persistente e retry; `assistant-abandon`:
   exclusão confirmada.

Implementação em `personal-list-page.tsx`, service/queries da rota; MSW em
`src/mocks/handlers/training-plans.ts`; Playwright em
`tests/integration/routes/personal-training-plan.spec.ts`. O assistente usa
`training-plan-assistant-service.ts`, componente route-owned em
`training-plan-assistant/` e handler/fixture homônimos. Analytics emite somente as
ações enumeradas `assistant_open|message|retry|abandon|preview|adjust|confirm` e
`outcome`, sem IDs ou conteúdo. Não há referência visual.
