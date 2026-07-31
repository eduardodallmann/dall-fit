# Rota `/dash`

## Objetivo funcional

- Problema resolvido: oferecer a entrada privada da aplicação dentro de uma
  estrutura compartilhada de identidade e navegação.
- Ator: pessoa autenticada, comum ou administradora.
- Resultado esperado: exibir o menu autenticado responsivo e manter vazia a região
  de conteúdo própria do dashboard.
- Fluxos relacionados: `../../../../docs/sdd/flows/login-google.md`.

## Entradas e pré-condições

- Como o usuário chega: callback de login, item `Home` ou URL direta.
- Path e query params: `/dash`; a query `mockAuth` existe somente com MSW e aceita
  os cenários `admin`, `unauthenticated` e `error`.
- Contexto e estado persistido: cookie de sessão gerenciado pelo browser, cache
  TanStack Query e estado local temporário do `Drawer` móvel.
- Permissões: sessão válida e pessoa existente. A rota é comum e não pertence ao
  layout administrativo.

## Elementos e conteúdo

Depois da proteção, o layout autenticado apresenta:

- menu persistente em um `aside` quando o viewport possui pelo menos `768px`;
- botão HeroUI somente com ícone Lucide `Menu` e nome acessível `Abrir menu` quando
  o viewport possui menos de `768px`;
- `Drawer` HeroUI móvel aberto pela esquerda, com backdrop clicável e controle
  `Fechar menu`;
- avatar com foto ou iniciais da primeira e última palavras do nome;
- nome em uma linha;
- e-mail em uma segunda linha, abaixo do nome e com menor destaque;
- truncamento independente do nome e do e-mail com reticências, preservando os
  valores completos no DOM;
- `Chip` HeroUI não interativo com texto `Admin`, somente quando
  `Person.isAdmin === true`;
- navegação principal com o link `Home`, ícone Lucide `House` e destino `/dash`;
- `Home` marcado visualmente e com `aria-current="page"`;
- região `main` sem conteúdo próprio, título, placeholder, card ou mensagem.

A rota pública `/` não recebe nenhum desses elementos.

## Caminho feliz

1. O layout autenticado executa `GET /auth/me` antes de renderizar o shell.
2. A API responde com `CurrentPersonResponse`.
3. O layout entrega a mesma `Person` ao shell e ao contexto dos filhos, sem segunda
   request.
4. A largura do viewport seleciona a apresentação persistente ou móvel.
5. O menu exibe avatar, nome, e-mail, indicador administrativo condicional e
   `Home` ativo.
6. A rota filha `/dash` não acrescenta conteúdo à região principal.

Resultado esperado: a pessoa reconhece sua sessão e possui navegação disponível,
enquanto o dashboard permanece intencionalmente vazio.

## Caminhos alternativos

### Alternativa 1 — Sessão ausente ou expirada

- Condição: API responde `401`.
- Comportamento: `beforeLoad` redireciona com substituição de histórico para `/`
  antes do shell.
- Resultado: menu, botão e dados pessoais não são renderizados.

### Alternativa 2 — Falha técnica

- Condição: API falha com status diferente de `401`.
- Comportamento: o erro permanece no router.
- Resultado: o estado informa indisponibilidade e orienta recarregar, sem exibir
  menu ou identidade parcial.

### Alternativa 3 — Pessoa administradora

- Condição: `Person.isAdmin === true`.
- Comportamento: o mesmo menu recebe o `Chip` textual `Admin`.
- Resultado: identidade e navegação permanecem iguais às da pessoa comum, com o
  indicador adicional.

## Validações

Não se aplica — a rota e o menu não possuem formulário nem entrada editável.

## Estados

- Loading: spinner e texto `Carregando sua conta` durante a proteção, sem shell.
- Vazio: região principal intencionalmente vazia depois do sucesso.
- Sucesso comum: shell com identidade e `Home`, sem `Admin`.
- Sucesso administrativo: mesmo shell acrescido do `Chip` `Admin`.
- Erro recuperável: mensagem `Não foi possível carregar sua conta` e orientação de
  recarga, sem shell.
- Erro não recuperável: não se aplica.
- Ações desabilitadas: não se aplica.

## Integrações

### Pessoa atual

- Momento: `beforeLoad` do layout autenticado.
- Endpoint documentado: `api/docs/sdd/endpoints/current-person.md`.
- Dados enviados: cookie automaticamente por `withCredentials`.
- Resposta utilizada: `data.name`, `data.email`, `data.photoUrl` e o opcional
  `data.isAdmin`.
- Sucesso: pessoa entregue ao shell e ao contexto; a presença de `isAdmin: true`
  mostra o indicador e a ausência representa pessoa comum.
- Erros: `401` redireciona; demais erros acionam o error component.
- Retry, timeout e idempotência: política global de uma tentativa e cache por 30s.

## Responsividade e interações do menu

### Viewport menor que `768px`

1. O `aside` persistente fica oculto e fora da interação.
2. `Abrir menu` fica visível.
3. A ativação abre o `Drawer` pela esquerda e bloqueia a rolagem externa.
4. O foco permanece contido no diálogo enquanto ele está aberto.
5. Backdrop, `Escape`, `Fechar menu` ou ativação de `Home` fecham o overlay.
6. Ao fechar sem navegação, o foco retorna a `Abrir menu`.

Se o viewport alcançar `768px` com o `Drawer` aberto, ele fecha. Voltar ao viewport
móvel não o reabre.

### Viewport igual ou maior que `768px`

