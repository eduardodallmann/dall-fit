# Feature Spec: Imagem ou vídeo opcional em exercícios por duração

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0110`.
- Problema: o domínio já permite `youtubeId` e instruções opcionais em
  `DurationExercise`, mas o editor só apresenta nome, área e minutos. A biblioteca
  mostra a miniatura YouTube desses exercícios, enquanto o editor oculta sua
  demonstração e instruções. A manutenção de imagens, a cópia de variantes, a
  clonagem e a preparação offline ainda identificam imagens pelo discriminador
  `type: image`, impedindo uma imagem demonstrativa em `duration`.
- Evidência: o catálogo versionado contém `Alongamento de adutores` como
  `duration`, com vídeo `ir-XXTWVm7g`; a biblioteca monta sua miniatura por
  `youtubeId`, e o editor condiciona o player a `youtube-short | youtube-long`.
  A investigação não consultou o JSON autenticado do treino pessoal relatado;
  a presença da mídia naquela cópia específica não é uma precondição desta demanda.
- Resultado: um exercício por duração continua executado por tempo e admite
  instruções e uma mídia demonstrativa opcional: nenhuma, uma imagem ou um vídeo
  YouTube. Edição, biblioteca, leitura, execução e cópias apresentam e preservam a
  mesma mídia, sem transformá-lo em exercício por séries.
- Decisões de produto consolidadas: uma mídia por exercício; imagem e vídeo são
  alternativas; instruções são opcionais; reprodução e duração prescrita são
  independentes. A demanda não reorganiza todos os tipos de exercício.
- Referências:
  - [Contratos compartilhados](../base/03-contratos-compartilhados.md).
  - [Editor global](../../../ui/docs/sdd/routes/global-training-plan-workout.md),
    [editor pessoal e biblioteca](../../../ui/docs/sdd/routes/training-plan-workout.md)
    e [execução](../../../ui/docs/sdd/routes/training-workout.md).
  - [Endpoints globais](../../../api/docs/sdd/endpoints/global-training-plans.md),
    [pessoais](../../../api/docs/sdd/endpoints/personal-training-plans.md),
    [biblioteca](../../../api/docs/sdd/endpoints/exercise-library.md),
    [treino](../../../api/docs/sdd/endpoints/training.md) e
    [snapshot offline](../../../api/docs/sdd/endpoints/offline-training-snapshot.md).
  - [Clonagem durável](../../../workflow/docs/sdd/workflows/training-plan-clone.md).
  - ADRs [0005](../adr/ADR-0005-limites-concorrencia-e-midia-dos-planos.md),
    [0006](../adr/ADR-0006-versao-de-recurso-em-header-de-dominio.md),
    [0007](../adr/ADR-0007-blob-privado-oidc-e-urls-assinadas.md),
    [0009](../adr/ADR-0009-catalogo-pessoal-e-clonagem-duravel.md),
    [0014](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md) e
    [0016](../adr/ADR-0016-compatibilidade-android-e-recuperacao-visivel.md).
- Features relacionadas: [FIT-0028](fit-0028-editor-exercicios-escalabilidade-concorrencia.md),
  [FIT-0058](fit-0058-planos-treino-pessoais.md),
  [FIT-0083](fit-0083-preparar-plano-ativo-midias-offline.md),
  [FIT-0089](fit-0089-adaptar-jornada-treinar-execucao-offline.md),
  [FIT-0107](fit-0107-copiar-exercicios-globais-para-treino-pessoal.md) e
  [FIT-0108](fit-0108-fechar-descanso-automaticamente-ao-zerar.md).
  Seus registros históricos permanecem intactos.

## Escopo

### Incluído

- Expor instruções e uma seleção `Sem mídia | Imagem | Vídeo` no editor de
  `duration`, tanto administrativo quanto pessoal próprio.
- Reutilizar upload privado, visualização de imagem e player YouTube existentes.
- Permitir adicionar, editar, substituir e remover mídia com uma única versão
  canônica por alteração, sem estados persistidos com imagem e vídeo simultâneos.
- Preservar os três estados em leitura, biblioteca, cópia de exercícios,
  duplicação de treino, clone de plano, execução Web e execução Android.
- Preparar a imagem de duração para uso offline no mesmo motor Android e manter
  vídeos dependentes de conexão.
- Preservar clientes e dados anteriores, incluindo sessões, jobs de clone,
  planos preparados e snapshots pendentes.
- Atualizar contratos, mocks, testes, seeds e documentos vivos afetados somente
  na implementação autorizada.

### Não incluído

- Imagem e vídeo simultâneos, galerias, múltiplos vídeos ou anexos de documentos.
- Upload/download offline de vídeo, provedores além do YouTube ou novos players.
- Unificação dos cinco tipos, conversão entre duração e séries ou alteração dos
  campos e regras de `image`, `youtube-short`, `youtube-long` e `pause`.
- Reproduzir vídeo automaticamente, atrelar o cronômetro à duração do vídeo,
  concluir o exercício ao terminar a reprodução ou mudar os outcomes do timer.
- Pesquisa automática de mídia, geração de imagens ou escolha de vídeos por IA.
  O assistente conserva os vídeos curados existentes e não passa a gerar imagens.
- Novo banco/cache privado no navegador, plugin nativo de mídia, dependência,
  migração destrutiva ou publicação automática de aplicativo/deployment.

## Projetos e documentação afetados

- **API e endpoints:** `training-plan` e `training`, incluindo DTOs, commands,
  services, schemas e adapters. Atualizar os endpoints de planos globais,
  pessoais, biblioteca, clone jobs, treino e as referências pertinentes do
  assistente/snapshot offline. A documentação deve cobrir transições de mídia,
  propriedade, CAS, compensação e resultados incertos com seeds e cURLs.
- **UI e rotas:** `WorkoutEditor`, `ExerciseVideoPreview`, `ImageFilePicker`,
  biblioteca, `ReadOnlyWorkout`, `TrainingMediaViewer` e adapters nativos.
  Atualizar as rotas globais/pessoais de workout, a execução e, quando afetada,
  a seleção de capa dos cards de treino. Reutilizar os componentes compartilhados,
  com composição em `index.tsx` e estilos em `styles.ts`.
- **Workflow:** captura, identificação de imagens pendentes, cópia, progresso,
  materialização e compensação em `workflow/src/training-plan-clone/`.
  Atualizar seu documento de workflow e o endpoint pessoal de clone jobs.
- **Fluxos:** gestão de planos globais, gestão pessoal e execução de treino em
  `docs/sdd/flows/`.
- **Contratos em `@dall-fit/types`:** `DurationExercise`, requests de edição,
  contratos internos/publicados de imagem, projeções de prévia/sessão e a união
  do snapshot offline. Todas as exportações continuam no index público.
- **Decisões arquiteturais:** preservar árvore embutida, CAS, Blob privado,
  clone durável e motor nativo únicos. A separação entre comportamento do
  exercício e presença de mídia deve orientar os predicados; não criar uma
  arquitetura genérica de anexos ou reescrever ADRs históricas.
- **Handlers e fixtures MSW:** grupos de planos, biblioteca e treino, com mídia
  nula, imagem, vídeo, latência, falhas, conflito e compatibilidade de leitura.
- **Mocks unitários da API/Workflow:** repositories, stores, YouTube e Blob
  substituídos por mocks tipados; validar decisões, compensação e privacidade.
- **Fixtures MongoDB/Redis dos E2E:** exercícios `duration` sem mídia, com vídeo
  e com imagem; dados antigos sem campos novos; CAS e falhas de infraestrutura.
- **Android:** preparo, projeção de mídia local, sessão/snapshot e referências
  de arquivos. SQLite continua armazenando envelopes opacos na estrutura atual;
  não há necessidade prevista de nova coluna, permissão ou migration de schema.

## Requisitos funcionais

### Domínio e contratos

1. Manter `type: duration`, nome, área e duração inteira de 1 a 1440 minutos.
   Instruções são opcionais e têm até 300 caracteres, conforme o armazenamento
   vigente. Remover instruções não modifica nome, tempo, área ou mídia.
2. Acrescentar a `DurationExercise` um campo opcional `image`, com o mesmo
   contrato público `ExerciseImage | null` já usado para imagens. Preservar
   `youtubeId?: string` e `instructions?: string`, sem exigir migração de dados.
3. Os estados canônicos são: sem imagem e sem vídeo; imagem não nula sem vídeo;
   vídeo válido sem imagem não nula. Campos opcionais ausentes ou imagem nula
   representam ausência. O modo do seletor é derivado do conteúdo confirmado ou
   do draft, sem um segundo discriminador persistido que possa divergir.
4. Incluir instruções na edição de duração e permitir limpar instruções/vídeo
   explicitamente pelo PATCH com `null`. Ausência de um campo no PATCH preserva
   seu valor. `null` não é um vídeo válido para os tipos que exigem YouTube.
   A leitura canônica omite o vídeo/instrução removidos; não retorna uma URL vazia.
5. Imagens entram somente pelo upload autorizado; JSON de edição não aceita
   bytes, base64, signed URLs, keys ou uma URL externa para anexar imagem.
6. Atualizar schemas Mongoose estritos, entidades armazenadas, projeções,
   serializers e validações, além do tipo público. Restringir os campos novos
   ao discriminador correto e preservar as constraints dos demais tipos.

### Editor e transições de mídia

7. Cada card de duração apresenta `Nome`, `Local do corpo`, `Duração (min)`,
   `Instruções (opcional)` e `Mídia demonstrativa`, nesta ordem lógica. O seletor
   HeroUI contém `Sem mídia`, `Imagem` e `Vídeo` e inicia no estado real do
   exercício, inclusive para vídeos que antes ficavam ocultos.
8. `Sem mídia` é um estado válido. `Imagem` oferece o seletor/upload/preview
   existente; `Vídeo` oferece o campo identificado como vídeo do YouTube e sua
   miniatura/player. Nomear a reprodução como demonstração do exercício.
9. A seleção de um modo que ainda precisa de arquivo ou vídeo abre somente um
   draft. Não apagar a mídia confirmada só porque o seletor mudou. Cancelar uma
   seleção de arquivo não executa nenhuma escrita. Permitir cancelar a troca
   pendente e voltar à mídia confirmada.
10. Texto e vídeo usam o debounce de três segundos e a FIFO do aggregate já
    existentes. Arquivo usa o fluxo de upload existente. A intenção de remover
    mídia é explícita ao escolher `Sem mídia` ou acionar sua remoção. Cada
    transição é uma operação única, com versão obtida na cabeça da FIFO.
11. No sucesso de imagem nova/substituída, persistir a imagem e remover o vídeo
    no mesmo CAS. No sucesso de vídeo novo/substituído, persistir o ID normalizado
    e remover a imagem no mesmo CAS. Não executar primeiro uma remoção e depois
    uma criação que possa falhar deixando o exercício sem a mídia anterior.
12. Selecionar `Sem mídia` remove a mídia corrente pela operação pertinente e
    preserva as instruções. Remover uma imagem por `DELETE .../image` não remove
    um vídeo independente; limpar `youtubeId` não apaga uma imagem. O seletor usa
    o estado vigente ao executar a tarefa e o CAS evita uma decisão obsoleta.
13. Durante pending, impedir envio duplicado e outra troca da mesma mídia;
    preservar alterações independentes pelas regras da FIFO. Sucesso aplica a
    representação canônica, atualiza o editor/resumos e encerra o draft.
14. Falha encerra loading, mantém o valor/arquivo necessário ao retry na sessão
    atual e apresenta erro persistente com retry ou cancelamento. Uma resposta
    tardia não sobrescreve edição posterior. Conflito exato pausa o aggregate;
    resultado incerto exige releitura antes de repetir a intenção. Não refazer
    automaticamente uploads ou transições não idempotentes.
15. Draft, debounce, upload, fila e erro recuperável participam dos bloqueadores
    de navegação/reload e do ciclo de sessão. Logout/troca de pessoa cancela
    trabalho e impede publicação de cache, preview, toast ou Analytics tardios.

### API, segurança de mídia e atomicidade

16. Reutilizar os paths de PATCH de exercício e POST/DELETE de imagem nas
    fronteiras global e pessoal. Ampliar o upload/remoção para `duration` sem
    alterar ownership, guards, termos, CSRF/canal ou quota; referências continuam
    somente leitura. Controller valida e chama command; command orquestra serviços;
    repositories recebem somente os objetos internos preparados.
17. YouTube segue a allowlist e normalização existentes: ID ou URLs suportadas
    são convertidos ao ID canônico, sem aceitar outros provedores. Falha de
    validação/rede não remove a mídia anterior.
18. Imagens reutilizam JPEG/PNG/WebP, 10 MiB, 40 MP, rejeição de animação,
    remoção de metadata e variantes WebP existentes. Gerar asset novo, assinar
    suas variantes antes do commit e persistir somente metadata interna.
19. O repository altera associação, exclusão da mídia anterior, timestamps e
    versão atomicamente. Um conflito não modifica o exercício. Compensar assets
    novos quando a rejeição do commit é conhecida; preservar assets em gravação
    ambígua até leitura/reconciliação, sem apagar uma imagem possivelmente ativa.
20. Após commit confirmado, limpar imagens substituídas/removidas respeitando
    referências retidas por snapshots/jobs. Ampliar exclusão de exercício,
    treino/plano e reconciliação de órfãos para imagens de duração. Falha de
    limpeza posterior não transforma o commit confirmado em falha de gravação.
21. PATCH parcial preserva os campos opcionais não enviados. Upload preserva
    instruções e duração; trocar para vídeo preserva os mesmos campos. Cada
    alteração efetiva incrementa uma vez e devolve `X-Resource-Version`; no-op
    continua obedecendo à convenção vigente. Manter limites de 25/50 e 12 MiB.

### Leitura, biblioteca, cópias e execução

22. Leitura de modelo, editor e execução devem mostrar a mesma instrução e mídia
    disponíveis. Imagem usa preview existente, URLs privadas temporárias,
    renovação e fallback acessível; vídeo usa player existente, montado somente
    quando aberto. Falha da mídia permite continuar o exercício por tempo.
23. A biblioteca mantém a classificação `Duração` e mostra a miniatura da imagem,
    a miniatura YouTube ou o fallback sem mídia. O thumbnail não muda o tipo nem
    monta um player dentro da lista. Busca, agrupamento e seleção não mudam.
24. Cópia de exercício, duplicação de treino e clonagem de plano preservam mídia,
    instruções, tempo e ordem, com novos IDs. Para imagem, copiar ambas as
    variantes para asset independente; exclusão/edição na origem não afeta a cópia.
25. Todos os passos do Workflow devem reconhecer imagens em `duration`: captura
    e ETags, total/progresso, lotes, destinos determinísticos, redelivery,
    cancelamento, materialização e compensação. Não publicar árvore parcial.
    Jobs anteriores sem o campo de imagem continuam válidos, sem reescrita.
26. Assistente e seeds curados preservam os vídeos/instruções existentes. A
    confirmação e o clone não descartam campos novos por mapeamentos parciais;
    nenhuma pesquisa de vídeo, escolha automática de imagem ou chamada nova ao
    provider é introduzida.
27. Na prévia e execução, a imagem/vídeo é demonstração. `duration` continua sem
    séries, carga e descanso entre séries. Abrir, pausar, encerrar ou terminar o
    vídeo não inicia, pausa, redimensiona ou resolve o timer. Preservar resolução
    manual de duração pelo contador e reconciliação canônica já existentes.
28. A seleção de mídia de capa dos cards, quando aplicável, deve reconhecer a
    imagem/vídeo do exercício sem reclassificar seu tipo de execução. Iniciar
    pelo card continua abrindo o mesmo workout e suas regras temporizadas.

### Android, snapshots e clientes anteriores

29. A imagem de duração recebe `offlineMediaId` na prévia e usa o mesmo preparo
    Android: payload essencial primeiro, download `display` limitado, arquivo
    privado e promoção atômica. Persistir somente `fileId` para a mídia local;
    nenhuma signed URL entra em plano, sessão, fila, log ou storage Web.
30. Projeções de preview/sessão e retenção/limpeza de arquivos devem abranger
    imagens de duração. Imagem ausente/incompleta produz fallback, sem bloquear
    início, timer, término ou sincronização. Vídeo permanece um ID; offline,
    informar que a demonstração requer conexão e conservar instruções/cronômetro.
31. O snapshot de sincronização continua sem imagem ou capacidades de acesso.
    Ao ampliar `DurationExercise`, excluir explicitamente `image` do tipo e da
    serialização de `OfflineTrainingSnapshotExerciseV1`; preservar instruções,
    vídeo opcional e estado temporal. Nunca permitir que o novo campo seja
    transportado por um spread acidental ou afrouxar o schema estrito para aceitá-lo.
32. Sessões e envelopes antigos sem imagem continuam executáveis/sincronizáveis.
    Conservar contrato de sync v1, fences, recibos, sequências e payload preparado
    v2 com campos opcionais. Não reescrever hashes ou envelopes pendentes para
    introduzir mídia e não exigir reset do SQLite.
33. Clientes antigos não podem receber uma imagem de duração que seu preparador
    persistiria como URL temporária. Negociar a nova representação por header de
    request `X-Training-Media-Version: 1` nos consumidores atualizados; ausência
    representa o formato legado. Acrescentar somente esse header à allowlist de
    request do CORS, sem ampliar origem/métodos nem os headers expostos.
34. Na representação legada, omitir a imagem de `duration` em todas as projeções
    de mídia para o cliente; conservar vídeo/instruções já suportados e a própria
    execução por tempo. Dados no MongoDB/Redis não são removidos. A omissão não
    significa uma operação de limpeza e PATCH de cliente antigo preserva campos
    não enviados. O modo negociado não concede permissão de edição ou acesso.
35. Os novos services enviam esse header nos reads e mutations que retornam
    exercícios/prévias/sessões; responses com mídia continuam `private, no-store`.
    Snapshot/Worker não precisam dele porque o envelope não contém imagens. Não
    alterar `ANDROID_MIN_VERSION_CODE` automaticamente para entregar esta expansão.

## Requisitos não funcionais

- **Acessibilidade:** Select, TextArea, campos, upload e overlays HeroUI com
  labels, foco, teclado, mensagens de validação e pending anunciados. Em
  `390x844` e `1440x900`, preservar a hierarquia dos cards sem overflow; inspecionar
  as referências existentes das rotas na implementação e validar somente layout.
  Não gerar/substituir referências automaticamente como aceite.
- **Performance:** manter debounce, FIFO, limites do aggregate, quatro imagens
  simultâneas/oito variantes e concorrência já limitada do downloader/Workflow.
  Não carregar player por card nem duplicar clients, downloads ou blobs em retry.
- **Segurança e privacidade:** mesmos guards, ownership, canais, autorização
  privada e proteção jurídica. Não aceitar URLs arbitrárias para download pelo
  servidor. Signed URLs, keys, arquivos e conteúdo livre não entram em Analytics.
- **Observabilidade:** logs estruturados sanitizados conforme as bases da API e
  Workflow, incluindo ramos, dependências, compensação e saída. Interações de
  seletor/instruções/vídeo e operações de mídia usam eventos enumerados, com um
  início e terminal por operação; ampliar o catálogo tipado somente quando preciso.

## Critérios de aceite

Os links abaixo definem os seletores MSW a disponibilizar na implementação; não
afirmam que esses cenários já existem. Para branches de API, os cenários vivos
nomeados, seus seeds e cURLs também serão acrescentados na mesma implementação.

### Cenário 1 — duração sem mídia

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=duration-no-media`.
- Given: exercício antigo de duração sem instruções ou mídia.
- When: abre o editor, altera minutos e recarrega após confirmação.
- Then: `Sem mídia` está selecionado; o exercício permanece válido sem anexos,
  com tipo e duração preservados.

