# Feature Spec: Responsividade do aviso de atualização da PWA

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0021`](https://github.com/eduardodallmann/dall-fit/issues/21).
- Problema: o aviso global `Nova versão disponível` foi composto para manter
  indicador, texto e duas ações na mesma linha. Quando o Dall Fit instalado é
  aberto em um celular, o espaço horizontal não comporta adequadamente todas as
  partes e a mensagem deixa de se adaptar ao viewport, como registrado na captura
  da issue.
- Resultado: o aviso continua fixo, não bloqueante e funcional em qualquer rota,
  mas reorganiza conteúdo e ações em viewports estreitos. Título, descrição e os
  textos completos de ambos os botões permanecem visíveis, sem corte, sobreposição
  ou rolagem horizontal; em larguras maiores, a apresentação compacta atual pode
  continuar horizontal.
- Referências:
  - `docs/sdd/features/fit-0011-instalacao-pwa.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/routes/root.md`;
  - `ui/docs/sdd/routes/dash.md`;
  - [Alert do HeroUI](https://heroui.com/en/docs/react/components/alert).
- Features relacionadas:
  - `FIT-0011` — introduziu o aviso global, a atualização por confirmação e o
    adiamento no documento atual;
  - `FIT-0012` — corrigiu outro estado visual da PWA e deve permanecer inalterada.

## Escopo

### Incluído

- tornar responsiva a composição do componente global `pwa-update-notice`;
- reorganizar as ações abaixo do conteúdo textual em viewports estreitos, sem
  retirar o indicador semântico do aviso;
- permitir que as ações ocupem e se distribuam dentro da largura disponível sem
  cortar seus textos;
- manter a composição horizontal e compacta quando houver espaço suficiente;
- preservar os espaçamentos laterais que mantêm o aviso dentro do viewport;
- validar as larguras móveis de `320px`, `360px` e `390px`, além do breakpoint em
  que a composição volta a ser horizontal;
- preservar semântica, foco, teclado, região viva e estados pendente/desabilitado;
- cobrir a composição e as interações do componente proporcionalmente ao risco;
- atualizar a documentação viva das rotas `/` e `/dash` durante a implementação.

### Não incluído

- mudar os textos `Nova versão disponível`,
  `Atualize para usar a versão mais recente.`, `Atualizar agora` ou `Agora não`;
- mudar quando o aviso aparece, é dispensado ou volta a ser oferecido;
- alterar ativação, registro, cache ou ciclo de vida do Service Worker;
- alterar manifesto, assets PWA, instalação, prompt nativo ou orientação manual;
- transformar o aviso em modal, toast ou elemento exclusivo de uma rota;
- introduzir animação, temporizador, fechamento automático ou persistência do
  adiamento;
- criar referência visual em `ui/docs/sdd/routes/assets/`;
- alterar API, autenticação, endpoints, contratos compartilhados, MSW ou dados
  persistidos;
- adicionar dependência ou componente visual que duplique `Alert` ou `Button` do
  HeroUI.

## Projetos e documentação afetados

- API e endpoints: não se aplica — a correção é exclusivamente visual e local à
  UI, sem tráfego HTTP novo ou alterado.
- UI e rotas:
  - `ui/src/core/components/pwa-update-notice/` ajusta somente composição e estilos
    responsivos do aviso global;
  - os testes do componente preservam o contrato funcional de confirmação e
    adiamento;
  - `ui/docs/sdd/routes/root.md` e `ui/docs/sdd/routes/dash.md` passam a descrever a
    composição responsiva observável do aviso durante a implementação;
  - `ui/docs/sdd/base/` permanece inalterado, salvo se a implementação revelar uma
    regra transversal nova que não esteja coberta pelos padrões vigentes.
- Fluxos: não se aplica — login, navegação, ordem das etapas e dados preservados
  não mudam.
- Contratos em `@dall-fit/types`: não se aplica — não há contrato compartilhado.
- Decisões arquiteturais: não exige ADR; é uma correção local, reversível e feita
  com o design system e a infraestrutura atuais.
- Handlers e fixtures MSW: não se aplica — nenhuma request é criada ou alterada.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

1. O aviso continua ausente quando `needRefresh` for falso e visível quando uma
   nova versão estiver em espera.
2. O aviso permanece global, fixado próximo à borda inferior e limitado à largura
   do viewport e à largura máxima já adotada em telas maiores.
3. Em viewports menores que o breakpoint responsivo escolhido pela implementação,
   a composição deve:
   - manter indicador, título e descrição legíveis no início do aviso;
   - posicionar a área de ações abaixo do conteúdo textual;
   - conter integralmente `Atualizar agora` e `Agora não` dentro do aviso;
   - permitir que as ações quebrem ou ocupem linhas próprias quando a largura
     disponível exigir;
   - não provocar overflow horizontal no aviso nem no documento.
4. Em viewports a partir do breakpoint escolhido, conteúdo e ações podem voltar à
   disposição horizontal, desde que permaneçam íntegros e sem sobreposição.
5. A transição entre as composições ocorre somente por CSS responsivo; redimensionar
   o viewport não reinicia, dispensa nem confirma a atualização.
6. `Atualizar agora` continua chamando a atualização uma única vez por ativação e
   apresenta o estado pendente vigente sem mudar seu nome acessível.
7. Enquanto a atualização estiver pendente, `Agora não` continua desabilitado e
   nenhuma das duas ações pode ser ativada concorrentemente.
8. `Agora não` continua dispensando o aviso somente no documento atual, sem chamar
   a ativação do Service Worker ou recarregar a página.
9. A correção vale igualmente na rota pública `/`, na rota autenticada `/dash` e
   nas demais rotas envolvidas pelos providers globais.
10. Falhas de atualização continuam não bloqueantes, não expõem detalhes técnicos
    e não alteram a composição responsiva esperada.

## Requisitos não funcionais

- Acessibilidade:
  - preservar `role="status"`, a região viva polida, o título e a descrição do
    `Alert` HeroUI;
  - manter ordem de leitura coerente: mensagem antes das ações;
  - manter ordem de foco `Atualizar agora` seguida de `Agora não` em todas as
    larguras;
  - preservar labels visíveis completos, foco perceptível e operação por teclado;
  - nenhuma mudança responsiva move o foco automaticamente.
- Performance: usar somente composição e estilos responsivos locais, sem listener
  de resize, medição de DOM ou renderização JavaScript baseada em viewport.
- Segurança e privacidade: não persistir nem transmitir estado adicional e não
  incluir dado pessoal no aviso ou nos testes.
- Observabilidade: não adicionar `console.*`, analytics, telemetria ou logging.
- Componentização e estilo:
  - preservar `Alert` e `Button` de `@heroui/react` e sua semântica;
  - manter JSX e comportamento em `index.tsx` e toda apresentação própria em
    `styles.ts`;
  - usar `tv` de `@heroui/styles`, sem classes Tailwind literais ou estilos inline
    no JSX;
  - não duplicar o componente nem renderizar cópias alternativas exclusivas para
    mobile e desktop.

## Critérios de aceite

### Cenário 1 — Exibir o aviso em celular estreito

- Forma de validar: preview de duas versões consecutivas do build, com uma nova
  versão do Service Worker em espera, nos viewports `320x568`, `360x800` e
  `390x844`. Não há link local isolado que fabrique esse estado do Service Worker.
- Given: o Dall Fit está aberto em um celular e uma nova versão está em espera.
- When: o aviso global é exibido.
- Then: indicador, título, descrição e os dois botões ficam integralmente dentro do
  viewport e do aviso.
- And: as ações aparecem abaixo do conteúdo textual sem corte, sobreposição ou
  rolagem horizontal no documento.

### Cenário 2 — Preservar a composição compacta em largura suficiente

- Forma de validar: mesmo preview controlado, em viewport `768x1024` ou maior.
- Given: uma nova versão está em espera e existe espaço horizontal suficiente.
- When: o aviso global é exibido.
- Then: conteúdo e ações podem permanecer na mesma linha, respeitando a largura
  máxima do aviso, sem espaços excessivos, corte ou sobreposição.

### Cenário 3 — Redimensionar sem alterar o estado da atualização

- Forma de validar: conferência manual no preview controlado, alternando entre
  `390px` e `768px` de largura sem recarregar o documento.
- Given: o aviso está visível e nenhuma ação foi ativada.
- When: o viewport atravessa o breakpoint responsivo nos dois sentidos.
- Then: somente a disposição visual muda; o aviso permanece visível e nenhuma
  atualização, dispensa ou reload é executado.

### Cenário 4 — Confirmar a atualização em layout móvel

- Forma de validar: teste Vitest do componente para a interação e conferência
  manual no preview em `360x800` para o layout.
- Given: o aviso responsivo está visível em viewport móvel.
- When: a pessoa ativa `Atualizar agora`.
- Then: a atualização é solicitada uma única vez, o botão apresenta progresso e
  `Agora não` fica indisponível durante a operação.
- And: os controles continuam contidos no aviso enquanto o estado pendente estiver
  visível.

### Cenário 5 — Adiar a atualização em layout móvel

- Forma de validar: teste Vitest do componente para a interação e conferência
  manual no preview em `360x800` para o layout.
- Given: o aviso responsivo está visível e nenhuma atualização está pendente.
- When: a pessoa ativa `Agora não` por ponteiro ou teclado.
- Then: o aviso é dispensado no documento atual sem solicitar ativação nem
  recarregar a página.

## Estratégia de entrega e compatibilidade

1. Ajustar a composição do componente existente com a API pública do HeroUI e os
   estilos tipados já adotados pelo projeto.
2. Usar um breakpoint responsivo coerente com o conteúdo real e os breakpoints do
   design system, mantendo mobile como composição base.
3. Preservar todas as chamadas e estados do contexto PWA; a mudança não deve
   alcançar o provider ou o Service Worker se os testes confirmarem que o defeito
   é exclusivamente de layout.
4. Atualizar as rotas vivas somente junto da implementação autorizada.
5. Manter compatibilidade com navegador comum, modo `standalone`, Chromium Android,
   iOS/iPadOS e desktop, sem depender de API específica de plataforma para o
   layout.
6. Revisar `api/` e `ui/` por código sem uso ao final da implementação.

## Plano de testes

- Unitários e componentes da UI:
  - preservar a ausência do aviso quando não há nova versão;
  - preservar conteúdo, ordem acessível e ações quando o aviso está visível;
  - comprovar confirmação, estado pendente, bloqueio de adiamento concorrente e
    dispensa;
  - não testar nomes de classes nem detalhes internos da função de estilos.
- Responsividade manual no browser:
  - publicar duas versões locais consecutivas para produzir um worker em espera;
  - conferir `320x568`, `360x800`, `390x844`, `768x1024` e uma largura desktop;
  - confirmar ausência de overflow horizontal, corte e sobreposição;
  - conferir a transição visual nos dois sentidos do breakpoint;
  - repetir pelo menos uma validação em modo `standalone` de celular quando houver
    dispositivo ou emulação compatível disponível.
- Playwright: executar a suíte vigente para regressão; não criar seletor de
  produção nem habilitar o Service Worker da PWA no Vite usado pelo Playwright
  apenas para fabricar este estado.
- MSW e API: nenhum handler, fixture ou teste novo; a demanda não atravessa a
  fronteira HTTP.
- Documentação e layout:
  - atualizar `ui/docs/sdd/routes/root.md` e `ui/docs/sdd/routes/dash.md` na
    implementação;
  - não criar nem validar screenshots do SDD, pois não existem referências em
    `ui/docs/sdd/routes/assets/root/` ou `ui/docs/sdd/routes/assets/dash/`.
- Quality gates após a implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`;
  - `pnpm -C api test:e2e` não é exigido especificamente, pois endpoint, wiring,
    MongoDB e Redis não mudam.

