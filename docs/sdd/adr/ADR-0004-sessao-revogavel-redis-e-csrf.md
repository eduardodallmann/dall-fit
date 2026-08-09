# ADR-0004: Sessão revogável no Redis e defesa CSRF

- Status: `aceita`
- Data: `2026-08-09`
- Responsáveis: time Dall Fit

## Contexto

A UI e a API permanecem em sites `vercel.app` distintos. A sessão de produção
precisa, portanto, de cookie cross-site `SameSite=None`, mas a decisão anterior
confiava apenas na assinatura e expiração do JWT, não permitia revogação individual
e não protegia mutações com um mecanismo CSRF explícito. Login, sessão e rate limit
também precisam funcionar de modo consistente entre runtimes serverless.

Esta decisão substitui a parte de sessão stateless e bypass da
[`ADR-0002`](ADR-0002-autenticacao-google-e-sessao.md). O uso do Authorization Code
e OpenID Connect no backend, a identidade Google baseada em `sub` e a ausência de
tokens acessíveis ao JavaScript permanecem válidos.

## Alternativas consideradas

### Manter JWT exclusivamente stateless

Preserva uma leitura a menos, porém não revoga uma sessão antes de `exp`, não
permite logout server-side efetivo e faria a perda do estado Redis ser ignorada.

### Persistir uma sessão opaca e remover o JWT

Centraliza toda a sessão no Redis, mas elimina as claims técnicas assinadas que
identificam emissão, audiência e geração de chave sem reduzir a leitura necessária
para revogação.

### Associar JWT curto a registro revogável no Redis

Mantém validação criptográfica e adiciona presença server-side obrigatória. O mesmo
registro guarda pessoa, expiração e token CSRF da sessão; contadores Redis atômicos
protegem endpoints sensíveis de forma distribuída.

## Decisão

1. A API emite JWT HMAC com `sub`, `jti`, `iss`, `aud`, `iat`, `exp` e `kid`,
   sempre pela chave ativa. Uma chave anterior pode verificar tokens somente até a
   janela explicitamente configurada.
2. Toda autenticação protegida exige assinatura e claims válidas, registro ativo
   de `jti` no Redis e pessoa existente no MongoDB. Não existe fallback stateless.
3. O Redis conserva somente pessoa, material CSRF e expiração sob chave com TTL; o
   JWT bruto não é persistido. Logout remove a sessão atual e a ausência do registro
   invalida imediatamente qualquer cópia do JWT.
4. Mutações autenticadas exigem a sessão, `Origin` exatamente igual à UI e o token
   de `GET /auth/csrf` em `X-CSRF-Token`, comparado em tempo constante. A UI mantém
   esse token apenas em memória.
5. Início e callback Google usam navegação top-level, `state`, `nonce` e PKCE S256.
   Cookies OAuth são temporários e `SameSite=Lax`; a sessão publicada usa cookie
   host-only `__Host-`, `HttpOnly`, `Secure` e `SameSite=None`. O ambiente HTTP
   local conserva nome não prefixado, `Secure=false` e `SameSite=Lax`.
6. Um único client `ioredis` é compartilhado por runtime Nest. Produção e preview
   exigem `rediss://`, namespace próprio, timeouts, reconexão limitada, offline
   queue desabilitada e integração com o lifecycle oficial da Vercel.
7. Rate limits configuráveis usam script Lua atômico, TTL e identificadores
   sanitizados por IP, sessão ou pessoa conforme a rota. `OPTIONS` não consome
   quota e falhas Redis fecham a proteção.
8. O bypass de autenticação existe somente em runtime local/teste fora de Vercel e
   CI, quando habilitado com chave aleatória forte. Não há chave conhecida nem
   ativação automática.

## Consequências

### Positivas

- logout e revogação passam a ter efeito imediato;
- CSRF combina token vinculado à sessão, origem exata, CORS mínimo e cookies
  adequados ao contexto;
- rate limit permanece consistente entre instâncias;
- rotação de chave não exige encerrar imediatamente todas as sessões;
- reinicialização ou perda do dataset invalida sessões em vez de reduzir a
  segurança;
- o desenvolvimento local continua em `localhost:3000` e `localhost:4000`, com
  Redis efêmero fornecido pela infraestrutura de desenvolvimento.

### Negativas e riscos

- Redis torna-se dependência crítica de login, autenticação, CSRF e rate limit;
- cada request protegida acrescenta uma leitura Redis antes da consulta MongoDB;
- UI e API precisam ser publicadas coordenadamente porque JWTs antigos não possuem
  o registro e as claims exigidos;
- origem, cookie, CSP e variáveis de sessão precisam permanecer coerentes entre os
  dois projetos;
- indisponibilidade, timeout ou erro de capacidade Redis devolvem falha fechada e
  podem indisponibilizar temporariamente operações autenticadas.

## Plano de adoção

1. Validar ambiente, criar o client Redis único e namespaces por runtime.
2. Migrar emissão e validação para JWT associado a sessão revogável.
3. Adicionar PKCE, CSRF, logout, rate limits e headers de segurança.
4. Migrar a UI para navegação direta de login, bootstrap CSRF e logout compartilhado.
5. Invalidar sessões antigas na implantação coordenada de API e UI.
6. Validar com unitários, E2E serial usando MongoDB/Redis efêmeros e Playwright.

## Links relacionados

- `../features/fit-0026-endurecimento-autenticacao-sessao.md`
- `../flows/login-google.md`
- `../../../api/docs/sdd/endpoints/auth.md`
- `../../../api/docs/sdd/endpoints/current-person.md`
- `../../../ui/docs/sdd/routes/root.md`
- `../../../ui/docs/sdd/routes/dash.md`