### Cenário 2 — vídeo e instruções já existentes ficam visíveis

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=duration-video`.
- Given: duração com instruções e vídeo curado, como o alongamento relatado.
- When: abre editor e demonstração.
- Then: seletor indica `Vídeo`; instruções/ID estão editáveis e a miniatura abre
  o vídeo correto. Fechar desmonta o player. Não há campos de séries ou carga.

### Cenário 3 — adicionar imagem no editor global

- Link para testar: `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=duration-no-media`.
- Given: duração sem mídia em plano global.
- When: escolhe `Imagem`, seleciona arquivo válido e confirma o upload existente.
- Then: pending impede duplicidade; um sucesso incrementa uma versão e mostra
  a imagem no card e no preview. Recarregar preserva imagem, tipo e minutos.

### Cenário 4 — trocar imagem por vídeo e vídeo por imagem

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=duration-image`.
- Given: uma mídia confirmada e instruções preenchidas.
- When: troca por outra modalidade, primeiro com falha e depois com sucesso.
- Then: falha preserva a associação anterior e o draft; sucesso troca a mídia
  atomicamente, preserva instruções e incrementa uma vez. Nenhuma leitura vê
  imagem e vídeo simultâneos. Cancelar a seleção de arquivo não escreve.

### Cenário 5 — remover mídia e instruções

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=duration-image`.
- Given: duração com imagem ou vídeo e instruções.
- When: escolhe `Sem mídia`; depois limpa instruções e aguarda confirmação.
- Then: primeira operação mantém instruções; segunda remove somente esse texto.
  Recarregar conserva ausência de mídia/instruções e os demais parâmetros.

### Cenário 6 — validação e conflito

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=duration-media-conflict`.
- Given: mídia confirmada; a origem foi alterada por outro cliente.
- When: tenta trocar mídia com versão antiga.
- Then: somente o conflito de domínio pausa a FIFO; não há perda da mídia
  anterior, retry automático ou compensação de asset já ativo. Arquivo inválido,
  vídeo não suportado e instrução longa falham sem gravação destrutiva.

