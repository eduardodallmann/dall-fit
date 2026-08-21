# Fluxo `gestão de planos de treino pessoais`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

- Ator: qualquer pessoa autenticada, inclusive administradora.
- Problema resolvido: criar, usar, clonar, consultar e selecionar planos pessoais.
- Resultado esperado: catálogo único com conteúdo próprio, referências globais
  vivas e operações de clone bloqueadas até conclusão.

## Entrada e pré-condições

Sessão e CSRF válidos. Rotas globais continuam exigindo `isAdmin`; rotas pessoais
não confiam em pessoa, owner ou escopo enviados pelo cliente.

## Rotas e endpoints participantes

| Ordem | Etapa           | Rota de UI        | Endpoint da API                           |
| ----: | --------------- | ----------------- | ----------------------------------------- |
|     1 | Listar catálogo | `/training-plan`  | `GET /training-plans`                     |
|     2 | Criar próprio   | `/training-plan`  | `POST /training-plans`                    |
|     3 | Escolher global | modal da lista    | `GET /training-plans/library`             |
|     4 | Usar global     | modal da lista    | `POST /training-plans/global-references`  |
|     5 | Clonar          | modal/linha       | `POST /training-plan-clone-jobs`          |
|     6 | Executar clone  | não se aplica     | `POST /internal/training-plan-clone-runs` |
|     7 | Navegar/editar  | detalhe e workout | `/training-plans/:catalogEntryId/**`      |
|     8 | Marcar ativo    | lista             | `PUT /training-plans/active`              |

## Sequência e decisões

1. A lista pagina 20 itens e intercala entradas de catálogo válidas com jobs
   visíveis por criação, sem expor destino parcial.
2. Criar persiste árvore própria e catálogo, sem ativação automática.
3. Usar persiste só a referência; toda leitura resolve o global atual e toda
   mutação retorna `GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`.
4. Clonar captura snapshot, persiste job e só então chama o bridge assinado.
5. O Workflow reserva/assume o run, copia lotes, confirma imagens e materializa
   IDs/pathnames determinísticos. Cancelamento limpa destinos.
6. Conclusão remove a linha do job e torna o plano próprio navegável; falha mantém
   retry/cancelamento. Timeout ambíguo mantém geração e permite reentrega.
7. O radio substitui a seleção anterior; clicar o já ativo não o desmarca.
8. Excluir próprio ou desvincular limpa a seleção se necessário, sem fallback.
9. Excluir global remove vínculos/seleções, mas jobs continuam pelo snapshot.

## Dados compartilhados

| Dado          | Origem       | Consumidores    | Persistência | Observações                   |
| ------------- | ------------ | --------------- | ------------ | ----------------------------- |
| catálogo      | API pessoal  | UI              | MongoDB      | owner ou referência           |
| seleção ativa | pessoa       | API/UI/admin    | MongoDB      | zero ou uma por pessoa        |
| snapshot/job  | API          | Workflow/UI     | MongoDB      | conteúdo imutável por geração |
| mídia         | Blob privado | API/Workflow/UI | Vercel Blob  | duas variantes WebP           |

## Estados e exceções

- Caminho completo: criação/referência imediata ou clone concluído.
- Interrupção ou retomada: Workflow redeliver e retry manual idempotentes.
- Erro recuperável: `start-failed`/`failed` com retry e cancelamento.
- Erro não recuperável: catálogo/recurso ausente ou referência somente leitura.
- Indisponibilidade: listagem mantém último cache; bridge retorna 503 sem apagar job.

## Cenários funcionais

### Cenário 1 — Catálogo misto

- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=personal-mixed`
- Given: pessoa com plano próprio e referência global.
- When: abre a lista e troca o radio.
- Then: ambos aparecem juntos e somente o novo item permanece ativo.

### Cenário 2 — Referência somente leitura

- Link para testar: `http://localhost:3000/training-plan/74b000000000000000000002?mockAuth=person&mockTrainingPlans=personal-reference`
- Given: referência válida.
- When: navega por detalhe e workout.
- Then: vê toda informação sem controles de gravação, exclusão ou movimento.

### Cenário 3 — Clone recuperável

- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=clone-failed`
- Given: job falhou após ser persistido.
- When: solicita retry ou cancelamento.
- Then: a linha continua bloqueada e reflete a nova transição.

## Cobertura automatizada

- API E2E: `api/test/training-plan.e2e-spec.ts`.
- Workflow: specs de services e `workflow-spike.workflow.spec.ts`.
- Playwright: `ui/tests/integration/routes/personal-training-plan.spec.ts`.
- MSW: `ui/src/mocks/handlers/training-plans.ts`.
