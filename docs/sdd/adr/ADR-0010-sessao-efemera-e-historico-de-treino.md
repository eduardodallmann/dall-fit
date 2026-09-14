# ADR-0010: sessão efêmera e histórico de treino

- Status: `aceita`
- Responsáveis: Dall Fit

## Contexto

A execução de um treino recebe muitas mutações pequenas, timers e retomada por até
24 horas, enquanto o histórico concluído e as últimas cargas precisam sobreviver
sem prazo de expiração. A pessoa pode abrir a mesma sessão em mais de um
dispositivo, mas só pode manter um treino em andamento.

## Alternativas consideradas

### Alternativa A — persistir toda a sessão no MongoDB

Simplifica a quantidade de tecnologias, mas transforma cada edição e tick lógico em
escrita durável, exige limpeza de sessões abandonadas e mistura rascunho transitório
com histórico consolidado.

### Alternativa B — persistir toda a execução no Redis

Atende baixa latência e expiração, mas não oferece a durabilidade exigida para o
histórico semanal nem para as cargas usadas como sugestão no treino seguinte.

### Alternativa C — Redis para sessão e MongoDB para resultados

Mantém um snapshot efêmero por pessoa no Redis e grava somente a execução
finalizada e o perfil de cargas no MongoDB.

## Decisão

Adotar a alternativa C. A chave `workout-session` é exclusiva por pessoa, contém o
snapshot sem signed URLs, tem expiração absoluta de 24 horas definida na criação e
limite de 1 MiB. A criação usa `SET NX`; as mutações usam compare-and-swap Lua por
`sessionId` e versão e preservam o mesmo `PXAT`. O header
`X-Resource-Version` transporta a precondição.

Conflito retorna `WORKOUT_SESSION_VERSION_CONFLICT`; a UI descarta drafts locais,
refaz `GET /training/session`, apresenta aviso e usa a resposta canônica como
verdade. Não existe merge silencioso. Timers persistem somente timestamps; o tempo
restante é derivado do relógio do servidor.

Na finalização, `workout_executions` registra o resumo durável e
`person_exercise_load_profiles` mantém por pessoa, plano e exercício apenas as
cargas da última execução. Um vetor composto exclusivamente por `null` remove o
perfil, pois ausência de carga não é uma sugestão útil. A criação da execução é
idempotente por pessoa e `sessionId`; somente depois da consolidação a sessão Redis
é removida.

A finalização offline segue a mesma consolidação e usa `executionId` como chave de
idempotência da execução. Conclusão e cancelamento criam ainda um recibo terminal
imutável em `offline_training_terminal_receipts`, único por pessoa e execução.
Cancelamento não cria histórico; conclusão produz as mesmas métricas, perfis e
resumo do caminho online. O snapshot offline é removido somente após o recibo e,
quando aplicável, o histórico estarem duráveis.

## Consequências

### Positivas

- mutações frequentes não ampliam a coleção de histórico;
- sessão abandonada expira sem job de limpeza;
- retomada e conflito têm uma única representação canônica;
- histórico e sugestões de carga são duráveis e indexados para leitura.

### Negativas e riscos

- a finalização coordena dois bancos sem transação distribuída;
- indisponibilidade do Redis impede continuar o treino em andamento;
- a recuperação de uma finalização interrompida depende da idempotência por
  `sessionId` ou `executionId`, do estado `finalizing` e do recibo terminal no
  MongoDB;
- a edição concorrente adota descarte explícito do draft em vez de merge.

## Plano de adoção

- centralizar operações Redis em `WorkoutSessionStore`;
- manter acesso MongoDB atrás dos repositories de execução e perfil;
- criar os índices duráveis pelo script `api/scripts/apply-indexes.ts`;
- cobrir o fluxo com Redis e MongoDB efêmeros no E2E da API e MSW no Playwright.

## Links relacionados

- [FIT-0070](../features/fit-0070-fluxo-treinar.md)
- [FIT-0086](../features/fit-0086-finalizar-cancelar-resolver-conflitos-execucoes-offline.md)
- [Fluxo de execução de treino](../flows/execucao-de-treino.md)
- [ADR-0006](ADR-0006-versao-de-recurso-em-header-de-dominio.md)
- [Endpoints de treino](../../../api/docs/sdd/endpoints/training.md)
