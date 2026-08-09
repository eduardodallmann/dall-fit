# Rota `/global/training-plan/:trainingPlanId/workout/:workoutId`

## Objetivo funcional

- Problema resolvido: integrar a árvore e reservar um destino estável ao futuro
  editor de exercícios.
- Ator: pessoa administradora.
- Resultado: breadcrumb resolvido e aviso de editor ainda indisponível.
- Fluxo: `../../../../docs/sdd/flows/gestao-planos-treino-globais.md`.

## Entradas e pré-condições

IDs do plano e do treino vêm do path. A rota é filha de `adminRoute`; não possui
endpoint isolado de treino e reutiliza a query
`GET /global/training-plans/:trainingPlanId`.

## Caminho feliz

1. Carrega ou reutiliza o detalhe em cache.
2. Localiza o treino pelo ID entre os resumos.
3. Renderiza `Home / Planos de treino / <plano> / <treino>`.
4. Mostra o nome e informa que o editor será disponibilizado em outra etapa.

Não há formulário, mutation ou persistência nesta rota.

## Estados e caminhos alternativos

- Loading: breadcrumb apenas com segmentos já resolvidos e skeletons que
  representam o conteúdo da rota.
- Falha do detalhe sem cache: omite plano e treino, mostra `Alert` e retry.
- Falha em background com cache: preserva nomes válidos.
- Plano carregado e treino ausente: mantém o nome do plano, omite o segmento do
  treino e mostra `Treino não encontrado`.
- Nenhum breadcrumb usa ID, placeholder ou mensagem de erro como label.

## Navegação e acessibilidade

Ancestrais usam navegação SPA pelo TanStack Router; o último item é atual e não é
link. Nomes longos são truncados apenas visualmente e permanecem no `title`. O
alerta não depende de cor. Voltar retorna ao detalhe com seu cache.
Textos visíveis e nomes acessíveis usam `treino`; `workout` permanece somente nos
identificadores técnicos da rota e do contrato.

## Analytics

Breadcrumbs emitem somente destinos enumerados e a rota comum normaliza os dois
segmentos dinâmicos. Quando a falha sem cache oferece `Tentar novamente`, a ação
emite `ui_retry_requested` para `workout`. IDs, nomes, query e conteúdo do plano ou
treino não são enviados.

## Referências visuais de layout

Não se aplica — não existem imagens em
`routes/assets/global-training-plan-workout/`.

## Cenários funcionais e cobertura

- Sucesso: criar treino pelo detalhe e chegar ao ID devolvido pelo MSW.
- Loading: usar `mockTrainingPlans=loading`; skeletons precedem o conteúdo.
- Ausente:
  `/global/training-plan/64b000000000000000000001/workout/workout-ausente?mockAuth=admin`.
- Falha de plano: usar `mockTrainingPlans=detail-error`; somente ancestrais
  estáticos permanecem.
- Arquivo: `src/routes/training-plan/workout-page.tsx`.
- Specs: `tests/integration/routes/training-plan.spec.ts` e
  `tests/integration/flows/gestao-planos-treino.spec.ts`.
