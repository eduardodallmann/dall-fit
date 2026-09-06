# Feature Spec: Correções pós-validação da FIT-75

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: continuação da validação da
  [issue #75](https://github.com/eduardodallmann/dall-fit/issues/75).
- Problema: a validação manual posterior à FIT-75 encontrou cinco correções que
  não produziram toda a mudança observável esperada e uma regressão nova no cache
  da seleção ativa. O header do exercício ainda possui área visual externa ao
  controle real, o campo de carga tem hit area menor que sua caixa, o chat não
  retorna totalmente ao fim depois de uma interação iniciada pela própria pessoa,
  a triagem pergunta diretamente sobre gestação sem necessidade de uma formulação
  tão específica, a seleção ativa não reconcilia uma leitura vazia anterior de
  `/training` e títulos de mídia permanecem recortados junto às bordas dos
  overlays.
- Resultado: as seis falhas são corrigidas e cobertas por testes que acionam as
  áreas exatas relatadas, incluindo cache previamente aquecido e coordenadas de
  clique próximas aos limites visuais.
- Referências:
  - evidências visuais fornecidas na validação manual;
  - [`FIT-0075`](fit-0075-melhorias-visuais-e-comunicacao.md), preservada como
    registro histórico;
  - rota vigente [`/training`](../../../ui/docs/sdd/routes/training.md);
  - rota vigente
    [`/training/workout/:workoutId`](../../../ui/docs/sdd/routes/training-workout.md);
  - rota vigente [`/training-plan`](../../../ui/docs/sdd/routes/training-plan.md);
  - endpoint vigente do
    [assistente](../../../api/docs/sdd/endpoints/training-plan-assistant.md).
- Features relacionadas: `FIT-0058`, `FIT-0070`, `FIT-0073` e `FIT-0075`.

## Escopo

### Incluído

1. Transformar toda a superfície visual do header de cada exercício em execução
   no único controle que expande ou recolhe o card. Hover, pressed, foco e demais
   estados visuais devem ocupar a mesma superfície completa, inclusive área vazia,
   e não apenas um `Button` interno.
2. Fazer toda a caixa visual do campo de carga direcionar foco e seleção ao input,
   inclusive suas extremidades esquerda e direita, sem reduzir o alvo ao texto ou
   a uma fração central do `NumberField`.
3. Quando a própria pessoa interagir com o chat por resposta rápida, texto livre
   ou retry, mover o histórico completamente para o turno mais recente e manter o
   acompanhamento do pending e da resposta. Rolagem manual para mensagens antigas
   continua respeitada enquanto não houver nova interação iniciada pela pessoa.
4. Substituir a pergunta direta sobre gestação/pós-parto por uma triagem geral e
   neutra sobre situações que exigem acompanhamento profissional, citando gestação
   e pós-parto apenas como exemplos aplicáveis. Não inferir sexo, gênero, capacidade
   reprodutiva ou resposta clínica a partir do nome.
5. Após marcar um plano como ativo, reconciliar todas as queries do domínio de
   `/training`, inclusive quando uma visita anterior armazenou o estado “sem plano
   ativo”. A próxima visita deve buscar e mostrar o plano recém-selecionado.
6. Adicionar espaço seguro ao header do drawer e da modal de mídia da execução.
   Títulos longos podem quebrar linha, não encostam nem são cortados pelo topo ou
   laterais e não ficam sob o botão de fechar, em mobile e desktop.

### Não incluído

- inferir sexo ou gênero pelo nome, por aparência, por modelo de linguagem ou por
  tabela probabilística;
- adicionar sexo, gênero ou capacidade reprodutiva ao perfil da pessoa;
- retirar a triagem conservadora ou permitir geração de treino para uma situação
  que continue fora do MVP;
- alterar contratos HTTP da execução, da seleção ativa ou do assistente;
- redesenhar os cards, inputs, chat ou players além das falhas enumeradas;
- alterar ou marcar status dentro da feature histórica FIT-75.

## Projetos e documentação afetados

- API e endpoints: comportamento interno da triagem do assistente, sem mudar o
  contrato HTTP; atualizar
  `api/docs/sdd/endpoints/training-plan-assistant.md` na implementação.
- UI e rotas:
  - `ui/docs/sdd/routes/training.md`;
  - `ui/docs/sdd/routes/training-workout.md`;
  - `ui/docs/sdd/routes/training-plan.md`.
- Fluxos:
  - `docs/sdd/flows/execucao-de-treino.md`;
  - `docs/sdd/flows/gestao-planos-treino-pessoais.md`.
- Contratos em `@dall-fit/types`: não se aplica; preservar pergunta e opções já
  transportadas como dados da sessão.
- Decisões arquiteturais: não se aplica.
- Handlers e fixtures MSW: atualizar os cenários de sessão em andamento, carga,
  plano ativo após cache vazio, overlays e múltiplos turnos do assistente.
- Mocks unitários da API: atualizar catálogo/fixtures da triagem e mocks do
  provider somente onde a nova formulação for observável.
- Fixtures MongoDB/Redis nos E2E: atualizar o seed reproduzível do assistente se a
  pergunta pública persistida mudar.

## Requisitos funcionais

1. O retângulo visual completo do header do exercício corresponde a um único
   controle semântico. Clique no texto, metadados, ícone ou espaço livre alterna o
   estado; `Enter` e `Space` fazem o mesmo; `aria-expanded` permanece correto.
2. Não existe controle de expansão menor sobreposto ou aninhado dentro de uma área
   que pareça acionável. O estado hover/pressed/active cobre todo o header.
3. A superfície visual do `NumberField` coincide com seu alvo. Clique a 10%, 50%
   ou 90% da largura interna foca o input correspondente sem acionar conclusão da
   série nem outro controle.
4. Uma resposta enviada enquanto o histórico está rolado para cima estabelece uma
   nova intenção de acompanhamento: o scroll chega ao `scrollHeight` mais recente,
   permanece no fim durante loading e acompanha a resposta confirmada. Apenas uma
   atualização passiva, sem interação local, preserva a leitura antiga.
5. A triagem pública usa formulação geral equivalente a
   `Existe alguma situação que exija acompanhamento profissional para você começar a se exercitar, como gestação, pós-parto ou outra condição específica?`.
   Resposta negativa prossegue; confirmação ou incerteza conserva o bloqueio seguro
   vigente. O nome da pessoa não participa dessa decisão.
6. Sucesso em `PUT /training-plans/active` remove ou invalida as queries de treino
   confirmadas antes de a próxima navegação consumir o cache. Erro mantém plano e
   cache anteriores, sem inventar ativação.
7. Modal e drawer reservam padding superior e lateral para heading, foco e botão de
   fechar. O heading aceita múltiplas linhas, permanece integralmente dentro do
   painel e não produz rolagem horizontal.

## Requisitos não funcionais

- Acessibilidade: preservar HeroUI, foco visível, labels, `aria-expanded`, teclado,
  heading acessível e retorno de foco dos overlays. Hit area visual e semântica
  devem coincidir.
- Performance: reconciliação usa TanStack Query e não cria polling ou request
  duplicada permanente; o scroll não entra em loop de renderização.
- Segurança e privacidade: nomes não são usados para inferência sensível. Conteúdo
  clínico continua fora de Analytics e da sessão pública além da pergunta e do
  resultado já previstos.
- Responsividade: validar 390px e 1440px, incluindo título longo, limite direito do
  campo e espaço vazio do header.
- Observabilidade: preservar eventos e payloads sanitizados vigentes.

## Critérios de aceite

### Cenário 1 — Header inteiro expande e recebe estado visual

- Forma de validar: Playwright com cliques por coordenada e teclado.
- Link para testar:
  `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=session-running`.
- Given: um exercício em execução está recolhido.
- When: a pessoa clica no espaço do header fora do conteúdo interno e depois usa
  `Enter` e `Space` no header focado.
- Then: o card alterna em cada ação, `aria-expanded` acompanha e o estado visual
  ocupa todo o retângulo do header.

### Cenário 2 — Campo de carga possui hit area integral

- Forma de validar: teste de componente e Playwright por coordenadas.
- Link para testar: o mesmo do Cenário 1.
- Given: a caixa de carga está visível e mede mais que a largura do texto digitado.
- When: a pessoa clica próximo das bordas esquerda e direita e no centro da caixa.
- Then: o mesmo input recebe foco nos três pontos e aceita digitação, sem depender
  do terço central.

### Cenário 3 — Interação do chat retoma acompanhamento completo

- Forma de validar: Vitest da decisão de scroll e Playwright com histórico longo.
- Link para testar:
  `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-resumed`.
- Given: a pessoa rolou o histórico para cima.
- When: envia uma resposta rápida, texto livre ou retry.
- Then: o histórico vai completamente ao fim e acompanha pending e resposta; se
  nenhuma interação local ocorrer, uma atualização passiva não interrompe a
  leitura antiga.

### Cenário 4 — Triagem neutra sem inferência pelo nome

- Forma de validar: unitários da máquina de estados, E2E da API e Playwright.
- Link para testar:
  `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-collecting`.
- Given: sessões pertencem a pessoas com nomes variados e chegam à etapa clínica.
- When: a pergunta é apresentada e recebe resposta negativa, positiva ou incerta.
- Then: todos recebem a mesma pergunta geral; nenhuma branch consulta o nome;
  negativa prossegue e positiva/incerta conserva o bloqueio seguro.

### Cenário 5 — Seleção ativa supera cache vazio anterior

- Forma de validar: Playwright de jornada entre `/training` e `/training-plan`.
- Link para testar:
  `http://localhost:3000/training?mockAuth=person&mockTraining=no-active-plan`.
- Given: a pessoa visitou Treinar e a query confirmou ausência de plano ativo.
- When: marca um plano como em uso em `/training-plan` e volta a `/training`.
- Then: ocorre nova leitura e o plano selecionado aparece; a tela não permanece
  vazia por reutilizar a resposta anterior.

### Cenário 6 — Títulos completos no drawer e na modal

- Forma de validar: Playwright em 390px e 1440px com título longo.
- Link para testar: o mesmo do Cenário 1.
- Given: um exercício com mídia possui título longo e o overlay é aberto.
- When: drawer mobile e modal desktop são exibidos.
- Then: o bounding box do heading fica integralmente dentro do painel, não cruza o
  botão de fechar, possui distância visível das bordas e nenhuma letra é cortada.

## Ordem sugerida de implementação

1. Regressão de cache ao ativar um plano, por impedir a jornada principal.
2. Header inteiro do exercício.
3. Hit area integral do campo de carga.
4. Espaçamento de títulos no drawer e na modal.
5. Retomada do fim do chat após interação local.
6. Formulação neutra da triagem clínica sem inferência pelo nome.

Cada item deve receber seu teste de regressão junto da correção. A ordem organiza a
execução em turnos curtos, mas todos os critérios formam o contrato desta feature.

## Estratégia de entrega e compatibilidade

Implementar em seis fatias pequenas seguindo a ordem sugerida. Cada fatia pode ser
validada isoladamente, mas a entrega final deve manter a suíte completa aprovada.
Não alterar contratos HTTP nem a feature histórica FIT-75. A documentação viva só
é atualizada durante a implementação autorizada.

## Plano de testes

- Vitest UI: semântica/estado do header, foco do `NumberField`, decisão de scroll e
  reconciliação de query após seleção ativa.
- Vitest API: ordem e branches da nova pergunta clínica, incluindo ausência total
  de decisão baseada em nome.
- Playwright: coordenadas nos limites do header/input, chat longo rolado para cima,
  jornada cache vazio → ativação → Treinar e bounding boxes dos headings em 390px e
  1440px.
- E2E API: pergunta pública e branches negativo, positivo e incerto da triagem.
- MSW: cenário mutável no qual a primeira leitura não tem ativo e a leitura após
  `PUT /training-plans/active` retorna o plano selecionado.
- Referências visuais: as rotas de execução continuam sem assets aprovados; usar
  assertions geométricos no Playwright, sem criar screenshot de referência.

## Riscos e decisões

- Inferir sexo ou gênero pelo nome produziria falsos positivos, falsos negativos e
  uma decisão sensível sem consentimento. A solução escolhida é uma pergunta geral,
  idêntica para todas as pessoas, que preserva a triagem sem dirigir uma pergunta
  de gestação a alguém presumido como homem.
- Um wrapper visual em torno de um botão menor repete o defeito do header. A área
  visual deve ser o próprio controle, sem controles interativos aninhados.
- Estilizar apenas o `group` do `NumberField` não prova a correção; testes precisam
  clicar onde a inspeção manual mostrou espaço visual sem input.
- `invalidateQueries` sem refetch pode manter a resposta vazia se a query ainda for
  considerada utilizável na navegação. A implementação deve testar a jornada real
  e escolher remoção, invalidação aguardada ou atualização coerente do cache.
- Forçar scroll em toda atualização repetiria a falha inversa. A nova intenção de
  acompanhamento nasce somente de interação local explícita; leitura passiva de
  mensagens antigas continua protegida.

## Condições esperadas da entrega

- Seis critérios de aceite atendidos
- Feature histórica FIT-75 preservada
- Endpoint, rotas e fluxos vivos afetados atualizados
- Handlers, fixtures, unitários, E2E e Playwright atualizados conforme o impacto
- Nenhuma inferência sensível baseada em nome
- Quality gates da raiz, E2E da API e Playwright aprovados