### Cenário 7 — referência somente leitura

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000002/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=duration-reference`.
- Given: referência global com durações sem mídia, com imagem e com vídeo.
- When: percorre os cards e abre as demonstrações.
- Then: conteúdo é visível e equivalente ao editor, sem controles de escrita.
  Requests de mutation forjadas continuam recusadas pelos endpoints pessoais.

### Cenário 8 — copiar exercícios e duplicar treino

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=duration-library`.
- Given: biblioteca com os três estados de mídia.
- When: copia um lote e, no detalhe do plano, duplica o treino resultante.
- Then: tipo, tempo, instruções e ordem são preservados, com IDs/variantes novos;
  excluir ou substituir a imagem original não afeta nenhum dos destinos.

### Cenário 9 — clone durável com imagem de duração

- Forma de validar: cenário `Clone de plano com imagem em duration` em
  [clone jobs](../../../api/docs/sdd/endpoints/training-plan-clone-jobs.md), com
  seed/cURL a adicionar, e testes do Workflow com Blob controlado.
- Given: snapshot com imagem de duração e outros exercícios.
- When: clona, repete steps e exercita falha/retry/cancelamento.
- Then: progresso inclui a imagem; variantes são independentes; não há árvore
  parcial ou blob duplicado; compensação respeita geração e referências retidas.

