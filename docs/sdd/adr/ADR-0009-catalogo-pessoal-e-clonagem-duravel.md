# ADR-0009: Catálogo pessoal e clonagem durável em projeto Vercel separado

- Status: `aceita`
- Data: 2026-08-21
- Responsáveis: engenharia Dall Fit

## Contexto

Pessoas comuns precisam criar planos próprios, referenciar um plano global vivo e
clonar árvores com imagens privadas. Referências devem acompanhar futuras edições
administrativas; clones precisam ser independentes e nunca aparecer parcialmente.
A cópia de Blob pode ultrapassar o ciclo seguro de uma request serverless.

## Alternativas consideradas

### Um único agregado com flag de escopo nas rotas globais

Reutilizaria URLs, mas misturaria autorização administrativa e pessoal e faria a
segurança depender de parâmetros controláveis pelo cliente.

### Clone síncrono na API

É simples para árvores pequenas, porém mantém a request aberta durante cópias de
mídia e não oferece retomada durável ou compensação após interrupção.

### Catálogo explícito e Workflow separado

Mantém a árvore em `training_plans`, representa propriedade e referência em um
catálogo pessoal e executa cópias por um projeto Nitro com Vercel Workflow.

## Decisão

- preservar `/global/training-plans` administrativo e criar `/training-plans`
  autenticado, sem flags públicas de escopo;
- guardar planos próprios em `training_plans.ownerPersonId`, referências e
  entradas próprias em `training_plan_catalog_entries`, e a escolha opcional em
  `training_plan_active_selections` com unicidade por pessoa;
- guardar jobs e snapshots imutáveis em `training_plan_clone_jobs`;
- persistir o job antes de a API iniciar o Workflow por HTTPS/HMAC v1;
- implantar `workflow/` como Related Project Vercel separado, com Nitro 2 e
  Workflow 5 estáveis, acesso direto ao MongoDB e Blob privado por OIDC;
- copiar no máximo três imagens por decisão, duas variantes em paralelo, confirmar
  progresso por imagem e materializar plano+catálogo somente após todas as cópias;
- usar IDs e pathnames determinísticos, lease de início, geração e updates
  condicionais para tolerar redelivery;
- tratar cancelamento cooperativamente, compensar destinos e impedir cancelamento
  depois que a finalização atômica venceu;
- reter keys de origem em snapshots não terminais para que exclusão global e
  reconciliação de Blob não quebrem clones em curso.

## Consequências

### Positivas

- autorização deriva da rota, sessão e catálogo;
- referência viva não duplica conteúdo;
- destino clonado é invisível até estar íntegro;
- retry e redelivery não criam árvores nem blobs duplicados;
- API e Workflow escalam e são implantados de forma independente.

### Negativas e riscos

- existem dois projetos Vercel, segredos e observabilidade correlacionada por
  `cloneJobId`, `generation` e `workflowRunId`;
- indisponibilidade do bridge deixa job persistido recuperável;
- MongoDB não oferece transação multi-documento no ambiente de teste; a
  materialização usa upserts determinísticos e estado `materializing` como
  fronteira vencedora.

## Plano de adoção

O workspace inclui build Nitro, teste real do runtime, unitários e gates agregados.
Produção configura Related Projects, `WORKFLOW_HMAC_SECRET`, `MONGODB_URI`,
`BLOB_STORE_ID` e OIDC nos dois projetos. A API recebe a URL local como fallback.

## Links relacionados

- [Feature FIT-0058](../features/fit-0058-planos-treino-pessoais.md)
- [Fluxo pessoal](../flows/gestao-planos-treino-pessoais.md)
