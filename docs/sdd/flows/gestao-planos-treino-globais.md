# Fluxo `Gestão de planos de treino globais`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

Uma pessoa com `isAdmin: true` mantém planos globais, seus treinos e uma lista
ordenada de exercícios tipados. A jornada termina no editor real, com autosave,
concorrência explícita e mídia processada pela API.
Lista, detalhe e workout também mostram o impacto atual em referências pessoais e
seleções ativas, sem transformar essas métricas em bloqueio administrativo.

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
   às páginas 1–100. Página 1 omite `page`; formas inválidas são substituídas antes
   da consulta. A janela visual possui no máximo sete posições com primeira,
   última, vizinhança e elipses. Se o total revelar página excedente, a rota usa
   `replace` para consultar a última página sem apresentar vazio incoerente.
   Cada linha mostra vinculadas/ativas na mesma coluna de impacto. A confirmação
   de exclusão repete os números e alerta que pessoas podem ficar sem ativo.
2. Formulários inline/modais e confirmações permanecem durante pending e falha,
   preservam draft e fecham somente após sucesso. Criação de treino aguarda o ID
   real antes de navegar. Lista/detalhe carregam e conservam `version`; toda mutação
   de aggregate existente entra no coordenador FIFO compartilhado pelo
   `QueryClient`, recebe a versão na cabeça da fila e incorpora o header retornado
   ao próximo write. Planos diferentes não se bloqueiam.
3. A rota de workout faz uma leitura projetada com plano mínimo, nome, timestamps
   e até 50 exercícios. O breadcrumb é
   `Home / Planos de treino / <plano> / <treino>` apenas quando esses nomes foram
   resolvidos; falhas nunca mostram IDs.
4. O nome do treino separa confirmado e draft e só fecha após sucesso. Cada linha
   mantém confirmado, draft, patch dirty, revisão por campo, erro e debounce
   independente de três segundos, enviando somente campos alterados.
5. Autosaves, nome, adições, exclusões, reordenação e mídia convergem no mesmo
   coordenador FIFO do aggregate. Ele injeta a última versão, não faz retry de
   mutation e mantém outras linhas editáveis. Os estados de espera do autosave e
   de salvamento da fila não geram mensagens visuais globais; o pending continua
   representado internamente e anunciado para tecnologia assistiva.
6. A criação recebe só o tipo e a API aplica defaults; a linha temporária não
   aceita edição, mídia, exclusão ou ordem. No máximo uma operação estrutural fica
   pendente. Lista vazia mostra orientação acima da adição. Drag por ponteiro,
   toque ou teclado mostra item flutuante e destino, só persiste ao soltar e envia
   a ordem final completa; ao soltar, o overlay desaparece sem retornar visualmente
   à origem e a lista permanece no destino. `Escape` cancela sem request. Exclusão
   durante debounce cancela o timer e captura draft, dirty e posição para rollback
   localizado.
7. YouTube aceita ID/URLs permitidas, mas a API chama somente
   `img.youtube.com`; a UI deriva a miniatura clicável do ID e abre o vídeo em
   modal amplo com nome do exercício e player carregado sob demanda, sem som, sem
   forçar legendas e desmontado ao fechar. Short preserva 9:16 e vídeo longo
   preserva 16:9; os overlays de mídia encerram conteúdo e modal juntos, sem
   animação de saída.
   Imagens JPEG/PNG/WebP são
   enviadas por `FormData`, validadas por bytes/pixels e transformadas em WebP de
   thumbnail/display sob `exercise-images/` no Blob privado, sem base64 ou
   original persistido. Depois da autorização, a API assina cada pathname exato
   para `get` por quinze minutos e inclui as duas URLs e sua expiração no array de
   exercícios. O navegador baixa os bytes diretamente do Blob/CDN. A miniatura
   abre `displayUrl` em modal; sem imagem, clique, teclado ou drop de um arquivo
   usam a mesma validação e operação.
8. Todo sucesso do editor atualiza a query do workout e os resumos afetados no
   detalhe/listas do mesmo cenário. Voltar pelo breadcrumb e reabrir o treino usa
   nome, exercícios, ordem, mídia, contagem e versão confirmados, sem refresh
   manual; falha ou cancelamento não promove draft ao cache.
9. A UI agenda a renovação dois minutos antes da primeira expiração e também a
   verifica quando o documento volta a ficar visível. Refetch substitui somente a
   mídia confirmada/draft correspondente e não remonta o editor. Falha da imagem
   perto da expiração tenta uma renovação por ciclo; falha persistente mostra
   fallback acessível e retry explícito.
10. O layout administrativo mantém uma conexão SSE por documento. Escritas
    efetivas publicam invalidações via Redis para outras abas, dispositivos,
    pessoas e runtimes. Lista, detalhe e workout reconciliam por HTTP; todo
    `realtime-ready` também invalida queries para recuperar perdas.
11. Excluir um global permanece permitido com qualquer impacto: a API limpa
    referências e seleções sem fallback. Jobs já persistidos continuam pelo
    snapshot e suas keys de origem ficam retidas até o estado terminal.

## Concorrência e falhas

