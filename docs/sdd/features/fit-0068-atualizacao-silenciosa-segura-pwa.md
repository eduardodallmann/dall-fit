# Feature Spec: Atualização silenciosa e segura da PWA

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0068`](https://github.com/eduardodallmann/dall-fit/issues/68) —
  melhoria no PWA update.
- Problema: o frontend usa `vite-plugin-pwa` em modo `prompt` e informa uma nova
  versão apenas quando o Service Worker encontra um build em espera. Na prática,
  essa descoberta ocorre principalmente ao carregar ou recarregar o documento, e
  não durante uma sessão longa da SPA. Tanto em abas comuns quanto na PWA instalada,
  `Atualizar agora` chama `updateServiceWorker(true)`, mas pode apenas solicitar
  `SKIP_WAITING` sem recarregar o documento; a pessoa precisa então usar F5, puxar
  para atualizar ou fechar e abrir novamente. O provider registra sucesso assim que
  a Promise do plugin resolve, embora a versão nova ainda não tenha comprovadamente
  assumido o documento. O teste vigente substitui o hook do plugin e confirma apenas
  a chamada do mock, portanto não protege o ciclo real de ativação e reload.
- Resultado: navegador comum e PWA instalada usam a mesma política confiável de
  atualização. A UI verifica novas versões no início, ao retomar uma sessão elegível
  e periodicamente enquanto está visível e online. Uma versão pronta é ativada e o
  documento é recarregado automaticamente, sem aviso no caminho normal, somente
  depois de confirmar a ativação e quando não houver trabalho recuperável. Trabalho
  local ou mutation pendente adia silenciosamente o reload até um estado seguro.
  Falha mantém a versão corrente utilizável e oferece uma recuperação explícita.
  Nenhuma atualização depende de F5, gesto de pull-to-refresh ou comportamento
  divergente entre janela do navegador e `standalone`.
- Referências locais:
  - `docs/sdd/features/fit-0011-instalacao-pwa.md`;
  - `docs/sdd/features/fit-0021-responsividade-aviso-atualizacao-pwa.md`;
  - `docs/sdd/features/fit-0029-resiliencia-sessao-requests-pwa.md`;
  - `docs/sdd/features/fit-0035-adicionar-analytics.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/04-testes-e-qualidade.md`;
  - `ui/docs/sdd/base/05-mocks-de-api.md`;
  - `ui/docs/sdd/base/07-testes-integrados-playwright.md`;
  - `ui/docs/sdd/routes/root.md`;
  - `ui/docs/sdd/routes/dash.md`;
  - documentos de rota dos planos globais e pessoais, que possuem formulários,
    drafts, filas, uploads e mutations recuperáveis.
- Versões confirmadas durante a especificação: `vite-plugin-pwa` `1.3.0`,
  `workbox-window` `7.4.1`, Vite `8.1.5`, React `19.2.8` e TanStack Query
  `5.101.4` no lockfile vigente.
- Referências oficiais e upstream:
  - [Vite PWA — prompt para atualização](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html);
  - [Vite PWA — atualizações periódicas do Service Worker](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates);
  - [Vite PWA — reload automático e risco de perda de formulários](https://vite-pwa-org.netlify.app/guide/auto-update.html);
  - [Workbox — atualização imediata do Service Worker](https://developer.chrome.com/docs/workbox/handling-service-worker-updates);
  - [Workbox Window — eventos de ciclo de vida](https://developer.chrome.com/docs/workbox/modules/workbox-window/);
  - [MDN — `Clients.claim()`](https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim);
  - [vite-plugin-pwa #789 — prompt não recarrega na primeira atualização](https://github.com/vite-pwa/vite-plugin-pwa/issues/789);
  - [vite-plugin-pwa #931 — correção upstream ainda não incorporada](https://github.com/vite-pwa/vite-plugin-pwa/pull/931).
- Features relacionadas:
  - `FIT-0011` introduziu instalação, precache e atualização mediante confirmação;
    esta feature substitui apenas a experiência de update e preserva manifesto,
    instalação e fronteiras de cache;
  - `FIT-0021` tornou responsivo o aviso normal de nova versão; esse registro
    permanece histórico, mas o aviso deixa de existir no caminho normal;
  - `FIT-0029` tornou falhas do PWA recuperáveis e promises terminais; esta feature
    corrige a definição de sucesso e estende a descoberta durante sessões longas;
  - `FIT-0035` definiu Analytics das ações manuais de update; a atualização
    automática não será registrada como interação da pessoa.

## Escopo

### Incluído

- substituir o aviso normal de nova versão por atualização automática, silenciosa
  e igual em aba comum, navegador móvel e PWA `standalone`;
- manter `registerType: 'prompt'` como mecanismo técnico de espera controlada, sem
  expor o prompt normal à pessoa e sem adotar `autoUpdate` irrestrito;
- capturar a URL e o `ServiceWorkerRegistration` reais por `onRegisteredSW`;
- verificar atualizações no registro inicial, em retomadas elegíveis do documento
  e em intervalo controlado enquanto a aplicação estiver visível e online;
- solicitar `registration.update()` com proteção contra concorrência, offline,
  worker já instalando e verificações excessivas;
- coordenar explicitamente worker em espera, solicitação de `SKIP_WAITING`, estado
  de ativação, mudança de controle e reload do documento;
- deixar de usar a resolução de `updateServiceWorker(true)` como prova de sucesso;
- impedir que o reload automático descarte draft, autosave, upload, fila,
  conflito recuperável, formulário alterado ou mutation pendente;
- criar uma fronteira transversal mínima de segurança de reload, sem importar
  conceitos de planos em `core`, e integrar nela todos os contextos recuperáveis
  vigentes;
- manter uma atualização pronta pendente em memória e aplicá-la automaticamente
  assim que o documento ficar visível e sem bloqueadores;
- apresentar aviso acessível somente quando a tentativa automática de ativação
  falhar, com retry explícito e opção de continuar usando a versão atual;
- corrigir Analytics e diagnóstico para distinguir atualização automática de ação
  explícita, registrar sucesso apenas após ativação confirmada e não duplicar
  eventos antes do reload;
- cobrir o ciclo real com testes unitários/de componente e uma validação isolada
  sobre dois builds de produção consecutivos com Service Worker real;
- atualizar a documentação viva da UI afetada durante a implementação autorizada.

### Não incluído

- alterar instalação, manifesto, nome, ícones, `start_url`, escopo ou apresentação
  `standalone` da PWA;
- remover o Service Worker de abas comuns, separar PWA e web por origem ou path, ou
  mudar o escopo raiz vigente;
- prometer que o primeiro byte ou a primeira pintura de toda navegação já pertence
  ao deploy mais recente; a verificação do Service Worker é assíncrona e pode
  provocar um único reload automático depois da descoberta;
- habilitar `registerType: 'autoUpdate'` sem coordenação de trabalho recuperável;
- forçar reload enquanto existir bloqueador, simular aceite de `beforeunload` ou
  descartar silenciosamente trabalho local;
- persistir draft, fila, arquivo, response HTTP, pessoa, sessão ou token para
  viabilizar atualização;
- cachear API, autenticação, imagens privadas, avatares, URLs assinadas ou recursos
  remotos;
- adicionar modo offline funcional, Background Sync, periodic background sync,
  push notification ou publicação em lojas;
- aplicar patch manual em `node_modules`, depender da aceitação do PR upstream ou
  exigir upgrade de dependência sem confirmar versão, tipos e release oficial;
- alterar API, Workflow, contratos HTTP ou `@dall-fit/types`;
- habilitar o Service Worker da PWA no Playwright integrado que usa MSW Browser;
- criar screenshots ou referências visuais de layout.

## Projetos e documentação afetados

- API e endpoints: não se aplica — nenhuma request, response, sessão ou regra do
  backend muda.
- UI e rotas:
  - `ui/src/core/pwa/` passa a possuir o ciclo confiável de registro, verificação,
    ativação, espera segura, reload e erro;
  - `ui/src/core/components/pwa-update-notice/` deixa de apresentar nova versão no
    caminho normal e passa a existir somente como recuperação de falha, ou é
    removido se outro componente core expressar melhor esse único estado;
  - `ui/src/context/providers.tsx` preserva uma única composição global;
  - `ui/vite.config.ts` mantém `generateSW`, precache e modo técnico controlado;
  - os formulários, editores e contextos recuperáveis das rotas de planos globais
    e pessoais registram bloqueadores pela fronteira mínima do core;
  - atualizar `ui/docs/sdd/base/01-arquitetura.md` e
    `ui/docs/sdd/base/04-testes-e-qualidade.md`;
  - atualizar `ui/docs/sdd/routes/root.md` e `ui/docs/sdd/routes/dash.md` para
    remover o aviso normal e descrever atualização silenciosa/erro;
  - atualizar as rotas de planos globais e pessoais somente onde a integração com
    segurança de reload alterar comportamento observável de draft, pending ou
    recuperação.
- Fluxos: não exige novo fluxo ponta a ponta. Login e gestão de planos preservam
  sua ordem; atualizar os flows vigentes somente se a implementação introduzir
  comportamento observável de retomada ou proteção que não pertença exclusivamente
  à rota.
- Contratos em `@dall-fit/types`: não se aplica — registro, bloqueador e ciclo do
  worker são contratos internos do frontend.
- Decisões arquiteturais: não exige ADR transversal. A escolha é local, reversível
  e mantém as responsabilidades já atribuídas ao provider PWA, ao domínio dono do
  draft e ao Service Worker gerado.
- Handlers e fixtures MSW: nenhuma request HTTP de produto muda. Os handlers
  vigentes permanecem; a validação com Service Worker real usa ambiente isolado em
  que o worker do MSW não é registrado.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

### Descoberta de nova versão

1. O `PwaProvider` continua sendo o único proprietário do registro e usa
   `onRegisteredSW` para conservar em memória a URL do worker e o
   `ServiceWorkerRegistration` devolvido pelo navegador.
2. O registro inicial continua imediato em produção e preview. Se já existir um
   worker em espera ao montar o provider, o ciclo de atualização começa sem exibir
   `Nova versão disponível`.
3. Depois do registro, a UI verifica nova versão no máximo uma vez por hora. O
   intervalo só executa com documento visível, navegador online, registration
   disponível e nenhum worker já em estado `installing`.
4. Ao mudar de oculto para visível ou ao voltar a ficar online, a UI antecipa a
   verificação somente quando já tiver transcorrido uma hora desde a última
   tentativa. Foco, `visibilitychange`, `online` e timer compartilham o mesmo
   relógio e a mesma exclusão mútua; não criam fan-out de `registration.update()`.
5. Antes de `registration.update()`, a checagem segue a recomendação oficial para
   buscar a URL do Service Worker sem cache HTTP quando a API do navegador e a
   origem permitirem. Resposta não bem-sucedida, offline ou falha de rede encerra a
   tentativa silenciosamente e deixa uma próxima oportunidade elegível.
6. Listeners, timers, Promises em voo e referências de registration recebem
   cleanup no unmount. Remount não multiplica agendadores nem registros.
7. Desenvolvimento Vite e Playwright integrado continuam sem PWA. Nesse contexto,
   nenhum timer, fetch de `sw.js`, aviso ou erro de atualização é criado pelo stub
   do módulo virtual.

### Segurança de reload

8. Existe uma fronteira de core independente de domínio que responde se o
   documento pode ser recarregado sem perder trabalho recuperável. Ela permite
   registrar, atualizar e remover bloqueadores por ownership estável e limpa cada
   registro no unmount do proprietário.
9. São bloqueadores obrigatórios enquanto existirem:
   - qualquer mutation TanStack Query pendente;
   - formulário de criação ou edição com valor alterado ainda não confirmado;
   - erro de mutation cujo draft permanece recuperável no contexto;
   - debounce, autosave, fila ou operação estrutural aguardando ou executando;
   - upload, substituição ou remoção de imagem em andamento;
   - conflito de versão com trabalho local preservado;
   - item temporário, dirty patch ou edição inline não confirmada.
10. Query de leitura, overlay sem valor alterado, menu, Drawer, tema confirmado e
    estado puramente navegável não bloqueiam reload. Cada exceção futura precisa
    ser documentada pela rota proprietária.
11. O estado de `hasUnsavedWork` do editor de workout e sua proteção vigente de
    navegação alimentam a nova fronteira sem duplicar cálculos divergentes. Lista,
    detalhe, modais e formulários registram seus próprios drafts somente enquanto
    forem recuperáveis.
12. Uma versão pronta encontrada enquanto houver qualquer bloqueador permanece
    esperando silenciosamente. A UI não chama `SKIP_WAITING`, não dispara
    `beforeunload`, não fecha overlays e não altera draft, cache ou fila.
13. Quando o último bloqueador termina, a atualização pendente prossegue
    automaticamente se o documento estiver visível. Se estiver oculto, aguarda a
    próxima transição para visível.
14. Fechar ou recarregar o documento por decisão externa continua sujeito à
    proteção `beforeunload` já pertencente ao contexto recuperável. A atualização
    automática não contorna essa proteção.

### Ativação e reload confirmados

15. O modo técnico permanece `prompt`: um worker novo instala e espera até o
    coordenador concluir que o reload é seguro. `skipWaiting` não é habilitado de
    forma incondicional no evento de instalação.
16. O provider substitui o reload implícito do módulo virtual por ownership
    explícito. O callback `onNeedReload` não pode recarregar fora do coordenador,
    inclusive quando outro documento da mesma origem ativa uma versão.
17. Antes de solicitar a ativação, o coordenador captura o worker efetivamente em
    `registration.waiting` e instala listeners para seus estados e para a mudança
    de controle. Em seguida chama `updateServiceWorker()` sem atribuir semântica ao
    parâmetro booleano legado.
18. A resolução de `updateServiceWorker()` prova somente que o comando pôde ser
    enviado. Sucesso exige que o worker esperado alcance `activated` ou que a
    registration/controlador comprove que a mesma nova versão já assumiu por uma
    corrida externa.
19. Depois da ativação confirmada, o documento seguro executa exatamente um
    `window.location.reload()`. O reload ocorre no mesmo path, query e hash e não
    inventa navegação pelo TanStack Router.
20. Reentrância por timer, retomada, duas notificações `waiting`, dois providers
    em Strict Mode ou clique repetido de retry compartilha uma única Promise de
    ativação e produz no máximo um reload.
21. O ciclo possui timeout finito e trata `redundant`, ausência inesperada do
    waiting worker, falha de mensagem, falha de registration e rejeição do
    navegador. Ele nunca permanece em pending infinito nem declara sucesso apenas
    porque o comando foi enviado.
22. Uma aba controlada por atualização iniciada em outro documento também delega
    a decisão de reload à segurança local. Ela não perde draft por causa do callback
    automático interno do plugin. O risco residual de múltiplos clientes e limpeza
    de assets antigos é validado no cenário dedicado e documentado; a implementação
    não pode afirmar coordenação entre abas sem comprová-la no navegador.
23. Depois do reload, a versão nova serve `index.html` e chunks do mesmo precache.
    A aplicação não entra em loop mesmo quando registration e provider montarem
    novamente ou houver mais de uma aba na origem.

### Apresentação e recuperação

24. Uma atualização detectada, esperando segurança, ativando ou recarregando não
    mostra aviso, toast, modal, spinner global nem bloqueia a interface. A versão
    corrente permanece utilizável até o reload seguro.
25. Os textos normais `Nova versão disponível`, `Atualize para usar a versão mais
recente.`, `Atualizar agora` e `Agora não` deixam de ser apresentados como
    fluxo habitual em todas as rotas e modos de exibição.
26. Se a ativação automática falhar de forma terminal, um único aviso global
    acessível mostra `Não foi possível atualizar`, informa que a versão atual pode
    continuar sendo usada e oferece `Tentar novamente` e `Continuar`.
27. `Tentar novamente` repete uma única vez o ciclo a partir do estado real da
    registration, indica pending e desabilita ações concorrentes. Sucesso confirmado
    recarrega; nova falha preserva o aviso e reabilita a ação.
28. `Continuar` fecha apenas o erro do documento corrente. Não desregistra o worker,
    não apaga cache, não marca a versão como aceita e permite nova tentativa em uma
    verificação futura ou nova montagem.
29. Falha de registro mantém a aplicação como web app comum e continua usando o
    diagnóstico sanitizado vigente. Falha de checagem por offline ou indisponibilidade
    transitória não cria aviso de ativação, pois ainda não existe versão pronta que
    tenha falhado ao assumir.
30. Instalação e atualização permanecem independentes. `beforeinstallprompt`,
    `appinstalled`, orientação manual e detecção `standalone` continuam com o
    comportamento vigente, mas nenhum deles seleciona uma política diferente de
    update.

### Cache e fronteiras

31. O build continua usando `generateSW`, `cleanupOutdatedCaches`, fallback de
    navegação e precache somente do app shell, chunks, fontes e assets locais.
32. API, OAuth, pessoa, CSRF, eventos SSE, imagens remotas/privadas, signed URLs,
    mutations e `mockServiceWorker.js` continuam fora do cache e da verificação de
    versão.
33. `sw.js` e manifesto permanecem revalidáveis no deploy. A checagem periódica não
    adiciona query com dado de usuário, header sensível, cache persistente próprio
    ou request à API.
34. A aplicação não promete funcionamento completo offline. Se estiver offline,
    mantém o app shell atual e posterga descoberta/ativação até uma oportunidade
    online, sem reconstruir estado privado.

## Requisitos não funcionais

- Acessibilidade:
  - o caminho normal é silencioso e não move foco nem cria anúncio antes do reload;
  - o aviso de falha usa região viva polida, título, descrição e botões nomeados;
  - pending de retry impede duplicidade sem remover o controle ou depender de cor;
  - reload automático nunca é usado para contornar proteção de trabalho recuperável.
- Performance:
  - uma única registration, um timer de uma hora e uma checagem em voo por documento;
  - documento oculto ou offline não executa polling;
  - retomadas respeitam o mesmo intervalo e não baixam repetidamente o `sw.js`;
  - listeners e timers são removidos no cleanup e não crescem a cada update.
- Segurança e privacidade:
  - nenhum dado pessoal, draft, payload, token, URL assinada ou erro técnico entra
    em Service Worker, Cache Storage, Analytics, log ou chave de coordenação;
  - checagem usa somente a URL same-origin conhecida do Service Worker e cache
    HTTP desabilitado;
  - nenhum `console.*`, stack, URL completa, query ou conteúdo livre é transportado;
  - atualização não altera sessão, autorização, CSRF ou teardown.
- Observabilidade:
  - verificação e atualização silenciosas não fingem interação e não emitem
    `ui_operation_started`;
  - ativação automática falha emite no máximo um diagnóstico sanitizado
    `pwa_update`, sem objeto `Error` ou detalhe técnico;
  - `Tentar novamente` emite exatamente um início e um terminal `success|error` de
    `pwa_update`; sucesso só ocorre após ativação confirmada e antes do reload;
  - `Continuar` emite somente a decisão enumerada de dispensar o erro, sem terminal
    de sucesso e sem duplicar diagnóstico;
  - uma falha do transporte de Analytics é no-op e não interfere na atualização.
- Manutenibilidade:
  - core conhece somente registration, lifecycle e a interface de bloqueadores;
  - cada domínio calcula seu trabalho recuperável e registra o resultado sem mover
    regras de formulário, fila ou aggregate para o provider;
  - APIs do browser ficam encapsuladas e testáveis, sem mocks espalhados pelas rotas;
  - a solução não altera arquivos gerados em `node_modules` nem depende de timing
    implícito do plugin.

## Critérios de aceite

### Cenário 1 — Nova versão na abertura atualiza sem ação manual

- Forma de validar: ambiente isolado que serve dois builds consecutivos da UI em
  preview de produção com Chromium e Service Worker real; não há link único porque
  o estado depende de duas versões sob a mesma origem.
- Given: a versão A controla a origem e a versão B foi publicada.
- When: o documento abre ou monta o registro e encontra B em espera.
- Then: não exibe aviso normal, ativa B, confirma a ativação e recarrega uma vez.
- And: depois do reload, B controla o documento e nenhum F5, pull-to-refresh ou
  clique é necessário.

### Cenário 2 — PWA instalada usa a mesma atualização silenciosa

- Forma de validar: abrir em modo `standalone` no Chromium compatível, publicar dois
  builds consecutivos na mesma origem e conferir registration/controlador.
- Given: a PWA instalada executa A sem trabalho recuperável e B fica disponível.
- When: a PWA inicia ou retoma em uma oportunidade elegível.
- Then: B é aplicada com exatamente um reload e sem `Nova versão disponível`.
- And: o resultado não depende de puxar a tela para atualizar ou encerrar a PWA.

### Cenário 3 — Sessão longa descobre deploy sem reload manual

- Forma de validar: preview de produção com a UI aberta, publicação de um segundo
  build e relógio controlado no teste do provider; o ciclo real é confirmado no
  ambiente isolado.
- Given: o documento permanece aberto, visível e online por mais de uma hora.
- When: a checagem periódica executa depois da publicação.
- Then: chama a registration uma única vez, detecta a versão e inicia o ciclo
  silencioso.
- And: timers, foco e retomada concorrentes não duplicam check ou ativação.

### Cenário 4 — Retomada antecipa uma checagem vencida

- Forma de validar: teste do provider com `visibilitychange`, relógio controlado e
  registration real ou adapter fiel.
- Given: a aplicação ficou oculta por mais de uma hora e voltou online/visível.
- When: recebe a primeira retomada elegível.
- Then: verifica imediatamente sem aguardar o próximo tick do timer.
- And: retomadas dentro da mesma hora não repetem a request.

### Cenário 5 — Trabalho recuperável adia o reload

- Forma de validar:
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=version-conflict`
  para o estado do editor, combinado ao teste do provider com worker em espera;
  PWA permanece simulada no Vitest porque o Playwright MSW não registra Workbox.
