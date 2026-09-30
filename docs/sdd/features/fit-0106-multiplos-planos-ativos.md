# Feature Spec: Múltiplos planos ativos

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #106](https://github.com/eduardodallmann/dall-fit/issues/106).
- Problema: cada pessoa pode manter hoje zero ou um plano ativo. A seleção usa
  radio, substitui a anterior e faz a jornada Treinar, o dashboard e a preparação
  offline pressuporem um único plano. Isso impede combinar rotinas de planos
  diferentes sem trocar repetidamente a seleção.
- Resultado: cada pessoa pode ativar de zero a cinco entradas do próprio catálogo.
  A gestão usa checkboxes e bloqueia visualmente uma sexta seleção; a API aplica o
  mesmo limite como autoridade. Com um ativo, Treinar conserva o comportamento
  atual. Com vários, apresenta primeiro os planos ativos e deixa a pessoa escolher
  temporariamente qual deseja usar, sem transformar essa escolha em preferência
  persistente. O Android prepara todos os planos ativos para que essa escolha
  continue disponível offline.
- Referências:
  - [SDD transversal](../README.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [governança do SDD](../base/04-governanca-do-sdd.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [ADR-0003 — modelagem dos planos](../adr/ADR-0003-modelagem-dos-planos-de-treino.md);
  - [ADR-0014 — motor nativo offline](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [ADR-0015 — lease offline](../adr/ADR-0015-lease-offline-de-treino-no-redis.md);
  - [fluxo de planos pessoais](../flows/gestao-planos-treino-pessoais.md);
  - [fluxo de execução](../flows/execucao-de-treino.md);
  - [endpoints de planos pessoais](../../../api/docs/sdd/endpoints/personal-training-plans.md);
  - [endpoints de treino](../../../api/docs/sdd/endpoints/training.md);
  - [endpoint de lease offline](../../../api/docs/sdd/endpoints/offline-training-lease.md);
  - [rota Meus planos](../../../ui/docs/sdd/routes/training-plan.md);
  - [rota Treinar](../../../ui/docs/sdd/routes/training.md);
  - [rota Dashboard](../../../ui/docs/sdd/routes/dash.md);
  - [Checkbox do HeroUI](https://heroui.com/en/docs/react/components/checkbox);
  - [índices de schema do Mongoose](https://mongoosejs.com/docs/guide.html#indexes).
- Features relacionadas: FIT-0058 introduziu o catálogo e a seleção singular;
  FIT-0070 introduziu a jornada Treinar; FIT-0083, FIT-0084 e FIT-0089 criaram a
  preparação, o lease e a execução offline de um único plano; FIT-0105 fez o
  dashboard consumir a próxima ação derivada dessa seleção.

As versões confirmadas no repositório são HeroUI `3.2.2`, Mongoose `9.8.0` e
Capacitor `8.5.2`. O Checkbox composto do HeroUI 3 é o controle oficial para
seleção múltipla e expõe estado selecionado, desabilitado e nome acessível. A
persistência MongoDB deve manter a restrição de até cinco em uma única transição
atômica por pessoa; validação apenas no schema ou na UI não protege requests
concorrentes.

## Escopo

### Incluído

- permitir zero, um, dois, três, quatro ou cinco planos ativos por pessoa;
- substituir o radio da coluna `Em uso` por Checkbox do HeroUI, preservando nome
  acessível, foco visível, teclado, estado pendente e realce das linhas ativas;
- permitir desmarcar qualquer plano ativo sem exigir selecionar outro;
- ao alcançar cinco ativos, manter os cinco marcados operáveis para desmarcação e
  desabilitar visualmente somente os checkboxes dos demais planos, com explicação
  acessível do limite;
- rejeitar atomicamente na API a tentativa de ativar um sexto plano, inclusive em
  requests concorrentes, com erro estável e sem alterar o conjunto confirmado;
- migrar sem perda a seleção singular existente para um conjunto que contenha a
  mesma entrada; pessoas sem seleção continuam com conjunto vazio;
- remover automaticamente do conjunto uma entrada excluída/desvinculada e limpar
  referências a globais removidos, sem escolher fallback;
- manter o comportamento atual de `/training` quando há exatamente um plano ativo;
- quando há dois a cinco ativos e não existe escolha na URL, mostrar cards dos
  planos ativos antes de mostrar workouts;
- ao escolher um desses cards, permanecer em `/training`, registrar a escolha
  somente na navegação atual e mostrar os workouts daquele plano;
- representar a escolha temporária por search param validado com
  `catalogEntryId`, preservando-o nos links para a prévia do workout e no retorno
  à lista; reload ou deep link podem recompor a mesma visão, mas a escolha não é
  gravada no MongoDB, Redis, SQLite, localStorage ou preferência Android;
- oferecer ação para voltar da lista de workouts à escolha dos planos quando
  houver vários ativos, removendo o search param;
- recusar a escolha temporária quando a entrada não pertencer à pessoa, não estiver
  ativa ou tiver sido removida, sem revelar catálogos alheios;
- fazer prévia e início identificarem o `catalogEntryId` escolhido quando houver
  mais de um ativo, evitando inferência ambígua somente pelo `workoutId`;
- manter no máximo uma sessão de treino por pessoa/aparelho. Uma sessão existente
  continua soberana pelo snapshot capturado, mesmo se seu plano for desmarcado, e
  pode ser retomada ou descartada pelos comportamentos vigentes;
- fazer o dashboard continuar iniciando diretamente o próximo workout quando há
  exatamente um ativo e encaminhar a `/training` para escolha quando há vários;
- preservar `Escolher um plano` para o caso de nenhum ativo, com destino a
  `/training-plan`;
- preparar no Android todos os planos ativos, até o limite de cinco, com seus
  workouts e mídias, mantendo concorrência global limitada e prontidão/validade
  independentes por plano;
- permitir escolher entre todos os planos locais válidos quando o Android estiver
  offline; plano expirado ou cuja preparação essencial falhou não fica disponível
  para novo início, sem bloquear os demais válidos;
- migrar o SQLite do singleton de plano preparado para uma coleção indexada por
  plano, preservando o plano preparado existente como uma linha válida;
- manter um único lease/editor por pessoa e instalação, mas tornar a concessão
  independente de um plano singular para autorizar os snapshots dos vários planos
  preparados sob o mesmo fence;
- conservar sessão ativa, snapshots pendentes e conclusão provisória ao ativar ou
  desativar planos; a limpeza alcança apenas réplicas preparadas e mídias que não
  estejam referenciadas por execução independente;
- atualizar, na implementação autorizada, contratos compartilhados, SDDs vivos,
  ADR do lease, seeds, mocks, fixtures e testes afetados.

### Não incluído

- mais de cinco planos ativos;
- preferência persistente, ordenação ou plano ativo “principal” entre os cinco;
- cálculo automático de prioridade entre planos no dashboard ou em Treinar;
- combinar workouts de planos diferentes em uma única grade;
- múltiplas sessões simultâneas ou mudança de plano dentro de uma sessão iniciada;
- execução de workout pertencente a plano inativo, salvo retomada da sessão já
  capturada e sincronização de seu snapshot independente;
- remoção automática de um plano ativo para abrir espaço ao sexto;
- armazenamento offline no Web/PWA ou iOS;
- novo cache privado no navegador;
- alteração dos limites de workouts, exercícios ou mídia de cada plano;
- geração obrigatória de novas referências visuais; as imagens atuais continuam
  referências de layout e serão atualizadas somente se a implementação curada
  mudar materialmente o layout documentado.

## Projetos e documentação afetados

- API e endpoints:
  - `PUT /training-plans/active` passa a definir o estado booleano de uma entrada e
    devolve o conjunto canônico de IDs ativos; a ativação valida o máximo de cinco
    de forma atômica, e a desativação é idempotente;
  - `GET /training` passa a distinguir vazio, plano único, escolha entre vários e
    plano temporariamente escolhido por `catalogEntryId`;
  - prévia e início de workout recebem a identidade do catálogo escolhida quando
    necessária e continuam validando-a server-side;
  - lease e ingestão offline deixam de exigir coincidência com um único plano no
    valor da concessão, mantendo pessoa, instalação e `leaseId` como fence;
  - dashboard diferencia zero, um e vários ativos.
- UI e rotas:
  - `/training-plan` usa Checkbox HeroUI e comunica o limite de cinco;
  - `/training` recebe a visão de escolha de planos, a visão filtrada de workouts e
    a equivalência offline Android;
  - `/training/workout/:workoutId` preserva a identidade do catálogo escolhida no
    search param antes da sessão; depois do início, o snapshot é canônico;
  - `/dash` recebe a ação intermediária para vários planos.
- Fluxos: atualizar `gestao-planos-treino-pessoais.md` e
  `execucao-de-treino.md` na implementação.
- Contratos em `@dall-fit/types`: atualizar request/response da seleção, visão de
  treino, resumos de planos disponíveis, preparação offline, ação do dashboard e
  lease. Tipos exclusivos da bridge e do SQLite permanecem na UI.
- Decisões arquiteturais: criar uma ADR que substitua a parte da ADR-0015 que
  vincula o lease a um plano singular e registrar a coleção de até cinco planos
  preparados no motor; ADRs históricas existentes não serão editadas para fingir
  que a decisão sempre foi múltipla.
- Handlers e fixtures MSW: cobrir zero, um, vários, limite atingido, seleção
  temporária válida/inválida, sessão existente e preparação parcial Android.
- Mocks de repositories/caches nos unitários da API: cobrir conjunto ativo,
  concorrência do limite, resolução explícita de plano e lease sem plano singular.
- Fixtures MongoDB/Redis nos E2E: migrar seeds singulares, acrescentar conjunto de
  cinco, tentativa de sexto, vários planos e lease/snapshots de planos distintos.
- Android: elevar a versão do schema SQLite com migration explícita, adaptar bridge,
  storage, preparação, repository de treino, limpeza e testes instrumentados.

## Requisitos funcionais

1. `active` continua pertencendo à entrada de catálogo, não à árvore do plano. Uma
   entrada própria e uma referência global podem estar ativas ao mesmo tempo.
2. A pessoa pode alternar cada checkbox independentemente. Marcar envia
   `active: true`; desmarcar envia `active: false`. O sucesso substitui o estado
   local pelo conjunto canônico devolvido pela API. Falha restaura a representação
   confirmada e mostra feedback sem inventar sucesso.
3. A persistência mantém um documento de seleção por pessoa com até cinco
   `catalogEntryIds` únicos. O legado com um único `catalogEntryId` é convertido
   para array antes de o novo contrato depender dele. O índice único por pessoa é
   preservado e o índice legado por entrada é substituído pelos índices necessários
   às limpezas e métricas.
4. Ativar valida primeiro que a entrada existe, pertence à pessoa, é navegável e,
   no caso de referência, aponta para global existente. A gravação acrescenta sem
   duplicar somente se ainda houver menos de cinco IDs. Se o ID já estiver ativo,
   a operação é idempotente e não falha por limite.
5. A sexta ativação responde `409 ACTIVE_TRAINING_PLAN_LIMIT_REACHED`, informa no
   máximo o limite público `5` em `details` e não expõe IDs. Duas ativações
   concorrentes próximas ao limite nunca produzem seis itens.
6. Desativar remove somente o ID solicitado, é idempotente e pode produzir conjunto
   vazio. A UI não pergunta qual plano deve substituí-lo.
7. Listagens e detalhes continuam expondo `active: boolean` por entrada. Paginação
   não altera o limite: os cinco ativos podem estar distribuídos por páginas, e a
   API devolve metadado suficiente para a UI saber a contagem canônica sem carregar
   todo o catálogo.
8. Ao chegar a cinco, checkboxes desmarcados ficam desabilitados com descrição
   `Você pode manter até 5 planos em uso. Desmarque um plano para selecionar outro.`
   Os marcados continuam habilitados. O estado não depende apenas de cor, tooltip
   ou posição da linha.
9. Depois de qualquer mudança confirmada, a UI remove as queries de Treinar e
   invalida catálogo e dashboard. No Android, o coordenador reconcilia o conjunto:
   prepara novos ativos e remove somente réplicas de planos desativados que não
   sustentem sessão ou snapshot independente.
10. `GET /training` sem `catalogEntryId` retorna:
    - zero ativos: nenhum plano disponível e nenhum workout;
    - um ativo: a apresentação e os workouts atuais, sem etapa adicional;
    - dois a cinco ativos: resumos dos planos para escolha, sem eleger um deles e
      sem misturar workouts.
11. `GET /training?catalogEntryId=...` retorna os workouts somente se a entrada
    estiver no conjunto ativo da pessoa. ID inválido ou não ativo responde erro
    estável indistinguível de recurso alheio. A API não persiste nem reordena a
    escolha.
12. A visão com vários planos mostra uma lista ordenada e acessível de cards com
    nome, origem e quantidade de workouts. O card é link real para a mesma rota com
    search param validado. A visão escolhida mostra o nome do plano, `Selecione o
    treino` e ação `Escolher outro plano`.
13. Links de workout propagam `catalogEntryId`. Prévia e início usam essa identidade
    para validar plano e workout. Se existir sessão, leitura, retomada, mutations e
    terminal continuam usando exclusivamente o snapshot, sem exigir que o plano
    permaneça ativo.
14. Se a sessão capturada pertence a um dos planos ativos, o respectivo card recebe
    indicação textual `Em andamento`. Se pertence a plano já desativado, Treinar
    ainda apresenta a retomada/descarte canônica sem reativá-lo.
15. O dashboard resolve a sessão antes do conjunto ativo. Sessão existente continua
    gerando `resume-workout`. Sem sessão: zero ativos gera `select-plan`; um ativo
    preserva `start-workout`; vários geram `choose-training-plan`, com destino
    `/training`, sem nomes ou IDs arbitrariamente escolhidos e com contagem semanal
    sem meta única de workouts.
16. As métricas administrativas distinguem pessoas com ao menos um ativo da soma
    de seleções ativas. Uma pessoa com cinco ativos conta uma vez em
    `activePlanCount` e cinco vezes em `activeSelectionCount`; uso de modelos
    globais conta cada vínculo ativo pertinente sem duplicar a mesma pessoa para o
    mesmo modelo.
17. No Android, o SQLite passa a aceitar até cinco linhas de plano preparado,
    identificadas por `plan_id`, cada uma com payload, revisão, validade e arquivos.
    A migration transforma a linha singleton existente sem apagar conta, sessão,
    snapshots, sync state, conclusão ou mídias.
18. A preparação obtém o conjunto canônico de ativos e compõe cada plano com os
    mesmos endpoints públicos. A concorrência total de previews e downloads
    permanece limitada a quatro, não quatro por plano. Commit essencial e estado
    de mídia são independentes por plano; uma falha não remove nem bloqueia outro
    plano ainda válido.
19. A lista offline mostra somente planos com dados essenciais válidos. Mídia
    incompleta usa fallback. Expiração impede novo início apenas naquele plano;
    sessão já iniciada continua até conclusão ou cancelamento.
20. A chave de lease continua única por pessoa e admite uma única instalação
    editora. Seu valor deixa de representar um plano atual singular. Registro,
    repetição e takeover preservam a semântica de fence e TTL; trocar o conjunto
    ativo na mesma instalação não cria novo fence nem revoga snapshots pendentes.
21. A ingestão de snapshot valida pessoa, instalação e `leaseId`. O plano continua
    vindo da árvore capturada e não concede acesso a catálogo alheio; um terminal
    ou snapshot já criado pode sincronizar depois de o plano ser desmarcado. Novo
    início exige que o plano preparado ainda seja localmente válido e ativo no
    snapshot canônico mais recente.
22. Takeover permanece global por pessoa: outra instalação toma a concessão para
    todos os planos, sem uma confirmação por plano. A limpeza por lease inválido
    remove os planos preparados, arquivos, sessão e snapshots cercados pelo fence
    revogado conforme o comportamento seguro vigente.

## Requisitos não funcionais

- Acessibilidade:
  - usar a composição oficial de Checkbox do HeroUI 3, com nome derivado do plano,
    descrição do limite associada e foco visível;
  - cards de plano e workout são links reais, listas possuem nome acessível e
    estados `Em uso`, `Em andamento`, indisponível ou expirado também aparecem em
    texto;
  - mensagens de limite e erro são anunciadas e não dependem somente de cor.
- Performance:
  - leitura da seleção é limitada a cinco IDs e não faz scan de catálogo;
  - a API resolve os planos em lote e evita uma query sequencial por ativo;
  - preparação Android limita a quatro o total de requests/downloads concorrentes,
    deduplica arquivos pelo identificador opaco e não baixa novamente mídia pronta;
  - a tela libera cada plano após seu commit essencial, sem esperar todos os demais
    ou todas as mídias.
- Segurança e privacidade:
  - pessoa e ownership continuam derivados da sessão; IDs do body/query nunca
    concedem acesso;
  - URLs assinadas, Bearer, cookie, paths e conteúdo dos planos não entram em logs,
    Analytics ou preferências;
  - limite e conjunto são revalidados na API; desabilitar o sexto checkbox não é
    controle de segurança;
  - Web/PWA continua sem persistência privada offline.
- Observabilidade:
  - logs seguros distinguem ativação, desativação, limite, quantidade de ativos,
    escolha múltipla, preparação por plano e reconciliação, sem registrar IDs,
    nomes ou conteúdo;
  - métodos novos e alterados seguem `Classe -> método -> etapa:` e registram
    branches, dependências e retorno sanitizado.
- Resiliência e concorrência:
  - a mutação do conjunto é atômica por pessoa;
  - resposta atrasada da UI não pode sobrescrever estado canônico mais novo;
  - callbacks de preparação usam geração e revisão por plano para não ressuscitar
    uma réplica removida;
  - uma falha parcial não apaga planos válidos nem snapshots independentes.

## Critérios de aceite

### Cenário 1 — ativar e desativar vários planos

- Forma de validar: link local
  `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=multiple-active`.
- Given: a pessoa possui planos próprios e referências, com dois ativos.
- When: marca um terceiro e desmarca um dos anteriores.
- Then: checkboxes, realce e contagem refletem exatamente o conjunto canônico; a
  desmarcação não ativa fallback e a próxima visita a Treinar refaz sua leitura.

### Cenário 2 — limite visual e autoridade da API

- Forma de validar: link local
  `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=active-limit`
  e cenário vivo do endpoint de planos pessoais com seed/cURL próprios.
- Given: cinco entradas já estão ativas.
- When: a tela é aberta e uma tentativa direta de ativar a sexta é enviada.
- Then: os cinco checkboxes marcados permitem desmarcação, os demais estão
  desabilitados com explicação acessível, e a API responde
  `ACTIVE_TRAINING_PLAN_LIMIT_REACHED` sem alterar o conjunto.

### Cenário 3 — concorrência no quinto lugar

- Forma de validar: cenário vivo do endpoint, complementado por E2E MongoDB com
  duas requests concorrentes.
- Given: há quatro planos ativos e duas entradas válidas inativas.
- When: ambas são ativadas concorrentemente.
- Then: exatamente uma ocupa a quinta posição; a outra recebe o erro de limite e a
  persistência nunca contém seis IDs.

### Cenário 4 — compatibilidade com um plano ativo

- Forma de validar: link vigente
  `http://localhost:3000/training?mockAuth=person&mockTraining=active-plan`.
- Given: existe exatamente um plano ativo.
- When: a pessoa abre Treinar.
- Then: vê diretamente os workouts como hoje, sem etapa ou clique adicional.

### Cenário 5 — escolha temporária entre vários planos

- Forma de validar: link local
  `http://localhost:3000/training?mockAuth=person&mockTraining=multiple-active`.
- Given: três planos estão ativos e não existe sessão.
- When: escolhe um plano, abre um workout e retorna a Treinar.
- Then: a UI mostra somente os workouts do escolhido, propaga o
  `catalogEntryId`, permite `Escolher outro plano` e não altera checkboxes nem
  grava preferência persistente.

### Cenário 6 — escolha inválida ou obsoleta

- Forma de validar: cenário vivo de `GET /training` com seed/cURL e Playwright com
  search param de entrada removida.
- Given: o `catalogEntryId` não pertence ao conjunto ativo ou foi removido depois
  de a URL ser criada.
- When: a rota ou endpoint tenta usá-lo.
- Then: nenhum dado alheio é exposto; a UI oferece voltar à escolha canônica e não
  seleciona silenciosamente outro plano.

### Cenário 7 — dashboard com zero, um e vários ativos

- Forma de validar: links locais de dashboard para fixtures `empty`,
  `single-active` e `multiple-active`.
- Given: não existe sessão em andamento.
- When: cada configuração abre o dashboard.
- Then: zero direciona a Meus planos, um mantém o início direto do próximo workout
  e vários direcionam a Treinar para escolha, sem priorização automática.

### Cenário 8 — sessão prevalece sobre desativação

- Forma de validar: cenário vivo do endpoint de treino e Playwright.
- Given: uma sessão foi iniciada pelo plano A e depois A foi desmarcado.
- When: a pessoa abre Treinar ou a rota do workout.
- Then: pode retomar ou descartar a sessão capturada; A não é reativado e nenhum
  novo workout de A pode ser iniciado após o terminal.

### Cenário 9 — múltiplos planos offline no Android

- Forma de validar: não se aplica a link Web; exige repository nativo injetado e
  testes Android instrumentados com SQLite/filesystem reais.
- Given: três planos ativos foram preparados, dois completos e um com mídia
  incompleta.
- When: a rede é removida e a pessoa abre Treinar.
- Then: os três planos com dados essenciais válidos podem ser escolhidos, o plano
  com mídia incompleta usa fallback e iniciar um deles não remove os demais.

### Cenário 10 — migration do plano singleton

- Forma de validar: teste Android instrumentado abrindo um banco schema v4.
- Given: o banco antigo contém conta, um plano preparado, arquivos, sessão e
  snapshots pendentes.
- When: a nova versão migra o schema.
- Then: o plano vira uma entrada da coleção, todos os demais dados permanecem e a
  jornada pode retomar/sincronizar sem reset ou aviso de perda.

### Cenário 11 — preparação parcial e reconciliação

- Forma de validar: testes do coordenador e Android instrumentado.
- Given: cinco planos estão ativos, alguns já válidos, um falha e outro é
  desmarcado durante downloads.
- When: a preparação e a reconciliação terminam.
- Then: planos válidos permanecem disponíveis, o falho informa retry próprio, o
  removido não é republicado por callback atrasado e arquivos sem referência são
  limpos sem alcançar sessão ou snapshots.

### Cenário 12 — um lease sincroniza execuções de planos distintos

- Forma de validar: cenário vivo atualizado do lease e E2E serial com Redis e
  MongoDB efêmeros.
- Given: a mesma instalação possui um lease vigente e snapshots dos planos A e B,
  ambos preparados quando ativos.
- When: envia revisões aceitas de A e B e depois desmarca A.
- Then: ambos usam o mesmo fence, as sincronizações aceitas renovam a concessão
  conforme a regra vigente e o snapshot já criado de A continua sincronizável; um
  novo treino de A não pode ser iniciado.

## Estratégia de entrega e compatibilidade

1. Introduzir os novos tipos de conjunto ativo e os contratos HTTP coordenados,
   mantendo produtor, UI, MSW e testes na mesma mudança.
2. Migrar a coleção MongoDB de campo singular para array limitado. O deploy deve
   normalizar documentos legados e aplicar os índices novos antes de remover a
   leitura compatível; rollback não pode escrever formato singular sobre dados com
   vários ativos.
3. Alterar a mutation de seleção para ativar/desativar e devolver o conjunto
   canônico. A UI só então troca o radio pelo Checkbox e habilita o estado vazio.
4. Adaptar overview, prévia, início, dashboard e queries da UI para resolução
   explícita da escolha temporária, preservando o caminho direto de um único ativo.
5. Substituir formalmente a decisão de lease vinculado a plano por lease global da
   instalação/pessoa, mantendo fence, takeover, TTL e ingestão idempotente.
6. Elevar o schema Android de v4 para v5, migrar `prepared_plan` para múltiplas
   linhas e adaptar a bridge com operações list/get/put/remove por plano.
7. Adaptar o coordenador para reconciliar até cinco planos com concorrência global
   quatro, depois habilitar a escolha offline múltipla.
8. Atualizar documentos vivos, ADR substitutiva, seeds/cURLs, mocks, screenshots
   curadas que realmente mudarem e todos os testes afetados.

A API e a UI precisam ser publicadas de forma coordenada porque request, response
e semântica de Treinar mudam. O banco MongoDB legado é compatível para frente
somente durante a janela de normalização. O banco Android deve preservar migration
encadeada v1→v2→v3→v4→v5. Um downgrade do aplicativo continua não suportado. A
política de compatibilidade Android deve elevar o mínimo apenas depois que a build
com schema v5 estiver disponível e validada, preservando filas existentes durante
a atualização obrigatória.

## Plano de testes

- Unitários da API:
  - ativação, idempotência, desativação e conjunto vazio;
  - limite cinco e corrida pelo último lugar;
  - limpeza por exclusão/desvinculação e global removido;
  - listagem/detalhe com vários flags ativos;
  - overview com zero, um, vários e escolha explícita;
  - preview/início recusando plano inativo ou alheio;
  - dashboard com sessão, zero, um e vários ativos;
  - lease sem plano singular, takeover e validação de snapshots distintos;
  - métricas administrativas por pessoa versus número de seleções.
- E2E serial da API:
  - migration/seed representando legado e novo formato;
  - requests autenticadas para marcar/desmarcar e exceder o limite;
  - concorrência real no quinto lugar;
  - GET de Treinar e início com escolha válida, inválida e obsoleta;
  - sessão preservada depois da desativação;
  - lease e sync de execuções de planos diferentes na mesma concessão;
  - índices e limpeza de referências globais.
- UI com Vitest e MSW:
  - Checkbox HeroUI controlado, pending, rollback e limite acessível;
  - caches de Treinar/dashboard removidos após mudança;
  - navegação de escolha, search param e retorno;
  - comportamento direto de um único ativo e empty state de zero;
  - ação do dashboard e sessão prevalente;
  - preparação parcial, retry e reconciliação por plano.
- Playwright:
  - catálogo com vários ativos em desktop e `390px`;
  - quinto ativo, bloqueio do sexto e desmarcação ainda disponível;
  - escolha de plano, workouts, deep link, voltar e plano obsoleto;
  - regressão de plano único, sem plano e sessão em andamento;
  - perda de conexão no Web/PWA continua sem dados privados offline.
- Android instrumentado:
  - criação schema v5 e migrations v1→v5 e v4→v5;
  - CRUD/CAS de até cinco planos e isolamento de arquivos por plano;
  - preparação concorrente, parcial, cancelada e retomada;
  - seleção offline, validade individual e fallback de mídia;
  - preservação de sessão, snapshots, fila e conclusão durante reconciliação;
  - takeover/lease inválido limpa todo o fence sem afetar outra conta.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`;
  - `pnpm android:test` em dispositivo ou emulador para a migration e storage.

## Riscos e decisões

- O limite de cinco foi escolhido para conter custo de leitura, mídia e espaço
  offline. Tanto UI quanto API o aplicam, mas somente a API é autoridade.
- A escolha em Treinar é temporária e representada na URL para suportar reload,
  deep link e retorno sem criar uma preferência escondida. Ela não altera o
  conjunto ativo nem estabelece prioridade.
- Um único ativo preserva a jornada atual e evita regressão de usabilidade para a
  maioria dos casos. A etapa de escolha só existe quando há ambiguidade real.
- O dashboard não calcula um treino global entre planos porque não existe ordem de
  prioridade confirmada. Com vários ativos, encaminha para a escolha explícita.
- Preparar todos os ativos no Android foi uma decisão explícita. O custo adicional
  é limitado por cinco planos, concorrência global quatro, deduplicação de arquivos
  e prontidão independente.
- O lease não pode continuar preso a um plano singular: rebind a cada escolha
  temporária revogaria snapshots válidos e contrariaria a disponibilidade
  simultânea. A exclusividade relevante permanece uma instalação editora por
  pessoa, cercada por `leaseId`.
- Sessão e snapshots capturados permanecem independentes do conjunto ativo. Essa
  separação evita perda de treino ao desmarcar um plano, sem permitir iniciar nova
  execução nele.
- O array de IDs em um documento por pessoa torna o limite verificável em uma
  mutation atômica e mantém leitura limitada. Um documento por seleção exigiria
  coordenação adicional para impedir o sexto item sob concorrência.
- A migration Android é de alto risco porque o schema atual usa `id = 1` e vários
  métodos assumem singleton. Reset não é estratégia aceitável: plano, sessão e fila
  existentes precisam sobreviver.
- As referências visuais atuais mostram radio e apenas um plano em Treinar. Elas
  serão tratadas como layout do comportamento antigo até a implementação atualizar
  somente as imagens curadas realmente afetadas, conforme a política visual.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Zero a cinco planos ativos com limite atômico na API e comunicação na UI
- Checkbox acessível substitui o radio e permite desmarcar todos
- Um plano conserva o fluxo atual; vários exigem escolha temporária explícita
- Dashboard encaminha a Treinar quando não há prioridade determinística
- Até cinco planos ficam preparados e utilizáveis offline no Android
- Sessão e snapshots existentes sobrevivem à desativação de um plano
- MongoDB legado e SQLite v1–v4 migram sem perda para os novos formatos
- Lease continua exclusivo por pessoa/instalação sem vínculo singular de plano
- Contratos, endpoints, rotas, flows e ADR afetados atualizados
- MSW, mocks, seeds, E2E, Playwright e testes Android atualizados
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz, E2E da API, integração UI e Android aprovados
