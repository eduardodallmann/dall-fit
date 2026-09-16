# Fluxo `Execução de treino`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

- Ator: pessoa autenticada com um plano de treino ativo.
- Problema resolvido: selecionar, executar, retomar e finalizar um workout com
  acompanhamento por série, carga opcional e timers.
- Resultado esperado: progresso efêmero retomável e resumo durável após a
  finalização.

## Entrada e pré-condições

A pessoa escolheu exatamente uma entrada ativa em `/training-plan`. O plano pode
ser próprio ou referência global viva. Somente um treino pode estar em andamento
por pessoa.

## Rotas e endpoints participantes

| Ordem | Etapa               | Rota de UI                                 | Endpoint da API                                                |
| ----: | ------------------- | ------------------------------------------ | -------------------------------------------------------------- |
|     1 | listar workouts     | `/training`                                | `GET /training`                                                |
|     2 | revisar e iniciar   | `/training/workout/:workoutId`             | `GET /training/workouts/:workoutId`, `POST .../session`        |
|     3 | executar ou retomar | `/training/workout/:workoutId`             | `GET /training/session` e mutações de série, timer e exercício |
|     4 | finalizar           | mesma rota                                 | `POST /training/session/complete`                              |
|     5 | consultar resultado | `/training/completion/:workoutExecutionId` | `GET /training/completions/:workoutExecutionId`                |
|     — | autorizar edição offline | preparação Android | `PUT /training/offline-lease` ou `POST /training/offline-lease/takeover` após confirmação |
|     — | sincronizar, concluir ou cancelar offline | sincronizador Android em foreground ou WorkManager | `PUT /training/offline-snapshot` |
|     — | negociar compatibilidade Android | composição nativa e Worker | `GET /app-compatibility/android` |

## Sequência e decisões

1. Na abertura, resume e recuperação de conectividade, somente o Android consulta
   a política pública e compara o `versionCode` real do pacote com o maior mínimo
   já observado. Pacote obsoleto bloqueia a jornada e o sincronizador; falha sem
   política conhecida não inventa bloqueio. Se já existe sessão local, somente seu
   path de workout pode chegar ao terminal local, sem envio. Depois da atualização,
   a build abre e migra v1/v2/v3 até o schema v4 antes de rearmar os envelopes
   compatíveis na mesma ordem. Reset é último recurso e exige reconhecimento do
   aviso persistido fora do banco novo.
2. No Web/PWA, um hint offline impede a montagem de toda a jornada, preserva a URL
   solicitada e apresenta somente `Conexão necessária`; não há request, cache de
   domínio, Background Sync, Analytics offline nem replay na reconexão. Recuperada
   a rede, a mesma rota é remontada contra as autoridades online. No Android,
   entrar na listagem valida o snapshot local pela janela de sete dias
   emitida pela API e já pode renderizar overview e previews locais enquanto
   atualiza online. A preparação registra silenciosamente o lease da instalação,
   persiste o fence com o payload v2 e confirma o snapshot essencial antes dos
   downloads display; mídia incompleta nunca bloqueia. Em instalação sem sessão ou
   snapshot local, takeover explícito pode transferir o editor; dados de lease
   revogado ou expirado precisam ser descartados antes e nunca atravessam a nova
   concessão. Web/PWA permanecem exclusivamente online.
   O backend mantém lease Redis exclusivo e ingestão idempotente de snapshots v1.
   Uma revisão nova aceita renova atomicamente lease e snapshot por sete dias;
   replay não renova. Conflitos devolvem a versão segura do servidor. O
   sincronizador Android envia sequencialmente os envelopes produzidos pela jornada
   em foreground ou pelo WorkManager, preservando revisões concorrentes e terminais
   distintos na ordem local.
3. A listagem resolve o plano ativo e marca como atual o workout seguinte ao último
   concluído; uma sessão Redis existente prevalece e é marcada em andamento. Ao
   ativar um plano na gestão pessoal, a UI remove o cache deste domínio para que
   uma resposta anterior sem plano não sobreviva à próxima navegação.
4. A prévia resolve mídia e sugere as últimas cargas duráveis, inclusive `null`.
   Antes de iniciar, a pessoa pode retornar à seleção por um link próprio; ele não
   aparece durante a sessão.
5. No Web, iniciar cria o snapshot Redis exclusivo com TTL absoluto de 24 horas.
   No Android, iniciar valida plano/lease locais, captura a árvore preparada e grava
   sessão + snapshot `in-progress` em uma transação SQLite. Se outro workout já
   estiver ativo, a pessoa continua ou confirma o descarte terminal antes do novo.
