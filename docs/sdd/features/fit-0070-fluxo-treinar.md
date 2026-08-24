# Feature Spec: Fluxo Treinar com execução retomável e histórico durável

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0070`](https://github.com/eduardodallmann/dall-fit/issues/70).
- Problema: a pessoa já pode possuir ou referenciar um plano e marcá-lo como ativo,
  mas ainda não existe uma jornada para escolher um treino, executá-lo série a
  série, retomar o progresso depois de fechar ou atualizar a aplicação, registrar
  cargas e concluir o treino. A demanda também precisa distinguir o estado
  transitório, que não deve durar mais de um dia, dos dados duráveis usados para
  apontar o próximo treino e montar o resumo de conclusão.
- Resultado: toda pessoa autenticada recebe o item `Treinar`, vê o plano em uso e
  seus treinos, inicia ou retoma no máximo uma execução, registra séries, cargas e
  temporizadores por meio da API e conclui o treino com resumo semanal e
  compartilhamento nativo. O progresso em andamento sobrevive a refresh e ao
  fechamento do PWA por até 24 horas no Redis; conclusões e o último perfil de
  carga ficam no MongoDB.
- Referências visuais analisadas integralmente:

  | Estado orientado                      | Referência da issue                                                                         |
  | ------------------------------------- | ------------------------------------------------------------------------------------------- |
  | Seleção de treino e indicador `Atual` | [imagem 1](https://github.com/user-attachments/assets/26f862bc-c549-468f-9073-35f4a10f1a72) |
  | Lista de exercícios antes do início   | [imagem 2](https://github.com/user-attachments/assets/937fe7f1-9332-452e-891c-d025ce473d54) |
  | Exercício comum expandido e séries    | [imagem 3](https://github.com/user-attachments/assets/0164fb08-1223-48e5-b8f1-bd75b2010e04) |
  | Descanso entre séries                 | [imagem 4](https://github.com/user-attachments/assets/8ca9c58b-761c-46ee-8d3c-147c51972eaa) |
  | Exercício de duração e cronômetro     | [imagem 5](https://github.com/user-attachments/assets/1e67b661-ee5e-41a7-9f04-9b58035779d4) |
  | Exercício concluído recolhido         | [imagem 6](https://github.com/user-attachments/assets/1d73c8f5-ba14-48f4-a7fa-cc257b27fd75) |
  | Exercício concluído expandido         | [imagem 7](https://github.com/user-attachments/assets/95d1ed6d-d879-4282-bac7-1f837f8dc80e) |
  | Confirmação após todos os exercícios  | [imagem 8](https://github.com/user-attachments/assets/9945b72b-60c4-4f92-8037-06a2754f2bc6) |
  | Tela de conclusão                     | [imagem 9](https://github.com/user-attachments/assets/e8a62059-fca8-4064-b8fc-75f90ac494bf) |

  As imagens orientam hierarquia, agrupamento, estados e relação entre regiões.
  Textos, tokens, dimensões exatas, acessibilidade e comportamento responsivo
  permanecem definidos por esta feature e pelo design system vigente. Em mobile,
  os overlays temporais e de mídia usam drawer inferior; em desktop, usam modal.

- Decisão de persistência:
  - Redis guarda somente a sessão ativa e seu snapshot de execução, sob uma chave
    por pessoa e expiração absoluta de 24 horas;
  - MongoDB guarda conclusões imutáveis e o perfil da última carga confirmada por
    pessoa e exercício;
  - MongoDB com índice TTL não será usado para a sessão, pois sua remoção é um
    processo de background eventualmente atrasado e o dado continuaria sendo um
    documento durável; Redis já é a infraestrutura oficial de dados temporários do
    projeto e oferece expiração na própria chave;
  - memória do processo, `localStorage`, `sessionStorage`, cache persistente da
    PWA e TanStack Query não são fontes de verdade da sessão.
- Referências oficiais consultadas no planejamento:
  - Redis: [`SET` com `NX`, `XX`, `EXAT` e `PXAT`](https://redis.io/docs/latest/commands/set/)
    e [expiração de chaves](https://redis.io/docs/latest/develop/using-commands/keyspace/#key-expiration);
  - MongoDB: [índices TTL e natureza assíncrona da remoção](https://www.mongodb.com/docs/manual/core/index-ttl/);
  - Mongoose 9: [transações e suas restrições de execução](https://mongoosejs.com/docs/transactions.html);
  - HeroUI 3: [`llms-components.txt`](https://heroui.com/react/llms-components.txt)
    para `Card`, `Drawer`, `Modal`, `NumberField` e `ProgressBar`, e
    [`llms-patterns.txt`](https://heroui.com/react/llms-patterns.txt) para
    composição acessível;
  - Web Share: [especificação da Web Share API](https://www.w3.org/TR/web-share/),
    inclusive a exigência de ativação direta da pessoa para `navigator.share()`.
- Versões instaladas confirmadas no planejamento: Mongoose `9.8.x`, ioredis
  `5.11.x`, HeroUI `3.2.x`, TanStack Query `5.101.x`, TanStack Router `1.170.x`,
  Axios `1.18.x` e React Player `3.4.x`. A implementação deve revalidar a API
  concreta nos tipos e no lockfile antes de escrever adapters ou componentes.
- Features relacionadas:
  - `FIT-0028` introduziu os cinco tipos de exercício, seus limites e o aggregate
    embutido;
  - `FIT-0044` tornou as imagens privadas e temporariamente assinadas;
  - `FIT-0058` introduziu catálogo pessoal, referência global viva e plano ativo;
  - `FIT-0059` consolidou previews acessíveis de imagem/vídeo e os overlays móveis.

## Escopo

### Incluído

- item `Treinar` no menu de toda pessoa autenticada, inclusive administradora;
- rota de seleção `/training`, rota de execução
  `/training/workout/:workoutId` e rota de conclusão
  `/training/completion/:workoutExecutionId` na árvore manual tipada;
- empty state sem plano em uso, com ação para `/training-plan`;
- lista dos treinos do plano ativo, ou do snapshot da sessão em andamento, com
  thumbnail/fallback, áreas corporais distintas e indicador `Atual` ou
  `Em andamento`;
- definição cíclica de próximo treino a partir da última conclusão daquele plano;
- modo não iniciado com todos os exercícios e suas métricas;
- uma única sessão ativa por pessoa, retomável em outra aba, dispositivo, refresh
  ou nova abertura enquanto o Redis conservar a chave;
- snapshot dos dados de execução do plano, workout e exercícios no momento do
  início, sem persistir signed URLs;
- execução dos cinco tipos atuais, incluindo séries/carga, descanso, pausa,
  duração e conclusão manual de vídeo longo;
- expansão exclusiva de um card, conclusão de série atual ou de todas as séries
  restantes, foco no próximo exercício e reinício de exercício concluído;
- drawer mobile e modal desktop para mídia, descanso, duração e confirmações;
- finalização antecipada confirmada ou conclusão integral com mensagem de parabéns;
- tela final com semana, exercícios, áreas corporais, carga total registrada,
  duração e compartilhamento;
- histórico durável de conclusões no MongoDB;
- perfil da última carga confirmada por pessoa/plano/exercício, usado para preencher
  a próxima execução;
- limpeza idempotente dos perfis de carga quando exercício, workout ou plano for
  excluído, sem apagar o histórico agregado de uma conclusão já realizada;
- contratos compartilhados, endpoints, índices, Redis store, handlers MSW,
  fixtures, seeds, unitários, E2E e Playwright;
- ADR de execução de treino e persistência híbrida, além dos SDDs vivos, somente
  durante a implementação autorizada.

### Não incluído

- criar, editar, reordenar ou excluir plano, workout ou exercício dentro de
  `Treinar`;
- mais de uma sessão simultânea por pessoa;
- funcionamento offline, fila de mutações em Service Worker, background sync ou
  persistência do treino em armazenamento do navegador;
- histórico navegável de todos os treinos, gráficos, recordes, progressão de carga,
  metas semanais configuráveis ou calendário;
- guardar todo o histórico série a série de cargas; a entrega mantém somente o
  último perfil por exercício e os totais agregados por conclusão;
- alterar os cinco discriminadores ou adicionar peso prescrito ao exercício do
  plano;
- alterar `durationMinutes` para segundos; a duração vigente continua em minutos e
  é convertida para o contador;
- compartilhar imagem, arquivo ou card renderizado; o compartilhamento contém
  somente texto resumido;
- notificações, áudio ao terminar contador, vibração, wake lock ou controles de
  mídia customizados;
- retenção permanente do snapshot Redis ou conversão automática de sessão expirada
  em treino concluído;
- garantir disponibilidade de mídia removida do plano depois do início. O snapshot
  conserva o progresso; mídia já excluída pode apresentar fallback acessível;
- alterar automaticamente o plano em uso, impedir sua troca ou escolher fallback;
- screenshots novas sob `ui/docs/sdd/routes/assets/` nesta fase. As imagens da
  issue permanecem referências da feature até eventual curadoria na implementação.

## Projetos e documentação afetados

- API e endpoints:
  - criar módulo ou subdomínio `training` seguindo controller → command → services
    → repositories/Redis;
  - criar `api/docs/sdd/endpoints/training.md` com todos os caminhos, seeds e cURLs;
  - atualizar `personal-training-plans.md` e `global-training-plans.md` para a
    limpeza de perfis de carga nas exclusões;
  - atualizar arquitetura, Redis, índices, logging, ambiente e testes quando a
    implementação tornar essas decisões vigentes.
- UI e rotas:
  - criar documentos vivos `training.md`, `training-workout.md` e
    `training-completion.md` em `ui/docs/sdd/routes/`;
  - atualizar `dash.md`, arquitetura, Analytics, mocks e testes integrados;
  - adicionar manualmente as três rotas sob o layout autenticado;
  - componentes exclusivos permanecem sob `ui/src/routes/training/`; composições
    realmente reutilizadas de mídia podem consumir o core vigente sem acoplar o
    editor administrativo ao executor.
- Fluxos:
  - criar `docs/sdd/flows/execucao-de-treino.md`;
  - referenciar a seleção ativa do fluxo pessoal sem duplicar suas regras.
- Contratos em `@dall-fit/types`:
  - overview, preview, sessão, série, timer, conclusão e erros serializáveis;
  - unions discriminadas preservam os cinco tipos e distinguem os três tipos de
    timer;
  - nenhum contrato público expõe personId, Redis key, Blob pathname, ETag interno
    de imagem ou documento Mongoose.
- Decisões arquiteturais:
  - criar ADR para Redis temporário + MongoDB durável, snapshot, sessão única,
    finalização idempotente e limpeza de cargas;
  - preservar ADRs 0003, 0004, 0005, 0007 e 0009 e relacioná-las, sem reescrevê-las.
- Handlers e fixtures MSW:
  - cobrir ausência de ativo, plano vazio, treino atual, sessão em andamento,
    cinco tipos, timers, conclusão parcial/integral, expiração, conflito e falhas;
  - estado mutável isolado por cenário e reiniciado entre testes;
  - nenhum handler usa relógio real sem controle determinístico.
- Mocks unitários da API:
  - ports tipadas para histórico, perfil de carga, árvore resolvida, sessão Redis,
    relógio e signed URLs;
  - commands mockam services; services de domínio mockam repositories/store;
  - Redis e MongoDB não são iniciados em unitários.
- Fixtures MongoDB/Redis nos E2E:
  - adapters reais apontam para processos efêmeros;
  - Redis cobre TTL absoluto, chave única, CAS, timer retomado e limpeza;
  - MongoDB cobre índices, histórico, próximo treino, semana, carga e cascatas;
  - E2E permanecem seriais e não criam suíte `test:integration` no backend.

## Decisões de dados e backend

### Sessão em andamento no Redis

1. A chave é composta exclusivamente por `RedisKeyService`, no namespace vigente,
   com subject novo `workout-session` e identificador técnico da pessoa. Não há
   `KEYS`, `SCAN`, `FLUSH*` ou limpeza por prefixo no runtime.
2. Existe no máximo uma chave por pessoa. O início usa criação condicional `NX`;
   uma sessão existente produz conflito estável e nunca é sobrescrita.
3. `expiresAt` é fixado em `startedAt + 24h`. A criação e cada CAS usam `PXAT` com
   esse mesmo instante absoluto; atividade, refresh e troca de dispositivo não
   renovam a janela.
4. O valor guarda um snapshot compacto e versionado com:
   - `sessionId`, origem `owned | global-reference`, IDs técnicos e nomes de plano
     e workout;
   - quantidade de workouts do plano no início;
   - exercícios na ordem inicial com campos necessários à execução;
   - referências internas de mídia estritamente server-side, nunca signed URLs;
   - séries, cargas em edição confirmadas no backend, conclusões e timestamps;
   - timer ativo opcional, com tipo, início e vencimento absolutos;
   - `version`, `startedAt` e `expiresAt`.
5. A implementação deve provar que o pior snapshot permitido pelos limites atuais
   cabe em no máximo 1 MiB serializado. Se isso não for possível, deve compactar o
   formato interno ou retornar à especificação; não pode reduzir silenciosamente
   os limites legais de 50 exercícios e 100 séries.
6. Início usa `SET ... NX PXAT`. Toda alteração posterior usa script Lua atômico
   ou primitiva equivalente compatível com ioredis 5 para comparar sessão/versão,
   gravar o valor completo e preservar o mesmo `PXAT` em uma única operação.
7. Leituras e sucessos devolvem `X-Resource-Version`. Toda mutation da sessão exige
   uma versão canônica; divergência responde conflito sem merge ou retry automático.
8. Timers armazenam timestamps, não um contador regravado por segundo. A UI calcula
   a apresentação a partir de `serverNow` e `endsAt`; GET reconcilia atomicamente um
   timer vencido quando necessário.
9. Redis indisponível, saturado, com timeout ou dataset resetado falha fechado. A UI
   não mostra série como concluída sem confirmação. Perda da chave encerra somente
   o treino temporário; conclusões MongoDB permanecem intactas.
10. Finalização, abandono e expiração eliminam a chave ativa. Um recibo técnico
    mínimo e curto pode existir somente para reconciliar uma resposta de
    finalização perdida, sem conservar o snapshot.

### Histórico concluído no MongoDB

1. A coleção `workout_executions` possui um documento pequeno por finalização e
   conserva:
   - ID estável igual ou correlacionado ao `sessionId` para idempotência;
   - `personId`, `catalogEntryId` de origem quando ainda aplicável,
     `trainingPlanId`, `workoutId` e source;
   - nomes de plano/workout e áreas corporais concluídas como snapshot de exibição;
   - `startedAt`, `completedAt`, `durationSeconds` e timezone IANA validado;
   - exercícios concluídos/total, conclusão integral ou antecipada;
   - `totalLoadKg`, definido como soma das cargas informadas nas séries concluídas,
     sem multiplicação por repetições.
2. O histórico não guarda o array detalhado de cargas. Assim a exclusão futura de
   um exercício remove seu perfil de carga sem corromper ou reescrever uma
   conclusão histórica agregada.
3. Índices mínimos:
   - unicidade por `personId + sessionId`;
   - `{ personId, trainingPlanId, completedAt: -1 }` para último treino do plano;
   - `{ personId, completedAt: -1 }` para resumo da semana e recuperação da
     conclusão.
4. Registros não recebem TTL: são a fonte durável do próximo treino e do resumo
   semanal. Política de retenção futura exige feature própria.
5. A semana é ISO, de segunda a domingo, calculada no timezone IANA informado pela
   UI e validado pela API. A response marca os dias que possuem ao menos uma
   conclusão. O denominador exibido é a quantidade de workouts do snapshot do plano
   e o numerador pode ultrapassá-lo.

### Perfil da última carga no MongoDB

1. `person_exercise_load_profiles` contém no máximo um documento por
   `personId + trainingPlanId + exerciseId`.
2. O documento guarda também `workoutId`, cargas por posição de série, referência
   da última execução e timestamps. Somente séries efetivamente concluídas
   atualizam o perfil; valor `0` é válido.
3. O preview agrupa cargas iguais em um único valor; valores diferentes aparecem
   na ordem das séries separados por `/`. Sem perfil, todas as séries começam em
   `0 kg`.
4. Índices suportam unicidade e cleanup por plano/workout/exercício sem varrer a
   coleção inteira.
5. Excluir exercício remove perfis de todas as pessoas para aquele exercício;
   excluir workout remove os perfis de seus exercícios; excluir plano remove todos
   os perfis daquela árvore. Remover apenas uma referência pessoal não remove o
   perfil enquanto o global existir, permitindo retomá-lo ao referenciar novamente.
6. A limpeza ocorre depois do CAS que remove a árvore, é idempotente e possui
   reconciliação para falha ou corrida. Um perfil órfão nunca é servido porque a
   leitura sempre parte de uma árvore autorizada vigente. Finalização não recria
   perfil quando o exercício de origem deixou de existir.

### Finalização idempotente entre Redis e MongoDB

1. O `sessionId` é a chave de idempotência. Repetir a finalização nunca cria duas
   conclusões nem duplica perfil de carga.
2. O command valida a sessão/version, monta o contrato durável, cria ou encontra a
   conclusão e aplica por upsert determinístico os perfis elegíveis.
3. A execução só fica publicamente `completed` depois que todos os upserts
   necessários terminarem. Uma falha intermediária mantém a sessão Redis e permite
   repetir o mesmo fluxo; operações já aplicadas continuam idempotentes.
4. Depois da conclusão MongoDB canônica, a API remove a chave Redis com comparação
   de `sessionId`. Falha nessa remoção não desfaz o histórico; nova chamada encontra
   a mesma conclusão, reconcilia a limpeza e devolve a mesma response.
5. A rota de conclusão pode ser reaberta pelo ID conhecido da sessão/execução mesmo
   se a response original se perder. Ela exige ownership e nunca devolve conclusão
   de outra pessoa.

### Relação com plano ativo e alterações posteriores

1. Sem sessão, `/training` resolve a seleção ativa e a árvore atual por meio do
   catálogo pessoal. Uma referência global continua viva e somente leitura.
2. Com sessão, `/training` prioriza o snapshot em andamento e mostra seu plano,
   mesmo que a seleção ativa tenha mudado, sido removida ou o global tenha sido
   excluído. Depois da conclusão/abandono, volta a resolver a seleção vigente.
3. Editar, reordenar ou excluir conteúdo depois do início não altera nomes,
   métricas, séries ou ordem da sessão. Isso impede que uma execução mude no meio.
4. Signed URLs nunca entram no snapshot. A API assina a mídia interna quando lê a
   sessão. Se a mídia tiver sido fisicamente removida, a UI mostra fallback e o
   restante do treino continua executável.
5. Histórico e indicador `Atual` usam `trainingPlanId`, não `catalogEntryId`; remover
   e readicionar a mesma referência global preserva a sequência. Um clone possui
   novos IDs e começa sua própria sequência.

## Requisitos funcionais

### Menu, entrada e seleção do treino

1. Toda pessoa autenticada vê `Treinar` no menu com ícone Lucide apropriado,
   destino `/training`, navegação tipada e estado ativo em suas três rotas.
2. Sem plano ativo e sem sessão, a rota mostra empty state textual, ícone e botão
   `Ir para Meus planos`, que navega para `/training-plan`.
3. Com plano ativo, o título é o nome do plano e o subtítulo é
   `Selecione o treino`.
4. Se o plano não tiver workouts, a rota mostra empty state específico e a mesma
   ação para `Meus planos`; não inventa card nem treino atual.
5. Cada workout é um único card/link acionável em toda a área e contém:
   - mídia do primeiro exercício visual na ordem (`image`, `youtube-short` ou
     `youtube-long`) ou placeholder cinza com ícone de exercício;
   - thumbnail em proporção e tamanho padronizados, com `object-fit` sem deformar;
   - nome do workout;
   - áreas corporais distintas na ordem da primeira ocorrência, ignorando `pause`;
   - no máximo um indicador `Atual` ou `Em andamento`.
6. Para imagem, a API fornece thumbnail assinada; para YouTube, a UI deriva a
   miniatura do ID; signed URL recebe `no-store`, não entra no PWA e usa
   `referrerPolicy="no-referrer"`.
7. Sem histórico daquele plano, o primeiro workout é `Atual`. Com histórico, é o
   workout imediatamente posterior ao último finalizado que ainda exista na ordem
   atual; depois do último, volta ao primeiro. Se o último histórico apontar para
   workout removido, o primeiro é `Atual`.
8. Uma sessão existente substitui `Atual` por `Em andamento` no workout do snapshot.
   Nenhum outro card recebe indicador.
9. Mobile usa uma coluna; viewports maiores usam grade de duas ou mais colunas
   conforme o espaço, mantendo largura legível e cards de altura coerente.

### Modo não iniciado

10. Ativar qualquer workout navega para
    `/training/workout/:workoutId` sem iniciar automaticamente.
11. O título é o nome do workout e o botão primário é `Iniciar treino`.
12. A lista preserva a ordem e apresenta cards não expansíveis. Mídia também não é
    interativa antes do início.
13. Cada card apresenta somente as métricas existentes no discriminador:
    - `youtube-short` e `image`: área corporal, séries, repetições, última carga e
      descanso;
    - `youtube-long`: área corporal;
    - `pause`: duração do descanso;
    - `duration`: área corporal e duração;
    - mídia ausente ou tipo sem mídia: placeholder cinza com ícone do tipo.
14. Cargas iguais aparecem uma vez; cargas distintas aparecem separadas por `/`,
    sempre acompanhadas de `kg` e com nomes acessíveis além dos ícones.
15. Se outra sessão já existir, a tela identifica o treino em andamento e oferece
    `Retomar treino` ou `Descartar e iniciar este`. O descarte exige confirmação e
    DELETE bem-sucedido antes de criar a nova sessão; nunca sobrescreve em silêncio.

### Início, retomada e concorrência

16. `Iniciar treino` cria o snapshot no Redis, devolve a versão zero e muda a
    própria rota para modo iniciado sem navegação de documento.
17. Refresh, nova aba, foco ou reconexão consulta primeiro a sessão. Se o ID do
    workout for o mesmo, o modo iniciado é reconstruído; se for outro, aplica a
    regra do requisito 15.
18. A UI mantém fila FIFO por `sessionId`, injeta `X-Resource-Version` somente na
    cabeça e não executa duas mutations da mesma sessão em paralelo.
19. Outro dispositivo que alterou a sessão causa
    `WORKOUT_SESSION_VERSION_CONFLICT`; a UI conserva qualquer draft de carga,
    refaz GET e exige nova ação quando houver colisão. Não faz merge silencioso.
20. Carga editada usa `NumberField` HeroUI, aceita número finito de `0` a
    `9999.99`, com no máximo duas casas decimais, e é salva no backend após debounce
    curto de 500 ms ou blur. A série só pode ser concluída depois da carga
    confirmada.
21. Draft, debounce e mutation pendente bloqueiam atualização silenciosa do PWA.
    Depois da confirmação Redis, um reload é seguro porque a rota retoma a sessão.
22. Se a sessão tiver expirado, a rota informa `Seu treino em andamento expirou`,
    retorna para `/training` e não cria histórico nem perfil de carga.

### Cards, expansão e mídia no modo iniciado

23. Apenas um card permanece expandido. Ativar o corpo de outro card o expande e
    recolhe o anterior; ativar novamente o card expandido o recolhe.
24. Controles filhos, inputs, botões e mídia não disparam a expansão do card.
25. O indicador à direita é um círculo neutro quando incompleto e um check verde
    com texto acessível quando concluído; não é interativo.
26. Ativar uma thumbnail existente abre mídia somente no modo iniciado:
    - viewport menor que `768px`: drawer inferior com handle, aproximadamente
      metade da altura útil e backdrop dispensável;
    - viewport a partir de `768px`: modal centralizado proporcional ao conteúdo;
    - imagem usa `displayUrl` e preserva proporção;
    - YouTube monta `react-player` somente com o overlay aberto e desmonta ao
      fechar;
    - somente `youtube-long` inicia com som ativo e expõe o fullscreen nativo por
      ação explícita; nenhum vídeo entra automaticamente em fullscreen.
27. Overlay de mídia fecha por handle/gesto, backdrop, `Escape` e controle
    explícito, contém/restaura foco e nunca persiste URL, posição ou estado de
    reprodução.

### Exercícios com séries (`youtube-short` e `image`)

28. Expandido, o card oculta os resumos de séries, repetições e carga e mantém área
    corporal e descanso.
29. Existe uma linha por série com número, repetições prescritas, input de carga e
    estado não interativo. A primeira série incompleta é a série atual.
30. `Finalizar série N` conclui somente a série atual com a carga confirmada. Uma
    linha concluída fica desabilitada e não pode ser alterada até reiniciar o
    exercício.
31. `Finalizar séries restantes` conclui atomicamente todas as séries ainda
    incompletas usando as cargas confirmadas de cada linha. A ação fica indisponível
    enquanto houver draft inválido ou não salvo.
32. Ao concluir uma série que não é a última do exercício, a response já persiste a
    conclusão e inicia um timer `series-rest` com o descanso configurado.
33. O overlay de descanso mostra `Descanso`, segundos restantes em número simples,
    `ProgressBar` crescente e `Pular descanso`. No mobile, backdrop/gesto/ação
    fecham e resolvem o timer; no desktop, fechar o modal produz a mesma resolução.
34. O timer fecha sozinho em zero. Fechar ou pular não desfaz a série, que já está
    confirmada.
35. A última série não abre descanso. O card é concluído, recolhido e o primeiro
    exercício incompleto da ordem é expandido e focado. Se nenhum existir, abre a
    confirmação de conclusão integral.
36. `Finalizar séries restantes` também não abre descansos intermediários; conclui
    o exercício e segue o requisito 35.

### Tipos sem série de carga

37. `pause` expandido apresenta uma única linha com o tempo em segundos, não
    editável, e `Iniciar descanso`.
38. O timer `pause` usa drawer/modal não dispensável por backdrop. Gesto no handle,
    `Pular descanso` ou expiração fecham o overlay e concluem o exercício; não há
    cancelamento que volte a deixá-lo incompleto depois de iniciado.
39. `duration` expandido apresenta uma única linha com a duração convertida para
    `00:00` e `Iniciar cronômetro`.
40. O timer `duration` usa drawer/modal não dispensável por backdrop, mostra o nome,
    contagem regressiva `00:00`, progresso crescente, `Cancelar` e `Finalizar`.
    Gesto de fechamento equivale a `Cancelar`.
41. `Cancelar` fecha sem concluir; `Finalizar` conclui antecipadamente; chegar a
    zero conclui e fecha automaticamente. Os três caminhos são persistidos e
    idempotentes.
42. `youtube-long` expandido apresenta ação `Concluir exercício`, sem fabricar
    séries, carga, descanso ou duração que não existem no contrato. O vídeo pode
    ser visto antes ou depois dessa conclusão manual.
43. Concluir qualquer tipo aplica foco/avanço do requisito 35.

### Exercício concluído e reinício

44. Um card concluído recolhido conserva métricas e o check de conclusão.
45. Ao expandi-lo, todas as linhas concluídas e cargas permanecem visíveis e
    desabilitadas; ao final aparece `Reiniciar exercício`.
46. Reiniciar limpa somente os estados de conclusão daquele exercício, preserva as
    cargas digitadas como novos valores editáveis e não altera outros cards.
47. Se o exercício reiniciado era o único que mantinha o treino integralmente
    concluído, qualquer confirmação de parabéns aberta fecha e o treino volta a
    incompleto.

### Finalização e tela de conclusão

48. `Finalizar treino` aparece depois dos cards e pode ser acionado a qualquer
    momento no modo iniciado.
49. Com exercício incompleto, abre confirmação dispensável com contagem do que será
    encerrado, ações `Continuar treino` e `Finalizar mesmo assim`. Nenhuma conclusão
    é criada antes da confirmação.
50. Quando o último exercício é concluído, abre overlay não dispensável por
    backdrop com check, parabéns, `Sim, finalizar` e `Voltar`. `Voltar` fecha sem
    desfazer progresso.
51. Finalizar cria a conclusão idempotente, atualiza perfis elegíveis, remove a
    sessão Redis e navega por replace para
    `/training/completion/:workoutExecutionId`.
52. A tela final apresenta:
    - check verde grande;
    - `<nome do treino> finalizado`;
    - quantidade de treinos concluídos na semana sobre a quantidade de workouts do
      plano e marcadores de segunda a domingo;
    - exercícios concluídos naquele treino e áreas corporais distintas;
    - `totalLoadKg` e duração em minutos, arredondada para exibição humana;
    - `Compartilhar` e `Voltar para treinos`.
53. `Voltar para treinos` navega por replace para `/training`, que recalcula o
    próximo treino pela conclusão recém-criada.
54. `Compartilhar` chama `navigator.share()` diretamente na ativação com texto
    humano, por exemplo `Treino concluído: 51 min, 9 exercícios e 53 kg.`
    Cancelamento nativo não mostra erro. Se Web Share não existir, a UI copia o
    mesmo texto para a área de transferência e anuncia o fallback.
55. A conclusão pode ser reaberta por URL direta enquanto existir no MongoDB.
    Ownership alheio é indistinguível de ausência.

### Contrato HTTP mínimo

56. A implementação documenta pelo menos estas operações ou equivalentes que
    preservem as mesmas responsabilidades:
    - `GET /training` — plano/sessão e cards da entrada;
    - `GET /training/workouts/:workoutId` — preview não iniciado e cargas;
    - `POST /training/workouts/:workoutId/session` — iniciar;
    - `GET /training/session` e `DELETE /training/session` — retomar/abandonar;
    - `PUT /training/session/exercises/:exerciseId/series/:seriesNumber/load`;
    - `POST .../series/:seriesNumber/complete`;
    - `POST .../series/complete-remaining`;
    - `POST /training/session/exercises/:exerciseId/timer`;
    - `POST /training/session/timer/resolve` com outcome discriminado;
    - `POST /training/session/exercises/:exerciseId/complete` para `youtube-long`;
    - `POST /training/session/exercises/:exerciseId/restart`;
    - `POST /training/session/complete`;
    - `GET /training/completions/:workoutExecutionId`.
57. Leituras exigem sessão; mutations exigem sessão, origem, CSRF e rate limit.
    Writes frequentes de carga/série/timer recebem limite próprio de 240/min por
    pessoa+IP; iniciar, abandonar e finalizar usam 30/min. `OPTIONS` não consome.
58. Finalização aceita confirmação explícita de incompletude. Sem ela, uma sessão
    incompleta responde `409 WORKOUT_INCOMPLETE` e não persiste conclusão.
59. Responses da sessão incluem `serverNow`, versão e signed URLs hidratadas apenas
    para a leitura corrente. Toda response com signed URL usa
    `Cache-Control: private, no-store`.
60. Erros estáveis mínimos:
    - `TRAINING_PLAN_ACTIVE_SELECTION_NOT_FOUND`;
    - `TRAINING_PLAN_HAS_NO_WORKOUTS` quando uma ação exigir workout;
    - `TRAINING_WORKOUT_NOT_FOUND`;
    - `WORKOUT_SESSION_ALREADY_ACTIVE`;
    - `WORKOUT_SESSION_NOT_FOUND` e `WORKOUT_SESSION_EXPIRED`;
    - `WORKOUT_SESSION_VERSION_CONFLICT`;
    - `WORKOUT_EXERCISE_NOT_FOUND` e `WORKOUT_SERIES_NOT_FOUND`;
    - `WORKOUT_LOAD_INVALID`;
    - `WORKOUT_SERIES_ALREADY_COMPLETED`;
    - `WORKOUT_TIMER_ALREADY_ACTIVE`, `WORKOUT_TIMER_NOT_FOUND` e
      `WORKOUT_TIMER_OUTCOME_INVALID`;
    - `WORKOUT_EXERCISE_TYPE_INVALID`;
    - `WORKOUT_INCOMPLETE`;
    - `WORKOUT_EXECUTION_NOT_FOUND`;
    - falhas Redis/Mongo externas convertem para `SERVICE_UNAVAILABLE` ou
      `INTERNAL_SERVER_ERROR` sem detalhes de infraestrutura.

## Requisitos não funcionais

- Acessibilidade:
  - cards acionáveis usam um único controle sem controles aninhados; inputs, mídia
    e botões irmãos têm nomes contextuais;
  - headings, lista ordenada, estados, progresso e erros são semânticos;
  - overlays contêm e restauram foco; avanço automático move foco somente depois
    de confirmação do backend e respeita `prefers-reduced-motion`;
  - check, círculo, badges, pending e progresso nunca dependem apenas de cor;
  - drawers não dispensáveis preservam ação explícita e gesto documentado; modal
    desktop oferece comportamento equivalente por teclado.
- Performance:
  - overview usa projeção única da árvore ativa, resolve áreas e primeira mídia sem
    N+1 e assina apenas thumbnails necessárias;
  - sessão Redis é uma única leitura/escrita compacta e nunca recebe write por
    segundo;
  - queries MongoDB de último treino/semana/perfil usam índices; cleanup não varre
    coleções sem índice;
  - React Player continua carregado sob demanda e mídia remota não entra no cache
    da PWA.
- Segurança e privacidade:
  - pessoa, plano e sessão são sempre derivados da autenticação e persistência;
    body não escolhe owner;
  - carga, nomes, áreas corporais, snapshot, signed URLs, cookies e conteúdo do
    treino não entram em logs ou Analytics;
  - logs usam somente IDs técnicos necessários, versão, tipo de operação, contagens,
    duração agregada e branches;
  - compartilhamento ocorre apenas por ação explícita e contém o texto já visível,
    sem IDs, URL privada ou dado de conta;
  - CSP permanece mínima para Blob/YouTube e fullscreen não amplia origens.
- Observabilidade:
  - todos os métodos de controller, command, service, repository e adapter seguem
    o formato de logging vigente;
  - eventos operacionais distinguem início, retomada, expiração, conflito, timer,
    finalização idempotente e cleanup pendente sem registrar cargas ou payload;
  - Analytics recebe apenas enums para navegação, expansão, mídia, início,
    conclusão, timer, retry, compartilhamento e abandono.
- Confiabilidade:
  - relógio é injetável nos services e controlado nos testes;
  - nenhuma mutation faz retry automático; ação explícita reutiliza estado atual;
  - resposta tardia de geração de sessão encerrada não atualiza cache, drawer,
    toast ou Analytics;
  - finalização é retomável e idempotente; cleanup Redis posterior não transforma
    commit MongoDB bem-sucedido em duplicata.
- Responsividade e apresentação:
  - HeroUI é a primeira fonte para `Card`, `Button`, `Chip`, `NumberField`,
    `ProgressBar`, `Drawer`, `Modal`, `AlertDialog` e estados de loading;
  - JSX próprio não contém classes Tailwind nem estilos inline; `styles.ts` usa
    `tv` de `@heroui/styles`;
  - mobile não possui scroll horizontal; desktop usa largura máxima legível,
    grade/cards e modal em vez de drawer inferior.

## Critérios de aceite

### Cenário 1 — Sem plano em uso

- Forma de validar:
  `http://localhost:3000/training?mockAuth=person&mockTraining=no-active-plan`.
