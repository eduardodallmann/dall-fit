# Rota `/dash`

## Objetivo funcional

- Ator: pessoa autenticada, comum ou administradora.
- Resultado: orientar a próxima ação e resumir atividade pessoal; administradores
  recebem, depois do conteúdo pessoal, uma seção adicional exclusivamente agregada.
- Fluxos relacionados: `../../../../docs/sdd/flows/login-google.md` e
  `../../../../docs/sdd/flows/execucao-de-treino.md`.

O shell, menu responsivo, identidade, tema, PWA, conectividade e guards continuam
sendo os documentados na arquitetura base. A rota filha preenche somente a região
principal e não muda largura ou breakpoint do menu.

## Entradas e pré-condições

`/dash` exige a proteção autenticada já concluída, incluindo pessoa e CSRF na Web.
A query de desenvolvimento `mockDashboard` aceita `empty`, `personal`,
`session-running`, `personal-error`, `admin` e `admin-error`. `mockAuth` continua
controlando autenticação e perfil fictícios; `mockAuth=admin` habilita a seção
administrativa.

A UI resolve `Intl.DateTimeFormat().resolvedOptions().timeZone` e mantém duas
queries separadas:

- `GET /dashboard?timezone=...`, sempre;
- `GET /admin/dashboard?timezone=...`, somente com `Person.isAdmin === true`.

Cada query usa `staleTime` de um minuto, uma repetição apenas para falha transitória
permitida, refetch ao recuperar conexão e ao focar quando stale, sem polling.
TanStack Query entrega seu `AbortSignal` ao client Axios; o interceptor também o
combina ao sinal da geração autenticada. Sair da tela ou encerrar sessão cancela a
leitura e impede callbacks de outra geração.

## Conteúdo pessoal

A região pessoal é um `section` nomeado pelo `h1` `Visão geral`, seguido da frase
neutra `Seu treino em um só lugar.`. Ela contém, nesta ordem:

1. Card `Próximo treino`, com nomes de plano/workout quando aplicável e uma única
   ação dominante: escolher um plano, escolher entre planos em uso, começar treino
   ou retomar treino. Com vários ativos, `Escolher treino` navega a `/training`
   sem eleger um plano.
2. Card `Esta semana`, com sete dias de segunda a domingo, marca textual e visual
   das conclusões, `X treinos concluídos` e `X de Y treinos` quando existe plano.
3. `Últimos 30 dias`, com cards de conclusões, duração em horas/minutos e percentual
   de conclusões completas.
4. Card `Ritmo de treino`, com oito linhas cronológicas. Cada linha mostra período,
   `Meter` e contagem textual; cor e comprimento não são a única informação.
5. Card `Atividades recentes`, com até cinco links para
   `/training/completion/:workoutExecutionId`. Cada linha mostra workout, plano,
   data/hora local, duração e `Completo` ou `Parcial`.

Sem plano ou histórico não é erro: a ação orienta escolher plano, KPIs usam zero,
os oito períodos permanecem presentes e recentes mostra uma mensagem útil.

## Conteúdo administrativo

Somente administradores montam uma segunda `section`, nomeada pelo `h2` `Visão
administrativa`, depois de todo o conteúdo pessoal. Ela apresenta:

- total de pessoas, novas nos últimos 30 dias, com plano ativo e que treinaram no
  período;
- conclusões, duração e percentual completo nos últimos 30 dias;
- oito semanas com conclusões e pessoas ativas, ambas em texto;
- modelos globais, planos próprios, referências globais e seleções ativas;
- `Table` `Modelos mais utilizados`, com nome como row header e colunas de pessoas
  vinculadas e com o modelo ativo.

A seção não renderiza PII nem links de drill-down. Pessoa comum não chama o
endpoint administrativo e não recebe heading, skeleton ou espaço reservado.

## Estados e falhas

- Loading pessoal: seis `Skeletons` com status `Carregando sua visão geral`.
- Sucesso vazio ou com histórico: composição completa descrita acima.
- Erro pessoal: `Alert` recuperável substitui apenas o conteúdo da rota; menu e
  identidade continuam disponíveis.
- Loading administrativo: skeletons somente abaixo de `Visão administrativa`.
- Erro administrativo: alert e retry locais; o conteúdo pessoal permanece.
- Retry explícito emite Analytics, refaz somente sua query e move foco ao alerta
  apenas se a nova tentativa também terminar em erro.
- A barreira Web/PWA offline e o bloqueio Android por versão continuam precedendo
  e substituindo toda a árvore privada.

## Navegação e invalidação

`select-plan` navega a `/training-plan`. `start-workout` e `resume-workout`
navegam a `/training/workout/:workoutId`; retomada usa o workout do snapshot da
sessão. Uma atividade recente abre seu resumo durável sem reload do documento.

Quando a conclusão de treino é confirmada, o sucesso remove/invalida sessão,
queries de treino e todas as queries sob a chave `dashboard`. Assim, a próxima
abertura de `/dash` não reapresenta métricas confirmadamente antigas; para admin, a
mesma invalidação alcança também o agregado já presente no cache.

