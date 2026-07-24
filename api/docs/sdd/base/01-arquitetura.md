# Arquitetura base da API

## Stack

A API usa NestJS 11, TypeScript e Node.js. O entrypoint é `src/main.ts`, a composição
raiz está em `src/app.module.ts` e funcionalidades futuras devem ser organizadas em
módulos por domínio.

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
- services dependem de ports de repository ou cache, não de clients ou models
  concretos.
- adapters de MongoDB e Redis implementam essas ports e permanecem na camada de
  infraestrutura.

Nos testes unitários de services, as ports são substituídas por mocks Vitest. Nos
E2E, os adapters reais usam processos efêmeros iniciados por
`mongodb-memory-server` e `redis-memory-server`, conforme
`04-mocks-e-bancos-de-teste.md`.

## Configuração e segurança

- variáveis de ambiente são acessadas por módulo de configuração validado;
- segredos e dados pessoais não aparecem em logs, fixtures ou documentação;
- todo log segue a sanitização e a redaction definidas em
  `06-logging-e-rastreabilidade.md`;
- autenticação e autorização são aplicadas por guards;
- erros internos não expõem stack trace ou detalhes de infraestrutura;
- toda entrada externa é validada antes de chegar ao domínio.

Novos recursos de persistência, autenticação ou mensageria exigem atualização deste
documento e ADR quando houver decisão transversal relevante.