- Given: existe draft, conflito, debounce, fila, upload ou mutation pendente quando
  uma versão nova fica pronta.
- When: o coordenador avalia a ativação.
- Then: não envia `SKIP_WAITING`, não recarrega e não altera o trabalho.
- And: a atualização permanece pendente sem mostrar o aviso normal.

### Cenário 6 — Fim do trabalho aplica atualização pendente

- Forma de validar: teste de integração entre registro de bloqueadores e provider,
  com ativação controlada do worker.
- Given: uma versão espera e um único bloqueador mantém o reload adiado.
- When: a operação termina ou o draft é confirmado/descartado e o documento está
  visível.
- Then: o último bloqueador é removido, a ativação começa uma única vez e o reload
  ocorre após confirmação.

### Cenário 7 — Resolução do comando não antecipa sucesso

- Forma de validar: teste do adapter em que `updateServiceWorker()` resolve, mas o
  worker permanece `waiting` até um evento posterior.
- Given: uma versão está pronta e o documento é seguro.
- When: o comando de update resolve antes da ativação.
- Then: o estado continua pendente e nenhum sucesso ou reload é produzido.
- And: somente `activated`/controle equivalente confirma o resultado.

### Cenário 8 — Falha de ativação oferece retry real

- Forma de validar: teste de componente/provider com worker que se torna
  `redundant`, rejeita ou ultrapassa o timeout finito.
