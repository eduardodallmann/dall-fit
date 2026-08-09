# Rota `/global/training-plan`

## Objetivo funcional

- Problema resolvido: listar, criar, editar e excluir planos globais.
- Ator: pessoa administradora.
- Resultado esperado: manter a coleção paginada sem perder conteúdo válido em
  falhas transitórias.
- Fluxo relacionado:
  `../../../../docs/sdd/flows/gestao-planos-treino-globais.md`.

## Entradas e pré-condições

- Entrada: item administrativo `Planos de treino` ou retorno do detalhe.
- Query: `page` inteiro positivo, normalizado para 1 quando ausente/inválido na
  URL; `mockAuth` e `mockTrainingPlans` existem apenas com MSW.
- Estado: cache TanStack Query por página e cenário.
- Permissão: filha de `adminRoute`; pessoa comum retorna a `/dash` e sessão ausente
  segue a proteção para `/`.

## Elementos e conteúdo

- breadcrumb semântico e tipado `Home / Planos de treino`;
- título, descrição e ação `Novo plano`;
- `Table` HeroUI com nome, descrição, atualização e dropdown de ações;
- nome como `Link` tipado para o detalhe, com cor de ação e sublinhado persistente
  para tornar a navegação evidente sem depender de hover;
- `Pagination` HeroUI, fixa em 20 itens por página;
- `Modal`, `Fieldset`, TanStack Form e campos HeroUI para criar/editar;
- `AlertDialog` antes de excluir;
- `Toast.Provider` global e `toast.promise` em todas as mutations.

O corpo da tabela renderiza skeletons de linhas durante o loading. Coleção vazia e
falha do primeiro carregamento usam `EmptyState` centralizado; o vazio possui ícone
decorativo coerente e, no erro inicial, o próprio estado contém `Tentar novamente`.
A tabela e seus cabeçalhos permanecem presentes em todos esses estados.

## Caminho feliz

1. A query carrega `GET /global/training-plans?page=<page>`.
2. A tabela exibe até 20 resumos e a paginação deriva o total de páginas.
3. Criar fecha o modal no disparo, navega à página 1, insere resumo temporário,
   envia o POST, substitui pelo resumo real e invalida listas.
4. Editar fecha o modal no disparo, atualiza todas as listas/detalhes conhecidos,
   confirma pela response e invalida queries.
5. Excluir fecha o dialog no disparo, remove o plano e decrementa o total; se era o
   único item de página maior que 1, antecipa retorno à anterior.

## Caminhos alternativos

### Falha inicial

Sem dado válido em cache, o `EmptyState` interno comunica a falha e oferece retry.

### Falha de atualização em background

Com dado em cache, a tabela permanece intacta e um `Alert` não bloqueante informa
que os dados exibidos são a última versão disponível, com retry.

### Falha de mutation

O hook restaura snapshots de todas as queries tocadas; criação e exclusão também
restauram a página anterior. O modal/dialog já fechado não reabre, e o toast
informa a falha.

## Validações

| Campo/ação | Regra                 | Quando             | Efeito               | Bloqueia? |
| ---------- | --------------------- | ------------------ | -------------------- | --------: |
| Nome       | trim, 1–120           | change/blur/submit | mensagem no campo    |       sim |
| Descrição  | trim, 1–1000          | change/blur/submit | mensagem no campo    |       sim |
| Excluir    | confirmação explícita | antes do DELETE    | dialog nomeia efeito |       sim |

## Estados

- Loading: skeletons de linhas no corpo da tabela.
- Vazio: `EmptyState` centralizado, com ícone e `Nenhum plano de treino`, sem
  paginação.
- Sucesso: linhas, ações e paginação quando total > 0.
- Erro recuperável: retry dentro da tabela no primeiro load; `Alert` preservando
  linhas em background.
- Erro não recuperável: não se aplica; erros de integração são recuperáveis.
- Ações desabilitadas: submit inválido/em progresso e navegação além dos limites.

## Integrações

- Lista: `GET /global/training-plans?page=<page>`.
- Criar: `POST /global/training-plans` com nome/descrição.
- Editar: `PATCH /global/training-plans/:id`.
- Excluir: `DELETE /global/training-plans/:id`.