- somente `412 TRAINING_PLAN_VERSION_CONFLICT` ou uma invalidação SSE externa
  enquanto existe trabalho local preserva drafts, pausa a fila e
  mostra alerta persistente. Um `412` externo sem esse código é falha genérica,
  não pausa a fila e não é interpretado como conflito. `Recarregar dados` pede
  confirmação antes de descartar o trabalho local na lista e no detalhe. No
  workout, `Descartar e recarregar` atua diretamente no alerta; o draft só é
  descartado após leitura bem-sucedida. Não há reenvio automático.
- rollbacks de plano, workout ou exercício alteram somente entidade, token, delta
  de total ou posição daquela operação; mudanças concorrentes posteriores não são
  substituídas e detalhe de plano só é removido do cache após DELETE bem-sucedido;
- falha de autosave conserva texto e miniatura confirmada, encerra o status de
  saving, mantém patch dirty e oferece retry explícito sem toast de sucesso;
- falha de criação remove somente a linha temporária; falha de ordem/exclusão
  restaura ordem relativa ou item/posição/draft corrente sem PATCH oculto;
- upload/substituição conserva a imagem anterior até o CAS; enquanto uma operação
  de mídia espera ou executa, área, preview e ações aplicáveis ficam desabilitados
  com spinner contextual, sem mensagem visual redundante. Falha restaura o estado
  interativo anterior. Remoção de imagem nula e ordem já idêntica são no-op sem
  nova versão;
- falha de assinatura antes do CAS compensa as novas variantes e devolve
  `503 IMAGE_URL_SIGNING_FAILED`; uma leitura não devolve array parcialmente
  assinado;
- primeira falha de leitura mostra estado persistente com retry; refetch falho com
  cache mantém o editor e usa alerta não bloqueante;
- navegação no editor usa `AlertDialog` enquanto houver draft, debounce, fila,
  estrutura ou erro recuperável; sair cancela timers locais, enquanto
  `beforeunload` permanece somente como aviso nativo;
- `401` encerra uma única geração, aborta requests, limpa CSRF/cache e reseta o
  coordenador antes de voltar à raiz; respostas concorrentes não duplicam a
  transição;
- `403 CSRF_VALIDATION_FAILED` renova o token sem reenviar a mutation e preserva o
  draft para retry explícito; `403 ADMIN_ACCESS_REQUIRED` revalida a pessoa e volta
  a `/dash` sem logout; outros `403` permanecem proprietários;
- queries encaminham `AbortSignal` ao Axios e usam timeout/retry transversal;
  upload usa 60 segundos, mutations não têm retry e timeout de write exige
  reconciliação antes de nova tentativa;
- o coordenador continua específico de planos, mas registra seu reset no ciclo
  transversal de sessão; nova pessoa não herda ID, versão, pausa, fila ou draft.

## Dados e privacidade

`TrainingPlanSummary`, detalhe e workout expõem `version`. `Exercise` é union dos
cinco tipos e `BodyArea` tem 16 valores compartilhados. Keys de Blob, pathnames,
signed URLs e seus parâmetros, documento MongoDB, arquivo, URL informada, nomes,
valores de campos e IDs nunca entram em Analytics, logs ou armazenamento
persistente da UI. Operações emitem somente início/terminal enumerados; drag emite
uma vez no drop e recarga de conflito é retry.

## Cenários vivos

1. Editor completo:
   `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin`.
2. Loading: acrescentar `mockTrainingPlans=loading`.
3. Falha de autosave: acrescentar `mockTrainingPlans=update-exercise-error`.
4. Conflito preservado: acrescentar `mockTrainingPlans=version-conflict`.
5. Falha de imagem: acrescentar `mockTrainingPlans=image-error`.
6. Paginação grande: usar `large-pagination&page=50`; página acima do total:
   `two-pages&page=100`.
7. Exclusão durante debounce: acrescentar
   `mockTrainingPlans=delete-exercise-error`; rollback de ordem:
   `mockTrainingPlans=reorder-error`.
8. Proteção administrativa: remover `mockAuth=admin` e confirmar redirect.
9. CSRF renovável: usar `mockAuth=csrf-refresh&mockTrainingPlans=csrf-refresh`.
10. Revogação administrativa: usar `mockAuth=admin-revoked` e revalidar por foco.
11. URL expirada e renovação: acrescentar
    `mockTrainingPlans=image-signed-url-expired`.

## Cobertura automatizada

- E2E Nest/MongoDB/Redis: `api/test/training-plan.e2e-spec.ts`, incluindo versões
  de recurso, discriminadores, limites, ordem, fronteira BSON e ownership.
- Vitest UI: services HTTP, paginação pura, coordenador FIFO/conflito, rollbacks,
  propagação da versão após a fila ficar ociosa, merge/restauração de draft,
  componentes e Analytics.
- Playwright: `ui/tests/integration/routes/training-plan.spec.ts` e
  `ui/tests/integration/flows/gestao-planos-treino.spec.ts`, sempre com Vite,
  Chromium e MSW Browser, incluindo adições consecutivas sem regressão de versão e
  sem API real nem `page.route`.
- Não há regressão visual porque as pastas de assets das rotas não contêm
  screenshots.
