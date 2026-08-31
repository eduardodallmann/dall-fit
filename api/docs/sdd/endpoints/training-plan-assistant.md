# Endpoints `training-plan-assistant/session`

## Objetivo funcional

A fronteira singular permite que uma pessoa autenticada inicie ou retome uma
coleta estruturada, receba triagem conservadora calculada pela API, revise uma
proposta baseada no catálogo local e confirme um plano pessoal inativo. A
conversa não é um chat genérico e nenhuma saída do provider é persistida como
plano sem preview, validação local e confirmação explícita.

## Referências técnicas

| Papel            | Símbolo/arquivo                                                                                                                         | Responsabilidade                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Controller       | [`TrainingPlanAssistantController`](../../../src/training-plan-assistant/controllers/training-plan-assistant.controller.ts)             | valida headers/DTO, aplica autenticação, CSRF/rate limit e status HTTP         |
| Commands         | [seis commands do domínio](../../../src/training-plan-assistant/commands/training-plan-assistant.commands.ts)                           | um orquestrador por operação HTTP e montagem de `ApiResponse`                  |
| DTOs             | [`training-plan-assistant.dto.ts`](../../../src/training-plan-assistant/dto/training-plan-assistant.dto.ts)                             | normalização NFKC, UUID e limites de payload                                   |
| Service          | [`TrainingPlanAssistantSessionService`](../../../src/training-plan-assistant/services/training-plan-assistant-session.service.ts)       | máquina de estados, CAS, idempotência, triagem, preview, confirmação e limpeza |
| Catálogo         | [`AssistantCatalogService`](../../../src/training-plan-assistant/services/assistant-catalog.service.ts)                                 | valida os JSONs uma vez e filtra candidatos elegíveis                          |
| Provider         | [`AssistantProviderService`](../../../src/training-plan-assistant/services/assistant-provider.service.ts)                               | feature flag, adapter selecionado e circuit breaker Redis compartilhado        |
| Adapters         | [`providers/`](../../../src/training-plan-assistant/providers)                                                                          | fake sem rede e Groq com schema por modelo, timeout, budget e retry único      |
| Repository       | [`TrainingPlanAssistantRepository`](../../../src/training-plan-assistant/repositories/training-plan-assistant.repository.ts)            | sessão exclusiva, CAS, TTL, recibo e ownership por pessoa                      |
| Materialização   | [`AssistantTrainingPlanMaterializationService`](../../../src/training-plan/services/assistant-training-plan-materialization.service.ts) | reserva IDs e converge aggregate completo + catálogo `owned`                   |
| Contrato público | [`@dall-fit/types`](../../../../packages/types/src/contracts.ts)                                                                        | sessão sem answers clínicos e confirmação com os dois IDs                      |

## Contrato HTTP

| Método e path                             | Entrada adicional                              | Sucesso                                        |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `GET /training-plan-assistant/session`    | nenhuma                                        | `200` com sessão ou `204`; `private, no-store` |
| `POST /training-plan-assistant/session`   | `{noticeVersion}`                              | `201` nova ou `200` retomada                   |
| `POST .../messages`                       | `X-Resource-Version`; `{clientMessageId,text}` | `200`                                          |
| `POST .../drafts`                         | versão e `Idempotency-Key`; ajuste opcional    | `200`                                          |
| `POST .../confirm`                        | versão e `Idempotency-Key`                     | `201` ou replay `200`                          |
| `DELETE /training-plan-assistant/session` | nenhuma                                        | `204`                                          |

Todos exigem sessão. Mutações exigem origem e CSRF; mensagens, drafts e
confirmações também recebem limites próprios por pessoa+IP de 20/5/5 em dez
minutos. O identificador da pessoa sempre vem da sessão. Mensagem aceita até 1.000
caracteres e 40 turnos da pessoa. `clientMessageId` e `Idempotency-Key` são UUIDs;
mesma chave e conteúdo repetem a resposta, enquanto conteúdo diferente retorna
`409 IDEMPOTENCY_KEY_REUSED`. Quando o texto recebido coincide exatamente com o
valor de uma resposta rápida da pergunta atual, a mensagem pública/persistida usa
seu label humano; a decisão continua usando o valor canônico.

A sessão pública contém somente ID técnico, versão, estado, mensagens, pergunta,
respostas rápidas, resultado público da triagem, preview e timestamps. Answers,
configuração do provider, materialização e chaves permanecem internos. Erros
estáveis incluem `ASSISTANT_DISABLED`, `ASSISTANT_SESSION_NOT_FOUND`,
`ASSISTANT_SESSION_EXPIRED`, `ASSISTANT_SESSION_VERSION_CONFLICT`,
`ASSISTANT_INVALID_STATE`, `ASSISTANT_MESSAGE_LIMIT_REACHED`,
`ASSISTANT_PROVIDER_UNAVAILABLE`, `ASSISTANT_DRAFT_INVALID`,
`ASSISTANT_SCREENING_BLOCKED`, `ASSISTANT_CATALOG_VERSION_MISMATCH` e
`IDEMPOTENCY_KEY_REUSED`.

