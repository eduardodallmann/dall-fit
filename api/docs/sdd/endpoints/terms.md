# Endpoints de leitura e aceite de termos

## Objetivo funcional

A pessoa autenticada lê a publicação vigente, declara maioridade e concordância e
obtém um recibo próprio. Login e cadastro não criam recibos. Esta fronteira continua
acessível quando o negócio está bloqueado; não existe um aceite genérico de conta.
O módulo proprietário é `TermsModule`, usado pelo
[fluxo de termos](../../../../docs/sdd/flows/aceite-de-termos.md) e pela
[rota de leitura](../../../../ui/docs/sdd/routes/terms.md).

## Referências técnicas

| Papel | Símbolo e arquivo | Responsabilidade |
| --- | --- | --- |
| Controller | [TermsController](../../../src/terms/controllers/terms.controller.ts) | Valida entradas e usa a pessoa/canal verificados |
| Entrada | [schemas e TermsInputPipe](../../../src/terms/dto/terms.dto.ts) | Body estrito, ObjectId, hash e página |
| Command | [TermsCommand](../../../src/terms/commands/terms.command.ts) | Orquestra services, envelope e status de criação/replay |
| Service | [TermsAccessService](../../../src/terms/services/terms-access.service.ts) | Situação vigente, autorização e recibo |
| Service | [TermsService](../../../src/terms/services/terms.service.ts) | Leitura coordenada, histórico e publicação histórica |
| Service | [TermsContentService](../../../src/terms/services/terms-content.service.ts) | Projeção do documento publicado |
| Repository | [TermsRepository](../../../src/terms/repositories/terms.repository.ts), [MongoTermsRepository](../../../src/terms/repositories/mongo-terms.repository.ts) | Versões e recibos em coleções separadas |
| Persistência | [Schemas](../../../src/terms/repositories/terms.schema.ts) | Número publicado e recibo por pessoa/versão únicos |
| Contratos | [terms.ts](../../../../packages/types/src/terms.ts) | Requests, documento, referência, situação e recibo |
| Política | [TermsPolicyInterceptor](../../../src/terms/terms-policy.ts) | Bloqueio transversal depois dos guards |

## Contrato HTTP resumido

| Método e path | Entrada | Sucesso |
| --- | --- | --- |
| `GET /terms/access` | Sem body | `200 ApiResponse<TermsAccess>` sem HTML |
| `GET /terms/current` | Sem body | `200 ApiResponse<CurrentTerms>` com publicação e situação |
| `GET /terms/versions/:id` | ObjectId de publicação | `200 ApiResponse<TermsPublication>` |
| `GET /terms/acceptances?page=1` | Inteiro canônico entre 1 e 100 | `200 CollectionResponse<TermsAcceptance>`, 20 por página |
| `POST /terms/acceptances` | ID/hash exatos e os dois literais `true` | `201` novo ou `200` repetido; `ApiResponse<AcceptedTerms>` |

Todas exigem cookie Web **ou** Bearer nativo, nunca os dois. As leituras e a resposta
de aceite usam `Cache-Control: private, no-store`. O POST usa
`AuthenticatedMutation`: quota autenticada por pessoa/IP e, na Web, Origin/CSRF.
O canal nativo não usa cookie/CSRF. Falhas de transporte/autenticação, CSRF e quota
mantêm seus contratos `400/401/403/429` e precedem o domínio jurídico.

O body não admite pessoa, canal, data, IP, user-agent nem campos adicionais.
`accepted` e `isAdult` são obrigatoriamente `true`. IDs têm 24 caracteres hexadecimais;
hashes SHA-256 têm 64, em minúsculas. Nenhum dado de saúde integra o recibo.

## Fluxo completo

### 1. Entrada — TermsController

O guard resolve sessão e pessoa; o interceptor reconhece `TermsExempt`, permitindo
esta fronteira mesmo durante pendência. Pipes validam path/body e o controller
valida a página. O controller chama o método correspondente de `TermsCommand`.
No POST, entrega a pessoa e o canal da sessão, nunca um identificador do body.

### 2. Orquestração — TermsCommand

`access` chama `TermsAccessService.access`. `current`, `published` e `history`
chamam seus métodos de `TermsService`. O command coloca o resultado no envelope
público; histórico já é uma coleção. `accept` recebe `{ result, created }` do
service e prepara status `201` ou `200`, deixando o controller somente aplicar o
status e devolver a response.

### 3. Services e dependências

`TermsAccessService.access` pede ao repository a maior publicação no primary,
projetando apenas ID/número/hash. Sem publicação, devolve `not-configured`; com ela,
busca o recibo da própria pessoa e exige hash e declarações correspondentes para
`accepted`. Ausência/integridade divergente produz `required`. Falha necessária de
persistência produz `503 TERMS_UNAVAILABLE`, sem autorização por cache.

