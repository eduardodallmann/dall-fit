# Feature Spec: copiar exercícios globais para um treino pessoal

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: FIT-0107.
- Problema: no editor de um treino pessoal, `Adicionar exercício` permite criar
  pelos cinco tipos, mas não reutilizar exercícios dos planos globais. A pessoa
  precisa preencher novamente conteúdo e mídia já disponíveis.
- Resultado: uma opção no final desse menu abre uma biblioteca única com busca por
  nome, filtro por área do corpo e seleção múltipla. Busca, filtro e paginação
  preservam a seleção e mostram seu total, inclusive exercícios ocultos. A
  confirmação acrescenta cópias independentes ao treino aberto, prontas para edição.
- Referências:
  - [Editor pessoal](../../../ui/docs/sdd/routes/training-plan-workout.md);
  - [Endpoints pessoais](../../../api/docs/sdd/endpoints/personal-training-plans.md);
  - [Tipos, mídia e limites do editor](../../../api/docs/sdd/endpoints/global-training-plans.md);
  - [Fluxo de planos pessoais](../flows/gestao-planos-treino-pessoais.md);
  - [Modelagem embutida](../adr/ADR-0003-modelagem-dos-planos-de-treino.md);
  - [Versão de recurso](../adr/ADR-0006-versao-de-recurso-em-header-de-dominio.md);
  - [Mídia privada](../adr/ADR-0007-blob-privado-oidc-e-urls-assinadas.md);
  - [Catálogo e clonagem de planos](../adr/ADR-0009-catalogo-pessoal-e-clonagem-duravel.md).
- Features relacionadas: [FIT-0058](fit-0058-planos-treino-pessoais.md), que
  introduziu planos próprios e referências globais, e
  [FIT-0028](fit-0028-editor-exercicios-escalabilidade-concorrencia.md), que
  introduziu o editor com limites e concorrência.
- A imagem fornecida na demanda identifica o ponto de entrada: abaixo de
  `Duração`, no menu do botão `Adicionar exercício` do treino pessoal.

## Escopo

### Incluído

- Ação `Copiar exercícios` no menu do editor de treino próprio.
- Biblioteca em modal com lista única, busca por nome, filtro por área do corpo,
  miniatura quando houver mídia, tipo, parte do corpo e checkboxes para seleção
  múltipla.
- Agrupamento por nome, independentemente de diferenças nos outros campos.
- Representante do grupo escolhido pelo plano global atualizado mais recentemente.
- Seleção preservada entre buscas, áreas e páginas, com indicação do total
  selecionado e confirmação única do conjunto.
- Cópia dos dados e das imagens privadas, novos IDs, append atômico e integração
  com fila, versão, erros e caches existentes.
- Contratos, MSW, seeds, testes e documentação viva correspondentes na implementação.

### Não incluído

- Exibir plano ou treino de origem na biblioteca ou oferecer escolha de variações.
- Catálogo pessoal independente de exercícios: as cópias pertencem ao treino.
- Copiar de planos de outras pessoas ou de planos pessoais da própria pessoa.
- Referência viva de exercício, sincronização posterior ou substituição automática
  de exercícios já presentes no destino.
- Nova opção no editor administrativo ou em referências pessoais somente leitura.
- Filtro adicional por tipo, criação pela biblioteca ou player de vídeo dentro dela.
- Selecionar repetidamente o mesmo grupo na mesma confirmação; uma nova abertura
  pode copiar novamente um exercício que já exista no treino.
- Edição ou cópia offline, mudança no schema Android, novos jobs de clonagem de
  planos ou alteração do Workflow existente.

## Projetos e documentação afetados

- API e endpoints: estender
  [personal-training-plans.md](../../../api/docs/sdd/endpoints/personal-training-plans.md)
  com leitura autenticada da biblioteca e cópia em lote para um workout próprio.
  Documentar hierarquia, branches, erros, seeds e cURLs de cada cenário novo.
- UI e rotas: atualizar
  [training-plan-workout.md](../../../ui/docs/sdd/routes/training-plan-workout.md)
  com menu, modal, seleção, estados e recuperação. O editor compartilhado recebe a
  ação apenas no resource pessoal editável.
- Fluxos: atualizar
  [gestao-planos-treino-pessoais.md](../flows/gestao-planos-treino-pessoais.md)
  com descoberta, seleção e cópia independente.
