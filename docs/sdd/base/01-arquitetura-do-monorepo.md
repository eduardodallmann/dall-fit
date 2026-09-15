# Arquitetura do monorepo

## Visão geral

O repositório usa pnpm workspaces e possui aplicações implantáveis independentes e
pacotes internos compartilhados.

```text
dall-fit/
├── api/                 # backend NestJS
├── ui/                  # frontend React + Vite e container Android Capacitor
│   └── android/         # projeto nativo Android versionado
├── workflow/            # executor Nitro + Vercel Workflow
├── packages/
│   └── types/           # contratos TypeScript compartilhados
├── eslint/              # configurações comuns e específicas de lint
└── docs/sdd/            # contrato vivo transversal
```

## Responsabilidades

- `api/` possui regras executadas no servidor, persistência, segurança de backend
  e contratos HTTP.
- `ui/` possui apresentação, interação, acessibilidade, navegação e estado do
  cliente. A mesma UI gera o Web/PWA e o bundle local embarcado pelo projeto
  Android Capacitor em `ui/android/`; o projeto nativo é código-fonte editável,
  não um artefato regenerado a cada clone.
- `workflow/` é uma aplicação Vercel independente. Recebe somente comandos
  internos assinados da API, executa a clonagem durável de planos e acessa
  diretamente o MongoDB e o mesmo store Blob por OIDC.
- `packages/types/` possui somente estruturas estáveis necessárias nos dois lados:
  requests, responses, entidades, identificadores e enums.
- a raiz orquestra dependências, lint, typecheck, testes, cobertura e build.

## Regras de dependência

1. `api` e `ui` podem depender de `@dall-fit/types`; `workflow` usa seus contratos
   internos persistidos e não importa código do Nest.
2. `api` não importa arquivos de `ui`, e `ui` não importa arquivos de `api`.
3. `packages/types` não depende de nenhuma aplicação nem contém infraestrutura.
4. Código compartilhado que possua comportamento de runtime não deve ser colocado
   automaticamente em `types`; ele exige pacote próprio e, quando relevante, ADR.
5. Cada aplicação mantém configuração e suíte de testes próprias.
6. API e Workflow se comunicam por HTTPS assinado com HMAC. A API resolve o host
   do Related Project na Vercel e nunca chama funções internas do Workflow por
   import ou execução no mesmo processo.
7. Capacitor não cria uma segunda aplicação frontend. APIs nativas ficam atrás do
   contrato de plataforma da UI, e imports de `@capacitor/*` permanecem confinados
   ao adapter nativo fiscalizado pelo ESLint.
8. A autenticação Android usa Credential Manager atrás dessa fronteira e conserva
   Bearer, vínculo de pessoa e UUID da instalação somente no secure storage cifrado
   pelo Android Keystore. O canal Web continua proprietário de cookie e CSRF.
9. A persistência offline Android pertence a um único serviço Java de escopo da
   aplicação, apoiado por SQLite e pelo filesystem interno privado. A bridge
   Capacitor expõe comandos tipados e futuros consumidores nativos usam a mesma
   instância e o mesmo lock; Web/PWA não mantém uma implementação paralela.
10. A preparação de treino Android compõe os endpoints públicos pelo Axios da UI,
    persiste primeiro um snapshot opaco no motor nativo e entrega signed URLs
    somente em memória ao downloader Java. O downloader grava apenas WebP
    `display` no filesystem privado; nenhum Bearer, URL ou pathname entra no banco.
11. O sincronizador Android reutiliza o singleton do motor e sua fila SQLite tanto
    em primeiro plano quanto no WorkManager. Bridge e Worker entregam o mesmo Bearer
    cifrado somente em memória e enviam snapshots individuais pelo transporte HTTP
    nativo. Claim e commit usam o lock curto do storage; rede e backoff nunca
    bloqueiam persistência local. Unique work por fila e contingência periódica de
    seis horas apenas disparam o motor e não duplicam fila, transporte ou regras.

## Convenções de importação

Código interno de cada aplicação usa `~/*`, resolvido sempre para o próprio
diretório `src/`:

```ts
import { AppService } from '~/app.service';
```

O alias é independente em `api/` e `ui/`: `~/` nunca atravessa a fronteira entre
os projetos. Imports compartilhados usam o nome público do pacote no namespace
`@dall-fit/*`:

```ts
import type { Entity } from '@dall-fit/types';
```

Não existe alias genérico `@/*`. O prefixo `@` é reservado aos pacotes
compartilhados do workspace e aos pacotes externos que já possuem namespace, como
`@nestjs/*` e `@heroui/*`. API e UI não importam caminhos internos de
`packages/types`; consomem somente suas exportações públicas.

## Convenção de paths públicos

Todos os segmentos estáticos dos paths públicos da API e da UI usam inglês,
letras minúsculas e `kebab-case`. Palavras dentro do mesmo segmento são separadas
exclusivamente por hífen; `camelCase`, `PascalCase`, `snake_case` e espaços não são
permitidos. Segmentos de uma única palavra e o path raiz `/` já satisfazem a regra.

Exemplos válidos incluem `/training-plans` na UI e `/auth/test-login` na API.
A convenção se aplica ao path, não ao protocolo, host, porta, fragmento, nomes ou
valores de query params nem aos valores concretos de segmentos dinâmicos. Esses
elementos seguem os contratos de seus respectivos proprietários.

Os detalhes adicionais de endpoints pertencem a
[`api/docs/sdd/base/02-endpoints-e-contratos.md`](../../../api/docs/sdd/base/02-endpoints-e-contratos.md),
e os detalhes de rotas da UI pertencem a
[`ui/docs/sdd/base/02-rotas-e-comportamento.md`](../../../ui/docs/sdd/base/02-rotas-e-comportamento.md).

## Inclusão de um projeto

Um novo projeto deve:

1. possuir `package.json` privado e nome único;
2. ser incluído em `pnpm-workspace.yaml`;
3. oferecer scripts `typecheck`, `test`, `test:coverage` e `test:coverage:ci`
   quando aplicáveis;
4. receber um escopo explícito no ESLint da raiz;
5. ser adicionado aos scripts agregadores;
6. criar seu SDD local quando tiver arquitetura ou comportamento próprios.
