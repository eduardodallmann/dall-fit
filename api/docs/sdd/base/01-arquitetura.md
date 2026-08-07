# Arquitetura base da API

## Stack

A API usa NestJS 11, TypeScript, Node.js, Mongoose para MongoDB e ioredis para
Redis. `@nestjs/config` carrega o ambiente e uma função baseada em Zod valida e
tipa seus valores antes do bootstrap. O entrypoint é
`src/main.ts`, a composição raiz está em `src/app.module.ts` e funcionalidades
futuras devem ser organizadas em módulos por domínio.

O servidor HTTP usa a porta `4000` por padrão e aceita requests da origem da UI em
`http://localhost:3000`. Ambos os valores são configuráveis por ambiente.

## Imports internos e compartilhados

Imports de arquivos em `src/` usam `~/*`, resolvido para o `src/` exclusivo da
API. A configuração é compartilhada por TypeScript, build/watch do Nest e Vitest,
incluindo E2E:

```ts
import { AppService } from '~/app.service';
```

Contratos do monorepo são consumidos pela API por seus pacotes públicos no
namespace `@dall-fit/*`, como `@dall-fit/types`. `~/` nunca aponta para a UI ou
para outro pacote do workspace, e `@/*` não é um alias válido.

## Responsabilidades por camada

Para cada domínio, preferir:

```text
src/<domain>/
├── <domain>.module.ts
├── controllers/       # transporte HTTP
├── commands/          # orquestração completa de cada endpoint/caso de uso
├── services/          # regras e operações de um assunto específico
├── domain/            # regras e tipos exclusivos da API
├── dto/               # validação de entrada/saída do Nest
└── repositories/      # portas e adaptadores de persistência
```

### Controller

Todo fluxo de endpoint começa no controller. Ele possui somente estas
responsabilidades:

1. receber e validar a entrada pelo DTO ou tipo de transporte;
2. registrar a entrada de forma segura, conforme
   `06-logging-e-rastreabilidade.md`;
3. chamar o command proprietário do endpoint;
4. registrar o retorno do command e o valor de saída;
5. devolver o resultado montado pelo command.

Controllers não possuem regras de negócio, `if` de domínio, montagem de response,
acesso a repository, chamada de serviço externo ou envio de mensageria. Guards,
pipes, interceptors e filters podem tratar preocupações HTTP transversais sem
transferir orquestração para o controller.

### Command

O command orquestra todo o fluxo do endpoint. Ele:

- recebe a entrada já validada pelo controller;
- avalia condições e executa os branches do caso de uso;
- monta o contrato de entrada esperado por cada service;
- chama services na ordem necessária;
- registra o retorno de cada service e todo branch escolhido;
- combina resultados e decide os próximos passos;
- monta a response final esperada pelo endpoint;
- registra o valor de saída;
- devolve essa response ao controller.

Cada endpoint possui um command proprietário, salvo quando a inexistência de fluxo
for explicitamente justificada. Commands não acessam repositories, clients de banco,
SDKs externos ou brokers diretamente.

### Service

Um service possui um assunto próprio e coeso. Ele concentra cálculos, regras e
operações reutilizáveis desse assunto. Conforme sua responsabilidade, pode:

- executar uma regra ou cálculo sem I/O;
- preparar entidades, objetos ou arrays completos e chamar um repository;
- encapsular acesso a serviço externo;
- encapsular publicação de mensagem ou evento;
- encapsular uma operação de cache ou Redis.

O service recebe o contrato preparado pelo command e realiza o mapeamento necessário
para suas dependências. Ele não conhece objetos HTTP, não monta a response do
endpoint e não assume a orquestração entre diferentes assuntos. Registra sua
entrada, branches, retornos ou conclusões das dependências e saída.

### Repository

Repositories são acessados exclusivamente por services. Um repository:

- executa persistência ou consulta;
- recebe entidades do sistema, objetos ou arrays já prontos;
- retorna entidades ou estruturas do sistema;
- conhece detalhes do mecanismo de persistência dentro do seu adapter.

Repositories nunca recebem DTO HTTP, nunca constroem DTO, nunca montam response,
nunca decidem fluxo de negócio e nunca são chamados diretamente por controller ou
command. Registram parâmetros sanitizados, resultado ou conclusão da infraestrutura
e retorno do método, sem expor queries, documentos ou credenciais.

### Dependências entre camadas