### Cenário 10 — demonstração não controla o cronômetro

- Link para testar: `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=duration-media`.
- Given: duração com imagem ou vídeo demonstrativo.
- When: abre/fecha mídia, inicia timer, pausa ou termina reprodução.
- Then: mídia não altera tempo/progresso nem conclui exercício. O timer mantém
  os outcomes existentes e o exercício não recebe séries, cargas ou descanso.

### Cenário 11 — imagem preparada e vídeo sem conexão no Android

- Link para testar: não se aplica; exige repository nativo injetado e smoke em
  Android com SQLite/filesystem e alternância real de conectividade.
- Given: plano preparado com imagem de duração e vídeo em outro exercício.
- When: ativa modo avião, executa, retoma e finaliza o treino.
- Then: imagem preparada abre localmente; vídeo informa necessidade de conexão;
  instruções e timer funcionam, e o terminal permanece na fila para sync.
  Arquivo ausente mostra fallback sem bloquear a conclusão.

### Cenário 12 — compatibilidade e ausência de URLs no storage

- Forma de validar: cenário `Representação legada e mídia de duração` nos
  [endpoints de treino](../../../api/docs/sdd/endpoints/training.md), com seed/cURL
  para requests com/sem `X-Training-Media-Version`, e testes do preparo/snapshot.