- Contratos em `@dall-fit/types`: requests e responses da biblioteca e do lote,
  filtro opcional `bodyArea`, identidade do grupo, referência técnica do
  representante e versão da origem;
  exportações somente pelo barrel público. Reutilizar `Exercise`, `BodyArea`,
  paginação, `ApiResponse` e `ApiError` quando aplicáveis.
- Bases: atualizar os contratos compartilhados e as bases proprietárias de API/UI
  quando passarem a descrever a nova leitura, a mutação em lote, seu timeout e os
  eventos enumerados de interação.
- Decisões arquiteturais: preservar aggregate embutido, CAS, mídia privada e
  separação entre biblioteca pessoal e CRUD administrativo. A cópia limitada de
  exercícios é síncrona e não altera a clonagem durável de árvores da ADR-0009.
- Handlers e fixtures MSW: estender o grupo de planos com biblioteca agrupada,
  múltiplas páginas, busca combinada com área do corpo, seleção preservada entre
  filtros e indicação do total selecionado, lote misto, mídia, conflito e falhas.
- Mocks unitários da API: repositories e Blob substituídos por mocks Vitest;
  commands substituem os services envolvidos.
- Fixtures E2E: MongoDB e Redis efêmeros, pessoa comum, admin, outra pessoa,
  globais com nomes repetidos e destinos editável, somente leitura e no limite.
  Integração Blob usa double controlado, sem credenciais nem acesso ao store real.

## Requisitos funcionais

### Entrada e apresentação

1. O menu `Adicionar exercício` do treino pessoal próprio inclui, depois dos cinco
   tipos atuais, `Copiar exercícios`, com descrição `Escolha exercícios dos modelos
   disponíveis.` A ação abre a modal `Copiar exercícios` e mantém a rota atual.
2. A biblioteca reúne exercícios de todos os planos com `ownerPersonId: null`,
   independentemente de vínculo, ativação ou uso pela pessoa. Sessão comum basta;
   a UI não chama os endpoints administrativos para consultar a biblioteca.
3. A lista mostra nome, tipo e parte do corpo do representante, além de miniatura:
   YouTube usa o ID normalizado e a origem de thumbnails já permitida; imagem usa
   a variante privada assinada. Duração com YouTube opcional também pode mostrar
   sua miniatura. Sem mídia ou em falha de carregamento, usar fallback acessível.
   Não mostrar nomes de plano ou treino, nem montar players para cada resultado.
4. Pausa não possui nome nem parte do corpo no contrato vigente. Sua apresentação
   é `Pausa`, tipo `Pausa`, parte do corpo `Não se aplica` e ícone correspondente.
   A biblioteca não inventa esses campos na entidade persistida.

### Agrupamento, representante, busca e filtro

5. O agrupamento considera somente o nome normalizado: remover espaços externos,
   reduzir espaços consecutivos e comparar sem diferença de caixa e acentuação.
   Mídia, tipo, parte do corpo, séries, repetições, descanso, duração e instruções
   nunca dividem um grupo de mesmo nome. Pausas formam um grupo técnico próprio,
   distinto de um exercício nomeado `Pausa`.
6. Cada grupo tem um único representante: a ocorrência cujo plano global possui
   maior `updatedAt`. Empates são resolvidos por IDs de plano, workout e exercício
   em ordem lexicográfica decrescente, garantindo resultado determinístico. Todos
   os campos exibidos e copiados vêm dessa mesma ocorrência, sem misturar valores.
7. A regra usa a atualização do plano inteiro, não uma suposta data de edição do
   exercício. Alterar outra parte daquele plano pode mudar o representante de um
   grupo. Não existe preferência manual de mídia ou de parâmetros.
8. Agrupar e escolher o representante antes de aplicar o filtro por área do corpo;
   depois filtrar, ordenar alfabeticamente pelo nome normalizado e paginar, usando
   identidade de grupo como desempate. Cada página contém até 20 grupos; total e
   paginação contam os grupos que atendem à busca e à área. Não montar a biblioteca
   baixando sucessivamente todos os planos e workouts na UI.
