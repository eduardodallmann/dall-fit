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
  responsividade e textos internos demais para a pessoa usuária.
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
7. Ajustar o ícone de play na tela `/training` para pertencer à composição do
   card e não parecer deslocado ao lado da imagem.
8. Ajustar o grid de cards de `/training` para não usar três colunas e antecipar
   a mudança para uma coluna quando o espaço interno ficar insuficiente.
9. Corrigir os overlays da execução: drawer mobile colado à parte inferior,
   proporção 9:16 para YouTube Short também no modal desktop e espaçamento
   suficiente para que títulos não sejam recortados em drawer ou modal.
10. Permitir que concluir série ou concluir séries restantes continue disponível
    enquanto o salvamento independente de uma carga digitada estiver pendente,
    desde que as mutations preservem a ordem, a versão e não usem uma carga
    obsoleta. O estado pending da carga não pode bloquear ações sem dependência
    dela.
11. Substituir, na comunicação voltada à pessoa usuária, “global” por termos
    compreensíveis como “modelo” ou “plano disponibilizado”, sem alterar paths,
    enums, contratos ou regras administrativas internas.
12. Exibir empty state na modal “Copiar um plano” quando não houver planos
    disponíveis, com orientação e ação coerentes com o estado.
13. Remover o título redundante “Identificação do plano” da modal de criação de
    plano próprio, mantendo “Novo plano de treino” como título principal.
14. Após criar um treino em `/training-plan/:catalogEntryId`, navegar para o
    workout recém-criado dentro do plano.
15. Permitir `Ctrl+Enter` no editor inline do título para confirmar o salvamento,
    respeitando pending, erro persistente, retry e acessibilidade existentes.
16. Impedir que o botão “Novo plano” quebre sua composição em tamanhos de tela
    suportados.
17. Corrigir contraste e legibilidade dos chips dos cards de `/training` nos
    temas claro e escuro usando tokens semânticos do design system.
18. Reestruturar o layout responsivo do cabeçalho dos cards de exercício na tela
    `/training/workout/:workoutId` (nos estados expandido e recolhido/fechado),
    garantindo que em viewports mobile (ex.: 390px) o nome, número, ícone de mídia,
    área muscular e resumo de séries/repetições fiquem acomodados sem estourar
    as margens nem quebrar o layout.
19. Reorganizar a composição da linha de cada série dentro do card de exercício
    expandido para assegurar espaçamento e alinhamento adequados entre o rótulo
    ("Série X"), a contagem de repetições ("12 repetições"), o campo de input da
    carga e o indicador/botão de conclusão, impedindo que o texto de repetições se
    amontoe ou colida com o campo de input em telas menores.

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
- criar screenshots de referência nesta fase; as rotas afetadas não possuem
  referências visuais aplicáveis para esta demanda.

## Projetos e documentação afetados

- API e endpoints: não se aplica; as mudanças devem consumir os contratos e
  mutations existentes. Confirmar durante a implementação que a invalidação após
  exclusão não exige novo endpoint.
- UI e rotas:
  - `ui/docs/sdd/routes/training.md`;
  - `ui/docs/sdd/routes/training-workout.md`;
  - `ui/docs/sdd/routes/training-plan.md`;
  - `ui/docs/sdd/routes/training-plan-detail.md`;
  - rotas e componentes correspondentes em `ui/src/routes/`.
- Fluxos:
  - atualizar `docs/sdd/flows/execucao-de-treino.md` para o retorno antes do
    início e os controles independentes de carga;
  - atualizar `docs/sdd/flows/gestao-planos-treino-pessoais.md` para a navegação
    após criação e a reconciliação após exclusão.
- Contratos em `@dall-fit/types`: não se aplica.
- Decisões arquiteturais: não se aplica; seguir TanStack Query, coordenadores de
  mutations e componentes HeroUI já vigentes.
