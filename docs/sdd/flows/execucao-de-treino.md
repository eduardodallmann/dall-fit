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
|     — | autorizar edição offline | consumidor Android futuro | `PUT /training/offline-lease`, `POST /training/offline-lease/takeover` |
|     — | sincronizar, concluir ou cancelar offline | consumidor Android futuro | `PUT /training/offline-snapshot` |

## Sequência e decisões

1. No Android, entrar na listagem valida o snapshot local pela janela de sete dias
   emitida pela API. Ausência ou expiração bloqueia somente o conteúdo de Treinar
   durante a composição de overview e previews; o snapshot essencial é confirmado
   antes dos downloads display e mídia incompleta nunca bloqueia. Web/PWA
   permanecem exclusivamente online.
   A API já oferece, separadamente, registro e takeover do lease Redis do plano
   ativo para uma única instalação editora, com fence por concessão e validade de
   sete dias renovável somente por sincronização aceita. O cliente ainda não chama
   esses endpoints nesta etapa da jornada.
   O backend disponibiliza um lease Redis exclusivo por pessoa e a ingestão
   idempotente de snapshots v1. Uma revisão nova aceita renova atomicamente lease e
   snapshot por sete dias; replay não renova. Conflitos devolvem a versão segura do
   servidor e exigem escolha local ou servidor vinculada ao token observado.
   Conclusão consolida o mesmo histórico e resumo do caminho online; cancelamento
   só grava o recibo terminal. A UI, o motor Android e o sincronizador ainda não
   chamam esses endpoints neste fluxo.
2. A listagem resolve o plano ativo e marca como atual o workout seguinte ao último
   concluído; uma sessão Redis existente prevalece e é marcada em andamento. Ao
   ativar um plano na gestão pessoal, a UI remove o cache deste domínio para que
   uma resposta anterior sem plano não sobreviva à próxima navegação.
3. A prévia resolve mídia e sugere as últimas cargas duráveis, inclusive `null`.
   Antes de iniciar, a pessoa pode retornar à seleção por um link próprio; ele não
   aparece durante a sessão.
4. Iniciar cria um snapshot exclusivo com TTL absoluto de 24 horas. Se outro
   workout já estiver ativo, a pessoa retoma ou confirma o descarte antes de criar
   o novo.
5. Cada mutation envia a versão canônica. Carga é inteira entre 0 e 9999 ou vazia;
   concluir série aceita ambos atomicamente. Descansos e exercícios temporizados
   usam timestamps do servidor. Salvar carga e concluir compartilham uma fila FIFO
   por sessão, lendo a versão somente ao chegar à cabeça. Um PUT de carga pendente
   não bloqueia campos incompletos nem ações de conclusão; a ação usa o draft mais
   novo e respostas antigas não o sobrescrevem.
6. Conflito descarta drafts, refaz a leitura canônica e exige nova ação. Um treino
   incompleto requer confirmação explícita para finalizar.
7. A finalização grava execução e perfis no MongoDB, remove o snapshot Redis e
   navega para o resumo semanal compartilhável.
8. No caminho offline, `completed` consolida a árvore capturada e devolve o mesmo
   resumo semanal; `cancelled` descarta a execução sem histórico. Ambos gravam um
   recibo imutável antes da limpeza condicionada do snapshot. Replay terminal
   continua idempotente mesmo após lease ou Redis expirarem.

## Dados compartilhados

| Dado                     | Origem      | Consumidores                           | Persistência                       | Observações                                      |
| ------------------------ | ----------- | -------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| plano/workout/exercícios | plano ativo | API e três rotas                       | MongoDB + snapshot Redis           | snapshot isola a execução de edições posteriores |
| versão da sessão         | Redis       | UI e API                               | snapshot Redis                     | começa em zero e avança por CAS                  |
| cargas por série         | UI/API      | execução e próxima prévia              | Redis; perfil MongoDB ao finalizar | inteiro ou `null`                                |
| timers                   | API         | overlay da UI                          | timestamps no Redis                | nenhum interval é persistido                     |
| resumo de execução       | API         | conclusão e seleção do próximo workout | MongoDB                            | idempotente por pessoa/sessão                    |
| lease de edição offline  | API         | consumidor Android futuro              | Redis, sete dias condicionais      | plano/instalação no valor; `leaseId` cerca a concessão |
| snapshot offline corrente | Android/API | sincronizador Android futuro            | Redis, uma chave por pessoa        | revisão monotônica; conflito exige escolha explícita |
| terminal offline         | API         | retries e histórico                    | recibo MongoDB único por execução  | conclusão ou cancelamento imutável                |

## Estados e exceções

- Caminho completo: todos os exercícios concluídos, confirmação e resumo completo.
- Interrupção ou retomada: reabrir a rota dentro de 24 horas lê o mesmo snapshot.
- Erro recuperável: falha de mutation mantém a sessão canônica e permite nova ação.
- Conflito: draft local é descartado, GET canônico prevalece e a UI avisa.
- Indisponibilidade: falha de Redis impede leitura/mutação; falha na consolidação
  preserva a sessão para repetição idempotente.
- Autorização offline: ausência expira, divergência de fence revoga e takeover
  substitui o editor sem ler ou apagar dados do aparelho anterior. A API já
  ingere snapshots idempotentes, resolve conflitos sem merge silencioso e impede
  mutação depois de conclusão ou cancelamento; ainda não há cliente sincronizador
  nesta jornada.
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

## Cobertura automatizada

- Regras e caminhos de negócio protegidos: fluxo E2E real em
  `api/test/training-plan.e2e-spec.ts`, com MongoDB e Redis efêmeros.
- Playwright: `ui/tests/integration/routes/training.spec.ts` valida listagem,
  início, carga vazia, concorrência com PUT atrasado, responsividade, mídia,
  finalização parcial e confirmação de descarte contra MSW.
- Handlers e fixtures MSW: `ui/src/mocks/handlers/training.ts` e
  `ui/src/mocks/fixtures/training.ts`.
- Cenários não automatizados: compartilhamento nativo depende da API do sistema
  operacional e mantém fallback manualmente verificável por clipboard.