9. A busca faz correspondência parcial por nome, sem diferença de caixa ou
   acentuação, e retorna à primeira página ao mudar o termo. Debounce de 300 ms e
   cancelamento de leitura evitam requests desnecessárias; resposta antiga não
   substitui a busca mais recente. Termo vazio lista todos os grupos da área ativa.

   A modal oferece um `Select` de seleção única com label `Área do corpo`, opção
   inicial `Todas as áreas` e as 16 opções de `BODY_AREAS`, com os mesmos nomes em
   português já usados no editor. Busca e área são combinadas por interseção.
   Pausas aparecem somente em `Todas as áreas`, pois não possuem `bodyArea`.
   O filtro usa a área do representante escolhido: uma ocorrência antiga de outro
   local do corpo não faz o grupo aparecer nessa outra área nem troca sua versão.

   Toda mudança efetiva de área, inclusive retornar a `Todas as áreas`, volta à
   primeira página e preserva o termo de busca, todos os grupos selecionados,
   suas referências de origem e a ordem de marcação. Digitar, alterar ou limpar
   a busca também preserva a seleção. Nenhuma troca de filtro ou página desmarca
   exercícios, mesmo quando a leitura falhar ou não retornar resultados.

   A seleção é mantida separadamente dos resultados da página. Ao reaparecerem
   depois de outra busca, área ou página, os grupos continuam marcados, sem
   duplicação nem alteração de sua ordem. Uma leitura nova não substitui
   silenciosamente a ocorrência de origem já selecionada; mudanças seguem a
   recuperação de seleção obsoleta definida adiante.

   Manter visível a indicação `X selecionados`, com singular para um item, mesmo
   durante loading, sem resultados ou com erro de listagem. A contagem abrange
   todos os selecionados, incluindo os ocultos pelo filtro, pela busca ou em
   outra página. Exibir a descrição `Os exercícios selecionados são mantidos ao
   mudar a área do corpo ou a busca.` Durante a cópia, o filtro e a busca ficam
   desabilitados junto dos controles da seleção. Respostas de consultas anteriores
   não substituem a lista atual nem alteram a seleção acumulada.
10. A identidade do grupo é estável entre páginas, buscas e áreas. A referência
    técnica do representante e a versão de seu plano acompanham o resultado, sem
    exibir origem à pessoa. Nenhuma URL assinada participa da identidade ou agrupamento.

### Seleção e confirmação

11. Checkboxes permitem marcar vários grupos, preservando a seleção ao mudar
    página, busca ou área do corpo. O rodapé informa a quantidade total conforme
    a indicação anterior e oferece `Cancelar` e `Copiar N exercícios`, com singular
    quando necessário. Confirmar copia todos os selecionados, inclusive os que
    não estão visíveis. A confirmação fica desabilitada sem seleção; busca ou
    filtro sem resultados não equivalem a uma seleção vazia.
12. Cada grupo selecionado gera exatamente um exercício. O conjunto guarda a ordem
    em que os grupos foram marcados; desmarcar e marcar novamente move o grupo para
    o final. Os novos exercícios entram nessa ordem depois dos itens já existentes.
13. A seleção máxima é `50 - quantidade atual do treino`, contando também todos
    os selecionados ocultos por área, busca ou página. No limite, os itens
    desmarcados ficam desabilitados e os marcados continuam podendo ser removidos,
    com explicação acessível. A API revalida quantidade e tamanho do aggregate.
14. A confirmação passa pela fila FIFO existente do plano de destino, usando a
    versão corrente apenas na cabeça da fila. O lote é uma operação estrutural:
    não dispara um POST de criação por item nem altera o treino antes do sucesso.
    Respeitar os bloqueadores e drafts atuais sem descartá-los ao abrir a modal.
15. Durante pending, manter modal e seleção visíveis, anunciar a cópia, impedir
    nova submissão, alteração da seleção, área ou busca, dismiss e ações estruturais
    concorrentes.
    Sucesso aplica exercícios e versão canônicos, atualiza os resumos e somente
    então fecha a modal, devolve o foco e anuncia a quantidade copiada.
16. Cancelar antes de enviar descarta somente a seleção da biblioteca. Sair da rota
    com seleção alterada ou trabalho em execução participa da proteção existente
    de navegação, `beforeunload` e reload PWA. Falha preserva seleção e erro
    persistente; toast é complementar.

### Conteúdo copiado e independência

17. A API resolve origem e destino, valida a sessão e gera IDs novos. Copiar todos
    os campos de domínio do tipo selecionado, inclusive mídia, parâmetros,
    instrução e YouTube opcional de duração. Não copiar owner, IDs de origem,
    histórico, última carga, timestamps do global ou metadados do assistente.
