# Feature Spec: Bloqueio do zoom por pinça

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0033`](https://github.com/eduardodallmann/dall-fit/issues/33).
- Problema: em dispositivos móveis, o gesto de pinça permite ampliar a interface
  inteira, embora essa ampliação não faça parte da experiência de aplicação
  desejada.
- Resultado: o documento da UI impede o zoom por pinça e os demais gestos nativos,
  incluindo rolagem e interação com controles, permanecem disponíveis.
- Referências:
  - `ui/index.html`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/02-rotas-e-comportamento.md`;
  - `ui/docs/sdd/base/04-testes-e-qualidade.md`;
  - `docs/sdd/features/fit-0011-instalacao-pwa.md`.
- Features relacionadas:
  - `FIT-0011` — estabeleceu a experiência de PWA instalada e responsiva;
  - `FIT-0021` — preserva a composição responsiva do aviso de atualização sem
    depender de zoom.

## Escopo

### Incluído

- configurar a viewport global em `ui/index.html` para manter a escala máxima em
  `1` e desabilitar a ampliação manual;
- aplicar a política a todas as rotas web e ao modo PWA `standalone`, pois todas
  compartilham o mesmo documento HTML;
- validar em navegador móvel que a pinça não amplie o documento e que a interação
  móvel existente continue disponível;
- registrar a política global de viewport no SDD vivo da arquitetura da UI durante a
  implementação.

### Não incluído

- bloquear rolagem, toques, clique, foco, teclado, menu móvel, drag ou seleção de
  texto;
- alterar breakpoints, layouts, fontes, componentes, rotas, navegação ou conteúdo;
- interceptar eventos de toque, gesto ou ponteiro com JavaScript;
- criar dependências, componentes, endpoints, contratos compartilhados, handlers
  MSW, fixtures ou mocks;
- alterar o comportamento de zoom do navegador em desktop;
- alterar configurações de acessibilidade do sistema operacional, tamanho de fonte
  do sistema ou recursos assistivos fora do controle do documento.

## Projetos e documentação afetados

- API e endpoints: não se aplica — a mudança é exclusiva do documento da UI e não
  altera tráfego HTTP.
- UI e rotas:
  - `ui/index.html` recebe a configuração global de viewport;
  - `ui/docs/sdd/base/01-arquitetura.md` passa a documentar a política do documento;
  - documentos individuais em `ui/docs/sdd/routes/` não duplicam a regra global,
    pois não há comportamento proprietário de rota.
- Fluxos: não se aplica — nenhuma etapa, navegação ou dado muda.
- Contratos em `@dall-fit/types`: não se aplica.
- Decisões arquiteturais: não exige ADR; é uma configuração local, reversível e sem
  dependência nova.
- Handlers e fixtures MSW: não se aplica.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

1. O elemento `meta[name="viewport"]` do documento da UI deve conservar
   `width=device-width` e `initial-scale=1.0`.
2. A mesma configuração deve solicitar `maximum-scale=1.0` e `user-scalable=no`,
   sem tentar substituir a decisão de um navegador que preserve zoom por política de
   acessibilidade.
3. Em navegador móvel que respeita a configuração de viewport, uma pinça sobre
   qualquer rota não deve aumentar nem reduzir a escala visual do documento.
4. A configuração vale igualmente para acesso web responsivo e para a PWA instalada,
   sem regras por rota ou componente.
5. Rolagem vertical e horizontal já permitida pelo conteúdo, ativação de controles,
   foco, teclado e gestos próprios dos componentes permanecem inalterados.
6. A mudança não introduz listeners nem estados JavaScript para tratar gestos.

## Requisitos não funcionais

- Acessibilidade:
  - o bloqueio de zoom é uma restrição de produto explícita e não deve ser
    implementado por cancelar eventos de toque ou teclado;
  - foco, ordem de tabulação, nomes acessíveis, leitores de tela e ajustes de fonte
    do sistema não devem ser alterados;
  - a limitação de zoom pode reduzir a capacidade de ampliação manual, devendo
    permanecer limitada ao requisito expresso desta demanda.
- Performance: a solução é declarativa no documento estático, sem listener,
  re-render, medição de viewport ou trabalho em runtime.
