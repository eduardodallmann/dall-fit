# Mocks de API com MSW

## Objetivo

Permitir desenvolvimento e testes do frontend sem disponibilidade do backend,
preservando o mesmo cliente HTTP, as mesmas URLs e os mesmos contratos usados em
produção.

Mock Service Worker intercepta requests na fronteira de rede:

- no navegador, por Service Worker;
- no Vitest, pelo servidor Node do MSW;
- no Playwright, pelo mesmo Service Worker enquanto a aplicação real roda no
  Chromium.

Não inserir condicionais de mock em componentes, hooks, services ou no cliente HTTP.
O client Axios e o MSW usam a mesma base `VITE_API_URL`; trocar entre backend real
e mock não altera URLs nem contratos da aplicação.

## Estrutura

Quando a primeira integração HTTP for criada, adotar:

```text
src/mocks/
├── browser.ts
├── server.ts
├── handlers/
│   ├── index.ts
│   └── <operation>.ts
└── fixtures/
    └── <resource>.ts
```

- `browser.ts` cria o worker para desenvolvimento;
- `server.ts` cria o servidor usado pelo Vitest;
- `handlers/index.ts` compõe todos os handlers e mantém a proteção contra requests
  sem cenário;
- cada arquivo de operação cobre um endpoint ou grupo coeso;
- fixtures são tipadas com contratos de `@dall-fit/types`.

Browser e testes consomem a mesma lista de handlers para evitar contratos
divergentes.

## Ativação no desenvolvimento

Mocks são opt-in. Quando implementados, a variável será:

```env
VITE_API_URL=http://localhost:4000
VITE_ENABLE_API_MOCKS=true
```

O bootstrap só importa e inicia `browser.ts` quando:

- o Vite estiver em modo de desenvolvimento; e
- a variável possuir exatamente o valor `true`.

A aplicação aguarda o worker antes do primeiro render, evitando requests que escapem
antes da interceptação. Builds de produção não importam nem iniciam o worker.

`public/mockServiceWorker.js` é gerado pelo MSW, permanece versionado para que
desenvolvimento e Playwright funcionem imediatamente e não deve ser editado
manualmente.

O service worker do PWA é uma infraestrutura diferente. Ele permanece
explicitamente desabilitado no Vite de desenvolvimento e no servidor usado pelo
Playwright, enquanto o MSW é habilitado nesses ambientes. No build de produção o
inverso se aplica: o Workbox é emitido e o MSW não é importado. O arquivo
`mockServiceWorker.js` também é excluído do precache do PWA, impedindo que um
worker intercepte o escopo ou o tráfego pertencente ao outro.

## Regra obrigatória

Toda request HTTP nova ou alterada inclui handlers e fixtures na mesma mudança.
Cobrir, quando aplicável:

- sucesso representativo;
- recurso vazio ou inexistente;
- erros funcionais;
- falhas técnicas;
- latência para comportamento de loading;
- variações determinadas naturalmente por path, query, headers ou body.

Não alterar o contrato de produção apenas para selecionar um cenário mockado. Quando
a própria request não permitir a seleção, documentar um seletor exclusivo de
desenvolvimento que não seja enviado em produção.

## Requests sem handler

Nos testes, qualquer request não reconhecida encerra o teste com erro por meio de
`onUnhandledRequest: 'error'`.

No navegador, a lista de handlers termina com uma proteção para a URL base da API.
Uma operação sem handler explícito recebe `501` com um erro estável como
`MOCK_NOT_IMPLEMENTED`, em vez de alcançar acidentalmente o backend real.

O handler de proteção sempre fica por último.

## Testes

`tests/setup.ts` deverá:

1. iniciar `mockServer` antes da suíte;
2. usar `onUnhandledRequest: 'error'`;
3. restaurar handlers sobrescritos após cada teste;
4. encerrar o servidor após a suíte.

Testes reutilizam os handlers padrão. Para um cenário específico:

```ts
mockServer.use(
  http.get('/resource', () =>
    HttpResponse.json({ code: 'RESOURCE_UNAVAILABLE' }, { status: 503 }),
  ),
);
```

O teste continua renderizando a rota e interagindo pela interface; não chama handlers
diretamente.

No Playwright, a UI inicia com `VITE_ENABLE_API_MOCKS=true` e usa `browser.ts`.
Não substituir os handlers por `page.route` nem mockar o cliente HTTP. Cada spec
seleciona o cenário pelos dados reais da request ou pelo mecanismo exclusivo de
desenvolvimento documentado. Seguir `07-testes-integrados-playwright.md`.

## Erros e latência

Handlers retornam os mesmos status, códigos e formatos documentados no endpoint.
Loading é produzido com `delay(...)` no handler, não com temporizadores artificiais
no componente.

Erros do frontend são documentados na rota; contratos HTTP permanecem no SDD da API.

## Segurança das fixtures

- nenhum dado pessoal real;
- nenhum token ou credencial real;
- IDs reconhecíveis como fictícios;
- valores mínimos e determinísticos;
- tipos compartilhados usados para detectar divergência;
- fixtures não carregam dumps de ambientes.

## Estado de adoção

MSW foi adotado com autenticação. Os handlers vigentes cobrem início fictício do
login e consulta da pessoa atual. No modo mock, a query exclusiva `mockAuth` faz o
client enviar `x-dall-fit-mock-auth` com o cenário selecionado; o header nunca é
enviado quando mocks estão desabilitados e não pertence ao contrato da API.

O handler de `POST /auth/google` devolve `/dash` como URL de autorização,
representando que o provedor e callback concluíram. `GET /auth/me` devolve a
fixture autenticada sem `isAdmin` por padrão, a fixture com `isAdmin: true` no
seletor `admin`, `401` no seletor `unauthenticated` e erro técnico no seletor
`error`.