18. A cópia fica editável pelos controles que seu tipo já possui. Ela não cria
    vínculo com o global e não altera o conjunto de planos ativos. Edições ou
    exclusões posteriores na origem não modificam nem removem o destino.
19. Para imagem, copiar ambas as variantes para um asset privado novo, com keys
    próprias. Não reutilizar keys nem persistir signed URLs da origem; excluir ou
    substituir uma imagem em qualquer lado não afeta a outra. `image: null`
    continua permitido e não produz upload fictício.
20. Preparar todo o lote e suas mídias antes de uma única alteração CAS do destino.
    Todos os exercícios entram juntos e a versão avança uma vez. Falha de item,
    mídia, assinatura, limite ou CAS não deixa parte do lote no workout. Compensar
    blobs novos que não foram materializados; nunca limpar mídia referenciada por
    um commit confirmado ou cujo resultado ainda seja ambíguo.

### HTTP, atualização da origem e recuperação

21. Introduzir
    `GET /training-plans/exercise-library?page=1&search=...&bodyArea=chest`,
    autenticado, com paginação tipada, grupos e representantes projetados. Query
    aceita termo de até 120 caracteres, `bodyArea` opcional com um único valor de
    `BODY_AREAS` e segue a validação canônica de paginação do domínio. Omitir
    `bodyArea` representa `Todas as áreas`; não enviar um valor fictício `all` ao
    backend. Área inválida ou múltiplos valores retornam `400 VALIDATION_ERROR`.
    Área e busca integram a query key, e a filtragem ocorre no servidor antes da
    paginação. Falha de listagem preserva toda a seleção acumulada entre áreas,
    buscas e páginas, com a indicação do total ainda visível.
22. Introduzir
    `POST /training-plans/:catalogEntryId/workouts/:workoutId/exercises/copy`,
    autenticado, com `X-Resource-Version` do destino e array ordenado de 1 a 50
    seleções únicas. Cada seleção identifica grupo e ocorrência exibida, com IDs
    de plano/workout/exercício e versão do plano de origem. O cliente não envia
    conteúdo de exercício, owner, keys ou URLs para materialização.
23. Sucesso retorna `201`, exercícios criados na ordem do lote e versão resultante
    em `X-Resource-Version`. Mutações Web exigem origem e CSRF; Bearer nativo segue
    a proteção existente. Referência pessoal recusa escrita com
    `403 GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`; destino alheio é indistinguível
    de ausente. Origem pessoal nunca é aceita como global.
24. Antes de preparar a cópia, conferir que cada seleção ainda aponta para o
    representante e a versão que a pessoa viu. Origem removida, alterada ou
    representante trocado retorna `409 EXERCISE_LIBRARY_SELECTION_STALE`, sem
    inserção. Recarregar a biblioteca apresenta as mudanças e exige nova seleção
    dos grupos afetados; não trocar silenciosamente a mídia ou os parâmetros.
25. Depois dessa conferência, o conteúdo capturado é o snapshot da tentativa. Não
    exigir transação entre planos distintos: edição posterior da origem não muda
    esse snapshot. Se uma variante desaparecer antes de ser copiada, a tentativa
    falha integralmente. Exclusão após a cópia física não compromete o asset novo.
26. Aplicar `428 PRECONDITION_REQUIRED`, `400 VALIDATION_ERROR`,
    `412 TRAINING_PLAN_VERSION_CONFLICT`, `409 EXERCISE_LIMIT_REACHED` e
    `409 TRAINING_PLAN_SIZE_LIMIT_REACHED` conforme o domínio atual. Falha de cópia
    privada usa `503 EXERCISE_IMAGE_COPY_FAILED`; falha de assinatura mantém
    `503 IMAGE_URL_SIGNING_FAILED`. Todos seguem `ApiError` e `x-request-id`.
27. Somente o conflito exato de versão do destino pausa a fila. Origem obsoleta
    exige atualizar a biblioteca; erro técnico conhecido anterior ao commit permite
    retry explícito do conjunto preservado. Nenhuma mutation recebe retry automático.
28. O POST não é idempotente entre confirmações distintas: copiar de novo é uma
    ação válida. Reenviar a mesma versão de destino não pode inserir duas vezes,
    inclusive em requests concorrentes. Timeout, perda de resposta ou resultado de
    persistência incerto exigem releitura canônica antes de liberar outra cópia;
    não atualizar a versão e reenviar o lote automaticamente. A pessoa revisa o
    treino recuperado antes de iniciar outra confirmação.
