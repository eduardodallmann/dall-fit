# Feature Spec: Retomar a rota solicitada após o login

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0062`.
- Problema: acessar diretamente uma rota privada sem sessão leva à tela de login
  em `/`, mas o login Google sempre termina em `/dash`. A pessoa perde o endereço
  que pretendia abrir e precisa navegar novamente até ele.
- Resultado: abrir, por exemplo, `/training-plan` sem estar logado apresenta a
  entrada pública e, depois do login, abre automaticamente `/training-plan`.
  Paths dinâmicos, parâmetros válidos e fragmento da URL também são preservados.
  Sem destino pendente, o login continua terminando em `/dash`.
- Referências:
  - [arquitetura da UI](../../../ui/docs/sdd/base/01-arquitetura.md);
  - [rotas e comportamento](../../../ui/docs/sdd/base/02-rotas-e-comportamento.md);
  - [entrada pública](../../../ui/docs/sdd/routes/root.md);
  - [dashboard e shell](../../../ui/docs/sdd/routes/dash.md);
  - [fluxo de login Google](../flows/login-google.md);
  - [sessão revogável e CSRF](../adr/ADR-0004-sessao-revogavel-redis-e-csrf.md).
- Features relacionadas:
  - [FIT-0061](fit-0061-redirecionar-autenticado-raiz-dash.md), pelo probe da raiz
    e pelo bypass transitório após encerramento da sessão;
  - [FIT-0029](fit-0029-resiliencia-sessao-requests-pwa.md), pelo teardown,
    cancelamento e isolamento entre gerações de sessão;
  - [FIT-0001](fit-0001-login-google.md), pela jornada original de autenticação.

## Escopo

### Incluído

- Capturar a rota privada solicitada quando sua entrada é impedida por ausência
  de sessão, inclusive em acesso direto, recarga ou navegação interna efetiva.
- Preservar o destino na mesma aba durante a ida ao Google, o retorno à aplicação
  e recargas da entrada pública.
- Retomar o destino após confirmação da sessão, respeitando autorização,
  validação dos parâmetros e estados próprios da rota.
- Manter `/dash` como fallback e consumir o destino uma única vez.
- Tratar falha OAuth recuperável, armazenamento indisponível, destino inválido,
  concorrência de navegações e interação com logout.
- Atualizar testes e documentação viva afetada na implementação autorizada.

### Não incluído

- Mudar endpoints, redirect HTTP do callback, cookies, OAuth, PKCE, sessão Redis,
  CSRF ou contratos compartilhados.
- Recuperar formulários, drafts, uploads, mutations, posição de rolagem ou estado
  privado anterior. A retomada representa somente uma intenção de navegação.
- Criar retomada automática da tela já montada quando a sessão expira em segundo
  plano; esse teardown continua terminando em `/` conforme o contrato vigente.
- Compartilhar destinos entre dispositivos, origens ou abas independentes, ou
  introduzir OAuth em popup ou nova aba.
- Alterar layout, componentes visuais, permissões ou regras de negócio das telas.
- Iniciar login automaticamente sem acionar `Entrar com Google`.

## Projetos e documentação afetados

- API e endpoints: sem mudança. `GET /auth/google`, `GET /callback`,
  `GET /auth/me`, `GET /auth/csrf` e `POST /auth/logout` mantêm seus contratos;
  o callback continua redirecionando para `/dash`.
- UI e rotas: árvore manual em `ui/src/routes/routes.tsx`, probe da raiz e ciclo
  de sessão. Atualizar `ui/docs/sdd/routes/root.md` e
  `ui/docs/sdd/routes/dash.md`, além de entrada/retomada das rotas privadas em
  `ui/docs/sdd/routes/`: planos pessoais, planos globais, seus detalhes/workouts,
  treino, workout em execução e conclusão. Cada rota referencia a regra comum
  sem reproduzir sua implementação.
- Bases da UI: `01-arquitetura.md` e `02-rotas-e-comportamento.md`, documentando
  ownership, armazenamento temporário e navegação. Atualizar `05-mocks-de-api.md`
  e `07-testes-integrados-playwright.md` se a preparação OAuth simulada mudar.
- Fluxos: `docs/sdd/flows/login-google.md`, acrescentando a entrada por link
  privado e a retomada após a autenticação.
- Contratos em `@dall-fit/types`: não se aplica; metadado de navegação é exclusivo
  do frontend e não representa autenticação.
- Decisões arquiteturais: manter as decisões vigentes; esta solução local e
  reversível não exige novo ADR nem dependência.
- Handlers e fixtures MSW: autenticação em `ui/src/mocks/handlers/auth.ts`,
  fixtures de pessoa comum/admin e fixtures dos destinos. A simulação top-level
  existente no Vite continua chegando a `/dash`; o teste deve exercitar a retomada
  real da UI, sem redirecionar diretamente ao destino pelo mock.
- Mocks de repositories/caches da API e fixtures MongoDB/Redis: não se aplica.

## Requisitos funcionais

### Captura e duração do destino

1. Quando uma navegação efetiva a uma rota privada recebe `401` na proteção de
   entrada, capturar o destino daquela navegação antes de substituir a URL por
   `/`. A entrada pública deve permanecer estável, sem shell ou conteúdo privado.
2. Usar a localização da navegação que o guard está resolvendo, incluindo path,
   query e hash; não usar a URL de uma request Axios nem uma localização resolvida
   anterior. Preload por intenção, navegação abortada e resposta atrasada não
   criam, substituem ou consomem o destino.
3. Manter um único destino por aba. Uma nova tentativa efetiva bloqueada substitui
   a anterior; respostas concorrentes da tentativa antiga não podem restaurá-la.
   `/` e o `/dash` intermediário do retorno OAuth não sobrescrevem o destino.
4. Guardar somente o endereço relativo validado e metadados mínimos de validade
   em `sessionStorage`, sob `dall-fit:auth-return-to`. A validade é de 30 minutos
   desde a captura; recarga e nova tentativa de login não renovam esse prazo.
   O valor não contém pessoa, credencial, CSRF, dados de formulário ou cache.
5. A ida top-level ao Google e a recarga da entrada pública mantêm a intenção na
   mesma aba. Erro OAuth recuperável e nova tentativa de login preservam um
   destino ainda válido. Expirado, malformado ou incompatível é descartado.
6. Falha de leitura, gravação ou remoção do storage não interrompe login nem
   autenticação. Sem retenção confiável, abandonar a retomada e usar `/dash` após
   o login; não recorrer a cookie ou `localStorage`. Uma falha de remoção não pode
   disparar repetidamente o mesmo redirect no documento atual.

### Retomada e precedência da navegação

7. O botão de login continua navegando para `${VITE_API_URL}/auth/google` sem
   transportar o destino para a API, Google, `state`, `nonce` ou query de login.
8. Depois do retorno HTTP a `/dash`, a proteção confirma a pessoa por
   `GET /auth/me` e completa o bootstrap CSRF vigente. Com destino válido, a UI
   substitui a URL por ele antes de apresentar o dashboard como tela final.
   Sem destino, conclui normalmente em `/dash`.
9. Se o probe de `/` confirmar sessão válida e houver destino pendente, ele tem
   precedência sobre o dashboard. A entrada pública não é renderizada e a rota
   privada continua passando pela proteção e pelo bootstrap CSRF. Sem destino,
   permanece o comportamento da FIT-0061.
10. Validar e consumir a intenção uma única vez na decisão de retomada. Se o
    destino já corresponder à localização atual, apenas removê-lo e continuar.
    Navegações automáticas usam as APIs do TanStack Router com `replace: true`;
    não usar `window.history` nem criar reload adicional para a retomada.
11. Depois de consumido, acessar `/`, `/dash`, recarregar ou usar Voltar não
    reaplica o destino. A feature não remove entradas anteriores do Google do
    histórico; qualquer retorno posterior à aplicação volta a obedecer à sessão
    vigente, sem loop entre login, dashboard e destino.
12. A entrada autenticada explícita em outra rota privada prevalece sobre uma
    intenção antiga e a descarta. Uma falha técnica antes da decisão de retomada
    mantém a intenção válida disponível para o retry previsto pela rota.
13. Logout explícito descarta a intenção mesmo em falha remota e conserva o bypass
    transitório da raiz. Teardown por expiração de tela já montada ou troca de
    identidade também descarta uma intenção anterior. A captura da nova tentativa
    bloqueada deve ser coordenada com o teardown para não ser apagada pela própria
    transição que a envia ao login.

### Validação e autorização

14. Aceitar somente caminhos relativos à raiz da UI que correspondam a rotas
    privadas registradas. Rejeitar URLs absolutas, destinos `//host`, protocolos
    como `javascript:`, barras invertidas, caracteres de controle e codificações
    que permitam escapar da origem ou burlar o reconhecimento da rota. `/`,
    endpoints OAuth, arquivos estáticos e paths desconhecidos não são destinos.
