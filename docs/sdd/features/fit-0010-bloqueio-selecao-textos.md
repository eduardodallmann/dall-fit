# Feature Spec: Bloqueio global da seleção de textos

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0010` — issue
  [#10](https://github.com/eduardodallmann/dall-fit/issues/10).
- Problema: textos de títulos, descrições, menus, tabelas, botões e demais regiões
  não editáveis podem ser selecionados acidentalmente por arraste, clique múltiplo,
  gesto de toque ou seleção do documento. Esse comportamento destoa da experiência
  de aplicação instalada desejada para o Dall Fit.
- Resultado: nenhuma região não editável da UI permite destacar texto. Campos e
  superfícies nas quais o usuário insere ou edita texto continuam permitindo
  posicionar o cursor, selecionar parte ou todo o valor e usar as operações nativas
  de edição.
- Referências:
  - `ui/src/index.css`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/base/07-testes-integrados-playwright.md`;
  - documentos vigentes em `ui/docs/sdd/routes/`.
- Features relacionadas:
  - `FIT-0001` — introduziu a UI pública e autenticada;
  - `FIT-0005` — introduziu tabelas, formulários e overlays administrativos;
  - `FIT-0007` — introduziu o shell e o menu da aplicação;
  - `FIT-0011` — introduziu a experiência PWA, inclusive em modo `standalone`.

## Escopo

### Incluído

- política global de seleção aplicada a todo o documento da UI;
- cobertura de conteúdo renderizado dentro da árvore React e de overlays
  adicionados ao `body` por portal;
- bloqueio em textos não editáveis, incluindo headings, parágrafos, labels, links,
  botões, breadcrumbs, itens de menu, tabelas, alerts, dialogs, toasts, skeletons e
  empty states;
- preservação da seleção nativa em `input` com superfície textual, `textarea` e
  elementos efetivamente editáveis por `contenteditable`;
- suporte às superfícies editáveis compostas pelo HeroUI e a seus descendentes;
- funcionamento equivalente no Vite local, build web, PWA instalada e layouts
  responsivos;
- testes de navegador proporcionais ao comportamento real de seleção;
- atualização, na fase de implementação, da base viva de componentes e
  estilização da UI para registrar a política transversal.

### Não incluído

- bloquear foco, clique, pressionamento, hover, navegação, abertura de menu,
  rolagem, zoom ou gestos próprios de componentes;
- impedir seleção de valor dentro de campos textuais;
- desabilitar atalhos de edição ou clipboard dentro de superfícies editáveis;
- interceptar `selectstart`, `mousedown`, `pointerdown`, `touchstart`,
  `copy` ou menu de contexto com JavaScript;
- impedir programaticamente que código autorizado copie ou leia conteúdo;
- bloquear arraste de imagens, links ou outros elementos quando esse comportamento
  não for consequência da seleção de texto;
- alterar textos, layout, temas, breakpoints, navegação, contratos HTTP ou regras
  de negócio;
- criar novos componentes, endpoints, tipos compartilhados, handlers MSW,
  fixtures ou cenários de API;
- permitir opt-in genérico para selecionar textos de conteúdo não editável;
- adicionar screenshots ou regressão visual, pois a demanda muda interação e não
  layout.

## Projetos e documentação afetados

