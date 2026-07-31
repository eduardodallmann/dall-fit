# Rota `/me`

## Objetivo funcional

- Problema resolvido: confirmar a identidade vinculada à sessão, apresentar seus
  dados básicos e indicar quando ela possui acesso administrativo.
- Ator: pessoa autenticada, comum ou administradora.
- Resultado esperado: exibir foto, nome e e-mail retornados pela API e, somente
  para administradores, o indicador textual `Admin`.
- Fluxos relacionados: `../../../../docs/sdd/flows/login-google.md`.

## Entradas e pré-condições

- Como o usuário chega: callback de login ou URL direta.
- Path e query params: `/me`; a query `mockAuth` existe somente com MSW e aceita os
  cenários `admin`, `unauthenticated` e `error`.
- Contexto e estado persistido: cookie de sessão gerenciado pelo browser e cache
  TanStack Query.
- Permissões: sessão válida e pessoa existente. A rota continua disponível para
  pessoa comum e não pertence ao layout administrativo.

## Elementos e conteúdo

- identificação `Dall Fit`;
- título `Sua conta`;
- avatar com a foto ou iniciais como fallback;
- `Chip` HeroUI não interativo com texto `Admin`, somente quando
  `Person.isAdmin === true`;
- labels `Nome` e `E-mail` com os respectivos valores;
- nenhum identificador Google, token, cookie ou timestamp.

## Caminho feliz

1. O layout autenticado executa `GET /auth/me`.
2. A API responde com `CurrentPersonResponse`.
3. O layout entrega `Person` no contexto.
4. A rota exibe foto, nome e e-mail.
5. Quando `Person` contém `isAdmin: true`, a rota também exibe o `Chip` `Admin`;
   quando a chave está ausente, não renderiza indicador nem placeholder.

Resultado esperado: os dados da pessoa autenticada aparecem e a condição
administrativa é apresentada somente quando verdadeira.

## Caminhos alternativos

### Alternativa 1 — Sessão ausente ou expirada

- Condição: API responde `401`.
- Comportamento: `beforeLoad` redireciona para `/` antes do componente.
- Resultado: nenhum dado privado é renderizado.

### Alternativa 2 — Falha técnica

- Condição: API falha com status diferente de `401`.
- Comportamento: o erro permanece no router.
- Resultado: tela informa indisponibilidade e orienta recarregar.

## Validações

Não se aplica — a tela é somente leitura.

## Estados

- Loading: spinner e texto `Carregando sua conta` durante a proteção.
- Vazio: não se aplica; ausência de pessoa equivale a `401`.
- Sucesso comum: card com avatar, nome e e-mail, sem `Admin`.
- Sucesso administrativo: o mesmo card e dados, acrescidos do `Chip` `Admin`.
- Erro recuperável: mensagem `Não foi possível carregar sua conta` e orientação de
  recarga.
- Erro não recuperável: não se aplica.
- Ações desabilitadas: não se aplica.

## Integrações

### Pessoa atual

- Momento: `beforeLoad` do layout autenticado.
- Endpoint documentado: `api/docs/sdd/endpoints/current-person.md`.
- Dados enviados: cookie automaticamente por `withCredentials`.
- Resposta utilizada: `data.name`, `data.email`, `data.photoUrl` e o opcional
  `data.isAdmin`.
- Sucesso: pessoa entregue ao contexto; presença de `isAdmin: true` mostra o
  indicador e ausência equivale a pessoa comum.
- Erros: `401` redireciona; demais erros acionam error component.
- Retry, timeout e idempotência: política global de uma tentativa e cache por 30s.

## Navegação

- Entrada: callback ou URL direta.
- Avanço: não se aplica.
- Retorno: browser volta à página anterior.
- Botão voltar do navegador: preservado pelo router.
- Dados preservados: TanStack Query preserva a pessoa enquanto o cache estiver
  válido; cookie permanece inacessível ao JavaScript.

## Acessibilidade e interação

- título é o heading principal;
- avatar usa nome da pessoa como texto alternativo e iniciais como fallback;
- labels e valores são texto semântico;
- `Admin` possui texto explícito, não depende de cor e não entra na ordem de foco;
- loading possui texto além do indicador visual;
- erro possui heading e instrução textual.

## Referências visuais de layout — opcional

Não se aplica — não existem imagens em `routes/assets/me/`.

## Cenários funcionais

### Cenário 1 — Carregamento com sucesso

- Link para testar: `http://localhost:3000/me` com MSW habilitado
- Given: o handler devolve pessoa fictícia sem `isAdmin`
- When: a rota protegida carrega
- Then: exibe foto, nome e e-mail da fixture sem o indicador `Admin`

### Cenário 2 — Pessoa administradora

- Link para testar:
  `http://localhost:3000/me?mockAuth=admin` com MSW habilitado
- Given: o handler devolve a pessoa fictícia com `isAdmin: true`
- When: a rota protegida carrega
- Then: exibe foto, nome, e-mail e o `Chip` textual `Admin`

### Cenário 3 — Sessão ausente

- Link para testar:
  `http://localhost:3000/me?mockAuth=unauthenticated` com MSW habilitado
- Given: o handler devolve `401`
- When: a proteção executa
- Then: redireciona para `/` sem mostrar os dados

### Cenário 4 — Erro de integração

- Link para testar: `http://localhost:3000/me?mockAuth=error` com MSW habilitado
- Given: o handler devolve `503`
- When: a proteção executa
- Then: exibe o estado de erro recuperável

## Estrutura técnica relevante

- Arquivo da rota: `src/routes/me/index.tsx`
- Componentes HeroUI: `Avatar`, `Card`, `Chip`, `Spinner`
- Componentes core: estados de rota protegida
- Componentes exclusivos: estilos tipados em `src/routes/me/styles.ts`
- Hooks e serviços: `currentPersonQueryOptions`, `getCurrentPerson`
- Tipos compartilhados: `Person`, `CurrentPersonResponse`

## Cobertura automatizada

| Regra ou cenário de negócio | Vitest           | Playwright |
| --------------------------- | ---------------- | ---------- |
| perfil comum sem indicador  | componente `/me` | rota `/me` |
| perfil administrativo       | componente `/me` | rota `/me` |
| redirect em `401`           | router/app       | rota `/me` |
| erro técnico                | router/app       | rota `/me` |

- Handlers e fixtures MSW: `src/mocks/handlers/auth.ts` e
  `src/mocks/fixtures/person.ts`.
- Spec Playwright da rota: `tests/integration/routes/auth/me.spec.ts`.
- Cenários manuais e justificativa: não se aplica.