29. A biblioteca possui loading, vazio global (`Nenhum exercício disponível`),
    busca ou área sem resultados (`Nenhum exercício encontrado`), erro com retry,
    seleção, pending e falha de cópia. Sem resultados por filtro, manter busca e
    área acionáveis para permitir outra escolha. Vazio e erro não são apresentados
    como sucesso.
30. Sucesso sincroniza workout, resumo de exercícios no detalhe, versão nas listas
    e queries de Treinar que dependam do plano. A preparação Android observa a
    revisão nova pelo fluxo online existente; sessão e snapshots já capturados
    permanecem independentes. A biblioteca é relida ao abrir e recupera alterações
    pelas invalidações globais disponíveis, sem apagar seleção silenciosamente.

## Requisitos não funcionais

- Acessibilidade: usar `Dropdown`, `Modal`, `SearchField`, `Select`, `Checkbox`,
  paginação e feedback do HeroUI 3; foco inicial na busca, navegação por teclado, nomes de
  seleção claros, anúncio de quantidade/erro/pending e retorno ao disparador.
  A modal deve funcionar em `390px` e desktop, com conteúdo rolável e ações
  acessíveis sem overflow horizontal. Ícones e miniaturas não substituem labels.
- Performance: consulta projetada e agrupada no servidor; assinar apenas a página
  exibida; miniaturas com carregamento sob demanda. Preparação de mídia limita-se
  a quatro imagens simultâneas, no máximo oito operações de variantes. A cópia tem
  orçamento total de preparação de 45 segundos; esgotá-lo impede o commit e inicia
  compensação. O POST usa timeout Axios finito de 60 segundos, exclusivo dessa
  operação, sem mudar o default das demais requests.
- Segurança e privacidade: sessão determina a pessoa; autorização de destino e
  filtro global da origem são server-side. Responses com URLs usam
  `Cache-Control: private, no-store`; URLs privadas mantêm validade/renovação
  existentes e `referrerPolicy="no-referrer"`. Não ampliar CSP nem persistir
  biblioteca, seleção ou URLs em storage, Workbox ou SQLite.
- Observabilidade: métodos novos e alterados seguem logging seguro do backend.
  Registrar contagens, etapas e categorias, sem termos de busca, nomes, payloads,
  keys ou URLs. Mapear abrir/fechar, busca, mudança de área, seleção, paginação,
  confirmação e retry à fronteira enumerada de Analytics; eventos de cópia têm início e terminal sem
  IDs ou conteúdo. Atualizar o catálogo vivo durante a implementação.
- Apresentação: composição em `index.tsx`, estilos em `styles.ts` com
  `@heroui/styles`, sem classes literais ou estilos inline na composição.
- Resiliência: respostas de busca atrasadas, logout e troca de identidade não
  repõem estado antigo. Falha pós-commit de publicação SSE ou refetch não transforma
  inserção confirmada em erro de cópia nem permite repetição automática.

## Critérios de aceite

Os links abaixo definem cenários MSW a implementar. Eles não afirmam que esses
seletores já existem. Todos iniciam no workout pessoal fictício
`74b000000000000000000101` da entrada `74b000000000000000000001`.

### Cenário 1 — encontrar e copiar vários exercícios

