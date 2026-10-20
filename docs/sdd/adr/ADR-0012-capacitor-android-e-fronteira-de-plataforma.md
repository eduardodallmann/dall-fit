# ADR-0012: Capacitor Android e fronteira de plataforma

- Status: `aceita`
- Responsáveis: Dall Fit

## Contexto

O Dall Fit já distribui uma única UI React/Vite como Web/PWA. As evoluções móveis
precisam acessar capacidades nativas sem duplicar telas e estado, depender de um
servidor remoto para iniciar ou espalhar APIs específicas de dispositivo pelos
componentes. O projeto Android também receberá customizações futuras e precisa ser
reproduzível entre ambientes.

## Alternativas consideradas

### Alternativa A — aplicativo Android separado

Uma aplicação independente permitiria arquitetura totalmente nativa, mas
duplicaria navegação, apresentação, regras do cliente, testes e evolução de cada
tela.

### Alternativa B — Capacitor com acesso direto nos componentes

Reutilizaria o bundle web com menor estrutura inicial, porém acoplaria UI e plugins,
dificultaria fallback no navegador, testes e substituição das integrações nativas.

### Alternativa C — Capacitor sobre a UI única com adapters

Mantém a UI compartilhada, empacota assets locais e concentra detecção e plugins
em adapters atrás de contratos exclusivos do cliente.

## Decisão

Adotar a alternativa C com Capacitor 8. O projeto `ui/android/` é código-fonte
versionado, usa o identificador `com.dallfit.app`, mínimo API 29 e mantém versões
compatíveis com o template oficial e os plugins adotados. O caminho de produção sempre gera o
bundle Vite local antes de sincronizá-lo; não existe `server.url`, JavaScript
remoto ou live update no default de produção.

O contrato `ui/src/core/platform` discrimina somente `web | android` e publica um
snapshot imutável das capacidades realmente existentes. O adapter Web é o fallback
determinístico. O adapter nativo encapsula Capacitor, e o ESLint impede imports de
`@capacitor/*` fora dessa camada. Ports de autenticação, persistência, sincronização
ou notificação serão adicionados apenas junto dos seus consumidores.

## Consequências

### Positivas

- Web, PWA e Android compartilham telas, router, estado e build otimizado;
- produção Android inicia sem depender do host web;
- componentes permanecem testáveis e independentes da bridge;
- o projeto nativo aceita evolução controlada sem regeneração destrutiva;
- gates web continuam executáveis sem Android SDK ou Android Studio.

### Negativas e riscos

- o projeto nativo amplia o volume versionado e exige revisão de upgrades gerados;
- build Android requer toolchain local adicional e validação em emulador ou aparelho;
- mudanças futuras de `appId`, SDK, Gradle ou Capacitor exigem migração coordenada;
- o fallback Web deliberado não transforma suporte futuro a iOS em suporte implícito.

## Plano de adoção

- manter `@capacitor/core`, `@capacitor/android` e `@capacitor/cli` alinhados;
- preparar Android pelos scripts canônicos da raiz;
- introduzir cada capability nativa com port, adapters e testes próprios;
- adicionar CI, assinatura e release somente quando o fluxo de publicação for
  especificado.

## Links relacionados

- [FIT-0079](../features/fit-0079-estruturar-aplicativo-capacitor-android.md)
- [Arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md)
- [Arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md)
