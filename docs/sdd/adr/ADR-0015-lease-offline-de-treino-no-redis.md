# ADR-0015: Lease offline de treino no Redis

- Status: `aceita`
- Responsáveis: Dall Fit

## Contexto

O Android precisa produzir vários snapshots offline para o plano ativo sem que
duas instalações sejam editoras simultâneas. A instalação é identificada por UUID
aleatório, mas reutilizar somente esse UUID depois de uma expiração causaria o
problema ABA: snapshots de uma concessão antiga poderiam parecer atuais após novo
registro da mesma instalação.

## Alternativas consideradas

### Chave por pessoa e plano, sem fence

Permitiria leases simultâneos para planos diferentes e reutilizaria a identidade da
instalação como autorização histórica. Trocar a seleção ativa não revogaria com
segurança snapshots do plano anterior.

### Autorização durável no MongoDB

Ofereceria histórico e tombstones, mas misturaria coordenação efêmera com dados
duráveis, exigiria limpeza e não eliminaria a necessidade de uma transição atômica
para corridas frequentes.

### Chave Redis única por pessoa, valor cercado por `leaseId`

Mantém uma única autoridade efêmera e permite linearizar registro, rebind,
takeover, validação e renovação em scripts Lua curtos.

## Decisão

Adotar uma chave `offline-training-lease` por pessoa, composta somente pelo
`RedisKeyService`. O valor contém pessoa, plano ativo resolvido pelo servidor,
instalação, `leaseId` criptograficamente aleatório e `expiresAt`. Plano e instalação
não participam da chave.

Criação, troca de plano pela mesma instalação e takeover efetivo geram novo fence e
sete dias de validade. Repetir registro ou takeover para a mesma instalação e plano
devolve o valor existente sem reescrever a chave nem renovar o TTL. Registro de
outra instalação falha até que o takeover explícito substitua integralmente a
tupla.

Validação exige coincidência de pessoa, plano, instalação e fence e não altera TTL.
Ausência é expiração; divergência diante de valor atual é revogação. Somente a
operação interna nomeada para sincronização já aceita pode revalidar a tupla e
mover `expiresAt` e `PXAT` por mais sete dias. Todas as decisões compostas são
atômicas no Redis; não há `WATCH`, lock local, fallback ou autorização no MongoDB.

A ingestão de snapshot implementa essa condição na mesma transição Lua que publica
uma revisão nova. O script confronta o fence e atribui o mesmo `PXAT` de sete dias
ao lease e ao snapshot; replay idêntico, conflito, escolha da versão do servidor ou
erro não renovam nenhum deles. Conflitos comparáveis devolvem a versão segura
corrente e um token opaco; a escolha local só substitui essa versão se o token
ainda coincidir. Um lock Redis curto por instalação serializa a região crítica
entre runtimes e é removido somente pelo token proprietário.

Aceitar um estado terminal ainda exige o lease vigente na primeira tentativa, mas
o recibo durável permite repetir exatamente a mesma conclusão ou cancelamento sem
Redis ou lease. Depois da persistência MongoDB, a limpeza do snapshot compara
execução, revisão e hash e não pode remover uma versão substituta.

## Consequências

### Positivas

- uma pessoa possui no máximo uma instalação editora, mesmo ao trocar de plano;
- o fence impede ressuscitar snapshots de concessões expiradas ou substituídas;
- retries ambíguos de registro e takeover são idempotentes e não ampliam validade;
- reset ou indisponibilidade do Redis falha fechado e não deixa autorização
  durável residual.

### Negativas e riscos

- perda do Redis exige novo registro e snapshots do fence anterior não podem ser
  importados;
- seleção ativa no MongoDB e lease no Redis não formam transação distribuída;
- scripts Lua bloqueiam o servidor durante a execução e precisam permanecer
  pequenos, constantes e sem I/O externo;
- takeover revoga o editor anterior sem transferir ou recuperar seus dados locais.

## Plano de adoção

- incluir registro e takeover nativos no módulo de treino;
- expor validação e renovação como fronteiras internas para a ingestão posterior;
- cobrir scripts, TTL, corridas e falhas com unitários e Redis efêmero real;
- integrar o consumidor Android e snapshots somente em features posteriores.

## Links relacionados

- [FIT-0084](../features/fit-0084-lease-redis-plano-instalacao-pessoa.md)
- [FIT-0086](../features/fit-0086-finalizar-cancelar-resolver-conflitos-execucoes-offline.md)
- [ADR-0010](ADR-0010-sessao-efemera-e-historico-de-treino.md)
- [ADR-0013](ADR-0013-sessoes-web-e-native-isoladas.md)
- [Fluxo de execução de treino](../flows/execucao-de-treino.md)
- [Endpoint de lease offline](../../../api/docs/sdd/endpoints/offline-training-lease.md)