15. Revalidar o valor ao lê-lo: storage não é fonte confiável. Preservar os
    parâmetros aceitos pelo contrato da rota e o fragmento, respeitando a
    canonicalização vigente; por exemplo, `page=2` permanece e página 1 é omitida.
    Parâmetros desconhecidos não ganham significado por estarem no destino.
16. O destino não confere privilégios. Após login, pessoa comum que tentou rota
    administrativa continua indo a `/dash` pelo guard de admin, sem logout e sem
    nova tentativa automática. A intenção já deve estar consumida nesse caminho.
17. Rota reconhecida com recurso excluído, inacessível ou sessão de treino já
    encerrada mantém seu tratamento atual de erro, vazio ou redirecionamento.
    Não repetir login ou operações de escrita para tentar reconstruir o recurso.
18. Timeout, falha de rede, `5xx` e falha técnica do CSRF não equivalem a ausência
    de sessão. Preservar os estados recuperáveis, retry e teardown já documentados.
19. Seletores `mock*` existem somente no ambiente de mocks e não são parâmetros
    funcionais de produção. A simulação deve representar a mudança real de
    anônimo para autenticado, evitando restaurar `mockAuth=unauthenticated` como
    uma ordem permanente de logout após o callback.

## Requisitos não funcionais

- Acessibilidade: manter estados de espera acessíveis, ação de login por teclado
  e feedback OAuth atual. Não apresentar conteúdo privado antes dos guards nem
  acrescentar confirmação ou controle para a retomada automática.