## Fluxo completo e branches

O controller valida transporte e chama o command correspondente. O command não
acessa persistência: entrega a pessoa e a precondição ao service e envolve o
resultado no contrato compartilhado. O service busca somente a sessão ativa da
pessoa pelo repository; leitura vencida apaga o documento antes de retornar 410.

Na criação, o service verifica flag/configuração, notice e catálogo. Retoma a
sessão não vencida ou persiste `collecting` com a primeira pergunta. Em mensagem,
confere replay antes do CAS, normaliza e tenta parser determinístico; conteúdo
fora do domínio/injection mantém a pergunta. Respostas rápidas são atalhos, não o
único vocabulário aceito: o provider interpreta paráfrases da pergunta atual e sua
saída estruturada só é aplicada depois da validação local. Resposta relacionada,
parcial, ambígua ou diferente dos atalhos produz esclarecimento contextual, nunca
`off_topic`; essa classificação fica reservada a conteúdo que não responde à
pergunta.

Uma mensagem pode responder também perguntas futuras. O provider devolve até
cinco pares `questionKey/value`, e o service aceita somente keys antecipáveis
explicitamente enumeradas, perguntas incondicionais não sensíveis, options reais
do catálogo e campos ainda vazios. Experiência não é deduzida apenas pelo tempo de
prática: esse histórico contextualiza o esclarecimento, enquanto fatos objetivos
como a interrupção podem ser preservados e fazem a máquina pular a pergunta já
respondida. Triagem clínica, maioridade, aceite final e perguntas condicionais
nunca são preenchidos antecipadamente. A mensagem pública informa os labels que
foram registrados.

Na pergunta de agenda, a API aceita combinações livres de 2 a 7 dias semanais e
15 a 120 minutos por sessão. O parser reconhece números antes ou depois de termos
como dias/semana e expressões como meia hora, uma hora e uma hora e meia; o
provider pode completar a estrutura quando a formulação não for determinística.
Frequência ou duração isolada é preservada e a próxima mensagem solicita somente
o campo ausente. Quando ambos existem, `schedule` é montado mesmo sem opção rápida
equivalente. O motor então recalcula completude e triagem; `blocked` nunca volta a
`ready` na mesma sessão.

Em draft, o service exige `ready|preview` e triagem apta, reserva `generating` por
CAS, filtra catálogo e chama o provider por `AssistantProviderService`. O adapter
recebe contexto mínimo e nenhuma tool. Na Groq, modelos compatíveis recebem o JSON
Schema da operação em modo estrito ou best-effort; os demais recebem JSON Object
Mode. O budget de completion é explícito, o retorno sempre passa novamente pelo
Zod local e somente rede, `429` ou `5xx` recebem um único retry com backoff
limitado. A proposta inteira é rejeitada se contiver key não candidata,
duplicação, frequência ou quantidade incompatível, campo fora do schema ou duração
acima da resposta. Falha restaura `ready|preview` e preserva a sessão.

Em confirmação, o recibo não sensível é consultado primeiro. Sem replay, o
service revalida versão, estado, triagem e catálogo, reserva os dois IDs, pede ao
serviço de materialização o aggregate embutido completo e depois a entrada
`owned`. Ambos usam `set-on-insert`; a entrada torna o plano visível apenas depois
da árvore. O recibo de 24 horas é criado e a sessão sensível é apagada antes do
sucesso. DELETE apaga a sessão ativa mesmo com o assistente desabilitado.

## Mapa de caminhos

| Caminho               | Sequência                                              | Resultado e efeito                      |
| --------------------- | ------------------------------------------------------ | --------------------------------------- |
| ausência/retomada     | Controller → command → session repository              | `204`, `201` ou `200`                   |
| resposta aceita       | parser/provider restrito → triagem → CAS               | `200`, versão +1 e TTL renovado         |
| conflito              | versão antiga no CAS                                   | `412`, nenhuma mesclagem                |
| bloqueio              | regra local de saúde/população                         | `200 blocked`, sem provider de proposta |
| proposta válida       | candidatos → provider → schema local → CAS             | `200 preview`, sem plano criado         |
| provider inválido     | schema/key/regra falha                                 | `502`, preview anterior preservado      |
| confirmação           | recibo → IDs → aggregate → catálogo → recibo → limpeza | `201`; replay `200` com mesmos IDs      |
| desistência/expiração | repository remove documento sensível                   | `204` ou `410`                          |

