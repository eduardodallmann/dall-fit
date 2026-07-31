# Feature Spec: Autorização administrativa em `Person`

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0004`
- Problema: a aplicação reconhece somente se uma pessoa está autenticada. Não
  existe uma propriedade que identifique administradores, a API não possui uma
  proteção reutilizável para operações administrativas e a UI não consegue
  identificar nem proteger experiências destinadas a administradores.
- Resultado: uma `Person` administradora possui `isAdmin: true`; a ausência do
  campo representa uma pessoa não administradora. A API preserva essa semântica no
  retorno da pessoa atual e oferece uma proteção reutilizável para endpoints. A UI
  interpreta a ausência como `false`, oferece proteção equivalente para futuras
  rotas e identifica administradores na página `/me`.
- Referências:
  - `docs/sdd/adr/ADR-0002-autenticacao-google-e-sessao.md`;
  - `docs/sdd/flows/login-google.md`;
  - `api/docs/sdd/endpoints/current-person.md`;
  - `ui/docs/sdd/routes/me.md`;
  - catálogo oficial do HeroUI: o componente `Chip` é destinado a labels, estados
    e categorias.
- Features relacionadas:
  - `FIT-0001` — introduziu autenticação, `Person`, `GET /auth/me` e os mecanismos
    reutilizáveis de proteção autenticada.

## Escopo

### Incluído

- campo opcional `isAdmin`, persistido somente com valor `true` em uma `Person`
  administradora;
- ausência de `isAdmin` como representação padrão de uma pessoa não
  administradora no MongoDB, na API e na UI;
- possibilidade operacional de promover com `isAdmin: true` e revogar removendo o
  campo do documento da pessoa;
- extensão compatível de `GET /auth/me` para devolver `isAdmin: true` somente para
  administradores;
- decorator e guard reutilizáveis que combinam autenticação e autorização
  administrativa em endpoints futuros;
- layout sem path reutilizável na árvore manual do TanStack Router para receber
  futuras rotas administrativas;
- redirecionamento de pessoa autenticada não administradora para `/me` antes da
  renderização de uma futura rota administrativa;
- `Chip` textual `Admin` na página `/me`, visível somente para administradores;
- fixtures e cenários MSW distintos para pessoa administradora e não
  administradora;
- seeds locais e fixtures E2E com presença e ausência de `isAdmin`;
- testes unitários, de componente, E2E da API e Playwright proporcionais aos
  comportamentos observáveis.

### Não incluído

- aplicar a proteção administrativa a qualquer endpoint vigente;
- criar endpoint exclusivamente administrativo, inclusive um endpoint criado
  apenas para testar o guard;
- aplicar a proteção administrativa a qualquer rota navegável vigente;
- criar dashboard, página ou conteúdo administrativo;
- endpoints ou telas para promover ou revogar administradores;
- permitir que uma pessoa altere a própria condição administrativa;
- papéis além de administrador, permissões granulares ou hierarquia de
  autorização;
- lista ou coleção separada de administradores;
- armazenar `isAdmin` no cookie ou no JWT da sessão;
- referência visual ou screenshot para `/me`, pois
  `ui/docs/sdd/routes/assets/me/` não contém imagens.

## Projetos e documentação afetados

- API e endpoints:
  - alteração da entidade, schema e adapter MongoDB de `Person`;
  - novo guard e decorator de autorização administrativa no domínio de
    autenticação;
  - alteração observável somente em `GET /auth/me`;
  - atualização de `api/docs/sdd/base/01-arquitetura.md` e
    `api/docs/sdd/endpoints/current-person.md`;
  - `api/docs/sdd/endpoints/root.md` permanece autenticado, sem exigir
    administrador;
  - `api/docs/sdd/endpoints/auth.md` preserva seus paths e respostas, mas sua
    documentação passa a registrar que novas pessoas são criadas sem `isAdmin`.
- UI e rotas:
  - contexto da rota autenticada passa a transportar `Person.isAdmin`;
  - novo layout administrativo sem path, sem rota navegável filha nesta demanda;
  - alteração visual e comportamental de `/me`;
  - atualização de `ui/docs/sdd/base/01-arquitetura.md` e
    `ui/docs/sdd/routes/me.md`;
  - a rota pública `/` não muda.
- Fluxos: atualização de `docs/sdd/flows/login-google.md` para incluir `isAdmin`
  entre os dados da pessoa e o indicador condicional em `/me`.
- Contratos em `@dall-fit/types`:
  - `Person` recebe `isAdmin?: true`, expressando que somente administradores
    possuem a chave;
  - `CurrentPersonResponse` continua envolvendo `Person`.
- Decisões arquiteturais: não exige novo ADR; a decisão é local ao modelo vigente
  de `Person`, mantém a sessão definida pelo ADR-0002 e é reversível sem alterar a
  estratégia de autenticação.
- Handlers e fixtures MSW:
  - fixture não administradora como sucesso padrão;
  - fixture administradora selecionável por cenário exclusivo de mocks;
  - `GET /auth/me` omite a chave no cenário comum e devolve `isAdmin: true` no
    cenário administrativo.
- Mocks de repositories/caches nos unitários da API:
  - não surge repository ou cache novo;
  - mocks de pessoa administradora incluem `isAdmin: true`; mocks de pessoa comum
    omitem a chave.
- Fixtures MongoDB/Redis nos E2E:
  - pessoa administradora;
  - pessoa não administradora;
  - MongoDB efêmero valida persistência e leitura do valor;
  - Redis não se aplica.

## Requisitos funcionais

1. `Person` possui a propriedade opcional `isAdmin`, cujo único valor persistido e
   exposto é o booleano `true`.
2. A ausência da propriedade representa implicitamente `false` no backend e no
   frontend; a aplicação não materializa `isAdmin: false` no MongoDB nem na
   resposta HTTP.
3. Uma nova pessoa criada pelo login Google ou pelo bypass local/teste não recebe
   a propriedade, e a identidade externa ou o body do bypass não podem escolher
   `isAdmin`.
4. O schema MongoDB não define default para `isAdmin`. O campo é opcional e não
   ocupa espaço no documento de uma pessoa comum.
5. A promoção é feita operacionalmente definindo `isAdmin: true` no documento da
   pessoa. A revogação remove a propriedade em vez de persistir `false`.
6. O campo administrativo não é atualizado pelo fluxo de login. Uma pessoa
   existente conserva a presença ou ausência vigente quando entra novamente.
7. `GET /auth/me` continua exigindo sessão válida, devolve `isAdmin: true` para
   administrador e omite a chave para pessoa não administradora.
8. O command de pessoa atual inclui `isAdmin` em `CurrentPersonResponse` somente
   quando a entidade contém o valor `true`; não realiza consulta adicional.
9. O decorator administrativo reutilizável aplica primeiro o guard de sessão e
   depois o guard administrativo, sem exigir que um controller componha os dois
   manualmente.
10. O guard administrativo lê a pessoa já carregada pelo guard de sessão e não
    acessa repository, MongoDB ou outro service.
11. Em um endpoint futuro decorado como administrativo:
    - sessão ausente, inválida, expirada ou pessoa removida continua resultando em
      `401 AUTHENTICATION_REQUIRED`;
    - pessoa autenticada sem `isAdmin: true` resulta em
      `403 ADMIN_ACCESS_REQUIRED`;
    - pessoa autenticada com `isAdmin: true` segue para o controller.
12. Nenhum endpoint existente recebe o decorator administrativo nesta demanda.
13. O JWT e o cookie continuam contendo somente o ID técnico de `Person`. Como o
    guard de sessão recarrega a pessoa em cada request, promover ou revogar um
    administrador passa a valer no request seguinte sem recriar a sessão.
14. O contexto da rota autenticada da UI usa o `isAdmin` opcional recebido da API;
    a UI considera `person.isAdmin === true` como administrador e qualquer ausência
    como não administrador.
15. Um layout administrativo sem path é filho do layout autenticado. Futuras rotas
    administrativas poderão ser adicionadas como filhas dele.
16. O layout administrativo reutiliza a pessoa já carregada pelo layout
    autenticado, sem executar uma segunda request:
    - `isAdmin: true` permite o carregamento do filho;
    - ausência de `isAdmin` redireciona com substituição de histórico para `/me`
      antes de renderizar o filho.
17. Nenhuma rota navegável vigente passa a ser filha do layout administrativo
    nesta demanda. A proteção da UI existe para navegação e privacidade visual e
    nunca substitui a autorização da API.
18. A página `/me` mostra um `Chip` HeroUI com o texto `Admin` próximo à
    identificação da conta somente quando `isAdmin` for `true`.
19. Para pessoa sem `isAdmin`, `/me` preserva nome, e-mail, foto e layout atuais
    sem renderizar o `Chip` nem um placeholder equivalente.

## Requisitos não funcionais

- Acessibilidade:
  - o `Chip` contém o texto explícito `Admin` e não depende somente de cor ou ícone;
  - o indicador não é interativo e não entra desnecessariamente na ordem de foco;
  - o redirecionamento administrativo ocorre antes de conteúdo restrito ser
    renderizado.
- Performance:
  - a autorização administrativa reutiliza a única consulta indexada de `Person`
    já executada pelo guard de sessão;
  - não existe coleção, repository, service, cache ou request adicional para
    determinar `isAdmin`;
  - documentos de pessoas comuns e suas respostas HTTP não armazenam nem
    transportam um booleano redundante;
  - a UI reutiliza `Person` do contexto autenticado sem request adicional.
- Segurança e privacidade:
  - o servidor é a única fronteira efetiva de autorização;
  - o login e o bypass nunca aceitam `isAdmin` como entrada;
  - a UI recebe `isAdmin: true` somente quando a própria pessoa é administradora;
  - `isAdmin` não entra no JWT nem no cookie;
  - o erro `403` possui código estável e não expõe dados adicionais.
- Observabilidade:
  - guard, command e repository de `Person` seguem
    `api/docs/sdd/base/06-logging-e-rastreabilidade.md`;
  - logs podem registrar ID técnico, `isAdmin`, branch e código de erro;
  - nome, e-mail, foto e documento MongoDB completo nunca são registrados.

## Critérios de aceite

### Cenário 1 — Nova pessoa nasce sem privilégio

- Forma de validar: cenário de primeiro login fictício em
  `api/docs/sdd/endpoints/auth.md`, com seed e cURL completos.
- Given: não existe `Person` para a identidade recebida
- When: o login cria a pessoa
- Then: o documento é persistido sem `isAdmin` e a entrada externa não consegue
  incluir a propriedade

### Cenário 2 — Pessoa administradora é identificada pela API

- Forma de validar: cenário “Pessoa atual administradora” a ser documentado em
  `api/docs/sdd/endpoints/current-person.md`, com seed e cURL completos.
- Given: existe uma `Person` com `isAdmin: true`
- When: sua sessão válida chama `GET /auth/me`
- Then: recebe `200`, os dados públicos vigentes e `isAdmin: true`

### Cenário 3 — Pessoa comum é identificada pela API

- Forma de validar: cenário “Pessoa atual não administradora” a ser documentado em
  `api/docs/sdd/endpoints/current-person.md`, com seed e cURL completos.
- Given: existe uma `Person` sem `isAdmin`
- When: sua sessão válida chama `GET /auth/me`
- Then: recebe `200` com os dados públicos vigentes e sem a chave `isAdmin`

### Cenário 4 — Login repetido preserva condição administrativa

- Forma de validar: cenário de pessoa existente em
  `api/docs/sdd/endpoints/auth.md` e E2E da API.
- Given: existe uma `Person` com `isAdmin: true`
- When: essa pessoa realiza login novamente
- Then: seu cadastro é reutilizado e `isAdmin` permanece `true`

### Cenário 5 — Proteção administrativa permite administrador

- Forma de validar: teste unitário do guard e do decorator composto; não se aplica
  cURL porque nenhum endpoint utilizará a proteção nesta demanda.
- Given: o guard de sessão carregou uma pessoa com `isAdmin: true`
- When: o decorator administrativo protege um handler no harness de teste
- Then: o guard administrativo permite a execução do handler sem nova consulta

### Cenário 6 — Proteção administrativa rejeita pessoa comum

- Forma de validar: teste unitário do guard e do decorator composto; não se aplica
  cURL porque nenhum endpoint utilizará a proteção nesta demanda.
- Given: o guard de sessão carregou uma pessoa sem `isAdmin`
- When: o decorator administrativo protege um handler no harness de teste
- Then: a execução termina em `403 ADMIN_ACCESS_REQUIRED` antes do handler

### Cenário 7 — Página `/me` identifica administrador

- Forma de validar:
  `http://localhost:3000/me?mockAuth=admin` com MSW habilitado.