- Given: mesma árvore com imagem de duração, cliente legado e cliente atualizado.
- When: ambos leem a prévia; o atualizado prepara/executa e envia seu snapshot.
- Then: legado recebe duração sem a imagem nova; atualizado recebe e prepara
  imagem por `fileId`. Nenhuma signed URL ou referência local atravessa sync;
  envelopes anteriores permanecem válidos e não são reescritos.

### Cenário 13 — erros e resultado incerto da mídia

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/64b000000000000000000101?mockAuth=person&mockTrainingPlans=duration-media-error`.
- Given: mídia confirmada e falha controlada de upload, assinatura ou CAS.
- When: tenta substituição e depois retry/cancelamento; em outra variação, a
  resposta se perde depois do envio ao banco.
- Then: falha conhecida conserva associação anterior e compensa destinos novos;
  resultado incerto conserva assets e exige releitura. A navegação protege o
  draft e encerramento de sessão impede feedback tardio.

## Estratégia de entrega e compatibilidade

1. Implementar campos aditivos e serializers/guards de representação, preservando
   dados sem `image` e sem mídia. Não converter registros `duration` para outro tipo.
2. Atualizar API e Workflow coordenadamente antes de habilitar a escrita de
   imagens de duração pela UI. Workers antigos não podem consumir snapshots novos
   e finalizar ignorando essas imagens; versões novas continuam lendo jobs antigos.
3. Publicar o suporte ao header de representação no backend/CORS antes dos novos
   consumidores. Clientes antigos recebem o formato legado; os novos negociam
   explicitamente o formato com imagem e mantêm os mesmos contratos de autenticação.
4. Atualizar Web e bundle Android com edição, leitura, sanitização de preparo e
   exclusão de mídia do envelope. Validar update com plano preparado/sessão/fila
   anteriores; dados locais continuam legíveis, sem reset nem perda de pendências.
5. Manter os protocolos de timer, snapshot v1 e HMAC do clone. Não elevar o mínimo
   Android ou publicar APK/AAB automaticamente. A distribuição nativa segue o
   runbook vigente e usa um próximo `versionCode` válido quando realizada.
6. Na implementação, atualizar atomicamente os SDDs vivos proprietários, o catálogo
   de contratos/Analytics e os fluxos afetados, sem alterar esta feature validada.

### Fontes oficiais e versões consultadas

Versões confirmadas nos manifests, instalações locais e APIs do código existente:
HeroUI React/Styles `3.2.6`, TanStack Query `5.104.5`, TanStack Form `1.33.5`,
React Player `3.4.0`, NestJS `12.2.0`, Mongoose `9.11.2`, Sharp `0.35.5`,
Vercel Blob `2.8.2` e Zod `4.6.7`. Não há atualização de dependências planejada.

- [HeroUI Select](https://heroui.com/en/docs/react/components/select), catálogo e
  índices oficiais `llms.txt`, `llms-components.txt` e `llms-patterns.txt`:
  reutilizar Select, campos e overlays, confrontando exemplos com os tipos locais.
- [Discriminators](https://mongoosejs.com/docs/discriminators.html) e
  [updates atômicos](https://mongoosejs.com/docs/tutorials/findoneandupdate.html):
  ampliar somente o schema de duração e manter CAS no documento embutido.
- [Upload NestJS](https://docs.nestjs.com/techniques/file-upload): reutilizar o
  multipart já existente, sem transporte paralelo.
- [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk): preservar
  a política local de acesso privado, cópia e compensação. A documentação externa
  não substitui os adapters e as decisões do SDD.

## Plano de testes

- Unitários da API: validação dos estados e clears, transições atômicas,
  mapeamentos de campos opcionais, autorização antes de Blob, falha de YouTube,
  compensação conhecida, resultado incerto, assinatura e retenção/reconciliação.
- E2E da API, seriais com MongoDB/Redis reais efêmeros: PATCH/upload/remoção nas
  duas fronteiras, referência/alheio, versão, shape/tamanho, cinco tipos, cópias
  independentes, prévia/sessão e representação legada/atual. Mídia externa usa
  doubles controlados, sem credenciais reais. Adicionar e executar seeds/cURLs.
- Workflow: unitários e runtime oficial para imagem em duração, batches,
  progresso, finalização, retry/redelivery/cancelamento e compatibilidade de jobs.
- Vitest da UI: seleção/draft, cancelar arquivo, debounce, FIFO após ociosidade,
  pending, falha/retry, conflito, rollback localizado, sessão encerrada, biblioteca,
  preview e independência de timer; handlers MSW na fronteira HTTP.
- Playwright: editores global/pessoal, biblioteca e leitura, transição com falha,
  cópia e execução, em desktop/mobile. Usar Vite/Chromium/MSW Browser sem API real.
- Android: testes do coordenador e repository para imagem de duração, nenhuma URL
  persistida, snapshot sem mídia e leitura de payloads antigos. Testes nativos
  instrumentados quando a adaptação atingir bridge/storage/retensão de arquivos;
  smoke com preparação, modo avião, retomada, reconexão e atualização com fila.
- Revisar API, UI e Workflow para remover símbolos que tenham ficado sem uso,
  confirmando usos indiretos de framework, DI, configuração e API pública.
- Na implementação, aprovar na raiz `pnpm lint`, `pnpm test`,
  `pnpm test:coverage:ci`, `pnpm build`, `pnpm -C api test:e2e` e
  `pnpm test:integration`. Testes Android permanecem comandos explícitos quando
  aplicáveis. A criação desta feature é `docs-only` e dispensa gates de código.

## Riscos e decisões

- **Predicados por tipo:** ampliar suporte a imagens por presença/capacidade de
  mídia sem ampliar os predicados de exercícios por séries. Confundir essas regras
  produziria cargas/séries indevidas para duração.
- **Exclusividade:** regras no backend e CAS, além do seletor, impedem dois meios
  ativos. Uma troca não pode ser composta por duas escritas destrutivas.
- **Persistência acidental:** preparadores antigos tratam imagem apenas em
  `type: image`. A negociação de representação evita entregar-lhes signed URLs
  novas dentro de duração; o novo preparador sanitiza antes de qualquer commit.
- **Clone parcial:** todos os leitores de metadata e serviços de cópia/limpeza
  precisam reconhecer imagem de duração, inclusive retenção de origens e orphan
  reconciliation. O Workflow atualizado precede a produção de novos snapshots.
- **Compatibilidade estrutural:** campos opcionais evitam backfill; exclusão
  explícita de `image` do snapshot mantém o protocolo existente. Não reutilizar
  tipos públicos com mídia indiscriminadamente em envelopes de execução.
- **Escopo delimitado:** habilitar uma mídia opcional em duração não é uma
  reorganização geral entre tipo de exercício e tipo de mídia. Esse redesenho
  permaneceria uma demanda própria.

## Condições esperadas da entrega

- Duração sem mídia, com imagem ou com vídeo funciona de ponta a ponta.
- Instruções e demonstração ficam visíveis nos contextos apropriados e o timer
  conserva suas regras, sem séries ou carga introduzidas por presença de imagem.
- Cópias possuem mídia independente; trocas e limpeza respeitam atomicidade,
  concorrência, resultados incertos e referências retidas.
- Clientes/dados anteriores continuam válidos e nenhum novo caminho persiste ou
  sincroniza capacidades temporárias de mídia.
- Contratos, SDDs vivos, MSW, mocks, seeds/cURLs e testes acompanham a implementação.
- Quality gates aplicáveis aprovados, sem alterar features históricas.
