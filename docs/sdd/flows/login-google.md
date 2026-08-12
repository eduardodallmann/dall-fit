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
MongoDB, Redis TLS e segredo de sessão disponíveis. Em desenvolvimento integrado,
MSW simula requests Axios; a navegação top-level OAuth permanece na mesma origem
controlada pelo middleware de teste do Vite, sem acessar a API real.

## Rotas e endpoints participantes

| Ordem | Etapa                     | Rota de UI | Endpoint da API          |
| ----: | ------------------------- | ---------- | ------------------------ |
|     1 | Entrada pública           | `/`        | não se aplica            |
|     2 | Iniciar OAuth top-level   | `/`        | `GET /auth/google`       |
|     3 | Consentimento Google      | externa    | não se aplica            |
|     4 | Retorno do Google         | externa    | `GET /callback`          |
|     5 | Validação da rota privada | `/dash`    | `GET /auth/me`           |
|     6 | Bootstrap anti-CSRF       | `/dash`    | `GET /auth/csrf`         |
|     7 | Menu autenticado          | `/dash`    | respostas já consultadas |

`POST /auth/test-login` substitui as etapas 2 e 3 somente em local/teste.

## Sequência e decisões

1. A pessoa aciona `Entrar com Google`. A UI emite somente o início de
   `google_login` e navega o documento diretamente para
   `GET ${VITE_API_URL}/auth/google`; não emite conclusão antes de sair da página.
2. A API cria `state`, `nonce` e verifier PKCE, grava cookies temporários e
   redireciona para a URL Google com challenge S256.
3. O Google autentica a pessoa e retorna um código ao
   callback.
4. A API compara `state`, troca o código com o verifier e valida assinatura,
   issuer, audience, ID token e `nonce`.
5. Se não houver `Person` para o `sub`, a API persiste nome, e-mail e foto sem
   `isAdmin`; se já houver, sincroniza atomicamente somente nome, e-mail e foto
   realmente alterados, sem duplicar cadastro nem alterar a condição
   administrativa/configs.
6. A fronteira HTTP já agenda a remoção dos cookies temporários antes de guards,
   validação e command. A API assina JWT técnico e só emite o cookie depois de criar o registro
   revogável e o segredo CSRF no Redis; em sucesso redireciona a
   `/dash`. No deploy da UI, o fallback da Vercel entrega `index.html` para esse
   acesso direto e o TanStack Router assume a rota, sem exigir um arquivo físico
   `/dash`.
7. A rota-pai protegida consulta `GET /auth/me`; a API exige claims JWT, registro
   Redis ativo e pessoa MongoDB ainda existente.
8. Com sessão válida, a API valida o JWT, encontra a pessoa e devolve seu contrato
   público. Antes de pintar o shell, a UI aplica `configs.theme` e o sincroniza no
   navegador; quando ele não existe, remove uma escolha local potencialmente
   pertencente a outra conta e usa `prefers-color-scheme` sem persistir um default.
   O layout autenticado mostra avatar, nome, e-mail, toggle de tema, navegação
   `Home` e, quando recebe `isAdmin: true`, o indicador `Admin`; a região própria
   de `/dash` permanece vazia.
9. Ainda antes do shell, a UI consulta `GET /auth/csrf` em single-flight, mantém o token apenas em
   memória e habilita mutações somente após os dois bootstraps. Falha de CSRF é
   recuperável e não apaga a autenticação; `401` limpa CSRF/cache privado e
   redireciona a `/`. O shell mantém `GET /auth/me` observado, revalida em foco,
   reconexão e a cada cinco minutos enquanto visível, refletindo expiração, pessoa
   removida ou mudança de privilégio sem cache indefinido.
10. `Sair` em qualquer apresentação do menu envia `POST /auth/logout` com Origin e
    CSRF. Sucesso ou falha remota encerra localmente uma única geração: aborta
    requests, reseta recursos privados, limpa CSRF/cache e navega com replace para
    `/`; a falha também mostra feedback acessível.

`401` concorrentes compartilham a mesma transição. `CSRF_VALIDATION_FAILED` renova
o token sem repetir a mutation; `ADMIN_ACCESS_REQUIRED` revalida a pessoa, atualiza
o Router e volta a `/dash` sem logout. Resultado tardio da geração encerrada não
altera a sessão seguinte.

Analytics permanece uma observação exclusiva da UI: não acrescenta etapa HTTP da
API, cookie, identificador ou alteração na sequência. O evento de login contém
somente rota normalizada, superfície, controle, operação e resultado; URL de
autorização, `state`, `nonce`, nome, e-mail, ID e erro técnico não são enviados.
Pageviews do carregamento e das navegações SPA são coletados pela única montagem
global do componente oficial.

## Compatibilidade temporária do deploy

