# ADR-0019: Termos imutáveis, recibos próprios e bloqueio de acesso

- Status: aceita
- Data: 2026-11-05
- Responsáveis: Eduardo Dallmann

## Contexto

Autenticação não registra concordância contratual. Precisamos apresentar condições
integrais, preservar a versão aceita e exigir novo aceite quando publicadas outras
condições. Android deve manter treino offline anteriormente autorizado, sem
inventar conhecimento de publicações ainda não descobertas nem perder sua fila.

## Alternativas consideradas

### Flag em Person ou sessão

Um booleano não identifica texto, operador, data ou versão. Atualizar JWT/sessão
não assegura autorização vigente e perde evidência quando Redis é limpo.

### Documento mutável ou cópia integral por usuário

Documento mutável altera retroativamente a evidência. Duplicar HTML em cada recibo
amplifica armazenamento e dificulta garantir que todos leram os mesmos bytes.

### Bloqueio só visual ou bloqueio offline absoluto

UI isolada permite contorno HTTP. Bloqueio absoluto offline contradiz a decisão de
preservar treino previamente autorizado até a descoberta de uma nova exigência.

## Decisão

Uma coleção guarda rascunhos e publicações. A publicação transforma atomicamente o
mesmo documento em imutável, com número crescente único, HTML seguro/hash e
identificação pública por versão. Índice único parcial serializa concorrência;
CAS protege revisão do draft. Publicação exige hash da prévia e vigente observada.

Outra coleção guarda um recibo por pessoa/versão, com primeira data do servidor,
canal verificado, hash e declarações de concordância/maioridade. A API relê situação
após gravação para não transferir concordância a uma publicação concorrente.

A política transversal executa após autenticação/permissão/CSRF/quota e antes de
negócio. Somente fronteiras estritas de autenticação/suporte/termos são isentas;
bootstrap administrativo só existe sem publicação. O gate é consulta MongoDB,
independente de JWT/Redis. Eventos SSE mínimos aceleram descoberta e leituras
canônicas/HTTP mantêm autoridade. A UI preserva estado recuperável ocultando sua
atividade e interrompendo efeitos; não repete mutation recusada automaticamente.

Android guarda comprovante mínimo e requisito monotônico no SQLite existente por
conta, com migration aditiva. Offline conserva autorização conhecida; descoberta de
requisito posterior bloqueia novas ações e pausa a fila compartilhada de foreground
e WorkManager até aceite online. Termos não expiram credencial nem eliminam treino.

## Consequências

### Positivas

Documento histórico íntegro, recibo idempotente, autorização entre canais e sem
backfill de aceite. Concorrência não exige transação multidocumento. Publicação
perdida no SSE continua protegida pelo HTTP e pela reconciliação.

### Negativas e riscos

Cada fronteira protegida consulta situação canônica. Publicação bloqueia todos,
inclusive admin, e sem documento publicado o negócio fica indisponível. Janela
offline até descoberta é deliberada. Autodeclaração de idade não verifica identidade
nem aptidão clínica. HTML/hash e recibo preservam evidência técnica, sem oferecer
imunidade jurídica nem substituir deveres legais e qualidade do produto.

## Plano de adoção

Aplicar índices explicitamente; preparar/revisar minuta por operação administrativa
ou CLI idempotente; publicar coordenadamente com API/UI. Distribuir e validar build
Android que entende `terms-required` antes de elevar mínimo público. Nenhum rollout
cria recibo ou modifica publicações já aceitas. Startup não publica nem sincroniza
índices automaticamente.

## Links relacionados

- [FIT-0109](../features/fit-0109-aceite-versionado-de-termos-de-uso.md)
- [Fluxo de termos](../flows/aceite-de-termos.md)
- [API de termos](../../../api/docs/sdd/endpoints/terms.md)
- [Gestão de termos](../../../api/docs/sdd/endpoints/admin-terms.md)
- [Motor nativo](ADR-0014-motor-nativo-de-persistencia-offline.md)
