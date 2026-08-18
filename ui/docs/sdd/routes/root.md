# Rota `/`

## Objetivo funcional

- Problema resolvido: oferecer uma entrada pública para autenticação.
- Ator: qualquer visitante, com ou sem sessão.
- Resultado esperado: apresentar o Dall Fit e iniciar o login Google.
- Fluxos relacionados: `../../../../docs/sdd/flows/login-google.md`.

## Entradas e pré-condições

- Como o usuário chega: URL direta ou redirecionamento após sessão/callback inválido.
- Path e query params: `/`; query opcional `authError=oauth_failed` e `mockAuth`
  (desenvolvimento apenas).
- Contexto e estado persistido: não exige sessão; pode usar somente a preferência
  local `dall-fit:theme` com valor `light | dark`.
- Permissões: pública.

Antes de renderizar, a rota executa um probe de sessão em `beforeLoad`. Quando a
sessão é válida, autenticada ou revogada/recuperada, o router substitui a URL por
`/dash` sem renderizar a entrada pública. Um bypass one-shot permite que a navegação
terminal (logout, expiração) volte à raiz e renderize a entrada pública sem novo
probe. Consulte `../../api/docs/sdd/endpoints/auth.md` e
`../../../../docs/sdd/flows/login-google.md`.

## Elementos e conteúdo

- identificação `Dall Fit`;
- título `Entre para continuar`;
- descrição curta de que a conta Google será usada;
- botão `Entrar com Google`;
- alerta `Não foi possível entrar. Tente novamente.` após erro de callback;
- aviso global `Nova versão disponível` quando o service worker encontra uma
  versão em espera, com ações `Atualizar agora` e `Agora não`; em viewports
  estreitos, as ações ficam abaixo da mensagem e permanecem contidas no aviso.

Antes da primeira pintura útil, a rota usa o tema local válido ou, quando ele não
existe, é inválido ou está inacessível, `prefers-color-scheme`. O resultado fica em
`data-theme` no elemento raiz. Enquanto o sistema for a fonte, mudanças da
preferência atualizam a rota sem escrever no armazenamento.

## Caminho feliz

1. O visitante acessa `/`.
2. O probe de sessão confa requisição `GET /auth/me`; com sessão válida, o router
   substitui a URL para `/dash`.
3. Com sessão inválida, a entrada pública é renderizada.
4. O visitante aciona `Entrar com Google`.
5. O browser navega o documento para `GET ${VITE_API_URL}/auth/google`.

Resultado esperado: a API inicia o fluxo OAuth.

## Caminhos alternativos

### Alternativa 1 — Sessão válida redireciona para `/dash`

- Condição: o probe de sessão obtém `200` de `GET /auth/me`.
- Comportamento: o router substitui a URL para `/dash` e a rota pública não é
  renderizada.
- Resultado: usuários autenticados não veem a entrada pública.

### Alternativa 2 — Login falhou

- Condição: query `authError=oauth_failed` devolvida pelo callback.
- Comportamento: a tela continua pública e mostra alerta genérico.
- Resultado: nenhuma informação técnica é exposta e a ação pode ser repetida.

### Alternativa 3 — Nova versão do PWA

- Condição: o service worker encontra uma versão em espera enquanto a rota pública
  está aberta.
- Comportamento: o aviso global não bloqueia o login; `Atualizar agora` ativa a
  versão e recarrega, enquanto `Agora não` o dispensa no documento atual. Abaixo
  de `640px`, as ações são apresentadas depois do texto; a partir de `640px`, texto
  e ações usam a mesma linha quando houver espaço.
- Resultado: a atualização depende de confirmação e falhas não expõem detalhe
  técnico nem impedem a autenticação. O aviso não corta conteúdo nem cria rolagem
  horizontal.
- Falha de registro mantém a aplicação como web app comum e registra somente a
  categoria sanitizada `pwa_registration`. Falha de atualização mantém o aviso,
  informa erro genérico e oferece `Tentar atualizar`.

### Alternativa 4 — Falha global de bootstrap ou renderização

- Condição: MSW habilitado não inicia, provider não pode ser preparado ou erro de
  renderização escapa dos boundaries de rota.
- Comportamento: `ApplicationFallback` substitui a árvore por heading, mensagem
  genérica e `Tentar novamente`, que recarrega o documento.
- Resultado: o diagnóstico usa somente `bootstrap` ou `render`; erro, stack, URL,
  sessão e pessoa não são transportados.

### Alternativa 5 — Preferência de tema inválida ou indisponível