- Handlers e fixtures MSW: atualizar os estados existentes de exclusão,
  criação/navegação, catálogo vazio, chat com múltiplos turnos e requests de
  carga pendentes, sem criar contrato paralelo.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

1. Links de produção para um workout não carregam `mockTraining`; links locais
   podem preservá-lo somente com mocks ativos.
2. Antes do início, a tela identifica o plano e o workout atuais e oferece retorno
   para a seleção. Depois do início, o retorno não descarta nem abandona sessão.
3. O header do exercício inteiro é um único controle acessível; clicar em texto,
   ícone ou área vazia do header produz o mesmo resultado do controle atual.
4. O input de carga possui label e hit area correspondente à sua caixa visível;
   clicar em qualquer ponto interno posiciona o foco no campo.
5. A exclusão de plano ativo remove o plano da próxima leitura de `/training` e
   não deixa cache confirmado obsoleto reaparecer após navegação.
6. A lista de mensagens do assistente rola para o último turno após uma resposta
   confirmada e durante o estado de carregamento, sem roubar foco de um campo em
   edição nem deslocar os controles fixos.
7. Cards de `/training` preservam imagem, nome, áreas e ação de play em uma
   composição estável; em larguras intermediárias há no máximo duas colunas e a
   largura menor usa uma coluna antes de comprimir o conteúdo.
8. Drawer mobile usa a borda inferior da viewport; overlays têm heading completo,
   padding interno e mídia com proporção correta.
9. Salvar carga e concluir série são mutations independentes quando a conclusão
   não depender da response do salvamento. A conclusão deve usar o draft atual de
   forma atômica quando a API exigir, e respostas tardias não podem sobrescrever
   o estado canônico mais novo.
10. Textos de produto evitam “global” quando o termo descreve modelos disponíveis
    à pessoa; nomes técnicos de rota, tipo e código permanecem internos.
11. Todos os estados vazios, pending, erro e retry das novas interações são
    acessíveis, preservam o draft recuperável e não usam mensagem como regra de
    decisão.
12. Em viewports mobile (ex.: 390px), o cabeçalho do card de exercício (expandido
    e recolhido) e as linhas de séries em `/training/workout/:workoutId` contêm
    espaçamento e distribuição de layout que impedem estouro de texto nas bordas do
    card e colisão da palavra "repetições" com o campo de entrada da carga.

## Requisitos não funcionais

- Acessibilidade: usar componentes HeroUI existentes, roles e labels semânticos,
  foco visível, teclado para header e `Ctrl+Enter`, contraste AA nos chips e foco
  devolvido ao trigger ao fechar overlays.
- Performance: o scroll do chat deve acompanhar somente mudanças relevantes do
  histórico, sem loop de efeito nem re-renderização contínua; queries devem ser
  invalidadas de forma localizada.
- Responsividade: validar pelo menos mobile de 390px e desktop de 1440px, além
  de uma largura intermediária que exercite a quebra do grid.
- Segurança e privacidade: não enviar parâmetros de mock em produção, não criar
  inferência sensível por nome e não expor conteúdo de chat em Analytics.
- Observabilidade: preservar os eventos Analytics existentes e seus enums; não
  adicionar IDs, cargas, nomes ou mensagens aos eventos.

## Critérios de aceite

### Cenário 1 — Navegação limpa para a execução

- Forma de validar: Playwright no fluxo `/training` → `/training/workout/:workoutId`.
- Link para testar: `http://localhost:3000/training?mockAuth=person&mockTraining=active-plan`.
- Given: mocks estão habilitados e a pessoa abre um card de treino.
- When: a pessoa navega para a prévia e observa a URL em produção simulada.
- Then: `mockTraining` só permanece quando o mecanismo de mock estiver ativo; a
  navegação reproduzível continua funcionando sem alterar o contrato de produção.

### Cenário 2 — Retorno antes de iniciar

