# Fluxo `Gestão de planos de treino globais`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

Uma pessoa com `isAdmin: true` mantém planos globais, seus treinos e uma lista
ordenada de exercícios tipados. A jornada termina no editor real, com autosave,
concorrência explícita e mídia processada pela API.

## Entrada e proteção

A UI resolve `GET /auth/me` e `GET /auth/csrf` no layout autenticado, aplica
`adminRoute` e usa a instância Axios única. A API reaplica sessão, admin, origem,
CSRF e rate limit. IDs pessoais continuam ocultos por
`404 TRAINING_PLAN_NOT_FOUND`. Em desenvolvimento, `mockAuth=admin` e
`mockTrainingPlans` selecionam estado MSW sem integrar o contrato de produção.

## Sequência

| Etapa | UI                             | API                                              |
| ----: | ------------------------------ | ------------------------------------------------ |
|     1 | abre coleção paginada          | `GET /global/training-plans?page=`               |
|     2 | cria/edita/exclui plano        | `POST`, `PATCH`, `DELETE /global/training-plans` |
|     3 | abre detalhe e mantém treinos  | detalhe, `POST/DELETE .../workouts`              |
|     4 | abre editor projetado          | `GET .../workouts/:workoutId`                    |
|     5 | edita nome e linhas            | PATCH de workout/exercício                       |
|     6 | cria, reordena ou exclui linha | POST, PUT order ou DELETE exercício              |
|     7 | associa ou remove imagem       | PUT multipart ou DELETE image                    |

1. A listagem ordena globalmente por criação e `_id`, usa 20 itens e limita a URL
   às páginas 1–100.
2. Criação de treino aguarda o ID real antes de navegar. Lista/detalhe carregam e
   conservam `version`; toda mutação de aggregate existente envia o ETag forte em
   `If-Match` e incorpora o ETag resultante ao próximo write.
3. A rota de workout faz uma leitura projetada com plano mínimo, nome, timestamps
   e até 50 exercícios. O breadcrumb é
   `Home / Planos de treino / <plano> / <treino>` apenas quando esses nomes foram
   resolvidos; falhas nunca mostram IDs.
4. O nome do treino usa edição inline otimista. Cada linha mantém draft e debounce
   independente de três segundos, enviando somente campos alterados.
5. Todos os timers, adições, exclusões, reordenação e mídia convergem numa fila
   FIFO por aggregate. A fila injeta a última versão, não faz retry de mutation e
   mantém outras linhas editáveis.
6. A criação recebe só o tipo e a API aplica defaults. Drag por ponteiro, toque ou
   teclado só persiste ao soltar e envia a ordem final completa. Exclusão usa
   confirmação e snapshot para rollback.
7. YouTube aceita ID/URLs permitidas, mas a API chama somente
   `img.youtube.com`; a UI deriva a miniatura do ID. Imagens JPEG/PNG/WebP são
   enviadas por `FormData`, validadas por bytes/pixels e transformadas em WebP de
   thumbnail/display sob o prefixo público `exercise-images/`, sem base64 ou
   original persistido.

## Concorrência e falhas

- `412 TRAINING_PLAN_VERSION_CONFLICT` preserva drafts, pausa a fila e mostra
  alerta persistente. `Recarregar dados` pede confirmação antes de descartar o
  trabalho local; não há reenvio automático.
- falha de autosave conserva texto e miniatura confirmada, encerra o status de
  saving e anuncia erro sem toast de sucesso;
- falha de criação remove somente a linha temporária; falha de ordem/exclusão
  restaura posição, item e draft;
- upload/substituição conserva a imagem anterior até o CAS; remoção de imagem nula
  e ordem já idêntica são no-op sem nova versão;
- primeira falha de leitura mostra estado persistente com retry; refetch falho com
  cache mantém o editor e usa alerta não bloqueante;
- `401` limpa CSRF/cache e volta à raiz; `403` e mutations não têm retry.

## Dados e privacidade

`TrainingPlanSummary`, detalhe e workout expõem `version`. `Exercise` é union dos
cinco tipos e `BodyArea` tem 16 valores compartilhados. Keys de Blob, documento
MongoDB, arquivo, URL informada, nomes, valores de campos e IDs nunca entram em
Analytics. Operações emitem somente início/terminal enumerados; drag emite uma vez
no drop e recarga de conflito é retry.

## Cenários vivos

1. Editor completo:
   `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin`.
2. Loading: acrescentar `mockTrainingPlans=loading`.
3. Falha de autosave: acrescentar `mockTrainingPlans=update-exercise-error`.
4. Conflito preservado: acrescentar `mockTrainingPlans=version-conflict`.
5. Falha de imagem: acrescentar `mockTrainingPlans=image-error`.
6. Proteção administrativa: remover `mockAuth=admin` e confirmar redirect.

## Cobertura automatizada

- E2E Nest/MongoDB/Redis: `api/test/training-plan.e2e-spec.ts`, incluindo ETags,
  discriminadores, limites, ordem, fronteira BSON e ownership.
- Vitest UI: services HTTP, fila FIFO/conflito, componentes e Analytics.
- Playwright: `ui/tests/integration/routes/training-plan.spec.ts` e
  `ui/tests/integration/flows/gestao-planos-treino.spec.ts`, sempre com Vite,
  Chromium e MSW Browser, sem API real nem `page.route`.
- Não há regressão visual porque as pastas de assets das rotas não contêm
  screenshots.
