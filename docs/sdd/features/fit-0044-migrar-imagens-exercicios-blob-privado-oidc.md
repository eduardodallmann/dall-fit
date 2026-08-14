# Feature Spec: Migrar imagens de exercícios para Vercel Blob privado com OIDC e URLs assinadas

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0044`.
- Problema:
  - o upload vigente foi construído para um Blob público e exige manualmente
    `BLOB_READ_WRITE_TOKEN`;
  - stores novos conectados à Vercel usam OIDC por padrão, recebem
    `BLOB_STORE_ID` no formato administrativo `store_<id>` e não precisam de um
    token de leitura/escrita permanente dentro da aplicação;
  - o código passa o token manual ao SDK, compara o hostname retornado com uma URL
    construída a partir do ID e persiste URLs públicas do Blob;
  - o store público anterior foi excluído e foi criado o store privado
    `store_8u9fq5re0OENMRtC`, cuja origem é
    `https://8u9fq5re0oenmrtc.private.blob.vercel-storage.com`;
  - a URL sem assinatura de um objeto privado não pode ser usada pelo navegador;
  - o SDK atual permite emitir URLs temporárias, restritas a um pathname e a uma
    operação, equivalentes às presigned URLs de um S3 privado;
  - falhas do SDK são hoje convertidas em erro funcional sem preservar nos logs
    nem mesmo a classe sanitizada necessária ao diagnóstico operacional.
- Resultado:
  - upload, assinatura, exclusão, listagem e reconciliação usam o store privado por
    OIDC, sem `BLOB_READ_WRITE_TOKEN` de longa duração;
  - a API autoriza a leitura do workout e devolve, junto a cada exercício com
    imagem, URLs temporárias `GET` geradas por `issueSignedToken()` e
    `presignUrl()`;
  - o navegador baixa cada WebP diretamente do Vercel Blob/CDN, sem colocar a API
    no caminho dos bytes;
  - o MongoDB persiste somente pathnames/keys e dimensões, nunca URL privada sem
    assinatura nem URL assinada;
  - a UI conhece a expiração, renova as URLs pelo endpoint já existente do workout
    e permite a origem privada exata na CSP;
  - a seleção do store pertence ao SDK e à configuração gerenciada pela Vercel;
    não há parsing de `store_`, montagem de hostname nem comparação redundante na
    aplicação;
  - referências persistidas para o store público já excluído são identificadas e
    removidas por uma operação explícita, idempotente e segura antes de novos
    uploads privados.
