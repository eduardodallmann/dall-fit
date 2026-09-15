# Feature Spec: Adaptar a jornada Treinar para execução offline no Android

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #89](https://github.com/eduardodallmann/dall-fit/issues/89).
- Problema: o Android já prepara o plano ativo e suas imagens no motor nativo,
  possui storage transacional, fila, transporte e sincronização em foreground e
  pelo WorkManager, mas a jornada Treinar ainda lê e altera exclusivamente a sessão
  online da API. Perder a conexão impede selecionar, iniciar, executar, temporizar,
  interromper, retomar e concluir um treino, e nenhuma ação da tela produz os
  snapshots v1 que o sincronizador já sabe enviar.
- Resultado: a mesma UI React consome uma interface de domínio comum. Web/PWA
  preserva o repository HTTP vigente; Android usa um repository nativo apoiado no
  plano preparado, na sessão ativa e nos snapshots SQLite. Cada ação é confirmada
  localmente antes do feedback visual, timers sobrevivem a background e recriação
  do WebView, uma sessão interrompida exige continuação ou descarte explícito e
  conclusões/cancelamentos entram na fila existente sem depender de rede.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [rotas e comportamento da UI](../../../ui/docs/sdd/base/02-rotas-e-comportamento.md);
  - [componentes e estilização](../../../ui/docs/sdd/base/03-componentes-e-estilizacao.md);
  - [testes e qualidade da UI](../../../ui/docs/sdd/base/04-testes-e-qualidade.md);
  - [mocks de API](../../../ui/docs/sdd/base/05-mocks-de-api.md);
  - [testes Playwright](../../../ui/docs/sdd/base/07-testes-integrados-playwright.md);
  - [rota Treinar](../../../ui/docs/sdd/routes/training.md);
  - [rota de execução](../../../ui/docs/sdd/routes/training-workout.md);
  - [rota de conclusão](../../../ui/docs/sdd/routes/training-completion.md);
  - [fluxo de execução de treino](../flows/execucao-de-treino.md);
  - [ADR-0010 — sessão efêmera e histórico](../adr/ADR-0010-sessao-efemera-e-historico-de-treino.md);
  - [ADR-0012 — Capacitor Android e fronteira de plataforma](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md);
  - [ADR-0014 — motor nativo de persistência offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [ADR-0015 — lease offline de treino](../adr/ADR-0015-lease-offline-de-treino-no-redis.md);
  - [plugin Capacitor](https://capacitorjs.com/docs/plugins/creating-plugins);
  - [`SystemClock`](https://developer.android.com/reference/android/os/SystemClock).
- Features relacionadas: FIT-0082 fornece sessão, snapshots e revisão no motor;
  FIT-0083 fornece plano e mídia preparados; FIT-0084 fornece o lease remoto;
  FIT-0085/FIT-0086 definem o envelope v1 e seus terminais; FIT-0087/FIT-0088
  enviam a fila. A FIT-0090 será proprietária do resumo provisório, substituição
  pelo canônico, takeover e conflitos; a FIT-0091 será proprietária da experiência
  offline do Web/PWA; a FIT-0092 tratará atualização mínima e migrations futuras.

As versões vigentes verificadas no repositório são Capacitor `8.5.2`, React
`19.2.8`, TanStack Query `5.101.4`, TanStack Router `1.170.18`, Axios `1.18.1`,
HeroUI `3.2.2`, Android mínimo API 29 e compile/target SDK 36. O relógio monotônico
Android `SystemClock.elapsedRealtime()` inclui deep sleep e é adequado para medir
intervalos durante a vida do boot; timestamps civis persistidos continuam sendo a
fonte recuperável entre reinicializações e para validação do backend.

## Escopo

### Incluído

- criar uma interface de domínio única para visão do plano, prévia, sessão, ações,
  timers, descarte e conclusão, com adapters HTTP e nativo escolhidos pela
  composição de plataforma, não pelos componentes;
- manter Web/PWA integralmente no adapter HTTP e fazer o Android usar sempre o
  adapter nativo para a jornada, esteja online ou offline;
- evoluir o payload opaco do plano preparado apenas no necessário para leitura
  segura, versão compatível e vínculo com o lease obtido pela instalação;
- registrar silenciosamente o primeiro lease da instalação pelo endpoint vigente
  durante preparação online e persistir somente os campos necessários à criação
  dos envelopes de snapshot;
- materializar visão geral e prévias locais a partir do plano preparado, usando
  arquivo `display` local quando pronto e fallback explícito para imagem ausente ou
  YouTube offline;
- representar conectividade e prontidão separadamente: plano válido permite treino
  sem rede; ausência, expiração ou payload incompatível exige conexão e preparação;
- redirecionar navegação autenticada offline fora da jornada suportada para
  `/training` quando houver plano válido e mostrar conexão necessária quando não
  houver, sem criar réplica das demais rotas;
- criar localmente uma única sessão ativa a partir do workout preparado somente
  depois de verificar a validade do plano e a autorização local necessária;
- transformar todas as ações atuais de série, carga, exercício e timer em mudanças
  atômicas da sessão local, seguidas da substituição coalescida do snapshot v1 da
  execução na fila nativa;
- conservar UX otimista com commit local anterior à atualização de cache, toast,
  navegação, foco ou confirmação de sucesso;
- usar relógio monotônico para o contador apresentado enquanto o boot permanecer o
  mesmo e persistir timestamps, duração bruta e resolução suficientes para
  reconstrução segura e validação posterior da API;
- retomar a sessão depois de refresh, background, recriação do WebView ou morte do
  processo, exigindo `Continuar treino` ou `Descartar treino` antes de iniciar
  outro;
- transformar descarte em snapshot terminal `cancelled`, sem apagar a versão que
  aguarda sincronização, e permitir depois uma nova sessão;
- transformar finalização integral ou parcial em snapshot terminal `completed`,
  remover a sessão ativa e voltar à lista local; resumo provisório e substituição
  pelo canônico permanecem na FIT-0090;
- permitir várias execuções terminais na fila, mantendo no máximo uma sessão ativa;
- preservar as confirmações, validações, foco, teclado, responsividade e proteção
  de saída já vigentes na rota de execução;
- adicionar testes do reducer/repository, bridge e storage, componentes e jornadas
  Playwright compatíveis com o browser; completar com testes Android instrumentados
  e smoke em modo avião para as garantias nativas;
- atualizar, na futura implementação, os SDDs vivos da UI e o fluxo ponta a ponta,
  além de contratos, mocks e referências afetados pelo comportamento entregue.

### Não incluído

- resumo provisório, consulta e substituição pelo resumo canônico, indicação visual
  de pendência ou navegação automática para uma conclusão já sincronizada;
- telas ou ações de takeover, autenticação necessária, conflito editável,
  imutabilidade, lease expirado/revogado ou atualização obrigatória;
- merge campo a campo, resolução de conflito, descarte de erro permanente ou centro
  técnico de pendências;
- mudança nos endpoints de snapshot, lease, sessão online, conclusão ou overview;
- novo transporte, política de retry, fila, WorkManager, serviço em foreground ou
  garantia de prazo de sincronização;
- cache privado, IndexedDB, Background Sync ou treino offline em Web/PWA;
- acesso offline ao Dashboard, gestão de planos, assistente ou rotas administrativas;
- download de vídeo do YouTube, thumbnail adicional ou mídia diferente do WebP
  `display` já preparado;
- iniciar novo treino depois que o plano preparado expirar, mesmo que um terminal
  antigo ainda aguarde sincronização;
- interromper uma sessão já iniciada porque plano, lease ou Bearer expirou durante
  sua execução;
- suportar duas sessões ativas, dois aparelhos editores ou recuperar dados de uma
  instalação revogada;
- notificação, permissão de notificação, Analytics offline persistido, iOS, release
  de loja ou live update.

## Projetos e documentação afetados

- API e endpoints: nenhum comportamento HTTP novo. O cliente passa a consumir
  `PUT /training/offline-lease` e os endpoints de preparação já existentes; a
  documentação viva só será ajustada se a implementação revelar esclarecimento do
  consumo sem alterar contrato. `PUT /training/offline-snapshot` continua sendo
  chamado exclusivamente pelo sincronizador nativo já entregue.
- UI e rotas: `/training` e `/training/workout/:workoutId` passam a consumir o
  repository composto por plataforma. `/training/completion/:id` permanece
  canônica e online. O shell autenticado ganha o guard de disponibilidade offline
  para rotas não suportadas. As referências visuais existentes de Treinar e
  execução serão preservadas nos estados equivalentes; novos estados são descritos
  textualmente, sem gerar screenshot não solicitado.
- Fluxos: atualizar `docs/sdd/flows/execucao-de-treino.md` na implementação com
  seleção local, lease inicial, persistência, retomada, descarte e terminal offline.
- Contratos em `@dall-fit/types`: reutilizar `OfflineTrainingSnapshotV1` e
  `PutOfflineTrainingSnapshotV1Request`. Promover request/response do lease somente
  porque passam a ter consumidor UI. Tipos da bridge, sessão local, conectividade e
  mídia local permanecem exclusivos da UI.
- Decisões arquiteturais: ADR-0010, ADR-0012, ADR-0014 e ADR-0015 já determinam as
  fronteiras necessárias. Não se espera nova ADR; uma decisão transversal diferente
  devolve a feature ao refinamento.
- Handlers e fixtures MSW: adicionar lease e estados Android injetáveis sem fazer o
  browser chamar plugin; preservar todos os handlers HTTP existentes do caminho Web.
- Mocks de repositories/caches nos unitários da API: não afetados.
- Fixtures MongoDB/Redis nos E2E: não afetadas porque o contrato dos endpoints não
  muda; os E2E vigentes permanecem a validação do backend.
- Android: estender plugin e serviço somente com comandos coesos de leitura/commit
  da jornada e fonte monotônica, reutilizando o singleton, transações e fila atuais.

## Modelo de domínio e seleção da fonte

1. Componentes e hooks conhecem somente um `TrainingRepository`. O contrato oferece
   operações equivalentes às ações da tela e devolve projeções de visão geral,
   prévia e sessão, sem expor Axios, Capacitor, SQLite, paths ou plugin calls.
2. A composição `web` injeta o repository HTTP vigente. Ela continua usando sessão
   Redis, versão em `X-Resource-Version`, responses canônicas e TanStack Query.
3. A composição `android` com `nativeOfflineStorage: true` injeta o repository
   nativo. Ele não alterna para HTTP por ação nem mantém duas sessões; conectividade
   serve para preparação, lease e sincronização, não para escolher a autoridade da
   execução.
4. Query keys distinguem a fonte/generação quando necessário. Cache HTTP anterior
   não pode substituir a projeção nativa, e troca de conta/plataforma limpa qualquer
   estado privado conforme o lifecycle vigente.
5. O payload local tem versão explícita. Versão desconhecida, shape inválido,
   validade ausente ou expirada não é reinterpretada; sem uma sessão já iniciada,
   o repository retorna `connection-required` até uma preparação online compatível.
6. No Android online, a entrada em Treinar mantém a atualização da FIT-0083. A
   listagem pode usar imediatamente um plano local ainda válido enquanto a
   atualização ocorre; commit novo substitui apenas futuras prévias e não altera a
   árvore capturada por uma sessão ativa.

## Lease, validade e conectividade

1. Durante uma preparação online compatível, o coordenador obtém o UUID da
   instalação do secure storage e chama `PUT /training/offline-lease` pelo Axios
   Bearer vigente. `created`, `unchanged` e `plan-rebound` são sucessos; lease e
   vencimento são associados ao plano preparado sem entrar em logs ou Analytics.
2. `OFFLINE_LEASE_TAKEOVER_REQUIRED` não executa takeover implícito. A preparação
   não autoriza nova sessão offline e apresenta indisponibilidade segura com ação
   para tentar novamente; a comparação e a confirmação pertencem à FIT-0090.
3. Ausência de rede não invalida plano e lease locais ainda dentro da janela. O
   início compara o instante civil corrente com `expiresAt`; a expiração bloqueia
   nova sessão e nunca é estendida localmente.
4. Depois do início, a sessão captura plano, workout, fence e validade observados.
   Expiração posterior do plano, lease ou Bearer não interrompe ações nem conclusão;
   apenas sincronização pode permanecer pausada ou exigir ação futura.
5. O estado de conectividade é um hint observável e reparável por leitura canônica,
   não prova acesso à API. Erro real de preparação/lease prevalece sobre um indicador
   nominal de rede disponível.
6. Ao ficar sem conexão em outra rota autenticada, a navegação corrente ou a próxima
   revalidação usa `replace`: plano preparado válido leva a `/training`; sem plano
   válido, o shell mantém uma superfície acessível de conexão necessária. `/`, login
   e teardown de sessão não são capturados por esse guard.
7. Voltar a ficar online revalida a condição. A pessoa pode tentar novamente a rota
   pretendida manualmente; esta feature não persiste nem restaura um destino offline.

## Sessão, snapshots e ações locais

1. Iniciar gera IDs aleatórios e opacos distintos para sessão local e `executionId`,
   captura o plano completo exigido por `OfflineTrainingSnapshotPlanV1`, clona o
   workout preparado e materializa séries/cargas iniciais conforme o contrato atual.
2. A sessão começa em revisão inteira monotônica. O mesmo commit grava a sessão ativa
   e o envelope `PutOfflineTrainingSnapshotV1Request` em estado `in-progress`; não há
   intervalo observável em que a UI confirme início sem snapshot enfileirado.
3. Cada ação valida contra a sessão corrente, produz uma nova árvore imutável,
   incrementa a revisão uma vez e grava atomicamente sessão + snapshot da mesma
   revisão. Falha local não altera cache nem apresenta sucesso e permite retry.
4. Carga continua sendo inteiro de `0` a `9999` ou `null`. Concluir série grava a
   carga corrente atomicamente; concluir restantes usa o vetor corrente. Concluir e
   reiniciar exercício preservam as regras atuais, sem apagar cargas.
5. A fila visual de mutations continua FIFO por sessão. Como o commit SQLite é a
   confirmação canônica, ações em sessões diferentes não existem em paralelo e uma
   resposta antiga da bridge não pode regredir revisão ou draft posterior.
6. Toda revisão substitui o snapshot pendente da própria execução e preserva sua
   `queue_sequence`. Execuções terminais anteriores continuam independentes na fila.
7. Conclusão exige timer resolvido e, quando incompleta, a confirmação atual. O
   commit atômico grava `completed`, remove a sessão ativa por revisão esperada e
   conserva o snapshot terminal; somente então a UI fecha a confirmação e retorna
   com `replace` para `/training`.
8. Descarte exige confirmação, resolve/cancela qualquer timer local de forma
   coerente, grava `cancelled`, remove a sessão ativa e conserva o terminal. Se o
   descarte anteceder o início de uma sessão, nada é enfileirado.
9. Falha entre gravação terminal e remoção da sessão não pode publicar metade da
   transição. Repetir a operação é idempotente por execução e revisão.
10. Ao sincronizar, o engine existente envia o envelope completo já persistido. A
    jornada não chama HTTP diretamente, não aguarda a response e não remove o
    snapshot por conta própria.

## Timers e retomada

1. A sessão persiste `startedAt`, duração bruta em segundos, alvo, série opcional e
   dados de resolução. Ela nunca persiste apenas o valor restante exibido.
2. Ao iniciar timer, o adapter Android registra no mesmo estado o timestamp civil e
   a referência `elapsedRealtime` do boot atual. A apresentação deriva o restante
   da fonte monotônica e não escreve um snapshot por tick.
3. Background e tela bloqueada não pausam o timer. Reabrir no mesmo boot recupera a
   referência monotônica; após reboot ou ausência dessa referência, deriva o
   restante dos timestamps civis persistidos, limita o resultado ao intervalo válido
   e volta a ancorar a apresentação no relógio monotônico.
4. Alteração manual do relógio não produz duração negativa nem acima do limite
   bruto plausível. A resolução persiste a duração efetivamente observada e o
   outcome `cancel | finish | skip` antes de atualizar a tela.
5. Timer vencido pode continuar visível até a pessoa executar a ação já prevista;
   o término do contador não conclui silenciosamente exercício, série ou treino.
6. Ao montar `/training` ou qualquer workout, a existência de sessão ativa abre uma
   decisão não descartável com `Continuar treino` e `Descartar treino`. Continuar
   navega para o workout capturado; descartar exige confirmação terminal antes de
   liberar outro início.
7. Refresh, recriação do WebView, background e morte do processo consultam o estado
   nativo, não TanStack Query ou memória JavaScript, e recompõem drafts, expansão e
   timer a partir da sessão confirmada.

## Mídia e apresentação

1. Imagem preparada e `ready` é exposta por uma URL local controlada pela bridge,
   sem revelar path absoluto. Ausência, arquivo temporário ou falha de leitura mostra
   o fallback atual e não impede nenhuma ação.
2. YouTube Short, YouTube Long e demonstração de atividade por duração não tentam
   tocar ou carregar conteúdo remoto sem conexão. A superfície preserva nome,
   proporção e mensagem acessível de indisponibilidade, e pode voltar a abrir online.
3. A UI não baixa YouTube nem converte imagem para base64/JSON. URLs assinadas não
   entram em sessão ou snapshot.
4. Estados equivalentes preservam composição, ordem, responsividade e overlays das
   referências visuais vigentes. Avisos novos usam componentes HeroUI existentes e
   não alteram o layout aprovado além da superfície funcional documentada.

## Requisitos não funcionais

- Acessibilidade:
  - decisões de continuar/descartar e conexão necessária possuem título, descrição,
    foco inicial, navegação por teclado e ações inequívocas;
  - o guard offline não cria loop de foco ou navegação, e mudanças de conectividade
    relevantes são anunciadas sem repetir eventos ruidosos;
  - fallbacks de mídia têm nome acessível e não dependem somente de ícone/cor;
  - semântica, `aria-expanded`, foco no próximo exercício e confirmação de saída
    permanecem equivalentes ao caminho Web.
- Performance:
  - commits locais são transações curtas fora da main thread e não aguardam rede;
  - contador atualiza somente apresentação e não escreve SQLite por tick;
  - uma ação materializa no máximo a sessão e o snapshot corrente, ambos dentro do
    limite de 1 MiB já aceito pelo backend;
  - leituras de overview/prévia não copiam bytes de mídia para JavaScript.
- Segurança e privacidade:
  - Bearer, UUID, `leaseId`, payload, nomes, cargas, timestamps, IDs e paths não
    entram em logs, Analytics, URL, WorkManager `Data` ou storage Web;
  - banco e mídia continuam privados e excluídos de backup/transferência;
  - Web/PWA não registra ou chama o plugin e não recebe fallback IndexedDB;
  - redirecionamento offline não preserva query desconhecida nem vaza rota privada.
- Observabilidade:
  - métodos nativos seguem `NomeDaClasse -> nomeDoMetodo -> etapa:` com operação,
    categoria, revisão e contagem sanitizadas;
  - início, commit, retomada, terminal, falha local e branch de relógio são
    distinguíveis sem conteúdo de treino ou identificadores;
  - operação offline comum e sincronização bem-sucedida não geram toast, notificação
    ou Analytics persistido.
- Resiliência e concorrência:
  - sessão e snapshot da mesma revisão são atômicos; CAS impede remoção ou resposta
    tardia de alcançar revisão nova;
  - troca de conta e logout invalidam a geração antes de qualquer callback e seguem
    a confirmação vigente quando há sessão ou snapshot pendente;
  - falha do plugin não usa API online como fallback silencioso no Android.
- Compatibilidade: schema SQLite permanece proprietário do motor e os payloads
  opacos evoluem por `payloadVersion`; API 29+, Capacitor e gates Web continuam
  suportados. Plano preparado legado sem lease/shape compatível exige nova
  preparação online, sem migration especulativa.
- Limite de execução: a implementação deve caber em uma sessão de até cinco horas.
  Para isso reutiliza a UI, o storage, o downloader, a fila, o transporte e o
  WorkManager vigentes; concentra regras locais em reducer/repository e não inclui
  nenhuma superfície proprietária das FIT-0090, FIT-0091 ou FIT-0092.

## Critérios de aceite

### Cenário 1 — fluxo completo em modo avião

- Forma de validar: teste Android instrumentado e smoke no APK debug; URL isolada
  não reproduz SQLite e bridge reais.
- Given: a pessoa possui sessão nativa, lease e plano preparado ainda válidos.
- When: ativa modo avião, abre Treinar, escolhe um workout, inicia, altera cargas,
  conclui séries/exercícios e finaliza.
- Then: todas as telas respondem sem request da jornada, a sessão é removida apenas
  no terminal e um snapshot `completed` íntegro permanece na fila.

### Cenário 2 — commit local antecede feedback

- Forma de validar: teste de componente com repository controlado e teste Android
  com falha injetada antes/depois do commit.
- Given: uma ação de carga ou conclusão é acionada.
- When: o commit local fica pendente ou falha.
- Then: a UI não publica sucesso antes do commit; em sucesso atualiza imediatamente,
  e em falha preserva a última sessão confirmada e permite retry.

### Cenário 3 — refresh e morte do WebView preservam progresso

- Forma de validar: teste Android instrumentado recriando Activity/WebView e smoke
  com fechamento forçado.
- Given: existe sessão com ações e timer confirmados.
- When: o WebView é recarregado, o app vai ao background ou o processo é recriado.
- Then: a UI lê a mesma revisão do SQLite, mostra a decisão de retomada e continuar
  recompõe exercícios, cargas e timer sem regressão.

### Cenário 4 — sessão interrompida exige decisão

- Forma de validar: Playwright com repository nativo injetável e teste de componente
  do diálogo.
- Given: existe sessão local ativa e a pessoa abre Treinar ou outro workout.
- When: tenta prosseguir.
- Then: precisa escolher `Continuar treino` ou `Descartar treino`; fechar por backdrop
  ou Escape não descarta nem inicia outra sessão.

### Cenário 5 — descarte cria cancelamento terminal

- Forma de validar: teste Android da transação e Playwright da confirmação.
- Given: existe sessão ativa com progresso.
- When: a pessoa confirma o descarte.
- Then: sessão e snapshot `cancelled` transitam atomicamente, o terminal permanece
  sincronizável e um novo treino só fica disponível depois do commit.

### Cenário 6 — timer resiste a background e reboot

- Forma de validar: teste Java com relógios injetáveis e teste instrumentado com
  lifecycle/recriação.
- Given: um timer foi iniciado e persistido.
- When: tempo passa em background, o WebView é recriado ou a referência monotônica
  anterior deixa de ser válida.
- Then: o contador usa monotônico quando possível, fallback civil limitado quando
  necessário e resolução persiste duração bruta não negativa sem writes por tick.

### Cenário 7 — validade é verificada somente no início

- Forma de validar: teste do repository com relógio controlado.
- Given: o plano expira durante uma sessão já iniciada.
- When: a pessoa continua e finaliza, e depois tenta iniciar outra execução.
- Then: a sessão corrente conclui normalmente; o novo início é bloqueado até uma
  preparação online renovar os dados.

### Cenário 8 — Bearer expirado não interrompe treino válido

- Forma de validar: teste de composição Android e smoke em modo avião.
- Given: plano/sessão estão dentro da validade local e o Bearer expirou.
- When: a pessoa executa e conclui o treino.
- Then: commits locais continuam; o snapshot permanece aguardando autenticação e
  nenhuma ação tenta cookie, CSRF ou login implícito.

### Cenário 9 — mídia indisponível não bloqueia conclusão

- Forma de validar: Playwright nos adapters injetáveis e smoke Android removendo um
  arquivo preparado.
- Given: uma imagem local está ausente e YouTube não possui rede.
- When: a pessoa abre os exercícios e conclui o workout.
- Then: fallbacks acessíveis substituem a mídia, nenhuma URL remota é persistida e
  todas as ações continuam disponíveis.

### Cenário 10 — várias conclusões aguardam sincronização

- Forma de validar: teste Android com SQLite real.
- Given: não há rede e uma execução já terminou.
- When: a pessoa inicia e conclui outro workout válido.
- Then: existe no máximo uma sessão ativa, mas ambos os terminais permanecem em
  snapshots distintos e ordem local estável para o sincronizador.

### Cenário 11 — conclusão offline não antecipa resumo provisório

- Forma de validar: Playwright da jornada Android injetável.
- Given: a sessão offline pode ser finalizada integral ou parcialmente.
- When: o terminal local recebe commit.
- Then: a UI retorna com `replace` à lista local, não consulta a conclusão canônica,
  não inventa métricas e não apresenta resumo provisório reservado à FIT-0090.

### Cenário 12 — Web permanece exclusivamente online

- Forma de validar: Playwright/Vitest com adapter Web e MSW Browser.
- Given: a aplicação executa fora do Android nativo.
- When: percorre visão, prévia, sessão, mutations e conclusão.
- Then: usa os endpoints e conflitos vigentes, não registra/importa plugin, não cria
  SQLite/IndexedDB e preserva os cenários atuais.

### Cenário 13 — outras rotas não simulam suporte offline

- Forma de validar: Playwright do guard com plataforma/conectividade injetáveis.
- Given: o Android perde conexão em Dashboard, planos ou rota administrativa.
- When: há plano preparado válido ou não há dados válidos.
- Then: o primeiro caso substitui a navegação por `/training`; o segundo mostra
  conexão necessária, sem loop, restauração automática ou request privada em cache.

### Cenário 14 — registro de lease é seguro e sem takeover implícito

- Forma de validar: Vitest do coordenador com handlers MSW do endpoint vigente.
- Given: a preparação online recebe sucesso ou
  `OFFLINE_LEASE_TAKEOVER_REQUIRED`.
- When: tenta habilitar o plano para novas sessões offline.
- Then: sucesso persiste o fence necessário; conflito não chama takeover, não
  sobrescreve editor e mantém a jornada bloqueada para início até a FIT-0090.

## Estratégia de entrega e compatibilidade

1. Extrair reducer e `TrainingRepository` sem mudar primeiro o comportamento Web;
   cobrir equivalência e manter o adapter HTTP sobre os services atuais.
2. Promover os contratos de lease consumidos pela UI e adicionar service/handlers
   MSW, sem alterar o endpoint.
3. Evoluir o payload preparado para uma versão compatível com lease e projeções
   locais; dados legados ficam bloqueados até nova preparação online.
4. Acrescentar ao plugin operações coesas de sessão + snapshot, leitura de mídia e
   relógio, sem expor SQL ou transações genéricas.
5. Implementar o repository Android e compô-lo apenas quando a capability nativa
   estiver disponível; manter Web como fallback determinístico de plataforma, não
   como fallback de falha local.
6. Integrar visão, workout, timers, retomada, descarte, conclusão e guard offline,
   preservando o layout e a acessibilidade existentes.
7. Adicionar testes por camada, atualizar os SDDs vivos, revisar API/UI por código
   sem uso e executar os gates aplicáveis.

O rollout não tenta migrar um plano preparado legado, pois ele pode ser baixado
novamente e não é pendência. Sessões/snapshots só passam a ser produzidos depois que
o novo repository está ativo. Rollback funcional deixa terminais no schema opaco
para uma versão compatível posterior e nunca os apaga como compensação. Alteração
necessária no contrato v1 do backend, no schema normalizado ou nas decisões da
FIT-0090 exige retorno ao refinamento antes de implementar.

## Plano de testes

- Reducer/repository em Vitest:
  - materialização dos cinco tipos de exercício, cargas nulas e revisão monotônica;
  - matriz de ações, validações, conclusão parcial e terminais;
  - sessão única, retomada, descarte, idempotência e falha de commit;
  - timers com monotônico, background, relógio civil alterado e reboot;
  - validade no início e continuidade após expiração/Bearer ausente;
  - adapters Web e Android sem fallback cruzado.
- Componentes em Testing Library:
  - estados de prontidão/conectividade, retry e mídia indisponível;
  - decisão obrigatória de continuar/descartar, foco, teclado e dismiss bloqueado;
  - pending local, falha recuperável, foco no próximo exercício e reload safety;
  - nenhuma métrica/resumo inventado após conclusão offline.
- MSW e Playwright:
  - equivalência completa do fluxo Web atual;
  - registro de lease nos estados de sucesso, erro técnico e takeover obrigatório;
  - fluxo Android injetável em modo offline, refresh, retomada, descarte e múltiplos
    terminais sem simular plugin por request HTTP;
  - redirects das rotas não suportadas e ausência de loop;
  - layout móvel/desktop nos estados já representados pelas referências vigentes.
- Java/Android instrumentado:
  - transação sessão + snapshot e terminal + remoção, inclusive falha injetada;
  - CAS de revisão, coalescência e preservação de `queue_sequence`;
  - leitura de arquivo ready sem path exposto e fallback de ausente/temporário;
  - `elapsedRealtime`, recriação de Activity/WebView, background e reboot simulado;
  - troca/logout de conta durante chamada e isolamento de geração;
  - snapshots produzidos aceitos pelo transporte/contrato v1 já testado.
- Validação manual:
  - APK debug em API 29+ com plano preparado, modo avião e jornada completa;
  - background, fechamento forçado, reabertura e continuidade do timer;
  - ausência de requests de treino, Bearer/payload em logcat e paths expostos;
  - Web/PWA online sem tentativa de bridge.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`;
  - `pnpm android:sync`;
  - `pnpm android:build:debug`;
  - `pnpm android:test` em dispositivo ou emulador conectado.

## Riscos e decisões

- Decisão: Android usa uma fonte nativa única mesmo online. Alternar por request
  criaria duas autoridades e poderia perder ações exatamente na queda da rede.
- Decisão: o primeiro registro de lease integra esta entrega, mas takeover e demais
  recuperações continuam na FIT-0090. Sem fence, o snapshot produzido nunca poderia
  ser aceito com segurança.
- Decisão: conclusão local retorna à lista e não abre a rota canônica. Qualquer
  resumo antes da response do backend seria provisório e pertence explicitamente à
  FIT-0090.
- Decisão: monotônico dirige apenas apresentação no boot atual; timestamps civis e
  duração bruta preservam retomada e validação após reboot.
- Risco: conectividade nominal pode divergir da internet real. Preparação e lease
  classificam a request efetiva, e o plano válido nunca é apagado por falso positivo.
- Risco: falha local torna indisponível a única fonte Android. A aplicação falha
  fechado e mantém retry; não envia a ação ao HTTP como compensação.
- Risco: a árvore completa se aproxima do limite de 1 MiB. Testes usam os máximos
  vigentes e o início falha antes de criar sessão parcial quando o envelope excede.
- Risco: alteração manual do relógio ou reboot reduz a precisão recuperável. O
  fallback é limitado e o backend continua validando a coerência do snapshot.
- Risco: o guard offline alcança várias rotas. Ele fica no shell/roteador e usa uma
  única decisão tipada, evitando condicionais duplicadas em cada tela.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- Quality gates da raiz aprovados