- Performance: reutilizar o QueryClient, a query de pessoa e o bootstrap CSRF
  single-flight. A passagem por `/dash` e o destino não devem duplicar
  imediatamente requests de autenticação já confirmadas e frescas.
- Segurança e privacidade: destino é navegação, nunca prova de sessão. Nenhuma
  credencial ou resposta privada entra no storage. IDs que compõem o path ficam
  restritos à intenção temporária; não transportar seu valor para telemetria.
- Observabilidade: não emitir login concluído ou interação humana por redirects
  automáticos. Preservar eventos vigentes e não acrescentar destino bruto, query,
  hash ou conteúdo do storage a logs, diagnósticos ou Analytics.
- Manutenibilidade: concentrar validação/persistência em uma responsabilidade
  pequena próxima à autenticação e coordenar a decisão no Router. Não duplicar
  lógica em cada tela nem criar provider, client ou sistema de sessão paralelo.

## Critérios de aceite

Os links abaixo usam a UI local em `http://localhost:3000`. Cenários reais exigem
sessão ausente antes da entrada e recursos acessíveis à conta usada. No Playwright,
usar o Vite isolado na porta `3100`, MSW Browser e fixtures determinísticas; a
transição OAuth fictícia deve mudar a sessão sem chamar a API real.

### Cenário 1 — Link privado seguido de login

- Forma de validar: `http://localhost:3000/training-plan`, inicialmente sem sessão.
- Given: a pessoa abre diretamente Meus planos sem estar logada.
- When: é enviada a `/` e conclui `Entrar com Google` na mesma aba.
- Then: termina em `/training-plan`, sem precisar navegar pelo menu e sem mostrar
  conteúdo privado antes da confirmação da sessão.

### Cenário 2 — Path dinâmico, query e fragmento

- Forma de validar: `http://localhost:3000/global/training-plan?page=2#planos` e
  `http://localhost:3000/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101`.
- Given: sessão ausente, fixture com pelo menos duas páginas e workout indicado,
  e login posterior como admin.
- When: conclui cada jornada separadamente.
- Then: retoma a segunda página com `#planos` ou o workout com os mesmos IDs,
  conforme a URL inicial; normalizações próprias da rota continuam valendo.

### Cenário 3 — Entrada habitual sem destino

- Forma de validar: `http://localhost:3000/`, sem intenção armazenada.
- Given: pessoa sem sessão inicia o login pela entrada pública.
- When: conclui a autenticação.
- Then: termina em `/dash`; acessar `/` com sessão já válida também leva a
  `/dash`, preservando a FIT-0061.