- Given: uma versão pronta não consegue assumir.
- When: a tentativa automática termina em falha.
- Then: a versão atual continua utilizável e aparece `Não foi possível atualizar`
  com `Tentar novamente` e `Continuar`.
- And: nenhum detalhe técnico é exibido ou enviado.

### Cenário 9 — Retry bem-sucedido recarrega uma vez

- Forma de validar: teste de componente/provider que falha na primeira ativação e
  confirma a segunda.
- Given: o aviso de falha está visível.
- When: a pessoa ativa `Tentar novamente` e o worker seguinte alcança `activated`.
- Then: pending impede repetição, Analytics registra um início e um sucesso e o
  documento recarrega exatamente uma vez.

### Cenário 10 — Offline não cria falha enganosa

- Forma de validar: teste do agendador/provider com `navigator.onLine=false`.
- Given: a hora da checagem chegou, mas o navegador está offline.
- When: timer ou retomada avalia a registration.
- Then: não busca `sw.js`, não chama `registration.update()` e não mostra falha de
  ativação.
- And: uma retomada online futura pode verificar novamente.

### Cenário 11 — Duas abas não forçam reload sobre trabalho local

- Forma de validar: cenário isolado com dois contexts Chromium sob a mesma origem,
  A com bloqueador e B sem bloqueador, seguido da publicação de um segundo build.