- Referências oficiais:
  - [Vercel Private Blob GA, OIDC e Signed URLs](https://vercel.com/changelog/vercel-private-blob-is-now-generally-available);
  - [Vercel Blob com OIDC](https://vercel.com/changelog/vercel-blob-now-supports-oidc-authentication);
  - [SDK `@vercel/blob`](https://vercel.com/docs/vercel-blob/using-blob-sdk);
  - [variáveis de sistema e `VERCEL_OIDC_TOKEN`](https://vercel.com/docs/environment-variables/system-environment-variables).
- Versões confirmadas na especificação:
  - `@vercel/blob` está resolvido em `2.7.0`, versão cujos tipos e código locais
    exportam `issueSignedToken()` e `presignUrl()` e suportam OIDC, store privado e
    URLs assinadas para `get`, `head`, `put` e `delete`;
  - esta feature usa URLs assinadas somente para `get`.
- Features relacionadas:
  - `fit-0028-editor-exercicios-escalabilidade-concorrencia.md`, que introduziu o
    processamento e a persistência de imagens;
  - ADR histórica `ADR-0005-limites-concorrencia-e-midia-dos-planos.md`, cuja
    decisão de store público será substituída por uma nova ADR sem editar o
    registro original.

## Escopo

### Incluído

- migrar a integração de Blob público com token permanente para Blob privado com
  OIDC gerenciado pela Vercel;
- usar `access: 'private'` nas operações aplicáveis do SDK;
- remover `BLOB_READ_WRITE_TOKEN` do schema de ambiente, `.env.example`, código,
  scripts, testes, documentação e configuração operacional da API;
- manter `BLOB_STORE_ID` como configuração opaca pertencente ao SDK, aceitando o
  valor oficial com prefixo `store_` sem normalização própria;
- não consumir `BLOB_WEBHOOK_PUBLIC_KEY`, pois upload e conclusão continuam
  server-side e esta entrega não introduz webhook nem client upload;
- remover a validação pós-upload que constrói e compara hostname do Blob;
- não criar `BLOB_URL`, `BLOB_BASE_URL` ou variável operacional equivalente na
  API;
- persistir somente pathname/key e dimensões necessárias das variantes, sem URL;
- emitir, após a autorização de cada request da aplicação, URLs assinadas para
  `thumbnail` e `display`, restritas a `get`, ao pathname exato e à expiração
  definida nesta feature;
- devolver as URLs assinadas no array de exercícios do workout e em qualquer
  outra response canônica que contenha uma imagem não nula;
- manter `thumbnailUrl` e `displayUrl` no contrato compartilhado, alterando sua
  semântica de URL pública permanente para URL privada assinada e temporária;
- acrescentar ao contrato a expiração comum das URLs para renovação explícita;
- adaptar UI, CSP, MSW, unitários, E2E e Playwright ao novo comportamento;
- tratar referências legadas do store excluído com dry-run, execução protegida e
  atualização atômica da versão do aggregate;
- classificar e registrar com segurança falhas conhecidas do SDK, sem mensagem
  bruta, URL, pathname, tokens, conteúdo ou resposta externa;
- criar uma ADR que registre store privado, OIDC e entrega direta por signed URL.

### Não incluído

- recriar, recuperar ou transferir arquivos do store público excluído;
- tornar imagens permanentemente públicas ou emitir URLs sem expiração;
- criar endpoint da API para transmitir o binário ou redirecionar cada imagem;
- entregar a URL privada sem assinatura, `delegationToken`,
  `clientSigningToken`, token OIDC ou chave de webhook separadamente à UI;
- emitir signed URL para `put`, `head` ou `delete`;
- client upload, callback/webhook de conclusão ou upload multipart;
- mudar limites de 10 MiB, 40 MP, tipos JPEG/PNG/WebP ou dimensões das variantes;
- mudar a estratégia de concorrência `X-Resource-Version` das mutações;
- armazenar o arquivo original;
- cache de signed URLs pelo service worker ou persistência em storage do browser;
- criar store, excluir store ou alterar variáveis no painel da Vercel por código;
- ampliar nesta entrega o acesso dos planos globais para pessoas não
  administradoras.

## Projetos e documentação afetados

- API e endpoints:
  - `api/src/config/environment.ts` e `api/.env.example`;
  - `BlobStorageService`, `ExerciseImageService`, commands, mapeadores de response,
    DTOs, módulo e `TrainingPlanService`;
  - port e adapter MongoDB, schemas embutidos e script de reconciliação/migração;
  - não será criado endpoint binário: o GET de workout e as mutations que retornam
    imagem passam a publicar URLs assinadas;
  - atualizar `api/docs/sdd/base/01-arquitetura.md` e
    `api/docs/sdd/endpoints/global-training-plans.md`.
- UI e rotas:
  - service de planos, query do workout, editor, `ImageFilePicker` e tratamento
    acessível de expiração/falha da prévia;
  - `ui/vercel.json` remove o host público antigo de `img-src` e permite somente a
    origem privada exata do novo store;
  - atualizar `ui/docs/sdd/base/01-arquitetura.md` e
    `ui/docs/sdd/routes/global-training-plan-workout.md`;
  - não há referência visual em
    `ui/docs/sdd/routes/assets/global-training-plan-workout/`, portanto não se
    aplica validação por screenshot.
- Fluxos:
  - atualizar `docs/sdd/flows/gestao-planos-treino-globais.md` para emissão e
    renovação de URLs temporárias.
- Contratos em `@dall-fit/types`:
  - `ExerciseImage.thumbnailUrl` e `displayUrl` continuam strings, agora contendo
    URLs privadas assinadas completas;
  - `ExerciseImage.signedUrlExpiresAt` é um timestamp ISO 8601 comum às duas URLs;
  - key/pathname, tokens internos e URL privada sem assinatura não entram no
    contrato;
  - adicionar o campo é compatível com a UI antiga, que ignora propriedades
    extras, mas a UI nova é necessária para renovação e CSP corretas.
- Decisões arquiteturais:
  - criar ADR nova para substituir prospectivamente a parte pública da ADR-0005;
  - a ADR registra URLs como credenciais temporárias, autorização na emissão,
    acesso direto ao CDN, expiração, renovação, exposição controlada da origem do
    store e preferência por OIDC rotativo sobre segredo permanente.
- Handlers e fixtures MSW:
  - atualizar fixtures de `ExerciseImage` com URLs assinadas fictícias e expiração;
  - interceptar as requisições diretas das duas variantes sem acessar a rede real;
  - cobrir sucesso, URL expirada, indisponibilidade, latência e renovação;
  - preservar `x-request-id` e o mesmo seletor exclusivo de mocks já vigente nas
    responses da aplicação; a response simulada do Blob não inventa header da API.
- Mocks de repositories/caches nos unitários da API:
  - repository mockado devolve somente pathnames e dimensões;
  - Blob mockado cobre `put`, `issueSignedToken`, `presignUrl`, `del` e `list`;
  - Redis não guarda signed URLs e continua participando somente das
    responsabilidades vigentes de sessão/autorização.
- Fixtures MongoDB/Redis nos E2E:
  - MongoDB efêmero contém associação privada com keys fictícias e casos sem
    imagem e referência legada;
  - Redis efêmero continua real para sessão e autorização;
  - o SDK externo é substituído por adapter determinístico; Nest, transporte,
    guards, commands, services, repository e MongoDB permanecem reais.

## Requisitos funcionais

1. O runtime Vercel usa o `BLOB_STORE_ID` automaticamente fornecido e o token OIDC
   de curta duração disponibilizado pela plataforma; a aplicação não lê nem passa
   `BLOB_READ_WRITE_TOKEN` ao SDK.
2. `BLOB_STORE_ID` é obrigatório em Preview e Production e permanece uma string
   opaca. O código não remove `store_`, não altera caixa e não usa seu conteúdo
   para construir hostname ou URL.
3. Em desenvolvimento local que realmente acesse o Blob, as credenciais de
   Development são fornecidas pelo fluxo oficial do Vercel CLI, preferencialmente
   `vercel env run`, sem versionar ou imprimir `VERCEL_OIDC_TOKEN`. Unitários,
   E2E, MSW e Playwright não dependem de credencial real.
4. O upload continua server-side, valida o arquivo e produz exatamente duas
   variantes WebP antes do CAS, mas chama `put` com `access: 'private'` e sem
   opção `token`.
5. Um upload bem-sucedido conserva somente pathname/key, largura e altura. A URL
   privada retornada por `put` é descartada e nunca chega ao MongoDB ou aos logs.
6. A aplicação não confirma a seleção do store por comparação de hostname. O SDK
   autentica e seleciona o store a partir de OIDC e `BLOB_STORE_ID`; qualquer
   rejeição interrompe o fluxo antes do CAS.
7. Compensações pré-commit, limpezas pós-commit e reconciliação usam `del` e `list`
   sem token explícito e continuam restritas ao prefixo `exercise-images/`.
8. Somente uma request da aplicação que já passou pela sessão ativa e por
   `isAdmin: true` pode provocar emissão de signed URLs de imagens dos planos
   globais. CSRF e `X-Resource-Version` permanecem exigidos apenas nas mutations
   conforme seus contratos vigentes.
9. A API nunca aceita pathname vindo do cliente para assinar. Plano, workout,
   exercício, tipo `image` e associação são resolvidos pelo domínio/repository; o
   pathname exato vem exclusivamente da imagem persistida.
10. Para cada variante, `BlobStorageService` chama
    `issueSignedToken({ pathname, operations: ['get'], validUntil })` sem token
    explícito e depois `presignUrl(issuedToken, { access: 'private', pathname,
operation: 'get', validUntil, useCache: true })`.
11. O token emitido e a URL possuem o mesmo `validUntil`, fixado em 15 minutos após
    o instante de emissão. O limite fica centralizado na API e não é configurável
    pelo cliente.
12. Thumbnail e display recebem tokens limitados aos respectivos pathnames; não se
    usa pathname `*`, mesmo que isso reduza o número de chamadas de emissão.
13. A assinatura das variantes de uma imagem pode ocorrer em paralelo, e a
    hidratação de arrays usa concorrência limitada a no máximo oito operações de
    emissão simultâneas para não criar rajada sem limite contra o SDK.
14. Toda response canônica com imagem não nula contém `thumbnailUrl`, `displayUrl`
    e `signedUrlExpiresAt`. As duas URLs são completas, apontam para o host privado
    retornado pelo SDK e expiram juntas.
15. Signed URLs são dados efêmeros de response: não são persistidas no MongoDB,
    Redis, local/session storage, IndexedDB, Workbox, Analytics nem logs.
16. A API não cria `GET .../image/:variant`. O navegador usa a URL assinada como
    `src` e baixa o WebP diretamente do Blob/CDN, sem cookie de sessão e sem passar
    novamente pela API.
17. A signed URL é uma credencial bearer temporária: qualquer portador pode
    executar `GET` daquele objeto até `validUntil`. Ela não autoriza outro
    pathname, operação ou uso depois da expiração.
18. Responses JSON que contêm signed URLs usam `Cache-Control: private, no-store`
    no transporte HTTP para impedir cache compartilhado ou persistente. O cache em
    memória do TanStack Query continua permitido durante a sessão da tela.
19. A geração das URLs pertence à montagem da response, não à entidade nem ao
    repository. O controller valida e chama o command; o command orquestra a
    leitura/mutation e a hidratação; `ExerciseImageService` prepara as duas
    variantes e somente `BlobStorageService` acessa o SDK.
20. Em um upload, as URLs das novas variantes são assinadas antes do CAS. Falha de
    assinatura compensa os novos blobs, não modifica o aggregate e devolve
    `503 IMAGE_URL_SIGNING_FAILED`, evitando sucesso persistido com response
    ambígua.
21. Em uma leitura de workout, falha ao assinar qualquer imagem interrompe a
    response e devolve `503 IMAGE_URL_SIGNING_FAILED`; nenhuma URL parcial é
    publicada nem ocorre mutação.
22. Classes conhecidas do SDK são convertidas em categorias operacionais fixas,
    como `access_denied`, `store_not_found`, `store_suspended`, `rate_limited`,
    `aborted`, `service_unavailable` e `unknown`. Upload continua usando
    `IMAGE_UPLOAD_FAILED`; assinatura usa `IMAGE_URL_SIGNING_FAILED`.
23. A UI usa `thumbnailUrl`/`displayUrl` diretamente no elemento de imagem, sem
    Axios, `fetch`, base64, inclusão de cookie ou concatenação com `VITE_API_URL`.
24. A UI trata `signedUrlExpiresAt` como dado opaco ISO, sem extrair ou interpretar
    os query params da URL. Dois minutos antes da expiração, invalida/refaz a query
    do workout para obter um novo par.
25. Ao recuperar foco/visibilidade, a UI refaz a query se as URLs venceram ou
    vencerão em até dois minutos. A atualização do servidor não apaga drafts do
    formulário mantidos localmente.
26. Se uma imagem falhar e a URL estiver vencida ou próxima da expiração, a UI
    permite uma única renovação automática da query por ciclo. Persistindo a
    falha, mostra `Imagem indisponível` e retry acessível, sem loop.
27. Upload ou substituição mantém a imagem anterior até o sucesso do PUT. A
    response canônica contém novo par assinado e nova expiração; falha anterior ao
    CAS conserva a associação e a prévia antigas.
28. Remoção, exclusão de exercício/workout/plano e reconciliação continuam usando
    somente keys internas e não dependem de URL.
29. A CSP da UI remove
    `gvi3tyf5ckqiqlak.public.blob.vercel-storage.com` e permite em `img-src`
    somente `https://8u9fq5re0oenmrtc.private.blob.vercel-storage.com`, além das
    origens já justificadas. Não é usado wildcard `*.blob.vercel-storage.com`.
30. A origem privada pode aparecer na CSP e nas URLs de response porque o hostname
    não é credencial. Query params de assinatura são sensíveis e nunca são usados
    como chave de log, mensagem de erro ou evento de telemetria.
31. Elementos que exibem a signed URL definem política de referrer que não divulga
    a URL da página ao Blob. A aplicação não replica a URL da imagem em atributo,
    tooltip ou texto além do `src` necessário.
32. O Blob pode atender a signed URL pelo cache próprio/CDN (`useCache: true`),
    pois uploads usam pathnames com sufixo aleatório e não sobrescrevem conteúdo no
    mesmo endereço. A UI/PWA não cria cache persistente adicional.
33. O comando operacional de migração é dry-run por padrão, conta planos,
    exercícios e referências legadas sem registrar keys/URLs e exige flag de
    execução e confirmação textual específica.
34. Na execução, cada plano afetado tem todas as associações do store excluído
    substituídas por `null`, `updatedAt` atualizado e `version` incrementada uma
    única vez, por write atômico condicionado à versão lida. Conflito não é
    sobrescrito: o plano é pulado e reportado para nova execução.
35. A migração é idempotente: repetir o comando depois da limpeza produz zero
    alterações. Como o store público já foi excluído, não existe tentativa de
    apagar ou copiar seus blobs.
36. O script de reconciliação passa a operar somente no store privado e continua
    dry-run por padrão, removendo apenas órfãos sob `exercise-images/` quando
    explicitamente autorizado.
37. Mensagem e stack externas, OIDC, `BLOB_STORE_ID`, webhook key, pathname, URL
    assinada, delegation/signing token, conteúdo e headers de autorização nunca
    são registrados.

## Requisitos não funcionais

- Acessibilidade:
  - a miniatura conserva alt derivado do nome visível do exercício;
  - loading, indisponibilidade e retry possuem nome acessível e não dependem apenas
    de cor;
  - renovação de URL é silenciosa e falha da imagem não remove foco nem bloqueia a
    edição dos demais campos.
- Performance:
  - bytes trafegam diretamente entre Blob/CDN e navegador, sem Function de proxy;
  - `thumbnail` continua limitado a 160x160 e `display` a 1080x1920;
  - assinaturas usam pathname exato e concorrência limitada a oito emissões;
  - nenhuma consulta lista o store para montar a response; a key vem da associação
    MongoDB;
  - medir contagem, duração e categoria de falha da emissão sem registrar URL ou
    pathname;
  - a ADR registra o custo de duas emissões por imagem contra a economia de tirar
    a API do caminho dos bytes.
- Segurança e privacidade:
  - sessão e autorização administrativa são aplicadas antes da emissão;
  - OIDC rotativo substitui segredo permanente da aplicação;
  - a signed URL concede somente `get`, pathname exato e quinze minutos;
  - URLs não são cacheadas por intermediários nem persistidas pela UI/PWA;
  - CSP permite somente a origem privada exata;
  - a UI não recebe pathname, token de assinatura separado nem capacidade de
    assinar novas URLs.
- Observabilidade:
  - logs seguem controller → command → services → repository/SDK;
  - emissão registra IDs técnicos do domínio, quantidade, status, duração e
    categoria sanitizada, nunca URL, pathname ou tokens;
  - `x-request-id` permanece nas responses da API, mas não é esperado na response
    direta do Vercel Blob.

## Critérios de aceite

### Cenário 1 — Upload privado por OIDC com response assinada

- Forma de validar: cenário vivo de upload com seed/cURL atualizado, unitário do
  adapter e E2E multipart com SDK determinístico.
- Given: exercício `image` sem mídia, versão vigente e runtime com
  `BLOB_STORE_ID`/OIDC válidos, sem `BLOB_READ_WRITE_TOKEN`.
- When: a administradora envia JPEG válido pelo PUT multipart.
- Then: duas variantes privadas são criadas, cada uma recebe signed URL `get` de
  quinze minutos antes do CAS, o MongoDB persiste somente keys/dimensões, a
  response contém as URLs e expiração e a versão incrementa uma vez.

### Cenário 2 — Store ID opaco e ausência de lógica de hostname

- Forma de validar: unitário de ambiente/adapter e inspeção estática.
- Given: `BLOB_STORE_ID=store_8u9fq5re0OENMRtC`.
- When: upload, assinatura, listagem ou exclusão chama o SDK.
- Then: o valor é consumido pelo mecanismo oficial sem corte de prefixo, montagem
  de URL, comparação de hostname ou variável adicional de URL.

### Cenário 3 — Workout contém signed URLs por exercício

- Forma de validar: cenário do GET de workout e E2E da API.
- Given: sessão administrativa e workout com dois exercícios `image`, um com
  associação privada e outro sem imagem.
- When: solicita o workout.
- Then: o primeiro contém `thumbnailUrl`, `displayUrl` e
  `signedUrlExpiresAt`; o segundo permanece `image: null`; a response usa
  `private, no-store` e não contém keys nem tokens separados.

### Cenário 4 — Thumbnail acessada diretamente no Blob

- Forma de validar: Playwright com MSW Browser interceptando a origem privada.
- Given: workout retornou thumbnail signed válida.
- When: o `<img>` usa a URL como `src`.
- Then: o navegador solicita o host privado diretamente, sem cookie da API e sem
  request intermediária de mídia, recebe WebP e renderiza o alt correto.

### Cenário 5 — Escopo e prazo da assinatura

- Forma de validar: unitário do adapter contra os tipos locais e teste de contrato.
- Given: thumbnail e display possuem pathnames diferentes.
- When: a API monta suas URLs.
- Then: cada `issueSignedToken` recebe somente o pathname correspondente,
  `operations: ['get']` e quinze minutos; `presignUrl` usa `private`, `get`, o
  mesmo prazo e cache habilitado, sem wildcard.

### Cenário 6 — Leitura sem sessão ou sem privilégio

- Forma de validar: cenários do endpoint de workout vivo e E2E da API.
- Given: respectivamente ausência de sessão e pessoa autenticada sem `isAdmin`.
- When: solicitam o workout global.
- Then: recebem `401 AUTHENTICATION_REQUIRED` ou
  `403 ADMIN_ACCESS_REQUIRED`; nenhum token ou signed URL é solicitado ao SDK.

### Cenário 7 — Falha ao assinar antes do upload commit

- Forma de validar: unitário do adapter/command e E2E com SDK determinístico.
- Given: duas variantes foram enviadas, mas uma assinatura falha por timeout,
  suspensão ou indisponibilidade.
- When: o command prepara a response antes do CAS.
- Then: recebe `503 IMAGE_URL_SIGNING_FAILED`, os blobs novos entram na
  compensação, nenhuma mutação ocorre e logs contêm somente categoria segura.

### Cenário 8 — Expiração e renovação sem perder drafts

- Forma de validar: Playwright com relógio controlado.
- Given: editor aberto com alterações locais e URLs que vencem em até dois
  minutos.
- When: ocorre o timer ou a página recupera visibilidade.
- Then: a query do workout é refeita uma vez, novos links substituem os anteriores
  e os drafts locais continuam intactos.

### Cenário 9 — Signed URL vencida com recuperação visual

- Forma de validar: Playwright com primeira leitura direta recusada e renovação
  bem-sucedida.
- Given: a thumbnail falha porque a URL venceu.
- When: o componente processa o erro.
- Then: renova a query uma vez e renderiza a nova URL; se a nova tentativa também
  falhar, mostra `Imagem indisponível` e retry acessível, sem loop ou mutation.

### Cenário 10 — Substituição e limpeza no store privado

- Forma de validar: cenário vivo de upload/remoção, unitários e E2E.
- Given: exercício possui duas variantes privadas anteriores.
- When: substitui a imagem com sucesso.
- Then: novas variantes e URLs assinadas são preparadas antes do CAS; depois do
  commit as keys antigas são limpas, a UI usa o novo par e falha de limpeza fica
  recuperável pela reconciliação.

### Cenário 11 — Migração de referências do store excluído

- Forma de validar: script contra MongoDB efêmero com dry-run, execução e repetição.
- Given: plano contém uma ou mais associações legadas e outro plano não contém
  imagem.
- When: executa dry-run, depois execução confirmada e por fim repete o comando.
- Then: dry-run não escreve; execução limpa apenas associações legadas e incrementa
  uma vez cada plano afetado; repetição altera zero documentos.

### Cenário 12 — Conflito durante migração

- Forma de validar: teste do script com alteração concorrente da versão.
- Given: a versão de um plano muda entre leitura e write da migração.
- When: o comando tenta limpar suas referências.
- Then: não sobrescreve a mudança concorrente, reporta contagem segura de conflito
  e permite nova execução.

### Cenário 13 — Configuração sem segredo permanente

- Forma de validar: testes parametrizados de `validateEnvironment`, build e smoke
  controlado em Preview.
- Given: Preview/Production possui `BLOB_STORE_ID` e OIDC oficial, mas não possui
  `BLOB_READ_WRITE_TOKEN`.
- When: a aplicação inicia e realiza upload e assinatura.
- Then: bootstrap e operações concluem; ausência de `BLOB_STORE_ID` continua
  impedindo bootstrap nesses ambientes.

### Cenário 14 — CSP, cache e ausência de vazamento

- Forma de validar: build, inspeção de `ui/vercel.json`, testes de contrato e smoke
  em produção.
- Given: workout contém imagem privada.
- When: UI carrega editor, realiza upload e exibe a response.
- Then: CSP permite somente a origem privada exata, JSON com URLs assinadas usa
  `private, no-store`, o PWA não as persiste e nenhum query param, key, token OIDC
  ou URL completa aparece em logs ou Analytics.

## Estratégia de entrega e compatibilidade

1. O store privado já existe e deve estar conectado aos ambientes Development,
   Preview e Production aplicáveis do projeto da API antes do primeiro deployment.
2. A implementação não cria nem altera valores gerenciados no painel. A variável
   manual `BLOB_READ_WRITE_TOKEN` só é removida da Vercel depois que um deployment
   compatível com OIDC estiver ativo.
3. Publicar primeiro a UI que entende `signedUrlExpiresAt`, renova a query e possui
   CSP para a origem privada. Ela continua aceitando `thumbnailUrl` e `displayUrl`
   públicas da API antiga, embora o store excluído não volte a funcionar.
4. Executar o dry-run da limpeza de referências legadas e revisar suas contagens.
   Bloquear novos uploads durante a janela curta de execução confirmada.
5. Executar a limpeza confirmada e repetir até não restarem conflitos nem
   associações legadas.
6. Publicar a API com OIDC, acesso privado, emissão assinada e campo de expiração;
   depois revalidar a UI final no mesmo commit do contrato compartilhado.
7. Realizar smoke de upload, GET do workout, download direto das duas variantes,
   expiração/renovação, substituição, remoção, sessão ausente e reconciliação
   dry-run.
8. Remover a variável manual `BLOB_READ_WRITE_TOKEN` de Development, Preview e
   Production e fazer novo deployment para confirmar que nenhuma instância
   aquecida depende dela.
9. O rollback não recupera o store público nem seus arquivos. Código antigo não
   assina blobs privados e não é rollback operacional válido após novos uploads;
   diante de falha, corrigir para frente ou desabilitar temporariamente mutations
   de imagem preservando as keys privadas.

## Plano de testes

- API unitária:
  - ambiente exige somente `BLOB_STORE_ID` nos runtimes publicados;
  - adapter chama `put/issueSignedToken/presignUrl/del/list` sem token e com opções
    privadas corretas;
  - nenhuma montagem/comparação de hostname permanece;
  - classificação segura das classes conhecidas do SDK;
  - processamento, assinatura pré-CAS, compensação e ausência de URL persistida;
  - hidratação de response, expiração comum, pathname exato, limite de concorrência
    e falha sem resultado parcial.
- API E2E serial:
  - sessão/admin e GET de workout com imagem nula ou assinada;
  - response `private, no-store`, expiração ISO e ausência de keys;
  - 401/403 e `IMAGE_URL_SIGNING_FAILED` estáveis;
  - upload/substituição persistem somente key/dimensões e assinam antes do CAS;
  - exclusões limpam keys privadas depois do CAS;
  - migração dry-run/execute/idempotência/conflito em MongoDB efêmero;
  - reconciliação privada restrita ao prefixo.
- Tipos e UI unitária:
  - `ExerciseImage` mantém URLs e inclui expiração;
  - `<img>` usa a URL diretamente, sem credenciais ou client HTTP paralelo;
  - timer, visibility/focus e erro renovam no máximo uma vez por ciclo;
  - refetch não perde drafts e falha persistente mostra fallback/retry;
  - signed URL nunca participa de Analytics ou storage persistente.
- MSW e Playwright:
  - handler da origem privada valida que a request usa a URL assinada fictícia e
    suporta sucesso, expiração, erro e retry;
  - editor carrega thumbnail diretamente, renova, substitui, remove e preserva
    drafts;
  - nenhuma request real sai do ambiente de teste.
- Configuração e build:
  - CSP remove o host público e contém somente o host privado exato em `img-src`;
  - bundle não contém token OIDC, key, pathname ou signed URL de fixture real;
  - smoke em Preview e Production após remoção do token permanente.
- Quality gates obrigatórios na implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`.

## Riscos e decisões

- Signed URL foi escolhida no lugar do proxy binário por ser o padrão recente do
  Vercel Blob mais próximo de `getSignedUrl` do S3: a API autoriza e concede uma
  capacidade curta, enquanto Blob/CDN entrega os bytes diretamente.
- A autorização não é reaplicada ao baixar cada byte. Quem obtiver a URL pode
  acessar aquele pathname até a expiração; prazo de quinze minutos, escopo `get`
  exato, `no-store`, CSP e ausência de logs limitam essa janela.
- A assinatura exige duas emissões por imagem. O escopo exato foi preferido a um
  delegation token com pathname `*`; concorrência limitada evita rajadas, e a ADR
  registrará métricas para futura revisão se a latência se tornar relevante.
- Não será criada env de URL na API. `issueSignedToken()` e `presignUrl()` usam o
  store escolhido por OIDC/`BLOB_STORE_ID` e devolvem a origem correta sem parsing.
  A origem literal em `img-src` é allowlist de segurança da UI, não configuração
  de acesso ao SDK nem segredo.
- A comparação de hostname será removida, não adaptada. O SDK seleciona o store;
  a aplicação valida o escopo por pathname persistido e opções de assinatura.
- `BLOB_WEBHOOK_PUBLIC_KEY` permanecerá gerenciada pela Vercel, mas sem consumidor
  nesta feature. Usá-la sem webhook real criaria configuração e superfície de
  ataque sem necessidade.
- A response necessariamente expõe a origem privada e os parâmetros assinados ao
  browser. Isso é intencional: o hostname não é segredo, e os parâmetros formam a
  credencial efêmera mínima necessária ao download direto.
- O store público já foi excluído; portanto não existe migração de binários nem
  rollback de dados. Limpar referências quebradas é preferível a manter URLs
  definitivamente inválidas.
- A migração incrementa a versão do aggregate e usa CAS para não apagar edição
  concorrente. Isso pode exigir mais de uma execução, mas preserva a política de
  concorrência vigente.
- Manter `thumbnailUrl` e `displayUrl` reduz ruptura do contrato, mas agora essas
  propriedades não podem ser tratadas como identificadores estáveis. Identidade e
  limpeza usam somente keys internas; a UI respeita `signedUrlExpiresAt`.
- O token OIDC de desenvolvimento é curto e pode expirar. Smokes reais locais usam
  o fluxo oficial da CLI; testes automatizados continuam determinísticos e sem
  rede externa.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rotas e fluxos afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Migração entre produtor e consumidores compatível
- ADR nova criada sem editar a ADR histórica
- Store privado usado por OIDC sem segredo permanente
- URLs assinadas `get` emitidas com pathname exato e prazo de quinze minutos
- Bytes entregues diretamente pelo Blob/CDN, sem endpoint binário da API
- Referências legadas tratadas sem perda de atualização concorrente
- Nenhuma signed URL, key ou credencial persistida ou registrada
- Código e documentação do store público removidos quando deixarem de ter uso
- Revisão de código sem uso concluída em API e UI
- Quality gates da raiz aprovados
