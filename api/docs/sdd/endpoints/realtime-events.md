# Endpoint `GET /realtime/events`

## Objetivo funcional

Mantém um stream SSE autenticado que avisa quando um recurso autorizado mudou. O
endpoint não entrega conteúdo; o consumidor relê o endpoint HTTP proprietário.
Mutações globais e mudanças de vínculo/seleção que alteram métricas publicam
`global-training-plan`. A UI relê coleções administrativas e referências pessoais;
uma alteração do conteúdo global invalida também detalhe e workout pessoais porque
suas chaves públicas usam `catalogEntryId`, não o ID global do evento.

## Referências técnicas

| Papel      | Símbolo                        | Responsabilidade                    |
| ---------- | ------------------------------ | ----------------------------------- |
| Controller | `RealtimeController`           | valida query e abre stream          |
| Entrada    | `RealtimeEventsQueryDto`       | exige UUID do documento             |
| Stream     | `RealtimeStreamService`        | ready, heartbeat, duração e filtros |
| Subscriber | `RealtimeSubscriberService`    | conexão Redis Pub/Sub dedicada      |
| Publicação | `RealtimePublisherService`     | publicação best-effort pós-commit   |
| Saída      | `RealtimeResourceInvalidation` | invalidação pública mínima          |

## Contrato HTTP resumido

- `GET /realtime/events?clientInstanceId=<uuid>` com cookie Web ou
  `Authorization: Bearer` nativo, exclusivamente; os dois juntos retornam `400
  AUTH_TRANSPORT_AMBIGUOUS`;
- qualquer sessão abre o stream; eventos `global-training-plan` são transmitidos para todas as sessões autenticadas, demais eventos de audiência admin exigem `isAdmin: true`;
- 30 novas conexões/minuto por sessão e IP;
- sucesso `200 text/event-stream`, retry 3 s, heartbeat 20 s, duração até 270 s;
- eventos `realtime-ready`, `resource-invalidated` e `heartbeat`;
- nenhum conteúdo, identidade, sessão ou origem aparece no payload público.

## Fluxo completo

`SessionAuthGuard` resolve sessão/pessoa e `RateLimitGuard` consome a quota. O
controller valida o UUID e chama `RealtimeStreamService`, que emite ready, registra
listener no subscriber e descarta audiência indevida ou a mesma origem. Eventos
aceitos viram `resource-invalidated`. Cancelamento ou limite remove listener e
timers. O subscriber usa conexão separada porque uma conexão em modo subscriber
não executa comandos normais; JSON inválido é ignorado. Não há command/repository:
é transporte transversal sem persistência.

## Mapa de caminhos possíveis

| Caminho      | Gatilho                      | Resultado     | Efeito              |
| ------------ | ---------------------------- | ------------- | ------------------- |
| Feliz        | sessão, quota e UUID válidos | stream `200`  | listener temporário |
| Origem       | mesmo UUID                   | stream aberto | evento suprimido    |
| Reconexão    | rede/runtime/duração         | novo stream   | novo ready          |
| Autenticação | transporte ausente/inválido  | `401`         | nenhum listener     |
| Ambiguidade  | cookie e Bearer juntos        | `400`         | nenhum listener     |
| Quota        | excesso                      | `429`         | nenhum listener     |
| Validação    | UUID inválido                | `400`         | nenhum listener     |

## Cenários detalhados

### Stream administrativo

**Seed**

```bash
pnpm -C api seed -- auth:person-admin
```

```bash
curl --request POST http://localhost:4000/auth/test-login \
  --header 'content-type: application/json' \
  --header 'x-auth-test-key: <CHAVE_LOCAL>' \
  --cookie-jar /tmp/dall-fit-realtime.txt \
  --data '{"googleSubject":"google-admin-001","name":"Admin Runner","email":"admin.runner@example.test","photoUrl":null}' \
&& curl --no-buffer --request GET \
  --url 'http://localhost:4000/realtime/events?clientInstanceId=123e4567-e89b-42d3-a456-426614174000' \
  --cookie /tmp/dall-fit-realtime.txt \
  --header 'accept: text/event-stream'
```

Com sessão administrativa válida, recebe ready, heartbeats e invalidações de
outra origem; o conteúdo é relido pela API do recurso.

Em outro terminal, a mutação abaixo publica uma invalidação depois do commit. O
UUID diferente garante que a conexão anterior não seja tratada como a origem:

```bash
CSRF_TOKEN="$(curl --silent http://localhost:4000/auth/csrf \
  --cookie /tmp/dall-fit-realtime.txt | jq -r '.data.token')" \
&& curl --include --request PATCH \
  http://localhost:4000/global/training-plans/64b000000000000000000001 \
  --header 'content-type: application/json' \
  --header 'origin: http://localhost:3000' \
  --header 'x-resource-version: 0' \
  --header 'x-client-instance-id: 123e4567-e89b-42d3-a456-426614174001' \
  --header "x-csrf-token: ${CSRF_TOKEN}" \
  --cookie /tmp/dall-fit-realtime.txt \
  --data '{"name":"Plano atualizado por outra instância"}'
```

### UUID inválido

**Seed:** não se aplica — a validação precede domínio e stream.

```bash
curl --no-buffer --request GET \
  --url 'http://localhost:4000/realtime/events?clientInstanceId=invalido' \
  --cookie 'dall_fit_session=<sessao-local-do-admin>' \
  --header 'accept: text/event-stream'
```

Retorna `400 VALIDATION_ERROR` e não registra listener.

### Sem sessão

**Seed:** não se aplica — o guard interrompe antes de acessar dependências.

```bash
curl --no-buffer --request GET \
  --url 'http://localhost:4000/realtime/events?clientInstanceId=123e4567-e89b-42d3-a456-426614174000' \
  --header 'accept: text/event-stream'
```

Retorna `401 AUTHENTICATION_REQUIRED` e não registra listener.