- Forma de validar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/74b000000000000000000101?mockAuth=person&mockTrainingPlans=exercise-library`.
- Given: treino próprio e globais com exercícios de tipos diferentes.
- When: abre `Adicionar exercício` → `Copiar exercícios`, busca, marca três
  grupos, muda de página e confirma.
- Then: vê nome, miniatura disponível, tipo e parte do corpo, sem origem; seleção
  e contagem sobrevivem à busca/paginação; os três itens entram ao final na ordem
  de seleção, com IDs novos, e a modal fecha somente após sucesso.

### Cenário 2 — agrupar nomes mesmo com conteúdo diferente

- Forma de validar: mesmo path com `mockTrainingPlans=exercise-library-grouped` e
  cenário novo do endpoint pessoal com seed/cURL de agrupamento.
- Given: ocorrências de mesmo nome em planos com datas diferentes e variações de
  mídia, tipo, corpo, séries e repetições; há também empate de datas.
- When: consulta e seleciona o grupo, inclusive atravessando páginas.
- Then: existe uma única opção por nome normalizado; todos os campos e a cópia
  vêm do plano mais recente, com desempate determinístico; total conta grupos.

### Cenário 3 — mídia e independência

- Forma de validar: mesmo path com `mockTrainingPlans=exercise-library-media`;
  E2E/seed/cURL novos de cópia e alteração posterior da origem.
- Given: lote com imagem privada, YouTube e duração com instrução/vídeo opcional.
- When: copia e depois altera ou exclui a origem; também remove a imagem copiada.
- Then: campos opcionais e parâmetros foram preservados; destino e origem usam
  assets distintos; alterações e exclusões não atravessam essa fronteira.

### Cenário 4 — capacidade e lote indivisível

- Forma de validar: mesmo path com `mockTrainingPlans=exercise-library-limit` e
  cenário novo do endpoint com seed/cURL para limite e tamanho do aggregate.
- Given: destino contém 48 exercícios e há três grupos disponíveis.
- When: marca dois e tenta marcar o terceiro; uma request direta tenta exceder o
  limite, e outra tenta copiar um lote cujo tamanho total ultrapassa 12 MiB.
- Then: UI permite desmarcar e explica o limite; a API rejeita o excesso sem
  inserir parte do lote. Duas cópias concorrentes não ultrapassam 50 exercícios.

### Cenário 5 — origem mudou depois da seleção

- Forma de validar: mesmo path com `mockTrainingPlans=exercise-library-stale`;
  cenário novo do endpoint com seed/cURL de seleção obsoleta.
- Given: grupo selecionado e origem removida, editada ou superada por outro plano.
- When: confirma o conjunto.
- Then: recebe `EXERCISE_LIBRARY_SELECTION_STALE`, nenhum exercício é inserido e
  a seleção não muda para outra versão silenciosamente; a pessoa atualiza e
  seleciona novamente os grupos afetados.

### Cenário 6 — falha de mídia e resultado ambíguo

- Forma de validar: mesmo path com `mockTrainingPlans=exercise-library-copy-error`;
  overrides MSW de timeout e E2E com falha Blob antes do commit.
- Given: seleção múltipla válida, com pelo menos uma imagem.
- When: uma variante falha ou o orçamento expira; em teste separado a resposta se
  perde depois do commit.
- Then: falha pré-commit deixa o treino intacto e compensa destinos; a modal mantém
  seleção e erro recuperável. Resultado ambíguo força releitura, não compensa mídia
  de item persistido e não reenvia automaticamente nem duplica o lote.

### Cenário 7 — fila, conflito e cache

- Forma de validar: mesmo path com `mockTrainingPlans=exercise-library-conflict`,
  Playwright e E2E de concorrência do endpoint pessoal.
- Given: há salvamento anterior na fila e outra aba pode editar o plano.
- When: confirma um lote e, depois de sucesso e fila ociosa, adiciona outro item;
  em teste separado, a outra aba provoca conflito no destino.
- Then: versões seguem a fila, cada lote incrementa uma vez, ancestrais e retorno
  ao treino mostram dados confirmados; conflito exato pausa sem merge nem retry,
  preservando trabalho até recuperação explícita.

### Cenário 8 — autorização e regressão dos outros modos

- Forma de validar: seeds/cURLs novos para pessoa comum, destino alheio, origem
  pessoal, referência read-only e sessão ausente; links vigentes de referência e
  editor administrativo para regressão visual/funcional.
- Given: pessoas com perfis e ownership distintos.
- When: consultam a biblioteca e tentam copiar por UI ou request direta.
- Then: pessoa comum copia para seu treino próprio; origem pessoal e destino
  alheio são recusados; referência permanece somente leitura; editor global mantém
  suas cinco ações atuais; ausência de sessão não expõe biblioteca.

### Cenário 9 — estados, teclado e ciclo de sessão

- Forma de validar: mesmo path com `mockTrainingPlans=exercise-library-empty`,
  `exercise-library-error` e latência MSW; Playwright em desktop e `390px`.
- Given: biblioteca vazia, busca sem resultado, falha recuperável ou seleção ativa.
- When: navega por teclado, tenta sair durante pending ou encerra a sessão com
  request em voo.
- Then: estados possuem mensagem e ação coerentes, foco e seleção são acessíveis,
  pending impede descarte, navegação alterada é protegida e callback antigo não
  escreve dados nem feedback na próxima sessão.

### Cenário 10 — preservar seleção e indicar o total entre filtros e buscas

- Forma de validar: `http://localhost:3000/training-plan/74b000000000000000000001/workout/74b000000000000000000101?mockAuth=person&mockTrainingPlans=exercise-library-body-area`;
  cenário novo do endpoint pessoal com seed/cURL de filtro por `bodyArea`.
