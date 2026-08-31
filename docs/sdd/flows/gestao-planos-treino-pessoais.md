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
|     9 | Pedir ajuda     | modal da lista    | `/training-plan-assistant/session/**`     |

## Sequência e decisões

1. A lista pagina 20 itens e intercala entradas de catálogo válidas com jobs
   visíveis por criação, sem expor destino parcial.
2. Criar persiste árvore própria e catálogo, sem ativação automática.
3. Usar persiste só a referência; toda leitura resolve o global atual e toda
   mutação retorna `GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`.
4. Clonar captura snapshot, persiste job e só então chama o bridge assinado.
5. O Workflow reserva/assume o run, copia lotes e agrupa thumbnail/display em
   `exercise-images/{imageAssetId}/` com ID/pathnames determinísticos, confirma
   imagens e materializa a árvore. Cancelamento limpa destinos.
6. Conclusão remove a linha do job e torna o plano próprio navegável; falha mantém
   retry/cancelamento. Timeout ambíguo mantém geração e permite reentrega.
7. O radio substitui a seleção anterior; clicar o já ativo não o desmarca.
8. Excluir próprio ou desvincular limpa a seleção se necessário, sem fallback.
9. Excluir global remove vínculos/seleções, mas jobs continuam pelo snapshot.
10. Pedir ajuda abre uma sessão separada e retomável. A API coleta uma pergunta
    por vez, calcula triagem local e só chama o provider para operações restritas.
    Respostas rápidas são atalhos; paráfrases são interpretadas, campos parciais
    são preservados e frequência/duração aceitam combinações livres validadas de
    2 a 7 dias e 15 a 120 minutos. A mesma mensagem pode adiantar respostas
    objetivas futuras não sensíveis, que são validadas pelo catálogo e evitam
    perguntas repetidas; triagem, maioridade e aceite nunca são antecipados.
    Bloqueio encerra a geração; pessoa apta revisa uma prévia antes de confirmar.
11. A confirmação reserva IDs, materializa a árvore completa e depois a entrada
    `owned`, inativa. Só após recibo idempotente a sessão sensível é apagada; o
    catálogo jamais lista uma árvore parcial sem entrada.

## Dados compartilhados

| Dado                 | Origem       | Consumidores         | Persistência  | Observações                             |
| -------------------- | ------------ | -------------------- | ------------- | --------------------------------------- |
| catálogo             | API pessoal  | UI                   | MongoDB       | owner ou referência                     |
| seleção ativa        | pessoa       | API/UI/admin         | MongoDB       | zero ou uma por pessoa                  |
| snapshot/job         | API          | Workflow/UI          | MongoDB       | conteúdo imutável por geração           |
| mídia                | Blob privado | API/Workflow/UI      | Vercel Blob   | duas variantes WebP                     |
| sessão assistida     | API          | UI/provider restrito | MongoDB + TTL | sensível, sete dias e exclusão imediata |
| recibo do assistente | API          | retry de confirmação | MongoDB + TTL | somente pessoa, hash e IDs por 24 horas |

## Estados e exceções

- Caminho completo: criação/referência imediata ou clone concluído.
- Interrupção ou retomada: Workflow redeliver e retry manual idempotentes.
- Erro recuperável: `start-failed`/`failed` com retry e cancelamento.
- Erro não recuperável: catálogo/recurso ausente ou referência somente leitura.
- Indisponibilidade: listagem mantém último cache; bridge retorna 503 sem apagar job.
- Assistente: provider indisponível preserva a sessão/preview e criação manual
  continua; conflito 412 força releitura, sem merge; desistência e expiração
  apagam os dados sensíveis.

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

### Cenário 4 — Assistente retomável e seguro

- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-collecting`
- Given: existe uma sessão em coleta.
- When: responde, recarrega e reabre “Me ajude a criar”.
- Then: a API restaura a versão canônica; nenhuma resposta é guardada no storage
  do navegador e Escape/backdrop apenas ocultam a modal.

### Cenário 5 — Bloqueio e preview

- Links para testar: usar `assistant-blocked`, `assistant-emergency` ou
  `assistant-preview` no mesmo parâmetro `mockTrainingPlans`.
- Given: a triagem local bloqueou ou concluiu apta.
- When: a pessoa revisa o resultado.
- Then: bloqueio não oferece geração; preview mostra estrutura completa e a
  confirmação cria um plano próprio inativo e navega ao detalhe.

## Cobertura automatizada

- API E2E: `api/test/training-plan.e2e-spec.ts`.
- Workflow: specs de services e `workflow-spike.workflow.spec.ts`.
- Playwright: `ui/tests/integration/routes/personal-training-plan.spec.ts`.
- MSW: `ui/src/mocks/handlers/training-plans.ts`.
- Assistente API: `api/test/training-plan.e2e-spec.ts` e
  `api/docs/sdd/endpoints/training-plan-assistant.md`.
- Assistente UI/MSW: `ui/src/mocks/handlers/training-plan-assistant.ts` e os
  cenários Playwright da rota pessoal.
