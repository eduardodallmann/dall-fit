# Fluxo `Login com Google`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

- Ator: pessoa que deseja acessar recursos privados do Dall Fit.
- Problema resolvido: identificar a pessoa sem cadastro manual e estabelecer uma
  sessão reconhecida pela API e pela UI.
- Resultado esperado: após consentimento válido, a pessoa possui cadastro
  persistido e visualiza seus dados em `/me`.

## Entrada e pré-condições

A jornada começa em `http://localhost:3000/`, que permanece pública. O ambiente
real exige credencial OAuth válida, URI de callback exatamente igual à cadastrada,
MongoDB disponível e segredo de sessão. Em desenvolvimento integrado, MSW simula
as fronteiras externas sem acessar a API.

## Rotas e endpoints participantes

| Ordem | Etapa                     | Rota de UI | Endpoint da API        |
| ----: | ------------------------- | ---------- | ---------------------- |
|     1 | Entrada pública           | `/`        | não se aplica          |
|     2 | Preparar início OAuth     | `/`        | `POST /auth/google`    |
|     3 | Consentimento Google      | externa    | não se aplica          |
|     4 | Retorno do Google         | externa    | `GET /callback`        |
|     5 | Validação da rota privada | `/me`      | `GET /auth/me`         |
|     6 | Exibição do cadastro      | `/me`      | resposta já consultada |

`POST /auth/test-login` substitui as etapas 2 e 3 somente em local/teste.

## Sequência e decisões

1. A pessoa aciona `Entrar com Google` na rota pública.
2. A API cria `state` e `nonce`, grava cookies temporários e devolve a URL Google.
3. A UI navega para a URL; o Google autentica a pessoa e retorna um código ao
   callback.
4. A API compara `state`, troca o código, valida o ID token e o `nonce`.
5. Se não houver `Person` para o `sub`, a API persiste nome, e-mail e foto; se já
   houver, reutiliza o cadastro sem duplicá-lo.
6. A API emite o cookie de sessão, remove cookies temporários e redireciona a
   `/me`.
7. A rota-pai protegida consulta `GET /auth/me`.
8. Com sessão válida, a API valida o JWT, encontra a pessoa e devolve seu contrato
   público; a tela mostra os dados.
9. Sem sessão válida ou sem pessoa, a API responde `401` e a UI redireciona a `/`.

## Dados compartilhados

| Dado            | Origem              | Consumidores      | Persistência                | Observações                        |
| --------------- | ------------------- | ----------------- | --------------------------- | ---------------------------------- |
| `sub` Google    | ID token            | API               | MongoDB                     | chave externa estável, nunca na UI |
| nome            | ID token            | API e UI          | MongoDB                     | dado pessoal, nunca em logs        |
| e-mail          | ID token verificado | API e UI          | MongoDB                     | dado pessoal, não é chave          |
| URL da foto     | ID token            | API e UI          | MongoDB                     | pode ser ausente                   |
| ID de `Person`  | MongoDB             | sessão e API      | MongoDB e JWT               | único dado da pessoa no JWT        |
| sessão          | API                 | browser e API     | cookie `HttpOnly` stateless | não acessível ao JavaScript        |
| `state`/`nonce` | API                 | Google e callback | cookies temporários         | removidos ao terminar              |

## Estados e exceções

- Caminho completo: consentimento aceito, claims válidas, cadastro encontrado ou
  criado, sessão emitida e `/me` carregada.
- Interrupção ou retomada: negar consentimento ou falhar o callback retorna a `/`
  sem sessão; um novo acionamento reinicia o fluxo.
- Erro recuperável: sessão ausente/expirada redireciona à entrada pública; falha
  transitória de `/auth/me` exibe o erro da rota para nova tentativa por recarga.
- Erro não recuperável: claims obrigatórias inválidas impedem cadastro e sessão.
- Indisponibilidade: erro do Google ou MongoDB não cria sessão nem expõe detalhes
  técnicos.

## Cenários funcionais

### Cenário 1 — Primeiro login

- Link para testar: `http://localhost:3000/`
- Given: não existe cadastro para a conta Google
- When: a pessoa conclui o consentimento
- Then: a API cria `Person`, emite a sessão e `/me` exibe nome, e-mail e foto

### Cenário 2 — Jornada integrada fictícia

- Link para testar: `http://127.0.0.1:3100/`
- Given: o Vite está iniciado pelo Playwright com MSW Browser e o handler de
  `POST /auth/google` devolve `/me` como URL fictícia
- When: a pessoa aciona `Entrar com Google`
- Then: o handler simula o retorno autenticado e `/me` exibe a fixture

### Cenário 3 — Acesso privado sem sessão

- Link para testar:
  `http://127.0.0.1:3100/me?mockAuth=unauthenticated`
- Given: o handler de pessoa atual responde `401`
- When: a rota-pai protegida valida a sessão
- Then: a UI redireciona para `/` sem renderizar dados privados

## Cobertura automatizada

- Regras e caminhos de negócio protegidos: primeiro cadastro, reutilização,
  validação de `state`/`nonce`, sessão válida/expirada e pessoa removida.
- Unitários e componentes da UI: home, consulta de pessoa e apresentação de `/me`.
- Playwright da jornada UI: `ui/tests/integration/flows/login-google.spec.ts`.
- E2E dos endpoints da API e fixtures MongoDB/Redis:
  `api/test/auth.e2e-spec.ts` com MongoDB efêmero; Redis não participa.
- Handlers e fixtures MSW: `ui/src/mocks/handlers/auth.ts` e
  `ui/src/mocks/fixtures/person.ts`.
- Cenários não automatizados e justificativa: a tela real de consentimento Google
  exige conta e serviço externos; é verificada manualmente e não entra no CI.

O Playwright usa MSW Browser e valida somente a jornada do frontend. Não declarar
que ele cobre a implementação real dos endpoints.
