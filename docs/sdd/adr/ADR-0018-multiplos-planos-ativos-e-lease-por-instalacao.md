# ADR-0018: Múltiplos planos ativos e lease por instalação

- Status: `aceita`
- Data: 2026-09-30
- Responsáveis: engenharia Dall Fit

## Contexto

A seleção pessoal e a preparação Android foram concebidas para um plano ativo.
Combinar rotinas exige até cinco entradas ativas, escolha temporária durante a
jornada e disponibilidade offline de todas elas. Vincular o lease a um plano
forçaria troca de fence durante a reconciliação e impediria snapshots de planos
distintos na mesma instalação.

Esta decisão substitui somente a vinculação do lease a um plano singular descrita
na ADR-0015. Permanecem vigentes o lease exclusivo por pessoa, takeover explícito,
fence por `leaseId`, TTL e renovação condicionada à sincronização aceita.

## Alternativas consideradas

### Um lease por plano

Permite validade isolada, mas multiplica disputas, chaves e takeovers e deixa uma
instalação com vários editores concorrentes para a mesma pessoa.

### Um lease por pessoa e instalação

Mantém um único editor offline. O plano pertence ao snapshot e é validado pelo
conteúdo canônico; o fence comprova a instalação autorizada, independentemente do
plano preparado.

### Persistir um plano principal

Simplificaria dashboard e Treinar, porém criaria preferência não solicitada e
reintroduziria seleção singular disfarçada.

## Decisão

- A seleção MongoDB armazena até cinco `catalogEntryIds` únicos por pessoa. A API
  impõe o limite em transição atômica; a UI o antecipa sem ser autoridade.
- `catalogEntryId` em `/training` é uma escolha temporária validada e propagada à
  prévia e ao início. Não é persistido como preferência.
- O lease Redis contém pessoa, instalação, `leaseId` e vencimento, sem `planId`.
  Validação e renovação comparam essa tupla; snapshots continuam carregando e
  validando sua própria identidade de plano.
- O SQLite v5 mantém `prepared_plan` como coleção indexada por `plan_id`. A
  migration copia a antiga linha singleton, e o coordenador reconcilia até cinco
  preparações sob o mesmo lease.
- Sessão e snapshots são independentes da coleção preparada. Limpeza de uma
  réplica não remove mídias enquanto existirem referências de execução pendentes.

## Consequências

### Positivas

- zero a cinco rotinas podem permanecer prontas, inclusive offline;
- dashboard e Treinar não escolhem arbitrariamente um plano;
- uma mudança do conjunto ativo não revoga o editor da mesma instalação;
- a sessão capturada continua retomável após desativação do plano.

### Negativas e riscos

- preparação inicial pode transferir até cinco árvores e suas mídias;
- prontidão e expiração precisam ser avaliadas por plano;
- arquivos preservados por sessão ou snapshot podem permanecer até uma limpeza
  posterior segura;
- a migração MongoDB é preguiçosa e deve conviver temporariamente com o campo
  singular legado.

## Plano de adoção

1. Publicar contratos compatíveis com coleção ativa e lease sem plano.
2. Migrar leituras MongoDB legadas e elevar o SQLite de v4 para v5.
3. Atualizar API, UI, bridge, mocks, seeds e testes de concorrência e navegação.
4. Aplicar os índices de `catalogEntryIds` e observar rejeições do limite.

## Links relacionados

- [Feature FIT-0106](../features/fit-0106-multiplos-planos-ativos.md)
- [ADR-0014](ADR-0014-motor-nativo-de-persistencia-offline.md)
- [ADR-0015](ADR-0015-lease-offline-de-treino-no-redis.md)
- [Fluxo de execução](../flows/execucao-de-treino.md)