## Riscos e decisões

- Apenas permitir quebra no bloco atual pode manter indicador, conteúdo e ações
  competindo na mesma linha. A decisão é definir explicitamente uma composição
  mobile com ações abaixo da mensagem.
- Fixar larguras ou reduzir textos resolveria somente alguns aparelhos e poderia
  prejudicar zoom, fonte ampliada e tradução futura. A decisão é permitir que o
  conteúdo determine a altura e use a largura disponível.
- Medir o viewport em JavaScript duplicaria a responsabilidade do CSS e criaria
  estados de renderização desnecessários. A decisão é usar responsividade CSS.
- Duplicar botões para mobile e desktop poderia gerar duas ações na árvore de
  acessibilidade e aumentar o risco de divergência. A decisão é manter uma única
  instância de cada controle e reorganizá-las por layout.
- JSDOM não calcula geometria. Os testes de componente protegem comportamento e
  semântica; a regressão de layout é validada no browser com o estado real de um
  Service Worker em espera.
- O Playwright vigente usa MSW Browser e mantém a PWA desabilitada para evitar
  disputa entre Service Workers. A decisão é não romper essa separação por uma
  correção visual local.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Aviso contido e legível em `320px`, `360px` e `390px`
- Ações abaixo do conteúdo em viewports estreitos e composição compacta em larguras
  suficientes
- Nenhum overflow horizontal, corte ou sobreposição
- Confirmação, progresso, bloqueio concorrente e adiamento preservados
- Semântica, teclado, foco e região viva preservados
- Service Worker, provider PWA, instalação, API, contratos e MSW preservados
- Documentação viva de `/` e `/dash` atualizada na implementação
- Nenhuma referência visual criada sem solicitação
- Revisão de código sem uso concluída em `api/` e `ui/`
- Quality gates da raiz e Playwright aprovados
