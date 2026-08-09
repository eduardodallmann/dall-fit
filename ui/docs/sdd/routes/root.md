# Rota `/`

## Objetivo funcional

- Problema resolvido: oferecer uma entrada pública para autenticação.
- Ator: qualquer visitante, com ou sem sessão.
- Resultado esperado: apresentar o Dall Fit e iniciar o login Google.
- Fluxos relacionados: `../../../../docs/sdd/flows/login-google.md`.

## Entradas e pré-condições

- Como o usuário chega: URL direta ou redirecionamento após sessão/callback inválido.
- Path e query params: `/`; query opcional `authError=oauth_failed`.
- Contexto e estado persistido: não exige sessão; pode usar somente a preferência
  local `dall-fit:theme` com valor `light | dark`.
- Permissões: pública.

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
2. Aciona `Entrar com Google`.
3. O browser navega o documento para `GET ${VITE_API_URL}/auth/google`.

Resultado esperado: a API inicia o fluxo OAuth.

## Caminhos alternativos

### Alternativa 1 — Login falhou

- Condição: query `authError=oauth_failed` devolvida pelo callback.
- Comportamento: a tela continua pública e mostra alerta genérico.
- Resultado: nenhuma informação técnica é exposta e a ação pode ser repetida.

### Alternativa 2 — Nova versão do PWA

- Condição: o service worker encontra uma versão em espera enquanto a rota pública
  está aberta.
- Comportamento: o aviso global não bloqueia o login; `Atualizar agora` ativa a
  versão e recarrega, enquanto `Agora não` o dispensa no documento atual. Abaixo
  de `640px`, as ações são apresentadas depois do texto; a partir de `640px`, texto
  e ações usam a mesma linha quando houver espaço.
- Resultado: a atualização depende de confirmação e falhas não expõem detalhe
  técnico nem impedem a autenticação. O aviso não corta conteúdo nem cria rolagem
  horizontal.

### Alternativa 3 — Preferência de tema inválida ou indisponível

- Condição: `dall-fit:theme` não contém `light | dark` ou o navegador bloqueia o
  armazenamento.
- Comportamento: o valor inválido é descartado e o sistema operacional define
  `light` ou `dark`.
- Resultado: login e navegação continuam disponíveis; nenhum valor inferido do
  sistema é persistido.

## Validações

Não se aplica — não há formulário nem entrada local.

## Estados

- Loading: não se aplica ao início; a navegação top-level deixa o documento.
- Vazio: não se aplica.
- Sucesso: card de entrada e ação visíveis.
- Erro recuperável: alerta após callback falho ou falha na preparação.
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
- Erros: callback retorna à própria rota com `authError=oauth_failed`.
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

- Link para testar: `http://localhost:3000/`
- Given: a rota pública está carregada
- When: o visitante aciona `Entrar com Google`
- Then: o documento navega diretamente para `GET /auth/google`

### Cenário 2 — Exibir erro recuperável

- Link para testar: `http://localhost:3000/?authError=oauth_failed`
- Given: o callback retornou erro genérico
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

- Link para testar: `http://localhost:3000/` sem `dall-fit:theme`
- Given: o sistema prefere `light`
- When: a rota abre e a preferência muda para `dark`
- Then: `data-theme` muda de `light` para `dark`
- And: `dall-fit:theme` continua ausente

### Cenário 5 — Preferência local inicia o tema

- Link para testar: `http://localhost:3000/` com `dall-fit:theme=dark` preparado
  antes da navegação
- Given: o sistema prefere `light`
- When: o documento inicia
- Then: `data-theme="dark"` é aplicado antes da primeira pintura útil e mudanças
  do sistema não substituem a escolha local

## Estrutura técnica relevante

- Arquivo da rota: `src/routes/home/index.tsx`
- Componentes HeroUI utilizados: `Alert`, `Button` e `Card`
- Componentes core: `pwa-update-notice`, aplicado pelos providers globais
- Infraestrutura core: `ThemeProvider` e `theme-storage`
- Componentes exclusivos: estilos tipados em `src/routes/home/styles.ts`
- Hooks e serviços: `getGoogleLoginUrl`, sem mutation ou contrato JSON
- Tipos compartilhados: nenhum para iniciar OAuth

## Cobertura automatizada

| Regra ou cenário de negócio | Vitest          | Playwright    |
| --------------------------- | --------------- | ------------- |
| conteúdo e destino do login | componente home | rota root     |
| alerta de callback          | componente home | rota root     |
| avanço até `/dash` mockado  | não se aplica   | flow login    |
| aviso de atualização        | componente PWA  | não se aplica |
| bootstrap local/sistema     | theme storage   | rota root     |
| mudança do sistema          | theme provider  | rota root     |

- Handlers e fixtures MSW: `src/mocks/handlers/auth.ts`.
- Spec Playwright da rota: `tests/integration/routes/auth/root.spec.ts`.
- Cenários manuais e justificativa: consentimento Google real exige serviço e conta
  externos. O layout do aviso é conferido no preview de duas versões do build,
  porque o Playwright usa MSW Browser e mantém o Service Worker da PWA desabilitado.
