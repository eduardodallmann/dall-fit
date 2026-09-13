# Feature Spec: Preparar plano ativo e mídias para uso offline no Android

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [GitHub #83](https://github.com/eduardodallmann/dall-fit/issues/83).
- Problema: o Android já possui autenticação nativa e um motor único de SQLite e
  filesystem, mas a jornada Treinar ainda depende integralmente da API. Não existe
  um snapshot local automaticamente validado do plano ativo, as imagens privadas
  são acessíveis apenas por signed URLs curtas e o estado vigente do storage não
  distingue dados essenciais prontos de mídia ainda sendo preparada.
- Resultado: ao entrar na jornada Treinar no Android, a aplicação monta
  automaticamente o plano ativo a partir dos endpoints vigentes, persiste no motor
  nativo um snapshot válido por sete dias e baixa a variante `display` de cada
  imagem diretamente no código Android. Dados essenciais liberam a jornada sem
  depender das mídias; arquivos parciais nunca ficam prontos; e troca ou remoção do
  plano ativo substitui ou limpa imediatamente a réplica anterior.
- Referências:
  - [SDD transversal](../README.md);
  - [arquitetura do monorepo](../base/01-arquitetura-do-monorepo.md);
  - [workspace e qualidade](../base/02-workspace-e-qualidade.md);
  - [contratos compartilhados](../base/03-contratos-compartilhados.md);
  - [fontes oficiais das tecnologias](../base/05-documentacao-oficial-das-tecnologias.md);
  - [arquitetura da API](../../../api/docs/sdd/base/01-arquitetura.md);
  - [endpoints de treino](../../../api/docs/sdd/endpoints/training.md);
  - [endpoints de planos pessoais](../../../api/docs/sdd/endpoints/personal-training-plans.md);
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [componentes e estilização](../../../ui/docs/sdd/base/03-componentes-e-estilizacao.md);
  - [mocks de API](../../../ui/docs/sdd/base/05-mocks-de-api.md);
  - [rota Treinar](../../../ui/docs/sdd/routes/training.md);
  - [rota de planos pessoais](../../../ui/docs/sdd/routes/training-plan.md);
  - [fluxo de execução](../flows/execucao-de-treino.md);
  - [fluxo de planos pessoais](../flows/gestao-planos-treino-pessoais.md);
  - [ADR-0007 — Blob privado e URLs assinadas](../adr/ADR-0007-blob-privado-oidc-e-urls-assinadas.md);
  - [ADR-0012 — Capacitor Android](../adr/ADR-0012-capacitor-android-e-fronteira-de-plataforma.md);
  - [ADR-0014 — motor nativo de persistência](../adr/ADR-0014-motor-nativo-de-persistencia-offline.md);
  - [FIT-0081 — login e isolamento de conta](fit-0081-login-isolamento-conta-android.md);
  - [FIT-0082 — núcleo nativo de persistência](fit-0082-nucleo-nativo-persistencia-offline.md);
  - [código Android local no Capacitor](https://capacitorjs.com/docs/android/custom-code);
  - [`HttpURLConnection`](https://developer.android.com/reference/java/net/HttpURLConnection);
  - [arquivos privados específicos do aplicativo](https://developer.android.com/training/data-storage/app-specific).
- Features relacionadas: FIT-0081 fornece a sessão Bearer e o isolamento da conta;
  FIT-0082 fornece o plano opaco, as revisões e o lifecycle atômico dos arquivos.
  A issue 84 acrescentará lease e registro remoto da instalação, a issue 87 será
  proprietária do client HTTP nativo autenticado e a issue 89 consumirá o snapshot
  para executar o treino offline. Esta entrega prepara os dados e a mídia, mas não
  antecipa lease, sincronização de snapshots nem execução offline.

As versões vigentes confirmadas no repositório são Capacitor `8.5.2`, Axios
`1.18.1`, React `19.2.8` e HeroUI `3.2.2`. A solução reutiliza o plugin local e o
motor Android existentes. A documentação oficial do Capacitor preserva o plugin
local tipado como fronteira entre JavaScript e Java; a documentação Android
confirma `HttpURLConnection` para leitura direta do corpo e o diretório interno
específico do aplicativo para arquivos privados persistentes sem nova permissão.

## Escopo

### Incluído

- compor o snapshot sem criar endpoint dedicado: consultar `GET /training` e, para
  cada workout retornado, `GET /training/workouts/:workoutId`;
- aceitar deliberadamente uma montagem best-effort, sem exigir que todas as
  respostas pertençam à mesma versão do plano;
- acrescentar à visão geral do treino a janela emitida pelo servidor com
  `validatedAt` e `expiresAt`, sendo `expiresAt` exatamente sete dias depois;
- acrescentar às imagens das prévias de treino um `offlineMediaId` opaco, estável
  para o mesmo asset display e incapaz de conceder acesso ao Blob;
- montar um payload local versionado contendo a identificação do catálogo/plano,
  os workouts e todos os exercícios necessários à futura execução offline;
- excluir signed URLs do payload persistido e conservar para imagens somente a
  associação local necessária ao arquivo `display`;
- persistir os dados essenciais antes de iniciar as mídias e expor prontidão
  independente entre snapshot e downloads;
- estender o plugin local com um downloader Android que receba a signed URL apenas
  em memória, grave no `.part` controlado pelo motor e conclua por rename atômico;
- baixar somente a variante `display`; cards offline futuros reutilizarão esse
  mesmo arquivo, sem armazenar a variante `thumbnail`;
- validar status HTTP, tipo WebP, corpo não vazio e limite de tamanho antes de
  concluir um arquivo; falha ou interrupção mantém o item indisponível;
- limpar temporários, arquivos sem referência e mídias substituídas usando as
  primitives da FIT-0082;
- substituir o plano preparado quando a mesma seleção receber conteúdo novo,
  preservando snapshots de execuções já criados para seu plano anterior;
- ao trocar ou remover a seleção ativa, apagar imediatamente dados e imagens do
  plano preparado anterior e, quando houver nova seleção, preparar o novo plano;
- iniciar automaticamente a preparação normal ao entrar em `/training` no Android;
- manter troca de plano como gatilho excepcional imediato, mesmo fora da rota
  Treinar, conforme decisão já confirmada no ticket;
- não disparar preparação somente por autenticação, retorno ao foreground ou
  reconexão; uma falha normal é tentada novamente por nova entrada em Treinar ou
  pela ação explícita da tela bloqueante;
- coalescer chamadas concorrentes da mesma conta em uma única preparação em voo;
- expor à UI os estados `no-plan`, `preparing-data`,
  `data-ready-media-in-progress`, `ready`, `ready-media-incomplete`, `expired` e
  `failed`;
- apresentar no Android uma tela bloqueante dentro da rota `/training` somente
  enquanto não houver dados essenciais válidos; mídia pendente ou incompleta nunca
  mantém o bloqueio;
- oferecer retry explícito quando os dados essenciais não puderem ser preparados;
- manter as demais rotas autenticadas online acessíveis, inclusive a gestão usada
  para selecionar um plano;
- atualizar, na futura implementação, contratos compartilhados, endpoint e rotas
  vivos, flows, handlers/fixtures MSW, testes API/UI e documentação do motor nativo.

### Não incluído

- um endpoint agregado ou dedicado de preparação offline;
- garantia de consistência por uma única versão entre overview e previews;
- header, token, reinício de montagem ou retry para reparar mudança concorrente do
  plano durante a sequência de leituras;
- persistência de signed URL, delegation token, pathname do Blob, cookie, Bearer ou
  resposta HTTP integral;
- download de thumbnail, YouTube ou avatar;
- client HTTP nativo autenticado, leitura do Bearer pelo downloader, WorkManager,
  execução sem WebView ou preparação periódica;
- preparação disparada automaticamente por login, foreground ou conectividade;
- loop de retry, backoff exponencial ou retry automático de mídia;
- limite artificial de quantidade ou tamanho total do cache além das validações de
  cada arquivo e do armazenamento realmente disponível;
- execução offline, persistência de ações do treino, timers, snapshots de progresso,
  resumo provisório ou sincronização;
- lease Redis, registro/takeover de instalação ou mudança na política de sessão;
- IndexedDB, localStorage ou cache PWA de plano, mídia ou prontidão;
- suporte offline para Dashboard, gestão de planos, assistente, Web/PWA ou iOS;
- notificação, Analytics offline, foreground service, permissões novas ou release
  Android.

## Projetos e documentação afetados

- API e endpoints: os endpoints existentes `GET /training` e
  `GET /training/workouts/:workoutId` continuam sendo a composição pública. A visão
  geral passa a emitir a janela de validade offline e a prévia passa a identificar
  de forma opaca o asset display; a documentação viva de `training` detalhará os
  novos campos, a finalidade e o cenário reproduzível. Não há novo controller path
  nem persistência adicional no backend.
- UI e rotas: `/training` recebe o gate Android, estados de preparação e retry;
  `/training-plan` dispara limpeza/preparação após troca ou remoção do ativo. Web e
  PWA conservam o comportamento vigente. As referências visuais existentes da
  rota Treinar serão inspecionadas e validadas somente nos estados/viewports que
  representam; o novo gate será descrito textualmente sem criar screenshot não
  solicitado.
- Fluxos: `execucao-de-treino.md` incorporará a preparação anterior à seleção; o
  fluxo de planos pessoais registrará limpeza e preparação imediatas após mudar a
  seleção.
- Contratos em `@dall-fit/types`: incluir a janela de validade na visão geral e os
  contratos locais necessários à montagem sem promover tipos exclusivos da bridge
  Android ao pacote compartilhado.
- Decisões arquiteturais: ADR-0007 e ADR-0014 continuam vigentes. Não se espera nova
  ADR porque o downloader é um consumidor da fronteira e das primitives já
  decididas; descoberta de trade-off transversal diferente devolve a feature ao
  refinamento.
- Handlers e fixtures MSW: `training.ts` representará validade, montagem completa,
  falha em um preview, latência, ausência/troca de plano e URLs `display` fictícias.
  Os seletores continuam exclusivos do modo mock.
- Mocks de repositories/caches nos unitários da API: services do endpoint mantêm
  repositories mockados e passam a cobrir o cálculo da janela de sete dias.
- Fixtures MongoDB/Redis nos E2E: reutilizar o seed de plano pessoal ativo; nenhum
  schema ou store novo será criado. O E2E comprovará a resposta com datas emitidas
  pelo servidor.
- Android: estender o plugin/serviço offline e os testes instrumentados para download,
  arquivo parcial, falta de espaço, cancelamento, substituição e limpeza.

## Requisitos funcionais

1. A preparação é exclusiva do snapshot de plataforma `android` com
   `nativeOfflineStorage: true`. Web/PWA não registra coordenador, não chama o
   plugin e continua consumindo `/training` para a experiência online atual. A
   conta precisa estar autenticada e vinculada ao motor; quando a issue 84 entregar
   registro remoto da instalação, ele também será precondição do primeiro uso sem
   ser simulado por esta feature.
2. Uma entrada efetiva em `/training` consulta primeiro o estado canônico do motor.
   Snapshot ausente ou expirado ativa o gate; snapshot ainda válido permite que a
   rota prossiga, mesmo se a tentativa corrente de atualização falhar.
3. O gate ocupa somente o conteúdo da rota Treinar dentro do shell autenticado.
   Menu, logout e demais rotas continuam utilizáveis; ele não impede a pessoa sem
   plano de navegar para `/training-plan`.
4. A preparação consulta `GET /training` pelo Axios central com o Bearer vigente.
   Plano nulo remove de forma idempotente o plano preparado e suas mídias e produz
   `no-plan`, mantendo o empty state atual em vez de um erro de preparação. Nesse
   caso, a response traz `offlineValidity: null`.
5. Para cada workout do overview, o coordenador consulta o preview pelo endpoint
   existente. Somente depois que todas as leituras essenciais terminam com sucesso
   ele monta e persiste o plano completo.
6. A composição não compara versão entre as respostas. Inclusão, remoção ou edição
   concorrente pode produzir um snapshot best-effort com partes observadas em
   instantes diferentes; esse risco foi aceito no refinamento e não é convertido
   em erro ou nova tentativa silenciosa.
7. O overview informa `validatedAt` calculado pelo relógio da API e `expiresAt`
   exatamente sete dias depois. Ambos são ISO 8601 com timezone e entram no
   envelope normalizado do plano; a UI não recalcula a validade a partir do relógio
   do dispositivo.
8. A validade é verificada quando a pessoa tenta entrar na jornada Treinar. O
   vencimento impede iniciar um novo treino offline, mas não interromperá uma
   execução já iniciada; a execução em andamento pertence à issue 89 e permanece
   independente da linha do plano preparado, como definido pela FIT-0082.
9. O payload local possui versão explícita e contém apenas dados necessários ao
   treino: identidade técnica do catálogo e plano, nome/source, workouts ordenados,
   exercícios ordenados e seus campos de domínio. Indicadores de histórico e
   últimas cargas podem compor a preparação quando necessários à experiência, mas
   não transformam o motor em proprietário dessas regras.
10. Signed URLs, sua expiração e parâmetros não entram no payload. Para exercício
    de imagem, a prévia informa um `offlineMediaId` estável e sem capacidade de
    acesso, e o snapshot registra somente o `fileId` local derivado desse valor. A
    disponibilidade é derivada separadamente dos metadados de arquivo do motor;
    ausência do arquivo é um estado válido com fallback.
11. Depois de persistir os dados essenciais, o estado passa imediatamente para
    `data-ready-media-in-progress`, o gate é removido e os downloads começam. Nenhuma
    quantidade de imagens pendentes impede escolher ou iniciar um treino futuro.
12. O coordenador TypeScript usa o Axios somente para os endpoints da API. Para
    cada imagem, entrega ao plugin a signed `displayUrl`, o `fileId` derivado do
    identificador opaco, o plano, o tipo esperado e a revisão; URL e metadados
    transitórios permanecem apenas na memória da chamada.
13. O downloader Java usa HTTPS direto para a capacidade privada temporária, com
    timeouts finitos, sem cookie e sem Bearer da API. Redirect automático fica
    desabilitado; no máximo três redirects explícitos são aceitos quando todos os
    destinos permanecem HTTPS. Status fora de `2xx`, conteúdo não WebP, corpo
    vazio, excesso do limite por arquivo ou I/O interrompem a conclusão.
14. O limite individual permanece alinhado ao máximo de 10 MiB aceito pela origem
    da imagem. Não existe quota total própria: a gravação tenta usar o espaço real
    do diretório interno e classifica `ENOSPC`/falha equivalente como mídia
    incompleta, sem apagar o snapshot essencial.
15. O plugin registra o arquivo temporário pelo motor, escreve apenas no `.part`
    interno, fecha e sincroniza o stream e chama a conclusão existente. Somente o
    rename bem-sucedido e a atualização de metadado tornam o arquivo `ready`.
16. Cancelamento, morte do processo, signed URL expirada, desconexão, falta de
    espaço ou resposta parcial nunca substituem um arquivo pronto por bytes
    incompletos. Temporários são removidos pela recuperação da próxima inicialização
    ou tentativa segura.
17. Downloads podem usar concorrência pequena e fixa, no máximo quatro arquivos,
    fora da thread principal. Existe uma única preparação lógica em voo por conta;
    entradas concorrentes observam a mesma Promise e não iniciam outra sequência.
18. Quando todas as imagens existentes no plano estão prontas, o estado é `ready`.
    Quando uma ou mais falham, o estado terminal é `ready-media-incomplete`; quando
    ainda existem downloads ativos, é `data-ready-media-in-progress`. Plano sem
    imagens chega diretamente a `ready`.
19. O plugin expõe leitura suficiente dos metadados do plano e dos arquivos para
    reconstruir esses estados após reinício ou evento perdido. A coluna de validade
    já existente é devolvida pela bridge; não há migration ou nova tabela.
20. Não há retry automático de mídia na mesma execução. Nova entrada em Treinar ou
    retry explícito motivado por falha dos dados executa uma preparação nova e pode
    baixar novamente os arquivos ausentes; arquivos prontos ainda correspondentes
    ao mesmo `offlineMediaId` podem ser reutilizados.
21. Falha antes do commit dos dados preserva o snapshot anterior se ele existir e
    ainda estiver válido. Sem snapshot válido, o estado é `failed`, o gate explica
    que conexão é necessária e oferece `Tentar novamente` e acesso a `Meus planos`.
22. A troca bem-sucedida de seleção ativa é exceção ao gatilho por entrada. A UI
    invalida o domínio online como hoje, remove imediatamente plano/mídias antigos
    e inicia a preparação do novo plano ainda no fluxo da mutation; a conclusão da
    seleção não é revertida caso a preparação falhe.
23. Como os dados antigos são apagados antes da nova preparação, falha após a troca
    deixa o novo plano sem snapshot válido e ele será bloqueado ao entrar em Treinar.
    A UI não restaura o plano local anterior, que deixou de ser a seleção canônica.
24. Excluir ou desvincular a entrada ativa limpa imediatamente plano e mídias. Uma
    mutation de edição do plano ativo não dispara preparação por si só; a próxima
    entrada em Treinar obtém a representação atual e a substitui.
25. Substituir o plano preparado não remove sessão ativa nem snapshots de execução
    cujo `planId` pertence à versão anterior. A edição vale somente para treinos
    futuros; a limpeza alcança apenas o plano preparado e arquivos vinculados a ele
    que nenhuma execução preservada consome.
26. A revisão esperada da FIT-0082 protege substituição, conclusão e remoção. Uma
    resposta ou download atrasado não pode publicar arquivo no plano que já foi
    trocado, removido ou atualizado por uma preparação mais nova.
27. `stateChanged` continua best-effort. O coordenador e a rota reparam evento
    perdido por `getState` e leitura do plano; prontidão nunca depende de replay.
28. Falha de sessão (`401`) encerra a geração pela política existente. Snapshot e
    mídias permanecem vinculados à pessoa para reautenticação da mesma conta; outra
    conta exige a limpeza atômica já definida pelas FIT-0081 e FIT-0082.
29. A preparação e os downloads usam qualquer conexão disponível, inclusive dados
    móveis, sem preferência ou bloqueio por Wi-Fi. O produto não consulta plano de
    dados nem cria permissão adicional de rede.
30. Esta entrega não lê o snapshot para renderizar ou executar treino sem rede.
    Depois que o gate de preparação termina, a rota conserva seu repository online;
    o consumo nativo e o fluxo completo em modo avião pertencem à issue 89.
31. Erros e diagnósticos usam categorias enumeradas e resumos: etapa, contagens,
    estado e classe segura. URL, query, plano, workout, exercício, pessoa, token,
    pathname e corpo nunca são registrados nem enviados ao Analytics.

## Requisitos não funcionais

- Acessibilidade:
  - a tela bloqueante possui heading, descrição do estado, região de status e ação
    de retry nomeada; loading não depende apenas de animação;
  - falha move o foco para o alerta ou heading apropriado sem prender o usuário no
    shell, e `Tentar novamente` informa seu pending e impede duplicidade;
  - `Ir para Meus planos` permanece um link real; mídia incompleta não cria diálogo
    nem bloqueio.
- Performance:
  - previews podem ser consultados com concorrência limitada, sem exceder quatro
    requests simultâneas; downloads usam o mesmo teto independente no executor
    nativo;
  - payload e URLs não são duplicados em storage React; respostas deixam de ser
    retidas assim que o plano e as chamadas nativas forem preparados;
  - arquivos prontos correspondentes são reutilizados e o motor remove órfãos,
    evitando download e armazenamento desnecessários.
- Segurança e privacidade:
  - signed URL é capacidade bearer transitória, usada somente para `GET` HTTPS e
    nunca persistida, registrada, enviada ao Analytics ou devolvida por estado;
  - `offlineMediaId` não contém pathname, query ou credencial, não permite montar
    URL e não substitui a autorização da API;
  - plano e imagens permanecem no sandbox interno e excluídos de backup/transferência;
  - nenhuma permissão de storage, URI compartilhável ou servidor cleartext entra;
  - downloader não recebe cookie, Bearer, UUID nem acesso genérico ao Blob.
- Observabilidade:
  - API segue a política completa de logs sanitizados para os métodos alterados;
  - Android registra apenas categoria enumerada, fase e contagens, sem URL, IDs,
    payload, path ou stack persistida;
  - sucesso normal e falha de mídia não geram toast nem Analytics offline.
- Resiliência: dados essenciais e arquivos possuem commits independentes. Queda de
  mídia nunca rebaixa `data-ready`; queda antes do plano mantém o snapshot válido
  anterior ou o gate recuperável.
- Compatibilidade: campos HTTP novos são coordenados entre API, tipos, UI, MSW e
  testes. Web/PWA ignora a preparação e conserva a jornada online.
- Limite de execução: a implementação deve caber em uma sessão de até cinco horas.
  Para isso reutiliza dois endpoints, o Axios, o plugin e as primitives existentes;
  não cria endpoint agregado, versão coerente, client HTTP autenticado nativo,
  thumbnail offline, WorkManager ou execução de treino.

## Critérios de aceite

### Cenário 1 — primeira entrada prepara dados essenciais

- Forma de validar: Vitest da rota/coordenador com plataforma Android injetada e
  smoke no APK debug; um link Web não reproduz a capability nativa.
- Given: a conta está vinculada, há plano ativo e nenhum plano local válido.
- When: a pessoa entra em Treinar.
- Then: a rota mostra o gate, consulta overview e previews, persiste o snapshot com
  validade de sete dias e libera a seleção antes do término das mídias.

### Cenário 2 — montagem best-effort não exige versão comum

- Forma de validar: Vitest do coordenador com previews representando alterações
  intermediárias e handler MSW determinístico.
- Given: o plano muda enquanto os previews são consultados.
- When: todas as respostas essenciais terminam com sucesso.
- Then: o cliente persiste exatamente a composição recebida, sem comparar versão,
  reiniciar ou chamar endpoint agregado.

### Cenário 3 — mídia continua depois que os dados ficam prontos

- Forma de validar: Vitest de componente com downloader injetado e teste Android
  instrumentado do downloader.
- Given: o snapshot foi persistido e ainda há imagens `display` pendentes.
- When: a rota observa `data-ready-media-in-progress`.
- Then: o gate desaparece, a jornada fica disponível e a conclusão dos arquivos
  atualiza o estado sem bloquear interação.

### Cenário 4 — download parcial nunca publica imagem

- Forma de validar: teste Android instrumentado com servidor HTTP local que encerra
  o corpo antes do total esperado.
- Given: existe um `.part` registrado e nenhuma versão pronta da mídia.
- When: a conexão termina parcialmente ou o processo é interrompido.
- Then: o arquivo não se torna `ready`, o snapshot continua válido e a recuperação
  remove o temporário.

### Cenário 5 — armazenamento insuficiente não bloqueia treino

- Forma de validar: teste Android com falha de escrita equivalente a falta de espaço
  e Vitest do mapeamento de prontidão.
- Given: os dados essenciais estão confirmados e uma imagem começa a ser baixada.
- When: o filesystem rejeita a gravação por espaço insuficiente.
- Then: o plano permanece pronto, a mídia termina em
  `ready-media-incomplete` e não existe quota artificial nem limpeza do snapshot.

### Cenário 6 — somente display é persistido

- Forma de validar: teste do coordenador e inspeção dos metadados Android.
- Given: cada imagem da API contém `thumbnailUrl` e `displayUrl`.
- When: a preparação de mídia é construída.
- Then: somente `displayUrl` é entregue ao downloader e há um arquivo local por
  exercício; thumbnail e signed URL não entram no banco.

### Cenário 7 — troca ativa limpa antes de preparar o novo plano

- Forma de validar: Vitest da rota `/training-plan`, da ordem dos efeitos e teste
  Android instrumentado de limpeza.
- Given: o plano A está preparado com imagens e a pessoa ativa o plano B.
- When: `PUT /training-plans/active` confirma B.
- Then: dados e arquivos de A ficam imediatamente inacessíveis, B começa a ser
  preparado mesmo fora de `/training` e somente B pode tornar-se o plano preparado.

### Cenário 8 — falha após troca não restaura o plano anterior

- Forma de validar: Vitest/MSW com sucesso da ativação e falha no primeiro preview.
- Given: A foi removido e B tornou-se a seleção canônica.
- When: a preparação de B falha.
- Then: a mutation permanece bem-sucedida, A não volta ao storage e a entrada em
  Treinar mostra o gate recuperável para B.

### Cenário 9 — atualização preserva execução antiga

- Forma de validar: teste Android instrumentado das linhas independentes do motor.
- Given: existe uma sessão ou snapshot de execução baseado no plano A preparado.
- When: a preparação substitui A por conteúdo novo ou por outro plano ativo.
- Then: o plano e suas mídias deixam de servir a novos treinos, mas a execução
  conserva seu snapshot e pode terminar depois da troca ou do vencimento.

### Cenário 10 — snapshot válido tolera falha de atualização

- Forma de validar: Vitest com plano local ainda válido e API indisponível.
- Given: o snapshot expira no futuro.
- When: uma nova entrada em Treinar tenta atualizá-lo e a rede falha.
- Then: a falha não invalida nem estende o snapshot e não inicia loop de retry; a
  rota ainda pode apresentar seu erro online porque o consumo local pertence à
  issue 89.

### Cenário 11 — snapshot expirado bloqueia somente Treinar

- Forma de validar: Vitest da rota com plataforma Android/storage injetados e smoke
  no APK debug; não se aplica link Web porque expiração nativa não é selecionada por
  query de produção.
- Given: o plano local venceu e a API está indisponível.
- When: a pessoa abre Treinar.
- Then: aparece a tela bloqueante com retry e link para Meus planos; menu, logout e
  navegação para outras rotas online continuam operáveis.

### Cenário 12 — Web/PWA permanece online e sem réplica privada

- Forma de validar: `http://localhost:3000/training?mockAuth=person&mockTraining=active-plan`,
  Vitest da seleção de plataforma e `pnpm build`.
- Given: a aplicação executa no navegador.
- When: a pessoa entra em Treinar ou ativa um plano.
- Then: nenhuma bridge, SQLite ou preparação é chamada e a UI segue usando a API
  sem persistir plano, imagens ou validade no storage Web.

## Estratégia de entrega e compatibilidade

1. Estender a visão geral e `@dall-fit/types` com a janela de validação emitida
   pela API, atualizando DTOs, service, documentação, seed/cURL, MSW e E2E.
2. Definir o payload local v1 e o contrato de prontidão dentro da UI/Android,
   mantendo signed URLs fora do agregado.
3. Implementar o coordenador TypeScript que compõe overview e previews, coalesce a
   preparação e grava o plano pelas primitives da FIT-0082.
4. Implementar o downloader Java no serviço existente, com timeouts, validação,
   `.part`, conclusão atômica e códigos sanitizados.
5. Integrar gatilho de entrada/gate/retry em `/training` e limpeza/preparação após
   mutations de seleção na rota pessoal, preservando o branch Web.
6. Cobrir falhas, concorrência, expiração, troca, mídia parcial e falta de espaço;
   atualizar SDDs vivos e executar gates web, API, Playwright e Android.

O campo de validade é uma ampliação coordenada do contrato existente. Consumidores
Web podem ignorá-lo, enquanto API, tipos e mocks avançam atomicamente. Não existe
migração de dados Android: o schema v1 da FIT-0082 já oferece o plano opaco e
metadados necessários. Um plano antigo sem o payload desta feature é tratado como
ausente e preparado novamente.

Rollback do código deixa arquivos inacessíveis ao consumidor, mas não promove
signed URLs persistidas porque elas nunca são gravadas. Antes de release, dados de
desenvolvimento podem ser limpos. Depois de distribuída uma evolução de payload,
compatibilidade ou descarte seguirá as migrations da issue 92, sem editar esta
feature histórica.

## Plano de testes

- API unitária:
  - relógio controlado produz `validatedAt` e `expiresAt` separados por sete dias;
  - overview sem plano devolve `offlineValidity: null`;
  - logs não contêm payload, pessoa nem URLs.
- API E2E:
  - cookie Web e Bearer nativo recebem o contrato novo;
  - cenário com plano ativo fornece IDs usados pelos previews e datas ISO válidas;
  - erros e headers vigentes permanecem compatíveis.
- Vitest da UI:
  - gate apenas Android e apenas sem snapshot válido;
  - composição de zero, um e vários workouts, inclusive alteração intermediária
    aceita sem comparação de versão;
  - coalescência de entradas concorrentes e descarte de callback após troca de
    geração/conta;
  - commit dos dados antes das mídias e transições completas de prontidão;
  - snapshot válido preservado em falha, expirado bloqueante e plano nulo;
  - uso exclusivo de `displayUrl`, ausência de URL no payload e classificação de
    mídia incompleta;
  - troca/remoção ativa limpa imediatamente e edição comum aguarda próxima entrada;
  - Web/PWA não chama bridge ou storage nativo.
- MSW e Playwright:
  - MSW fornece montagem, latência, falhas e signed URLs fictícias aos testes
    Vitest do ramo Android;
  - Playwright cobre a regressão da jornada Web, os estados online vigentes e a
    ausência de seletor nativo/mock em produção;
  - gate, expiração, gatilho de troca e mídia atrasada ficam em Vitest com ports
    injetadas e no smoke Android, sem simular Android por query do navegador.
- Android instrumentado:
  - `2xx` WebP completo é escrito em `.part`, fechado, sincronizado e promovido;
  - body parcial, vazio, tipo/status inválido, timeout, redirect inseguro e signed
    URL expirada não publicam arquivo;
  - falta de espaço preserva plano e arquivos prontos;
  - no máximo quatro downloads, cancelamento e morte/reentrada não deixam órfão
    disponível;
  - revisão tardia não publica mídia após troca de plano;
  - remoção limpa arquivos do plano sem remover sessão/snapshot de execução antiga;
  - URL, IDs, path e payload não aparecem no diagnóstico.
- Validação manual Android:
  - primeira entrada online, bloqueio curto e liberação antes das imagens;
  - modo avião com snapshot válido não ativa o gate de validade, embora a rota ainda
    dependa da API; snapshot expirado ativa o gate;
  - troca de plano em dados móveis, falta de espaço e morte do processo durante
    download;
  - inspeção do banco/filesystem confirma somente `.data` completos, ausência de
    signed URL e somente variantes display;
  - confirmar layout mobile/desktop do gate e ausência de dados sensíveis no Logcat.
- Quality gates da implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm -C api test:e2e`;
  - `pnpm test:integration`;
  - `pnpm android:sync`;
  - `pnpm android:build:debug`;
  - `pnpm android:test` em emulador ou dispositivo API 29+.

## Riscos e decisões

- Foi escolhida a composição dos endpoints atuais em vez de um endpoint agregado.
  Isso reduz backend novo, mas cria N+1 leituras e aceita explicitamente um snapshot
  montado durante mudanças concorrentes do plano.
- Não existe checagem de versão comum nem reinício da composição. Essa é uma
  decisão de produto aprovada, não uma lacuna a ser corrigida silenciosamente na
  implementação.
- Somente a variante display é armazenada. Isso reduz downloads e código, mas cards
  offline futuros decodificarão uma imagem maior do que a thumbnail online.
- Axios permanece proprietário das requests autenticadas à API; Java recebe somente
  a signed URL de leitura e baixa os bytes. O client HTTP nativo com Bearer continua
  reservado à issue 87.
- Um identificador opaco estável da mídia é necessário para reconhecer arquivo
  reutilizável sem persistir ou interpretar a signed URL. Ele não expõe pathname nem
  concede leitura; a capacidade continua sendo exclusivamente a URL temporária.
- A tela bloqueante está restrita a Treinar. Torná-la global impediria a pessoa sem
  plano de acessar a gestão necessária para criar ou selecionar um.
- Entrada em Treinar é o gatilho normal. Login, foreground e reconexão não geram
  trabalho por conta própria; isso economiza rede/bateria, mas uma réplica não será
  renovada até nova entrada na jornada.
- Troca de plano permanece gatilho imediato porque a issue exige apagar o anterior
  e preparar o novo. Falha não pode restaurar conteúdo que deixou de ser a seleção
  canônica.
- Dados ficam prontos antes da mídia. A experiência aceita fallback de imagem para
  garantir que espaço, URL expirada ou conexão parcial nunca impeçam o treino.
- O prazo usa relógio do servidor para não depender da configuração do aparelho. A
  validação ocorre no início; uma execução futura conservará seu snapshot depois
  do prazo, conforme a separação já preparada na FIT-0082.
- A sequência completa de primeiro uso continuará exigindo registro remoto da
  instalação quando a issue 84 existir. Esta feature falha fechada sem sessão/conta
  local e não inventa antecipadamente lease ou registro no backend.
- O limite por arquivo protege memória e armazenamento sem criar quota total. O
  diretório interno pode esgotar; esse caminho termina como mídia incompleta e é
  coberto por teste.
- O escopo permanece compatível com o limite de cinco horas por reutilizar endpoint,
  contracts, Axios, plugin, storage e tela existentes. Se a implementação exigir
  client autenticado Java, endpoint agregado, migration de schema ou execução
  offline, deve parar e retornar ao refinamento.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Plano ativo preparado automaticamente sem gesto de download
- Snapshot essencial válido por sete dias e independente das mídias
- Composição pelos endpoints atuais sem garantia de versão única
- Somente imagens display completas publicadas no filesystem privado
- Signed URLs ausentes de persistência, logs e Analytics
- Troca ativa limpa o anterior e inicia imediatamente o novo plano
- Execuções antigas preservadas diante de atualização, troca ou expiração
- Gate acessível restrito à jornada Treinar
- Web/PWA e demais rotas online preservados
- Contratos, endpoints, rotas e flows afetados atualizados
- MSW, mocks unitários e E2E atualizados conforme o impacto
- Revisão de código sem uso concluída em API e UI
- Quality gates web, API, Playwright e Android aplicáveis aprovados