- Given: uma aba possui trabalho recuperável e outra participa da atualização.
- When: o novo worker ativa ou muda o controlador das duas.
- Then: a aba bloqueada não executa reload automático pelo listener interno do
  plugin e preserva sua interface até ficar segura.
- And: a aba segura recarrega no máximo uma vez; o teste registra qualquer limite
  inevitável do lifecycle sem declarar coordenação não comprovada.

### Cenário 12 — Produção e Playwright mantêm workers separados

- Forma de validar: `pnpm test:integration` para MSW e ambiente isolado de preview
  para PWA real.
- Given: Playwright integrado inicia Vite com MSW habilitado.
- When: as rotas e flows executam.
- Then: Workbox, timer e checagem de PWA permanecem desabilitados nesse servidor.
- And: no preview de produção, MSW não registra e o ciclo real usa somente o worker
  gerado pela PWA.

## Estratégia de entrega e compatibilidade

1. Introduzir primeiro um adapter testável para registration, relógio de checagem,
   ativação confirmada e reload, preservando o plugin e o build vigentes.
2. Introduzir a fronteira mínima de bloqueadores e integrar TanStack mutations e
   os contextos recuperáveis existentes antes de habilitar reload automático.
3. Migrar o provider para conservar `onRegisteredSW`, assumir `onNeedReload`,
   agendar verificações e ocultar o aviso normal.