- Given: biblioteca com representantes em áreas distintas, seleção em várias
  páginas, itens selecionados ocultos pela busca e exercícios já copiados no treino.
- When: marca dois grupos, escolhe `Peito`, busca outro exercício, marca um terceiro
  grupo e depois volta a `Todas as áreas` e limpa a busca.
- Then: a seleção e sua ordem são preservadas em cada mudança; a indicação mostra
  `2 selecionados` e depois `3 selecionados`, mesmo com itens ocultos. Ao
  reaparecerem, os grupos continuam marcados. Confirmar copia os três na ordem de
  marcação. Busca e área voltam à página 1 quando alteradas; itens já copiados e
  drafts do treino permanecem intactos. A API retorna somente grupos cujo
  representante pertence à área solicitada e o total da interseção com a busca,
  sem selecionar uma ocorrência antiga de outra área.
- Alternativas: lista vazia, loading ou erro mantêm seleção, ordem e contagem;
  escolher novamente a mesma área não muda a seleção; resposta HTTP atrasada não
  altera lista nem seleção atuais; o limite considera itens ocultos; durante
  pending de cópia, mudar área ou busca fica bloqueado. Pausas só aparecem sem
  restrição de área.

## Estratégia de entrega e compatibilidade

1. Acrescentar contratos públicos e os endpoints pessoais de biblioteca/cópia,
   preservando CRUD existente, ownership e fonte global.
2. Consultar e agrupar server-side com Mongoose, projetando representantes antes
   de filtrar por área e paginar. Não extrair exercícios para outra coleção nem
   criar catálogo permanente somente para essa leitura.
3. Preparar cópias e imagens com concorrência/orçamento finitos; assinar response
   antes do CAS; inserir o array completo com controle de versão e limites na mesma
   operação do aggregate. Preservar reconciliação e limpeza segura de órfãos.
4. Integrar modal e lote à fila, caches e ciclo de sessão do editor pessoal; criar
   MSW, testes, seeds/cURLs e documentação viva na mesma implementação.
5. Revisar API e UI para remover símbolos que tenham ficado sem uso e executar os
   gates aplicáveis. Sem migração de dados de planos nem de SQLite; contratos
   novos são aditivos e a UI depende da API que os oferece.

