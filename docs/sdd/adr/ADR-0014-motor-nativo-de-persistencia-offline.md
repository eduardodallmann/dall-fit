# ADR-0014: Motor nativo de persistência offline

- Status: `aceita`
- Responsáveis: Dall Fit

## Contexto

O Android precisa persistir planos preparados, sessões, snapshots pendentes e
arquivos para uso offline. Esses dados deverão ser acessíveis tanto pela UI
Capacitor quanto por futuros Workers quando o WebView não estiver ativo. Uma base
Web, um plugin genérico ou implementações separadas criariam mais de um
proprietário, locks incompatíveis e regras divergentes de transação e limpeza.

Os formatos completos desses agregados ainda pertencem às features consumidoras.
A fundação precisa preservá-los sem antecipar sua modelagem e, ao mesmo tempo,
normalizar somente os metadados necessários para integridade e operação.

## Alternativas consideradas

### Alternativa A — IndexedDB ou storage Web

Simplificaria o acesso pelo React, mas não ofereceria uma fonte confiável para
execução nativa com o WebView fechado e deixaria filesystem, transações e
concorrência fora de uma única fronteira.

### Alternativa B — plugin SQLite de terceiros ou ORM

Reduziria parte do código de infraestrutura, porém adicionaria runtime, geração ou
uma bridge genérica que expõe detalhes de persistência ao JavaScript. O schema
inicial é pequeno e requer controle direto das transações e da recuperação.

### Alternativa C — serviço Android próprio com SQLiteOpenHelper

Centraliza SQLite, arquivos internos, migrations, lock e limpeza em um serviço de
escopo da aplicação. Um plugin Capacitor local e fino traduz comandos tipados, e
futuros Workers usam diretamente a mesma instância nativa.

## Decisão

Adotar a alternativa C. `OfflineStorageService` é o único proprietário do banco
`dall-fit-offline.db`, do diretório interno `files/offline/` e de um lock justo de
processo. `OfflineStorageProvider` entrega a instância singleton ao plugin e aos
futuros consumidores nativos. A UI acessa comandos somente pelo contrato em
`core/platform/native`; não recebe SQL, transações arbitrárias nem paths.

O schema versionado guarda conta, plano preparado, sessão ativa, snapshots,
estado mínimo de sincronização, metadados de arquivo e metadados do motor. Plano,
sessão e snapshot são objetos JSON opacos com versão e revisão; IDs, timestamps e
estado operacional necessários ficam normalizados. Arquivos usam nomes gerados a
partir de IDs validados, estado `temporary | ready` e armazenamento privado
excluído de backup.

Toda mutação é serializada pelo mesmo lock e usa uma transação SQLite quando
altera linhas. Limpeza de conta isola os arquivos antes de remover as linhas e só
resolve depois da exclusão física; restos são mantidos em uma área de descarte sem
vínculo com nova conta e removidos no retry ou na próxima inicialização.

`SQLiteOpenHelper` controla a criação e migrations. Uma abertura falha é repetida
uma vez com novo handle. Falha persistente, migration ausente ou downgrade remove
banco, sidecars e diretórios offline, cria um schema vazio e registra somente a
categoria `migration-reset` e sua geração. Essa recuperação não produz UI nem
Analytics; se o próprio reset falhar, o motor permanece fechado.

## Consequências

### Positivas

- UI e futuros Workers compartilham dados, transações e concorrência;
- payloads evoluem sem migrations prematuras de campos de treino;
- eventos são apenas hints, reparáveis por leitura do estado canônico;
- arquivos incompletos não são publicados e limpeza de conta impede mistura de
  identidades;
- Web/PWA permanece sem banco offline paralelo.

### Negativas e riscos

- SQLite e filesystem não compartilham uma transação; isolamento, rename e limpeza
  idempotente compensam essa fronteira;
- reset irrecuperável pode perder pendências silenciosamente;
- payloads opacos não permitem consultas internas aos dados de domínio;
- migrations distribuídas passam a ser imutáveis e exigem testes Android reais;
- o lock não coordena processos Android distintos, escolha compatível com o app e
  Workers previstos no mesmo processo.

## Plano de adoção

- introduzir schema v1, serviço, provider e plugin local;
- ligar `NativeLocalDataPort` ao motor e vincular a identidade canônica;
- validar banco e filesystem reais em testes instrumentados;
- acrescentar download, WorkManager, sincronização e consumo de treino apenas nas
  features proprietárias posteriores.

## Links relacionados

- [FIT-0082](../features/fit-0082-nucleo-nativo-persistencia-offline.md)
- [ADR-0012](ADR-0012-capacitor-android-e-fronteira-de-plataforma.md)
- [ADR-0013](ADR-0013-sessoes-web-e-native-isoladas.md)
- [Arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md)
- [Arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md)
