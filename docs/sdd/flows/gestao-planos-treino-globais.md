# Fluxo `Gestão de planos de treino globais`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

- Ator: pessoa autenticada com `isAdmin: true`.
- Problema resolvido: cadastrar e manter modelos globais de plano e seus treinos.
- Resultado esperado: a pessoa entra pelo menu, mantém planos e treinos e navega
  ao stub reservado ao futuro editor de exercícios.

## Entrada e pré-condições

A sessão precisa ser válida e a pessoa precisa ser administradora. Antes de
disponibilizar o layout, a UI confirma a pessoa por `GET /auth/me` e mantém em
memória o token de `GET /auth/csrf`. A UI protege a navegação por `adminRoute`; a
API reaplica autenticação e autorização por `AdminOnly`, rate limit e validação de
origem/CSRF em toda mutação. Em desenvolvimento integrado, `mockAuth=admin` e
`mockTrainingPlans` selecionam fixtures MSW sem alterar o contrato de produção.

## Rotas e endpoints participantes

| Ordem | Etapa                | Rota de UI                                                 | Endpoint da API                                        |
| ----: | -------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
|     1 | Proteger layout      | layout autenticado                                         | `GET /auth/me` e `GET /auth/csrf`                      |
|     2 | Abrir lista          | `/global/training-plan`                                    | `GET /global/training-plans`                           |
|     3 | Criar/editar/excluir | lista ou detalhe                                           | `POST`, `PATCH` ou `DELETE /global/training-plans/...` |
|     4 | Abrir detalhe        | `/global/training-plan/:trainingPlanId`                    | `GET /global/training-plans/:trainingPlanId`           |
|     5 | Criar/excluir treino | detalhe                                                    | `POST` ou `DELETE .../workouts/...`                    |
|     6 | Abrir editor futuro  | `/global/training-plan/:trainingPlanId/workout/:workoutId` | reutiliza o detalhe                                    |

## Sequência e decisões

1. O layout confirma sessão/pessoa e obtém uma vez o CSRF da sessão; falha técnica
   desse bootstrap apresenta erro recuperável e não libera mutações.
2. O menu exibe `Planos de treino` somente à pessoa administradora.
3. A lista consulta a página da URL, limitada a 20 itens e ordenada pela criação.
4. Criar, editar e excluir plano enviam `Origin` e `X-CSRF-Token` pelo client Axios
   único e atualizam o cache otimisticamente; os modais de
   criação/edição e a confirmação de exclusão fecham assim que a mutation é
   disparada, e falha restaura snapshot, página e conteúdo anterior sem reabrir o
   overlay.
5. O detalhe consulta o plano e recebe apenas nome, descrição e resumos de treino.
6. Criar treino aguarda a API devolver o ID real, atualiza o cache e só então
   navega ao stub do editor.
7. Excluir treino fecha a confirmação e remove o resumo otimisticamente; falha
   restaura o snapshot sem reabrir o dialog.
8. Toda mutation usa `toast.promise` e invalida as queries relacionadas ao terminar.

Cada intenção navegável, menu, overlay, campo, submissão, retry e mutation desse
fluxo passa pela fronteira única de Analytics da UI. Mutations emitem início depois
que a UI aceita a ação e exatamente um resultado `success|error`; overlays registram
abertura e fechamento com a razão efetiva. A instrumentação não muda a ordem acima,
não cria request da API e não recebe nomes, descrições, IDs, página, query, erros de
campo ou conteúdo de treino.

## Dados compartilhados

| Dado             | Origem           | Consumidores                  | Persistência        | Observações                    |
| ---------------- | ---------------- | ----------------------------- | ------------------- | ------------------------------ |
| resumo do plano  | API              | lista e cache                 | MongoDB/Query cache | não expõe owner/workouts       |
| detalhe do plano | API              | detalhe, workout e breadcrumb | MongoDB/Query cache | workouts são resumos           |
| ID do workout    | MongoDB/API      | detalhe, cache e rota         | documento do plano  | nunca é fabricado pela UI      |
| `exerciseCount`  | projeção MongoDB | tabela de workouts            | derivado            | exercícios não atravessam HTTP |

## Estados e exceções

- Caminho completo: lista, mutation confirmada, detalhe e stub carregados.
- Interrupção ou retomada: browser preserva URL/página; dialogs fechados não são
  persistidos.
- Erro recuperável: primeira falha da lista aparece no `EmptyState` dentro da
  tabela com retry; falha em background conserva conteúdo válido e usa `Alert`.
- Loading estrutural: skeletons representam cabeçalho e conteúdo enquanto uma
  rota inteira ainda não possui dado válido; loading de tabela usa skeletons de
  linhas e não se apresenta como estado vazio.
- Erro não recuperável: plano ou treino inexistente apresenta o estado da rota.
- Indisponibilidade: rollback conserva o último snapshot e toast comunica a falha;
  `401` limpa token CSRF e caches privados e volta à raiz, enquanto rejeição CSRF
  não repete automaticamente a mutação.
- Breadcrumb: falha sem cache omite nomes dinâmicos; plano carregado com treino
  ausente conserva somente o nome do plano; ancestrais navegáveis usam o router da
  SPA e não recarregam o documento.

## Cenários funcionais

### Cenário 1 — Gestão completa

- Link para testar: `http://localhost:3000/global/training-plan?mockAuth=admin`
- Given: pessoa administradora e handlers de sucesso
- When: cria ou edita um plano, abre seu detalhe e cria/exclui treino
- Then: caches e tabelas refletem a confirmação e a navegação usa IDs reais

### Cenário 2 — Rollback de criação

- Link para testar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=create-error&page=2`
- Given: página 2 carregada e POST indisponível
- When: tenta criar um plano
- Then: a UI retorna à página 2, restaura seu conteúdo e anuncia a falha

### Cenário 3 — Falha inicial da lista

- Link para testar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=list-error`
- Given: não existe dado válido no cache
- When: a primeira consulta falha
- Then: o corpo da tabela contém o `EmptyState` com `Tentar novamente`

### Cenário 4 — Overlays e rollback otimistas

- Link para testar:
  `http://localhost:3000/global/training-plan?mockAuth=admin&mockTrainingPlans=update-error`
- Given: plano carregado e PATCH indisponível
- When: salva a edição ou confirma uma exclusão em um cenário de erro equivalente
- Then: o overlay de criação, edição ou exclusão fecha no disparo, o dado muda
  otimisticamente e o rollback restaura o cache sem reabrir modal ou dialog

## Cobertura automatizada

- Regras e caminhos de negócio protegidos: unitários de `TrainingPlanService`.
- Unitários e componentes da UI: serviços, menu e typecheck das composições HeroUI.
- Playwright da jornada UI:
  `ui/tests/integration/flows/gestao-planos-treino.spec.ts`.
- Analytics: testes da fronteira e dos componentes validam schema, privacidade,
  campos, menus e overlays; a jornada Playwright preserva navegação e mutations sem
  implementação paralela de coleta.
- E2E dos endpoints: `api/test/training-plan.e2e-spec.ts`, com MongoDB e Redis
  efêmeros, execução serial, sessão real, CSRF, origem e rate limit.
- Handlers e fixtures MSW: `training-plans.ts`, com estado isolado por seletor.
- Cenários não automatizados: regressão visual não se aplica, pois não há imagens
  de referência nas novas rotas.

O Playwright usa MSW Browser e valida somente a jornada do frontend; os E2E da API
validam separadamente os adapters e endpoints reais.
