# Feature Spec: Melhorias visuais e de consistência no editor de exercícios

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #46 — melhorar aparencia da tela de exercicios](https://github.com/eduardodallmann/dall-fit/issues/46)
- Problema: a jornada de edição de exercícios apresenta inconsistências visuais
  entre telas, baixo contraste de campos no tema escuro, feedback insuficiente na
  reordenação, deslocamentos durante mutações, ações pouco evidentes e dados
  antigos ao retornar ao treino depois de uma alteração.
- Resultado: tornar a jornada visualmente consistente, responsiva e acessível,
  deixar claras as ações e os estados do editor e garantir que toda mutação
  bem-sucedida seja refletida ao sair e voltar para o treino sem depender de uma
  atualização manual do navegador.
- Referências:
  - as sete imagens anexadas à issue foram inspecionadas em resolução original;
  - a comparação entre as tabelas define que nomes de treinos navegáveis devem ter
    o mesmo affordance visual já usado pelos nomes de planos;
  - a comparação dos modais em tema escuro define que a superfície dos campos deve
    ser distinguível da superfície do modal;
  - a referência de menu com ícone, título e descrição orienta o seletor de tipo de
    exercício;
  - a referência com conteúdo central entre divisores orienta a posição do botão
    de adição;
  - a proposta de card de exercício orienta a hierarquia entre cabeçalho, dados de
    identificação/mídia e campos numéricos, sem exigir uma cópia literal de cores,
    textos ou dimensões da imagem;
  - documentação oficial consultada: [HeroUI — Separator](https://www.heroui.com/docs/components/separator),
    [HeroUI — Dropdown](https://www.heroui.com/docs/components/dropdown),
    [dnd kit — Drag overlay](https://docs.dndkit.com/api-documentation/draggable/drag-overlay)
    e [TanStack Query — Query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).
- Features relacionadas:
  - `FIT-0005` — gestão de planos de treino globais;
  - `FIT-0007` — menu da aplicação;
  - `FIT-0019` — tema claro e escuro;
  - `FIT-0028` — editor de exercícios, escalabilidade e concorrência;
  - `FIT-0030` — paginação e recuperação de concorrência em planos.

## Escopo

### Incluído

- reposicionar, no menu da aplicação, o seletor de tema e o logout ao lado do
  avatar;
- evidenciar os nomes de treino navegáveis na tabela de detalhe do plano;
- aumentar o contraste dos campos no tema escuro, inclusive em modais e no editor
  de exercícios;
- aprimorar a apresentação e o comportamento visual da reordenação por arrastar;
- sincronizar o cache das consultas afetadas por qualquer mutação do editor;
- padronizar a hierarquia de títulos e o alinhamento da ação de renomear treino;
- estabilizar o espaço da ação de exclusão durante o carregamento;
- apresentar um empty state quando a lista de exercícios estiver vazia;
- reposicionar e redesenhar o acionador de adição de exercício;
- enriquecer o menu de tipos com ícones e descrições;
- simplificar e alinhar o popover de confirmação de exclusão;
- reorganizar cada exercício em um card responsivo com linhas funcionais distintas;
- remover o aviso visual de alterações aguardando autosave, preservando os demais
  estados e proteções do editor.

### Não incluído

- alteração de endpoints, payloads, regras de domínio, limites ou protocolo de
  concorrência da API;
- criação de novos tipos de exercício ou alteração dos campos pertencentes a cada
  tipo;
- troca das bibliotecas de componentes, ícones, drag and drop, roteamento ou estado
  de servidor;
- alteração do intervalo de autosave, da fila de mutações ou da proteção de saída
  com alterações pendentes;
- redesenho de outras páginas, tabelas, modais ou menus sem relação com os pontos
  descritos nesta feature;
- reprodução literal das imagens da issue ou inclusão delas como assets de layout
  no repositório.

## Projetos e documentação afetados

- API e endpoints: não há mudança de comportamento HTTP; nenhuma documentação de
  endpoint deve ser alterada.
- UI e rotas:
  - shell autenticado descrito em `ui/docs/sdd/routes/dash.md`;
  - lista e modal de planos descritos em
    `ui/docs/sdd/routes/global-training-plan.md`;
  - detalhe do plano descrito em
    `ui/docs/sdd/routes/global-training-plan-detail.md`;
  - editor descrito em
    `ui/docs/sdd/routes/global-training-plan-workout.md`;
  - fundamentos de arquitetura e componentes/estilização em
    `ui/docs/sdd/base/01-arquitetura.md` e
    `ui/docs/sdd/base/03-componentes-e-estilizacao.md`.
- Fluxos: atualizar `docs/sdd/flows/gestao-planos-treino-globais.md` para refletir
  a consistência da navegação e dos dados após mutações.
- Contratos em `@dall-fit/types`: sem alteração.
- Decisões arquiteturais: sem novo ADR; preservar a concorrência e os limites das
  ADRs `0005` e `0006`.
- Handlers e fixtures MSW: ajustar os cenários existentes quando necessário para
  que as mutações persistam durante a navegação entre detalhe e editor e permitam
  validar o tema escuro; nenhuma nova request é prevista.
- Mocks de repositories/caches nos unitários da API: não se aplica, porque a API
  não será alterada.
- Fixtures MongoDB/Redis nos E2E: não se aplica, porque endpoints, persistência e
  infraestrutura da API não serão alterados.

## Requisitos funcionais

### RF01 — Ações compactas no bloco de identidade

1. O topo do menu autenticado deve manter o avatar à esquerda e apresentar, à
   direita dele, um grupo de duas ações alinhadas verticalmente ao centro do
   avatar.
2. Nesse grupo, o seletor de tema deve ficar imediatamente à esquerda do botão de
   logout.
3. O logout deve ser um controle somente com ícone, sem o texto visível `Sair`, mas
   deve conservar nome acessível, estado de carregamento, prevenção de cliques
   repetidos e o comportamento atual de encerramento de sessão.
4. Nome, e-mail e papel do usuário devem permanecer disponíveis no bloco de
   identidade, sem competir pelo espaço reservado às duas ações.
5. A composição deve ser a mesma no menu lateral desktop e no drawer móvel.

### RF02 — Affordance dos links de treino

1. Todo nome de treino navegável na tabela de detalhe do plano deve usar o mesmo
   padrão visual aplicado aos nomes de plano na tabela anterior: cor de ação,
   sublinhado persistente e foco visível.
2. A área continua sendo um link SPA tipado; o requisito é visual e não autoriza
   navegação por recarregamento completo.

### RF03 — Contraste dos campos no tema escuro

1. Inputs, áreas de texto, campos numéricos, seletores e controles de mídia devem
   ter uma superfície ou contorno perceptivelmente distinto do modal ou card que
   os contém no tema escuro.
2. A solução deve partir dos tokens semânticos compartilhados do tema e das APIs do
   HeroUI, evitando correções locais divergentes para cada tela.
3. O contraste deve ser verificável tanto no modal de criar/editar plano quanto no
   editor de exercícios, sem degradar o tema claro, os estados de foco, erro,
   desabilitado e somente leitura.

### RF04 — Reordenação compreensível

1. Ao iniciar o arraste, o exercício ativo deve ganhar aparência flutuante, com
   elevação e separação visual do restante da lista.
2. A lista deve se reorganizar durante o movimento para indicar com precisão a
   posição de destino antes da soltura.
3. A implementação deve usar os recursos já instalados do dnd kit, incluindo uma
   representação própria para o `DragOverlay`, sem duplicar um segundo elemento
   arrastável.
4. A ordenação só deve ser persistida no destino confirmado. Cancelar a operação
   restaura a ordem anterior.
5. Sensores de ponteiro, toque e teclado, anúncios acessíveis e regras atuais de
   concorrência devem continuar funcionando.

### RF05 — Cache coerente depois de mutações

1. Depois de cada mutação bem-sucedida do editor, as consultas relacionadas devem
   receber o estado canônico retornado ou ser invalidadas/refetchadas conforme o
   dado afetado.
2. A regra abrange renomear o treino, adicionar, editar, excluir e reordenar
   exercícios, bem como enviar, substituir ou remover mídia.
3. Adicionar ou excluir um exercício também deve sincronizar o resumo do treino no
   detalhe do plano, inclusive sua contagem de exercícios.
4. Ao usar o breadcrumb para voltar ao detalhe e entrar novamente no mesmo treino,
   o usuário não pode ver nome, exercícios, ordem, mídia ou contagem anteriores à
   última mutação confirmada.
5. Falhas, conflito de versão, mutações obsoletas ou canceladas não podem publicar
   no cache um estado apresentado como confirmado.

### RF06 — Hierarquia de títulos do editor

1. `Treino` deve funcionar como contexto visual discreto, e não como o título
   principal da página.
2. O nome do treino deve ser o `h1` e usar o mesmo nível visual dos títulos
   principais das telas anteriores.
3. `Exercícios` deve ser o `h2`, visualmente subordinado ao nome do treino e mais
   forte que o contexto `Treino`.
4. O botão de edição do nome deve permanecer na mesma linha do `h1`, alinhado ao
   seu centro e com alvo de interação estável.

### RF07 — Slot estável para excluir

1. O botão de exclusão e o spinner que o substitui devem ocupar um slot com as
   mesmas dimensões.
2. A entrada do estado de carregamento não pode deslocar chip, campos, card ou
   outros controles.

### RF08 — Lista vazia e adição abaixo da lista

1. Quando o treino não possuir exercícios, a região da lista deve apresentar um
   empty state com mensagem inequívoca de que ainda não há exercícios e orientação
   para usar a ação de adição.
2. O empty state deve ficar imediatamente acima do acionador para adicionar
   exercício e deve desaparecer quando a lista passar a conter ao menos um item.
3. O acionador para adicionar exercício deve ficar depois da lista ou de seu empty
   state e antes dos estados globais de salvamento ou erro.
4. O controle deve ficar centralizado entre dois `Separator` horizontais do
   HeroUI, que ocupam o espaço restante de cada lado.
5. O texto visível deve ser `Adicionar exercício` e um indicador de expansão deve
   deixar claro que a ação abre um menu, além das semânticas acessíveis providas
   pelo componente de dropdown.
6. A composição deve continuar legível quando a lista estiver vazia e não pode
   introduzir rolagem horizontal em telas pequenas.

### RF09 — Identidade dos tipos no dropdown

Cada opção deve apresentar o nome já usado pelo produto, uma descrição curta e o
seguinte ícone do conjunto Lucide instalado:

| Tipo            | Ícone           | Descrição                                          |
| --------------- | --------------- | -------------------------------------------------- |
| `youtube-long`  | `TvMinimalPlay` | Vídeo longo para orientar a execução do exercício. |
| `youtube-short` | `Video`         | Vídeo curto com descanso, séries e repetições.     |
| `image`         | `FileImage`     | Exercício ilustrado por uma imagem.                |
| `pause`         | `CirclePause`   | Intervalo de descanso entre exercícios.            |
| `duration`      | `Clock`         | Atividade controlada por tempo.                    |

Os ícones são complementares: o nome e a descrição continuam sendo a identidade
textual e acessível de cada opção.

### RF10 — Confirmação de exclusão simplificada

1. O popover não deve exibir o título visível `Excluir exercício?`.
2. Sua única ação visível deve se chamar `Confirmar exclusão`.
3. O popover deve abrir abaixo do icon button de exclusão, com a borda direita de
   sua superfície alinhada à borda direita do botão.
4. O popover deve conservar nome acessível contextual para que a remoção não
   dependa apenas do ícone ou da posição visual.

### RF11 — Card responsivo por exercício

1. Cada card deve ter um cabeçalho com o indicador de arraste e o ícone do tipo à
   esquerda, e o chip do tipo junto do slot de exclusão à direita.
2. Abaixo do cabeçalho, os campos de identificação devem ocupar uma linha própria:
   nome e vídeo usam o espaço flexível; a região de prévia/mídia e o campo de local
   do corpo usam apenas a largura necessária dentro dos limites responsivos.
3. O campo de vídeo deve usar o rótulo `Vídeo (ID)`.
4. Exercícios por imagem devem exibir a prévia quando houver imagem e conservar, na
   mesma região funcional, as ações atuais de escolher, substituir ou remover o
   arquivo.
5. Os campos numéricos devem ficar sempre em uma linha posterior à linha de
   identificação, mesmo em telas largas.
6. Quando houver três campos numéricos, cada um ocupa um terço da largura
   disponível em telas largas. Em telas pequenas, cada campo ocupa uma linha
   inteira.
7. Tipos que possuem menos campos exibem somente os dados previstos pelo contrato
   atual, sem espaços vazios artificiais e sem inventar valores.
8. Em telas pequenas, cabeçalho, identificação, mídia e campos devem empilhar sem
   sobreposição, truncamento de controles ou rolagem horizontal.

### RF12 — Feedback de autosave

1. A mensagem visual `Alterações aguardando autosave` não deve mais ser exibida.
2. O estado pendente continua existindo internamente e ainda deve participar da
   fila, do bloqueio de saída e do início do salvamento no intervalo vigente.
3. Feedbacks de salvamento em andamento, erro, retry, conflito e mídia continuam
   visíveis ou anunciados conforme seu comportamento atual.

## Requisitos não funcionais

- Acessibilidade:
  - preservar navegação por teclado, foco visível e anúncios do drag and drop;
  - controles somente com ícone devem ter nomes acessíveis inequívocos;
  - títulos devem formar uma hierarquia semântica coerente;
  - contraste e estados dos campos devem continuar distinguíveis nos dois temas;
  - redução de movimento deve ser respeitada nas transições visuais.
- Performance:
  - nenhuma nova consulta deve ser disparada por renderização ou movimento do
    ponteiro;
  - sincronização e invalidação devem se limitar às chaves de consulta afetadas;
  - a reordenação visual não pode degradar perceptivelmente a interação em listas
    dentro dos limites vigentes.
- Segurança e privacidade: não registrar nomes, identificadores de mídia, payloads
  de formulários ou outros dados do treino em novos logs de interface.
- Observabilidade: não há nova telemetria obrigatória; estados de erro existentes
  devem continuar diagnósticos e acionáveis para o usuário.
- Compatibilidade: usar as versões já instaladas de `@heroui/react@3.2.2`,
  `@heroui/styles@3.2.2`, `@dnd-kit/core@6.3.1`,
  `@dnd-kit/sortable@10.0.0`, `@tanstack/react-query@5.101.4` e
  `lucide-react@1.28.0`, validando a implementação contra os tipos locais.

## Critérios de aceite

### Cenário 1 — Ações do menu no desktop e no mobile

- Forma de validar: abrir
  `http://localhost:3000/global/training-plan?mockAuth=admin` em viewports desktop e
  móvel; no móvel, abrir o drawer.
- Given: o administrador está autenticado e o menu está visível.
- When: observa o bloco de identidade, alterna o tema e aciona o logout.
- Then: tema e logout aparecem, nessa ordem, à direita e centralizados com o
  avatar; logout não exibe `Sair`, conserva nome acessível e não muda de tamanho ao
  carregar; as duas ações funcionam nas duas apresentações do menu.

### Cenário 2 — Nome de treino reconhecível como link

- Forma de validar: abrir
  `http://localhost:3000/global/training-plan/64b000000000000000000001?mockAuth=admin`.
- Given: a tabela contém ao menos um treino navegável.
- When: o usuário compara o nome do treino com os links da lista de planos e navega
  por mouse e teclado.
- Then: o nome usa cor de ação, sublinhado persistente e foco visível equivalentes
  aos nomes de plano, mantendo navegação SPA.

### Cenário 3 — Campos distinguíveis no tema escuro

- Forma de validar: no link do cenário 1, ativar o tema escuro, abrir os modais de
  criar e editar plano e depois abrir o treino pelo link do cenário 2.
- Given: um modal ou card escuro contém campos editáveis em seus estados normal,
  foco, erro e desabilitado quando aplicáveis.
- When: o usuário percorre os controles.
- Then: cada superfície ou contorno de campo é distinguível de seu contêiner, os
  estados continuam identificáveis e o tema claro permanece sem regressão.

### Cenário 4 — Arraste mostra item e destino

- Forma de validar: abrir
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin`.
- Given: o treino possui ao menos três exercícios.
- When: o usuário arrasta o primeiro exercício para depois do terceiro usando
  ponteiro ou toque.
- Then: o card ativo aparece flutuante, os demais cards se reposicionam para indicar
  o destino e a nova ordem é persistida somente após a soltura.

### Cenário 5 — Reordenação acessível e cancelável

- Forma de validar: usar o mesmo link do cenário 4 com teclado.
- Given: o indicador de arraste está focado.
- When: o usuário inicia e movimenta a operação e depois a cancela; em uma segunda
  tentativa, confirma o destino.
- Then: instruções e mudanças são anunciadas, o cancelamento restaura a ordem
  anterior e a confirmação persiste exatamente a ordem anunciada.

### Cenário 6 — Cache atualizado ao sair e retornar

- Forma de validar: usar o link do cenário 4, executar separadamente renomeação,
  adição, edição por autosave, reordenação, exclusão e operações de mídia; após cada
  sucesso, voltar pelo breadcrumb e reabrir o treino sem atualizar o navegador.
- Given: a mutação recebeu confirmação do servidor.
- When: o usuário retorna ao detalhe do plano e entra novamente no mesmo treino.
- Then: nome, conteúdo, ordem, mídia e contagem refletem a mutação confirmada, sem
  reapresentar dados antigos durante a navegação.

### Cenário 7 — Falha não contamina o cache

- Forma de validar: no link do cenário 4, selecionar no MSW a variação existente de
  falha recuperável ou conflito e repetir uma mutação.
- Given: o servidor rejeita, cancela ou torna obsoleta a mutação.
- When: o usuário navega para o detalhe e volta ao editor após tratar o erro.
- Then: o estado rejeitado não aparece como confirmado; retry, conflito e
  recuperação mantêm o comportamento vigente.

### Cenário 8 — Títulos e edição alinhados

- Forma de validar: abrir o link do cenário 4 em tema claro e escuro.
- Given: o editor terminou de carregar.
- When: o usuário observa o cabeçalho da página e navega pelos títulos com uma
  tecnologia assistiva.
- Then: `Treino` é contexto discreto, o nome é o único `h1`, `Exercícios` é `h2` e
  o botão de edição está centralizado na linha do nome, com alvo e nome acessíveis.

### Cenário 9 — Exclusão não desloca o card

- Forma de validar: no link do cenário 4, confirmar a exclusão de um exercício com
  resposta MSW atrasada.
- Given: o card exibe chip e botão de exclusão.
- When: o botão é substituído pelo spinner enquanto a request está pendente.
- Then: o slot mantém as mesmas dimensões e nenhum outro elemento do card muda de
  posição.

### Cenário 10 — Adição abaixo da lista e menu informativo

- Forma de validar: abrir o link do cenário 4, inclusive com a variação MSW de lista
  vazia.
- Given: o editor está pronto para receber um exercício.
- When: o usuário percorre a lista e abre `Adicionar exercício`.
- Then: na lista vazia, o empty state informa a ausência de exercícios e orienta a
  adição imediatamente acima do acionador; o acionador fica centralizado entre dois
  separadores e tem indicador de expansão; cada tipo mostra o ícone e a descrição
  definidos em RF09 e pode ser selecionado por mouse ou teclado; depois da primeira
  adição confirmada, o empty state desaparece e o novo card ocupa a lista.

### Cenário 11 — Confirmação de exclusão alinhada e acessível

- Forma de validar: abrir o link do cenário 4 e acionar a lixeira de qualquer card.
- Given: o botão de exclusão está disponível.
- When: o usuário abre o popover.
- Then: ele abre abaixo do icon button e sua borda direita fica alinhada à borda
  direita do botão; não mostra `Excluir exercício?`, apresenta somente
  `Confirmar exclusão` como ação visível e conserva um nome acessível contextual.

### Cenário 12 — Card em tela larga

- Forma de validar: abrir o link do cenário 4 em viewport de `1440x900` com fixtures
  que cubram os cinco tipos de exercício.
- Given: os cards contêm todos os campos aplicáveis aos seus tipos.
- When: o usuário observa e edita cada card.
- Then: cabeçalho, identificação/mídia e números ocupam linhas funcionais distintas;
  o vídeo se chama `Vídeo (ID)`; previews usam largura intrínseca controlada; três
  campos numéricos dividem igualmente sua própria linha e não sobram lacunas para
  campos inexistentes.

### Cenário 13 — Card em tela pequena

- Forma de validar: repetir o cenário 12 em viewport de `390x844`.
- Given: o editor contém os cinco tipos de exercício.
- When: o usuário percorre e edita os cards.
- Then: campos e ações empilham de modo legível, cada campo numérico ocupa uma linha
  inteira e não há sobreposição, corte de controles nem rolagem horizontal.

### Cenário 14 — Autosave sem mensagem de espera

- Forma de validar: no link do cenário 4, alterar um campo textual e aguardar o
  intervalo de autosave; repetir com sucesso e erro MSW.
- Given: existe uma alteração local ainda não enviada.
- When: o intervalo começa, a request é executada e termina com sucesso ou erro.
- Then: `Alterações aguardando autosave` nunca é exibido; salvamento, erro, retry e
  bloqueio de saída continuam funcionando e sendo anunciados quando aplicáveis.

## Estratégia de entrega e compatibilidade

1. Reusar componentes do HeroUI, variantes de `@heroui/styles`, ícones Lucide e as
   bibliotecas já instaladas; não adicionar dependências.
2. Ajustar primeiro os tokens semânticos de campo e validar seu impacto nas telas
   afetadas antes de aplicar variantes locais indispensáveis.
3. Separar a apresentação do card arrastado do hook de drag and drop e manter o
   `DragOverlay` montado, exibindo seu conteúdo somente durante uma operação.
4. Centralizar a sincronização das chaves TanStack Query afetadas na conclusão das
   mutações, preservando cancelamento, geração da fila e versão do recurso.
5. Manter compatibilidade com URLs, payloads, cache persistido, dados existentes e
   respostas da API; não é necessária migração de dados nem rollout de backend.
6. Remover estilos, helpers e imports que ficarem sem uso depois da reorganização.

## Plano de testes

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

- Unitários de UI:
  - composição e acessibilidade das ações do menu;
  - semântica de títulos e ação de renomear;
  - mapa de ícones e descrições do seletor de tipos;
  - popover simplificado e slot estável de exclusão;
  - ausência da mensagem de espera do autosave;
  - atualização/invalidação das chaves corretas após cada espécie de mutação e
    ausência de publicação em falha, cancelamento ou conflito;
  - transformação da ordem, cancelamento e representação do overlay.
- Integrados Playwright com Vite real, Chromium e MSW Browser:
  - menu desktop e drawer móvel, troca de tema e logout;
  - affordance e navegação do link de treino;
  - contraste dos campos nos temas claro e escuro;
  - reordenação com feedback de item ativo e destino;
  - persistência observável depois de mutar, voltar e reabrir o treino;
  - layouts de card largo, móvel e lista vazia;
  - adição por dropdown, exclusão atrasada e estados de autosave/erro.
- Regressão: manter os testes existentes de concorrência, fila, retry, mídia,
  navegação protegida e limites do editor.
- Quality gates da implementação: `pnpm lint`, `pnpm test`,
  `pnpm test:coverage:ci`, `pnpm build` e `pnpm test:integration`.
- `pnpm -C api test:e2e` não é exigido por esta feature enquanto não houver mudança
  de endpoint, wiring, MongoDB ou Redis.

## Riscos e decisões

- A imagem de referência do card é direcional. A implementação deve obedecer aos
  tokens, componentes e breakpoints vigentes, preservando a hierarquia descrita em
  vez de copiar dimensões ou cores externas.
- Alterar um token semântico de campo pode afetar controles fora das rotas-alvo; a
  revisão visual e os testes devem confirmar que ambos os temas permanecem
  coerentes.
- Invalidação ampla pode causar requests redundantes, enquanto atualização parcial
  pode deixar contagens ou mídia antigas. Cada mutação deve mapear explicitamente
  as chaves que produz ou resume.
- O overlay não pode reutilizar um componente que registre novamente o hook
  arrastável; ele deve ser uma apresentação desacoplada para evitar IDs duplicados
  e animação inconsistente.
- A remoção do texto de espera do autosave não remove o estado pendente nem reduz a
  proteção contra perda de dados.
- A remoção dos textos visíveis de logout e confirmação exige nomes acessíveis
  explícitos; posição e ícone isolados não são suficientes.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Quality gates da raiz aprovados