- Given: pessoa autenticada sem seleção ativa e sem sessão Redis.
- When: abre `Treinar`.
- Then: vê empty state e `Ir para Meus planos`; nenhum workout é consultado ou
  marcado como atual.

### Cenário 2 — Primeiro e próximo treino atual

- Forma de validar: mesma rota com `mockTraining=active-plan`, mais cenário vivo do
  endpoint com seed/cURL.
- Given: plano ativo possui três workouts.
- When: não há histórico, o primeiro é `Atual`; depois o segundo é finalizado.
- Then: o terceiro passa a `Atual`; depois de finalizar o terceiro, o primeiro
  volta a ser `Atual`.

### Cenário 3 — Sessão em andamento prevalece

- Forma de validar: `mockTraining=session-running`.
- Given: sessão pertence ao segundo workout e a seleção ativa mudou depois.
- When: abre `/training`.
- Then: mostra o plano do snapshot e somente o segundo card como `Em andamento`;
  retomar leva ao estado Redis canônico.

### Cenário 4 — Preview dos cinco tipos

- Forma de validar:
  `http://localhost:3000/training/workout/64b000000000000000000101?mockAuth=person&mockTraining=workout-preview`.
- Given: workout contém os cinco discriminadores, mídia presente/ausente e cargas
  iguais/diferentes.
