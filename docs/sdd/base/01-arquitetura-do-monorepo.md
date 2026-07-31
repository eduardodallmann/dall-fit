# Arquitetura do monorepo

## Visão geral

O repositório usa pnpm workspaces e possui aplicações implantáveis independentes e
pacotes internos compartilhados.

```text
dall-fit/
├── api/                 # backend NestJS
├── ui/                  # frontend React + Vite
├── packages/
│   └── types/           # contratos TypeScript compartilhados
├── eslint/              # configurações comuns e específicas de lint
└── docs/sdd/            # contrato vivo transversal
```

## Responsabilidades

- `api/` possui regras executadas no servidor, persistência, segurança de backend
  e contratos HTTP.
- `ui/` possui apresentação, interação, acessibilidade, navegação e estado do
  cliente.
- `packages/types/` possui somente estruturas estáveis necessárias nos dois lados:
  requests, responses, entidades, identificadores e enums.
- a raiz orquestra dependências, lint, typecheck, testes, cobertura e build.

## Regras de dependência

1. `api` e `ui` podem depender de `@dall-fit/types`.
2. `api` não importa arquivos de `ui`, e `ui` não importa arquivos de `api`.
3. `packages/types` não depende de nenhuma aplicação nem contém infraestrutura.
4. Código compartilhado que possua comportamento de runtime não deve ser colocado
   automaticamente em `types`; ele exige pacote próprio e, quando relevante, ADR.
5. Cada aplicação mantém configuração e suíte de testes próprias.

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