- Condição: `dall-fit:theme` não contém `light | dark` ou o navegador bloqueia o
  armazenamento.
- Comportamento: o valor inválido é descartado e o sistema operacional define
  `light` ou `dark`.
- Resultado: login e navegação continuam disponíveis; nenhum valor inferido do
  sistema é persistido.

## Validações

Não se aplica — não há formulário nem entrada local.

## Estados

- Loading: enquanto o probe de sessão não retorna, um skeleton espelha o card de
  entrada com placeholders para eyebrow, título, descrição e botão, com atraso de
  `300ms` antes do componente de pending (`aria-label="Verificando sua sessão"`,
  `role="status"`).
- Vazio: não se aplica.
- Sucesso: card de entrada e ação visíveis (usuário sem sessão) ou redirecionado
  para `/dash` (usuário autenticado).
- Erro recuperável: alerta após falha OAuth esperada no callback ou falha na
  preparação.
- Erro não recuperável: não se aplica.
- Ações desabilitadas: durante a ativação da nova versão, `Atualizar agora` indica
  progresso e `Agora não` fica indisponível para impedir ações concorrentes.
- Tema: local válido prevalece sobre o sistema; sem valor local válido, acompanha
  o sistema.

## Integrações

### Iniciar login

- Momento: ativação do botão.
- Endpoint documentado: `api/docs/sdd/endpoints/auth.md`.
- Dados enviados: nenhum.
- Resposta utilizada: redirect HTTP da API.
- Sucesso: provedor Google.
- Erros OAuth esperados retornam à própria rota com `authError=oauth_failed`.
  Falhas técnicas do callback terminam na resposta `500` correlacionada da API e
  não navegam silenciosamente para esta tela.
- Retry, timeout e idempotência: sem retry automático; nova ativação cria novo
  state/nonce.

## Navegação

- Entrada: direta ou redirect.
- Avanço: endpoint externo da API e, após conclusão, `/dash`.
- Retorno: browser pode voltar à entrada pública.
- Botão voltar do navegador: comportamento normal.
- Dados preservados: nenhum dado pessoal na UI pública.

## Acessibilidade e interação

- o botão possui nome acessível `Entrar com Google` e foco visível;
- acionamento por teclado executa a mesma navegação;
- o alerta usa o componente semântico HeroUI e texto independente de cor.
- o aviso de atualização usa região viva polida, título e descrição, com ações
  nomeadas e operáveis por teclado; a mensagem precede `Atualizar agora` e
  `Agora não` na ordem de leitura e de foco em qualquer largura.
- a mudança de tema preserva os tokens de contraste e foco e não depende de texto
  adicional na rota.

## Responsividade do aviso de atualização

### Viewport menor que `640px`

- o aviso preserva `16px` de distância das laterais e da borda inferior;
- indicador, título e descrição formam a primeira região de conteúdo;
- as ações aparecem abaixo da mensagem, usam a largura disponível e podem quebrar
  entre linhas sem cortar seus textos;
- o aviso e o documento não apresentam overflow horizontal.

### Viewport igual ou maior que `640px`

- o aviso preserva `24px` de distância das laterais e largura máxima de `768px`;
- mensagem e ações ficam lado a lado, com as ações em sua ordem original;
- redimensionar o viewport altera somente a disposição visual e não confirma nem
  dispensa a atualização.

## Analytics

- `Entrar com Google` emite somente `ui_operation_started` para `google_login`
  imediatamente antes da navegação. Não emite conclusão antecipada nem interpreta
  redirect/consentimento externo como sucesso.
- `Atualizar agora` emite início e resultado `success|error` de `pwa_update`;
  `Agora não` emite início e resultado `dismissed` da mesma operação.
- o contexto usa somente `route=/`, superfície e controle enumerados. `authError`,
  mensagens técnicas, URL de autorização e qualquer dado de pessoa não são
  enviados.
- o componente global do Vercel Analytics permanece invisível e uma falha ou
  bloqueio de coleta não altera login, aviso de atualização ou navegação.

## Referências visuais de layout — opcional

Não se aplica — não existem imagens em `routes/assets/root/`.

## Cenários funcionais

### Cenário 1 — Iniciar login

- Link para testar: `http://localhost:3000/?mockAuth=unauthenticated`
- Given: a rota pública está carregada (probe retorna `public-entry`)
- When: o visitante aciona `Entrar com Google`
- Then: o documento navega diretamente para `GET /auth/google`

### Cenário 2 — Exibir erro recuperável

