# Arquitetura base da UI

## Stack

A UI usa React 19, TypeScript, Vite e Vitest. Playwright é o padrão dos testes
integrados no navegador. `src/main.tsx` realiza o bootstrap e `src/App.tsx` é a
composição inicial enquanto a arquitetura de rotas ainda não foi introduzida.

## Estrutura alvo

Quando as funcionalidades surgirem, organizar por responsabilidade:

```text
src/
├── core/                # infraestrutura e componentes realmente transversais
├── domain/              # regras e tipos exclusivos do frontend
├── routes/              # módulos organizados por rota
├── context/             # providers globais
└── mocks/               # mocks na fronteira de rede
```

- rotas podem consumir `core`, `domain`, `context` e `@dall-fit/types`;
- `core` não depende de rotas;
- componentes exclusivos permanecem próximos da rota;
- um provider só se torna global quando precisa envolver toda a aplicação;
- a UI não importa arquivos internos da API.

A estrutura deve crescer conforme funcionalidades reais, sem diretórios vazios.

## Estado e integrações

- estado local fica próximo do componente proprietário;
- estado de servidor deve ter cache, loading, erro e invalidação explícitos;
- chamadas HTTP passam por um cliente central e serviços tipados;
- componentes não chamam `fetch` diretamente;
- payloads compartilhados usam `@dall-fit/types`;
- desenvolvimento e testes simulam a fronteira HTTP com MSW, reutilizando o mesmo
  cliente da aplicação;
- credenciais e dados pessoais não aparecem em logs ou fixtures.

Introduzir router, biblioteca de estado de servidor, internacionalização ou design
system exige atualizar esta base e registrar ADR quando houver trade-off
transversal.

MSW será configurado junto da primeira integração HTTP, seguindo
`05-mocks-de-api.md`; a fundação atual não instala dependências sem uso.

Playwright será configurado junto do primeiro cenário integrado de rota ou flow,
seguindo `07-testes-integrados-playwright.md`.
