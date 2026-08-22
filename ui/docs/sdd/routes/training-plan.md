# Rota `/training-plan`

## Objetivo funcional

Catálogo de planos de qualquer pessoa autenticada, inclusive admin. Reúne planos
próprios, referências globais e linhas transitórias de clonagem; nenhum global
aparece sem a pessoa usar ou clonar. A query `page` segue paginação canônica de 20.

## Elementos, ações e estados

O cabeçalho “Meus planos” possui dropdown “Novo plano”: “Criar novo plano” abre o
formulário existente; “Copiar um plano” abre a biblioteca global paginada com
resumo de workouts/exercícios e ações “Clonar”/“Usar esse plano”. Ao iniciar uma
dessas ações, ambas ficam imediatamente bloqueadas somente para a mesma origem
enquanto o request estiver pendente. Uma origem com clone ativo da mesma pessoa
continua bloqueada na modal após a confirmação do job.

A tabela possui Nome, Origem, Em uso, Atualização e Ações. O radio não é a primeira
coluna, possui um único `name`, fica desabilitado no item ativo e nunca desmarca ao
ser clicado. Pode não haver nenhum ativo. A seleção aplica imediatamente um realce
discreto e persistente às células da linha ativa; falha restaura o destaque
confirmado anterior. Plano próprio oferece editar/excluir; referência oferece
navegação e “Excluir”, que visualmente remove o item mas envia desvinculação sem
versão.

Job aparece como linha não navegável “Clonando”, com estado/progresso. Em
`failed|start-failed` oferece retry; enquanto não terminal oferece cancelar. A
lista consulta novamente a cada dois segundos enquanto houver job. Conclusão troca
a linha por plano próprio inativo; cancelamento remove a linha.

Loading usa empty/skeleton da tabela; vazio orienta criar ou escolher modelo; erro
mostra “Tentar novamente”. Mutations permanecem pending, invalidam catálogo e
biblioteca no sucesso e exibem toast/erro sem inventar estado concluído.

## Integrações e navegação

- `GET/POST /training-plans`, `GET /training-plans/library`;
- `POST /training-plans/global-references`, `PUT /training-plans/active`;
- `POST/DELETE /training-plan-clone-jobs` e `POST .../retry`;
- clique no nome avança para `/training-plan/:catalogEntryId`;
- SSE global invalida catálogo/biblioteca; polling limitado garante progresso se o
  stream for perdido.

## Acessibilidade

Tabela possui headers semânticos, nome como row header, radio rotulado pelo plano,
menus/dropdown operáveis por teclado e ações de clone com labels específicos. A
linha inteira não é usada como controle de seleção.

## Cenários funcionais e cobertura

1. `?mockAuth=person&mockTrainingPlans=personal-mixed`: próprio e referência na
   mesma tabela; troca do radio mantém somente um ativo.
2. `?mockAuth=admin&mockTrainingPlans=personal-mixed`: admin também vê “Meus
   planos”, mantendo “Planos globais” separado no menu.
3. `?mockAuth=person&mockTrainingPlans=clone-running`: ações mutuamente bloqueadas
   durante o início, linha bloqueada, progresso e cancelamento.
4. `?mockAuth=person&mockTrainingPlans=clone-failed`: retry e cancelamento.

Implementação em `personal-list-page.tsx`, service/queries da rota; MSW em
`src/mocks/handlers/training-plans.ts`; Playwright em
`tests/integration/routes/personal-training-plan.spec.ts`. Não há referência visual.