`accept` busca o documento solicitado. Documento ausente ou rascunho resulta em
`404 TERMS_VERSION_NOT_FOUND`. Outra vigente ou hash divergente resulta em
`409 TERMS_VERSION_CHANGED` antes de gravar. O service prepara data do servidor,
canal e declarações e chama `record`; o upsert usa a unique constraint de
pessoa/versão e `$setOnInsert`, conservando ID e primeira data em replays e em
concorrência. Após gravar, consulta novamente a situação: uma publicação concorrente
pode devolver o recibo antigo e `access.state=required`; nunca transfere o aceite.

`TermsService.current` resolve a situação e lê a publicação referenciada; sem ela,
`503 TERMS_NOT_CONFIGURED`. `published` usa `detail` e `TermsContentService.publication`
para impedir exposição de rascunhos e autores internos. `history` pede somente os
recibos da pessoa autenticada, ordenados por data/ID decrescentes, sem filtro por
pessoa vindo da rede. Ler uma publicação histórica é permitido mesmo sem recibo;
ler os recibos de terceiros não possui endpoint.

### 4. Saída e bloqueio de negócio

O recibo não contém o texto: referencia os bytes imutáveis da publicação, cujo hash
é verificável. A situação não é embutida em JWT, pessoa ou sessão Redis. Sessões
diferentes e canais Web/nativo consultam o mesmo recibo MongoDB. Limpar Redis não
remove a evidência; uma nova sessão continua precisando da verificação normal.

`TermsPolicyInterceptor` executa depois de autenticação/admin/CSRF/quota e antes de
pipes/controllers de negócio. `TermsAccessService.require` recusa pendência com
`403 TERMS_ACCEPTANCE_REQUIRED` e `details` contendo somente ID/número/hash.
Sem publicação retorna `503 TERMS_NOT_CONFIGURED`; falha técnica,
`503 TERMS_UNAVAILABLE`. Não acessa plano, sessão de treino, Blob ou assistente.
Auth, tema, saída, leitura/aceite jurídico, compatibilidade pública e probes
continuam operacionais. SSE entrega termos, filtrando recursos de negócio por
situação de aceite. A exceção administrativa sem publicação só cobre `/admin/terms`.

Snapshot Android verifica compatibilidade antes do aceite e consulta este service
dentro do command antes de locks/lease/escritas; detalhes no
[endpoint proprietário](offline-training-snapshot.md).

## Mapa de caminhos possíveis

| Caminho | Gatilho | Resultado | Efeitos |
| --- | --- | --- | --- |
| Leitura | Sessão e documento válidos | `200` | Nenhuma escrita |
| Ausência de publicação | Instalação não configurada | Access `200 not-configured`; current `503` | Negócio fechado |
| Aceite inicial/replay | Documento vigente e declarações | `201/200` | Um único recibo |
| Nova publicação concorrente | Vigente mudou | `409`, ou recibo antigo com situação `required` | Não autoriza a nova versão |
| Validação | Body, hash, ID ou página inválidos | `400 VALIDATION_ERROR` | Sem escrita |
| Documento não público | Ausente/rascunho | `404 TERMS_VERSION_NOT_FOUND` | Sem exposição |
| Falha necessária | Consulta indisponível | `503 TERMS_UNAVAILABLE` | Acesso fechado |
| Negócio pendente | Falta recibo vigente | `403 TERMS_ACCEPTANCE_REQUIRED` | Sem efeitos de negócio |

## Cenários detalhados

Os seeds abaixo são somente locais/teste, exigem MongoDB e Redis locais e
`AUTH_SESSION_SECRET` válido na sessão que inicia a API e o seed. Escrevem tokens e
bodies fictícios em arquivos `0600`, sem imprimir credenciais. Recusam bancos com
publicações que não pertençam à fixture, em vez de apagar documentos externos.

### Situação sem aceite e leitura integral

**Seed**

```bash
pnpm -C api seed -- terms:required
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/terms/access \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"

curl --include --request GET \
  --url http://localhost:4000/terms/current \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"
```

- Given: publicação 1 e nenhum recibo.
- When: consulta a situação e o documento.
- Then: `200 required` e texto integral com a mesma referência; nenhuma escrita.

### Primeiro aceite e repetição idempotente

**Seed**

```bash
pnpm -C api seed -- terms:required
```

**cURL**

```bash
curl --include --request POST \
  --url http://localhost:4000/terms/acceptances \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-acceptance.json

curl --include --request POST \
  --url http://localhost:4000/terms/acceptances \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-acceptance.json
```

- Given: documento 1 vigente.
- When: confirma e repete o mesmo POST.
- Then: `201` seguido de `200`, mesmo recibo/data/hash e situação `accepted`.
- Persistência: apenas um recibo; não altera pessoa nem sessão.

### Recibo próprio e publicação histórica

**Seed**

```bash
pnpm -C api seed -- terms:accepted
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/terms/acceptances?page=1 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"

curl --include --request GET \
  --url http://localhost:4000/terms/versions/109000000000000000000001 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"
```

