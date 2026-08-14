# Feature Spec: Aprimoramentos de mídia no editor e fechamento do menu móvel

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #59 — Correções e melhorias de interface](https://github.com/eduardodallmann/dall-fit/issues/59)
- Problema:
  - as miniaturas de YouTube e as imagens dos exercícios não possuem uma relação
    dimensional consistente com os campos do editor nem oferecem visualização
    ampliada;
  - as ações de imagem ocupam espaço vertical, dependem de texto visível e não
    representam de maneira coesa os estados de ausência, upload, substituição e
    remoção;
  - o controle de fechar do drawer móvel disputa visualmente o mesmo espaço das
    ações de tema e logout.
- Resultado:
  - tornar as miniaturas compactas, proporcionais, acionáveis e responsivas;
  - visualizar vídeo em reprodução muda e imagem em melhor resolução por modais
    acessíveis;
  - oferecer upload por clique ou arrastar e soltar, com transições visuais
    inequívocas durante as mutações;
  - posicionar visualmente o fechamento do drawer fora do painel, preservando
    todas as formas atuais de dispensa, foco e navegação.
- Referências:
  - o texto integral e a imagem anexada à issue foram analisados;
  - a imagem de referência possui um painel escuro à esquerda com os botões de
    tema e logout agrupados dentro dele, enquanto o botão circular com `X` fica
    separado, imediatamente fora da borda direita do painel e sobre o backdrop;
    ela orienta somente posição, agrupamento e relação entre as regiões, não
    cores, pixels ou tokens exatos;
  - [HeroUI — Modal](https://heroui.com/en/docs/react/components/modal);
  - [HeroUI — Drawer](https://heroui.com/en/docs/react/components/drawer);
  - [ReactPlayer v3](https://github.com/cookpete/react-player);
  - [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference);
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/routes/dash.md`;
  - `ui/docs/sdd/routes/global-training-plan-workout.md`.
- Features relacionadas:
  - `FIT-0007` — menu responsivo e drawer da aplicação;
  - `FIT-0019` — tema claro e escuro no menu compartilhado;
  - `FIT-0028` — editor de exercícios e operações de mídia;
  - `FIT-0030` — drafts, fila e recuperação de mutações do editor;
  - `FIT-0044` — imagens privadas e URLs assinadas temporárias;
  - `FIT-0046` — composição visual vigente dos cards e ações do menu.

## Escopo

### Incluído

- ajustar miniaturas dos exercícios YouTube para manterem a altura total do campo
  `Vídeo (ID)`, incluindo label e input, e permanecerem ao lado desse campo em
  qualquer largura;
- sobrepor um ícone de reprodução centralizado à miniatura e transformar toda a
  sua superfície em acionador acessível;
- abrir um `Modal` HeroUI com o vídeo via `react-player`, iniciando a reprodução
  muda somente depois da ação explícita sobre a miniatura;
- adicionar `react-player` como dependência de runtime exclusiva da UI e ajustar a
  CSP com as origens mínimas necessárias ao player do YouTube;
- ajustar a miniatura do exercício `image` para a mesma altura de referência do
  conjunto label + input de `Nome`;
- posicionar, à direita da miniatura de imagem, ações icon-only de substituir e
  remover, com ícones de upload e lixeira e nomes acessíveis;
- abrir um `Modal` HeroUI com `displayUrl` ao acionar a miniatura de imagem;
- substituir o estado sem imagem por uma área pontilhada com ícone de adição,
  acionável por clique, teclado ou drop de arquivo;
- representar upload, substituição e remoção por estados visuais locais com
  spinner, bloqueio de ações, ausência temporária de clique e, quando houver
  imagem, tratamento em preto e branco;
- remover somente o texto visual `Processando imagem…`, preservando anúncio não
  visual e demais feedbacks acessíveis;
- posicionar visualmente `Fechar menu` fora da superfície do drawer móvel, sobre o
  backdrop e junto à borda externa direita, conforme a referência analisada;
- atualizar documentação viva, testes e mocks afetados somente depois de uma ordem
  posterior de implementação.

### Não incluído

- alteração de endpoints, payloads, tipos compartilhados, validação do YouTube,
  processamento de imagem, URLs assinadas, limites de arquivo ou protocolo de
  concorrência;
- upload, hospedagem, edição, download ou substituição de vídeos;
- reprodução de áudio, autoplay antes da abertura do modal ou player persistente
  depois que o modal fechar;
- controles customizados de vídeo, playlist, legendas, velocidade, picture in
  picture ou histórico de reprodução;
- alteração do tamanho ou da geração das variantes `thumbnail` e `display` na API;
- mudança dos botões de tema e logout, de sua ordem, pending ou comportamento;
- mudança do menu persistente de tablet/desktop, do breakpoint de `768px` ou do
  lado pelo qual o drawer móvel abre;
- remoção de backdrop, fechamento por backdrop, `Escape`, navegação ou mudança de
  breakpoint;
- cópia da imagem da issue para `ui/docs/sdd/routes/assets/` ou criação de uma suíte
  de regressão visual;
- redesenho de outras telas ou outros controles do editor.

## Projetos e documentação afetados

- API e endpoints: não se aplica; nenhuma request ou resposta HTTP muda.
- UI e rotas:
  - `ui/package.json` e o lockfile único da raiz para `react-player`;
  - `ui/vercel.json` para a CSP mínima do player YouTube;
  - arquitetura/CSP e catálogo de Analytics em
    `ui/docs/sdd/base/01-arquitetura.md`;
  - regras de composição vigentes em
    `ui/docs/sdd/base/03-componentes-e-estilizacao.md`, somente se a implementação
    consolidar um padrão reutilizável novo;
  - shell e drawer em `ui/docs/sdd/routes/dash.md`;
  - editor e mídia em
    `ui/docs/sdd/routes/global-training-plan-workout.md`;
  - componentes `authenticated-shell`, `image-file-picker` e componentes de mídia
    proprietários do editor.
- Fluxos: atualizar
  `docs/sdd/flows/gestao-planos-treino-globais.md` para incluir seleção por drop e
  visualização de mídia no editor. O fluxo de login não muda, porque posição e
  acionamento do fechamento não alteram a jornada.
- Contratos em `@dall-fit/types`: sem alteração; vídeo usa o `youtubeId` vigente e
  imagem usa `thumbnailUrl`, `displayUrl` e `signedUrlExpiresAt` vigentes.
- Decisões arquiteturais: sem novo ADR; a dependência e as composições são locais e
  reversíveis. As ADRs `0005`, `0006` e `0007` permanecem preservadas.
- Handlers e fixtures MSW: nenhuma nova operação HTTP. Reutilizar as fixtures de
  YouTube e imagem e, quando necessário, ajustar latências determinísticas dos
  cenários de mídia para observar pending, sucesso e falha sem criar contrato de
  produção.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

### RF01 — Miniatura de vídeo responsiva e proporcional

1. Exercícios `youtube-short` e `youtube-long` mantêm a miniatura derivada do valor
   visível de `youtubeId` imediatamente ao lado do campo `Vídeo (ID)` em todos os
   viewports.
2. A altura externa da miniatura deve acompanhar a altura total do campo,
   considerando label e input, sem usar uma altura fixa desconectada do controle.
3. A largura deve resultar da proporção da miniatura, sem deformação. A miniatura
   não cresce para consumir o espaço restante.
4. Em telas pequenas, campo de vídeo e miniatura formam juntos uma linha; o campo
   de vídeo é flexível e recebe o espaço restante. Os demais campos podem ocupar
   linhas próprias conforme necessário.
5. Em telas grandes, nome, conjunto vídeo + miniatura e body area continuam na
   região de identificação; os campos flexíveis recebem o espaço restante e a
   miniatura preserva sua proporção.
6. Nenhuma largura pode causar sobreposição, corte de controles ou scroll
   horizontal.

### RF02 — Abertura e reprodução do vídeo

1. Um ícone Lucide `Play` decorativo fica centralizado sobre a miniatura, com
   contraste perceptível nos dois temas.
2. Toda a superfície visual da miniatura, não apenas o ícone, funciona como um
   único acionador com nome acessível contextual, por exemplo
   `Reproduzir vídeo de <nome do exercício>`.
3. Clique, toque, `Enter` ou `Space` abre um `Modal` HeroUI nomeado e restaura o
   foco ao acionador quando ele fecha.
4. O modal instancia `ReactPlayer` somente enquanto estiver aberto, com uma URL
   YouTube derivada da referência visível, `playing`, `muted` e `playsInline`.
5. A reprodução não começa antes da ação sobre a miniatura. Ao fechar por controle,
   backdrop ou `Escape`, o player é desmontado ou pausado e não continua emitindo
   áudio ou vídeo em segundo plano.
6. O player mantém proporção `16:9`, ocupa a largura disponível do modal e respeita
   o tamanho mínimo suportado quando o viewport permitir. Em viewports menores, o
   modal permanece contido sem scroll horizontal.
7. A demanda não adiciona controles customizados. Falha de carregamento ou vídeo
   indisponível mostra um estado textual acessível no modal e permite fechá-lo, sem
   validar o vídeo por nova request da aplicação.

### RF03 — Composição da imagem e de suas ações

1. Quando `image` existe, a UI usa `thumbnailUrl` na miniatura e preserva
   `referrerPolicy="no-referrer"`.
2. A altura da miniatura segue a mesma referência visual usada em RF01: o conjunto
   label + input de `Nome`. Sua largura respeita a proporção do arquivo e o
   objeto não é deformado.
3. Um ícone Lucide `Eye` decorativo fica centralizado sobre a imagem enquanto ela
   puder ser visualizada.
4. Toda a miniatura é um acionador acessível para ampliar a imagem.
5. À direita ficam dois botões HeroUI icon-only: primeiro `Substituir imagem` com
   ícone `Upload`, depois `Remover imagem` com ícone de lixeira. Nenhum dos dois
   exibe texto visível.
6. Os botões podem ser empilhados, mas a altura total do grupo, incluindo o espaço
   entre eles, nunca ultrapassa a altura da miniatura.
7. Miniatura e ações permanecem lado a lado em qualquer viewport; os outros campos
   do exercício recebem o espaço restante ou mudam para linhas próprias.

### RF04 — Visualização ampliada da imagem

1. Acionar a miniatura abre um `Modal` HeroUI com nome acessível contextual.
2. O modal usa `displayUrl`, nunca `thumbnailUrl`, para oferecer a variante de
   melhor resolução já autorizada pela API.
3. A imagem se ajusta à área disponível preservando sua proporção, sem ampliação
   que corte o conteúdo nem scroll horizontal.
4. O elemento preserva `referrerPolicy="no-referrer"`; a signed URL não é copiada
   para texto, tooltip, Analytics, storage ou outro atributo desnecessário.
5. Controle, backdrop e `Escape` fecham o modal e restauram foco. Falha de leitura
   conserva o mecanismo vigente de renovação/retry e apresenta
   `Imagem indisponível` em vez de uma superfície clicável quebrada.

### RF05 — Área vazia com clique, teclado e drag and drop

1. Quando `image === null`, a região de mídia apresenta uma área pontilhada com
   ícone Lucide `Plus` centralizado e sem simular uma mídia já cadastrada.
2. A área é um único acionador com nome acessível `Enviar imagem de <nome do
exercício>`; clique, toque, `Enter` e `Space` abrem o input file nativo.
3. Um arquivo pode ser arrastado e solto sobre a mesma área. O estado de drag-over
   deve ser perceptível sem depender apenas de cor.
4. Clique e drop convergem na mesma validação preliminar vigente: exatamente um
   arquivo JPEG, PNG ou WebP, até 10 MiB. Arquivo inválido usa o mesmo erro seguro
   e não inicia mutation.
5. O input continua aceitando somente os tipos permitidos, limpa seu valor depois
   da seleção e nunca converte o arquivo para base64.
6. A área não cria request ao receber drag-over; a mutation começa somente no drop
   válido ou na seleção confirmada do arquivo.

### RF06 — Estados transitórios das mutações de imagem

1. Do aceite de um upload sem imagem até seu resultado terminal, a área pontilhada
   fica com aparência desabilitada, não aceita novo clique/drop e substitui o
   `Plus` por `Spinner` centralizado.
2. O texto visual `Processando imagem…` deixa de existir. Um status não visual com
   `aria-live` ou semântica equivalente continua anunciando a operação.
3. Do aceite de uma substituição ou remoção até o resultado terminal:
   - os dois botões de mídia ficam desabilitados;
   - a miniatura fica em preto e branco e mantém suas dimensões;
   - o acionamento da miniatura fica indisponível;
   - o `Eye` é substituído por `Spinner` centralizado, sem deslocamento.
4. O estado começa na intenção aceita, inclusive durante espera na fila do
   aggregate, e termina uma única vez em sucesso, falha, cancelamento, conflito ou
   teardown de sessão.
5. Sucesso aplica a response canônica: upload/substituição mostra a nova miniatura
   e remoção retorna à área pontilhada.
6. Falha, conflito ou timeout conserva a imagem confirmada anterior quando ela
   existia, restaura cor, `Eye`, clique e ações quando permitido e mantém o erro e
   retry vigentes. Não publica arquivo local como mídia confirmada.
7. Bloqueios estruturais, conflito de versão, linha temporária e encerramento de
   sessão continuam prevalecendo sobre a disponibilidade visual dos controles.

### RF07 — URLs assinadas e renovação

1. Thumbnail e display usam somente as URLs temporárias já recebidas no contrato.
2. Renovação dois minutos antes da expiração, retomada de visibilidade, tentativa
   única após falha próxima do prazo e retry manual permanecem vigentes.
3. Refetch troca somente a mídia elegível e não fecha modal, apaga draft, remonta
   linha nem reinicializa a fila. Se a URL exibida em um modal for substituída por
   uma response canônica enquanto ele estiver aberto, o conteúdo passa a usar a
   URL vigente sem persistir a anterior.
4. Signed URLs, parâmetros, pathname e expiração não entram em logs, Analytics,
   storage ou cache persistente da PWA.

### RF08 — Fechamento externo do drawer móvel

1. Em viewport menor que `768px`, o botão circular `Fechar menu` fica visualmente
   fora da superfície do drawer aberto, imediatamente à direita de sua borda e
   próximo ao topo, sobre o backdrop.
2. O botão permanece inteiramente dentro do viewport, não se sobrepõe aos botões de
   tema/logout e não amplia a largura do documento.
3. Tema e logout permanecem juntos dentro do bloco de identidade, na ordem e com
   os estados vigentes.
4. O controle continua sendo o `Drawer.CloseTrigger` HeroUI ou uma composição que
   preserve integralmente sua semântica. Sua ativação não pode ser confundida com
   clique no backdrop e emite razão `close_trigger` uma única vez.
5. Backdrop, `Escape`, navegação e entrada no breakpoint desktop continuam
   fechando o drawer com suas razões atuais. Foco permanece contido enquanto aberto
   e retorna a `Abrir menu` depois do fechamento sem navegação.
6. A mudança é somente da apresentação móvel; `aside`, largura, conteúdo e
   interação do menu persistente não mudam.

### RF09 — Overlays, Analytics e ciclo de vida

1. Modais de vídeo e imagem seguem a composição compound do HeroUI, possuem nome,
   close trigger, contenção e restauração de foco e fechamento por backdrop e
   `Escape`.
2. Abertura de cada preview emite `ui_overlay_opened` com identificadores
   enumerados próprios, sem nome, ID, URL ou tipo livre. Fechamento emite
   `ui_overlay_closed` com a razão enumerada vigente.
3. Upload por clique e por drop compartilha a mesma emissão de operação de mídia e
   produz exatamente um início e um terminal. Transições visuais não geram eventos
   duplicados.
4. Callbacks de player, imagem ou mutation pertencentes a uma geração de sessão
   encerrada não alteram UI, cache, toast ou Analytics.

## Requisitos não funcionais

- Acessibilidade:
  - acionadores de miniatura, upload e botões icon-only possuem nomes contextuais;
  - `Play`, `Eye`, `Plus`, `Upload`, lixeira e spinners não duplicam esses nomes;
  - foco visível, teclado, contenção/restauração de foco e anúncios de pending/erro
    permanecem operáveis;
  - drag and drop é alternativa adicional e nunca substitui input, clique ou
    teclado;
  - preto e branco, opacidade e ícone não são as únicas indicações de pending.
- Performance:
  - `react-player` e o SDK do YouTube não entram no caminho inicial do editor; o
    código do player é carregado sob demanda e instanciado somente no modal aberto;
  - fechar o modal libera player/iframe;
  - pointer move/drag-over não dispara renderizações globais nem requests;
  - nenhuma nova query da API nasce de renderização ou abertura de preview.
- Segurança e privacidade:
  - a CSP adiciona somente as origens exatas necessárias ao script e iframe do
    YouTube, preservando `frame-ancestors 'none'`, `object-src 'none'` e as demais
    diretivas;
  - `Referrer-Policy: strict-origin-when-cross-origin` permanece vigente para
    identificar a origem ao embed sem expor path ou query;
  - IDs de YouTube, nomes, arquivos e signed URLs não entram em telemetria ou
    persistência nova.
- Observabilidade:
  - reutilizar o catálogo sanitizado da UI; não criar logs de conteúdo;
  - erro do player ou da imagem produz estado observável ao usuário e terminal de
    operação quando aplicável, sem stack, URL ou payload.
- Compatibilidade:
  - preservar React `19.2.8`, HeroUI `3.2.2` e Lucide React `1.28.0` instalados;
  - adicionar `react-player` na linha `3.4.x`, compatível com React 19, confirmando
    a API final contra os tipos e o lockfile durante a implementação;
  - usar `src`, `playing`, `muted` e `playsInline` da API v3, sem exemplos da API
    incompatível da v2.

## Critérios de aceite

### Cenário 1 — Miniatura de vídeo em tela larga

- Forma de validar: abrir
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin`
  em `1440x900` com MSW.
- Given: o editor contém exercícios `youtube-short` e `youtube-long`.
- When: a região de identificação é renderizada.
- Then: cada miniatura fica ao lado de `Vídeo (ID)`, tem a altura conjunta de label
  e input, preserva proporção e deixa os campos flexíveis ocuparem o restante, sem
  deformação nem scroll horizontal.

### Cenário 2 — Miniatura de vídeo em tela pequena

- Forma de validar: repetir o cenário 1 em `390x844`.
- Given: os mesmos vídeos estão carregados.
- When: o card se adapta ao viewport.
- Then: `Vídeo (ID)` e miniatura permanecem lado a lado, o campo recebe o espaço
  restante, os demais campos quebram de linha e nenhum controle é cortado.

### Cenário 3 — Reprodução muda no modal

- Forma de validar: teste de componente com `ReactPlayer` isolado e smoke manual no
  link do cenário 1; o smoke real é necessário porque os testes não dependem da
  rede ou do SDK externo do YouTube.
- Given: uma miniatura possui ícone `Play` e referência de vídeo utilizável.
- When: a pessoa ativa qualquer ponto da miniatura.
- Then: abre modal nomeado, instancia o player com `playing`, `muted` e
  `playsInline`, inicia sem áudio e, ao fechar, interrompe a reprodução e restaura
  o foco.

### Cenário 4 — Imagem existente e ampliação

- Forma de validar: link do cenário 1 com a fixture que contém exercício `image`.
- Given: o contrato possui `thumbnailUrl` e `displayUrl` válidas.
- When: a pessoa observa e ativa qualquer ponto da miniatura.
- Then: thumbnail, `Eye` e botões icon-only ficam lado a lado dentro da altura de
  referência; o modal abre a `displayUrl` proporcionalmente e fecha com foco
  restaurado.

### Cenário 5 — Upload por clique e por drop

- Forma de validar: usar o cenário `empty-workout` ou uma fixture `image:null` no
  link do cenário 1.
- Given: a área pontilhada com `Plus` está habilitada.
- When: a pessoa escolhe um JPEG pelo input e, em repetição isolada, solta um PNG
  válido sobre a área.
- Then: ambos usam a mesma validação e mutation, sem base64; o pending desabilita a
  área, troca `Plus` por spinner, não mostra `Processando imagem…` visualmente e o
  sucesso mostra a mídia canônica.

### Cenário 6 — Drop inválido não inicia upload

- Forma de validar: teste de componente do `ImageFilePicker`.
- Given: a área vazia está disponível.
- When: a pessoa solta múltiplos arquivos, tipo não permitido ou arquivo acima de
  10 MiB.
- Then: nenhuma mutation começa, o mesmo erro seguro da seleção por input é
  apresentado e a área volta ao estado habilitado.

### Cenário 7 — Substituição e remoção pendentes

- Forma de validar: link do cenário 1 com latência MSW determinística nas mutações
  de imagem.
- Given: há imagem confirmada e ações disponíveis.
- When: a pessoa substitui e, em repetição isolada, remove a imagem.
- Then: botões ficam bloqueados, imagem fica em preto e branco, clique é removido e
  spinner substitui `Eye` sem deslocamento; sucesso aplica a response canônica e
  remoção conclui na área pontilhada.

### Cenário 8 — Falha preserva a imagem anterior

- Forma de validar: acrescentar `mockTrainingPlans=image-error` ao link do cenário 1.
- Given: uma imagem confirmada entra em substituição ou remoção.
- When: a mutation termina em erro.
- Then: a imagem anterior permanece, cor e `Eye` retornam, controles aplicáveis são
  reabilitados e erro/retry continuam acessíveis sem promover arquivo local.

### Cenário 9 — URL assinada expirada

- Forma de validar: acrescentar
  `mockTrainingPlans=image-signed-url-expired` ao link do cenário 1.
- Given: thumbnail ou display falha perto da expiração.
- When: ocorre a renovação única vigente.
- Then: a URL renovada substitui a anterior sem perder drafts ou estado do modal;
  falha persistente mostra `Imagem indisponível` e retry, sem loop.

### Cenário 10 — Fechar drawer fora do painel

- Forma de validar: abrir `http://localhost:3000/dash` com MSW em `390x844` e
  ativar `Abrir menu`.
- Given: drawer, backdrop e menu compartilhado estão visíveis.
- When: a pessoa compara a composição com a referência e ativa `Fechar menu`.
- Then: tema/logout ficam dentro do painel e o `X` circular fica separado fora da
  borda direita sobre o backdrop, sem sobreposição ou overflow; a ativação fecha
  com razão `close_trigger` e devolve foco a `Abrir menu`.

### Cenário 11 — Fechamentos alternativos e teclado

- Forma de validar: mesmo link e viewport do cenário 10.
- Given: o drawer está aberto e o foco contido.
- When: a pessoa fecha separadamente por `Escape`, backdrop, navegação e mudança
  para `768px`.
- Then: cada caminho continua funcionando com a razão correta, sem clique duplo,
  foco residual, overlay órfão ou reabertura ao retornar ao viewport móvel.

### Cenário 12 — CSP permite somente o embed esperado

- Forma de validar: build, inspeção do header em `ui/vercel.json` e smoke no preview
  publicado.
- Given: a CSP atual bloqueia frames por `default-src 'self'` e a feature usa o
  IFrame Player API.
- When: o modal abre um vídeo válido.
- Then: script e iframe do YouTube necessários ao `react-player` carregam pelas
  origens exatas autorizadas; outras origens de frame continuam bloqueadas e
  `frame-ancestors 'none'` permanece vigente.

## Estratégia de entrega e compatibilidade

1. Adicionar `react-player@^3.4.0` somente em `ui/package.json` e atualizar o
   lockfile da raiz; confirmar peer dependencies e tipos contra React 19 local.
2. Criar a composição route-specific de preview de vídeo/imagem com `Modal`
   HeroUI e carregar o player sob demanda, sem mover regra de domínio para `core`.
3. Evoluir `ImageFilePicker` preservando seu input nativo, validação e contrato de
   erro; consolidar seleção e drop em um único caminho.
4. Reorganizar a região de mídia e suas variantes em `styles.ts` com `tv`, sem
   classes Tailwind ou estilos inline no JSX de composição.
5. Ajustar o close trigger dentro da composição HeroUI e deslocá-lo somente de
   forma visual para fora do painel, mantendo contexto, foco e eventos do drawer.
6. Atualizar a CSP com a menor allowlist confirmada pelo player real; não usar
   wildcard de YouTube nem relaxar `default-src`, `object-src` ou
   `frame-ancestors`.
7. Atualizar SDDs vivos, Analytics, testes e cenários MSW afetados na mesma
   implementação e remover código/imports que ficarem sem uso.
8. Não há migração de dados, rollout de API ou compatibilidade de payload a
   coordenar.

## Plano de testes

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

- Unitários e componentes da UI:
  - proporção e composição pública das regiões de vídeo e imagem;
  - acionamento integral da miniatura, nomes acessíveis e foco dos modais;
  - props v3 do `ReactPlayer`, montagem apenas aberto e cleanup ao fechar;
  - uso separado de `thumbnailUrl` e `displayUrl` e preservação de
    `referrerPolicy`;
  - input, teclado, drag-over, drop válido e matriz de arquivos inválidos;
  - estados de upload, substituição, remoção, falha, conflito e teardown;
  - ausência visual de `Processando imagem…` com anúncio acessível preservado;
  - close trigger externo sem confundir clique com backdrop;
  - emissões únicas e sanitizadas de overlay e operação.
- Playwright com Vite, Chromium e MSW Browser:
  - layouts das miniaturas e ações em `1440x900` e `390x844`;
  - modal de imagem, upload por clique/drop e transições com latência/falha;
  - URL expirada e renovação sem perda de drafts;
  - drawer móvel com close externo, backdrop, `Escape`, foco e breakpoint;
  - o player YouTube real não será dependência da suíte: integração e props ficam
    em Vitest e o embed real recebe smoke manual em preview.
- Configuração:
  - teste/inspeção da CSP garantindo origens exatas do YouTube e permanência das
    diretivas defensivas;
  - build confirma code splitting e compatibilidade do pacote.
- Regressão:
  - fila FIFO, versão, bloqueio por conflito, rollback de imagem, renovação de URL,
    logout, tema e proteção de navegação permanecem aprovados.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`.
- `pnpm -C api test:e2e` não é exigido enquanto a implementação não mudar endpoint,
  wiring, MongoDB ou Redis.

## Riscos e decisões

- Autoplay pode ser restringido pelo navegador. A ação explícita de abrir o modal,
  `muted` e `playsInline` reduzem o risco; falha ainda precisa produzir estado
  acessível e não pode deixar modal vazio.
- `react-player` v3 não é compatível com exemplos da v2. A implementação deve usar
  `src` e validar tipos locais, sem copiar APIs antigas como `url`.
- O player YouTube exige script e iframe externos, enquanto a CSP atual permite
  somente scripts e frames próprios por fallback. A allowlist será exata e testada;
  um wildcard ampliaria desnecessariamente a superfície de conteúdo executável.
- Testes integrados não devem depender da disponibilidade do YouTube. As props e o
  ciclo do player serão validados com isolamento em Vitest, e o embed real terá
  smoke manual em ambiente publicado com CSP efetiva.
- A altura igual ao campo depende da composição, não de um número mágico. Alterar
  tamanho, densidade ou label do campo deve manter a relação sem sincronização por
  JavaScript ou medição contínua do DOM.
- Miniatura, botão e drop zone não podem gerar controles interativos aninhados. A
  semântica deve resultar em um único acionador por superfície e ações irmãs.
- Signed URLs podem expirar com modal aberto. Atualizar para a URL canônica vigente
  preserva a visualização sem persistir a capacidade antiga.
- Desabilitar apenas por CSS permitiria clique, drop ou foco durante mutation. O
  bloqueio precisa existir também no contrato interativo e acessível.
- O close trigger continua semanticamente dentro do diálogo mesmo quando aparece
  fora da superfície. Removê-lo do contexto do Drawer arriscaria contenção de foco,
  restauração e classificação do fechamento.
- A imagem da issue é direcional e representa somente o menu móvel. Tokens e
  dimensões exatos continuam pertencendo ao design system e aos estilos vigentes.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- `react-player` restrito à UI e carregado sob demanda
- CSP mínima para o embed YouTube sem relaxar diretivas defensivas
- URLs assinadas e privacidade preservadas
- Interações de mouse, toque, teclado, drop e foco acessíveis
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz aprovados
