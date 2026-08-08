# Fluxo `Login com Google`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

- Ator: pessoa que deseja acessar recursos privados do Dall Fit.
- Problema resolvido: identificar a pessoa sem cadastro manual e estabelecer uma
  sessão reconhecida pela API e pela UI.
- Resultado esperado: após consentimento válido, a pessoa possui cadastro
  persistido e entra em `/dash`, onde o menu autenticado apresenta sua identidade
  e a navegação inicial.

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
|     5 | Validação da rota privada | `/dash`    | `GET /auth/me`         |
|     6 | Menu autenticado          | `/dash`    | resposta já consultada |

`POST /auth/test-login` substitui as etapas 2 e 3 somente em local/teste.

## Sequência e decisões

1. A pessoa aciona `Entrar com Google` na rota pública.
2. A API cria `state` e `nonce`, grava cookies temporários e devolve a URL Google.
3. A UI navega para a URL; o Google autentica a pessoa e retorna um código ao
   callback.
4. A API compara `state`, troca o código, valida o ID token e o `nonce`.
5. Se não houver `Person` para o `sub`, a API persiste nome, e-mail e foto sem
   `isAdmin`; se já houver, reutiliza o cadastro sem duplicá-lo nem alterar a
   condição administrativa.
6. A API emite o cookie de sessão, remove cookies temporários e redireciona a
   `/dash`. No deploy da UI, o fallback da Vercel entrega `index.html` para esse
   acesso direto e o TanStack Router assume a rota, sem exigir um arquivo físico
   `/dash`.
7. A rota-pai protegida consulta `GET /auth/me`.
8. Com sessão válida, a API valida o JWT, encontra a pessoa e devolve seu contrato
   público. Antes de pintar o shell, a UI aplica `configs.theme` e o sincroniza no
   navegador; quando ele não existe, remove uma escolha local potencialmente
   pertencente a outra conta e usa `prefers-color-scheme` sem persistir um default.
   O layout autenticado mostra avatar, nome, e-mail, toggle de tema, navegação
   `Home` e, quando recebe `isAdmin: true`, o indicador `Admin`; a região própria
   de `/dash` permanece vazia.
9. Sem sessão válida ou sem pessoa, a API responde `401` e a UI redireciona a `/`.

## Compatibilidade temporária do deploy

No deploy atual, UI e API ocupam sites `vercel.app` distintos. A API usa cookies
`SameSite=None; Secure` nesse ambiente para que o navegador preserve `state`,
`nonce` e sessão durante a jornada cross-site; localmente, sem `Secure`, os cookies
permanecem `SameSite=Lax`. As requests HTTP da UI usam credenciais e a API aceita
somente a origem configurada em CORS.

Essa flexibilização deve ser revertida quando frontend e backend compartilharem o
mesmo site registrável. Nessa topologia futura, todos os cookies voltam a
`SameSite=Lax`, inclusive sob HTTPS, e a documentação e os testes de autenticação
devem acompanhar a reversão.

## Dados compartilhados

| Dado            | Origem              | Consumidores      | Persistência                          | Observações                        |
| --------------- | ------------------- | ----------------- | ------------------------------------- | ---------------------------------- |
| `sub` Google    | ID token            | API               | MongoDB                               | chave externa estável, nunca na UI |
| nome            | ID token            | API e UI          | MongoDB                               | dado pessoal, nunca em logs        |
| e-mail          | ID token verificado | API e UI          | MongoDB                               | dado pessoal, não é chave          |
| URL da foto     | ID token            | API e UI          | MongoDB                               | pode ser ausente                   |
| ID de `Person`  | MongoDB             | sessão e API      | MongoDB e JWT                         | único dado da pessoa no JWT        |
| `isAdmin`       | operação autorizada | API e UI          | MongoDB                               | somente `true`; ausência é `false` |
| tema            | pessoa ou sistema   | UI                | `Person.configs.theme` e localStorage | somente `light                     | dark`; ausência segue o sistema |
| sessão          | API                 | browser e API     | cookie `HttpOnly` stateless           | não acessível ao JavaScript        |
| `state`/`nonce` | API                 | Google e callback | cookies temporários                   | removidos ao terminar              |