```text
Controller
└── Command
    ├── Service de domínio
    │   └── Repository
    ├── Service de integração
    │   └── Serviço externo
    ├── Service de mensageria
    │   └── Broker
    └── Service de dados temporários
        └── Redis
```

Módulos não acessam internals de outro domínio. Services não dependem de objetos
HTTP do Express, e infraestrutura implementa as abstrações definidas pela aplicação
ou domínio.

A estrutura cresce com necessidade real; não criar camadas vazias.

## Logging e retornos

Todo método de classe que participa de um fluxo da API registra:

1. entrada e parâmetros sanitizados;
2. conclusão de cada etapa interna relevante;
3. retorno ou conclusão de cada dependência;
4. cada branch escolhido;
5. resultado imediatamente antes de devolvê-lo.

Um método nunca retorna diretamente uma expressão. Ele atribui o resultado a uma
variável, prepara uma representação segura para observabilidade, registra
`NomeDaClasse -> nomeDoMetodo -> return:` e só então retorna o valor original.

O formato completo, níveis, exemplos, segurança, volume e exceções estão em
`06-logging-e-rastreabilidade.md`.

## Contratos

DTOs com decorators permanecem na API. O formato estrutural compartilhado com a UI
fica em `@dall-fit/types`, conforme
`../../../../docs/sdd/base/03-contratos-compartilhados.md`.

O backend é a fonte de verdade do contrato HTTP. Mudanças incompatíveis devem ser
coordenadas com consumidores antes de remover campos ou alterar semântica.

## Persistência e dados temporários

- MongoDB é o banco NoSQL principal.
- Redis armazena dados temporários, caches, sessões, locks ou idempotência conforme
  o caso de uso.
- Mongoose e ioredis são os clients oficiais de produção.
- services dependem de ports de repository ou cache, não de clients ou models
  concretos.
- adapters de MongoDB e Redis implementam essas ports e permanecem na camada de
  infraestrutura.

Nos testes unitários de services, as ports são substituídas por mocks Vitest. Nos
E2E, os adapters reais usam processos efêmeros iniciados por
`mongodb-memory-server` e `redis-memory-server`, conforme
`04-mocks-e-bancos-de-teste.md`.

`MongooseModule` é inicializado pela aplicação porque o domínio `Person` persiste
cadastros e valida a existência da pessoa em toda sessão autenticada. O client Redis
continua ausente do wiring porque nenhum fluxo vigente o consome.

O domínio `Person` expõe ports de repository aos services. O adapter MongoDB mantém
índice único para o identificador `sub` do Google e mapeia documentos para entidades
antes de devolvê-los. Uma pessoa administradora possui `isAdmin: true`; pessoas
comuns omitem o campo. Não existe default `false`, coleção separada nem consulta
adicional para descobrir essa condição.

O domínio `training-plan` usa a coleção `training_plans` e o fluxo completo
controller → command → `TrainingPlanService` → `TrainingPlanRepository`. Planos
globais possuem `ownerPersonId: null`; workouts e exercícios ficam embutidos. O
adapter mantém o índice `{ ownerPersonId: 1, createdAt: -1 }`, projeta somente
resumos públicos e executa `$push`/`$pull` atômicos. Redis não participa. A decisão
está em
`../../../../docs/sdd/adr/ADR-0003-modelagem-dos-planos-de-treino.md`.

## Infraestrutura de desenvolvimento local

O comando abaixo inicia MongoDB e Redis reais em processos locais efêmeros, sem
Docker:

```bash
pnpm -C api dev:infra
```

O MongoDB usa `127.0.0.1:27017`, database `dall-fit`, e o Redis usa
`127.0.0.1:6379`, em conformidade com `api/.env.example`. As versões dos binários
são fixadas no `package.json` da raiz. As portas não são substituídas
automaticamente: se estiverem ocupadas, o comando falha para evitar que a API se
conecte a um processo ou endereço inesperado.

`pnpm -C api dev` executa `dev:infra` e `start:dev` juntos. O orquestrador encerra o
outro processo se infraestrutura ou API terminar, e sinais de encerramento fecham
MongoDB e Redis. Reloads do Nest preservam os dados enquanto a sessão de
desenvolvimento estiver ativa; encerrar a sessão descarta todos os dados. O comando
`pnpm dev` da raiz mantém sua interface e inicia esse ciclo da API em paralelo ao
Vite da UI.

## Configuração e segurança

