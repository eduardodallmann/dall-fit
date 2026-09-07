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
  local `dall-fit:theme` com valor `light | dark` e a intenção temporária de
  navegação descrita em
  [retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação).
- Permissões: pública.

Antes de renderizar, a rota executa um probe de sessão em `beforeLoad`. Quando a
sessão é válida, o router substitui a URL pelo destino privado pendente válido
ou por `/dash` sem renderizar a entrada pública. Um bypass one-shot permite que a
navegação terminal (logout, expiração) volte à raiz e renderize a entrada pública sem novo
probe. Consulte `../../../../api/docs/sdd/endpoints/auth.md` e
`../../../../docs/sdd/flows/login-google.md`.

## Elementos e conteúdo

- identificação `Dall Fit`;
- título `Entre para continuar`;
- descrição curta de que a conta Google será usada;
- botão `Entrar com Google`;
- alerta `Não foi possível entrar. Tente novamente.` após erro de callback;
- aviso global somente se a ativação automática de uma nova versão falhar, com
  título `Não foi possível atualizar`, ações `Tentar novamente` e `Continuar` e
  informação de que a versão atual permanece utilizável.

Antes da primeira pintura útil, a rota usa o tema local válido ou, quando ele não
existe, é inválido ou está inacessível, `prefers-color-scheme`. O resultado fica em
`data-theme` no elemento raiz. Enquanto o sistema for a fonte, mudanças da
preferência atualizam a rota sem escrever no armazenamento.

## Caminho feliz

1. O visitante acessa `/`.
2. O probe de sessão executa a requisição `GET /auth/me`; com sessão válida, o router
   substitui a URL pelo destino pendente válido ou por `/dash`.
3. Com sessão inválida, a entrada pública é renderizada.
4. O visitante aciona `Entrar com Google`.
5. O browser navega o documento para `GET ${VITE_API_URL}/auth/google`.

Resultado esperado: a API inicia o fluxo OAuth.

## Caminhos alternativos

### Alternativa 1 — Sessão válida retoma o destino ou abre `/dash`

- Condição: o probe de sessão obtém `200` de `GET /auth/me`.
- Comportamento: o router substitui a URL pelo destino pendente válido ou por
  `/dash`, sem renderizar a rota pública.
- Resultado: usuários autenticados não veem a entrada pública.

### Alternativa 2 — Login falhou

- Condição: query `authError=oauth_failed` devolvida pelo callback.
- Comportamento: a tela continua pública e mostra alerta genérico.
- Resultado: nenhuma informação técnica é exposta e a ação pode ser repetida.

### Alternativa 3 — Atualização silenciosa do PWA

- Condição: o service worker encontra uma versão em espera enquanto a rota pública
  está aberta.
- Comportamento: o provider ativa a versão e recarrega uma única vez, sem aviso,
  spinner ou ação manual, porque a rota pública não possui trabalho recuperável.
- Resultado: a versão nova assume sem depender de F5 ou pull-to-refresh e sem
  interromper a autenticação antes do reload confirmado.
- Falha de registro mantém a aplicação como web app comum e registra somente a
  categoria sanitizada `pwa_registration`. Falha terminal de ativação registra
  `pwa_update` e mostra apenas o aviso recuperável com `Tentar novamente` e
  `Continuar`, sem detalhe técnico.

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

Não há formulário. A intenção de navegação é revalidada conforme
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação);
destinos inválidos ou expirados não são usados.

## Estados

- Loading: enquanto o probe de sessão não retorna, um skeleton espelha o card de
  entrada com placeholders para eyebrow, título, descrição e botão, com atraso de
  `300ms` antes do componente de pending (`aria-label="Verificando sua sessão"`,
  `role="status"`).
- Vazio: não se aplica.
- Sucesso: card de entrada e ação visíveis (usuário sem sessão) ou redirecionado
  para o destino pendente ou `/dash` (usuário autenticado).
- Erro recuperável: alerta após falha OAuth esperada no callback ou falha na
  preparação.
- Erro não recuperável: não se aplica.
- Ações desabilitadas: no retry de uma falha PWA, `Tentar novamente` indica pending
  e `Continuar` fica indisponível para impedir ações concorrentes.
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
- Avanço: endpoint externo da API; o callback chega a `/dash`, onde a proteção
  retoma o destino privado pendente ou mantém o dashboard.
- Retorno: browser pode voltar à entrada pública.
- Botão voltar do navegador: comportamento normal.
- Dados preservados: somente intenção de navegação validada por até 30 minutos
  na mesma aba, sobrevivendo à recarga e ao erro OAuth recuperável; nenhum dado
  pessoal ou credencial é armazenado por esse mecanismo.

## Acessibilidade e interação

- o botão possui nome acessível `Entrar com Google` e foco visível;
- acionamento por teclado executa a mesma navegação;
- o alerta usa o componente semântico HeroUI e texto independente de cor.
- o caminho normal da atualização não move foco nem cria anúncio; o aviso de falha
  usa região viva polida, título e descrição, com `Tentar novamente` e `Continuar`
  nomeados e operáveis por teclado;
- a mudança de tema preserva os tokens de contraste e foco e não depende de texto
  adicional na rota.

## Responsividade do aviso de falha de atualização

### Viewport menor que `640px`

