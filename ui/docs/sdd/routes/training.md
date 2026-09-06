# Rota `/training`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

## Objetivo funcional

- Problema resolvido: escolher um workout do plano em uso ou retomar a sessão.
- Ator: pessoa autenticada, inclusive administradora.
- Resultado esperado: abrir a prévia/execução correta sem editar o plano.
- Fluxo relacionado: [execução de treino](../../../../docs/sdd/flows/execucao-de-treino.md).

## Entradas e pré-condições

O item `Treinar` do menu navega para a rota. `mockAuth` e `mockTraining` existem
somente nos cenários locais. O backend deriva a pessoa, a seleção ativa e uma
eventual sessão Redis; query ou body não escolhem owner.

## Elementos, estados e ações

Com plano ativo, a tela mostra nome do plano, instrução `Selecione o treino` e uma
lista de cards navegáveis. Cada card contém thumbnail/fallback, nome, áreas
distintas e, quando aplicável, `Atual` ou `Em andamento`. O primeiro workout é
atual sem histórico; depois, o atual é o seguinte ao último concluído de forma
cíclica. Sessão em andamento prevalece sobre seleção e histórico.

A grade possui uma coluna em `390px` e `900px` e no máximo duas em `1440px`. O
play de vídeo fica centralizado sobre a thumbnail. Os chips usam tokens semânticos
com contraste legível nos temas claro e escuro; nomes podem ocupar duas linhas.

Sem plano, mostra `Nenhum plano em uso`, explicação e `Ir para Meus planos`. Plano
sem workouts possui empty state próprio. Loading usa skeletons. Falha mostra Alert
e retry explícito. A navegação do card conserva o seletor MSW somente quando os
mocks locais estão habilitados; uma build de produção nunca propaga
`mockTraining` para a URL.

## Integração

- `GET /training`, documentado em
  [`training.md`](../../../../api/docs/sdd/endpoints/training.md).
- TanStack Query usa `trainingKeys.overview`; Axios central transporta a request.
- Sucesso utiliza `TrainingOverview`; erro não promove cache anterior a sucesso.

## Navegação e acessibilidade

Cards são links reais na lista ordenada `Treinos do plano`. Indicadores não são a
única identificação do card. Ação vazia navega para `/training-plan`; workout
navega para `/training/workout/:workoutId`. O voltar do navegador retorna ao shell
sem persistência local de sessão.

## Analytics

O pageview usa `/training`. Seleção emite `ui_training_action` com
`select_workout`; retry usa `retry`. O menu emite `ui_navigation_selected` com
`training_link`. Nenhum ID, nome, área, query de mock ou conteúdo é enviado.

## Cenários funcionais

### Cenário 1 — plano ativo

- Link para testar: `http://localhost:3000/training?mockAuth=person&mockTraining=active-plan`
- Given: plano com três workouts e nenhum treino em andamento.
- When: a rota abre.
- Then: os cards aparecem e somente `Treino A` contém `Atual`.

### Cenário 2 — sem plano

- Link para testar: `http://localhost:3000/training?mockAuth=person&mockTraining=no-active-plan`
- Given: seleção ativa ausente.
- When: a rota abre.
- Then: a pessoa recebe orientação para Meus planos.

## Estrutura e cobertura

- Rota: `ui/src/routes/training/overview-page.tsx`.
- HeroUI: `Card`, `Chip`, `Button`, `Alert`, `Skeleton`.
- Service/queries: `training-service.ts` e `training-queries.ts`.
- Tipos: `TrainingOverview`, `TrainingWorkoutCard`.
- MSW: `ui/src/mocks/handlers/training.ts` e fixture homônima.
- Playwright: `ui/tests/integration/routes/training.spec.ts`.
- Referências visuais: não se aplica; não existe pasta de assets desta rota.