- variáveis de ambiente são carregadas globalmente por `ConfigModule` e validadas
  antes do bootstrap pelo schema Zod em
  [`src/config/environment.ts`](../../../src/config/environment.ts);
- a validação converte `PORT` para número, aplica os padrões locais, rejeita
  protocolos inválidos de MongoDB e Redis, informa todas as chaves inválidas sem
  expor seus valores e preserva variáveis predefinidas não pertencentes ao schema;
- `api/.env.example` declara:
  - `PORT`, porta HTTP, com padrão local `4000`;
  - `CORS_ORIGIN`, origem permitida, com padrão local
    `http://localhost:3000`;
  - `MONGODB_URI`, URI do MongoDB principal;
  - `REDIS_URL`, URI do Redis;
  - `UI_URL`, destino dos redirecionamentos após autenticação;
  - `GOOGLE_OAUTH_CREDENTIALS_BASE64`, JSON de cliente OAuth Web codificado em
    base64;
  - `AUTH_SESSION_SECRET`, chave HMAC com pelo menos 32 caracteres;
  - `AUTH_SESSION_TTL_SECONDS`, validade da sessão;
  - `AUTH_COOKIE_SECURE`, ativação explícita do atributo `Secure` e seleção
    temporária da política `SameSite` compatível com o deploy;
  - `AUTH_TEST_BYPASS_ENABLED` e `AUTH_TEST_BYPASS_KEY`, mecanismo restrito de
    local/teste;
- o `.env` local não é versionado;
- valores padrão existem para desenvolvimento, mas ambientes implantados devem
  declarar explicitamente seus próprios endereços e credenciais;
- segredos e dados pessoais não aparecem em logs, fixtures ou documentação;
- todo log segue a sanitização e a redaction definidas em
  `06-logging-e-rastreabilidade.md`;
- autenticação e autorização são aplicadas por guards;
- erros internos não expõem stack trace ou detalhes de infraestrutura;
- toda entrada externa é validada antes de chegar ao domínio.

Novos recursos de persistência, autenticação ou mensageria exigem atualização deste
documento e ADR quando houver decisão transversal relevante.

## Autenticação vigente

O módulo `AuthModule` implementa OAuth 2.0 Authorization Code e OpenID Connect no
backend. A credencial Google nunca chega à UI. `GoogleOAuthService` gera a URL,
troca o código e valida o ID token; `AuthSessionService` emite e valida o JWT da
aplicação.

`SessionAuthGuard` é a fronteira reutilizável de endpoints privados. Ele lê o cookie
`dall_fit_session`, valida assinatura e expiração e consulta `Person` no MongoDB.
`Authenticated` aplica o guard e `CurrentPerson` entrega a entidade já validada ao
controller. O token contém apenas o ID técnico, sem nome, e-mail ou foto.

`AdminOnly` é o ponto de extensão para endpoints administrativos. Ele aplica
`SessionAuthGuard` e depois `AdminAuthorizationGuard`; o segundo guard reutiliza a
`Person` anexada ao request e permite somente `isAdmin: true`, sem acessar banco ou
service novamente. Pessoa autenticada sem a chave recebe
`403 ADMIN_ACCESS_REQUIRED`. As sete operações de planos globais aplicam essa
proteção no controller proprietário.

Cookies de sessão usam `HttpOnly`, path `/` e expiração configurada. `state` e
`nonce` usam cookies temporários com as mesmas proteções e são removidos no
callback. A política vigente seleciona `SameSite=Lax` quando
`AUTH_COOKIE_SECURE=false`, preservando o fluxo local, e seleciona obrigatoriamente
`SameSite=None` junto de `Secure` quando `AUTH_COOKIE_SECURE=true`. A flexibilização
do ambiente seguro permite que a UI e a API implantadas em sites distintos sob
`vercel.app` criem e enviem os cookies nas requests com credenciais.

Essa política `SameSite=None` é uma compatibilidade temporária do deploy, não o
estado de segurança desejado em definitivo. Quando frontend e backend compartilharem
o mesmo site registrável, os helpers de criação e limpeza devem voltar a emitir
`SameSite=Lax` também com `Secure=true`, e os testes e esta documentação devem ser
atualizados na mesma mudança.

O bypass de autenticação aceita somente ambiente diferente de produção, flag
explícita e chave própria. A validação de ambiente rejeita
`AUTH_TEST_BYPASS_ENABLED=true` em produção.