4. Converter o componente visual de update em recuperação exclusiva de falha e
   remover textos, estados, Analytics e testes que só pertenciam à confirmação
   normal.
5. Validar duas versões reais no mesmo host antes de considerar resolvido o bug
   que o mock atual não reproduz.
6. Atualizar documentação viva, catálogo de Analytics e testes na mesma entrega
   autorizada, sem editar as features históricas relacionadas.
7. A mudança não exige migração de dados, API, cache privado ou manifesto. Um
   rollback restaura o prompt anterior, mas também restaura o defeito conhecido e
   não é comportamento operacional desejado.
8. Se uma release oficial futura corrigir o bug upstream, a implementação ainda
   deve manter confirmação observável e testes reais; remover o adapter exige
   comprovar equivalência, não apenas atualizar a dependência.

## Plano de testes

- funções puras do relógio de uma hora, retomada vencida, visibilidade, online e
  deduplicação de checks;
- adapter de registration para `waiting`, `installing`, `activated`, `redundant`,
  ativação externa, timeout, ausência de registration e cleanup de listeners;
- provider comprovando que a resolução do comando não equivale a ativação, que o
  reload é único e que `onNeedReload` não escapa do coordenador;
- registro de bloqueadores para múltiplos owners, atualização idempotente, unmount,
  Strict Mode, mutation global e remoção do último bloqueador;