- o aviso preserva `16px` de distância das laterais e da borda inferior;
- indicador, título e descrição formam a primeira região de conteúdo;
- as ações aparecem abaixo da mensagem, usam a largura disponível e podem quebrar
  entre linhas sem cortar seus textos;
- o aviso e o documento não apresentam overflow horizontal.

### Viewport igual ou maior que `640px`

- o aviso preserva `24px` de distância das laterais e largura máxima de `768px`;
- mensagem e ações ficam lado a lado, com as ações em sua ordem original;
- redimensionar o viewport altera somente a disposição visual e não executa retry
  nem fecha o erro.

## Analytics

- `Entrar com Google` emite somente `ui_operation_started` para `google_login`
  imediatamente antes da navegação. Não emite conclusão antecipada nem interpreta
  redirect/consentimento externo como sucesso.
- descoberta e ativação automáticas não emitem evento de interação; falha automática
  emite no máximo o diagnóstico sanitizado `pwa_update`;
- `Tentar novamente` emite início e resultado confirmado `success|error` de
  `pwa_update`; `Continuar` emite somente `ui_button_pressed` com a decisão
  enumerada de fechar o erro.
- o contexto usa somente `route=/`, superfície e controle enumerados. `authError`,
  mensagens técnicas, URL de autorização e qualquer dado de pessoa não são
  enviados.
- o componente global do Vercel Analytics permanece invisível e uma falha ou
  bloqueio de coleta não altera login, aviso de falha de atualização ou navegação.

## Referências visuais de layout — opcional

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/root/desktop-1440-login.png` | `1440x900` | `mockAuth=unauthenticated` | card de entrada centralizado no desktop |
| `assets/root/mobile-390-login.png` | `390x844` | `mockAuth=unauthenticated` | card de entrada e ação no mobile |

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

### Cenário 3 — Atualização silenciosa e falha recuperável

- Link para testar: não se aplica — o estado depende de uma nova versão do Service
  Worker instalada em espera no preview do build
- Given: uma nova versão está em espera enquanto a rota pública está aberta
- When: a ativação é confirmada
- Then: o documento recarrega uma única vez sem aviso normal
- And: se a ativação falhar, o aviso acessível oferece retry ou continuidade

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
- Given: não há intenção pendente e o probe obtém `200` de `GET /auth/me`
- When: a raiz resolve o `beforeLoad`
- Then: o router substitui a URL para `/dash` sem renderizar a entrada pública
- And: a rota `/dash` reutiliza o dado cacheado do probe sem nova requisição

### Cenário 7 — Logout encerra a sessão e a raiz permanece pública

- Link para testar: `http://localhost:3000/dash`
- Given: a sessão está ativa e o usuário aciona `Sair`
- When: o logout conclui e a raiz é carregada via navegação terminal
- Then: o bypass one-shot permite a entrada pública sem novo probe
- And: uma navegação subsequente à raiz mantém a entrada pública (sessão revogada)

### Cenário 8 — Probe retoma intenção de outra entrada

- Link para testar: `http://localhost:3000/`, com destino válido `/training`
  capturado anteriormente na mesma aba e sessão confirmada pelo MSW.
- Given: a entrada privada foi bloqueada e a sessão tornou-se válida.
- When: a raiz executa o probe.
- Then: substitui a URL por `/training`, consome a intenção e reutiliza a pessoa
  confirmada, obtendo CSRF antes do conteúdo privado.
- And: com intenção inválida ou expirada usa `/dash`; falha OAuth sem sessão
  preserva a intenção ainda válida para nova tentativa.

## Estrutura técnica relevante

- Arquivo da rota: `src/routes/routes.tsx` (homeRoute `beforeLoad`, `validateSearch`,
  `pendingComponent`, `pendingMs`)
- Probe de sessão: `src/routes/root-session-probe.ts`
- Destino temporário: `src/auth/auth-return-to.ts`, coordenado por `routes.tsx`
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

| Regra ou cenário de negócio   | Vitest                                | Playwright   |
| ----------------------------- | ------------------------------------- | ------------ |
| conteúdo e destino do login   | componente home                       | rota root    |
| alerta de callback            | componente home                       | rota root    |
| avanço até `/dash` mockado    | não se aplica                         | flow login   |
| update silencioso e falha     | provider, lifecycle e componente PWA  | isolado real |
| bootstrap local/sistema       | theme storage                         | rota root    |
| mudança do sistema            | theme provider                        | rota root    |
| probe redireciona autenticado | root-session-probe, session-lifecycle | rota root    |
| bypass one-shot após logout   | app, session-lifecycle                | rota root    |

- Retomada: Vitest em `src/routes/auth-return-navigation.test.ts` e Playwright
  no flow de login, incluindo recarga, erro OAuth e abas independentes.

- Handlers e fixtures MSW: `src/mocks/handlers/auth.ts`.
- Spec Playwright da rota: `tests/integration/routes/auth/root.spec.ts`.
- Spec Playwright do flow: `tests/integration/flows/login-google.spec.ts`.
- Cenários manuais e justificativa: consentimento Google real exige serviço e conta
  externos. O lifecycle PWA real é validado por `pnpm test:pwa-update`, porque o
  Playwright com MSW Browser mantém o Workbox desabilitado.
