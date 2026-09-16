# ADR-0016: Compatibilidade Android e recuperação local visível

- Status: `aceita`
- Responsáveis: Dall Fit

## Contexto

Uma build Android permanece instalada enquanto API, protocolo de sincronização e
SQLite evoluem. Uma versão antiga não pode iniciar trabalho que o backend já não
aceita, mas uma atualização também não pode descartar a fila local para simplificar
uma mudança de schema. A recuperação definida na ADR-0014 recriava silenciosamente
o storage depois de duas falhas de abertura; isso ocultava uma possível perda de
treinos que existiam somente no aparelho.

## Alternativas consideradas

### Confiar apenas na compatibilidade do payload

Manteria o backend tolerante indefinidamente e só descobriria uma incompatibilidade
durante o upload. A pessoa ainda poderia iniciar novos treinos que nunca seriam
sincronizados, e o app fechado repetiria trabalho sem uma política explícita.

### Atualização remota ou instalação dentro do aplicativo

Live update ou Play In-App Updates ampliariam distribuição, assinatura e UX sem
resolver por si mesmos a compatibilidade transacional do SQLite e da fila.

### Política mínima, metadados por envelope e migrations incrementais

Permite ao backend coordenar rollout, ao pacote nativo tomar a decisão com o
`versionCode` real e ao storage provar qual versão de contrato produziu cada item.
A fila continua sendo a autoridade e só é rearmada depois de migration e gate.

## Decisão

A API publica uma política Android `no-store`, configurada por versão mínima e URL
HTTPS oficial da Play Store. O app consulta essa política na abertura, resume e
recuperação de conectividade, conserva em preferência privada não restaurável o
maior mínimo observado e nunca o reduz. Falha sem política conhecida não bloqueia
o uso local já permitido; o backend permanece a barreira final.

Cada snapshot SQLite guarda `producer_version_code` e `sync_contract_version`, e o
transporte envia ambos em headers. O backend valida esses valores antes do lock ou
de qualquer acesso a Redis/MongoDB. Incompatibilidade retorna
`APP_UPDATE_REQUIRED`; foreground e Worker persistem o bloqueio, conservam a fila
e encerram sem retry. O schema v4 nasce completo e a migration v3→v4 classifica
linhas antigas como pacote/contrato 1 sem reordenar ou reserializar. Upgrades v1 e
v2 continuam atravessando todas as etapas consecutivas.

Uma versão obsoleta não monta navegação funcional. A única exceção é o path exato
de uma sessão local que já estava ativa: ela pode chegar a `completed` ou
`cancelled`, exclusivamente no SQLite e sem sync. A ação de atualização usa intent
restrito à Play Store e fallback HTTPS para o navegador.

`SQLiteOpenHelper` continua tentando uma abertura adicional com handle novo e
mantém rollback transacional. Migration ausente, downgrade ou segunda falha ainda
permite recriar banco, sidecars e arquivos como último recurso. Porém a ocorrência
`migration-reset` é registrada fora do banco recriado e permanece até um
`AlertDialog` explicar a possível perda e receber reconhecimento explícito. Esta
decisão substitui somente a invisibilidade do reset descrita na ADR-0014; as demais
decisões daquela ADR permanecem vigentes.

## Consequências

### Positivas

- rollout e bloqueio ficam coordenados sem confiar nos headers como autorização;
- atualização preserva fila, ordem, ações e conclusão provisória quando a migration
  é válida;
- treino já iniciado não é interrompido nem enviado por uma build incompatível;
- perda irrecuperável deixa de ser silenciosa e sobrevive à recriação do banco;
- Web/PWA permanece fora do protocolo e sem storage paralelo.

### Negativas e riscos

- elevar o mínimo cedo demais bloqueia todas as builds anteriores até nova
  publicação ou ajuste operacional;
- política monotônica não admite usar redução server-side como downgrade;
- a exceção de sessão ativa exige coordenação entre path, sessão SQLite e gate
  nativo;
- testes de migration, package info, Worker e intents dependem da matriz Android.

## Plano de adoção

- publicar e confirmar a nova build antes de elevar o mínimo;
- manter backend compatível com a build anterior e a nova durante o rollout;
- validar migrations v1/v2/v3→v4 e a retomada da fila;
- elevar `ANDROID_MIN_VERSION_CODE` apenas depois dessas validações;
- nunca alterar a migration v3→v4 depois de distribuída.

## Links relacionados

- [ADR-0014 — motor nativo de persistência offline](ADR-0014-motor-nativo-de-persistencia-offline.md)
- [ADR-0012 — Capacitor Android e fronteira de plataforma](ADR-0012-capacitor-android-e-fronteira-de-plataforma.md)
- [Fluxo de execução de treino](../flows/execucao-de-treino.md)
- [Política Android](../../../api/docs/sdd/endpoints/app-compatibility-android.md)