- When: a rota abre antes do início em mobile e desktop.
- Then: métricas, thumbnails/placeholders e agrupamento de carga correspondem ao
  tipo; cards e mídia não expandem nem reproduzem.

### Cenário 5 — Iniciar, fechar e retomar

- Forma de validar: link do cenário 4 e E2E Redis.
- Given: não existe sessão.
- When: inicia, altera carga confirmada, conclui uma série, fecha o documento e
  reabre antes de 24 horas.
- Then: mesma sessão, versão, carga, série e timer aplicável são reconstruídos sem
  `localStorage` e sem duplicar início.

### Cenário 6 — Segunda sessão não sobrescreve

- Forma de validar: fixture `other-session-running` e E2E de `SET NX`.
- Given: outro workout já está em andamento.
- When: tenta iniciar o workout aberto.
- Then: recebe `WORKOUT_SESSION_ALREADY_ACTIVE`; pode retomar ou confirmar descarte
  antes de iniciar, sem perder dados silenciosamente.

### Cenário 7 — Série comum e descanso

- Forma de validar: fixture `series-running` com relógio controlado.
- Given: primeira de três séries tem carga válida confirmada.
- When: aciona `Finalizar série 1`.
- Then: série fica concluída no Redis, drawer/modal mostra descanso e progresso,
  backdrop/gesto/pular/zero fecham sem desfazer a série.