- API e endpoints: não se aplica; não há mudança de transporte ou backend.
- UI e rotas:
  - regra declarativa global em `ui/src/index.css`, sem repetição por componente
    ou rota;
  - atualização de
    `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - os documentos de rota permanecem sem duplicar a política transversal, salvo se
    a implementação descobrir uma exceção funcional proprietária de uma tela.
- Fluxos: não há mudança na ordem, navegação ou dados das jornadas vigentes.
- Contratos em `@dall-fit/types`: não se aplica.
- Decisões arquiteturais: não exige ADR; é uma política visual local, reversível e
  sem nova dependência.
- Handlers e fixtures MSW: não se aplica; os cenários vigentes apenas fornecem
  conteúdo para a validação no browser.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

1. O texto de qualquer elemento não editável deve permanecer sem seleção visível
   após arraste do ponteiro, clique duplo ou triplo, gesto de toque suportado pelo
   navegador ou tentativa de selecionar o documento.
2. A regra deve abranger todos os descendentes do documento, inclusive conteúdo
   montado por portal fora do container principal da aplicação.
3. A regra deve ser declarativa e global. Componentes e rotas não repetem classes
   de bloqueio, e um novo elemento não editável nasce protegido por padrão.
4. A exceção deve ser limitada a superfícies de entrada de texto:
   - `input` cujo controle nativo apresente valor textual editável ou
     selecionável;
   - `textarea`;
   - elemento para o qual o navegador considere `isContentEditable === true`,
     incluindo `contenteditable="true"`, `contenteditable="plaintext-only"` e
     seus descendentes editáveis.
5. Dentro dessas superfícies, o usuário deve continuar podendo:
   - posicionar o caret;
   - selecionar por ponteiro, toque ou teclado;
   - usar `Ctrl+A` ou equivalente enquanto o campo estiver focado;
   - substituir, recortar e copiar o trecho selecionado conforme o comportamento
     nativo do navegador.
6. Controles sem superfície textual, como checkbox, radio, switch, range, color e
   botões implementados com `input`, não ganham uma exceção observável de seleção.
7. Labels, placeholders renderizados fora da área editável, mensagens de ajuda e
   erro, contadores e adornos de campos continuam não selecionáveis. O valor dentro
   da superfície de edição continua selecionável.
8. `readonly` não transforma o restante da aplicação em selecionável. Quando o
   navegador expuser um valor textual dentro de um `input` ou `textarea`, esse
   valor continua selecionável para consulta e cópia; `disabled` preserva o
   comportamento nativo do controle.
9. Abrir Modal, AlertDialog, Dropdown, Toast ou menu móvel não altera a política:
   seu texto estrutural permanece bloqueado, enquanto campos textuais existentes no
   overlay preservam seleção.
10. A seleção programática não deve ser usada como mecanismo de implementação nem
    ser cancelada por listeners globais. O comportamento é controlado por CSS,
    incluindo compatibilidade necessária para navegadores suportados.
11. A mudança não deve alterar o cursor visual globalmente nem impedir que links,
    botões e demais componentes revelem sua affordance vigente.
12. A regra deve funcionar igualmente no modo web responsivo e quando a aplicação
    estiver instalada como PWA.

## Requisitos não funcionais

- Acessibilidade:
  - foco visível, ordem de tabulação, nomes acessíveis, leitura por tecnologia
    assistiva e ativação por teclado permanecem inalterados;
  - superfícies editáveis preservam seleção e operações nativas de texto;
  - nenhum listener global deve cancelar eventos de teclado, ponteiro ou toque;
  - a regra não usa cor, conteúdo oculto ou mudança semântica para comunicar estado.
- Performance:
  - a solução não adiciona listeners globais, estado React, observer, re-render,
    dependência ou processamento por rota;
  - a política deve ser resolvida pela cascata CSS carregada no bootstrap.
- Segurança e privacidade:
  - o bloqueio é somente uma restrição de interação visual e não é mecanismo de
    proteção contra leitura, cópia, inspeção ou extração de dados;
  - nenhum dado passa a ser registrado, persistido ou enviado.
- Observabilidade:
  - não se aplica logging em runtime; falha de seleção é comportamento puramente
    local e coberto por teste de navegador.

## Critérios de aceite

### Cenário 1 — Conteúdo público não pode ser selecionado

- Forma de validar: `http://localhost:3000/`.
- Given: a tela pública foi renderizada
- When: o usuário arrasta sobre heading, descrição e texto do botão ou usa clique
  múltiplo
- Then: nenhum trecho de texto não editável fica destacado e as ações continuam
  clicáveis

### Cenário 2 — Shell autenticado permanece interativo sem seleção

- Forma de validar: `http://localhost:3000/dash`.
- Given: a pessoa autenticada visualiza shell, menu e conteúdo da dashboard
- When: tenta selecionar textos da navegação e do conteúdo
- Then: nenhum texto estrutural é selecionado
- And: links, menu responsivo, foco e navegação continuam funcionando

### Cenário 3 — Tabela e overlays administrativos respeitam a regra

- Forma de validar:
  `http://localhost:3000/global/training-plan?mockAuth=admin`.
- Given: a listagem administrativa está carregada
- When: o usuário tenta selecionar breadcrumb, título, cabeçalhos, células,
  dropdown, dialog, modal ou toast
- Then: os textos não editáveis permanecem sem destaque, inclusive quando o
  conteúdo foi montado por portal

### Cenário 4 — Campo textual preserva seleção

- Forma de validar: abrir `Novo plano` em
  `http://localhost:3000/global/training-plan?mockAuth=admin`.
