# ADR-0006: Versão de recurso em header de domínio

- Status: `aceita`
- Data: `2026-08-11`
- Responsáveis: time Dall Fit

## Contexto

A ADR-0005 definiu controle otimista do aggregate de plano global com versão no
documento, filtro CAS e transporte por ETag forte/`If-Match`. Em produção na
Vercel, o proxy pode avaliar `If-Match` como precondição HTTP própria depois de a
API concluir o write. Isso permite que o MongoDB seja atualizado corretamente e o
cliente receba um `412 PRECONDITION_FAILED` textual da borda, sem o contrato
`ApiError` da aplicação.

A versão continua sendo uma propriedade do aggregate compartilhada por suas URIs,
e não um validator de uma única representação HTTP. O CAS, os incrementos e os
conflitos de domínio permanecem válidos; somente o transporte precisa deixar de
colidir com a semântica condicional da infraestrutura.

## Alternativas consideradas

### Alternativa A — manter ETag e `If-Match`

Preservaria o contrato anterior, mas não oferece um caminho confiável para impedir
a avaliação antecipada ou tardia do header padrão pela borda da Vercel.

### Alternativa B — transportar a versão somente no JSON

Evitaria headers condicionais, mas alteraria todos os bodies, inclusive respostas
`204`, e duplicaria a representação de versão entre recursos e comandos.

### Alternativa C — usar `X-Resource-Version`

Mantém o valor independente do payload, funciona também em respostas sem body e
nomeia uma precondição reutilizável para aggregates versionados sem delegar
semântica ao proxy HTTP.

## Decisão

As mutações de um plano global existente exigem `X-Resource-Version` contendo
somente a forma decimal canônica de um inteiro não negativo seguro do JavaScript:
`0` ou um valor sem zero à esquerda até `Number.MAX_SAFE_INTEGER`. Ausência produz
`428 PRECONDITION_REQUIRED`; valor repetido, malformado ou fora desse intervalo
produz `400 VALIDATION_ERROR`; versão válida divergente continua produzindo
`412 TRAINING_PLAN_VERSION_CONFLICT` antes de qualquer write.

Criação, leituras de item e sucessos que preservam o aggregate devolvem a versão
atual/resultante no mesmo header, inclusive respostas `204` e no-ops. A exclusão
do plano não devolve versão porque o aggregate deixa de existir. `If-Match` e o
ETag canônico do plano deixam de fazer parte do contrato e do CORS.

A UI só classifica uma resposta como conflito quando status `412` e
`ApiError.code === TRAINING_PLAN_VERSION_CONFLICT` aparecem juntos. Outro `412`,
inclusive uma resposta textual da infraestrutura, é falha genérica e não pausa a
fila local.

Esta ADR substitui somente a decisão de transporte ETag/`If-Match` da ADR-0005.
Versão top-level, CAS, incremento único, no-ops, limites e estratégia de mídia da
ADR-0005 continuam vigentes.

## Consequências

### Positivas

- a borda não interpreta a precondição de domínio como header condicional padrão;
- leituras, writes e respostas `204` usam um contrato único e explícito;
- falsos `412` externos não bloqueiam o editor nem se confundem com conflito CAS;
- o nome pode ser reutilizado por outros aggregates versionados.

### Negativas e riscos

- clientes antigos que enviam somente `If-Match` passam a receber `428`;
- o header proprietário exige configuração explícita de CORS e leitura em caixa
  baixa pelo Axios;
- respostas de sucesso sem o header devem ser tratadas como violação do contrato,
  não como incremento presumido pelo cliente.

## Plano de adoção

1. trocar parser, responses e CORS da API para `X-Resource-Version`;
2. trocar o client, a fila, os mocks e os cenários automatizados da UI;
3. remover o formatter/parser de ETag proprietário e referências no código vivo;
4. validar em produção que uma mutação persiste uma vez e retorna sucesso com o
   novo header, sem `x-vercel-error`.

## Links relacionados

- `ADR-0005-limites-concorrencia-e-midia-dos-planos.md`
- `../features/fit-0047-corrigir-falso-conflito-vercel.md`
- `../flows/gestao-planos-treino-globais.md`
- `../../../api/docs/sdd/endpoints/global-training-plans.md`