- Link para testar: `http://localhost:3000/?mockAuth=unauthenticated&authError=oauth_failed`
- Given: o callback classificou uma falha OAuth esperada e retornou erro genérico
- When: a rota renderiza
- Then: mostra o alerta e mantém a ação de login disponível

### Cenário 3 — Aviso responsivo de nova versão

- Link para testar: não se aplica — o estado depende de uma nova versão do Service
  Worker instalada em espera no preview do build
- Given: uma nova versão está em espera enquanto a rota pública está aberta
- When: o aviso é conferido em `320x568`, `360x800`, `390x844` e `768x1024`
- Then: todo o conteúdo permanece dentro do viewport; abaixo de `640px`, as ações
  ficam abaixo da mensagem e, a partir desse breakpoint, ficam ao lado dela
- And: não há corte, sobreposição ou rolagem horizontal

### Cenário 4 — Tema público acompanha o sistema

- Link para testar: `http://localhost:3000/?mockAuth=unauthenticated` sem
  `dall-fit:theme`
- Given: o sistema prefere `light`
- When: a rota abre e a preferência muda para `dark`
- Then: `data-theme` muda de `light` para `dark`
- And: `dall-fit:theme` continua ausente

### Cenário 5 — Preferência local inicia o tema

- Link para testar: `http://localhost:3000/?mockAuth=unauthenticated` com
  `dall-fit:theme=dark` preparado antes da navegação
- Given: o sistema prefere `light`
- When: o documento inicia
- Then: `data-theme="dark"` é aplicado antes da primeira pintura útil e mudanças
  do sistema não substituem a escolha local

### Cenário 6 — Sessão ativa redireciona da raiz

- Link para testar: `http://localhost:3000/`
- Given: o probe obtém `200` de `GET /auth/me`
- When: a raiz resolve o `beforeLoad`
- Then: o router substitui a URL para `/dash` sem renderizar a entrada pública
- And: a rota `/dash` reutiliza o dado cacheado do probe sem nova requisição

### Cenário 7 — Logout encerra a sessão e a raiz permanece pública

- Link para testar: `http://localhost:3000/dash`
- Given: a sessão está ativa e o usuário aciona `Sair`
- When: o logout conclui e a raiz é carregada via navegação terminal
- Then: o bypass one-shot permite a entrada pública sem novo probe
- And: uma navegação subsequente à raiz mantém a entrada pública (sessão revogada)

## Estrutura técnica relevante

- Arquivo da rota: `src/routes/routes.tsx` (homeRoute `beforeLoad`, `validateSearch`,
  `pendingComponent`, `pendingMs`)
- Probe de sessão: `src/routes/root-session-probe.ts`
- Lifecycle de sessão: `src/auth/session-lifecycle.ts`
- Componentes de entrada: `src/routes/route-components.tsx`
  (`HomeRouteComponent`, `HomeRoutePending`)
- Arquivo do componente home: `src/routes/home/index.tsx`
- Componentes HeroUI utilizados: `Alert`, `Button`, `Card`, `Skeleton`
- Componentes core: `pwa-update-notice`, aplicado pelos providers globais
- Infraestrutura core: `ThemeProvider`, `theme-storage`,
  `ApplicationErrorBoundary` e `ApplicationFallback`
- Componentes exclusivos: estilos tipados em `src/routes/home/styles.ts`
- Hooks e serviços: `getGoogleLoginUrl`, sem mutation ou contrato JSON
- Tipos compartilhados: nenhum para iniciar OAuth

## Cobertura automatizada

| Regra ou cenário de negócio | Vitest                                     | Playwright   |
| --------------------------- | ------------------------------------------ | ------------ |
| conteúdo e destino do login | componente home                            | rota root    |
| alerta de callback          | componente home                            | rota root    |
| avanço até `/dash` mockado  | não se aplica                              | flow login   |
| aviso de atualização        | componente PWA                             | não se aplica |
| bootstrap local/sistema     | theme storage                              | rota root    |
| mudança do sistema          | theme provider                             | rota root    |
| probe redireciona autenticado | root-session-probe, session-lifecycle    | rota root    |
| bypass one-shot após logout | app, session-lifecycle                     | rota root    |

- Handlers e fixtures MSW: `src/mocks/handlers/auth.ts`.
- Spec Playwright da rota: `tests/integration/routes/auth/root.spec.ts`.
- Spec Playwright do flow: `tests/integration/flows/login-google.spec.ts`.
- Cenários manuais e justificativa: consentimento Google real exige serviço e conta
  externos. O layout do aviso é conferido no preview de duas versões do build,
  porque o Playwright usa MSW Browser e mantém o Service Worker da PWA desabilitado.