- Given: aceite da versão 1.
- Then: coleção com um recibo próprio e publicação exata; nenhum autor ou outro usuário.

### Nenhuma publicação configurada

**Seed**

```bash
pnpm -C api seed -- terms:not-configured
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/terms/access \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"

curl --include --request GET \
  --url http://localhost:4000/terms/current \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"

curl --include --request GET \
  --url http://localhost:4000/dashboard?timezone=UTC \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"
```

- Given: nenhum documento publicado.
- Then: access `200 not-configured`; current e dashboard `503 TERMS_NOT_CONFIGURED`. Mesmo o administrador só pode configurar os termos.

### Nova versão bloqueia negócio e rejeita aceite antigo

**Seed**

```bash
pnpm -C api seed -- terms:updated
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/dashboard?timezone=UTC \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"

curl --include --request POST \
  --url http://localhost:4000/terms/acceptances \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-acceptance.json
```

- Given: recibo 1 e publicação 2.
- Then: negócio `403 TERMS_ACCEPTANCE_REQUIRED` com referência 2; POST antigo `409 TERMS_VERSION_CHANGED`; preserva recibo e sessão.

### Declaração falsa ou campos injetados

**Seed**

```bash
pnpm -C api seed -- terms:required
```

**cURL**

```bash
curl --include --request POST \
  --url http://localhost:4000/terms/acceptances \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"termsVersionId":"109000000000000000000001","contentHash":"0000000000000000000000000000000000000000000000000000000000000000","accepted":true,"isAdult":false,"personId":"outra-pessoa"}'
```

- Given: sessão válida.
- Then: `400 VALIDATION_ERROR` no pipe antes de criar recibo. Omissão, `false`, strings e campos extras também são rejeitados.

### Hash divergente

**Seed**

```bash
pnpm -C api seed -- terms:required
```

**cURL**

```bash
curl --include --request POST \
  --url http://localhost:4000/terms/acceptances \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"termsVersionId":"109000000000000000000001","contentHash":"0000000000000000000000000000000000000000000000000000000000000000","accepted":true,"isAdult":true}'
```

- Given: hash com formato válido, diferente do documento.
- Then: `409 TERMS_VERSION_CHANGED`; nenhuma gravação.

### Documento ausente e página inválida

**Seed**

```bash
pnpm -C api seed -- terms:required
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/terms/versions/109000000000000000000099 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"

curl --include --request GET \
  --url http://localhost:4000/terms/acceptances?page=0 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"
```

- Then: `404 TERMS_VERSION_NOT_FOUND` para documento ausente e `400 VALIDATION_ERROR` para página inválida; nenhuma escrita.

### Rascunho não é uma publicação

**Seed**

```bash
pnpm -C api seed -- terms:draft
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/terms/versions/109000000000000000000003 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"
```

- Given: rascunho administrativo existente.
- Then: `404 TERMS_VERSION_NOT_FOUND`; HTML do rascunho não é exposto nesta rota.

### CSRF Web obrigatório

**Seed**

```bash
pnpm -C api seed -- terms:required
```

**cURL**

```bash
curl --include --request POST \
  --url http://localhost:4000/terms/acceptances \
  --cookie "$(cat /tmp/dall-fit-terms-cookie.txt)" \
  --header 'origin: http://localhost:3000' \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-acceptance.json
```

- Given: cookie Web sem header CSRF.
- Then: `403 CSRF_VALIDATION_FAILED` antes do command; nenhum recibo. Bearer nativo dos demais cenários não exige CSRF.

### Sem sessão

**Seed:** não se aplica — falta a credencial antes de qualquer consulta de termos.

**cURL**

```bash
curl --include --request GET --url http://localhost:4000/terms/access
```

- Then: `401 AUTHENTICATION_REQUIRED`; sem recibos ou consulta jurídica.

## Regras de negócio cobertas por testes

| Regra | Unitários | E2E/fixture |
| --- | --- | --- |
| Pendência, bootstrap e falha fechada | `terms-access.service.spec.ts` | `terms.e2e-spec.ts` |
| Hash, declarações e corrida durante aceite | Mesmo service | E2E de termos, Mongo/Redis reais |
| Recibo único e primeira data | Service e contratos | E2E concorrente e replay entre canais |
| Ausência de efeitos no snapshot | Command de snapshot | `offline-training-lease.e2e-spec.ts` |
| Leitura histórica e isolamento | Services | E2E de termos |

Indisponibilidade de repository e a barreira exata de publicação entre gravação e
releitura são injetadas nos testes unitários; não existe um header HTTP para
produzir falha ou agendar concorrência. A suíte E2E valida requisições concorrentes
reais e constraints. Quota usa a configuração vigente de autenticação.

## Fora do comportamento atual

Não há aceite no cadastro, autorização para menores, consentimento genérico de
saúde/LGPD, consulta de recibos alheios, assinatura certificada ou exclusão de
publicações/recibos pela administração.
