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
- [`ADR-0005`](ADR-0005-limites-concorrencia-e-midia-dos-planos.md): limites,
  CAS e decisão histórica de mídia pública, parcialmente substituída pela
  ADR-0007.
- [`ADR-0006`](ADR-0006-versao-de-recurso-em-header-de-dominio.md): versão de
  aggregate no header `X-Resource-Version`.
- [`ADR-0007`](ADR-0007-blob-privado-oidc-e-urls-assinadas.md): Blob privado por
  OIDC e entrega direta por signed URLs temporárias.
- [`ADR-0008`](ADR-0008-sse-e-invalidacao-realtime.md): invalidação em tempo
  real por SSE e Redis Pub/Sub.
- [`ADR-0009`](ADR-0009-catalogo-pessoal-e-clonagem-duravel.md): catálogo pessoal,
  referências globais vivas e clonagem durável em projeto Nitro separado.
- [`ADR-0010`](ADR-0010-sessao-efemera-e-historico-de-treino.md): sessão de treino
  no Redis e consolidação durável de execução e cargas no MongoDB.
- [`ADR-0011`](ADR-0011-assistente-ia-triagem-e-sessao-sensivel.md): assistente de
  IA com triagem determinística e sessão sensível.
- [`ADR-0012`](ADR-0012-capacitor-android-e-fronteira-de-plataforma.md): Capacitor
  Android sobre a UI compartilhada e fronteira de adapters de plataforma.
- [`ADR-0013`](ADR-0013-sessoes-web-e-native-isoladas.md): audiences e canais Redis
  isolam sessão Web por cookie da sessão Android por Bearer.
- [`ADR-0014`](ADR-0014-motor-nativo-de-persistencia-offline.md): SQLite e
  filesystem privado sob um único motor Android compartilhado pela bridge e por
  consumidores nativos.
