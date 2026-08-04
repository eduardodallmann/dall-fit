# Rota `/`

## Objetivo funcional

- Problema resolvido: oferecer uma entrada pública para autenticação.
- Ator: qualquer visitante, com ou sem sessão.
- Resultado esperado: apresentar o Dall Fit e iniciar o login Google.
- Fluxos relacionados: `../../../../docs/sdd/flows/login-google.md`.

## Entradas e pré-condições

- Como o usuário chega: URL direta ou redirecionamento após sessão/callback inválido.
- Path e query params: `/`; query opcional `authError=oauth_failed`.
- Contexto e estado persistido: não exige sessão.
- Permissões: pública.

## Elementos e conteúdo

- identificação `Dall Fit`;
- título `Entre para continuar`;
- descrição curta de que a conta Google será usada;
- botão `Entrar com Google`;
- alerta `Não foi possível entrar. Tente novamente.` após erro de callback ou
  falha ao preparar o login;
- aviso global `Nova versão disponível` quando o service worker encontra uma
  versão em espera, com ações `Atualizar agora` e `Agora não`.

## Caminho feliz

1. O visitante acessa `/`.
2. Aciona `Entrar com Google`.
3. A UI chama `POST ${VITE_API_URL}/auth/google`.
4. O browser navega para `authorizationUrl`.

Resultado esperado: a API inicia o fluxo OAuth.

## Caminhos alternativos

### Alternativa 1 — Login falhou

- Condição: query `authError=oauth_failed` ou falha no `POST /auth/google`.
- Comportamento: a tela continua pública e mostra alerta genérico.
- Resultado: nenhuma informação técnica é exposta e a ação pode ser repetida.

### Alternativa 2 — Nova versão do PWA

- Condição: o service worker encontra uma versão em espera enquanto a rota pública
  está aberta.
- Comportamento: o aviso global não bloqueia o login; `Atualizar agora` ativa a
  versão e recarrega, enquanto `Agora não` o dispensa no documento atual.
- Resultado: a atualização depende de confirmação e falhas não expõem detalhe
  técnico nem impedem a autenticação.

## Validações

Não se aplica — não há formulário nem entrada local.

## Estados

- Loading: botão desabilitado enquanto o início do login é preparado.
- Vazio: não se aplica.
- Sucesso: card de entrada e ação visíveis.
- Erro recuperável: alerta após callback falho ou falha na preparação.
- Erro não recuperável: não se aplica.
- Ações desabilitadas: não se aplica.

## Integrações

### Iniciar login

- Momento: ativação do botão.
- Endpoint documentado: `api/docs/sdd/endpoints/auth.md`.
- Dados enviados: nenhum.
- Resposta utilizada: `data.authorizationUrl`.
- Sucesso: provedor Google.
- Erros: falha do POST mostra alerta local; callback retorna à própria rota com
  `authError=oauth_failed`.
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
  nomeadas e operáveis por teclado.

## Referências visuais de layout — opcional

Não se aplica — não existem imagens em `routes/assets/root/`.

## Cenários funcionais

### Cenário 1 — Iniciar login

- Link para testar: `http://localhost:3000/`
- Given: a rota pública está carregada
- When: o visitante aciona `Entrar com Google`
- Then: a UI solicita `POST /auth/google` e navega para a URL devolvida

### Cenário 2 — Exibir erro recuperável

- Link para testar: `http://localhost:3000/?authError=oauth_failed`
- Given: o callback retornou erro genérico
- When: a rota renderiza
- Then: mostra o alerta e mantém a ação de login disponível

## Estrutura técnica relevante

- Arquivo da rota: `src/routes/home/index.tsx`
- Componentes HeroUI utilizados: `Alert`, `Button` e `Card`
- Componentes core: `pwa-update-notice`, aplicado pelos providers globais
- Componentes exclusivos: estilos tipados em `src/routes/home/styles.ts`
- Hooks e serviços: mutation TanStack Query e `startGoogleLogin`
- Tipos compartilhados: `StartGoogleLoginResponse`

## Cobertura automatizada

| Regra ou cenário de negócio | Vitest          | Playwright |
| --------------------------- | --------------- | ---------- |
| conteúdo e destino do login | componente home | rota root  |
| alerta de callback          | componente home | rota root  |
| avanço até `/dash` mockado  | não se aplica   | flow login |

- Handlers e fixtures MSW: `src/mocks/handlers/auth.ts`.
- Spec Playwright da rota: `tests/integration/routes/auth/root.spec.ts`.
- Cenários manuais e justificativa: consentimento Google real exige serviço e conta
  externos.
