# Architecture Decision Records

ADRs registram decisões transversais difíceis de reverter ou com alternativas
relevantes. Use `../templates/adr.md` e o nome
`ADR-XXXX-titulo-curto.md`.

Estados aceitos: `proposta`, `aceita`, `substituída` e `rejeitada`. Uma decisão
substituída permanece no histórico e aponta para a sucessora.

Índice atual:

- [`ADR-0001`](ADR-0001-estrategia-de-mocks-e-bancos-de-teste.md): estratégia de
  mocks e bancos de teste.
- [`ADR-0002`](ADR-0002-autenticacao-google-e-sessao.md): decisão histórica de
  autenticação Google e sessão stateless, substituída pela ADR-0004.
- [`ADR-0003`](ADR-0003-modelagem-dos-planos-de-treino.md): coleção única de
  planos por owner e árvore embutida.
- [`ADR-0004`](ADR-0004-sessao-revogavel-redis-e-csrf.md): sessão revogável no
  Redis, defesa CSRF e proteção da fronteira cross-site.
