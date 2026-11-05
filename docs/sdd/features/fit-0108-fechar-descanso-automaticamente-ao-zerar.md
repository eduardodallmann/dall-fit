# Feature Spec: fechar descanso automaticamente ao zerar

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0108`.
- Problema: o Drawer de descanso permanece aberto quando a contagem chega a zero,
  exigindo que a pessoa pule um descanso que já terminou. O relato não confirma
  o comportamento da Modal; a inspeção de `TrainingTimerOverlay` mostra que ambas
  compartilham o contador e não disparam resolução ao zerar.
- Resultado: descansos entre séries e exercícios de pausa são resolvidos
  automaticamente ao vencer, e o Drawer mobile ou a Modal desktop fecha após a
  confirmação da autoridade da plataforma. O cronômetro de exercícios por duração
  conserva suas ações manuais.
- Referências:
  - [Rota de execução](../../../ui/docs/sdd/routes/training-workout.md).
  - [Arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md).
  - [Fluxo de execução de treino](../flows/execucao-de-treino.md).
  - [Endpoints de treino](../../../api/docs/sdd/endpoints/training.md).
  - [ADR-0010: sessão efêmera e histórico](../adr/ADR-0010-sessao-efemera-e-historico-de-treino.md).
  - [ADR-0014: persistência offline nativa](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md).
- Features relacionadas:
  - [FIT-0070](fit-0070-fluxo-treinar.md), origem dos timers da jornada.
  - [FIT-0089](fit-0089-adaptar-jornada-treinar-execucao-offline.md), execução
    nativa e retomada dos timers.

O SDD vivo e o código consultados mantêm o overlay em zero até uma ação explícita.
Esta demanda altera essa regra somente para `series-rest` e `pause`. A escolha
validada no refinamento exclui a resolução automática de `duration` pelo contador
da UI. As features históricas relacionadas permanecem intactas.

## Escopo

### Incluído

- Resolver automaticamente timers `series-rest` e `pause` ao atingir zero.
- Aplicar a mesma regra ao Drawer abaixo de `768px` e à Modal a partir de `768px`,
  na UI compartilhada por Web/PWA online e Android online ou offline.
- Reutilizar a mutation de resolução e a autoridade de treino de cada plataforma.
- Cobrir expiração durante a exibição, retorno de background, timer já vencido na
  montagem, concorrência com ação manual e recuperação de falha.
- Atualizar testes, cenários MSW e documentação viva afetada na implementação.

### Não incluído

- Resolução automática de `duration` pelo contador da UI ou mudança das ações
  `Cancelar` e `Finalizar` desse cronômetro.
- Finalização automática do workout, início automático de outra série ou alteração
  de cargas e duração prescrita.
- Mudanças de layout, novos sons, vibrações, notificações ou permissões nativas.
- Execução de timers por Worker, serviço nativo ou processo em background.
- Novos endpoints, contratos públicos, persistência Web ou migrations SQLite.

## Projetos e documentação afetados

- API e endpoints: consumir o contrato existente de
  `POST /training/session/timer/resolve`, com `outcome: 'finish'`, usando o adapter
  HTTP vigente. Não há alteração planejada de implementação ou contrato HTTP. A
  resolução de timers vencidos já realizada por `GET /training/session` permanece
  vigente, inclusive para `duration`.
- UI e rotas: `TrainingTimerOverlay`, em
  `ui/src/routes/training/timer-overlay.tsx`, e sua coordenação com mutations em
  `ui/src/routes/training/workout-page.tsx`. Na implementação, atualizar
  [a rota](../../../ui/docs/sdd/routes/training-workout.md) e o trecho sobre
  resolução automática em
  [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md).
- Fluxos: atualizar a regra de timer vencido e retomada no
  [fluxo de execução](../flows/execucao-de-treino.md).
- Contratos em `@dall-fit/types`: reutilizar `TrainingTimer`, `TrainingSession` e os
  outcomes existentes, sem alteração de payload ou exportação pública.
- Decisões arquiteturais: preservar `TrainingRepository`, FIFO por sessão e commit
  nativo anterior ao feedback. Não há nova decisão transversal que exija ADR.
- Handlers e fixtures MSW: adaptar
  `ui/src/mocks/handlers/training.ts` e `ui/src/mocks/fixtures/training.ts` para
  exercitar resolução automática, latência, falha recuperável e conflito sem API
  real; reutilizar os seletores existentes quando suficientes.
- Mocks de repositories/caches nos unitários da API: não se aplica, pois não há
  mudança de backend.
- Fixtures MongoDB/Redis nos E2E: não se aplica pelo mesmo motivo.

## Requisitos funcionais

1. Enquanto existir um timer `series-rest` ou `pause` confirmado, observar o tempo
   restante derivado do relógio vigente. Ao detectar restante igual a zero,
   solicitar sua resolução com `outcome: 'finish'`, sem clique ou gesto.
2. Usar `TrainingRepository.resolveTimer` pela coordenação existente. No Web/PWA,
   a chamada usa Axios, CSRF e `X-Resource-Version` vigentes; no Android, a ação
   confirma sessão e snapshot na transação local, sem depender de rede.
3. Fechar somente depois que a resposta canônica ou o commit local confirmar a
   remoção do timer. Durante a gravação, manter o contador em zero, indicar pending
   e impedir nova resolução do mesmo timer.
4. Para `series-rest`, remover apenas o descanso: preservar a carga e a conclusão
   da série anterior e manter a próxima série incompleta disponível para ação
   explícita. Encerrar o descanso não conclui outra série nem o exercício.
5. Para `pause`, remover o timer e concluir o exercício de pausa conforme a regra
   atual de resolução. Aplicar o avanço e foco do próximo exercício incompleto;
   quando todos estiverem concluídos, apresentar a confirmação integral existente,
   sem finalizar o treino automaticamente.
6. Manter `Pular descanso` e os meios de dismiss já permitidos para cada tipo.
   Uma ação manual anterior ao vencimento continua usando `skip`. Se ação manual
   e expiração disputarem o mesmo timer, aceitar uma única resolução em voo.
7. Deduplicar a expiração pela identidade do timer na sessão, considerando seu
   alvo e início. Ticks, rerenders, efeitos repetidos e troca entre Drawer e Modal
   não podem gerar resoluções duplicadas. Um novo timer da mesma sessão deve
   receber sua própria detecção de vencimento.
8. Se outra mutation estiver pendente ao zerar, preservar a intenção de resolver
   o descanso e processá-la pela FIFO quando possível, lendo a versão corrente.
   Antes de executar, confirmar que o timer ainda é o mesmo; uma intenção antiga
   não pode resolver um timer substituto ou uma nova sessão.
9. Na montagem ou retomada, se a autoridade ainda devolver um descanso ativo já
   vencido, aplicar a mesma resolução automática. Se a leitura já vier sem timer,
   renderizar o estado confirmado sem enviar uma resolução adicional. No Android,
   preservar o relógio monotônico e o fallback civil limitado já adotados.
10. Em falha de gravação, encerrar pending, preservar o último progresso confirmado
    e manter o overlay em zero com erro acessível persistente. Liberar
    `Pular descanso` para nova tentativa explícita; a proteção contra duplicidade
    não pode bloquear essa recuperação. Não repetir a mutation a cada tick nem
    criar retry automático após falha.
11. Em `409 WORKOUT_SESSION_VERSION_CONFLICT`, seguir a recuperação vigente do
    domínio: descartar drafts/debounces, buscar a sessão canônica e anunciar a
    atualização. Não reenviar automaticamente a intenção conflitante nem aplicá-la
    ao timer retornado pela reconciliação. Callbacks e intenções da geração de
    autenticação encerrada não atualizam cache, overlay, foco ou feedback.
12. O contador de `duration` não solicita resolução ao chegar a `00:00`. Enquanto
    não houver ação manual ou nova representação canônica, manter o cronômetro
    aberto com `Cancelar` e `Finalizar` disponíveis conforme o pending vigente.

## Requisitos não funcionais

- Acessibilidade: preservar nome do diálogo, contagem anunciada, teclado e
  contenção de foco do HeroUI. Ao fechar, devolver foco a um controle válido da
  execução; a conclusão de pausa segue o avanço descrito no requisito 5. Pending
  e erro devem ser identificáveis por tecnologia assistiva.
- Performance: conservar o cálculo derivado dos timestamps, sem request, snapshot
  ou gravação SQLite por tick. Limpar recursos temporais ao desmontar e evitar
  callbacks obsoletos.
- Segurança e privacidade: manter a autoridade e a autenticação da plataforma,
  sem persistir sessão no navegador ou expor dados de treino em logs/Analytics.
- Observabilidade: usar apenas os mecanismos sanitizados existentes para o
  resultado da operação; expiração não representa clique ou gesto humano e não
  deve emitir esses eventos artificialmente.
- Layout: preservar a composição representada nas referências
  `mobile-390-timer-drawer.png` e `desktop-1440-timer-modal.png` da rota. As imagens
  complementam somente o layout; não definem a transição temporal.

## Critérios de aceite

Os links pressupõem Vite em `http://localhost:3000`, MSW habilitado e fixtures
fictícias. As verificações de tempo usam relógio controlado nos testes, sem espera
fixa para sincronizar resultados.