- Given: o handler de pessoa atual devolve `isAdmin: true`
- When: a rota protegida carrega
- Then: nome, e-mail e foto continuam visíveis e um `Chip` textual `Admin` é
  exibido

### Cenário 8 — Página `/me` não marca pessoa comum

- Forma de validar: `http://localhost:3000/me` com MSW habilitado.
- Given: o handler padrão devolve a pessoa sem a chave `isAdmin`
- When: a rota protegida carrega
- Then: nome, e-mail e foto continuam visíveis e não existe indicador `Admin`

### Cenário 9 — Layout administrativo controla futuras rotas

- Forma de validar: testes unitários da árvore/router com filhos de harness; link
  local não se aplica porque nenhuma rota navegável será protegida nesta demanda.
- Given: uma rota de harness é filha do layout administrativo
- When: o contexto autenticado contém `isAdmin: true`
- Then: o filho pode carregar sem uma segunda request
- And: quando o contexto não contém `isAdmin`, a navegação é substituída por `/me`
  antes da renderização do filho

### Cenário 10 — Promoção e revogação valem sem nova sessão

- Forma de validar: E2E da API com MongoDB efêmero, alterando o campo entre
  requests autenticados.
- Given: a pessoa possui uma sessão válida
- When: `isAdmin: true` é adicionado ou a chave é removida e a pessoa chama
  novamente `GET /auth/me`
