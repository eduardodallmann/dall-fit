# Feature Spec: Melhorias visuais e de comunicação nas jornadas de treino

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Depois de apresentar a feature, aguardar uma mensagem posterior e
> explícita do usuário autorizando sua implementação.

## Contexto e resultado esperado

- Ticket: [#75](https://github.com/eduardodallmann/dall-fit/issues/75).
- Problema: as jornadas de seleção e execução de treinos, gestão de planos e
  criação assistida possuem pequenos vazamentos de estado, caminhos de retorno
  pouco claros, áreas interativas menores que o affordance visual, problemas de
  responsividade e textos internos demais para a pessoa usuária. Em particular,
  a evidência mobile recebida mostra o cabeçalho recolhido sem espaço para nome e
  metadados, o cabeçalho expandido no limite do card e a palavra `repetições`
  comprimida contra o campo de carga.
- Resultado: a pessoa consegue navegar, executar, editar e criar planos com
  feedback visual coerente, controles acessíveis em toda a área esperada,
  atualização correta após exclusões e textos que descrevem o produto sem expor
  jargão interno.
- Referências:
  - rota vigente [`/training`](../../../ui/docs/sdd/routes/training.md);
  - rota vigente [`/training/workout/:workoutId`](../../../ui/docs/sdd/routes/training-workout.md);
  - rota vigente [`/training-plan`](../../../ui/docs/sdd/routes/training-plan.md);
  - rota vigente [`/training-plan/:catalogEntryId`](../../../ui/docs/sdd/routes/training-plan-detail.md);
  - fluxo de execução [`execucao-de-treino.md`](../flows/execucao-de-treino.md);
  - fluxo de planos pessoais [`gestao-planos-treino-pessoais.md`](../flows/gestao-planos-treino-pessoais.md).
- Dependências e fontes oficiais verificadas na especificação:
  - a UI possui `@heroui/react@3.2.2` e `@heroui/styles@3.2.2` instalados;
  - o catálogo oficial vigente oferece
    [Breadcrumbs](https://heroui.com/en/docs/react/components/breadcrumbs),
    [NumberField](https://heroui.com/en/docs/react/components/number-field),
    [Button](https://heroui.com/en/docs/react/components/button),
    [Card](https://heroui.com/en/docs/react/components/card),
    [Drawer](https://heroui.com/en/docs/react/components/drawer) e
    [Modal](https://heroui.com/en/docs/react/components/modal), que devem ser
    compostos conforme o design system local em vez de substituídos por
    equivalentes próprios.
- Features relacionadas:
  - `FIT-0058` estabeleceu o catálogo pessoal, referências globais e seleção ativa;
  - `FIT-0070` estabeleceu as rotas e a execução de treinos;
  - `FIT-0073` estabeleceu o assistente conversacional de planos;
  - `FIT-0059` estabeleceu os previews de mídia e overlays do editor.

## Escopo

### Incluído

1. Remover da navegação de `/training` para
   `/training/workout/:workoutId` o parâmetro local `mockTraining` quando os
   mocks não estiverem habilitados; preservar seletores somente no ambiente de
   desenvolvimento conforme a política de MSW.
2. Disponibilizar retorno facilitado da prévia do workout para `/training`, por
   breadcrumb ou controle equivalente, somente antes de iniciar o treino. Depois
   que a sessão for iniciada, manter a proteção e a navegação já definida para a
   execução.
3. Tornar todo o cabeçalho do exercício em execução a área acionável para
   expandir/recolher, preservando `aria-expanded`, teclado e a regra de somente
   um exercício expandido.
4. Fazer o campo de carga aceitar foco e seleção ao clicar em toda a superfície
   visual do campo, mantendo validação de inteiro entre 0 e 9999, valor vazio
   válido e o componente HeroUI vigente.
5. Garantir que a exclusão do plano ativo invalide ou reconcilie a consulta de
   `/training`, sem reapresentar o plano excluído ao retornar à rota.
6. Manter a conversa do assistente ancorada no turno mais recente quando novas
   mensagens forem adicionadas, sem mover os controles fixos de pergunta e envio.
7. Posicionar o ícone de play como overlay central da thumbnail na tela
   `/training`, sem consumir uma coluna própria nem aparecer deslocado ao lado da
   imagem.
8. Ajustar o grid de cards de `/training` para não usar três colunas e antecipar
   a mudança para uma coluna quando o espaço interno ficar insuficiente: uma
   coluna em 390px e 900px e, no máximo, duas colunas em 1440px.
9. Corrigir os overlays da execução: drawer mobile colado à parte inferior,
   proporção 9:16 para YouTube Short também no modal desktop e espaçamento
   suficiente para que títulos não sejam recortados em drawer ou modal.
10. Manter editáveis os campos de cargas das séries incompletas e permitir que
    concluir série ou concluir séries restantes continue disponível enquanto um
    salvamento de carga estiver pendente. Cada write entra na mesma fila FIFO da
    sessão e captura a versão quando alcançar sua cabeça; a conclusão envia
    atomicamente o draft mais recente das séries alcançadas, e uma resposta
    anterior não pode sobrescrever edição nem resultado mais novo.
11. Remover “global” da comunicação renderizada quando o termo significar um
    modelo disponibilizado. A introdução de `/training-plan` passa a ser
    exatamente `Crie planos próprios ou use modelos disponibilizados.` e as
    demais telas usam `modelo`, `modelo disponibilizado` ou flexões equivalentes.
    Paths, nomes de contratos, enums, código, logs e conceitos técnicos do SDD
    permanecem inalterados.
12. Exibir empty state na modal “Copiar um plano” quando não houver planos
    disponíveis, com título `Nenhum modelo disponível`, orientação para fechar e
    tentar novamente depois e nenhuma ação de usar ou clonar.
13. Remover o título redundante “Identificação do plano” da modal de criação de
    plano próprio, mantendo “Novo plano de treino” como título principal.
14. Após criar um treino em `/training-plan/:catalogEntryId`, navegar para o
    workout recém-criado dentro do plano.
15. Permitir `Ctrl+Enter` nos editores inline dos títulos de plano e workout para
    confirmar o salvamento, respeitando pending, erro persistente, retry e
    acessibilidade existentes.
16. Impedir que o botão “Novo plano” das listas pessoal e administrativa quebre
    ícones e texto em linhas diferentes nos tamanhos de tela suportados.
17. Corrigir contraste e legibilidade dos chips dos cards de `/training` nos
    temas claro e escuro usando tokens semânticos do design system.
18. Reestruturar o layout responsivo do cabeçalho dos cards de exercício na tela
    `/training/workout/:workoutId` (nos estados expandido e recolhido/fechado),
    garantindo que em 390px o nome possa quebrar linha e que número, ícone de
    mídia, área muscular e resumo de séries/repetições continuem legíveis, sem
    sobreposição, corte, estouro horizontal ou conteúdo fora das margens.
19. Reorganizar a composição da linha de cada série dentro do card de exercício
    expandido para assegurar espaçamento e alinhamento adequados entre o rótulo
    (`Série X`), a contagem de repetições (`12 repetições`), o campo de carga e o
    indicador de conclusão. Em 390px, os quatro elementos podem mudar de linha,
    mas não podem se sobrepor, ser truncados ou produzir rolagem horizontal.

### Não incluído

- criar novos endpoints ou alterar requests/responses da API;
- alterar a regra de seleção ativa, a sessão de treino, a persistência de cargas
  ou a semântica dos cinco tipos de exercício;
- inferir sexo ou gênero a partir do nome da pessoa. Nome não é uma base segura
  ou suficientemente precisa para uma decisão sobre gestação; a conversa deve
  manter pergunta neutra ou coletar somente uma resposta explicitamente dada pela
  pessoa;
- alterar o catálogo de exercícios, a seleção dos modelos disponibilizados ou a
  autorização administrativa;
- transformar os parâmetros `mock*` em parâmetros de produção;
- transformar a captura mobile do defeito em referência visual aprovada: ela
  demonstra o problema, mas não define o layout esperado;
- criar referência visual para `/training` ou `/training/workout/:workoutId`, pois
  essas rotas não possuem assets e a demanda não fornece uma imagem-alvo.

## Projetos e documentação afetados

- API e endpoints: não se aplica; as mudanças devem consumir os contratos e
  mutations existentes. Confirmar durante a implementação que a invalidação após
  exclusão não exige novo endpoint.
- UI e rotas:
  - `ui/docs/sdd/routes/training.md`;
  - `ui/docs/sdd/routes/training-workout.md`;
  - `ui/docs/sdd/routes/training-plan.md`;
  - `ui/docs/sdd/routes/training-plan-detail.md`;
  - `ui/docs/sdd/routes/training-plan-workout.md`;
  - `ui/docs/sdd/routes/dash.md`;
  - `ui/docs/sdd/routes/global-training-plan.md`;
  - `ui/docs/sdd/routes/global-training-plan-detail.md`;
  - `ui/docs/sdd/routes/global-training-plan-workout.md`;
  - rotas e componentes correspondentes em `ui/src/routes/`.
  - as referências existentes de `dash`, `training-plan`,
    `training-plan-detail`, `training-plan-workout` e das três rotas
    administrativas são documentação viva: corrigir os documentos que hoje
    declaram indevidamente não possuir referência, atualizar as imagens e as
    respectivas tabelas quando a nova comunicação alterar texto nelas e não usar
    as imagens atuais como aceite da cópia nova.
- Fluxos:
  - atualizar `docs/sdd/flows/execucao-de-treino.md` para o retorno antes do
    início e os controles independentes de carga;
  - atualizar `docs/sdd/flows/gestao-planos-treino-pessoais.md` para a navegação
    após criação e a reconciliação após exclusão.
- Contratos em `@dall-fit/types`: não se aplica.
- Decisões arquiteturais: não se aplica; seguir TanStack Query, coordenadores de
  mutations e componentes HeroUI já vigentes.
- Handlers e fixtures MSW: atualizar os estados existentes de exclusão,
  criação/navegação, chat com múltiplos turnos e requests de carga pendentes;
  acrescentar um seletor local explícito para biblioteca de modelos vazia, que é
  diferente de catálogo pessoal vazio, sem criar contrato de produção paralelo.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

1. Links de produção para um workout não carregam `mockTraining`; links locais
   podem preservá-lo somente com mocks ativos.
2. Antes do início, a tela identifica o plano e o workout atuais e oferece retorno
   para a seleção. Depois do início, esse breadcrumb/controle deixa de ser
   exibido; a navegação geral não descarta nem abandona a sessão.
3. O header do exercício inteiro é um único controle acessível; clicar em texto,
   ícone ou área vazia do header produz o mesmo resultado do controle atual.
4. O input de carga possui label e hit area correspondente à sua caixa visível;
   clicar em qualquer ponto interno posiciona o foco no campo.
5. A exclusão de plano ativo remove imediatamente as queries do domínio de treino
   ou as invalida e aguarda sua reconciliação antes da próxima apresentação de
   `/training`; cache confirmado obsoleto não pode reaparecer após navegação.
6. A lista de mensagens do assistente rola para o último turno após uma resposta
   confirmada e durante o estado de carregamento, sem roubar foco de um campo em
   edição nem deslocar os controles fixos.
7. Cards de `/training` preservam imagem, nome, áreas e ação de play em uma
   composição estável. O play fica centralizado sobre a thumbnail; a lista usa
   uma coluna em 390px e 900px e no máximo duas em 1440px.
8. Drawer mobile usa a borda inferior da viewport; overlays têm heading completo,
   padding interno e mídia com proporção correta.
9. Pending de salvamento de uma carga não desabilita os campos das demais séries
   incompletas, a própria continuação da edição nem as ações de conclusão. Cada
   write é enfileirado na sessão, usa a versão canônica vigente ao iniciar sua
   request e, quando conclui séries, envia o draft mais recente aplicável; uma
   response anterior nunca regride cargas, conclusão ou versão mais novas.
10. Nenhum texto renderizado usa “global” para descrever modelos disponibilizados;
    a única ocorrência permitida é conteúdo de domínio que não seja apresentado à
    pessoa, como path, contrato, enum, identificador, log e documentação técnica.
11. Todos os estados vazios, pending, erro e retry das novas interações são
    acessíveis, preservam o draft recuperável e não usam mensagem como regra de
    decisão.
12. Em 390px, o cabeçalho do card de exercício expandido e recolhido mostra nome e
    metadados sem sobreposição ou estouro horizontal; cada linha de série mantém
    `Série X`, `12 repetições`, campo de carga e indicador integralmente legíveis,
    com quebra responsiva se necessária e sem colisão entre elementos.

## Requisitos não funcionais

- Acessibilidade: usar componentes HeroUI existentes, roles e labels semânticos,
  foco visível, teclado para header e `Ctrl+Enter`, contraste AA nos chips e foco
  devolvido ao trigger ao fechar overlays. `Ctrl+Enter` não substitui o acionamento
  acessível por Tab e Enter no controle explícito de salvar.
- Performance: o scroll do chat deve acompanhar somente mudanças relevantes do
  histórico, sem loop de efeito nem re-renderização contínua; queries devem ser
  invalidadas de forma localizada.
- Responsividade: validar 390px, 900px e 1440px; a largura intermediária comprova
  a antecipação para uma coluna e não pode ser substituída apenas pelos extremos.
- Segurança e privacidade: não enviar parâmetros de mock em produção, não criar
  inferência sensível por nome e não expor conteúdo de chat em Analytics.
- Observabilidade: preservar os eventos Analytics existentes e seus enums; não
  adicionar IDs, cargas, nomes ou mensagens aos eventos.

## Critérios de aceite

### Cenário 1 — Navegação limpa para a execução

- Forma de validar: Vitest do gerador de search e Playwright do fluxo
  `/training` → `/training/workout/:workoutId`.
- Link para testar: `http://localhost:3000/training?mockAuth=person&mockTraining=active-plan`.
- Given: a mesma navegação é montada com mocks habilitados e desabilitados.
- When: a pessoa abre um card de treino.
- Then: com mocks habilitados, o seletor necessário ao cenário permanece; com
  mocks desabilitados, a URL de destino não contém `mockTraining` nem outro
  seletor local.

### Cenário 2 — Retorno antes de iniciar

- Forma de validar: Playwright na rota de workout.
- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=workout-preview`.
- Given: a prévia está aberta e nenhuma sessão foi iniciada.
- When: a pessoa aciona o breadcrumb/retorno.
- Then: volta para `/training` sem criar ou descartar sessão; após iniciar, esse
  controle específico não é exibido e a sessão só pode ser abandonada pelo fluxo
  explícito já protegido.

### Cenário 3 — Header e carga com área acionável completa

- Forma de validar: Vitest de componentes e Playwright da rota.
- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=session-running`.
- Given: um exercício expandível e um campo de carga são visíveis.
- When: a pessoa clica no header fora do botão original e em diferentes pontos do
  campo de carga.
- Then: o exercício expande/recolhe, o input recebe foco e a navegação por teclado
  mantém o mesmo comportamento.

### Cenário 4 — Execução responsiva, cards e overlays

- Forma de validar: Playwright em 390px e 1440px.
- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=session-running`.
- Given: a pessoa visualiza a execução e abre descanso, duração ou vídeo YouTube
  Short.
- When: os cards expandidos/recolhidos e os overlays aparecem em mobile e desktop.
- Then: em 390px o drawer toca a borda inferior da viewport, e cabeçalhos e linhas
  de série exibem integralmente os elementos definidos nesta feature sem
  sobreposição ou rolagem horizontal; em 1440px o Short preserva 9:16; nenhum
  heading ou controle é recortado nos dois viewports.

### Cenário 5 — Mutations de carga independentes

- Forma de validar: Vitest para fila/coordenação e Playwright com latência MSW.
- Link para testar: o mesmo do Cenário 4.
- Given: o salvamento da carga está pendente.
- When: a pessoa altera outra série e conclui a série atual ou todas as restantes.
- Then: os campos de séries incompletas e as ações não ficam bloqueados pelo
  pending global, os writes seguem FIFO com suas versões canônicas, a conclusão
  usa a intenção vigente e nenhuma resposta tardia sobrescreve edição ou estado
  mais novo.

### Cenário 6 — Cards da seleção de treino

- Forma de validar: Playwright em 390px, 900px e 1440px, nos temas claro e escuro.
- Link para testar: `http://localhost:3000/training?mockAuth=person&mockTraining=active-plan`.
- Given: a lista possui cards com thumbnail de vídeo, nomes, áreas e chips.
- When: a rota é renderizada nos três viewports e nos dois temas.
- Then: o play fica centralizado sobre a thumbnail, a lista possui uma coluna em
  390px e 900px e no máximo duas em 1440px, os cards não comprimem seu conteúdo e
  chips mantêm contraste AA e texto legível.

### Cenário 7 — Exclusão do plano ativo reconcilia treino

- Forma de validar: Playwright em jornada entre lista, detalhe e treino.
- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=personal-mixed`.
- Given: existe um plano ativo e a pessoa o exclui em Meus planos.
- When: navega novamente para `/training`.
- Then: o plano excluído não aparece; se não houver outro ativo, a tela mostra o
  empty state vigente, sem flash do plano removido vindo do cache.

### Cenário 8 — Criação navega para o novo workout

- Forma de validar: Playwright entre detalhe e editor pessoal.
- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001?mockAuth=person&mockTrainingPlans=personal-mixed`.
- Given: um plano próprio editável está aberto.
- When: a pessoa cria um workout válido.
- Then: após a response de sucesso, a UI navega para
  `/training-plan/:catalogEntryId/workout/:workoutId` usando o ID canônico criado;
  pending ou falha não navegam.

### Cenário 9 — Assistente acompanha o turno sem inferência por nome

- Forma de validar: Playwright com fixture do assistente e Vitest para o scroll.
- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-collecting`.
- Given: a conversa possui histórico e recebe um novo turno.
- When: a resposta é confirmada.
- Then: o histórico permanece visível até o turno mais recente; o campo e as ações
  continuam acessíveis; estar lendo turnos antigos não causa salto indevido; nome
  da pessoa não elimina, preenche nem altera pergunta sensível, que permanece
  neutra e depende de resposta explícita.

### Cenário 10 — Biblioteca de modelos vazia

- Forma de validar: Playwright da rota pessoal com o novo seletor local
  `library-empty`.
- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=library-empty`.
- Given: o catálogo pessoal pode conter itens, mas a biblioteca para cópia não
  possui modelos disponíveis.
- When: a pessoa abre `Copiar um plano`.
- Then: a modal mostra `Nenhum modelo disponível`, orienta fechar e tentar depois,
  não renderiza ações de usar/clonar e mantém fechamento e foco acessíveis.

### Cenário 11 — Criação, edição por teclado e botões estáveis

- Forma de validar: Playwright das listas e dos editores em 390px e 1440px.
- Links para testar:
  - `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=empty`;
  - `http://localhost:3000/training-plan/74b000000000000000000001?mockAuth=person&mockTrainingPlans=personal-mixed`;
  - `http://localhost:3000/training-plan/74b000000000000000000001/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=personal-mixed`;
  - `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=success`.
- Given: as listas permitem criar plano e os editores permitem alterar os títulos
  inline de plano e workout.
- When: a pessoa abre a criação pessoal e, em cada editor, pressiona `Ctrl+Enter`
  após alterar o título.
- Then: a modal possui apenas `Novo plano de treino` como heading, o atalho salva
  uma vez respeitando pending/erro, e cada botão `Novo plano` mantém ícones e texto
  na mesma linha nos dois viewports.

### Cenário 12 — Comunicação sem jargão interno

- Forma de validar: inventário automatizado das strings renderizadas e Playwright
  das superfícies pessoais e administrativas.
- Links para testar:
  - `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=personal-mixed`;
  - `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=success`.
- Given: a pessoa percorre lista, biblioteca, detalhe e workout de modelos, e a
  administração percorre menu, lista, detalhe e workout correspondentes.
- When: títulos, descrições, origens, alertas, empty states, confirmações e erros
  são apresentados.
- Then: a introdução pessoal é exatamente a definida nesta feature e nenhum texto
  renderizado usa `global` para comunicar modelo disponibilizado; identificadores
  técnicos continuam intactos. As referências visuais existentes das sete rotas
  afetadas representam a nova cópia nos viewports já documentados.

## Estratégia de entrega e compatibilidade

Implementar em fatias independentes por domínio: treino/execução, catálogo de
planos e assistente/comunicação. Cada fatia deve manter a API existente e aplicar
as regras de mutations recuperáveis, invalidação canônica e estilos em `styles.ts`.
As atualizações dos SDDs vivos, handlers, fixtures e testes devem acompanhar a
implementação autorizada; esta spec não os altera antecipadamente.

## Plano de testes

- Vitest: funções de sanitização de search params, decisão de retorno antes/depois
  do início, scroll do histórico, quebra responsiva derivada, foco do input,
  atalho `Ctrl+Enter`, semântica de chips e coordenação entre mutations de carga
  e conclusão.
- Componentes: header acionável, empty state da biblioteca, título único, modal e
  drawer com headings não recortados, estados pending/erro/retry e acessibilidade.
- Playwright de rotas: `/training`, `/training/workout/:workoutId`,
  `/training-plan`, suas rotas descendentes, `/dash` e as três rotas
  `/global/training-plan*` nos cenários acima, com MSW Browser e viewport
  mobile/intermediário/desktop.
- Playwright de flow: exclusão do plano ativo seguida de retorno a `/training` e
  criação de workout seguida de navegação ao editor.
- MSW: latência e falha da carga, biblioteca de modelos vazia separada do catálogo
  pessoal vazio, exclusão confirmada, criação de workout, múltiplas mensagens do
  assistente e seletores sem parâmetros de mock em produção.
- Referências visuais: atualizar as imagens e tabelas existentes das sete rotas
  cuja comunicação muda; não criar golden/reference nova para as duas rotas de
  treino que hoje não possuem assets.
- Não executar E2E da API: não há endpoint, wiring, MongoDB ou Redis alterado.

## Riscos e decisões

- Desacoplar o salvamento da carga da conclusão pode produzir divergência se a
  conclusão depender do retorno da primeira mutation. A implementação deve definir
  explicitamente a fonte canônica enviada à conclusão e cobrir resposta tardia;
  se o contrato atual não permitir independência sem alterar API, a mudança deve
  retornar à especificação em vez de criar um contrato implícito.
- A rolagem automática do chat não deve interromper leitura de mensagens antigas;
  acompanhar o fim somente quando a pessoa já estiver próxima dele ou quando um
  novo turno for confirmado.
- Termos internos podem existir em símbolos de código, documentos técnicos, logs,
  paths e Analytics, mas não em títulos, instruções, empty states, labels ou
  feedback renderizados.
- Não inferir sexo por nome é uma decisão de precisão, acessibilidade e
  privacidade; a conversa deve perguntar somente quando a informação for necessária
  e permitir resposta neutra.
- O parâmetro `mockTraining` é uma seleção exclusiva de desenvolvimento. Sua
  remoção em produção não pode quebrar links reproduzíveis ou o isolamento dos
  cenários Playwright.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Rotas e fluxos afetados atualizados
- Handlers, fixtures MSW e testes de UI atualizados conforme o impacto
- Navegação, cache, teclado, foco, contraste e responsividade validados
- Nenhuma inferência de sexo/gênero baseada em nome adicionada
- Quality gates da raiz aprovados
