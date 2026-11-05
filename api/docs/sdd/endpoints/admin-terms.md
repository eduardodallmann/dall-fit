# Endpoints administrativos de termos

## Objetivo funcional

Administradores criam rascunhos HTML, conferem a prévia canônica e publicam versões
imutáveis. Cada publicação exige novo aceite inclusive de quem publicou. Nome do
responsável e contato pertencem a cada versão. A minuta inicial contém o responsável
público informado e não é publicada automaticamente.

## Referências técnicas

| Papel | Símbolo e arquivo | Responsabilidade |
| --- | --- | --- |
| Controller | [AdminTermsController](../../../src/terms/controllers/admin-terms.controller.ts) | Admin, validação e revisão em header |
| Entrada | [terms.dto.ts](../../../src/terms/dto/terms.dto.ts) | Schemas estritos, página e precondição |
| Command | [TermsCommand](../../../src/terms/commands/terms.command.ts) | Um método por operação e envelopes |
| Service | [TermsService](../../../src/terms/services/terms.service.ts) | Rascunhos, publicação e concorrência |
| Service | [TermsContentService](../../../src/terms/services/terms-content.service.ts) | HTML permitido, identidade e SHA-256 |
| Repository | [MongoTermsRepository](../../../src/terms/repositories/mongo-terms.repository.ts) | CAS e constraints MongoDB |
| Integração | [RealtimePublisherService](../../../src/realtime/realtime-publisher.service.ts) | Invalidação mínima após commit |
| Saída | [Contratos públicos](../../../../packages/types/src/terms.ts) | Documento, resumo e publicação |

## Contrato HTTP resumido

| Método e path | Entrada | Sucesso |
| --- | --- | --- |
| `GET /admin/terms?page=1` | Página 1–100 | `200 TermsList`, 20 resumos sem HTML por página e `initialDraft` para criação explícita |
| `POST /admin/terms` | Campos completos ou somente `sourceVersionId` publicado | `201 ApiResponse<TermsDocument>` |
| `GET /admin/terms/:id` | ObjectId | `200 ApiResponse<TermsDocument>` |
| `PATCH /admin/terms/:id` | Todos os campos e revisão | `200`, revisão incrementada |
| `DELETE /admin/terms/:id` | Revisão de rascunho | `204` |
| `POST /admin/terms/:id/preview` | Revisão de rascunho salvo | `200`, documento canônico e hash |
| `POST /admin/terms/:id/publish` | Revisão, `previewContentHash`, `expectedCurrentTermsId` | `200`, publicação ou replay |

Autenticação por cookie Web ou Bearer nativo e `AdminOnly` em todas as operações.
`AdminMutation` aplica quota administrativa por pessoa/IP e CSRF/Origin na Web,
inclusive preview. Respostas com conteúdo usam `Cache-Control: private, no-store`;
detalhe e mutations devolvem `X-Resource-Version`. Revisão técnica começa em zero e
é diferente do número jurídico de publicação.

`TermsAdministration` só libera bootstrap quando não existe publicação. Assim que
existe uma vigente, falta de aceite causa o mesmo `403` de negócio. Nenhum papel
administrativo dispensa concordância. Pessoa comum recebe `403 ADMIN_ACCESS_REQUIRED`
antes da política de termos.

Campos: título até 160 caracteres, responsável até 200, e-mail válido até 254,
resumo até 1000 e corpo até 256 KiB em UTF-8; o HTML final também respeita 256 KiB.
Texto obrigatório fica não vazio depois da sanitização. Não é permitido misturar
campos com `sourceVersionId`, omitir campos ou enviar estado/número/datas/autores.

## Fluxo completo

### 1. Entrada — AdminTermsController

Depois dos guards e da política, pipes verificam os schemas de body e ObjectId.
O controller valida página e `X-Resource-Version`, chama o método correspondente do
command, aplica o header de revisão e devolve seu resultado. Revisão ausente produz
`428 PRECONDITION_REQUIRED`; valor não inteiro canônico/não seguro, `400 VALIDATION_ERROR`.

### 2. Orquestração — TermsCommand