- Then: a presença ou ausência passa a valer no request seguinte sem alterar o
  cookie de sessão

## Estratégia de entrega e compatibilidade

A alteração de `Person` e `GET /auth/me` é aditiva e opcional: somente pessoas
administradoras recebem a nova chave. API, `@dall-fit/types`, UI, MSW e testes devem
mudar atomicamente para compartilhar a semântica presença `true`/ausência `false`.
Consumidores que ignoram campos adicionais continuam compatíveis.

Não existe default persistido, backfill nem migração de registros anteriores. A
ausência do campo é o formato definitivo de uma pessoa comum, tanto em documentos
atuais quanto antigos.

O decorator e o layout administrativos são pontos de extensão intencionais mesmo
sem consumidores concretos nesta demanda. Sua finalidade, composição e cobertura
automatizada devem permanecer explícitas para não serem removidos como código sem
uso.

## Plano de testes

- unitários do fluxo de criação para garantir ausência de `isAdmin` e impedir
  influência da identidade externa;
- unitários do fluxo de pessoa existente para preservar o valor administrativo;
- unitários do command de pessoa atual para presença `true` e ausência;
- unitários do guard administrativo para permissão e `403`;
- teste do decorator composto para garantir a ordem sessão → administrador;
- E2E serial da API com MongoDB efêmero para criação sem o campo, presença
  `isAdmin: true`, ausência, login repetido, promoção e revogação sem recriar
  sessão;
