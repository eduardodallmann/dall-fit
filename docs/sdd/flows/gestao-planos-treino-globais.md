# Fluxo `Gestão de planos de treino globais`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

- Ator: pessoa autenticada com `isAdmin: true`.
- Problema resolvido: cadastrar e manter modelos globais de plano e seus treinos.
- Resultado esperado: a pessoa entra pelo menu, mantém planos e treinos e navega
  ao stub reservado ao futuro editor de exercícios.

## Entrada e pré-condições

A sessão precisa ser válida e a pessoa precisa ser administradora. A UI protege a
navegação por `adminRoute`; a API reaplica autenticação e autorização por
`AdminOnly`. Em desenvolvimento integrado, `mockAuth=admin` e
`mockTrainingPlans` selecionam fixtures MSW sem alterar o contrato de produção.

## Rotas e endpoints participantes

| Ordem | Etapa                 | Rota de UI                                                 | Endpoint da API                                        |
| ----: | --------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
|     1 | Abrir lista           | `/global/training-plan`                                    | `GET /global/training-plans`                           |
|     2 | Criar/editar/excluir  | lista ou detalhe                                           | `POST`, `PATCH` ou `DELETE /global/training-plans/...` |
|     3 | Abrir detalhe         | `/global/training-plan/:trainingPlanId`                    | `GET /global/training-plans/:trainingPlanId`           |
|     4 | Criar/excluir treino  | detalhe                                                    | `POST` ou `DELETE .../workouts/...`                    |
|     5 | Abrir editor futuro   | `/global/training-plan/:trainingPlanId/workout/:workoutId` | reutiliza o detalhe                                    |

## Sequência e decisões

1. O menu exibe `Planos de treino` somente à pessoa administradora.
2. A lista consulta a página da URL, limitada a 20 itens e ordenada pela criação.
3. Criar, editar e excluir plano atualizam o cache otimisticamente; os modais de
   criação/edição e a confirmação de exclusão fecham assim que a mutation é
   disparada, e falha restaura snapshot, página e conteúdo anterior sem reabrir o
   overlay.
4. O detalhe consulta o plano e recebe apenas nome, descrição e resumos de treino.
5. Criar treino aguarda a API devolver o ID real, atualiza o cache e só então
   navega ao stub do editor.
6. Excluir treino fecha a confirmação e remove o resumo otimisticamente; falha
   restaura o snapshot sem reabrir o dialog.
7. Toda mutation usa `toast.promise` e invalida as queries relacionadas ao terminar.

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
- Indisponibilidade: rollback conserva o último snapshot e toast comunica a falha.
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
- E2E dos endpoints: `api/test/training-plan.e2e-spec.ts`, com MongoDB efêmero e
  sem Redis.
- Handlers e fixtures MSW: `training-plans.ts`, com estado isolado por seletor.
- Cenários não automatizados: regressão visual não se aplica, pois não há imagens
  de referência nas novas rotas.

O Playwright usa MSW Browser e valida somente a jornada do frontend; os E2E da API
validam separadamente os adapters e endpoints reais.
