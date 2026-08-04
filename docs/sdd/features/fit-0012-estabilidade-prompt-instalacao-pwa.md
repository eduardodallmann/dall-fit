# Feature Spec: Estabilidade visual durante o prompt de instalação da PWA

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: `FIT-0012`.
- Problema: em Android, ao ativar `Instalar aplicativo`, a confirmação nativa do
  navegador abre corretamente, mas a interface ao fundo troca imediatamente para
  `Como instalar`. Essa transição ocorre antes de o navegador concluir
  `userChoice`, embora a decisão da pessoa ainda esteja pendente. Instalação,
  cancelamento e ocultação posterior funcionam, mas o estado visual intermediário
  é incoerente.
- Resultado: enquanto a confirmação nativa estiver aberta, a seção `Aplicativo`
  conserva `Instalar aplicativo` em estado de progresso e não apresenta as
  instruções manuais. Somente depois da resposta do navegador a UI oculta a ação,
  em caso de aceite, ou passa para `Como instalar`, em caso de cancelamento ou
  falha.
- Referências:
  - `docs/sdd/features/fit-0011-instalacao-pwa.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/03-componentes-e-estilizacao.md`;
  - `ui/docs/sdd/routes/dash.md`.
- Features relacionadas:
  - `FIT-0011` — introduziu a instalação da PWA, o estado global do prompt e a
    orientação manual alternativa.

## Escopo

### Incluído

- separar o consumo único do evento `beforeinstallprompt` da transição visual para
  o modo de instruções manuais;
- manter a apresentação `Instalar aplicativo` enquanto `prompt()` ou `userChoice`
  estiverem pendentes;
- preservar o estado de progresso e o bloqueio contra ativações concorrentes já
  oferecidos pelo botão HeroUI;
- decidir o próximo estado somente após o resultado nativo:
  - aceite oculta as ações de instalação;
  - cancelamento troca para `Como instalar`;
  - falha troca para `Como instalar` sem bloquear a aplicação;
- preservar a reação a `appinstalled` e aos modos standalone;
- preservar um único estado compartilhado pelos menus persistente e móvel;
- adicionar cobertura unitária com resultado nativo deliberadamente pendente;
- atualizar a documentação viva da rota `/dash` durante a implementação.

### Não incluído

- alterar, substituir ou personalizar a confirmação nativa do Android ou do
  navegador;
- reter ou reutilizar um evento `beforeinstallprompt` já consumido;
- mudar textos, instruções manuais, manifesto, Service Worker, cache, assets ou
  configuração de deploy;
- alterar o comportamento depois da instalação bem-sucedida;
- persistir aceite ou cancelamento em storage, cookie ou API;
- adicionar telemetria, logs, notificações push ou qualquer nova integração;
- mudar autenticação, endpoints, contratos compartilhados ou fluxos de navegação;
- criar cenário Playwright para a interface nativa, que não é controlada pela
  aplicação.

## Projetos e documentação afetados

- API e endpoints: não se aplica — a correção pertence ao estado local da UI e não
  muda tráfego HTTP.
- UI e rotas:
  - `ui/src/core/pwa/pwa-provider.tsx` ajusta a ordem das transições do ciclo de
    instalação;
  - testes do provider e, se necessário, do componente de instalação representam
    um `userChoice` pendente e seus resultados;
  - `ui/docs/sdd/routes/dash.md` passa a explicitar o estado observável enquanto a
    confirmação nativa estiver aberta.
- Fluxos: não se aplica — login, navegação e abertura em `/dash` permanecem iguais.
- Contratos em `@dall-fit/types`: não se aplica — o evento e seu resultado são
  contratos locais do navegador.
- Decisões arquiteturais: não exige ADR; trata-se de correção local e reversível da
  ordem de atualização de estado introduzida por `FIT-0011`.
- Handlers e fixtures MSW: não se aplica — nenhuma request é criada ou alterada.
- Mocks de repositories/caches nos unitários da API: não se aplica.
- Fixtures MongoDB/Redis nos E2E: não se aplica.

## Requisitos funcionais

1. A ativação de `Instalar aplicativo` continua consumindo o evento disponível uma
   única vez e chamando `prompt()` somente a partir do gesto da pessoa.
2. O evento consumido deixa imediatamente de estar disponível para uma segunda
   ativação, mesmo que a confirmação nativa continue aberta.
3. Enquanto `prompt()` ou `userChoice` não tiverem concluído, a seção continua no
   modo de instalação nativa:
   - mantém o texto `Instalar aplicativo`;
   - apresenta o progresso vigente do botão;
   - não renderiza `Como instalar` nem suas instruções.
4. Os menus persistente e móvel refletem o mesmo estado pendente e não conseguem
   abrir duas confirmações nativas para o mesmo evento.
5. Quando `userChoice.outcome` for `accepted`, as ações de instalação desaparecem.
6. Quando `userChoice.outcome` for `dismissed`, `Como instalar` aparece somente
   depois que a confirmação nativa for encerrada.
7. Se `prompt()` ou a leitura de `userChoice` falhar, o progresso termina e a seção
   passa para `Como instalar`, sem mensagem técnica e sem bloquear a aplicação.
8. Se `appinstalled` ocorrer enquanto a decisão ainda estiver pendente, o estado
   instalado prevalece e as ações permanecem ocultas quando a Promise nativa
   terminar.
9. Um novo `beforeinstallprompt` futuro pode oferecer uma nova ação nativa, conforme
   decisão do navegador, sem reutilizar o evento anterior.
10. O comportamento standalone, as instruções específicas por plataforma e o ciclo
    de atualização do Service Worker permanecem inalterados.

## Requisitos não funcionais

