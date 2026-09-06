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
confirmações também recebem limites próprios por pessoa+IP de 40/5/5 em dez
minutos. O identificador da pessoa sempre vem da sessão. Mensagem aceita até 1.000
caracteres e 40 turnos da pessoa. `clientMessageId` e `Idempotency-Key` são UUIDs;
mesma chave e conteúdo repetem a resposta, enquanto conteúdo diferente retorna
`409 IDEMPOTENCY_KEY_REUSED`. Quando o texto recebido coincide exatamente com o
valor de uma resposta rápida da pergunta atual, a mensagem pública/persistida usa
seu label humano; a decisão continua usando o valor canônico.

Na triagem respiratória, a pergunta pública é “Você está com falta de ar fora do
normal?” e diferencia explicitamente ausência, ocorrência mesmo em repouso e
ocorrência com esforço leve. Os valores canônicos e seus branches conservadores
permanecem `no`, `current` e `exertion`.

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
não são preenchidos antecipadamente. A única exceção é o tempo de interrupção
informado objetivamente enquanto a experiência está sendo esclarecida, pois ele
permanece válido quando a pessoa confirma que já treinou. A mensagem pública
informa os labels que foram registrados.

Essa separação não depende apenas da saída do provider. Na pergunta de experiência,
o service só aceita a categoria sugerida quando o texto se autodeclara iniciante,
intermediário ou avançado, ou informa que nunca treinou; duração histórica isolada
não autoriza inferência de nível. Expressões objetivas de interrupção como “parado
há 3 meses”, inclusive a variante coloquial “parado a 3 meses”, são extraídas
localmente e prevalecem caso o provider as omita. Nesse caso, a resposta reconhece
o histórico e pergunta pela familiaridade com exercícios e equipamentos antes de
avançar. A pergunta sobre tempo sem treinar só é exibida para quem declarou alguma
experiência; a resposta “Nunca treinei” avança diretamente para a agenda.

Na pergunta de agenda, a API aceita combinações livres de 2 a 7 dias semanais e
15 a 120 minutos por sessão. O parser reconhece números antes ou depois de termos
como dias/semana e expressões como meia hora, uma hora e uma hora e meia; o
provider pode completar a estrutura quando a formulação não for determinística.
Frequência ou duração isolada é preservada e a próxima mensagem solicita somente
o campo ausente. Quando ambos existem, `schedule` é montado mesmo sem opção rápida
equivalente. O motor então recalcula completude e triagem; `blocked` nunca volta a
`ready` na mesma sessão.

A coleta pergunta explicitamente se há esteira ou bicicleta ergométrica e, quando
há esteira, se a pessoa já corre regularmente sem desconforto. Academia completa não presume esses
aparelhos, e tolerância a impacto não presume experiência com corrida. Corrida só
entra entre os candidatos quando há esteira, tolerância boa, hábito confirmado e
nenhuma pausa atual. Caminhada e bicicleta também respeitam disponibilidade e a
tolerância declarada.

Em draft, o service exige `ready|preview` e triagem apta, reserva `generating` por
CAS, filtra catálogo e chama o provider por `AssistantProviderService`. O adapter
recebe contexto mínimo e nenhuma tool. Na Groq, modelos compatíveis recebem o JSON
Schema da operação em modo estrito ou best-effort; os demais recebem JSON Object
Mode. O payload explicita a quantidade exata de treinos, limites de exercícios,
unicidade de `catalogKey`, fases ordenadas e a mesma fórmula/limite de duração
aplicada localmente. A proposta inicial inclui aquecimento leve e alongamento em
cada treino e, quando há equipamento elegível e pelo menos 30 minutos disponíveis,
cardio principal em ao menos um treino. A API materializa os títulos específicos
e a descrição criados pelo provider, que precisam estar em português do Brasil.
O schema identifica o idioma esperado, o prompt explicita `pt-BR` e a API rejeita
termos usuais de títulos de treino em inglês. Quando a primeira proposta da Groq
viola essa regra, o adapter faz uma única correção de idioma, preservando
exercícios, parâmetros e estrutura, antes da validação local.

A ordem aceita é aquecimento, força, cardio principal, desaquecimento e
alongamento. Aquecimento e desaquecimento usam caminhada leve por 5 a 10 minutos.
Cardio principal usa 5 a 10 minutos para iniciante ou retorno e até 30 minutos nos
demais perfis, sempre dentro da duração total informada. Treino com predominância
de pernas aceita caminhada ou bicicleta leve, limita o cardio principal a 10
minutos e rejeita corrida. Cardio mais longo é preferido em treino com menor carga
de pernas; força antecede cardio na mesma sessão. Alongamentos estáticos ficam ao
final, em blocos de dois minutos, com 3 repetições suaves de 10 a 20 segundos por
lado ou posição bilateral, sem balanço nem dor.

Esses limites são decisões conservadoras do produto. A referência geral de 150
minutos semanais de atividade moderada não é imposta dentro das sessões nem
apresentada como dose inicial. Intensidade moderada é descrita pelo teste da fala,
sem velocidade, inclinação ou resistência fixa. Corrida para quem já corre pode
ocupar até 20 minutos; o assistente não cria tiros ou progressão de corrida.
Em ajuste, o provider recebe também a proposta lógica corrente e deve preservar
integralmente nomes, distribuição, exercícios e parâmetros não mencionados no
pedido; a prévia persistida continua sendo substituída somente depois da validação
integral da nova resposta.
O budget de completion é explícito, o retorno sempre passa novamente pelo Zod
local e somente rede, `429` ou `5xx` recebem um único retry com backoff limitado.
A proposta inteira é rejeitada se contiver key não candidata, duplicação,
frequência ou quantidade incompatível, tipo diferente do catálogo, fase fora de
ordem, cardio sem aquecimento/desaquecimento, corrida em treino de pernas, duração
de atividade fora do intervalo ou duração total acima da resposta. Falha restaura
`ready|preview` e preserva a sessão.

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
com MongoDB/Redis efêmeros. Specs do domínio validam catálogo, IDs, referências
dos seeds, regras de atividade e fake provider. A UI cobre retomada,
bloqueio/emergência, preview,
confirmação e retry com Axios + MSW Browser.

As regras gerais de atividade usam como referências o
[guia de atividade para adultos do CDC](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html),
o [teste da fala do CDC](https://www.cdc.gov/physical-activity-basics/measuring/index.html),
as orientações de
[aquecimento e desaquecimento da American Heart Association](https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down),
as orientações de
[alongamento da American Heart Association](https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/flexibility-exercise-stretching),
o [Couch to 5K do NHS](https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/)
e o estudo sobre
[ordem de treino concorrente no mesmo dia](https://pubmed.ncbi.nlm.nih.gov/32407361/).
As demonstrações de alongamento pertencem ao
[canal Strong Runner](https://www.youtube.com/@strongrunnerapp/videos); o catálogo
mantém IDs explícitos e revisáveis, sem busca durante a geração.

Não há diagnóstico, prescrição clínica, dieta, medicamento, busca de exercício na
internet, importação de plano nem fallback para outro fornecedor. Rollout
produtivo depende de revisão profissional/jurídica, ZDR, privacidade e flag.