No deploy atual, UI e API ocupam sites `vercel.app` distintos. A sessão usa cookie
`__Host-`, `SameSite=None; Secure`, host-only e path `/`. State, nonce e verifier
usam `SameSite=Lax; Secure` porque participam da navegação top-level. Localmente,
todos usam nomes sem prefixo, `SameSite=Lax` e sem `Secure`. Requests Axios usam
credenciais e a API aceita somente a origem configurada exatamente em CORS.

Essa flexibilização deve ser revertida quando frontend e backend compartilharem o
mesmo site registrável. Nessa topologia futura, todos os cookies voltam a
`SameSite=Lax`, inclusive sob HTTPS, e a documentação e os testes de autenticação
devem acompanhar a reversão.

## Dados compartilhados

| Dado                     | Origem                | Consumidores      | Persistência                          | Observações                        |
| ------------------------ | --------------------- | ----------------- | ------------------------------------- | ---------------------------------- |
| `sub` Google             | ID token              | API               | MongoDB                               | chave externa estável, nunca na UI |
| nome                     | ID token              | API e UI          | MongoDB                               | dado pessoal, nunca em logs        |
| e-mail                   | ID token verificado   | API e UI          | MongoDB                               | dado pessoal, não é chave          |
| URL da foto              | ID token              | API e UI          | MongoDB                               | pode ser ausente                   |
| ID de `Person`           | MongoDB               | sessão e API      | MongoDB, JWT e registro Redis         | claim técnica `sub`                |
| `isAdmin`                | operação autorizada   | API e UI          | MongoDB                               | somente `true`; ausência é `false` |
| tema                     | pessoa ou sistema     | UI                | `Person.configs.theme` e localStorage | somente `light                     | dark`; ausência segue o sistema |
| sessão                   | API                   | browser e API     | cookie `HttpOnly` + registro Redis    | revogável, máximo sete dias        |
| CSRF                     | API                   | UI e API          | Redis e memória volátil da UI         | nunca em armazenamento durável     |
| `state`/`nonce`/verifier | API                   | Google e callback | cookies temporários                   | removidos ao terminar              |
| `requestId`              | API ou request válida | logs e consumidor | contexto volátil e header/erro HTTP   | não persiste                       |

## Estados e exceções

- Caminho completo: consentimento aceito, claims válidas, cadastro encontrado ou
  criado, sessão emitida e `/dash` carregada com o menu autenticado.
- Interrupção ou retomada: negar consentimento, callback incompleto/divergente,
  `invalid_grant`, ID token ausente ou rejeição OIDC conhecida retorna a `/` sem
  sessão; um novo acionamento reinicia o fluxo.
- Erro recuperável: sessão ausente/expirada redireciona à entrada pública; falha
  transitória de `/auth/me` exibe o erro da rota para nova tentativa por recarga.
- Reconciliação: tema explícito do perfil substitui o bootstrap local; perfil sem
  tema remove a chave local e acompanha o sistema. Falha de `/auth/me` mantém o
  tema do bootstrap sem inferir dado parcial.
- Erro não recuperável: claims obrigatórias inválidas impedem cadastro e sessão,
  limpam os cookies temporários e retornam o redirect genérico esperado.
- Indisponibilidade: erro inesperado do Google, configuração, rede, timeout,
  resposta 5xx, MongoDB, Redis ou código não cria sessão nem redirect; a API
  responde `500` genérico com correlação e limpa os cookies temporários. Redis
  indisponível nunca reativa validação stateless.

## Cenários funcionais

### Cenário 1 — Primeiro login

- Link para testar: `http://localhost:3000/`
- Given: não existe cadastro para a conta Google
- When: a pessoa conclui o consentimento
- Then: a API cria `Person`, emite a sessão e `/dash` mostra o menu com nome,
  e-mail e foto

### Cenário 2 — Jornada integrada fictícia

- Link para testar: `http://127.0.0.1:3100/`
- Given: o Vite está iniciado pelo Playwright com MSW Browser e controla
  `GET /api/auth/google` na mesma origem com redirect fictício para `/dash`
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
- Analytics: testes da composição global, fronteira, home, menu, tema e PWA isolam
  o transporte oficial e validam eventos sem conteúdo.
- E2E dos endpoints da API:
  `api/test/auth.e2e-spec.ts` com MongoDB e Redis efêmeros reais, incluindo CSRF,
  logout, reset do dataset, rate limit, CORS, correlação, limpeza antecipada e
  falha técnica do callback.
- Handlers e fixtures MSW: `ui/src/mocks/handlers/auth.ts` e
  `ui/src/mocks/fixtures/person.ts`.
- Cenários não automatizados e justificativa: a tela real de consentimento Google
  exige conta e serviço externos; é verificada manualmente e não entra no CI.

O Playwright usa MSW Browser e valida somente a jornada do frontend. Não declarar
que ele cobre a implementação real dos endpoints.