### Cenário 1 — descanso entre séries fecha no mobile

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=session-running`
- Forma de validar: Playwright com viewport `390x844` e MSW Browser.
- Given: sessão em andamento e exercício com mais de uma série incompleta.
- When: conclui uma série intermediária e o descanso chega a zero, sem ação manual.
- Then: uma resolução `finish` é confirmada e o Drawer fecha; a série e sua carga
  permanecem salvas, e a próxima série continua incompleta e pode ser concluída.

### Cenário 2 — descanso entre séries fecha no desktop

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=session-running`
- Forma de validar: Playwright com viewport `1440x900` e MSW Browser.
- Given: a mesma condição funcional do cenário 1, usando Modal.
- When: o descanso iniciado por uma série intermediária vence sem ação manual.
- Then: a Modal fecha após confirmação, preserva a série anterior e libera a
  continuidade sem duplicar a resolução.

### Cenário 3 — pausa termina automaticamente nas duas apresentações

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=pause-running`
- Forma de validar: Playwright nos dois viewports e componentes para pausa final.
- Given: exercício de pausa com timer ativo.
- When: o contador chega a zero.
- Then: o timer é resolvido com `finish`, o overlay fecha, a pausa fica concluída
  e o próximo incompleto recebe o avanço/foco previsto. Se era o último exercício,
  abre a confirmação integral sem finalizar o workout.

### Cenário 4 — ação manual e expiração concorrentes

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=pause-running`
- Forma de validar: componentes com relógio e Promise controlados, mais MSW para
  observar a quantidade e os outcomes das requests.
