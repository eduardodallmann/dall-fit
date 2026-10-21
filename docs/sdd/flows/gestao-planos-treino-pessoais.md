# Fluxo `gestão de planos de treino pessoais`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

- Ator: qualquer pessoa autenticada, inclusive administradora.
- Problema resolvido: criar, usar, clonar, consultar e selecionar planos pessoais.
- Resultado esperado: catálogo único com conteúdo próprio, referências globais
  vivas e operações de clone bloqueadas até conclusão.

Na comunicação da UI, essas referências são apresentadas como modelos
disponibilizados; `global` permanece no domínio técnico e nos contratos.

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
|     8 | Alternar uso    | lista             | `PUT /training-plans/active`              |
|     9 | Pedir ajuda     | modal da lista    | `/training-plan-assistant/session/**`     |
|    10 | Buscar exercícios | modal do workout próprio | `GET /training-plans/exercise-library` |
|    11 | Copiar conjunto | mesmo workout | `POST /training-plans/:catalogEntryId/workouts/:workoutId/exercises/copy` |

## Sequência e decisões

1. A lista pagina 20 itens e intercala entradas de catálogo válidas com jobs
   visíveis por criação, sem expor destino parcial.
2. Criar persiste árvore própria e catálogo, sem ativação automática.
   O formulário pessoal usa somente o heading principal, sem repetir
   `Identificação do plano`.
3. Usar persiste só a referência; toda leitura resolve o global atual e toda
   mutação retorna `GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY`.
4. Clonar captura snapshot, persiste job e só então chama o bridge assinado.
5. O Workflow reserva/assume o run, copia lotes e agrupa thumbnail/display em
   `exercise-images/{imageAssetId}/` com ID/pathnames determinísticos, confirma
   imagens e materializa a árvore. Cancelamento limpa destinos.
6. Conclusão remove a linha do job e torna o plano próprio navegável; falha mantém
   retry/cancelamento. Timeout ambíguo mantém geração e permite reentrega.
7. Cada checkbox ativa ou desativa sua entrada independentemente. A API mantém de
   zero a cinco IDs únicos e rejeita atomicamente a sexta ativação; no limite, a
   UI desabilita somente itens desmarcados. Após sucesso, a UI invalida catálogo,
   dashboard e `/training`. No Android, o coordenador reconcilia todos os ativos.
8. Excluir próprio ou desvincular remove a entrada do conjunto, sem fallback.
   Se a entrada era ativa, a UI remove o cache de `/training` para obrigar leitura
   canônica na próxima visita e limpa o preparado Android, preservando sessão e
   snapshots de execução independentes.
9. Excluir global remove vínculos/seleções, mas jobs continuam pelo snapshot.
10. Pedir ajuda abre uma sessão separada e retomável. A API coleta uma pergunta
    por vez, calcula triagem local e só chama o provider para operações restritas.
    Respostas rápidas são atalhos; paráfrases são interpretadas, campos parciais
    são preservados e frequência/duração aceitam combinações livres validadas de
    2 a 7 dias e 15 a 120 minutos. A mesma mensagem pode adiantar respostas
    objetivas futuras não sensíveis, que são validadas pelo catálogo e evitam
    perguntas repetidas; triagem, maioridade e aceite nunca são antecipados.
    Histórico de prática não vira nível de experiência por inferência: a API
    mantém a pergunta subjetiva, contextualiza a confirmação e extrai localmente
    uma interrupção objetiva informada na mesma frase, mesmo se o provider omitir
    esse dado.
    Na triagem respiratória, a tela distingue falta de ar fora do normal em
    repouso daquela que ocorre com esforço leve. Nenhuma condição é inferida pelo
    nome: a triagem usa uma pergunta geral sobre situações que exigem
    acompanhamento profissional, citando gestação e pós-parto somente como
    exemplos; `yes|unknown` bloqueiam conservadoramente. Bloqueio encerra a
    geração e mantém a orientação visível até o fechamento do modal; ao fechar, a
    UI exclui a sessão terminal para que a próxima abertura comece uma conversa
    nova.
    Pessoa apta revisa uma prévia antes de confirmar.
    Atualizações passivas acompanham o turno novo somente quando a pessoa já está
    próxima ao final; qualquer resposta ou retry local retoma o acompanhamento e
    leva o histórico completamente ao fim.
11. A confirmação reserva IDs, materializa a árvore completa e depois a entrada
    `owned`, inativa. Só após recibo idempotente a sessão sensível é apagada; o
    catálogo jamais lista uma árvore parcial sem entrada.
12. Criar um treino em plano próprio permanece no detalhe durante pending ou erro;
    somente o sucesso navega ao workout pelo ID devolvido. `Ctrl+Enter` salva os
    títulos inline de plano e treino pela mesma mutation dos botões.
13. Biblioteca sem resultados mostra `Nenhum modelo disponível`, orienta tentar
    mais tarde e omite as ações de uso e clone.
14. No workout próprio, `Adicionar exercício` → `Copiar exercícios` abre a
    biblioteca de exercícios globais, agrupados por nome. Busca e área filtram os
    representantes mais recentes; paginação e filtros preservam seleção e ordem,
    mantendo visível o total, inclusive itens ocultos.
15. Confirmar acrescenta o conjunto inteiro na FIFO do destino com um único CAS,
    IDs novos e mídia independente. Não cria referências, planos ou jobs e não
    altera os planos ativos. Origem obsoleta exige nova seleção dos grupos
    afetados; conflito ou resultado incerto exige releitura antes de outra cópia.
    Detalhes de interação pertencem à rota pessoal e os de mídia/atomicidade ao
    [endpoint da biblioteca](../../../api/docs/sdd/endpoints/exercise-library.md).

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
- When: abre a lista e marca os dois checkboxes.
- Then: ambos aparecem juntos e permanecem ativos; qualquer um pode ser
  desmarcado sem escolher substituto.

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
- Then: bloqueio não oferece geração; preview mostra descrição e títulos
  específicos criados pelo agente em português, além da estrutura completa com
  aquecimento, força, cardio elegível, desaquecimento e alongamento dentro da
  duração informada; a confirmação cria um plano próprio inativo e navega ao
  detalhe.

### Cenário 6 — Biblioteca vazia e criação de treino

- Link para testar: `http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=library-empty`
- Given: nenhum modelo está disponível.
- When: abre “Copiar um plano”.
- Then: recebe orientação sem ações; no plano próprio, criar workout navega somente
  após sucesso ao ID canônico retornado.

## Cobertura automatizada

- API E2E: `api/test/training-plan.e2e-spec.ts`.
- Workflow: specs de services e `workflow-spike.workflow.spec.ts`.
- Playwright: `ui/tests/integration/routes/personal-training-plan.spec.ts`.
- Biblioteca de exercícios: E2E de planos, unitários dos services/command e
  `ui/tests/integration/routes/exercise-library.spec.ts`.
- MSW: `ui/src/mocks/handlers/training-plans.ts`.
- Assistente API: `api/test/training-plan.e2e-spec.ts` e
  `api/docs/sdd/endpoints/training-plan-assistant.md`.
- Assistente UI/MSW: `ui/src/mocks/handlers/training-plan-assistant.ts` e os
  cenários Playwright da rota pessoal.