Versões confirmadas em manifests, lockfile e tipos locais: HeroUI React/Styles
3.2.6, Mongoose 9.11.2 e Vercel Blob 2.8.2. A consulta oficial confirmou composição
de [Modal](https://heroui.com/en/docs/react/components/modal) e
[Checkbox](https://heroui.com/en/docs/react/components/checkbox), filtro de seleção
única com [Select](https://heroui.com/en/docs/react/components/select), agrupamento pela
[API de agregação Mongoose](https://mongoosejs.com/docs/api/aggregate.html) e
[cópia privada de Blob](https://vercel.com/docs/vercel-blob/using-blob-sdk#copy-a-blob).
Usar o SDK atrás do service existente e converter explicitamente IDs em pipelines;
não depender de casting automático. Não adicionar dependência para essa demanda.

## Plano de testes

- Unitários API: agrupamento por nome, normalização, pausas, representante e
  desempate; filtro pela área do representante combinado com busca e aplicado
  antes de paginar; origem global, ownership e versões; lote ordenado; limites do
  conjunto; campos dos cinco tipos; compensação parcial, falha de assinatura e commit
  ambíguo. Commands cobrem decisões com services mockados.
- E2E API seriais: agregação/paginação reais sem grupos repetidos entre páginas;
  busca combinada com área, área inválida ou repetida, pausa sem área, total
  filtrado, transporte, sessão comum, autorização, origem obsoleta, lote misto,
  incremento único, corrida de CAS, limite 50 e tamanho. MongoDB/Redis reais e
  efêmeros; Blob controlado. Cada cenário HTTP ganha seed idempotente e cURL completo
  no documento proprietário, executados na validação da implementação.
- Vitest UI/MSW: seleção e ordem preservadas entre áreas, buscas e páginas;
  contagem global visível com itens ocultos, loading, vazio e erro; grupos marcados
  ao reaparecer, sem duplicação; confirmação inclui todos os selecionados; busca
  preservada ao mudar área e página reiniciada; limite inclui ocultos; respostas
  antigas de busca/área, modal pending/erro, filtro e busca desabilitados durante
  cópia, fallback de miniatura,
  integração FIFO, atualização de caches, recuperação de timeout/conflito e
  teardown da sessão.
- Playwright: caminho de seleção múltipla, agrupamento visível, busca/paginação,
  mudança de área e busca com seleção acumulada, contagem global e cópia dos
  selecionados ocultos, preservando o treino,
  sucesso confirmado, falha com seleção preservada, limite, duas operações
  consecutivas e teclado em desktop/mobile; rede exclusivamente via MSW Browser.
- Layout: inspecionar a referência aplicável
  `ui/docs/sdd/routes/assets/training-plan-workout/desktop-1440-owned.png` e validar
  somente a composição representada. A modal nova é definida pelo texto desta
  feature; não há exigência de gerar screenshots para ela.
- Quality gates da implementação, a partir da raiz: `pnpm lint`, `pnpm test`,
  `pnpm test:coverage:ci`, `pnpm build`, `pnpm -C api test:e2e` e
  `pnpm test:integration`.
- A especificação é `docs-only`; não exige execução dos gates de código.

## Riscos e decisões

- Decisões confirmadas: lista única com busca; nome, miniatura, tipo e parte do
  corpo sem origem; seleção múltipla; agrupar sempre pelo nome mesmo com conteúdo
  diferente; usar a ocorrência do plano atualizado mais recentemente; oferecer
  filtro por área do corpo; preservar seleção entre filtros, buscas e páginas e
  indicar o total selecionado, inclusive exercícios ocultos.
- O filtro usa seleção única e inicia em `Todas as áreas`, reutilizando o campo
  singular `bodyArea` do domínio. Filtrar depois de escolher o representante
  preserva a regra já definida de usar o plano atualizado mais recentemente.
  Área, busca e página alteram somente os resultados exibidos: seleção, ordem e
  referências de origem são independentes da consulta atual. Contagem, limite e
  confirmação incluem todos os selecionados, inclusive os que ficaram invisíveis.
- Agrupar somente por nome deliberadamente esconde outras variações, inclusive
  tipos e locais do corpo diferentes. Não agrupar por identidade de mídia nem por
  catálogo do assistente, pois isso contrariaria a escolha funcional.
- Ordenação de seleção, append, cópia integral e lote atômico são decisões de
  funcionamento derivadas da confirmação conjunta e dos limites/CAS do editor.
- A atualização do plano pode invalidar uma seleção mesmo quando o exercício não
  mudou. A regra conservadora evita copiar conteúdo diferente do apresentado.
- Uma seleção com muitas imagens pode exceder o orçamento. Nesse caso a operação
  falha sem append parcial e oferece recuperação explícita. Não converter
  silenciosamente esse contrato em job durável ou reduzir tipos suportados; uma
  necessidade de alterar essa estratégia retorna à especificação.
- Compartilhar keys deixaria a cópia dependente da limpeza global; por isso a
  independência inclui os binários. Commit incerto exige distinguir o que está
  referenciado antes de compensar; erro de rede não prova ausência de gravação.
- O agrupamento é uma projeção da árvore atual. Não altera o CRUD global nem
  elimina exercícios repetidos dos planos de origem.

## Condições esperadas da entrega

- Critérios de aceite atendidos.
- Biblioteca agrupada por nome e representante determinístico, acessível à pessoa
  comum sem expor conteúdo de planos pessoais.
- Seleção múltipla preservada entre áreas, buscas e páginas, com contagem global
  visível; limite e confirmação incluem também exercícios ocultos.
- Lote cria cópias editáveis e independentes, com mídia própria e um único CAS.
- Falhas e conflitos não produzem sucesso visual, append parcial ou retry cego.
- Contratos, endpoints, rota, fluxo e bases afetadas atualizados na implementação.
- MSW, mocks, seeds, E2E e Playwright atualizados conforme o impacto.
- Revisão de código sem uso em API/UI e quality gates aplicáveis aprovados.