- Given: descanso prestes a vencer.
- When: a pessoa aciona `Pular descanso` junto da expiração, há novos renders ou o
  viewport cruza `768px` durante pending.
- Then: há somente uma resolução em voo, uma aplicação do resultado e um
  fechamento. Um descanso posterior consegue vencer e fechar normalmente.

### Cenário 5 — latência, falha e recuperação explícita

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=timer-resolve-error`
- Forma de validar: Playwright com seletor MSW a acrescentar na implementação,
  atrasando e rejeitando a primeira resolução e aceitando a tentativa explícita.
- Given: descanso ativo e falha recuperável configurada na resolução.
- When: o tempo zera e a resolução automática falha depois de pending observável.
- Then: o overlay fica em zero, apresenta erro e libera `Pular descanso`; ticks
  posteriores não repetem requests. A ação explícita confirma a gravação e fecha
  o overlay sem perder progresso.

### Cenário 6 — retomada de descanso vencido no Android

- Link para testar: não se aplica; exige repository nativo injetado nos testes ou
  aplicativo Android com plano preparado e sessão persistida.
- Forma de validar: Vitest para coordenação/commit e smoke no aplicativo Android.
- Given: descanso `series-rest` ou `pause` confirmado localmente.
- When: o aplicativo volta de background ou recriação com o descanso vencido,
  inclusive sem rede.
- Then: a UI resolve o timer uma vez e fecha somente após o commit local; sessão e
  snapshot refletem a resolução. Falha local mantém recuperação explícita, sem
  fallback HTTP. Nenhum tick grava no banco e não se exige execução em background.

### Cenário 7 — cronômetro de duração continua manual

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=duration-running`
- Forma de validar: componentes nos dois breakpoints com relógio controlado.
- Given: cronômetro `duration` aberto, sem refetch que substitua a sessão.
- When: o contador chega a `00:00`.
- Then: não há resolução disparada pelo contador; overlay e ações manuais
  permanecem. `Cancelar` fecha sem concluir e `Finalizar` fecha concluindo, após
  confirmação, em execuções independentes.

### Cenário 8 — resolução obsoleta não alcança outro timer

- Link para testar: não se aplica; exige controle da fila e da reconciliação da
  sessão em teste de componente/repository.
- Forma de validar: Vitest com sessão versionada e MSW para conflito HTTP.
- Given: descanso vencido aguardando outra mutation, ou resolução em conflito.
- When: a sessão canônica remove/substitui o timer, muda de sessão ou encerra a
  geração de autenticação antes da execução ou retorno da resolução antiga.
- Then: a intenção antiga não resolve o timer substituto nem publica feedback na
  nova geração; conflito segue recuperação canônica sem replay automático.

