# ADR-0013: Sessões Web e nativas isoladas

- Status: `aceita`
- Data: `2026-09-12`
- Responsáveis: time Dall Fit

## Contexto

A ADR-0004 estabeleceu sessão JWT revogável no Redis e defesa CSRF para a Web. O
aplicativo Android Capacitor precisa autenticar um motor nativo e o WorkManager sem
depender do WebView, de cookie ou de material CSRF, enquanto a Web continua usando
seu transporte atual.

Aceitar o mesmo JWT indistintamente em cookie e `Authorization` permitiria que o
modo de transporte escolhido pelo cliente alterasse a política CSRF. Também seria
ambíguo decidir qual identidade usar quando os dois fossem enviados.

## Alternativas consideradas

### Reutilizar o mesmo JWT e distinguir apenas pelo header

Reduz claims e configuração, mas torna o header controlado pelo cliente o único
sinal usado para dispensar CSRF. Uma credencial Web poderia ser reapresentada como
Bearer, enfraquecendo a fronteira definida pela ADR-0004.

### Usar somente audiences distintas

Impede a troca criptográfica de transporte, porém deixa o estado revogável sem uma
confirmação explícita do canal e dificulta detectar registros legados ou
inconsistentes.

### Isolar por audience e canal Redis

Mantém uma única infraestrutura de emissão e revogação, mas exige que JWT e registro
Redis concordem sobre `web | native`. A política CSRF passa a depender de uma sessão
integralmente verificada, não apenas da presença de um header.

## Decisão

1. Sessões Web e nativas usam a mesma chave HMAC, issuer, rotação e duração
   absoluta, mas audiences diferentes.
2. Cada registro revogável Redis contém `channel: 'web' | 'native'`; audience,
   transporte esperado e canal persistido precisam coincidir.
3. Endpoints protegidos aceitam exatamente cookie Web ou Bearer nativo. A presença
   simultânea responde `400 AUTH_TRANSPORT_AMBIGUOUS`, sem precedência.
4. CSRF continua obrigatório para mutações Web e é dispensado somente depois de o
   Bearer ser validado como sessão `native`.
5. `POST /auth/native/session` valida um Google ID token cuja audience é o client
   Web/server configurado, sincroniza a pessoa e emite o Bearer. O JWT do Dall Fit
   usa a audience nativa própria.
6. `DELETE /auth/native/session` é separado do logout Web e idempotente para Bearer
   ausente, inválido, expirado ou já revogado.
7. Registros Redis anteriores sem `channel` são inválidos. O rollout encerra essas
   sessões Web e exige novo login; nunca infere ou promove um canal.

## Consequências

### Positivas

- uma sessão Web não pode dispensar CSRF ao ser movida para um header;
- o motor Android e o WorkManager autenticam sem WebView;
- revogação, expiração, rotação e política de pessoa continuam compartilhadas;
- inconsistências e credenciais simultâneas falham fechadas;
- nenhum token Google ou JWT bruto é persistido no Redis.

### Negativas e riscos

- cada consumidor precisa usar o transporte correspondente à audience emitida;
- o deploy invalida sessões Web criadas antes do discriminador e força novo login;
- guards e decorators de todos os endpoints protegidos passam a reconhecer dois
  canais e precisam preservar a decisão CSRF;
- o client OAuth Android precisa solicitar o ID token para o client Web/server
  exato configurado na API.

## Plano de adoção

1. Adicionar contratos, audience nativa e rate limit da troca.
2. Persistir canal em toda sessão nova e rejeitar registros sem discriminador.
3. Criar troca e logout nativos.
4. Generalizar guards, mantendo CSRF exclusivo do canal Web.
5. Atualizar documentação, unitários e E2E com Redis e MongoDB efêmeros.
6. Coordenar o deploy reconhecendo que sessões Web vigentes precisarão de novo
   login.

## Links relacionados

- [`ADR-0004`](ADR-0004-sessao-revogavel-redis-e-csrf.md)
- [`FIT-0080`](../features/fit-0080-autenticacao-bearer-nativa-api.md)
- [`endpoints de autenticação`](../../../api/docs/sdd/endpoints/auth.md)