## Responsividade e acessibilidade

Cards usam uma coluna abaixo de `768px`; a partir desse breakpoint, ação/semana e
KPIs formam grids sem mudar a ordem semântica. O conteúdo tem largura máxima
legível. A tabela usa o `ScrollContainer` oficial e não amplia o viewport.

Headings são contínuos (`h1`, `h2`, títulos de Card `h3`), regions são nomeadas,
todos os indicadores têm valor textual, `Meter` recebe nome acessível, a tabela
possui nome/cabeçalhos/row header e links/botões preservam foco visível. Datas são
formatadas em `pt-BR` no timezone enviado, sem alterar os valores canônicos.

Toda composição usa HeroUI `Card`, `Meter`, `Table`, `Skeleton`, `Alert`, `Button`
e `Typography`. Classes e variantes próprias ficam exclusivamente em
`ui/src/routes/dashboard/styles.ts` por `tv` de `@heroui/styles`.

## Analytics

- A ação principal emite `ui_navigation_selected`, `surface=dashboard`,
  `control=dashboard_action`, `navigation_kind=dashboard_action` e destino
  `training_plans`, `training_start` ou `training_resume`.
- Atividade recente emite `ui_navigation_selected` com
  `destination=training_completion` e `navigation_kind=row_link`.
- Retry emite `ui_retry_requested` com `resource=dashboard` ou
  `resource=admin_dashboard`.
- Métricas, timezone, tipo de pessoa, nomes, IDs e agregados nunca entram em
  Analytics.

## Cenários funcionais

### Pessoa sem plano

- Link: `http://localhost:3000/dash?mockDashboard=empty`.
- Resultado: escolher plano, zeros, oito semanas e estado recente vazio, sem seção
  administrativa.

### Histórico pessoal

- Link: `http://localhost:3000/dash?mockDashboard=personal`.
- Resultado: próximo workout, métricas e cinco links conforme a fixture.

### Sessão prevalente

- Link: `http://localhost:3000/dash?mockDashboard=session-running`.
- Resultado: `Retomar treino` usa o workout do snapshot.

### Administração

- Link:
  `http://localhost:3000/dash?mockAuth=admin&mockDashboard=admin`.
- Resultado: conteúdo pessoal completo seguido dos agregados e tabela.

### Falha pessoal recuperável

- Link: `http://localhost:3000/dash?mockDashboard=personal-error`.
- Resultado: o retry real substitui o alerta por conteúdo sem desmontar o shell.

### Falha administrativa isolada

- Link:
  `http://localhost:3000/dash?mockAuth=admin&mockDashboard=admin-error`.
- Resultado: pessoal preservado; somente a seção administrativa falha e recupera.

## Referências visuais

| Cenário | Viewport | Estado MSW | Imagem | Aspectos de layout relevantes |
| ------- | -------: | ---------- | ------ | ----------------------------- |
| Administração desktop | `1440x900` | `mockAuth=admin`, `mockDashboard=admin` | `assets/dash/desktop-1440-menu.png` | menu persistente com acessos jurídicos, grids pessoais e administrativos, tendência, recentes e tabela em página completa |
| Administração mobile | `390x844` | `mockAuth=admin`, `mockDashboard=admin` | `assets/dash/mobile-390-dashboard.png` | dashboard completo em coluna única, sem overlay, com cards, tendência, recentes e tabela |
| Administração mobile com menu | `390x844` | `mockAuth=admin`, `mockDashboard=admin`, abrir menu | `assets/dash/mobile-390-menu-open.png` | drawer, backdrop, controles da conta e agrupamento dos acessos pessoais, administrativos e jurídicos |

São referências exclusivas de layout; conteúdo e comportamento são definidos por
este documento.

## Cobertura automatizada

Vitest cobre formato, service/query, ações, métricas, tendência, acessibilidade,
presença administrativa e falhas isoladas. Playwright cobre os cenários mockados,
navegação, retry, invalidação, viewports e ausência de request administrativa para
pessoa comum.

## Substituição por leitura e aceite

Pessoa/CSRF são seguidos da verificação jurídica antes de montar queries de métricas.
Sem aceite, a região principal apresenta [Termos de uso](terms.md), não o dashboard.
O menu comum mantém identidade, tema e saída sem links pessoais/instalação. Para
administradores, mantém Modelos de treino, Gestão de termos e Termos de uso. Sem publicação,
admin recebe `Configurar primeiro termo`; demais pessoas veem indisponibilidade e
retry. Falha/loading nunca expõem negócio. Depois do aceite, o dashboard conserva
sua composição e o menu acrescenta os acessos jurídicos dentro do mesmo grupo.
As referências do dashboard representam o acesso liberado. A composição da barreira
e da consulta jurídica está documentada nas
[referências de termos](terms.md#referências-visuais-de-layout).
Cenários: `http://localhost:3000/dash?mockTerms=required` e
`http://localhost:3000/dash?mockAuth=admin&mockTerms=not-configured`.