6. Cada mutation Web envia a versão canônica; cada ação Android incrementa uma
   revisão e confirma sessão + envelope coalescido localmente antes do feedback.
   Carga é inteira entre 0 e 9999 ou vazia;
   concluir série aceita ambos atomicamente. Descansos e exercícios temporizados
   usam timestamps do servidor. Salvar carga e concluir compartilham uma fila FIFO
   por sessão, lendo a versão somente ao chegar à cabeça. Um PUT de carga pendente
   não bloqueia campos incompletos nem ações de conclusão; a ação usa o draft mais
   novo e respostas antigas não o sobrescrevem.
7. Conflito descarta drafts, refaz a leitura canônica e exige nova ação. Um treino
   incompleto requer confirmação explícita para finalizar.
8. A finalização Web grava execução e perfis no MongoDB, remove o snapshot Redis e
   navega para o resumo semanal compartilhável. A finalização Android grava
   `completed`, remove a sessão e grava uma apresentação compacta provisória no
   mesmo commit, então volta para `/training` sem abrir a tela semanal.
9. Na sincronização offline, `completed` consolida a árvore capturada e devolve o mesmo
   resumo semanal; `cancelled` descarta a execução sem histórico. Ambos gravam um
   recibo imutável antes da limpeza condicionada do snapshot. Replay terminal
   continua idempotente mesmo após lease ou Redis expirarem.
10. O sucesso canônico promove somente o card da mesma execução e sequência; resposta
   antiga não substitui conclusão posterior. Conflito pausa apenas seu item, compara
   versões completas e reenfileira escolha integral confirmada. Token obsoleto
   reabre a comparação atual. Imutabilidade e lease inválido oferecem apenas
   descarte confirmado. Autenticação preserva dados e exige login explícito da mesma
   pessoa. Sem o app visível, somente autenticação ou conflito podem emitir uma
   notificação Android genérica e deduplicada, se a permissão opcional foi aceita.

## Dados compartilhados

| Dado                     | Origem      | Consumidores                           | Persistência                       | Observações                                      |
| ------------------------ | ----------- | -------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| plano/workout/exercícios | plano ativo | API e três rotas                       | MongoDB + snapshot Redis           | snapshot isola a execução de edições posteriores |
| versão da sessão         | Redis       | UI e API                               | snapshot Redis                     | começa em zero e avança por CAS                  |
| cargas por série         | UI/API      | execução e próxima prévia              | Redis; perfil MongoDB ao finalizar | inteiro ou `null`                                |
| timers                   | API         | overlay da UI                          | timestamps no Redis                | nenhum interval é persistido                     |
| resumo de execução       | API         | conclusão e seleção do próximo workout | MongoDB                            | idempotente por pessoa/sessão                    |
| lease de edição offline  | API         | preparação e repository Android        | Redis + vínculo no plano SQLite    | plano/instalação no valor; `leaseId` cerca a concessão |
| snapshot offline corrente | Android/API | sincronizador Android nativo              | SQLite local + Redis corrente      | foreground imediato; WorkManager best-effort; revisão monotônica; conflito exige escolha explícita |
| terminal offline         | API         | retries e histórico                    | recibo MongoDB único por execução  | conclusão ou cancelamento imutável                |

## Estados e exceções

- Caminho completo: todos os exercícios concluídos, confirmação e resumo completo.
- Interrupção ou retomada: reabrir a rota dentro de 24 horas lê o mesmo snapshot.
- Interrupção Android: refresh, background ou recriação lê a sessão SQLite e exige
  continuar ou descartar; timer usa monotônico no mesmo boot e fallback civil
  limitado após reboot, sem resolução automática ao chegar a zero.
- Interrupção Web/PWA: a perda da conexão desmonta shell e jornada, preserva a URL
  e deixa somente a superfície global; reconexão remonta a etapa vigente sem
  converter esse canal em execução offline.
- Erro recuperável: falha de mutation mantém a sessão canônica e permite nova ação.
- Conflito: draft local é descartado, GET canônico prevalece e a UI avisa.
- Indisponibilidade: falha de Redis impede leitura/mutação; falha na consolidação
  preserva a sessão para repetição idempotente.