- o `aside` permanece visível ao lado da região principal;
- botão, diálogo e backdrop móveis não ficam disponíveis para interação;
- menu e conteúdo podem ser usados simultaneamente, sem contenção de foco ou
  bloqueio de rolagem modal.

## Navegação

- Entrada: callback, URL direta ou item `Home`.
- Avanço: `Home` usa `Link` tipado do TanStack Router para `/dash`, sem reload.
- Rota atual: ativar `Home` em `/dash` mantém a rota; no `Drawer`, também fecha o
  menu.
- Retorno: browser volta à página anterior conforme seu histórico.
- Botão voltar do navegador: preservado pelo router.
- Dados preservados: TanStack Query preserva a pessoa enquanto o cache estiver
  válido; cookie permanece inacessível ao JavaScript; estado aberto do `Drawer`
  não é persistido.
- Compatibilidade: `/me` não pertence mais à árvore e não possui alias nem
  redirect.

## Acessibilidade e interação

- `aside`, `nav`, `main` e `dialog` preservam seus landmarks e nomes acessíveis;
- o botão icon-only possui nome `Abrir menu`; ícones `Menu` e `House` são
  decorativos e não duplicam labels;
- o `Drawer` possui nome `Menu da aplicação`, controle `Fechar menu`, contenção e
  restauração de foco e fechamento por `Escape`;
- `Home` tem label visível, foco visível e `aria-current="page"` quando ativo;
- o avatar é exposto como imagem com o nome completo da pessoa; foto e iniciais são
  apresentações alternativas da mesma identidade;
- nome e e-mail usam `Typography` HeroUI; cada um ocupa sua própria linha com
  truncamento por CSS, sem alterar a string;
- `Admin` possui texto explícito, não depende de cor e não entra na ordem de foco;
- loading e erro possuem texto além do indicador visual.

## Referências visuais de layout — opcional

Não se aplica — não existem imagens em `routes/assets/dash/`.

## Cenários funcionais

### Cenário 1 — Menu persistente em tablet e desktop

- Link para testar: `http://localhost:3000/dash` com MSW habilitado, em `768x1024`
  ou viewport maior
- Given: o handler devolve pessoa fictícia comum
- When: a rota protegida carrega
- Then: mostra o `aside` com identidade e `Home` ativo, oculta `Abrir menu` e mantém
  a região principal vazia

### Cenário 2 — Abrir e fechar o menu móvel pelo backdrop

- Link para testar: `http://localhost:3000/dash` com MSW habilitado, em `390x844`
- Given: somente `Abrir menu` está visível
- When: a pessoa abre o `Drawer` e ativa o backdrop
- Then: o menu fecha e o foco retorna ao trigger

### Cenário 3 — Operar e fechar o menu móvel pelo teclado

- Link para testar: `http://localhost:3000/dash` com MSW habilitado, em `390x844`
- Given: o foco está em `Abrir menu`
- When: a pessoa abre pelo teclado, percorre os controles e pressiona `Escape`
- Then: o foco permanece contido enquanto aberto, o menu fecha e o foco retorna ao
  trigger

### Cenário 4 — Pessoa administradora

- Link para testar:
  `http://localhost:3000/dash?mockAuth=admin` com MSW habilitado
- Given: o handler devolve pessoa fictícia com `isAdmin: true`
- When: o shell renderiza
- Then: exibe foto, nome, e-mail, `Chip` `Admin` e `Home`

### Cenário 5 — Sessão ausente

- Link para testar:
  `http://localhost:3000/dash?mockAuth=unauthenticated` com MSW habilitado
- Given: o handler devolve `401`
- When: a proteção executa
- Then: redireciona para `/` sem mostrar shell ou dados pessoais

### Cenário 6 — Erro de integração

- Link para testar:
  `http://localhost:3000/dash?mockAuth=error` com MSW habilitado
- Given: o handler devolve `503`
- When: a proteção executa
- Then: exibe o estado de erro recuperável sem shell ou identidade parcial

## Estrutura técnica relevante

- Árvore e rota: `src/routes/routes.tsx` e `src/routes/route-components.tsx`
- Componentes HeroUI: `Avatar`, `Button`, `Chip`, `Drawer`, `Spinner` e
  `Typography`
- Componentes core: `authenticated-shell`, `application-menu` e `route-status`
- Componentes exclusivos da rota: não se aplica; `/dash` não possui conteúdo
- Hooks e serviços: `useOverlayState`, `currentPersonQueryOptions` e
  `getCurrentPerson`
- Tipos compartilhados: `Person`, `CurrentPersonResponse`
- Ícones: imports individuais `Menu` e `House` de `lucide-react`

## Cobertura automatizada

| Regra ou cenário                    | Vitest             | Playwright   |
| ----------------------------------- | ------------------ | ------------ |
| identidade, iniciais e `Admin`      | `application-menu` | rota `/dash` |
| link `Home` e estado atual          | `application-menu` | rota e flow  |
| menu persistente e breakpoint       | estilos/typecheck  | rota `/dash` |
| backdrop, teclado e foco móvel      | componentes HeroUI | rota `/dash` |
| redirect em `401`                   | router/app         | rota `/dash` |
| erro técnico sem identidade parcial | router/app         | rota `/dash` |

- Handlers e fixtures MSW: `src/mocks/handlers/auth.ts` e
  `src/mocks/fixtures/person.ts`.
- Specs Playwright: `tests/integration/routes/auth/dash.spec.ts` e
  `tests/integration/flows/login-google.spec.ts`.
- Cenários manuais e justificativa: truncamento visual com valores longos é
  conferido no browser sem referência de screenshot; o valor integral e a regra de
  iniciais possuem cobertura unitária.