Todas as mutações só ficam disponíveis depois do bootstrap autenticado de CSRF.
O Axios compartilhado injeta `X-CSRF-Token` em memória e envia o cookie; `403` não
é repetido automaticamente e segue o rollback/feedback da mutation proprietária.

- Contrato: `api/docs/sdd/endpoints/global-training-plans.md`.
- Retry: política TanStack Query; mutations não são repetidas automaticamente.

## Navegação e acessibilidade

Breadcrumb, link do plano e mudanças de página usam o TanStack Router sem reload do
documento. O menu marca `Planos de treino` ativo também em descendentes. Tabela,
dialogs, campos e botões possuem nomes textuais; menu de reticências recebe `Ações
de <nome>`. O nome do plano mantém affordance visual de link por cor e sublinhado.
Truncamento visual preserva o texto integral e `title`.

## Analytics

- breadcrumb, nome de plano e paginação emitem `ui_navigation_selected` com destino
  e tipo enumerados; página, ID, nome e query não são propriedades;
- abrir o dropdown emite `ui_menu_opened`; escolher Editar ou Excluir emite
  `ui_menu_action_selected`, e a abertura subsequente do modal ou confirmação emite
  `ui_overlay_opened`;
- abrir `Novo plano` emite a abertura do formulário no modo `create`; editar usa
  `edit`. Cancelar, submeter ou confirmar emite um único `ui_overlay_closed` com a
  razão correspondente;
- Nome e Descrição emitem o primeiro `ui_field_focused` de cada abertura e
  `ui_field_completed` somente depois de mudança, com `empty|valid|invalid`. Valor,
  tamanho, erro e texto visível nunca são enviados;
- submissões válidas emitem `ui_form_submitted`, e criar, editar ou excluir emitem
  um início e um resultado terminal `success|error` da operação correspondente;
- retries emitem `ui_retry_requested` para `training_plans`, tanto na falha inicial
  quanto na atualização em background.

## Referências visuais de layout

Não se aplica — não existem imagens em `routes/assets/global-training-plan/`.

## Cenários funcionais

1. Sucesso: `?mockAuth=admin` exibe 20 de 21 planos e duas páginas.
2. Vazio: `?mockAuth=admin&mockTrainingPlans=empty` mantém a tabela com empty state.
3. Falha inicial: `?mockAuth=admin&mockTrainingPlans=list-error` mostra retry dentro
   do grid.
4. Rollback: `?mockAuth=admin&mockTrainingPlans=create-error&page=2` retorna à
   página 2 e conserva sua linha.
5. Loading: `?mockAuth=admin&mockTrainingPlans=loading` mostra skeletons de linhas
   antes de exibir o conteúdo.
6. Overlays otimistas: criação, edição e exclusão fecham modal/dialog no disparo,
   mostram o dado otimista e, nos cenários `create-error`, `update-error` e
   `delete-error`, restauram o cache sem reabrir o overlay.

## Estrutura técnica relevante

- Rota: `src/routes/routes.tsx`.
- Tela: `src/routes/training-plan/list-page.tsx`.
- Composição: `components.tsx`, `styles.ts`, queries, mutations e service no mesmo
  módulo de rota.
- HeroUI: Alert, AlertDialog, Button, Dropdown, EmptyState, Fieldset,
  Modal, Pagination, Skeleton, Table, Toast e campos.
- Tipos: resumos, requests e responses de `@dall-fit/types`.

## Cobertura automatizada

| Regra                            | Vitest/typecheck                   | Playwright |
| -------------------------------- | ---------------------------------- | ---------- |
| acesso administrativo/menu       | `admin-access`, `application-menu` | rota       |
| tabela, paginação e erro interno | composição tipada                  | rota       |
| criar/editar e rollback          | hooks tipados                      | flow       |

- Fixtures/handlers: `src/mocks/fixtures/training-plans.ts` e
  `src/mocks/handlers/training-plans.ts`.
- Specs: `tests/integration/routes/training-plan.spec.ts` e
  `tests/integration/flows/gestao-planos-treino.spec.ts`.