- Autorização offline: ausência expira, divergência de fence revoga e takeover
  substitui o editor sem ler ou apagar dados do aparelho anterior. A API já
  ingere snapshots idempotentes, resolve conflitos sem merge silencioso e impede
  mutação depois de conclusão ou cancelamento. A jornada produz pendências v1 e o
  sincronizador as consome em foreground e pelo WorkManager. Falha local não usa o
  caminho HTTP como fallback.
- Atualização obrigatória: `APP_UPDATE_REQUIRED` conserva fila, sessão e arquivos,
  pausa foreground e WorkManager sem loop e só rearma itens quando a build instalada
  satisfaz o mínimo monotônico e o contrato persistido continua aceito.
- Responsividade: em `390px`, cabeçalhos e linhas de série quebram sem truncar,
  sobrepor ou criar rolagem horizontal; todo o cabeçalho do exercício reage e
  alterna expansão, o input de carga recebe clique em toda a largura e o Drawer
  fica encostado ao rodapé. Drawer e Modal preservam o título com recuos próprios,
  o handle móvel não participa do fluxo do cabeçalho, e Short usa 9:16. Cabeçalhos
  crescem com seu conteúdo e inputs mantêm o valor centralizado verticalmente.

## Cenários funcionais

### Cenário 1 — iniciar e finalizar incompleto

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=workout-preview`
- Given: prévia disponível e nenhuma sessão em andamento.
- When: a pessoa inicia, conclui séries com carga vazia e confirma finalização
  incompleta.
- Then: a UI navega ao resumo, que diferencia conclusão parcial.

### Cenário 2 — plano ausente

- Link para testar: `http://localhost:3000/training?mockAuth=person&mockTraining=no-active-plan`
- Given: nenhuma seleção ativa.
- When: a rota é aberta.
- Then: a UI orienta a pessoa a ir para Meus planos.

### Cenário 3 — executar e finalizar offline no Android

- Link para testar: não se aplica; exige bridge e SQLite reais ou repository
  nativo injetado.
- Given: plano preparado e lease ainda válidos no início.
- When: a pessoa perde a rede, inicia, altera progresso e finaliza o workout.
- Then: cada ação sucede o commit local, `completed` permanece na fila e a UI
  retorna a `/training` sem consultar ou inventar um resumo.

### Cenário 4 — bloquear a jornada offline no Web/PWA

- Link para testar: não se aplica — o app shell offline real é validado por
  `pnpm test:pwa-update` e a transição de rede por Playwright.
- Given: a pessoa está em uma rota da execução no canal Web/PWA.
- When: a conexão é perdida.
- Then: conteúdo, identidade e ações são desmontados, a URL permanece igual e
  somente `Conexão necessária` é apresentado, sem request ou cache privado.
- And: ao reconectar, a etapa é remontada pela jornada online normal.

### Cenário 5 — exigir atualização sem perder o terminal local

- Link para testar: não se aplica; exige pacote Android e política controlados.
- Given: existe uma sessão SQLite ativa e a API passa a exigir `versionCode` maior.
- When: o coordenador detecta a incompatibilidade e a pessoa conclui ou cancela o
  workout capturado.
- Then: somente a execução permanece disponível até o commit terminal, nenhum
  upload ocorre, a fila e a conclusão provisória são preservadas e o bloqueio
  global aparece ao sair. A build atualizada migra o banco antes de retomar a mesma
  fila.

## Cobertura automatizada

- Regras e caminhos de negócio protegidos: fluxo E2E real em
  `api/test/training-plan.e2e-spec.ts`, com MongoDB e Redis efêmeros.
- Playwright: `ui/tests/integration/routes/training.spec.ts` valida listagem,
  início, carga vazia, concorrência com PUT atrasado, responsividade, mídia,
  finalização parcial e confirmação de descarte contra MSW.
- Conectividade Web/PWA: Vitest valida a fonte e o guard, Playwright valida perda e
  retomada após bootstrap e `pnpm test:pwa-update` audita app shell, Cache Storage e
  início offline real.
- Vitest: o repository nativo valida materialização, confirmação após commit,
  revisão, validade e terminais; o coordenador valida preparação e lease.
- Android instrumentado: `OfflineStorageServiceTest` valida transações compostas
  de sessão + snapshot e terminal + remoção com SQLite real.
- Handlers e fixtures MSW: `ui/src/mocks/handlers/training.ts` e
  `ui/src/mocks/fixtures/training.ts`.
- Cenários não automatizados: compartilhamento nativo depende da API do sistema
  operacional e mantém fallback manualmente verificável por clipboard.
