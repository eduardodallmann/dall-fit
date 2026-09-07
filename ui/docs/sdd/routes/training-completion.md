# Rota `/training/completion/:workoutExecutionId`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

## Objetivo funcional

- Problema resolvido: apresentar o resultado durável imediatamente ou após reabrir
  uma conclusão pertencente à pessoa.
- Ator: pessoa autenticada.
- Resultado esperado: compreender progresso semanal e compartilhar um texto curto.

## Entradas e conteúdo

`workoutExecutionId` vem da finalização. A tela lê o resumo durável e mostra nome,
conclusão integral/parcial, sete dias da semana no timezone usado, contagem de
exercícios, áreas, soma das cargas preenchidas e duração arredondada em minutos.
Loading usa skeleton; execução ausente/alheia mostra Alert `Conclusão não
encontrada` sem vazar sua existência.

## Ações e navegação

`Compartilhar` chama `navigator.share` diretamente na ativação da pessoa com
somente o texto visível. Cancelamento nativo não vira erro. Sem suporte, copia o
mesmo texto pelo clipboard e anuncia sucesso; falha mostra toast. `Voltar para
treinos` navega com replace para `/training`, que recalcula o workout atual.

## Integração e acessibilidade

`GET /training/completions/:workoutExecutionId`, documentado em
[`training.md`](../../../../api/docs/sdd/endpoints/training.md), alimenta a query de
conclusão. A semana possui label de grupo, marcadores combinam texto/ícone e as
métricas possuem rótulos. Compartilhamento nunca inclui ID, URL privada, conta ou
payload da sessão.

## Analytics

Pageview normalizado: `/training/completion/:workoutExecutionId`.
`ui_training_action` registra `share` e resultado por enums. Falha da coleta não
altera share, clipboard, toast ou navegação.

## Cenário funcional

- Link para testar: `http://localhost:3000/training/completion/64b000000000000000000301?mockAuth=person&mockTraining=workout-complete`
- Given: execução concluída pertencente à pessoa.
- When: a rota abre.
- Then: resumo, semana e ações aparecem sem dados internos.

## Estrutura e cobertura

- Rota: `ui/src/routes/training/completion-page.tsx`.
- HeroUI: `Card`, `Button`, `Alert`, `Skeleton`, toast.
- Tipos: `WorkoutExecutionSummary` e `TrainingWeekDay`.
- MSW: completion fixture e handler de leitura.
- Playwright: conclusão alcançada em `ui/tests/integration/routes/training.spec.ts`.
- Web Share/clipboard requer verificação manual do navegador hospedeiro.

## Referências visuais de layout

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/training-completion/desktop-1440-training-completion.png` | `1440x900` | `sdd-workout-complete` | resumo, semana, métricas e ações no desktop |
| `assets/training-completion/mobile-390-training-completion.png` | `390x844` | `sdd-workout-complete` | resumo e semana reorganizados no mobile |