### Cenário 8 — Última série avança o foco

- Forma de validar: mesma fixture com duas séries já concluídas.
- Given: existem outros exercícios incompletos.
- When: conclui a última série ou todas as restantes.
- Then: não abre descanso, marca o card, expande e foca o primeiro incompleto sem
  depender de scroll animado.

### Cenário 9 — Pausa conclui por término ou pulo

- Forma de validar: fixture `pause-running`.
- Given: exercício `pause` incompleto.
- When: inicia descanso e deixa chegar a zero; em repetição, usa gesto ou
  `Pular descanso`.
- Then: backdrop não fecha, ambos os caminhos concluem uma vez e avançam.

### Cenário 10 — Duração cancela, finaliza ou expira

- Forma de validar: fixture `duration-running`.
- Given: exercício `duration` incompleto.
- When: cancela/arrasta, finaliza antecipadamente ou aguarda zero em execuções
  isoladas.
- Then: cancelar não conclui; finalizar e expirar concluem uma vez; refresh calcula
  o restante por timestamps do servidor.

### Cenário 11 — Vídeo longo e conclusão manual

- Forma de validar: fixture `youtube-long-running` e smoke de preview publicado.
- Given: exercício não possui séries nem duração.
- When: abre a mídia e conclui o exercício.
- Then: modal/drawer permite áudio e fullscreen somente por ação explícita; ação
  separada conclui sem fabricar carga ou repetições.

