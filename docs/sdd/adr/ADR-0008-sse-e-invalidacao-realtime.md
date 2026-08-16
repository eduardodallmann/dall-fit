# ADR-0008: Invalidação em tempo real por SSE e Redis Pub/Sub

- Status: `aceita`
- Data: `2026-08-15`
- Responsáveis: time Dall Fit

## Contexto

Uma mesma pessoa pode manter a aplicação aberta em computador, celular e várias
abas, enquanto administradores diferentes alteram o mesmo recurso. O CAS por
`X-Resource-Version` impede sobrescrita, mas só revela a mudança externa na
próxima gravação. As instâncias da API na Vercel não compartilham memória e podem
ser recicladas ou encerradas pelo limite de duração.

## Alternativas consideradas

### Polling

É simples e recupera perdas, porém cria leituras periódicas sem alterações e
mantém uma janela de desatualização.

### WebSocket

Permite comunicação bidirecional, mas a necessidade vigente é unidirecional e o
suporte direto da Vercel ainda não é a base estável adotada pelo produto.

### SSE com fan-out em Redis Pub/Sub

Usa HTTP autenticado e reconexão nativa. Redis distribui eventos entre runtimes e
a leitura HTTP canônica continua responsável pelo conteúdo.

## Decisão

A API oferece `GET /realtime/events`, autenticado, e envia `realtime-ready`,
`resource-invalidated` e `heartbeat`. Cada documento possui UUID efêmero, enviado
na conexão e em `X-Client-Instance-Id` nas mutações. Suprime-se somente a conexão
de origem; outras abas, dispositivos e pessoas recebem a invalidação autorizada.

O contrato público contém recurso, ID, estado e versão quando existente. O
envelope interno acrescenta audiência e origem e trafega por Redis Pub/Sub em uma
conexão subscriber dedicada. Publicação ocorre somente após escrita efetiva;
falha é best-effort e não transforma commit bem-sucedido em falha HTTP.

SSE não replica entidades nem substitui CAS. Como Pub/Sub é at-most-once e não há
replay, todo `realtime-ready` invalida queries registradas. A conexão usa retry de
3 s, heartbeat de 20 s, encerramento antes de 270 s e `maxDuration` de 300 s com
Fluid Compute. Documento oculto por 60 s fecha o stream e reconcilia ao voltar.

## Consequências

### Positivas

- propagação entre abas, dispositivos, pessoas e runtimes sem polling contínuo;
- infraestrutura genérica reutilizável;
- reconexão converge para a verdade HTTP;
- payload não expõe conteúdo editado, identidade ou rascunho.

### Negativas e riscos

- cada documento visível mantém conexão HTTP e cada runtime uma conexão Redis;
- Pub/Sub pode perder mensagens durante desconexões;
- clientes distinguem estado limpo de trabalho local;
- duração e custo precisam ser observados.

## Plano de adoção

O primeiro consumidor é o fluxo de planos globais. Lista e detalhe mantêm sua
recuperação; o editor pausa com trabalho local e descarta diretamente pelo alerta,
sem segunda modal. Recursos futuros registram pontes sobre o cliente transversal.

## Links relacionados

- [`FIT-0032`](../features/fit-0032-atualizacao-tempo-real-sse.md)
- [`ADR-0006`](ADR-0006-versao-de-recurso-em-header-de-dominio.md)
- [Fluxo de planos globais](../flows/gestao-planos-treino-globais.md)