- Acessibilidade:
  - o botão mantém nome acessível estável durante a confirmação nativa;
  - o estado de progresso impede nova ativação sem substituir a ação por conteúdo
    semanticamente diferente;
  - nenhuma mudança de foco, anúncio ou modal adicional é criada pela UI.
- Performance: a correção usa somente o estado global vigente, sem listener,
  dependência ou renderização transversal adicional.
- Segurança e privacidade: nenhum resultado da instalação é persistido ou enviado
  pela rede; detalhes de falha não são mostrados nem registrados.
- Observabilidade: não adicionar `console.*`, analytics ou logging do aceite,
  cancelamento ou erro.

## Critérios de aceite

### Cenário 1 — Manter a ação estável enquanto a decisão está pendente

- Forma de validar: teste Vitest do provider com `beforeinstallprompt` controlado e
  `userChoice` deliberadamente pendente; conferência manual em Android sobre um
  build publicado. Não há link local que mantenha a interface nativa aberta de
  forma determinística.
- Given: o navegador forneceu `beforeinstallprompt` e a seção mostra
  `Instalar aplicativo`.
- When: a pessoa ativa a ação e a confirmação nativa permanece aberta.
- Then: `prompt()` é chamado uma única vez, `Instalar aplicativo` permanece ao
  fundo em progresso e `Como instalar` não é renderizado.

### Cenário 2 — Mostrar orientação somente depois do cancelamento

- Forma de validar: teste Vitest com resolução controlada de `userChoice` como
  `dismissed`; conferência manual em Android.
- Given: a confirmação nativa está aberta e a interface continua no estado de
  instalação.
- When: a pessoa cancela a confirmação.
- Then: o progresso termina e a seção passa para `Como instalar` somente após a
  resolução nativa, sem tentar abrir o mesmo prompt novamente.

### Cenário 3 — Ocultar a promoção depois do aceite

- Forma de validar: teste Vitest com resolução controlada de `userChoice` como
  `accepted` e teste do evento `appinstalled`; conferência manual em Android.
- Given: a confirmação nativa está aberta.
- When: a pessoa aceita a instalação ou o navegador dispara `appinstalled`.
- Then: as ações de instalação desaparecem e não retornam quando a Promise pendente
  termina.

### Cenário 4 — Preservar o web app em falha do prompt

- Forma de validar: teste Vitest com rejeição de `prompt()` ou `userChoice`.
- Given: a pessoa ativou `Instalar aplicativo`.
- When: a API do navegador falha.
- Then: o progresso termina, `Como instalar` fica disponível e autenticação,
  navegação e demais conteúdos permanecem operáveis sem erro técnico visível.

## Estratégia de entrega e compatibilidade

1. Ajustar apenas a ordem de atualização do estado do prompt no provider global.
2. Limpar imediatamente a referência consumível usada pela ação, mas conservar o
   estado de apresentação até `userChoice` concluir.
3. Garantir que `installed` tenha precedência sobre qualquer conclusão tardia do
   prompt.
4. Manter compatibilidade com navegadores sem `beforeinstallprompt`, iOS/iPadOS,
   modo standalone e as duas apresentações do menu.
5. Não alterar o contrato histórico de `FIT-0011`; esta feature registra a
   correção posterior.

## Plano de testes

- Unitários e componentes da UI:
  - usar uma Promise controlada para manter `userChoice` pendente;
  - comprovar texto estável, estado de progresso e ausência de `Como instalar`
    durante a espera;
  - resolver como `dismissed` e comprovar a transição posterior para orientação;
  - resolver como `accepted` e comprovar a ocultação;
  - disparar `appinstalled` antes da resolução e comprovar que o estado instalado
    prevalece;
  - rejeitar `prompt()` e `userChoice` e comprovar fallback não bloqueante;
  - montar duas ações sob o mesmo provider e comprovar consumo único.
- Playwright: não adicionar cenário que fabrique ou automatize a confirmação nativa;
  executar a suíte vigente para detectar regressões no menu e na orientação manual.
- Verificação manual: repetir o fluxo em Android, observar o menu ao fundo durante
  a confirmação, cancelar uma vez e aceitar em uma nova oportunidade do navegador.
- API, MSW e E2E de backend: nenhum teste novo; executar somente os gates gerais
  aplicáveis ao monorepo.
- Documentação e layout: atualizar `ui/docs/sdd/routes/dash.md` na implementação;
  não executar comparação visual porque não existem referências em
  `ui/docs/sdd/routes/assets/dash/`.
- Quality gates após a implementação:
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm test:coverage:ci`;
  - `pnpm build`;
  - `pnpm test:integration`.

## Riscos e decisões

- Limpar o estado de apresentação antes de `userChoice` causa exatamente a troca
  prematura observada; somente a referência consumível deve ser invalidada nesse
  momento.
- Manter a referência consumível até o fim permitiria uma segunda ativação pelos
  dois menus montados; por isso consumo e apresentação precisam ser estados
  distintos.
- `appinstalled` pode ocorrer antes da conclusão da Promise do prompt. O estado
  instalado deve ter precedência para evitar que uma conclusão tardia reabra a
  promoção.
- A interface nativa pertence ao navegador e não pode ser estilizada nem coberta
  de ponta a ponta de forma estável; o contrato da UI é validado por Promise
  controlada e conferência manual.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- `FIT-0011` preservada como registro histórico
- Rota `/dash` atualizada com o estado intermediário corrigido
- Evento consumido uma vez e apresentação estável durante `userChoice`
- Aceite, cancelamento, `appinstalled` e falhas cobertos por testes
- Nenhuma mudança em API, contratos, MSW, cache ou Service Worker
- Quality gates da raiz e Playwright aprovados