## Cenários reproduzíveis

Os comandos pressupõem API local com bypass de autenticação e provider fake
habilitados. `<CHAVE_LOCAL>` é a chave sintética configurada para o bypass.

### Cenário 1 — sessão pronta, correção e conflito canônico

**Seed**

```bash
pnpm -C api seed -- assistant:ready
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit73.txt \
  --data '{"googleSubject":"google-person-001","name":"Assistant Runner","email":"assistant.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit73.txt | jq -r '.data.token')" \
&& curl --include http://localhost:4000/training-plan-assistant/session --cookie /tmp/dall-fit-fit73.txt \
&& curl --include --request POST http://localhost:4000/training-plan-assistant/session/messages \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit73.txt \
  --data '{"clientMessageId":"123e4567-e89b-42d3-a456-426614174001","text":"corrigir frequência para 3 dias"}' \
&& curl --include --request POST http://localhost:4000/training-plan-assistant/session/messages \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit73.txt \
  --data '{"clientMessageId":"123e4567-e89b-42d3-a456-426614174002","text":"corrigir frequência para 4 dias"}'
```

A primeira mutation grava a versão 1; a segunda retorna
`412 ASSISTANT_SESSION_VERSION_CONFLICT` e preserva a verdade canônica.

### Cenário 2 — `assistant:draft-invalid`

**Seed**

```bash
pnpm -C api seed -- assistant:draft-invalid
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit73.txt \
  --data '{"googleSubject":"google-person-001","name":"Assistant Runner","email":"assistant.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit73.txt | jq -r '.data.token')" \
&& curl --include --request POST http://localhost:4000/training-plan-assistant/session/drafts \
  --header 'content-type: application/json' --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' --header 'idempotency-key: 123e4567-e89b-42d3-a456-426614174010' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit73.txt \
  --data '{"adjustment":"assistant:draft-invalid"}'
```

O fake devolve uma key inexistente apenas nesse cenário. A API retorna
`502 ASSISTANT_DRAFT_INVALID`, não salva preview parcial e restaura `ready`.

### Cenário 3 — `assistant:confirm` e replay

**Seed**

```bash
pnpm -C api seed -- assistant:confirm
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit73.txt \
  --data '{"googleSubject":"google-person-001","name":"Assistant Runner","email":"assistant.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit73.txt | jq -r '.data.token')" \
&& curl --include --request POST http://localhost:4000/training-plan-assistant/session/confirm \
  --header 'origin: http://localhost:3000' --header 'x-resource-version: 0' \
  --header 'idempotency-key: 123e4567-e89b-42d3-a456-426614174020' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit73.txt \
&& curl --include --request POST http://localhost:4000/training-plan-assistant/session/confirm \
  --header 'origin: http://localhost:3000' --header 'x-resource-version: 0' \
  --header 'idempotency-key: 123e4567-e89b-42d3-a456-426614174020' \
  --header "x-csrf-token: ${CSRF_TOKEN}" --cookie /tmp/dall-fit-fit73.txt
```

O primeiro retorno é `201`; o segundo é `200` com o mesmo par de IDs. Existe um
aggregate completo, uma entrada `owned` inativa e nenhum conteúdo clínico no
recibo.

### Cenário 4 — desistência

**Seed**

```bash
pnpm -C api seed -- assistant:ready
```

**cURL completo**

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-fit73.txt \
  --data '{"googleSubject":"google-person-001","name":"Assistant Runner","email":"assistant.runner@example.test","photoUrl":null}' \
&& CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf --cookie /tmp/dall-fit-fit73.txt | jq -r '.data.token')" \
&& curl --include --request DELETE http://localhost:4000/training-plan-assistant/session \
  --header 'origin: http://localhost:3000' --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-fit73.txt \
&& curl --include http://localhost:4000/training-plan-assistant/session --cookie /tmp/dall-fit-fit73.txt
```

DELETE retorna `204`; o GET seguinte também retorna `204` e o conteúdo anterior
não é recuperável.

## Cobertura e limites

`api/test/training-plan.e2e-spec.ts` cobre ausência, criação/retomada, coleta,
conflito, draft, confirmação, replay, árvore completa, catálogo inativo e limpeza
com MongoDB/Redis efêmeros. Specs do domínio validam catálogo, 75 IDs, referências
dos seeds e fake provider. A UI cobre retomada, bloqueio/emergência, preview,
confirmação e retry com Axios + MSW Browser.

Não há diagnóstico, prescrição clínica, dieta, medicamento, busca de exercício na
internet, importação de plano nem fallback para outro fornecedor. Rollout
produtivo depende de revisão profissional/jurídica, ZDR, privacidade e flag.
