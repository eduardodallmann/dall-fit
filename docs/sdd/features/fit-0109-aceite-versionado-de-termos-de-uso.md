# Feature Spec: Aceite versionado dos termos de uso

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0109`.
- Problema: o Dall Fit permite montar, copiar, receber sugestões e executar planos
  de exercícios, inclusive offline no Android, sem apresentar um documento de uso
  nem conservar evidência de ciência dos riscos. Também não existe gestão de
  versões ou bloqueio de acesso por aceite pendente.
- Resultado: administradores elaboram e publicam versões dos termos; cada pessoa
  aceita expressamente a versão vigente depois do login e antes das
  funcionalidades. O banco conserva o HTML integral publicado e o recibo de cada
  aceite. Uma nova publicação exige novo aceite, sem substituir o texto anterior.
- Referências vigentes:
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md),
    [contratos compartilhados](../base/03-contratos-compartilhados.md) e
    [consulta oficial de tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da API](../../../api/docs/sdd/base/01-arquitetura.md),
    [autenticação](../../../api/docs/sdd/endpoints/auth.md) e
    [pessoa atual](../../../api/docs/sdd/endpoints/current-person.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md),
    [retomada após login](../../../ui/docs/sdd/base/02-rotas-e-comportamento.md),
    [componentes](../../../ui/docs/sdd/base/03-componentes-e-estilizacao.md),
    [entrada pública](../../../ui/docs/sdd/routes/root.md) e
    [dashboard](../../../ui/docs/sdd/routes/dash.md);
  - [login Google](../flows/login-google.md),
    [execução de treino](../flows/execucao-de-treino.md),
    [assistente](../../../api/docs/sdd/endpoints/training-plan-assistant.md) e
    [sincronização Android](../../../api/docs/sdd/endpoints/offline-training-snapshot.md).
- Features relacionadas: [FIT-0007](fit-0007-menu-da-aplicacao.md),
  [FIT-0062](fit-0062-retomar-rota-apos-login.md),
  [FIT-0073](fit-0073-assistente-ia-planos-treino.md),
  [FIT-0082](fit-0082-nucleo-nativo-persistencia-offline.md),
  [FIT-0088](fit-0088-sincronizar-workmanager-app-fechado.md) e
  [FIT-0105](fit-0105-dashboard-com-dados-pessoais-e-administrativos.md).

O objetivo jurídico é informar adequadamente, explicitar limites e conservar
evidências do acordo. Nenhum texto assegura imunidade a reclamações ou processos.
Cláusulas que afastem responsabilidade legal ou imponham renúncia a direitos podem
ser inválidas. A minuta desta feature foi elaborada para o contexto brasileiro e
merece revisão jurídica e de profissional de Educação Física antes de sua
utilização pública; o aceite não corrige uma prática insegura ou irregular.

## Escopo

### Incluído

- Gestão administrativa de rascunhos, prévia, publicação e consulta de versões.
- Primeiro termo completo em português, reproduzido em HTML neste documento.
- Nome do responsável e contato editáveis por versão; a primeira minuta usa
  `Eduardo Dallmann` e `eduardodallmann@gmail.com`, informados pelo proprietário
  para constar publicamente no documento.
- Aceite posterior à autenticação, separado da criação ou sincronização de conta.
- Uso exclusivo por pessoas com 18 anos completos ou mais, declarado no aceite.
- Bloqueio de UI e API enquanto faltar o aceite vigente, inclusive em contas
  antigas, sessões já abertas, links diretos e usuários administradores.
- Substituição do conteúdo de `/dash` pela leitura e aceite enquanto houver
  pendência; menu sem links para funcionalidades nesse estado.
- Consulta posterior do documento e dos próprios recibos em `/terms`.
- Continuidade offline Android com o último aceite confirmado, até ser conhecida
  uma publicação posterior, preservadas as demais exigências nativas vigentes.
- Tratamento do bloqueio no sincronizador em foreground e no WorkManager, com
  preservação da fila.
- Contratos, índices, seeds, MSW, testes e documentação viva na implementação.

### Não incluído

- Aceite durante cadastro, consentimento Google ou emissão da sessão.
- Autorização de responsáveis ou acesso de menores de 18 anos.
- Declaração de aptidão física, diagnóstico, atestado ou aprovação clínica.
- Substituição do aviso específico e das regras de privacidade/triagem da IA.
- Redação de uma política completa de privacidade ou um sistema de consentimentos
  de marketing e dados sensíveis.
- Assinatura ICP-Brasil, biometria, documento de identidade, selfie ou coleta de
  CPF, endereço residencial, IP ou user-agent como evidência adicional de aceite.
- Painel de aceites individuais de terceiros, relatórios jurídicos ou exportação
  administrativa de pessoas.
- Agendamento de vigência, segmentação de público, vários termos simultâneos,
  rollback para versão antiga ou publicação sem exigir novo aceite.
- Editor WYSIWYG, uploads, imagens, vídeos, scripts, CSS ou HTML irrestrito dentro
  do documento. O editor desta entrega trabalha com HTML e prévia segura.
- Promessa de detecção de novas versões enquanto o dispositivo estiver offline.
- Revogação retroativa de aceites ou exclusão automática de histórico jurídico.

## Projetos e documentação afetados

- API e endpoints:
  - criar domínio `terms`, com controllers, commands, services e repositories;
  - documentar `/terms/*` e `/admin/terms/*` em documentos proprietários novos;
  - atualizar as bases de arquitetura, contratos, testes, seeds e logging quando
    houver detalhe vigente novo;
  - atualizar a documentação de todas as fronteiras privadas de negócio que
    passam a responder `TERMS_ACCEPTANCE_REQUIRED`: dashboard, planos pessoais e
    globais, biblioteca, jobs de clonagem, treino, lease, snapshot e assistente;
  - atualizar autenticação/pessoa atual para explicar as exceções de bootstrap,
    sem atribuir ao login um aceite implícito;
  - atualizar [realtime](../../../api/docs/sdd/endpoints/realtime-events.md) para
    a invalidação da política de termos.
- UI e rotas:
  - atualizar árvore manual, proteção autenticada, shell, menu e interceptor Axios;
  - atualizar as rotas `/`, `/dash` e as pré-condições das rotas privadas;
  - criar `/terms` e `/admin/terms`, com documentos proprietários novos;
  - atualizar as bases de arquitetura, rotas, componentes, mocks e testes;
  - adaptar a fronteira nativa, o motor offline e o sincronizador Java.
- Fluxos: atualizar login e execução; criar o fluxo transversal de publicação,
  apresentação, aceite e liberação dos termos.
- Contratos em `@dall-fit/types`: documento publicado, resumos, rascunho
  administrativo, situação de acesso, recibo, requests e erros discriminados;
  exportar somente contratos efetivamente consumidos pelo barrel público.
- Decisões arquiteturais: registrar ADR sobre versões jurídicas imutáveis,
  evidência de aceite e autorização condicionada, incluindo a exceção offline.
  Preservar as decisões de sessão, CAS, SSE e motor nativo das ADRs
  [0004](../adr/ADR-0004-sessao-revogavel-redis-e-csrf.md),
  [0006](../adr/ADR-0006-versao-de-recurso-em-header-de-dominio.md),
  [0008](../adr/ADR-0008-sse-e-invalidacao-realtime.md),
  [0011](../adr/ADR-0011-assistente-ia-triagem-e-sessao-sensivel.md),
  [0013](../adr/ADR-0013-sessoes-web-e-native-isoladas.md) e
  [0014](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md).
- Handlers e fixtures MSW: grupo de termos com estados isolados, incluindo
  primeira publicação, pendência, aceite anterior, erro, latência, HTML filtrado e
  publicação concorrente. Fixtures existentes de outras jornadas representam
  pessoas com aceite vigente para preservar o foco desses cenários.
- Mocks unitários da API: ports de documentos, recibos e publicação realtime;
  guards mockam o service de acesso, sem bancos em unitários.
- E2E: Nest e adapters reais com MongoDB/Redis efêmeros; seeds sintéticos para
  versões e aceites, sem usar dados reais do responsável nas fixtures de teste.

Os documentos vivos relacionados acima são atualizados somente na implementação
autorizada. Nesta fase, a alteração é exclusivamente este arquivo.

## Decisões confirmadas no refinamento

1. Novas versões são criadas, visualizadas e publicadas pela administração.
2. O Android preserva treino offline com o último aceite confirmado. Ao descobrir
   versão posterior, bloqueia até novo aceite online. Conta sem comprovante exige
   conexão antes do primeiro uso.
3. O acesso exige 18 anos completos ou mais, com declaração expressa na tela.
4. O primeiro responsável identificado é Eduardo Dallmann, com o e-mail informado.
   Cada versão pode informar outro responsável/contato e conserva os dados antigos
   no documento que os utilizou.
5. Versionamento, aceite após login, bloqueio por versão vigente e armazenamento
   integral em HTML decorrem do pedido. `/dash` recebe o estado de leitura e aceite
   para conservar a entrada vigente da aplicação.

## Pesquisa e fundamentos da minuta

Foram consultadas as fontes oficiais abaixo. As consequências para o produto são
decisões desta feature, não uma declaração de validação jurídica da aplicação.

| Fonte | Consequência adotada |
| --- | --- |
| [CDC — Lei 8.078/1990, arts. 6º, 8º, 14, 25, 46, 47, 51 e 54](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html) | Informar riscos, facilitar leitura, destacar condições relevantes e preservar direitos. Evitar exoneração total, transferência genérica de responsabilidade, arbitragem obrigatória ou impedimento de reclamar. |
| [Código Civil — art. 5º](https://normas.leg.br/?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2002-01-10%3B10406%21art5) | Adotar, como escolha do produto, idade mínima de 18 anos completos. A declaração não equivale a verificar documentalmente a idade. |
| [MP 2.200-2/2001 — art. 10, § 2º](https://www2.camara.leg.br/legin/fed/medpro/2001/medidaprovisoria-2200-2-24-agosto-2001-391394-normaatualizada-pe.html) | Conservar elementos de autoria e integridade do aceite eletrônico. Clique autenticado, recibo e hash são evidências sujeitas a apreciação; não recebem a presunção própria de certificação ICP-Brasil. |
| [LGPD — Lei 13.709/2018, arts. 6º a 9º, 11, 15, 16 e 18](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) | Minimizar dados e explicar o registro do acordo. Aceite contratual não vira autorização genérica para dados de saúde. Retenção e exercício de direitos continuam sujeitos a fundamento próprio. |
| [Lei 9.696/1998 — arts. 1º e 3º](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9696-1-setembro-1998-374623-normaatualizada-pl.html) | Explicitar a necessidade de orientação profissional. A descrição tecnológica do produto não resolve, por si, eventual enquadramento regulatório das atividades efetivamente prestadas. |
| [Ministério da Saúde — Guia de Atividade Física para a População Brasileira, capítulo de adultos](https://bvsms.saude.gov.br/bvs/publicacoes/guia_atividade_fisica_populacao_brasileira.pdf) | Recomendar progressão compatível com a condição individual, respeito aos limites e procura de assistência diante de lesão ou desconforto anormal. |
| [Secretaria de Saúde de Alagoas — riscos e prevenção no esporte](https://www.saude.al.gov.br/morte-subita-no-esporte-cardiologista-do-hospital-do-coracao-alagoano-alerta-para-riscos-e-prevencao/) | Informar sinais de alerta durante o esforço e orientar sua interrupção com busca de atendimento. |
| [Ministério da Saúde — SAMU 192](https://www.gov.br/saude/pt-br/composicao/saes/samu-192) | Indicar o canal brasileiro de emergência, sem transformar o suporte da aplicação em atendimento médico. |

### Tecnologias verificadas para o planejamento

Manifests, instalação local e código foram confrontados: NestJS `12.2.0`,
Mongoose `9.11.2`, React `19.3.1`, HeroUI React/Styles `3.2.6`, TanStack Router
`1.170.45`, Query `5.104.5`, Form `1.33.5` e Axios `1.20.0`.

- [Guards do Nest](https://docs.nestjs.com/guards) sustentam a autorização
  transversal; os decorators e interfaces locais confirmam a composição usada.
- [CAS por `findOneAndUpdate`](https://mongoosejs.com/docs/tutorials/findoneandupdate.html)
  e índices únicos sustentam publicação e recibos. A página consultada apresenta
  Mongoose `9.12.0`; a aplicação conserva `9.11.2` e os padrões locais existentes,
  sem depender de API nova da versão documentada.
- Foram consultados os índices oficiais
  [HeroUI](https://heroui.com/react/llms.txt),
  [componentes](https://heroui.com/react/llms-components.txt) e
  [padrões](https://heroui.com/react/llms-patterns.txt), além de
  [Checkbox](https://heroui.com/en/docs/react/components/checkbox) e
  [TextArea](https://heroui.com/en/docs/react/components/text-area). Os tipos locais
  confirmam os componentes necessários. O editor usa `TextField`/`TextArea` e
  prévia; não exige biblioteca de rich text.
- [Proteção do Router](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)
  permite resolver o bloqueio no layout tipado, sem roteamento por arquivos.
- [React e HTML inserido](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)
  exigem fronteira explícita para conteúdo sanitizado.
- A sanitização server-side usará `sanitize-html`, dependência nova exclusiva da
  API. A consulta ao registro identificou `2.18.1`, compatível com Node 24, e
  `@types/sanitize-html` `2.16.2`. Seu projeto oficial está no monorepo
  [Apostrophe](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html);
  o [README oficial](https://raw.githubusercontent.com/apostrophecms/apostrophe/main/packages/sanitize-html/README.md)
  documenta allowlists de tags, atributos e protocolos. Na implementação, confirmar
  novamente a versão mantida, instalar respeitando a política do pnpm e validar
  assinatura/tipos efetivamente instalados. A consulta não instalou dependências.

## Requisitos funcionais

### 1. Documento, publicação e imutabilidade

1. Existe uma família de termos de uso para toda a aplicação, em português.
   Rascunhos não exigem aceite. A versão vigente é a publicação com maior
   `publicationNumber`, inteiro positivo e crescente atribuído pelo servidor.
2. Cada rascunho recebe ID, revisão técnica `version` iniciada em zero, título,
   corpo HTML, identificação do responsável, e-mail de contato e resumo das
   alterações. A revisão técnica não é o número jurídico da publicação.
3. A primeira minuta usa o texto do anexo. Novos rascunhos podem partir da versão
   vigente, copiando conteúdo, identificação e contato para edição explícita.
4. O administrador informa título de 1 a 160 caracteres, nome público do
   responsável de 1 a 200, e-mail válido de até 254 e resumo de 1 a 1.000
   caracteres. Campos textuais são aparados; corpo precisa conter texto legível e
   admite até 256 KiB UTF-8 antes e depois da composição/sanitização.
5. A identificação é um conjunto de campos por versão, sem depender de variáveis
   globais lidas na apresentação. A API compõe e escapa sua seção de identificação
   no HTML integral; o editor não mantém uma segunda cópia manual desses valores.
   Título e identificação fazem parte do conteúdo canônico apresentado.
6. Prévia, gravação e publicação passam pela mesma política de sanitização. A
   prévia representa exatamente a composição que será conservada, com indicação
   separada de que ainda é rascunho. Alterar qualquer campo invalida a prévia
   anterior e exige nova prévia confirmada antes de publicar.
7. Publicar é uma ação explícita, depois de salvar e visualizar a prévia. Um
   `AlertDialog` explica que todas as pessoas, inclusive administradores,
   precisarão aceitar e que o conteúdo publicado fica imutável. Cancelar não muda
   a versão vigente.
8. A publicação sela na mesma alteração atômica do documento: número, HTML
   integral sanitizado `contentHtml`, `contentHash` SHA-256 dos bytes UTF-8
   canônicos, identificação, título, resumo, autor técnico e instante do servidor.
   Esses campos ficam imutáveis. Correção, inclusive de contato ou erro de texto,
   exige outra publicação e outro aceite.
9. A versão anterior continua publicada e consultável, mas deixa de liberar
   funcionalidades. Não há flag independente de versão ativa nem alteração em
   massa dos usuários para invalidar seus recibos.
10. A publicação confronta o rascunho/revisão e a publicação vigente observada.
    Uma unique constraint de `publicationNumber` impede duas publicações com o
    mesmo próximo número. Conflito devolve erro próprio e exige leitura canônica,
    revisão da prévia e nova ação; nunca há publicação automática em retry.
11. Repetir a publicação do mesmo documento já publicado devolve a publicação
    existente, sem outro número ou novo evento. Rascunhos podem ser removidos por
    CAS. Publicações e seus HTMLs não possuem edição ou exclusão pela aplicação.
12. Criação, alterações e publicação registram autores por IDs técnicos internos.
    A consulta comum não expõe administradores, lista de pessoas ou dados de
    outros aceites.

### 2. Persistência e evidência

1. MongoDB conserva documentos de termos e recibos em coleções próprias, sem
   embutir um histórico crescente dentro de `Person` ou de uma sessão Redis.
2. O documento de termos possui estado `draft | published`. Publicação é uma
   transição CAS desse próprio documento, com índice único parcial para números
   de publicação. A leitura da vigente usa a ordem numérica das publicações,
   nunca o relógio do dispositivo, ordem lexical ou uma preferência do cliente.
3. O recibo é único por `personId + termsVersionId` e conserva ID próprio, número
   da publicação, hash, `acceptedAt` do servidor, canal verificado `web | native`
   e as declarações expressas de aceite e de idade mínima.
4. O HTML integral fica na publicação imutável referenciada; o recibo não precisa
   duplicar esse texto. A consulta de um recibo sempre resolve o documento exato,
   mesmo depois de outras publicações ou mudanças de responsável.
5. Login, cadastro, seed de produção, silêncio, navegação, checkbox isolado ou uso
   anterior nunca criam recibo. A aplicação não retrodata o primeiro aceite.
6. Repetição do mesmo aceite retorna o recibo original, sem alterar data, canal ou
   declarações. Aceite em um dispositivo vale para a mesma pessoa nos demais.
7. Não há TTL de sessão sobre publicações/recibos nem limpeza em logout, reset do
   Redis ou reinstalação. A retenção atende à comprovação do acordo e ao exercício
   de direitos enquanto houver necessidade e fundamento aplicável; solicitações
   de titulares são tratadas pelo contato público, inclusive sem novo aceite.
   Esta feature não cria retenção perpétua como direito contratual nem automatiza
   a análise jurídica de um pedido de eliminação.
8. Índices e projeções cobrem número único, recibo único e consulta paginada dos
   próprios recibos por data. Produção aplica índices pelo comando operacional
   existente; nenhum `syncIndexes`, backfill de aceite ou seed automático no
   startup é permitido.

### 3. Fronteira HTTP e autorização

Os paths abaixo são o contrato planejado. Responses usam `ApiResponse` ou
`CollectionResponse` existentes; erros seguem `ApiError`, com correlação.

| Operação | Contrato e acesso |
| --- | --- |
| `GET /terms/current` | Sessão válida, mesmo com aceite pendente. Devolve a publicação vigente e a situação da própria pessoa em uma leitura coordenada; `503 TERMS_NOT_CONFIGURED` se nenhuma foi publicada. |
| `GET /terms/access` | Sessão válida, sem exigir aceite. Projeção pequena com `state: accepted | required | not-configured`, ID/número/hash vigentes quando existem e o recibo correspondente quando aceito. Não devolve o HTML. |
| `POST /terms/acceptances` | Sessão válida; body estrito com `termsVersionId`, `contentHash`, `accepted: true` e `isAdult: true`. Novo recibo responde `201`, repetição `200`, ambos com situação de acesso atual. |
| `GET /terms/acceptances` | Lista paginada somente os próprios recibos, incluindo referência ao documento exato; 20 itens por página. |
| `GET /terms/versions/:termsVersionId` | Lê uma publicação, vigente ou histórica, sem expor rascunhos. Exige sessão, mas funciona durante pendência. |
| `GET /admin/terms` | Lista paginada de rascunhos/publicações para administrador, com resumos sem HTML integral; 20 itens por página. |
| `POST /admin/terms` | Cria rascunho com campos completos ou cópia de publicação identificada, sem misturar os dois modos; responde `201` e revisão. |
| `GET /admin/terms/:termsVersionId` | Detalhe administrativo do documento, com conteúdo e revisão. |
| `PATCH /admin/terms/:termsVersionId` | Atualiza rascunho por `X-Resource-Version`, devolvendo sua revisão resultante. |
| `DELETE /admin/terms/:termsVersionId` | Remove somente rascunho por versão; responde `204`. |
| `POST /admin/terms/:termsVersionId/preview` | Prévia do rascunho salvo na revisão enviada, composta e sanitizada no servidor; devolve também seu hash, sem publicação. |
| `POST /admin/terms/:termsVersionId/publish` | Exige revisão, `previewContentHash` e `expectedCurrentTermsId`, anulável apenas na primeira publicação. Publica ou retorna a mesma publicação em replay autorizado. |

1. Autenticação continua aceitando exatamente cookie Web ou Bearer nativo. A
   pessoa e o canal vêm da sessão verificada. Requests não escolhem `personId`,
   autor, número de publicação, data de aceite ou situação de liberação.
2. Mutações Web exigem CSRF e origem exata; nativas verificadas seguem a dispensa
   vigente. Aceite usa a quota autenticada comum; operações administrativas usam a
   quota administrativa existente. Preflight continua fora dessas quotas.
3. Campos desconhecidos, declarações ausentes/falsas, hash malformado ou
   identificação inválida respondem `400 VALIDATION_ERROR`, sem recibo. Não
   inferir maioridade de perfil Google ou de resposta anterior ao assistente.
4. No aceite, documento ainda rascunho/inexistente responde
   `404 TERMS_VERSION_NOT_FOUND`; versão já superada ou hash diferente responde
   `409 TERMS_VERSION_CHANGED`. A UI relê o documento e desmarca as declarações;
   não transfere a concordância para texto diferente.
5. Se uma publicação concorrer com a persistência de um aceite válido para o texto
   apresentado, o recibo desse texto pode permanecer como evidência da manifestação
   efetuada. A API reconcilia a vigente antes da resposta e informa a nova
   pendência; a UI não libera acesso nem reaproveita os checkboxes. Publicação
   posterior à resposta será observada pelos próximos controles de acesso.
6. Conflito técnico de rascunho responde `412 TERMS_DRAFT_VERSION_CONFLICT`;
   ausência da precondição `428 PRECONDITION_REQUIRED`; tentativa de editar ou
   excluir publicação `409 TERMS_VERSION_IMMUTABLE`; concorrência de publicação
   `409 TERMS_PUBLICATION_CONFLICT`. Um erro não é classificado pela mensagem.
7. Uma proteção transversal verifica a publicação vigente e o recibo antes de
   executar funcionalidades privadas de negócio. Sessão válida sem esse recibo
   recebe `403 TERMS_ACCEPTANCE_REQUIRED`, com apenas ID/número/hash exigidos em
   `details`. Esse erro preserva a sessão e não equivale a `401`, CSRF ou revogação
   administrativa.
8. A proteção alcança leituras e escritas de dashboards, planos, biblioteca,
   jobs, assistente, treino, lease/takeover e ingestão offline. A UI oculta links,
   mas acesso HTTP direto também é recusado antes de efeitos de negócio.
   No snapshot Android, preservar a ordem vigente: validar primeiro pacote e
   contrato pelo serviço de compatibilidade, depois exigir os termos e somente
   então preparar conteúdo, lock e persistência do treino. Se esse fluxo não puder
   usar o mesmo guard, seu command chama o mesmo service de acesso nesse ponto,
   sem duplicar a regra ou consultar termos antes de recusar pacote incompatível.
9. As exceções são explícitas: autenticação, pessoa atual, CSRF, logout, tema da
   própria pessoa, leitura/aceite dos termos e stream restrito de invalidação da
   política. Operações públicas de saúde operacional e compatibilidade Android
   continuam públicas. Callbacks internos HMAC de jobs já iniciados continuam no
   seu contrato de serviço; não autorizam ações novas de usuário.
10. Administração de termos também exige aceite vigente, exceto quando ainda não
    existe publicação: nesse caso, somente administradores podem preparar a
    primeira versão. Essa exceção de bootstrap não libera nenhuma outra área e
    termina automaticamente depois da primeira publicação. Pessoa comum continua
    bloqueada; autenticação sozinha não resolve ausência de documento.
11. Sem publicação, endpoints privados de negócio respondem
    `503 TERMS_NOT_CONFIGURED`. Indisponibilidade da consulta necessária responde
    `503 TERMS_UNAVAILABLE`, sem fallback de autorização no servidor.
12. O guard depende de service público do domínio; repositories permanecem
    encapsulados. Não criar import circular entre autenticação e termos.
    Controllers validam/chamam commands; commands montam responses e orquestram;
    services executam regras e chamam ports/adapters conforme a arquitetura.
13. A autoridade de cada request é a versão vigente na verificação do guard;
    requisições já autorizadas/em execução não recebem rollback retroativo quando
    uma publicação acontece. Novas requisições sempre consultam a política atual,
    sem cache positivo indefinido, claim JWT de aceite ou confiança em storage
    enviado pelo cliente.
14. Publicação recalcula o HTML/hash e confronta `previewContentHash` antes de
    escrever. Divergência de conteúdo ou revisão exige nova prévia e responde
    `409 TERMS_PREVIEW_CHANGED`, sem publicar. Replay também respeita a
    autorização vigente: se o autor ficou pendente após publicar, consulta
    `/terms/current` e aceita antes de voltar à administração.

### 4. Tela inicial, menu e retomada

1. Login e criação de conta mantêm sua jornada. Depois de confirmar a pessoa e o
   CSRF Web, a proteção autenticada confirma a situação dos termos antes de montar
   links, queries ou conteúdo de negócio. Android usa Bearer e não consulta CSRF.
2. Enquanto houver pendência, `/dash` apresenta título `Termos de uso`, versão,
   data de publicação, responsável, contato, resumo das alterações e HTML integral
   legível. O dashboard de métricas não é montado nem consultado nesse estado.
3. Acima do documento, explicar `Para usar o Dall Fit, leia e aceite a versão
   atual dos termos.` e `Seu cadastro já foi realizado. O aceite é uma etapa
   separada.`. Uma atualização identifica que existe uma nova versão e conserva
   disponível o acesso aos próprios documentos anteriores.
4. Abaixo do texto existem dois checkboxes inicialmente desmarcados:
   - `Declaro que tenho 18 anos completos ou mais.`;
   - `Li e aceito os Termos de Uso desta versão e estou ciente dos riscos e dos
     cuidados descritos para a prática de exercícios.`.
5. A ação `Aceitar e continuar` só pode ser enviada com ambos marcados e documento
   carregado. Essa manifestação não declara saúde perfeita, inexistência de lesão
   ou consulta médica realizada. Não exigir CPF, data de nascimento ou resposta
   clínica para esta entrega.
6. Não há checkbox previamente marcado, aceite por rolagem, silêncio ou clique de
   navegação. Tempo mínimo e rolagem até o fim não são provas de leitura e não são
   exigidos. Leitor de tela e teclado podem alcançar todas as cláusulas e ações.
7. O menu persistente e o Drawer compartilham o estado bloqueado. Mostram
   identidade, tema e `Sair`, sem links de Home, Treinar, planos ou administração.
   Ações de instalação que abram outras superfícies também ficam ocultas durante
   a pendência. No bootstrap sem publicação, o administrador recebe na região
   principal a ação `Configurar primeiro termo`, restrita a `/admin/terms`.
8. Acesso direto, histórico, reload, preloads ou navegação programática para outra
   funcionalidade não contornam o bloqueio. A entrada efetiva é substituída por
   `/dash` antes de carregar o destino. Preloads não registram aceite nem destino.
9. A intenção privada válida é conservada pelas regras de segurança, prazo de 30
   minutos e isolamento por aba da retomada vigente. Ela só é consumida depois de
   confirmar autenticação e termos. Se o prazo vencer durante a leitura, o aceite
   continua disponível e o destino passa a ser `/dash`. Permissões e estado do
   recurso continuam sendo validados na retomada.
10. O aceite é uma mutation confirmada, sem desbloqueio otimista e sem retry
    automático. Pending impede duplo envio e fechamento do mesmo contexto; falha
    preserva a leitura e as declarações se o texto continuar o mesmo, apresenta
    erro persistente e permite nova tentativa explícita.
11. Sucesso atualiza a situação canônica, revalida o Router e libera menu e destino
    válido, ou dashboard. Uma publicação concorrente mantém a leitura bloqueada
    para o texto novo. Timeout depois de commit pode ser recuperado pelo mesmo
    aceite idempotente ou por nova leitura da situação.
12. `Sair` não exige concordância. Discordar mantém as funcionalidades bloqueadas,
    sem apagar a conta ou marcar aceite; a pessoa pode sair e contactar o
    responsável. No Android, o logout continua respeitando a confirmação vigente
    para dados locais pendentes.
13. Sem documento publicado, mostrar `Termos ainda não disponíveis`, retry e saída,
    além da ação administrativa estritamente necessária. Erro de leitura mostra
    `Não foi possível carregar os termos`, retry e saída. Loading ou falha nunca
    exibe temporariamente métricas ou navegação liberada.
14. Para quem já aceitou, `/dash` conserva seu comportamento de dashboard. O menu
    inclui `Termos de uso`, que abre `/terms` com a vigente e os próprios recibos,
    documentos históricos e respectivas datas; não oferece novo aceite de versão
    superada. A mesma leitura legal pode ser acessada pela tela de pendência sem
    liberar funcionalidades de negócio.
    Administradores com aceite vigente também recebem o link `Gestão de termos`
    para `/admin/terms`.
15. A leitura oferece `Copiar texto`, com versão, publicação, responsável, contato
    e conteúdo completo convertido em texto legível. Falha de clipboard mantém
    uma alternativa em campo textual readonly selecionável. Isso respeita a
    exceção vigente de seleção para controles readonly, sem alterar globalmente
    a política de seleção de texto.

### 5. Nova publicação durante o uso

1. A publicação efetiva invalida a situação de termos para todas as pessoas.
   Reutilizar SSE com um recurso de termos e payload mínimo, sem HTML, recibo ou
   identidade. O stream continua disponível para essa política durante pendência;
   eventos de negócio deixam de ser entregues enquanto faltar aceite.
2. Como SSE é best-effort e não funciona hoje no canal nativo, os clientes também
   revalidam no bootstrap, foco/resume, reconexão, entradas efetivas em rotas
   privadas e a cada cinco minutos enquanto visíveis. Consultas concorrentes
   compartilham a mesma operação; evento, poll ou resposta tardia não regride uma
   versão exigida mais nova já conhecida.
3. `403 TERMS_ACCEPTANCE_REQUIRED` do Axios aciona o mesmo coordenador e a leitura
   legal, sem logout, replay de mutation ou alteração do CSRF. Uma nova geração de
   conta não recebe callbacks, drafts ou permissão da conta anterior.
4. Detectada pendência, o shell oculta imediatamente conteúdo e links de negócio,
   impede novas queries/mutations automáticas, preparação offline e abertura da
   IA. Um bloqueador de navegação não oferece a opção de continuar usando a rota
   impedida. Drafts já existentes permanecem somente em memória da mesma geração,
   sem autosave/replay; a nova leitura não os promove a estado confirmado.
5. Sessões de treino e progresso confirmado não são cancelados ou apagados pelo
   bloqueio. A UI orienta a interromper a atividade em segurança antes de ler.
   Depois do aceite, retoma a autoridade e o estado canônicos disponíveis;
   expirações e regras de retomada já existentes continuam valendo. Timers não
   geram novas mutations enquanto a funcionalidade estiver bloqueada.
6. Falha técnica ao revalidar não é aceite nem nova versão. Na Web, impede novas
   entradas/ações enquanto não for possível confirmar a condição. No Android,
   somente a exceção de uso local com comprovante válido descrita abaixo pode
   continuar; nenhuma funcionalidade HTTP recebe autorização local.

### 6. Android, offline e sincronização

1. O primeiro uso e todo aceite exigem conexão e confirmação da API. Registrar um
   gesto local ou reenviá-lo silenciosamente depois não é um aceite offline.
2. Após confirmação, a fronteira nativa conserva, vinculados à pessoa, o recibo
   mínimo e o maior número de publicação conhecido. Nenhum token, conversa,
   dado clínico ou HTML arbitrário entra nesse comprovante de acesso.
3. Esses metadados pertencem ao mesmo motor privado Android e à sua limpeza de
   conta, não a `localStorage`, banco Web ou serviço SQLite paralelo. Se exigirem
   alteração de schema, usar migration aditiva que preserve planos, sessões,
   snapshots, arquivos e a ordem da fila. Conta legada sem comprovante exige
   primeira confirmação online; nunca inferir aceite de um plano já preparado.
4. Enquanto não existir versão posterior conhecida, o último aceite confirmado
   permite somente as jornadas offline já suportadas. Não prolonga sessão,
   validade de preparação, lease ou compatibilidade do pacote.
5. Uma exigência mais nova conhecida prevalece sobre o recibo antigo mesmo se a
   rede cair depois. O bloqueio permanece na abertura, resume e reinicialização;
   ficar offline não restaura acesso. Conta sem comprovante ou com comprovante
   inválido vê conexão necessária para verificar os termos.
6. Nova publicação desconhecida durante modo avião não pode ser detectada. Essa
   janela é uma exceção de produto expressamente aceita no refinamento. Ao voltar
   a ter conexão, verificar a situação antes de preparar novo conteúdo ou iniciar
   outra execução; descoberta de pendência aplica a barreira.
7. `PUT /training/offline-snapshot` também pode devolver
   `403 TERMS_ACCEPTANCE_REQUIRED`. O transporte Java o classifica especificamente
   como `terms-required`, pausa globalmente foreground e Worker e conserva
   execução, revisão, sequência, terminal, arquivos e credencial. Não o converte
   em autenticação expirada, conflito, descarte, lease inválido ou retry por item.
8. O número exigido descoberto pelo Worker é persistido e observado pela UI quando
   ela abrir. Worker não mostra o termo, aceita por conta da pessoa nem faz loop
   de tentativas. A notificação existente de autenticação/conflito não é
   reutilizada com uma mensagem incorreta; esta entrega não acrescenta nova
   notificação de termos.
9. Depois de confirmar aceite vigente na mesma pessoa, a composição atualiza o
   comprovante e rearma a fila existente, mantendo idempotência e ordem. Aceite
   em outro dispositivo pode liberar o app após nova consulta canônica; ele não é
   presumido enquanto esse dispositivo permanecer offline.
10. Troca de conta limpa o comprovante e a exigência pessoal junto dos dados
    privados antes de ativar a nova conta. Expiração local segue a regra vigente
    de preservar dados para reautenticação da mesma pessoa. Reinstalação exige
    confirmação online e não restaura comprovante por backup.
11. Bloqueio por atualização obrigatória e integridade do storage continua
    precedendo comandos incompatíveis. Um aceite não contorna mínimo Android,
    migração, lease, CSRF ou autorização administrativa.

### 7. Administração e apresentação do HTML

1. `/admin/terms` usa a proteção administrativa e lista publicações/rascunhos,
   diferenciando a vigente. Publicações abrem em leitura; rascunhos oferecem editar,
   salvar, prévia, publicar e excluir com confirmação.
2. O formulário usa TanStack Form com campos HeroUI; o corpo é um editor de fonte
   HTML em `TextArea`, com orientação para títulos, parágrafos, destaque e listas.
   A prévia canônica vem da API e nunca executa o HTML bruto digitado.
3. Salvar, prévia e publicar têm pending compartilhado por documento. Campos
   alterados, erros e conflitos permanecem recuperáveis; sair com trabalho não
   confirmado segue a proteção vigente de navegação/reload. CAS usa a revisão
   corrente, e publicação exige a prévia da mesma revisão.
4. Permitir somente `h2`, `h3`, `p`, `strong`, `em`, `ul`, `ol`, `li`, `br`,
   `blockquote` e `a`. Links admitem apenas HTTPS absoluto ou `mailto`, sem
   URL relativa/protocol-relative; o servidor controla atributos de navegação
   segura. Não permitir estilos, classes, IDs arbitrários, atributos de evento,
   `script`, `iframe`, `form`, imagem, SVG ou protocolos executáveis.
5. Sanitização usa parser/biblioteca mantida e allowlist explícita, nunca regex
   como defesa principal. A prévia informa a remoção de conteúdo não permitido;
   publicar exige visualizar o resultado sanitizado. Payload vazio depois da
   sanitização é inválido.
6. O HTML publicado é apresentado por uma fronteira pequena e explícita para
   conteúdo canônico; a UI não recebe HTML não sanitizado para renderização.
   Estilo de headings, listas, links e destaques vem de `styles.ts` e tokens do
   produto, sem CSS persistido no banco.
7. Usar HeroUI `Card`, `Checkbox`, `Button`, `Alert`, `Skeleton`, `TextField`,
   `TextArea`, `Table`, paginação e `AlertDialog` conforme suas APIs locais.
   Composição fica em `index.tsx`; apresentação em funções `tv` de
   `@heroui/styles`. Não criar primitives equivalentes.

## Requisitos não funcionais

- Acessibilidade: texto integral com fonte de pelo menos `16px`, contraste nos
  dois temas, headings ordenados e largura legível; ações não sobrepõem o final do
  termo. Teclado, leitor de tela e viewport `390x844` alcançam texto e decisões.
  Erro, pending, nova versão e bloqueio possuem anúncio e foco previsíveis. O
  estado de leitura não depende de cor ou de rolagem por ponteiro.
- Performance: consultas de acesso usam projeções e índices; o guard não carrega
  o HTML integral em cada request. HTML é carregado apenas para leitura, edição
  ou prévia. Polling somente visível, single-flight e sem N+1 de versões/recibos.
- Segurança: autorização no servidor; admin e ownership de recibos; sanitização
  antes de persistir/renderizar; `Cache-Control: private, no-store` nas leituras
  autenticadas. Sem cache privado PWA, credencial adicional ou segredo no termo.
- Privacidade: recibos não contêm respostas de saúde, IP/user-agent, perfil Google
  duplicado ou identificador de sessão bruto. Nome/e-mail públicos do responsável
  pertencem ao documento solicitado, não a logs nem fixtures de pessoas.
- Observabilidade: seguir a política de logging em todas as camadas, com branches,
  resultados sanitizados e retornos atribuídos. Publicação e recibo são auditáveis
  no MongoDB; log operacional não substitui evidência de aceite. Registrar somente
  ID técnico autorizado, número, hash, categoria e resultado, sem HTML ou PII.
- Analytics: mapear ações novas na fronteira tipada existente, com enums para
  aceitar, copiar, tentar novamente, criar, salvar, prévia, publicar e excluir.
  Operações assíncronas emitem início/terminal uma vez; redirects automáticos não
  simulam interação. Nenhum evento inclui conteúdo, hash, versão, pessoa,
  responsável, contato ou declaração de idade. Auditoria jurídica não depende de
  Analytics.
- Layout: preservar o shell e seu breakpoint de `768px`. Na implementação,
  inspecionar referências existentes das rotas afetadas somente para layout;
  rotas/estados sem imagens não exigem novas screenshots nesta demanda.

## Critérios de aceite

Os seletores `mockTerms` abaixo são exclusivos de desenvolvimento com MSW. A
implementação deve introduzi-los pelo mecanismo já adotado, sem query/header de
mock no contrato real. Os documentos novos de endpoint deverão conter seeds e
cURLs completos correspondentes aos cenários; as referências abaixo descrevem o
plano e não afirmam que esses arquivos já existem.

### Cenário 1 — Cadastro sem aceite implícito

- Forma de validar: E2E da autenticação e Playwright do flow de login; link
  `http://localhost:3000/?mockAuth=unauthenticated&mockTerms=required`.
- Given: conta ainda inexistente e termo publicado.
- When: a pessoa conclui login Google.
- Then: conta e sessão existem, nenhum recibo foi criado e `/dash` apresenta o
  termo com os checkboxes desmarcados e menu sem links de negócio.

### Cenário 2 — Aceite libera destino e vale entre sessões

- Forma de validar: link
  `http://localhost:3000/training-plan?mockTerms=required`; E2E do aceite.
- Given: sessão válida, versão vigente carregada e destino privado pendente.
- When: a pessoa declara idade mínima, concorda e confirma.
- Then: há um recibo com data do servidor e texto/hash corretos; só depois da
  resposta o menu libera e a rota é retomada. Novo login ou outro dispositivo da
  mesma pessoa reconhece o aceite pela API, sem criar outro recibo.

### Cenário 3 — Declarações e confirmação obrigatórias

- Forma de validar: link `http://localhost:3000/dash?mockTerms=required`; unitários
  do DTO e E2E com body inválido.
- Given: documento carregado e apenas uma declaração marcada.
- When: a pessoa tenta avançar, ou um cliente envia `false`, omite campo ou
  acrescenta `personId`/data.
- Then: a UI impede o envio e a API rejeita o body sem recibo. Ler, rolar,
  recarregar e sair também não registram aceite.

### Cenário 4 — Nova publicação bloqueia contas existentes

- Forma de validar: link `http://localhost:3000/training?mockTerms=updated`;
  Playwright de publicação/aceite e E2E das fronteiras protegidas.
- Given: conta com recibo da versão 1 e aplicação aberta.
- When: a versão 2 é publicada e descoberta por evento, consulta ou erro HTTP.
- Then: conteúdo/ações de negócio deixam de estar disponíveis, o termo novo é
  apresentado e requests diretas recebem `403 TERMS_ACCEPTANCE_REQUIRED`.
- And: sessão, treino confirmado e recibo da versão 1 são preservados; o aceite
  novo cria outro recibo e a retomada respeita o estado canônico.

### Cenário 5 — Sem termo ou indisponibilidade

- Forma de validar: links `http://localhost:3000/dash?mockTerms=not-configured` e
  `http://localhost:3000/dash?mockTerms=load-error`; E2E do guard/consulta.
- Given: nenhuma publicação, ou consulta necessária indisponível.
- When: uma pessoa comum tenta entrar.
- Then: não acessa métricas ou links; recebe mensagem, retry e saída. A API
  diferencia falta de configuração e indisponibilidade, sem fabricar aceite.

### Cenário 6 — Administração da primeira versão

- Forma de validar: link
  `http://localhost:3000/dash?mockAuth=admin&mockTerms=not-configured`.
- Given: administrador autenticado e nenhuma publicação.
- When: abre a configuração inicial, edita responsável/contato, salva, confere a
  prévia e confirma publicação.
- Then: a primeira versão é publicada uma vez, a exceção inicial termina e esse
  próprio administrador deve aceitá-la antes das funcionalidades.
- And: pessoa comum não consegue usar a mesma exceção via URL ou HTTP.

### Cenário 7 — Responsável e contato pertencem à versão

- Forma de validar: link
  `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=admin` e E2E.
- Given: versão 1 publicada e aceita com uma identificação sintética.
- When: o administrador cria e publica versão 2 com outra identificação.
- Then: a nova leitura usa a identificação nova; versão 1 e seu recibo continuam
  resolvendo HTML, contato, hash e data anteriores, sem edição retroativa.

### Cenário 8 — Publicações e edições concorrentes

- Forma de validar: E2E com requests concorrentes controladas; UI com seletor
  `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=publication-conflict`.
- Given: duas operações observam a mesma revisão ou publicação vigente.
- When: concorrem para salvar/publicar.
- Then: apenas a escrita compatível sucede; conflito preserva o rascunho,
  informa recuperação e não cria números duplicados. Replay do mesmo documento
  publicado retorna o resultado original. Editar/excluir publicação é recusado.

### Cenário 9 — Versão muda durante a leitura ou confirmação

- Forma de validar: link
  `http://localhost:3000/dash?mockTerms=changed-during-acceptance`; E2E com barreira
  na concorrência publicação/aceite.
- Given: versão 1 foi apresentada e a pessoa marcou as declarações.
- When: outra versão passa a ser vigente antes ou durante a confirmação.
- Then: a UI permanece bloqueada e apresenta o novo texto com declarações
  desmarcadas. Eventual recibo da versão 1 atesta somente essa manifestação e não
  libera a versão 2. Nenhuma mutation de negócio é repetida automaticamente.

### Cenário 10 — Falha de aceite e resultado ambíguo

- Forma de validar: links `http://localhost:3000/dash?mockTerms=accept-error` e
  `http://localhost:3000/dash?mockTerms=accept-timeout`.
- Given: documento vigente, declarações preenchidas e request em voo.
- When: ocorre falha antes do commit ou timeout depois dele.
- Then: não há desbloqueio otimista; o erro permanece recuperável e nova tentativa
  explícita converge para no máximo um recibo, preservando sua data original.

### Cenário 11 — URLs e chamadas diretas não contornam o bloqueio

- Forma de validar: Playwright com link privado e histórico; E2E de endpoints
  representativos de leitura, mutação, admin, IA, lease e snapshot.
- Given: pessoa autenticada sem aceite vigente.
- When: tenta acessar `/training`, `/training-plan`, `/global/training-plan`,
  dashboard ou seus endpoints sem passar pelo menu.
- Then: a UI apresenta a barreira antes do conteúdo e a API recusa negócio;
  `/auth/me`, CSRF, logout, leitura/aceite legal e tema continuam operacionais.

### Cenário 12 — HTML seguro e prévia fiel

- Forma de validar: administração com MSW `unsafe-html`, unitários do sanitizer e
  E2E de salvar/prévia/publicação; link
  `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=unsafe-html`.
- Given: rascunho com destaque permitido, script, handler de evento, link
  executável, imagem ou estilo não permitido.
- When: é salvo e visualizado.
- Then: a prévia canônica conserva somente conteúdo permitido, informa a filtragem
  e não executa código nem carrega mídia. A publicação conserva exatamente os
  bytes sanitizados correspondentes ao hash; conteúdo vazio é recusado.

### Cenário 13 — Consulta, cópia e discordância

- Forma de validar: links `http://localhost:3000/terms?mockTerms=accepted` e
  `http://localhost:3000/dash?mockTerms=required`.
- Given: existem recibos próprios anteriores.
- When: a pessoa consulta/copia um documento ou prefere sair sem novo aceite.
- Then: recebe o documento correspondente e seu recibo, sem dados de terceiros;
  copiar não aceita o termo e discordar não elimina conta nem histórico. O contato
  pode ser usado sem concordância e a falha do clipboard possui alternativa.

### Cenário 14 — Uso offline e bloqueio conhecido

- Forma de validar: não se aplica a URL isolada — exige Android, motor privado e
  conectividade controlados; Vitest com ports e testes instrumentados reais.
- Given: mesma conta, recibo confirmado e plano/lease/sessão ainda elegíveis.
- When: fica offline e executa treino; depois reconecta e descobre nova versão.
- Then: o uso local anterior continua válido pela regra escolhida; ao descobrir
  pendência, a barreira prevalece inclusive após perder a rede/reabrir o app.
- And: conta sem comprovante e banco legado não recebem autorização fictícia;
  treino, fila e arquivos já confirmados são preservados.

### Cenário 15 — WorkManager preserva fila por aceite pendente

- Forma de validar: não se aplica a URL isolada — testes Java/instrumentados e
  smoke Android com app fechado, além do E2E do endpoint de snapshot.
- Given: existem snapshots, inclusive terminal, e versão nova ainda não aceita.
- When: Worker recebe `403 TERMS_ACCEPTANCE_REQUIRED`.
- Then: persiste a exigência, pausa sem loop e conserva credencial/fila/revisões.
- And: ao abrir a UI e aceitar, a mesma fila é rearmada na ordem original;
  resposta tardia não altera outra conta e aceite não supera bloqueio de build.

### Cenário 16 — Acessibilidade e isolamento

- Forma de validar: Playwright nos viewports `390x844` e `1440x900`, teclado e
  componentes; testes de lifecycle/migration Android para os estados nativos.
- Given: termo longo, temas claro/escuro e leitura/aceite em andamento.
- When: usa teclado, redimensiona, troca de conta ou encerra a sessão.
- Then: consegue alcançar texto/ações sem overflow ou perda de conteúdo; nenhum
  aceite, declaração, prévia ou liberação de uma geração chega à próxima.

## Estratégia de entrega e compatibilidade

1. Implementar contratos, domínio, índices e testes, mantendo a feature validada
   estável. Não migrar usuários para um estado artificial de aceite.
2. Disponibilizar bootstrap administrativo da primeira minuta por operação
   explícita e idempotente, sem publicação automática. O responsável/contato do
   anexo são dados públicos do documento; seeds de cenário continuam sintéticos.
3. Coordenar API e UI: clientes antigos podem autenticar, mas não contornam a
   barreira HTTP. A primeira publicação torna o aceite necessário para toda a
   base, sem logout forçado ou alteração de senha/Google.
4. Publicar uma build Android que entenda `terms-required`, preserve fila e ofereça
   aceite antes de elevar a compatibilidade mínima existente. A elevação deve
   ocorrer somente depois de sua disponibilidade validada na Play Store. Isso
   reduz o risco de um cliente antigo interpretar a recusa como erro terminal;
   nenhum rollout fabrica aceite para contornar esse intervalo.
5. Migration de metadados nativos é aditiva e cobre bancos anteriores. Mesmo
   usuário reautenticado confirma a situação canônica antes de criar comprovante;
   dados offline antigos são preservados durante essa verificação.
6. Preparar a primeira publicação na implantação coordenada e verificar primeiro
   login, conta existente, administrador, aceite repetido, atualização de versão,
   modo avião e retorno do Worker. Desde a implantação da proteção, negócio sem
   publicação permanece fechado com configuração pendente conforme o bootstrap
   descrito; não existe uma janela automática de uso sem termos.
7. Falha na publicação conserva a versão anterior. Falha após commit é reparada
   por leitura/replay do documento, sem reversão de número nem exclusão de recibo.
   Correções públicas usam nova versão; não editar HTML já aceito.
8. Atualizar documentação viva, contratos, consumidores, fixtures e índices na
   mesma entrega. Revisar API e UI para remover código sem uso, verificando antes
   usos por DI, decorators, configuração, carregamento dinâmico e API pública.

## Plano de testes

- API unitária: sanitização/escaping e protocolos, composição e hash, limites,
  seleção da vigente, imutabilidade, CAS, publicação idempotente, recibo único,
  reconciliação de corrida, maioridade/aceite explícitos, exceções de bootstrap,
  erro técnico sem liberação e redaction. Services substituem ports por mocks
  Vitest tipados; commands e guards cobrem suas decisões próprias.
- API E2E serial: autenticação Web/nativa, CSRF/rate limit, índices reais,
  publicação concorrente, aceite concorrente/duplicado, erros e ausência de
  efeitos nas fronteiras de negócio, reset do Redis sem perda de recibos e
  snapshot recusado sem alterar fila/lease remoto. MongoDB e Redis são efêmeros e
  reais, sem Docker ou suíte backend `test:integration`.
- UI Vitest/MSW: bootstrap, queries single-flight/cancelamento, gating do menu e
  dashboard, validação, pending, conflito, timeout, revalidação, cópia, campo
  readonly, editor/preview, geração de sessão e privacidade de Analytics.
- Playwright: flow login → termos → destino, publicação → novo bloqueio → aceite,
  URLs diretas, admin inicial, publicação concorrente recuperável, aceite com
  erro, histórico, keyboard e layout responsivo. Vite real, Chromium e MSW
  Browser; sem API real, `page.route` ou mock do Axios.
- Android: testes de classificação HTTP e pausa global, migration aditiva,
  vínculo/limpeza, requisito monotônico, ausência de falso aceite, mesma conta,
  troca de conta e preservação da fila. Instrumentados com SQLite/filesystem
  reais; smoke em aparelho/emulador para modo avião, restart, reconexão,
  WorkManager sem WebView e reativação depois do aceite.
- Quality gates da implementação, iniciados na raiz:
  `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`, `pnpm build`,
  `pnpm -C api test:e2e` e `pnpm test:integration`; executar também os testes Java
  e `pnpm android:test` para as mudanças nativas, registrando eventual limitação
  real de dispositivo. Build/smoke Android seguem os comandos e requisitos
  proprietários vigentes.
- A escrita desta feature é `docs-only` e não exige executar esses gates.

## Riscos e decisões

- O termo é uma minuta informada pelas fontes citadas, não garantia de resultado
  judicial. A proteção depende do comportamento real, qualidade dos exercícios,
  informações de segurança, evidências e obrigações aplicáveis. O texto não deve
  ocultar o fato de a IA gerar sugestões ajustadas às respostas da pessoa.
- A indicação de nome/contato público não atribui formação, registro profissional,
  pessoa jurídica ou CNPJ inexistentes. Mudança de operador exige revisão das
  implicações jurídicas e de privacidade, além de nova identificação no documento.
- Declaração de idade é autodeclaração. Esta entrega não oferece verificação
  documental, nem afirma impedir tecnicamente toda declaração falsa.
- O hash detecta divergência dos bytes referenciados; isoladamente, não prova
  identidade, leitura ou inviolabilidade do banco. Imutabilidade da aplicação,
  acesso restrito à persistência e backups são necessários para a evidência.
- A janela offline até descoberta de nova publicação é deliberada. Uma exigência
  conhecida nunca é esquecida por perda de conectividade ou resposta antiga.
- Bloqueio durante uso preserva o progresso confirmado, mas prazos existentes de
  sessão/lease continuam transcorrendo. O texto orienta pausa segura e não promete
  conservação ilimitada ou conclusão automática.
- O registro contratual não pode ser usado como consentimento universal para
  dados sensíveis ou como substituto da política de privacidade. O aviso específico
  da IA permanece uma fronteira independente.
- Conservar um texto por publicação evita duplicação por usuário e crescimento
  ilimitado de um aggregate único. CAS e índice único ordenam as publicações sem
  introduzir transação distribuída ou requisito de replica set local.
- Uma publicação nova não apaga autorizações já verificadas em requests em voo.
  Guard, revalidação e tratamento dos dois transportes delimitam precisamente
  quando a aplicação conhece e aplica a nova exigência.

## Anexo — primeiro termo em HTML

Título: **Termos de Uso e Ciência dos Riscos da Prática de Exercícios — Dall Fit**.
Resumo da primeira publicação: **Apresentação das condições de uso, cuidados com
exercícios, limites das sugestões automatizadas e registro de aceite**.

Número da versão e data são atribuídos na publicação e aparecem junto do texto.
O bloco abaixo representa o HTML integral inicial. A seção 1 é composta a partir
dos campos do responsável e contato; nas próximas versões, o administrador pode
alterar esses campos e o restante do conteúdo antes de publicar. O texto publicado
não conserva variáveis a serem substituídas dinamicamente.

```html
<h2>Termos de Uso e Ciência dos Riscos da Prática de Exercícios — Dall Fit</h2>

<h3>1. Responsável pela aplicação e contato</h3>
<p>
  O Dall Fit é disponibilizado por <strong>Eduardo Dallmann</strong>. Para dúvidas
  sobre estes termos, problemas da aplicação, comunicação de conteúdo inadequado
  ou exercício de direitos relacionados ao serviço e aos seus dados, entre em
  contato pelo e-mail <strong>eduardodallmann@gmail.com</strong>.
</p>

<h3>2. O que o Dall Fit oferece</h3>
<p>
  O Dall Fit oferece recursos para organizar planos de treino, consultar modelos,
  criar ou copiar exercícios, acompanhar séries, registrar cargas, utilizar
  contadores de tempo e consultar resultados de treinos. Conforme a
  disponibilidade do recurso, também pode apresentar sugestões de planos
  elaboradas com auxílio de inteligência artificial e permitir execução offline
  no aplicativo Android.
</p>
<p>
  Planos, parâmetros e demonstrações podem ter origem em modelos da aplicação,
  conteúdos de terceiros, informações fornecidas por você ou sugestões
  automatizadas. A presença de um exercício no aplicativo não significa que ele
  seja adequado à sua condição individual ou que sua execução esteja sendo
  acompanhada por um profissional.
</p>

<h3>3. Idade mínima e conta pessoal</h3>
<p>
  <strong>O uso do Dall Fit é destinado exclusivamente a pessoas com 18 anos
  completos ou mais.</strong> Ao confirmar o aceite, você declara atender a essa
  condição. O serviço não oferece, nesta modalidade, autorização de responsáveis
  para menores de idade.
</p>
<p>
  Utilize sua própria conta e mantenha protegidos o acesso à conta Google e os
  dispositivos em que o aplicativo está conectado. Informe com boa-fé os dados
  necessários aos recursos que decidir utilizar e comunique suspeitas de acesso
  indevido. Não utilize a conta de outra pessoa nem apresente informações falsas
  para contornar limites ou avisos de segurança.
</p>

<h3>4. Orientação profissional e limites do aplicativo</h3>
<p>
  <strong>O aplicativo não examina você, não acompanha sua execução em tempo real
  e não substitui avaliação médica, prescrição individualizada ou supervisão de
  profissional de Educação Física habilitado.</strong> Informações, vídeos,
  imagens, registros de cargas e respostas automatizadas não constituem
  diagnóstico, tratamento, reabilitação ou liberação clínica para se exercitar.
</p>
<p>
  Antes de executar um plano, procure orientação profissional para avaliar sua
  adequação, técnica, intensidade, cargas, volume, descanso e progressão. Essa
  orientação é especialmente importante se você tem sintomas, lesão, doença,
  limitação funcional, utiliza medicamentos que possam afetar o esforço, passou
  por cirurgia, está gestante ou no pós-parto, ou possui outra condição que exija
  cuidados específicos. Em caso de dúvida, esclareça-a antes de começar ou
  continuar a atividade.
</p>
<p>
  Uma avaliação ou orientação anterior não elimina a necessidade de observar
  mudanças na sua condição. A ausência de alerta na aplicação e a conclusão de
  perguntas de triagem também não comprovam aptidão física.
</p>

<h3>5. Ciência dos riscos e cuidados durante a prática</h3>
<p>
  A prática de exercícios envolve esforço e riscos que variam conforme condição
  de saúde, ambiente, técnica, equipamentos, intensidade e outros fatores. Podem
  ocorrer quedas, dores, lesões musculares ou articulares, agravamento de lesões
  existentes, mal-estar e eventos de saúde graves. Orientação adequada e cuidados
  reduzem riscos, mas não tornam toda atividade isenta deles.
</p>
<p>
  <strong>Respeite seus limites e as orientações dos profissionais que acompanham
  você.</strong> Comece e progrida de modo compatível com sua condição. Não
  reproduza automaticamente a carga, velocidade, amplitude, tempo ou quantidade
  de repetições vistos em vídeos, modelos ou treinos de outras pessoas. Um
  registro de carga anterior é histórico, não uma determinação de que você deve
  repetir ou aumentar esse peso.
</p>
<ul>
  <li>Verifique as condições do espaço, do piso e dos equipamentos antes do uso.</li>
  <li>Utilize vestuário e equipamentos adequados e observe as instruções de segurança.</li>
  <li>Organize hidratação, intervalos e recuperação conforme suas necessidades e orientação recebida.</li>
  <li>Interrompa movimentos que provoquem dor ou desconforto anormal e procure orientação.</li>
  <li>Consulte e ajuste o aplicativo em posição segura, antes ou depois de movimentar cargas ou equipamentos.</li>
  <li>Se um exercício não estiver claro ou não parecer adequado, não improvise sua execução.</li>
</ul>

<h3>6. Sintomas e situações de urgência</h3>
<p>
  <strong>Interrompa a atividade e procure atendimento diante de dor ou pressão
  no peito, falta de ar fora do habitual, tontura importante, desmaio,
  palpitações acompanhadas de mal-estar ou outro sinal preocupante.</strong>
  Diante de uma emergência no Brasil, acione o <strong>SAMU pelo número
  192</strong> ou o serviço de emergência disponível no local.
</p>
<p>
  Não aguarde resposta da inteligência artificial, término de um contador ou
  retorno do suporte para buscar assistência. O Dall Fit não presta atendimento
  de urgência, não monitora sinais vitais e não envia socorro automaticamente.
</p>

<h3>7. Sugestões elaboradas com inteligência artificial</h3>
<p>
  Quando disponível, o assistente utiliza respostas fornecidas por você, regras
  da aplicação e processamento automatizado para sugerir uma estrutura de treino.
  Apesar dos controles adotados, suas sugestões podem ser incompletas,
  inadequadas, conter erros ou não considerar uma condição relevante. A triagem
  automatizada não é exame, consulta ou avaliação profissional.
</p>
<p>
  <strong>Revise a proposta antes de utilizá-la e confirme sua adequação com um
  profissional habilitado.</strong> Não omita sintomas ou restrições para obter
  uma proposta nem use respostas diferentes para contornar um bloqueio de
  segurança. Se o assistente orientar avaliação profissional, siga essa
  orientação; montar manualmente outro plano não transforma a atividade em
  segura ou clinicamente autorizada.
</p>
<p>
  O uso do assistente continua sujeito aos seus avisos específicos sobre
  tratamento de informações. Este aceite não autoriza de forma genérica o uso
  de dados sensíveis para qualquer finalidade.
</p>

<h3>8. Modelos, mídias e conteúdo inserido pelo usuário</h3>
<p>
  Modelos de treino são referências e podem precisar de adaptação. Vídeos e
  imagens têm função demonstrativa, podem apresentar outras condições de
  execução e não permitem verificar sua postura ou técnica. Conteúdos e serviços
  externos podem mudar ou ficar indisponíveis. Comunique demonstrações incorretas
  ou situações potencialmente perigosas pelo contato informado nestes termos.
</p>
<p>
  Ao inserir textos ou mídias, utilize conteúdo que você tenha direito de usar,
  respeite direitos de terceiros e evite informações pessoais desnecessárias.
  Não utilize o serviço para conteúdo ilícito, acesso indevido ou interferência
  na segurança e no funcionamento da aplicação.
</p>

<h3>9. Registros, contadores e uso offline</h3>
<p>
  Registros de séries, cargas, duração e conclusões são ferramentas de
  organização. Contadores e notificações auxiliam a rotina, mas não devem ser
  usados como instrumentos médicos ou como garantia de segurança para esforço,
  recuperação ou operação de equipamentos.
</p>
<p>
  O uso offline depende de preparação anterior e das condições de validade da
  conta, do plano e do aplicativo Android. Dados locais aguardam sincronização e
  podem ficar sujeitos a falhas do dispositivo, perda de acesso, desinstalação,
  descarte confirmado ou recuperação do armazenamento. A indicação de resultado
  provisório não equivale à confirmação de envio ao servidor.
</p>
<p>
  Quando estiver sem conexão, o aplicativo poderá continuar com o último aceite
  confirmado e com as funcionalidades locais permitidas. Uma versão nova dos
  termos somente poderá ser descoberta quando houver comunicação com o serviço.
  Depois de conhecida uma pendência, o acesso dependerá do novo aceite online.
  Se a aplicação interromper o acesso durante uma atividade, interrompa o
  movimento e coloque equipamentos e cargas em segurança antes de ler ou agir
  na tela.
</p>

<h3>10. Resultados e condições individuais</h3>
<p>
  Não existe promessa de resultado físico, desempenho, alteração de peso,
  prevenção de lesões ou prazo de evolução. Os resultados dependem de fatores
  individuais e de acompanhamento adequado. Indicadores e resumos do aplicativo
  descrevem registros disponíveis e não substituem avaliação de saúde ou de
  qualidade da execução.
</p>

<h3>11. Responsabilidades e preservação de direitos</h3>
<p>
  Você se compromete a utilizar o serviço com prudência, observar os avisos,
  fornecer informações de boa-fé e buscar a orientação necessária para decidir
  sobre a prática de exercícios. O responsável pela aplicação permanece sujeito
  aos deveres de informação, segurança, qualidade e reparação que a legislação
  lhe atribuir.
</p>
<p>
  A análise de um evento considera os fatos, as causas, a conduta das partes e
  as regras legais aplicáveis. Estes termos não atribuem antecipadamente ao
  usuário toda responsabilidade por qualquer lesão nem afastam a apuração de
  defeitos do serviço, informações inadequadas ou condutas imputáveis ao seu
  responsável.
</p>
<p>
  <strong>O aceite não representa renúncia a indenização devida, ao acesso à
  Justiça, à apresentação de reclamações ou aos direitos assegurados pelo Código
  de Defesa do Consumidor e pelas demais normas aplicáveis.</strong> Nenhuma
  cláusula exige arbitragem obrigatória ou limita direitos que não possam ser
  afastados por contrato.
</p>

<h3>12. Dados e comprovação do aceite</h3>
<p>
  Para comprovar a manifestação de vontade, o Dall Fit registra o vínculo com sua
  conta, a versão do documento, uma referência de integridade do seu conteúdo, a
  data e hora da confirmação no servidor, o canal utilizado e as declarações
  apresentadas na tela. O texto integral de cada publicação é conservado para
  permitir identificar as condições efetivamente aceitas.
</p>
<p>
  Esses registros são utilizados para administrar o acesso, demonstrar o acordo
  e exercer direitos, com observância das bases legais aplicáveis. Sua guarda
  deve se limitar à necessidade e aos prazos aplicáveis, inclusive quando houver
  obrigação de conservação ou necessidade de defesa de direitos. Solicitações
  relacionadas aos seus dados podem ser encaminhadas ao contato do responsável.
</p>
<p>
  As condições específicas dos demais tratamentos de dados devem ser informadas
  nos respectivos avisos. O aceite destes termos não substitui as informações
  de privacidade nem autoriza marketing, compartilhamentos indiscriminados ou
  novas finalidades incompatíveis.
</p>

<h3>13. Versões, discordância e acesso ao documento</h3>
<p>
  Os termos podem receber novas versões para refletir mudanças do serviço ou de
  suas condições. A publicação nova apresenta sua identificação, data e resumo
  das alterações e exige manifestação expressa antes da continuidade das
  funcionalidades, observada a condição offline descrita acima. O aceite de uma
  versão não será utilizado como concordância automática com outra.
</p>
<p>
  Se você discordar, pode deixar de usar o serviço, sair da conta e contactar o
  responsável para esclarecer dúvidas ou exercer seus direitos. O cadastro,
  por si só, não comprova aceite. Recusar uma versão nova não modifica o texto
  de versões anteriores nem autoriza apagar a manifestação que efetivamente
  ocorreu ou aplicá-la retroativamente a outro documento.
</p>
<p>
  Você pode consultar a versão vigente e os documentos associados aos seus
  próprios aceites na área de termos e obter uma cópia textual. Pedidos e
  reclamações pelo contato público podem ser feitos sem aceitar uma nova versão.
</p>

<h3>14. Legislação e disposições finais</h3>
<p>
  Estes termos são interpretados conforme a legislação brasileira e as normas
  obrigatórias que forem aplicáveis. Eventuais controvérsias podem ser
  encaminhadas aos órgãos competentes, preservadas as regras legais de
  competência e a proteção do consumidor. Se uma disposição for inválida, as
  demais permanecem aplicáveis na medida permitida pela lei, sem reduzir
  direitos obrigatórios.
</p>
<p>
  <strong>Ao selecionar as declarações da tela e confirmar “Aceitar e continuar”,
  você manifesta concordância com esta versão e ciência dos riscos, limites e
  cuidados aqui descritos, preservados seus direitos legais.</strong>
</p>
```

## Condições esperadas da entrega

- Documento inicial, gestão de versões e identificação por publicação disponíveis.
- Aceite explícito após login, idade mínima declarada e recibo íntegro/idempotente.
- Bloqueio de UI e API aplicado à vigente, com exceções estritas documentadas.
- Uso offline e Worker coerentes, sem perda de fila por aceite pendente.
- Documentos históricos e próprios recibos consultáveis com acesso a cópia.
- Contratos, endpoints, rotas, fluxos, ADR, índices, seeds e mocks atualizados.
- Revisão de código sem uso e testes proporcionais aos riscos concluídos.
- Quality gates aplicáveis aprovados e validações Android registradas.