- Given: o modal contém nome e descrição preenchidos
- When: o usuário seleciona parte do valor por ponteiro e seleciona todo o valor
  com o atalho nativo enquanto cada campo está focado
- Then: `input` e `textarea` expõem intervalos de seleção válidos e continuam
  aceitando edição, cópia, recorte e substituição

### Cenário 5 — Edição inline mantém limite entre campo e estrutura

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001?mockAuth=admin`.
- Given: o usuário ativa a edição inline do plano
- When: seleciona o valor do nome ou da descrição e depois tenta selecionar label,
  breadcrumb e ações adjacentes
- Then: somente o conteúdo das superfícies textuais fica selecionável
- And: salvar e cancelar continuam acionáveis por ponteiro e teclado

### Cenário 6 — Selecionar o documento não cria destaque estrutural

- Forma de validar: qualquer uma das URLs anteriores, com o foco fora de um campo
  textual.
- Given: nenhum elemento editável está focado
- When: o usuário executa a ação nativa de selecionar tudo ou arrasta através de
  regiões e componentes diferentes
- Then: a UI não apresenta seleção de texto
- And: ao repetir a ação com um campo textual focado, a seleção fica restrita ao
  valor desse campo

## Estratégia de entrega e compatibilidade

A implementação será uma alteração aditiva de política visual no CSS global. O
bloqueio será o padrão explícito de todos os elementos do documento e as exceções
editáveis serão mais específicas e declaradas depois dele na cascata. A solução
deve considerar os seletores necessários para descendentes de `contenteditable`
e o prefixo de compatibilidade quando exigido pelos navegadores suportados.

Não haverá migração de dados, rollout de backend, feature flag ou nova dependência.
Componentes e documentos de rota não repetirão a regra. Se um conteúdo futuro
precisar ser copiável sem ser editável, isso será uma nova decisão de produto e não
uma exceção silenciosa criada nesta entrega.

## Plano de testes

- Playwright no Chromium real para arrastar sobre texto não editável e confirmar
  que `window.getSelection()` não contém trecho selecionado;
- Playwright para preencher `input` e `textarea`, criar seleção por interação
  real e validar `selectionStart`/`selectionEnd`;
- Playwright para `Ctrl+A` fora e dentro de campo textual;
- cenário público, shell autenticado e tela administrativa para cobrir árvore
  normal, layout responsivo e portal do HeroUI;
- verificação de que links, botões, modal, menu, salvar e cancelar continuam
  acionáveis;
- teste focado da cascata para uma superfície `contenteditable` somente se houver
  consumidor real ou harness já adequado; não introduzir componente de produção
  apenas para testar seletor futuro;
- executar `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`,
  `pnpm test:integration` e `pnpm build`.

## Riscos e decisões

- `user-select: none` não protege conteúdo: o texto continua disponível no DOM,
  para leitores de tela, ferramentas de desenvolvedor e código.
- Aplicar a regra apenas no container React deixaria portais fora do contrato; por
  isso a fronteira é o documento completo.
- Usar listeners para cancelar seleção pode interferir em campos, toque, drag,
  componentes HeroUI e acessibilidade; a decisão é usar somente CSS.
- Liberar seleção por classe opt-in genérica tornaria o requisito permissivo e
  sujeito a divergência. As únicas exceções automáticas são superfícies realmente
  textuais ou editáveis.
- A propriedade CSS e o comportamento de seleção de controles possuem diferenças
  entre engines. A implementação deve incluir compatibilidade declarativa sem
  alterar eventos nativos.
- Bloquear seleção pode reduzir a capacidade de copiar mensagens, descrições ou
  outros textos de leitura. Isso é uma consequência intencional da issue; uma
  necessidade futura de cópia fora de campos exige nova feature.
- Testes JSDOM não reproduzem seleção nativa com fidelidade. A validação principal
  pertence ao Playwright, sem testes artificiais apenas para elevar cobertura.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Política transversal registrada no SDD vivo da UI
- Bloqueio aplicado ao documento e aos portais sem repetição por rota
- Seleção e edição nativas preservadas em superfícies textuais
- Nenhuma mudança em API, contratos compartilhados, MSW ou dados
- Interações, foco, teclado, navegação e layout vigentes preservados
- Nenhuma dependência ou listener global introduzido
- Quality gates da raiz e testes integrados da UI aprovados