### Cenário 12 — Reiniciar exercício

- Forma de validar: fixture `exercise-completed`.
- Given: exercício possui todas as linhas desabilitadas.
- When: expande e aciona `Reiniciar exercício`.
- Then: apenas ele fica incompleto, cargas permanecem editáveis e uma confirmação
  integral aberta é encerrada.

### Cenário 13 — Finalização antecipada

- Forma de validar: fixture `workout-incomplete` e E2E Mongo/Redis.
- Given: há exercícios incompletos.
- When: aciona `Finalizar treino`, cancela e depois confirma em repetição.
- Then: cancelamento preserva a sessão; confirmação cria uma conclusão parcial
  única, atualiza somente perfis elegíveis e limpa a sessão.

### Cenário 14 — Conclusão integral e resumo

- Forma de validar: fixture `workout-complete` e rota de conclusão.
- Given: o último exercício acabou.
- When: confirma a mensagem de parabéns.
- Then: vê semana ISO, exercícios/áreas, soma de cargas e duração; voltar recalcula
  `Atual` e reabrir a URL devolve a mesma conclusão.

### Cenário 15 — Compartilhamento nativo e fallback

- Forma de validar: teste de componente com `navigator.share` disponível,
  cancelado/indisponível e Playwright no browser suportado.
- Given: tela de conclusão está visível.
- When: ativa `Compartilhar`.
- Then: share recebe texto humano sem IDs; cancelamento é silencioso; ausência da
  API copia o mesmo texto e anuncia sucesso ou falha do fallback.

