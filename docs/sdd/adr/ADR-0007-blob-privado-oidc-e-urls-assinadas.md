# ADR-0007: Blob privado por OIDC e URLs assinadas

- Status: `aceita`
- Data: `2026-08-14`
- Responsáveis: time Dall Fit

## Contexto

A ADR-0005 definiu variantes públicas no Vercel Blob. O store público foi
excluído, e o store vigente é privado. A aplicação precisa continuar entregando
thumbnail e display ao navegador sem expor uma credencial permanente, sem fazer a
API trafegar os binários e sem transformar `BLOB_STORE_ID` em hostname.

O Vercel Blob 2.7 oferece autenticação do SDK por OIDC e signed URLs compostas por
`issueSignedToken` e `presignUrl`. Assim como uma presigned URL do S3, o resultado
é uma capacidade bearer curta: quem a possui pode executar a operação concedida
até o vencimento.

## Alternativas consideradas

### Proxy binário pela API

A API autorizaria cada leitura e transmitiria os bytes. Isso manteria a sessão no
caminho dos dados, mas aumentaria latência, execução, banda e responsabilidade de
cache, além de dispensar o CDN direto do Blob.

### URL privada permanente ou token no cliente

A URL sem assinatura não abre um objeto privado. Enviar delegation token genérico,
token OIDC ou credencial read-write ampliaria o escopo no navegador e permitiria
assinar ou operar objetos além da variante autorizada.

### Signed URL por pathname exato

A API autoriza a leitura do aggregate, emite uma capacidade `get` para cada key já
persistida e devolve as URLs temporárias no contrato do exercício. O navegador
baixa diretamente do Blob/CDN, sem cookie da API.

## Decisão

Usar o store privado `store_8u9fq5re0OENMRtC` por OIDC. `BLOB_STORE_ID` é opaco;
não se remove `store_`, não se monta URL e não se compara hostname. A aplicação não
usa `BLOB_READ_WRITE_TOKEN`; `put` é privado e `del/list` usam a seleção OIDC.

MongoDB armazena somente pathname/key e dimensões. Após sessão/admin autorizarem a
request, a API chama `issueSignedToken` com pathname exato, `operations: ['get']`
e `validUntil`, seguido de `presignUrl` com acesso privado, operação `get` e cache
do Blob. Thumbnail e display compartilham expiração de quinze minutos. Não há
wildcard nem endpoint proxy de mídia.

O upload assina as duas variantes antes do CAS. Falha compensa blobs novos e não
altera o aggregate. Leituras não devolvem hidratação parcial; a concorrência fica
limitada a quatro imagens, portanto oito emissões simultâneas. Responses que
contêm signed URLs usam `Cache-Control: private, no-store`.

A UI renova dois minutos antes do prazo, ao recuperar visibilidade quando
necessário e uma vez após falha próxima da expiração. Signed URLs, parâmetros,
pathnames e tokens não entram em logs, Analytics, persistência ou cache da PWA. A
CSP permite somente a origem privada exata.

Esta ADR substitui somente a decisão de mídia pública da ADR-0005. Limites do
aggregate, CAS, variantes WebP, compensação e reconciliação continuam vigentes.

## Consequências

### Positivas

- nenhuma credencial permanente é mantida pela aplicação ou enviada ao cliente;
- Blob/CDN permanece no caminho dos bytes, com capacidade curta semelhante ao
  `getSignedUrl` do S3;
- pathname exato e operação única limitam o impacto de vazamento;
- banco e contrato deixam de depender de URL pública permanente ou hostname
  derivado.

### Negativas e riscos

- a signed URL continua sendo bearer até expirar e precisa ser tratada como dado
  sensível;
- cada imagem exige duas emissões, aumentando o custo da leitura e tornando
  necessária concorrência limitada;
- UI antiga sem renovação deixa de renderizar após o vencimento.

## Links relacionados

- `ADR-0005-limites-concorrencia-e-midia-dos-planos.md`
- `../features/fit-0044-migrar-imagens-exercicios-blob-privado-oidc.md`
- `../flows/gestao-planos-treino-globais.md`
- `../../../api/docs/sdd/endpoints/global-training-plans.md`
- `../../../ui/docs/sdd/routes/global-training-plan-workout.md`