- testes de componente de `/me` para presença e ausência do `Chip`;
- testes do router para permissão e redirecionamento do layout administrativo sem
  request adicional;
- handlers MSW e fixtures para pessoa comum e administradora;
- Playwright de `/me` para o cenário administrativo e regressão do cenário comum;
- quality gates completos, `pnpm -C api test:e2e` e `pnpm test:integration`.

## Riscos e decisões

- Persistir `isAdmin: true` somente em administradores elimina uma segunda consulta
  e evita armazenar `false` na maioria dos documentos.
- Ausência é uma representação definitiva de `false`, não um estado legado nem uma
  condição que exija migração.
- Alterações diretas no banco são um processo operacional e devem restringir
  escrita à equipe autorizada. Uma futura interface de administração exigirá nova
  feature, proteção administrativa e trilha de auditoria.
- Não armazenar `isAdmin` na sessão permite promoção e revogação no request
  seguinte, porque `Person` já é relida em toda chamada protegida.
- A proteção visual pode ser adulterada no browser. Todo endpoint que futuramente
  expuser ação ou dado administrativo também deverá usar o decorator da API.
- O código de erro `403 ADMIN_ACCESS_REQUIRED` distingue falta de permissão de
  ausência de autenticação sem revelar outros dados da pessoa.
- Não criar endpoint de teste preserva o requisito de que nenhum endpoint use a
  proteção ainda; a composição é validada em harness unitário.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoints, rota `/me`, fluxo de login e bases afetadas atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Produtor e consumidores coordenados atomicamente para o campo opcional
- Nenhum endpoint ou rota navegável vigente restrito a administrador
- Nenhuma coleção ou consulta adicional criada para autorização administrativa
- Revisão de código sem uso concluída, preservando apenas os pontos de extensão
  administrativos documentados
- Quality gates da raiz, E2E da API e testes integrados da UI aprovados