### Cenário 16 — Expiração absoluta

- Forma de validar: E2E Redis com relógio controlado e inspeção de `PTTL`.
- Given: sessão iniciada há quase 24 horas e atualizada várias vezes.
- When: cruza `expiresAt`.
- Then: a chave deixa de existir sem janela deslizante, GET informa expiração e
  nenhum histórico/carga nasce automaticamente.

### Cenário 17 — Concorrência entre dispositivos

- Forma de validar: E2E/script Lua e teste de fila UI.
- Given: dois clientes leram a mesma versão.
- When: ambos concluem ações diferentes.
- Then: apenas um CAS vence, o outro recebe conflito, refaz a leitura e nenhuma
  série/timer é perdido por last-write-wins.

### Cenário 18 — Plano alterado ou excluído durante a sessão

- Forma de validar: E2E com snapshot iniciado e mutação administrativa posterior.
- Given: sessão de referência global está ativa.
- When: admin altera/reordena/exclui exercícios ou o plano.
- Then: snapshot e progresso não mudam; mídia removida usa fallback; finalização
  mantém histórico agregado e não recria perfil de exercício inexistente.

### Cenário 19 — Exclusão limpa perfil de carga

- Forma de validar: E2E de exclusão global e pessoal com perfis de duas pessoas.
- Given: perfis existem para exercício/workout/plano.
- When: o recurso é excluído com CAS válido.
- Then: cleanup idempotente elimina os perfis no escopo correto, preserva outras
  árvores e conclusões agregadas e a reconciliação cobre falha/race simulada.