- Forma de validar: Playwright na rota de workout.
- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=workout-preview`.
- Given: a prévia está aberta e nenhuma sessão foi iniciada.
- When: a pessoa aciona o breadcrumb/retorno.
- Then: volta para `/training` sem criar ou descartar sessão; após iniciar, o
  retorno não abandona a execução.

### Cenário 3 — Header e carga com área acionável completa

- Forma de validar: Vitest de componentes e Playwright da rota.
- Link para testar: o mesmo do Cenário 2, com fixture de sessão em andamento.
- Given: um exercício expandível e um campo de carga são visíveis.
- When: a pessoa clica no header fora do botão original e em diferentes pontos do
  campo de carga.
- Then: o exercício expande/recolhe, o input recebe foco e a navegação por teclado
  mantém o mesmo comportamento.

### Cenário 4 — Execução responsiva, cards e overlays

- Forma de validar: Playwright em 390px e 1440px.
- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=session-running`.
- Given: a pessoa visualiza a execução e abre descanso, duração ou vídeo YouTube Short.
- When: os cards de exercício (expandidos e recolhidos) e os overlays aparecem em mobile e desktop.
- Then: em mobile o drawer cola ao fundo, no desktop o Short preserva a proporção 9:16, nenhum título ou controle é cortado, e no card do exercício o cabeçalho e as linhas de séries mantêm o rótulo de repetições e o campo de carga alinhados sem amontoamentos ou estouro de margem em 390px.

### Cenário 5 — Mutations de carga independentes

- Forma de validar: Vitest para fila/coordenação e Playwright com latência MSW.
- Link para testar: o mesmo do Cenário 4.
- Given: o salvamento da carga está pendente.
- When: a pessoa conclui a série ou as séries restantes.
- Then: a ação não fica bloqueada sem dependência real, usa a intenção vigente,
  preserva a versão canônica e não permite resposta tardia sobrescrever estado
  mais novo.

### Cenário 6 — Catálogo e seleção atualizados

- Forma de validar: Playwright em jornada entre lista, detalhe e treino.
- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=personal-mixed`.
- Given: existe um plano ativo e a pessoa o exclui em Meus planos.
- When: navega novamente para `/training`.
- Then: o plano excluído não aparece; se não houver outro ativo, a tela mostra o
  empty state vigente. Ao criar um novo workout no detalhe, a UI navega para ele.

### Cenário 7 — Assistente e comunicação

- Forma de validar: Playwright com fixture do assistente e Vitest para o scroll.
- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-collecting`.
- Given: a conversa possui histórico e recebe um novo turno.
- When: a resposta é confirmada.
- Then: o histórico permanece visível até o turno mais recente; o campo e as ações
  continuam acessíveis, sem inferir sexo/gênero pelo nome, e textos voltados à
  pessoa não usam “global” onde “modelo disponibilizado” for equivalente.

### Cenário 8 — Estados e edição de planos

- Forma de validar: Playwright da rota pessoal.
- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=personal-empty`.
- Given: a biblioteca de cópia está vazia e a modal de novo plano é aberta.
- When: a pessoa abre “Copiar um plano”, cria um plano ou edita o título inline.
- Then: a modal mostra empty state, a criação exibe apenas o título principal,
  `Ctrl+Enter` salva o título, “Novo plano” não quebra e todos os chips da tela
  de treino permanecem legíveis nos dois temas.

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
  `/training-plan` e `/training-plan/:catalogEntryId` nos cenários acima, com MSW
  Browser e viewport mobile/intermediário/desktop.
- Playwright de flow: exclusão do plano ativo seguida de retorno a `/training` e
  criação de workout seguida de navegação ao editor.
- MSW: latência e falha da carga, catálogo vazio, exclusão confirmada, criação de
  workout, múltiplas mensagens do assistente e seletores sem parâmetros de mock em
  produção.
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
- Termos internos podem existir em títulos técnicos, logs, paths e Analytics,
  mas não em instruções, empty states, labels ou feedback de produto.
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