### Cenário 4 — Recarga e erro OAuth não perdem a intenção

- Forma de validar: `http://localhost:3000/training`, inicialmente sem sessão.
- Given: a proteção levou a pessoa para `/` com destino pendente válido.
- When: recarrega a entrada, recebe `authError=oauth_failed` em uma tentativa e
  depois conclui um novo login dentro da validade.
- Then: o alerta continua recuperável e o sucesso termina em `/training`.

### Cenário 5 — Sessão confirmada na entrada pública

- Forma de validar: `http://localhost:3000/`, com intenção válida para `/training`
  preparada pelo cenário e sessão confirmada pelo MSW.
- Given: o probe retorna pessoa autenticada.
- When: a raiz resolve sua navegação.
- Then: retoma `/training` sem exibir login e sem consultar novamente a pessoa
  imediatamente; CSRF continua sendo confirmado pela proteção privada.

### Cenário 6 — Permissão insuficiente ou recurso indisponível

- Forma de validar: `http://localhost:3000/global/training-plan` sem sessão,
  seguido de login como pessoa comum; para recurso ausente, usar o link dinâmico
  do cenário 2 com fixture que responda `404` após login como admin.
- Given: o destino é uma rota privada reconhecida.
- When: a pessoa autentica e a rota aplica suas regras.
- Then: falta de permissão administrativa termina em `/dash`; recurso ausente
  mostra o tratamento vigente da rota, sem repetir OAuth nem reaplicar o destino.

### Cenário 7 — Consumo único e logout

- Forma de validar: `http://localhost:3000/training-plan`, seguindo o cenário 1.
- Given: a retomada foi concluída.
- When: navega para `/dash` ou `/`, recarrega e depois faz logout e novo login.
- Then: o destino consumido não reaparece; o novo login sem tentativa privada
  posterior termina em `/dash`. Logout com falha remota também elimina a intenção
  e mantém a entrada pública estável no ciclo terminal.

### Cenário 8 — Valor inválido, expirado ou armazenamento bloqueado

- Forma de validar: `http://localhost:3000/dash`, com sessão válida e preparação
  controlada de storage pelo teste; falhas da API de storage usam Vitest.
- Given: destino malformado, expirado, externo, público ou desconhecido, ou falha
  de acesso ao armazenamento.
- When: a UI avalia a retomada.
- Then: permanece em `/dash`, não navega para fora da UI, não entra em loop e não
  impede o uso da sessão válida.

### Cenário 9 — Nova intenção, abas e respostas atrasadas

- Forma de validar: `http://localhost:3000/training-plan` e
  `http://localhost:3000/training`, em cenários Playwright com sessão ausente.
- Given: tentativas sucessivas na mesma aba ou tentativas em duas abas abertas
  independentemente, sem `opener`.
- When: a autenticação é concluída na aba correspondente.
- Then: na mesma aba prevalece a última tentativa efetiva; abas independentes
  preservam seus próprios destinos. Preload, cancelamento ou resposta atrasada da
  primeira tentativa não altera a decisão da segunda.

### Cenário 10 — Falhas técnicas e expiração durante o uso

- Forma de validar: `http://localhost:3000/dash?mockAuth=error`,
  `http://localhost:3000/dash?mockAuth=csrf-error` e
  `http://localhost:3000/dash?mockAuth=session-expired`, com MSW habilitado.
- Given: falha técnica de bootstrap ou sessão que expira depois de montar o shell.
- When: a UI recebe a resposta correspondente.
- Then: erros técnicos mantêm recuperação sem inventar ausência de sessão;
  expiração encerra os recursos privados uma vez e termina em `/`, sem criar
  intenção de retomar automaticamente a tela que já estava aberta.

## Estratégia de entrega e compatibilidade

1. Após autorização, introduzir validação e storage temporário e integrá-los ao
   guard privado, à decisão da raiz, à entrada em `/dash` e ao teardown.
2. Manter a API chegando a `/dash`. A retomada acontece no frontend depois da
   confirmação autenticada, preservando compatibilidade com o callback vigente.
3. Atualizar MSW e a preparação OAuth fictícia para testar navegação real entre
   documentos, inclusive sessão inicial ausente e login administrativo. Não criar
   atalhos em componentes nem substituir o client HTTP nos integrados.