## Estratégia de entrega e compatibilidade

1. Concentrar a detecção de expiração e sua proteção contra duplicidade no escopo
   de treino, compartilhadas por Drawer e Modal. Integrar o resultado da mutation
   para permitir recuperação explícita sem tornar uma falha um bloqueio permanente.
2. Reutilizar FIFO, leitura da versão na execução e `TrainingRepository`; não criar
   relógio, transporte HTTP ou persistência paralelos.
3. Preservar contratos e dados existentes. Um descanso persistido antes da mudança
   pode ser resolvido ao ser retomado depois dela, sem migration.
4. Na implementação, atualizar conjuntamente rota, trecho da arquitetura da UI e
   fluxo citados, descrevendo a distinção entre descansos automáticos e cronômetro
   manual. Não alterar features históricas.
5. Revisar código que tenha ficado sem uso em `api/` e `ui/`, verificando também
   usos indiretos antes de remover símbolos.

## Plano de testes

- Vitest/componentes: tipos de timer, vencimento na montagem e durante exibição,
  pending, identidade entre timers sucessivos, disputa manual/automática, efeitos
  repetidos, troca de breakpoint, falha recuperável, conflito e callbacks obsoletos.
- Integração HTTP: reutilizar MSW e o Axios real para validar outcome, versão,
  estado confirmado, latência e erro; não mockar o service em testes de rota.
- Playwright: acrescentar os cenários observáveis à suíte
  `ui/tests/integration/routes/training.spec.ts`, cobrindo Drawer e Modal, pausa,
  continuidade da série e recuperação explícita. Não acessar API real nem usar
  `page.route` para simular respostas.
- Android: validar resolução pelo repository nativo, commit anterior ao fechamento
  e falha sem fallback; smoke de expiração e retomada sem rede. Relógio monotônico
  e lifecycle reais não são substituídos pelo Playwright do navegador.
- Layout: conferir as duas referências de timer existentes nos seus viewports,
  sem gerar ou sobrescrever referências para esta correção funcional.
- Gates da implementação, executados pela raiz: `pnpm lint`, `pnpm test`,
  `pnpm test:coverage:ci`, `pnpm test:integration` e `pnpm build`. E2E da API não é
  exigido pelo escopo exclusivamente frontend sem mudança de endpoint, wiring,
  MongoDB ou Redis.
- A criação desta especificação é `docs-only` e dispensa os gates de código.

## Riscos e decisões

- Decisão validada: automatizar somente `series-rest` e `pause`, nas duas
  apresentações. `duration` não recebe automação pelo contador da UI.
- Fechamento aguarda sucesso: atraso da API ou do commit pode manter zero visível
  durante pending; isso evita esconder uma resolução ainda não confirmada.
- A proteção existente por referência em `TrainingTimerOverlay` precisa distinguir
  tentativa em voo de falha recuperável e ser renovada para um novo timer.
- Leituras Web já podem resolver timers vencidos no servidor. O cliente deve
  respeitar o estado canônico e a política de conflito existente, sem tentar
  resolver novamente um timer removido ou modificar essa regra do backend.
- Versões verificadas em manifests, lockfile e instalação local: React `19.3.1`,
  HeroUI `3.2.6` e TanStack Query `5.104.5`. O desenho preserva as APIs locais de
  overlay e mutation, sem upgrade ou nova dependência.
- A [referência oficial de efeitos React](https://react.dev/reference/react/useEffect)
  orienta cleanup e repetição de efeitos. Os índices oficiais
  [HeroUI](https://heroui.com/react/llms.txt),
  [componentes](https://heroui.com/react/llms-components.txt) e
  [padrões](https://heroui.com/react/llms-patterns.txt), junto às páginas de
  [Drawer](https://heroui.com/en/docs/react/components/drawer) e
  [Modal](https://heroui.com/en/docs/react/components/modal), orientam a composição
  existente; os tipos e o código instalados confirmam `useOverlayState` e a prop
  `state` nos dois componentes. Essas APIs não substituem a resolução do domínio.

## Condições esperadas da entrega

- Descansos vencidos resolvidos e fechados nas duas apresentações e plataformas.
- Séries e cargas preservadas; pausas concluídas conforme o domínio; duração com
  ações manuais e workout com confirmação final preservados.
- Falha recuperável sem bloqueio permanente, duplicidade ou loop de requests.
- Rota, arquitetura da UI e fluxo atualizados junto da implementação.
- MSW e testes ajustados ao impacto, sem alteração de contrato público.
- Revisão de código sem uso concluída e quality gates aplicáveis aprovados.