### Cenário 20 — Falha do Redis não produz falso sucesso

- Forma de validar: E2E encerrando apenas o Redis efêmero.
- Given: MongoDB está disponível e uma série aparece incompleta.
- When: tenta salvar carga, série, timer ou finalização.
- Then: recebe erro estruturado, UI mantém draft/estado anterior e não mostra check,
  avanço ou conclusão sem confirmação.

### Cenário 21 — Responsividade, foco e teclado

- Forma de validar: Playwright em `390x844`, `768x1024` e `1440x900`.
- Given: lista, exercício expandido e overlays estão disponíveis.
- When: a pessoa opera apenas por teclado e alterna viewports.
- Then: cards não aninham controles, apenas um expande, drawers viram modais no
  breakpoint, foco é contido/restaurado/avançado e não há overflow horizontal.

## Estratégia de entrega e compatibilidade

1. Registrar ADR e contratos persistidos antes de criar os endpoints, preservando
   os contratos atuais de planos.
2. Adicionar schemas/índices MongoDB e o store Redis com chave/TTL/CAS; aplicar
   índices publicados pelo comando versionado vigente antes das queries novas.
3. Implementar overview, preview e sessão com ports tipadas, relógio injetável e
   hidratação privada de mídia.
4. Implementar finalização idempotente e cleanup de perfis antes de habilitar a UI;
   provar retry nos limites entre MongoDB e Redis.
5. Evoluir `@dall-fit/types`, produtor API, consumidores UI, MSW e testes de forma
   atômica.
6. Adicionar menu e rotas manualmente, compondo primeiro estados estáticos e depois
   mutations/timers por fila de sessão.
7. Implementar overlays responsivos com HeroUI e reaproveitar apenas composições de
   mídia que tenham contrato realmente comum.
8. Atualizar endpoints, rotas, flow, bases e Analytics na mesma implementação;
   remover código/imports sem uso em API e UI.
9. Não há migração de sessões. Históricos e perfis começam vazios; planos atuais
   ficam imediatamente elegíveis. Rollback da UI/API não remove conclusões já
   gravadas.
10. Produção deve manter Redis com política `noeviction` e capacidade observada;
    indisponibilidade continua falha fechada. Perda excepcional do dataset pode
    encerrar sessões temporárias, nunca conclusões.

## Plano de testes

- Contratos compartilhados:
  - narrowing exaustivo de overview, sessão, exercícios e timers;
  - validação de versão, timestamps, cargas, semana e conclusão;
  - exports públicos e ausência de campos de infraestrutura.