4. Atualizar documentação viva, testes e inspeção de código sem uso na mesma
   implementação. Não alterar features históricas.
5. Não há migração de dados, alteração de infraestrutura, dependência nova ou
   mudança em contratos HTTP. Uma UI anterior ignora a chave temporária.

### Consulta às tecnologias

- Manifest, lockfile e instalação local confirmam `@tanstack/react-router`
  `1.170.18`, com `@tanstack/router-core` `1.171.15`. Os tipos locais de
  `beforeLoad` expõem `location`, `preload` e `abortController`; as opções de
  navegação/redirect suportam `href` e `replace`.
- O [guia oficial de rotas autenticadas](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)
  fundamenta a captura da localização recebida no guard. A decisão do projeto é
  manter a árvore manual e navegação pelas APIs do Router, com validação do destino;
  não copiar roteamento por arquivos nem manipulação direta de histórico dos
  exemplos externos.
- A [documentação de sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
  confirma persistência por origem e aba através de recargas e possíveis falhas
  de acesso. Abas abertas com `opener` podem começar com uma cópia do storage;
  não prometer isolamento da cópia inicial nem sincronização entre abas.

## Plano de testes

- Vitest: validação de destinos, origem, codificações perigosas, parâmetros,
  fragmento, validade, leitura/gravação/remoção falhas e consumo único.
- Vitest com Router e MSW: captura no `401`, ausência de efeitos em preload e
  navegação cancelada, concorrência, precedência da raiz, entrada em `/dash`,
  distinção de falha técnica e coordenação com teardown/bypass.
- Regressão de sessão: logout com sucesso/falha, expiração, troca de identidade,
  CSRF recuperável, permissão administrativa e ausência de dados privados antigos.
- Playwright em `ui/tests/integration/flows/login-google.spec.ts`: link privado
  até login e destino, path dinâmico, query/hash, reload, erro OAuth e retry,
  fallback, consumo único, logout e abas independentes.
- Specs de rota em `ui/tests/integration/routes/`: estados de `/`, `/dash` e
  destinos representativos; confirmar URL final, conteúdo e ausência de requests
  redundantes. A matriz combinatória de validação permanece no Vitest.
- Fixtures e estado de autenticação reiniciados por teste. Manter o redirect
  fictício para `/dash` para comprovar que o código de produção realiza a retomada.
- Consentimento Google real: verificação manual, pois exige conta e serviço
  externos; Playwright não acessa a API real nem substitui seus E2E.
- Na implementação, inspecionar `api/` e `ui/` para remover somente código que a
  alteração tornou sem uso e executar, pela raiz, `pnpm lint`, `pnpm test`,
  `pnpm test:coverage:ci`, `pnpm build` e `pnpm test:integration`.
- `pnpm -C api test:e2e` não se aplica: endpoint, wiring, MongoDB e Redis não mudam.
  Esta especificação isolada é `docs-only` e dispensa os gates de código.

## Riscos e decisões

- Memória do documento se perde durante OAuth. O storage da aba preserva somente
  a intenção mínima; o prazo de 30 minutos e a limpeza evitam retomadas antigas.
- O bypass da raiz impede bounce após teardown. A nova intenção precisa sobreviver
  ao redirecionamento que a originou sem transformar logout em retomada.
- `/dash` é tanto tela navegável quanto retorno do callback. Com intenção válida,
  funciona como entrada para retomada; sem intenção, mantém seu comportamento.
- O storage pode ser adulterado. Validação de URL e reexecução dos guards são
  obrigatórias, mesmo para um valor escrito originalmente pela própria UI.
- Preservar seletores de anonimato literalmente tornaria o mock incapaz de concluir
  o login. A simulação deve mudar a sessão e manter o destino funcional, sem
  introduzir comportamento de mock no caminho de produção.
- A retomada garante a tentativa de abrir a rota; disponibilidade do recurso e
  permissões da conta continuam decididas pelos contratos existentes.

## Condições esperadas da entrega

- Links privados retomados após login na mesma aba, com parâmetros válidos e hash.
- `/dash` preservado como fallback e destino consumido sem loops.
- Permissões, bootstrap, teardown, privacidade e estados recuperáveis preservados.
- Rotas, bases e fluxo afetados atualizados na implementação.
- MSW, Vitest e Playwright cobrindo regras e riscos observáveis.
- Revisão de código sem uso e quality gates aplicáveis aprovados.