## Estados e exceções

- Caminho completo: consentimento aceito, claims válidas, cadastro encontrado ou
  criado, sessão emitida e `/dash` carregada com o menu autenticado.
- Interrupção ou retomada: negar consentimento ou falhar o callback retorna a `/`
  sem sessão; um novo acionamento reinicia o fluxo.
- Erro recuperável: sessão ausente/expirada redireciona à entrada pública; falha
  transitória de `/auth/me` exibe o erro da rota para nova tentativa por recarga.
- Reconciliação: tema explícito do perfil substitui o bootstrap local; perfil sem
  tema remove a chave local e acompanha o sistema. Falha de `/auth/me` mantém o
  tema do bootstrap sem inferir dado parcial.
- Erro não recuperável: claims obrigatórias inválidas impedem cadastro e sessão.
- Indisponibilidade: erro do Google ou MongoDB não cria sessão nem expõe detalhes
  técnicos.

## Cenários funcionais

### Cenário 1 — Primeiro login

- Link para testar: `http://localhost:3000/`
- Given: não existe cadastro para a conta Google
- When: a pessoa conclui o consentimento
- Then: a API cria `Person`, emite a sessão e `/dash` mostra o menu com nome,
  e-mail e foto

### Cenário 2 — Jornada integrada fictícia

- Link para testar: `http://127.0.0.1:3100/`
- Given: o Vite está iniciado pelo Playwright com MSW Browser e o handler de
  `POST /auth/google` devolve `/dash` como URL fictícia
- When: a pessoa aciona `Entrar com Google`
- Then: o handler simula o retorno autenticado e `/dash` exibe a fixture no menu,
  com `Home` ativo e conteúdo de rota vazio

### Cenário 3 — Acesso privado sem sessão

- Link para testar:
  `http://127.0.0.1:3100/dash?mockAuth=unauthenticated`
- Given: o handler de pessoa atual responde `401`
- When: a rota-pai protegida valida a sessão
- Then: a UI redireciona para `/` sem renderizar dados privados

### Cenário 4 — Perfil assume a fonte do tema após o login

- Link para testar:
  `http://127.0.0.1:3100/dash?mockAuth=theme-light` com
  `dall-fit:theme=dark` preparado antes da navegação
- Given: a entrada pública iniciou em `dark`, mas a pessoa possui tema `light`
- When: `GET /auth/me` conclui
- Then: o shell autenticado inicia em `light` e sincroniza a chave local

### Cenário 5 — Conta sem tema não herda escolha local

- Link para testar:
  `http://127.0.0.1:3100/dash?mockAuth=theme-unset` com sistema em `light` e
  `dall-fit:theme=dark`
- Given: a pessoa autenticada não possui `configs.theme`
- When: o perfil é reconciliado
- Then: a UI remove a chave anterior e usa `light` pelo sistema

## Cobertura automatizada

- Regras e caminhos de negócio protegidos: primeiro cadastro, reutilização,
  validação de `state`/`nonce`, sessão válida/expirada e pessoa removida.
- Unitários e componentes da UI: home, consulta de pessoa, autorização
  administrativa, bootstrap/reconciliação do tema, rollback, iniciais e
  apresentação comum/administrativa do menu.
- Playwright da jornada UI: `ui/tests/integration/flows/login-google.spec.ts`.
- E2E dos endpoints da API e fixtures MongoDB/Redis:
  `api/test/auth.e2e-spec.ts` com MongoDB efêmero; Redis não participa.
- Handlers e fixtures MSW: `ui/src/mocks/handlers/auth.ts` e
  `ui/src/mocks/fixtures/person.ts`.
- Cenários não automatizados e justificativa: a tela real de consentimento Google
  exige conta e serviço externos; é verificada manualmente e não entra no CI.

O Playwright usa MSW Browser e valida somente a jornada do frontend. Não declarar
que ele cobre a implementação real dos endpoints.
