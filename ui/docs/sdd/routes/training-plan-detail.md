# Rota `/training-plan/:catalogEntryId`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

## Objetivo funcional

Exibir a árvore resolvida de uma entrada do catálogo pessoal. Sessão e ownership
são obrigatórios; o parâmetro identifica a entrada, não diretamente a árvore.

## Comportamento por source

Em `owned`, a composição reutiliza formulário, tabela e confirmações do fluxo
global: editar nome/descrição, criar, duplicar e excluir workout usam CAS e
`X-Resource-Version`. Em `global-reference`, um alerta explica que o conteúdo
é um `Modelo disponibilizado em modo de leitura`; não são renderizados editar,
criar, duplicar ou excluir. Os
workouts continuam navegáveis e a coluna Ações informa “Somente leitura”. Não há
booleans independentes de capability: a união `source` escolhe uma composição
inteira.

Loading mostra breadcrumbs e skeleton; falha/entrada removida mostra retry. Vazio
mantém a tabela e informa ausência de treinos. Alteração global por SSE invalida a
leitura da referência. Exclusão global posterior torna a entrada indisponível e a
limpeza administrativa a remove do catálogo sem fallback ativo.

## Integrações, navegação e acessibilidade

Usa `GET/PATCH /training-plans/:catalogEntryId` e operações de workouts sob o
mesmo prefixo. Breadcrumbs ligam Home → Meus planos → plano; workout avança para
`/training-plan/:catalogEntryId/workout/:workoutId`. Formulários e dialogs mantêm
labels, foco e teclado dos componentes compartilhados.

No plano próprio, `Ctrl+Enter` confirma a edição inline do título. Criar workout
só navega depois do sucesso e usa o ID canônico retornado para abrir diretamente
`/training-plan/:catalogEntryId/workout/:workoutId`; falha mantém o detalhe.

O menu de cada treino próprio oferece `Duplicar` antes de `Excluir`. A ação copia
o treino completo para o final do mesmo plano, com nome terminado em ` (cópia)`
(prefixo limitado para respeitar 120 caracteres), IDs novos e imagens privadas
independentes. Tipos, campos e ordem dos exercícios são preservados; histórico e
cargas de execução não são copiados. A tela permanece no detalhe e só apresenta a
nova linha após confirmação, com toast `Treino duplicado.`. O menu fecha ao
selecionar porque não há formulário ou draft a preservar.

As escritas deste detalhe compartilham a FIFO do catálogo pessoal com o editor.
Durante uma gravação, ações de escrita ficam indisponíveis e a duplicação anuncia
`Duplicando treino…`. Falha conserva as linhas e mostra alerta persistente; uma
nova escolha de `Duplicar` permite tentar novamente. Conflito exato de versão ou
resultado incerto pausa as escritas e exige leitura canônica por `Descartar e
recarregar` ou `Verificar dados`, respectivamente, sem reenvio automático.
A recuperação só libera a fila depois de uma
leitura bem-sucedida. Encerramento de sessão não publica resultado tardio.

Integração de duplicação: `POST
/training-plans/:catalogEntryId/workouts/:workoutId/duplicate`, body `{}` e
`X-Resource-Version`; usa o resumo canônico existente de criação de workout.

### Cenário — Duplicar treino próprio

Link para testar: `http://localhost:3000/training-plan/74b000000000000000000001?mockAuth=person&mockTrainingPlans=personal-mixed`

Abrir `Ações de Treino A` e escolher `Duplicar` mantém a rota, acrescenta
`Treino A (cópia)` com a mesma quantidade de exercícios e permite abrir seu
conteúdo completo. Duplicações consecutivas usam a versão confirmada anterior.
O seletor `duplicate-workout-error` falha uma vez antes de confirmar e permite
retry explícito; `version-conflict` exige recarga.
`duplicate-workout-uncertain` confirma no servidor simulado, devolve resultado
incerto e permite encontrar uma única cópia depois da releitura, sem replay.
Referências globais não mostram
o menu de escrita.

No plano `owned`, edição inline alterada ou preservada após falha registra um owner
na fronteira global de segurança de reload, e mutations pendentes são agregadas
pelo provider transversal. A atualização PWA espera silenciosamente até salvar,
cancelar ou descartar o draft. O modo `global-reference`, somente leitura, não
cria bloqueador por navegação ou consulta.

## Cenários e cobertura

- `...?mockAuth=person&mockTrainingPlans=personal-reference`: alerta read-only e
  nenhuma ação de escrita;
- `...?mockAuth=person&mockTrainingPlans=personal-mixed`: plano próprio editável;
- `...?mockAuth=person&mockTrainingPlans=detail-error`: erro recuperável.

Implementação em `personal-detail-page.tsx`; handlers/fixtures MSW compartilhados;
Playwright em `personal-training-plan.spec.ts`.

## Referências visuais de layout

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/training-plan-detail/desktop-1440-read-only.png` | `1440x900` | `personal-reference` | modelo disponibilizado em leitura no desktop |
| `assets/training-plan-detail/mobile-390-read-only.png` | `390x844` | `personal-reference` | detalhe somente leitura no mobile |
| `assets/training-plan-detail/desktop-1440-owned.png` | `1440x900` | `personal-mixed`, entrada própria | controles de edição e tabela do plano próprio |

## Precondição jurídica compartilhada

Além da sessão e das permissões desta rota, é necessário o aceite vigente. A
[barreira de termos](terms.md) intercepta entrada antes de montar negócio. Nova
publicação descoberta durante uso oculta a atividade com efeitos pausados e
preserva estado recuperável; concluir o aceite não repete mutation recusada.
Android continua sujeito às regras de comprovante e requisito mínimo desse fluxo.