- integração dos bloqueadores com formulários, modais recuperáveis e ambos os
  editores de workout sem duplicar a regra de `hasUnsavedWork`;
- componente de falha para conteúdo, acessibilidade, pending, retry, continuar e
  repetição de erro;
- Analytics para ausência de eventos interativos no update silencioso, diagnóstico
  sanitizado único na falha automática e terminal confirmado do retry;
- build confirmando manifesto, precache, exclusões, registration manual e ausência
  de warnings Workbox;
- teste isolado em Chromium com dois builds de produção consecutivos e Service
  Worker real, cobrindo aba comum, modo instalado quando disponível, primeira
  atualização, worker já esperando e ausência de loop;
- teste isolado com dois clientes para o limite multiaba e preservação de bloqueio
  local;
- regressão Playwright vigente com MSW Browser e PWA desabilitada;
- verificação manual em Chrome desktop e Android/iOS disponíveis para abertura,
  retomada, atualização silenciosa, erro e ausência de F5/pull-to-refresh;
- revisão de `api/` e `ui/` para remover estados, controles, textos, helpers,
  imports, exports e componentes sem uso depois da retirada do prompt normal;
- quality gates após implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`;
  - comando da validação isolada de PWA que for documentado na implementação;
  - `pnpm -C api test:e2e` não é exigido enquanto endpoint, wiring, MongoDB e Redis
    permanecerem inalterados.

## Riscos e decisões

- `registerType: 'autoUpdate'` é menor, mas pode recarregar enquanto a pessoa
  preenche formulários ou edita exercícios. A decisão é manter espera controlada e
  automatizar somente quando a aplicação comprovar segurança.
- Diferenciar aba comum e `standalone` não corrige a causa e cria duas políticas
  para uma registration compartilhada pela mesma origem. A decisão é comportamento
  igual em todos os modos.
- O parâmetro booleano de `updateServiceWorker` não é usado pela versão instalada,
  e o reload do plugin depende de eventos com bug upstream conhecido. A decisão é
  tratar a função como envio de comando e observar activation/control de forma
  explícita.
- Verificar somente no mount deixa sessões longas desatualizadas; verificar a cada
  foco aumenta rede e pode acionar heurísticas do Workbox. Uma hora, documento
  visível, online e retomada vencida equilibram descoberta e custo.
- Ativar um worker enquanto outro bundle está executando pode misturar versões e
  invalidar chunks lazy. Por isso o reload sucede imediatamente à ativação apenas
  em documento seguro, e o cenário multiaba é obrigatório.
- Uma aba não conhece automaticamente drafts de outra. A implementação deve
  interceptar o reload local disparado pelo plugin e documentar honestamente o que
  o teste multiaba comprovar; ampliar para protocolo cross-tab ou Service Worker
  customizado exige voltar à especificação se for necessário para cumprir os
  critérios.
- Bloquear por toda query impediria updates por trabalho descartável. Bloqueiam
  somente mutations e intenção local recuperável; leituras podem ser refeitas após
  reload.
- Um bloqueador esquecido pode adiar indefinidamente uma versão. Ownership estável,
  cleanup no unmount e testes de Strict Mode reduzem o risco; nova montagem sem
  trabalho permite aplicar o worker já em espera.
- Uma checagem offline falhar não significa falha de uma versão pronta. O aviso é
  reservado à ativação terminal; indisponibilidade de descoberta permanece
  silenciosa e recuperável.
- Atualização assíncrona não garante primeira pintura no último build. O contrato
  garante descoberta e reload automáticos, não sincronização impossível antes da
  execução do código que registra o Service Worker.
- O Playwright integrado usa MSW e não pode validar Workbox no mesmo escopo. O bug
  exige uma validação isolada com build real; manter apenas o mock do hook repetiria
  a lacuna atual.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Atualização silenciosa igual em navegador e PWA instalada
- Descoberta no início, em retomada vencida e durante sessão longa visível
- Ativação e sucesso confirmados pelo lifecycle real, sem depender do booleano
  ignorado pelo plugin
- Nenhum F5, pull-to-refresh ou clique exigido no caminho normal
- Trabalho recuperável e mutations preservados antes do reload
- Falha de ativação acessível, não bloqueante e com retry real
- Precache e exclusão de API/dados privados preservados
- MSW e Workbox continuam separados por ambiente
- Analytics sanitizado sem fingir interação automática
- Validação isolada com dois builds reais aprovada
- SDDs vivos de arquitetura e rotas atualizados na implementação
- Código, controles, helpers e testes obsoletos removidos após inspeção
- Quality gates aplicáveis aprovados