Cada método encaminha ID/revisão, campos e pessoa verificada ao service proprietário.
`list` entrega a coleção com a minuta inicial; `create/update/detail/preview/publish`
embrulham o documento em `ApiResponse`; `remove` conclui sem body. O command não
acessa modelos, Redis ou repository.

### 3. Services e dependências

`TermsService.list` lê resumos ordenados por criação/ID decrescentes e acrescenta a
minuta inicial como sugestão de criação, sem gravar. `create` recebe campos ou lê a
publicação de origem. Origem ausente/rascunho é `404 TERMS_VERSION_NOT_FOUND`.
`TermsContentService.prepare` sanitiza, compõe identificação escapada e título,
calcula SHA-256 sobre os bytes UTF-8 exatos do HTML final e informa `wasSanitized`.
O repository cria um rascunho de revisão zero com autoria/data do servidor.

O allowlist admite `h2`, `h3`, `p`, `strong`, `em`, `ul`, `ol`, `li`, `br`,
`blockquote` e `a`. Apenas HTTPS absoluto ou `mailto` permanecem em `href`, com
`target=_blank` e `rel=noopener noreferrer`. Classes, estilo, handlers, mídia,
formulários, SVG, iframes e scripts são removidos. Título/nome/e-mail são escapados
na seção composta pelo servidor; prévia e publicação usam o mesmo HTML.

`detail` retorna `404` quando ausente. `update`, `preview` e `remove` primeiro
exigem rascunho e revisão compatível. Publicação é `409 TERMS_VERSION_IMMUTABLE`;
revisão divergente é `412 TERMS_DRAFT_VERSION_CONFLICT`. Update faz CAS por
ID/estado/revisão e incrementa revisão; delete faz a mesma comparação. Uma corrida
entre a leitura e a escrita também produz `412` sem sobrescrever outra edição.
Preview devolve somente a revisão salva: alterações locais precisam ser salvas.

`publish` lê o documento e, se já publicado, devolve a mesma publicação sem nova
escrita/evento. O acesso a esse replay ainda passa pela política de termos. Para
rascunho, compara revisão, recompõe o HTML/hash e confronta `previewContentHash`:
divergência é `409 TERMS_PREVIEW_CHANGED`. Consulta a vigente e exige igualdade com
`expectedCurrentTermsId`, anulável na primeira publicação. Divergência é
`409 TERMS_PUBLICATION_CONFLICT`. A gravação CAS publica o mesmo documento, com
próximo número, data/autoria do servidor e revisão incrementada. A unique constraint
parcial de `publicationNumber` serializa concorrentes: só um ganha o número e colisão
`11000` vira `409 TERMS_PUBLICATION_CONFLICT`. Não há reserva de número, lacuna por
rascunho, transação multidocumento ou exigência de replica set para esse mecanismo.

Após commit, `RealtimePublisherService.publish` emite `{resource: terms, resourceId,
state: present, version: publicationNumber}` pelo Redis best-effort. Falha do evento
não reverte publicação: refetch, reconexão, foco, polling e guard HTTP repararam a
observação. Não envia HTML, identidade ou recibos no evento.

### 4. Saída

Documentos expõem HTML seguro/hash e revisão, sem autoria interna. Resumos não
trazem corpo/HTML integral; `initialDraft` é uma única sugestão explícita do modelo
inicial. Recibos nunca são alterados por publicação. Corrigir publicação ou
responsável/contato exige outro rascunho e nova publicação.

## Mapa de caminhos possíveis

| Caminho | Resultado | Efeitos |
| --- | --- | --- |
| Criar/salvar rascunho | `201/200` | Somente draft e revisão |
| Prévia | `200` | Nenhuma publicação |
| Publicar | `200` | Número único e evento pós-commit |
| Replay publicado | `200` | Nenhuma duplicação |
| Ausência/precondição | `404/428/400` | Sem escrita |
| Revisão concorrente | `412` | Preserva edição vencedora |
| Preview/vigente divergentes | `409` | Preserva rascunho e publicação anterior |
| Mutação de publicação | `409` | Publicação preservada |
| Sem admin ou sem aceite | `403` | Sem operação administrativa |