- Segurança e privacidade: não transmite, persiste, registra nem expõe dado novo.
- Observabilidade: não se aplica; não há evento de negócio nem logging associado.

## Critérios de aceite

### Cenário 1 — Pinça não amplia a rota pública móvel

- Forma de validar: `http://localhost:3000/`, em navegador móvel ou emulação que
  suporte gesto de pinça.
- Given: a rota pública está aberta com escala inicial de `1`.
- When: a pessoa executa uma pinça para ampliar ou reduzir a tela.
- Then: a escala do documento permanece em `1`.
- And: o botão `Entrar com Google` continua visível, focável e acionável.

### Cenário 2 — Pinça não amplia a aplicação autenticada

- Forma de validar: `http://localhost:3000/dash`, com MSW habilitado, em navegador
  móvel ou emulação que suporte gesto de pinça.
- Given: a rota autenticada está aberta com escala inicial de `1`.
- When: a pessoa executa uma pinça e depois abre o menu móvel.
- Then: a escala do documento permanece em `1`.
- And: o menu abre, fecha, recebe foco e mantém o comportamento vigente.

### Cenário 3 — Documento declara a política de viewport

- Forma de validar: inspeção de `ui/index.html` no build da UI.
- Given: o documento HTML gerado para qualquer rota.
- When: o navegador lê `meta[name="viewport"]`.
- Then: o conteúdo inclui `width=device-width`, `initial-scale=1.0`,
  `maximum-scale=1.0` e `user-scalable=no`.

## Estratégia de entrega e compatibilidade

1. Alterar somente a meta viewport existente em `ui/index.html`, preservando os
   valores atuais de largura e escala inicial.
2. Usar `maximum-scale=1.0` e `user-scalable=no`, sem CSS `touch-action` nem
   listeners que possam interferir em rolagem ou componentes.
3. Documentar a configuração uma única vez na arquitetura viva da UI, sem repetir
   detalhes globais em rotas.
4. Confirmar no navegador móvel os cenários de pinça; quando um navegador ignorar
   essa preferência por sua política de acessibilidade, preservar o comportamento
   adotado pelo navegador em vez de introduzir bloqueios invasivos.
5. Revisar `api/` e `ui/` por código sem uso ao fim da implementação, ainda que a
   mudança esperada não crie código novo.

## Plano de testes

- teste focado que confirma a configuração do documento somente se a infraestrutura
  atual oferecer uma forma estável de validar a meta viewport sem testar detalhe
  interno irrelevante;
- conferência manual em navegador móvel ou emulação com pinça real nas rotas `/` e
  `/dash`, verificando que a escala não muda e que rolagem, botão de login e menu
  móvel continuam operáveis;
- executar `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci`, `pnpm build` e
  `pnpm test:integration` após a implementação;
- `pnpm -C api test:e2e` não é exigido especificamente, pois endpoint, wiring,
  MongoDB e Redis não mudam.

## Riscos e decisões

- A configuração de viewport é uma preferência que alguns navegadores podem ignorar
  para preservar recursos de acessibilidade. A entrega não deve contornar essa
  proteção com JavaScript, CSS que bloqueie pan ou técnicas específicas de engine.
- `touch-action: none` e cancelamento de eventos de gesto poderiam impedir também
  rolagem, controles e interações HeroUI; a decisão é não usá-los.
- A regra pertence ao documento HTML compartilhado. Repeti-la em componentes ou
  rotas criaria divergência e não alcançaria a PWA de forma mais ampla.
- JSDOM e Playwright Chromium não simulam de modo confiável uma pinça nativa. A
  verificação comportamental principal é manual em ambiente que suporte o gesto; os
  testes automatizados existentes continuam protegendo a interação das rotas.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Meta viewport única preserva largura, escala inicial e bloqueio de zoom manual
- Pinça não amplia a UI nos navegadores móveis que respeitam a configuração
- Rolagem, foco, teclado, controles e menu móvel permanecem funcionais
- PWA, rotas, API, contratos, MSW e dados permanecem inalterados
- Política documentada no SDD vivo proprietário da UI
- Nenhuma dependência, listener ou CSS que bloqueie pan introduzido
- Quality gates da raiz e testes integrados da UI aprovados