- Unitários da API:
  - seleção ativa, prioridade da sessão e algoritmo cíclico de `Atual`;
  - snapshot dos cinco tipos e agrupamento/prefill de cargas;
  - Redis key, NX, PXAT fixo, CAS, tamanho, timer e expiração;
  - commands por endpoint, branches, códigos e responses;
  - série atual/restantes, pause, duration, youtube-long, reinício e foco lógico;
  - finalização parcial/integral, soma de carga, timezone/semana e idempotência;
  - cleanup por exercício/workout/plano e corrida com finalização;
  - signed URLs e logs sanitizados sem carga, nome, body area ou payload.
- E2E da API, serial com MongoDB e Redis efêmeros reais:
  - autenticação, CSRF, origem, rate limits, headers e `x-request-id`;
  - todos os endpoints e erros estáveis;
  - TTL absoluto observado no Redis, dataset perdido e CAS concorrente;
  - refresh/timer vencido sem writes por segundo;
  - índices, ownership, último treino, semana e perfis;
  - finalização repetida e falhas injetadas antes/depois de cada fronteira;
  - exclusões globais/pessoais e cleanup sem tocar outra pessoa/árvore.
- Unitários/componentes da UI:
  - menu, empty states, cards, áreas distintas e thumbnails/fallbacks;
  - preview por discriminador e agrupamento de carga;
  - fila por sessão, debounce, merge de response, conflito e reload safety;
  - expansão exclusiva, propagação de foco e prevenção de eventos aninhados;
  - séries, estados concluídos, reinício e confirmações;
  - relógio baseado em `serverNow`, progressão e todos os outcomes de timer;
  - drawer/modal, mídia, áudio/fullscreen e cleanup do player;
  - conclusão, Web Share/fallback e Analytics sanitizado.
- MSW:
  - handlers tipados com relógio e estado isolados;
  - latência para pending, versões incrementais, conflito, expiração e falhas;
  - signed URLs fictícias determinísticas; nenhum request escapa para API/Blob.
- Playwright:
  - jornada completa seleção → preview → início → retomada → execução → conclusão;
  - ausência de ativo, sessão concorrente, finalização antecipada e expiração;
  - cinco tipos, mídia, drawers/modais, teclado, foco e três viewports;
  - retorno para treinos mostrando o próximo `Atual`;
  - somente Vite + Chromium + MSW Browser, sem `page.route` ou API real.
- Regressão:
  - catálogo/seleção pessoal, editor global/pessoal, clonagem, imagens privadas,
    SSE, autenticação, tema, logout e PWA permanecem aprovados.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`.

## Riscos e decisões

- Redis é adequado porque a sessão é uma unidade efêmera, sofre writes frequentes
  e possui vencimento absoluto. MongoDB TTL seria possível, mas não acrescentaria
  valor durável e não garante remoção imediata; misturar sessão e histórico na
  mesma coleção aumentaria branches e índices.
- Redis não é histórico. Reset, indisponibilidade ou eviction podem perder uma
  sessão; `noeviction`, capacidade e falha fechada reduzem esse risco, enquanto a
  janela de 24 horas limita o impacto. Prometer recuperação depois de desastre do
  Redis exigiria persistência durável e mudaria a decisão desta feature.
- Snapshot impede que referência global mude no meio do treino, mas duplica
  temporariamente conteúdo e referências de mídia. O limite de 1 MiB, TTL e uma
  sessão por pessoa contêm o custo.
- Preservar o snapshot depois de trocar o plano ativo evita perda surpreendente e
  não bloqueia o catálogo pessoal. A seleção nova passa a valer assim que a sessão
  terminar ou for abandonada.
- Perfil de carga é conveniência operacional, não prontuário completo de
  progressão. Um único documento por pessoa/exercício atende o prefill e permite
  a cascata solicitada; histórico detalhado exige outra demanda.
- `totalLoadKg` soma as cargas das séries concluídas e não calcula volume
  carga×repetições. Essa semântica acompanha `peso total` da referência e precisa
  permanecer explícita para não mudar silenciosamente no futuro.
- Timer por timestamp evita write/segundo e sobrevive a suspensão da aba. Relógio
  do cliente não decide conclusão: `serverNow`, `endsAt` e reconciliação do backend
  são canônicos.
- Finalização atravessa dois bancos sem transação comum. Idempotência por
  `sessionId`, upserts determinísticos, estado de finalização e remoção Redis por
  comparação são obrigatórios; apagar a sessão antes do MongoDB seria perda de
  dados.
- Cleanup de carga após exclusão é eventualmente consistente como a limpeza de
  Blob vigente. Queries autorizadas nunca servem órfãos e reconciliação cobre
  falhas/races; transação entre aggregate embutido e todos os perfis ampliaria a
  infraestrutura local para replica set sem eliminar a fronteira Redis.
- Mídia removida após o início pode ficar indisponível. Reter blobs por toda sessão
  exigiria índice reverso e coordenação de expiração; como mídia é auxílio e não o
  progresso, a entrega usa fallback sem impedir conclusão.
- `youtube-long` não possui séries nem duração no contrato atual. Criar série
  fictícia contaminaria histórico e UI; conclusão manual é a única ação coerente.
- Drawer arrastável e backdrop não dispensável variam por tipo. A composição deve
  mapear cada gesto a um outcome explícito para não concluir `duration` ao cancelar
  nem deixar `pause` indefinidamente ambígua.
- Web Share depende de suporte do navegador, contexto seguro e ativação direta. O
  fallback para clipboard preserva utilidade sem simular compartilhamento nativo.
- O histórico cresce sem TTL. Os documentos são pequenos e indexados; paginação,
  exportação, exclusão pelo usuário e retenção exigem feature própria antes de o
  volume justificar outra estratégia.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxo afetados atualizados
- ADR de persistência híbrida e sessão de treino registrada
- Redis limitado ao estado temporário com TTL absoluto, sessão única e CAS
- MongoDB mantém conclusão durável e último perfil de carga
- Finalização idempotente e retomável entre MongoDB e Redis
- Cinco tipos executáveis sem campos ou séries fictícios
- Próximo treino, semana, carga e duração possuem semântica determinística
- Imagens privadas, signed URLs, CSP, logs e privacidade preservados
- HeroUI, responsividade, teclado, foco e overlays equivalentes aprovados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Seeds/cURLs e links locais reproduzem todos os caminhos documentados
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz, E2E da API e integrados da UI aprovados