## Cenários detalhados

Os arquivos de payload e sessão usados a seguir são preparados pelo seed conforme
[seeds locais](terms.md#cenários-detalhados). Não usar tokens de ambientes publicados.
### Listar, criar e copiar publicação

**Seed**

```bash
pnpm -C api seed -- terms:admin
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/admin/terms?page=1 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"

curl --include --request POST \
  --url http://localhost:4000/admin/terms \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-fields.json

curl --include --request POST \
  --url http://localhost:4000/admin/terms \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'content-type: application/json' \
  --data '{"sourceVersionId":"109000000000000000000001"}'
```

- Given: administrador com aceite 1.
- Then: `200` coleção e `201` para cada novo rascunho; sem publicação ou recibo novo.

### Detalhar, salvar e visualizar prévia

**Seed**

```bash
pnpm -C api seed -- terms:draft
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/admin/terms/109000000000000000000003 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"

curl --include --request PATCH \
  --url http://localhost:4000/admin/terms/109000000000000000000003 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 0' \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-fields.json

curl --include --request POST \
  --url http://localhost:4000/admin/terms/109000000000000000000003/preview \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 1'
```

- Given: draft revisão 0.
- When: lê, salva todos os campos e pede preview da revisão 1.
- Then: `200`, revisão 1, HTML/hash canônicos; não publica.

### Publicar e passar a exigir o novo aceite

**Seed**

```bash
pnpm -C api seed -- terms:draft
```

**cURL**

```bash
curl --include --request POST \
  --url http://localhost:4000/admin/terms/109000000000000000000003/preview \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 0'

curl --include --request POST \
  --url http://localhost:4000/admin/terms/109000000000000000000003/publish \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 0' \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-publication.json

curl --include --request GET \
  --url http://localhost:4000/admin/terms \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"
```

- Given: vigente 1, draft 3 e hash de preview exato.
- Then: publica número 2 uma vez; a próxima leitura administrativa responde `403 TERMS_ACCEPTANCE_REQUIRED`. Ler/aceitar a nova versão por `/terms/*` libera a administração. Não fabrica o aceite do autor.

### Revisão ausente e desatualizada

**Seed**

```bash
pnpm -C api seed -- terms:draft
```

**cURL**

```bash
curl --include --request PATCH \
  --url http://localhost:4000/admin/terms/109000000000000000000003 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-fields.json

curl --include --request DELETE \
  --url http://localhost:4000/admin/terms/109000000000000000000003 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 99'
```

- Then: `428 PRECONDITION_REQUIRED` e `412 TERMS_DRAFT_VERSION_CONFLICT`; rascunho revisão 0 preservado.

### Publicação imutável

**Seed**

```bash
pnpm -C api seed -- terms:admin
```

**cURL**

```bash
curl --include --request PATCH \
  --url http://localhost:4000/admin/terms/109000000000000000000001 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 1' \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-fields.json

curl --include --request DELETE \
  --url http://localhost:4000/admin/terms/109000000000000000000001 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 1'
```

- Then: ambas `409 TERMS_VERSION_IMMUTABLE`; HTML, identidade e recibo continuam intactos.

### Prévia e publicação vigente precisam coincidir

**Seed**

```bash
pnpm -C api seed -- terms:draft
```

**cURL**

```bash
curl --include --request POST \
  --url http://localhost:4000/admin/terms/109000000000000000000003/publish \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 0' \
  --header 'content-type: application/json' \
  --data '{"expectedCurrentTermsId":"109000000000000000000001","previewContentHash":"0000000000000000000000000000000000000000000000000000000000000000"}'

jq '.expectedCurrentTermsId = null' /tmp/dall-fit-terms-publication.json > /tmp/dall-fit-terms-stale-publication.json
curl --include --request POST \
  --url http://localhost:4000/admin/terms/109000000000000000000003/publish \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 0' \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-stale-publication.json
```

- Then: `409 TERMS_PREVIEW_CHANGED` e `409 TERMS_PUBLICATION_CONFLICT`, respectivamente; não publica. A colisão simultânea do mesmo número é verificada em E2E serial, com requisições concorrentes.

### Excluir somente o rascunho

**Seed**

```bash
pnpm -C api seed -- terms:draft
```

**cURL**

```bash
curl --include --request DELETE \
  --url http://localhost:4000/admin/terms/109000000000000000000003 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 0'

curl --include --request GET \
  --url http://localhost:4000/admin/terms/109000000000000000000003 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"
```

- Then: `204` e depois `404 TERMS_VERSION_NOT_FOUND`; publicação 1 preservada.

### Pessoa comum não acessa administração

**Seed**

```bash
pnpm -C api seed -- terms:required
```

**cURL**

```bash
curl --include --request GET \
  --url http://localhost:4000/admin/terms \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)"
```

- Then: `403 ADMIN_ACCESS_REQUIRED`, antes do service ou da exceção de bootstrap.

### HTML não permitido é removido antes da prévia

**Seed**

```bash
pnpm -C api seed -- terms:draft
```

**cURL**

```bash
jq '.bodyHtml = "<p><strong>Cuidados</strong></p><script>alert(1)</script><img src=x onerror=alert(1)>"' /tmp/dall-fit-terms-fields.json > /tmp/dall-fit-terms-unsafe.json
curl --include --request PATCH \
  --url http://localhost:4000/admin/terms/109000000000000000000003 \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 0' \
  --header 'content-type: application/json' \
  --data @/tmp/dall-fit-terms-unsafe.json

curl --include --request POST \
  --url http://localhost:4000/admin/terms/109000000000000000000003/preview \
  --header "authorization: Bearer $(cat /tmp/dall-fit-terms-token.txt)" \
  --header 'x-resource-version: 1'
```

- Then: destaque permitido permanece, script/imagem desaparecem, `wasSanitized=true`; a prévia traz o HTML canônico exato.

## Bootstrap operacional da minuta inicial

A aplicação oferece o modelo inicial ao criar rascunho. Também existe a operação
idempotente [prepare-initial-terms.ts](../../../scripts/prepare-initial-terms.ts),
sem startup hook, publicação ou recibo automáticos. O arquivo
[initial-terms.json](../../../src/terms/domain/initial-terms.json) é a fonte da
minuta: responsável Eduardo Dallmann e contato eduardodallmann@gmail.com. Esses
dados não entram em fixtures de teste.

Depois de configurar `MONGODB_URI`, usar o ObjectId de um administrador existente
em `--person-id`. O dry-run valida pessoa/minuta; execução exige `--execute` e
`TERMS_OPERATION_CONFIRMATION=prepare-initial-terms-v1`. O comando prepara somente
o rascunho reservado `109000000000000000000000`; repetir preserva integralmente o
que já existe, inclusive uma publicação. Se já houver outra publicação, deve-se
criar a próxima versão pela administração. A autoria vem da pessoa indicada e a
operação não cria sessão.

Aplicar antes os índices com o comando explícito do
[contrato de índices](../base/02-endpoints-e-contratos.md). Depois revisar o
rascunho em `/admin/terms`, salvar, conferir preview e publicar. A minuta informa
riscos, segurança, IA, responsabilidade e direitos legais sem prometer imunidade
judicial nem renunciar a garantias obrigatórias. As fontes da pesquisa estão na
[FIT-0109](../../../../docs/sdd/features/fit-0109-aceite-versionado-de-termos-de-uso.md#pesquisa-e-fundamentos-da-minuta).

## Regras de negócio cobertas por testes

`terms.service.spec.ts` protege prévia, CAS, conflitos, replay, origem publicada e
evento pós-commit. `terms-content.service.spec.ts` cobre XSS, links, escaping,
tamanho e hash. `test/terms.e2e-spec.ts` usa constraints reais, concorrência,
identidade por versão, CSRF, recibos e bootstrap. A interface é exercitada com MSW
e Playwright sem acessar esta API real.

## Fora do comportamento atual

Sem editor WYSIWYG, upload, HTML irrestrito, agendamento, despublicação, edição de
publicação, relatório de terceiros ou backfill de concordância de contas.
