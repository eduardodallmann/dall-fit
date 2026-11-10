# Rota `/terms` e barreira de leitura em `/dash`

## Objetivo funcional

A pessoa autenticada lê e copia a publicação vigente e consulta seus recibos.
Enquanto falta aceite, a mesma superfície substitui o conteúdo privado. Cadastro e
login já ocorreram: concordância é uma etapa explícita posterior. O
[fluxo ponta a ponta](../../../../docs/sdd/flows/aceite-de-termos.md) coordena API e
Android; esta rota é proprietária da apresentação.

## Entradas e pré-condições

`/terms` exige sessão e bootstrap habitual, mas dispensa aceite vigente. Não aceita
pessoa/versão na URL: histórico é selecionado pela própria tela. `mockTerms` é
exclusivo de desenvolvimento com MSW. Pessoa comum e admin leem os mesmos termos.
Sem publicação, só admin recebe a ação `Configurar primeiro termo` na barreira.

`TermsBoundary` observa a situação por TanStack Query antes de montar negócio.
Entrada privada pendente vai para `/dash`, conservando destino validado na mesma
intenção temporária de autenticação. `/terms` permanece disponível. Enquanto o
bloqueio existe, o menu comum mantém identidade, tema e saída, sem navegação ou
instalação. O menu administrativo conserva Modelos de treino, Gestão de termos e
Termos de uso, independentemente de publicação/aceite; as funções pessoais continuam
bloqueadas inclusive para o administrador. Discordar não cria recibo; a pessoa pode sair.

## Elementos e conteúdo

- Título `Termos de uso` e explicação de que cadastro e aceite são etapas separadas.
- Alerta de pendência e orientação para interromper atividade em segurança.
- Número jurídico da publicação, data, responsável, contato e resumo das alterações.
- Artigo `Texto integral dos termos`, com HTML canônico da API, leitura contínua,
  títulos/listas/destaques e links seguros. Não é um scroll interno obrigatório.
- Duas declarações independentes e inicialmente desmarcadas: `Declaro que tenho
  18 anos completos ou mais.` e `Li e aceito os Termos de Uso desta versão e estou
  ciente dos riscos e dos cuidados descritos para a prática de exercícios.`.
- `Aceitar e continuar`, `Copiar texto`, `Tentar novamente` e
  `Meus aceites anteriores`; histórico com data, `Ler versão N` e paginação.
- Aceite confirmado mostra a data do recibo. Consulta histórica nunca aceita uma
  versão antiga nem substitui a vigente; `Voltar ao termo atual` retoma a leitura.

## Caminho feliz

1. Verifica a situação vigente. Quando pendente, carrega documento exato por ID.
2. A pessoa lê o texto, declara idade mínima e concordância e confirma.
3. O formulário TanStack Form envia ID/hash e os dois `true`. Não libera por clique,
   scroll, login ou persistência otimista.
4. Só a confirmação da API e, no Android, gravação do comprovante na conta corrente
   liberam a UI. A geração de sessão é confrontada antes e depois da bridge.
5. Revalida o Router e retoma o destino permitido, ou `/dash`. Dashboard volta ao
   comportamento normal. A rota de consulta permanece acessível pelo menu.

## Caminhos alternativos

- Nova publicação antes da gravação: `409 TERMS_VERSION_CHANGED` relê situação e
  texto e desmarca declarações. Não repete silenciosamente o aceite em outra versão.
- Publicação durante gravação: o recibo antigo pode existir com situação ainda
  `required`; mostra o novo documento e continua bloqueado.
- Erro/timeout: conserva declarações da mesma versão, informa falha e permite retry.
  Repetição é idempotente e pode recuperar um commit cuja resposta se perdeu.
- Sem publicação: `Termos ainda não disponíveis`, retry/saída; admin recebe a única
  ação inicial de configuração. Falha necessária: `Não foi possível carregar os termos`.
- Clipboard indisponível: oferece TextArea somente leitura para seleção manual.
  Cópia inclui versão, publicação, identificação e texto com separação de blocos.
- Histórico vazio é explícito; erro de histórico é anunciado sem apagar o termo.

## Validações

| Campo/ação | Regra | Momento | Efeito |
| --- | --- | --- | --- |
| Maioridade | Checkbox separado e obrigatório | Antes de enviar | Sem marca, botão desabilitado |
| Concordância | Checkbox separado e obrigatório | Antes de enviar | Sem marca, botão desabilitado |
| Documento | ID/hash da vigente carregada | Envio e confirmação | Versão nova exige nova leitura e declarações |
| Pending | Uma confirmação em voo | Mutation | Desabilita declarações e duplicidade |
| Sessão | Geração/conta ainda ativas | Responses e bridge | Descarta resultados atrasados |

## Estados

Loading usa Skeleton/status sem conteúdo de negócio. Vazio significa ausência de
publicação ou de recibos, com mensagens próprias. Sucesso é leitura/recibo confirmado.
Falhas de rede/API são recuperáveis por retry; `401` encerra geração pelo mecanismo
normal. Não existe consentimento parcial, autorização de menor ou aceite offline.

Uma publicação descoberta por SSE Web, ready/reconexão, foco, retomada, polling
visível de cinco minutos ou `403 TERMS_ACCEPTANCE_REQUIRED` bloqueia imediatamente
novas requests de negócio no Axios. Requisito conhecido nunca regride por resposta
atrasada. Quando já havia uma tela montada, React `Activity` a oculta e limpa efeitos,
inclusive overlays/portals, conservando estado recuperável. Retomar após aceite não
reenvia automaticamente a mutation que falhou. Não há reload forçado nem logout.

## Integrações

[Endpoints de termos](../../../../api/docs/sdd/endpoints/terms.md) são a referência
HTTP. `GET /terms/access` usa chave única, staleTime 30 s e foco/reconexão/polling.
`GET /terms/current` é chaveado pela referência vigente; versões e histórico têm
chaves próprias e AbortSignal. `POST /terms/acceptances` usa a única instância Axios,
CSRF Web ou Bearer nativo. Nenhuma request envia pessoa ou data escolhida pelo cliente.
As consultas jurídicas usam `private, no-store`, sem cache de resposta no PWA.

No Android, indisponibilidade transitória permite somente Treinar local com o último
comprovante confirmado da mesma conta e nenhuma exigência posterior. A referência
mínima e o recibo persistem no SQLite existente. Sem prova, exige conexão. O HTML
não é persistido offline e uma exigência conhecida permanece bloqueada após restart.
Worker e foreground pausam a mesma fila até confirmar o novo aceite; não apagam
credencial ou snapshots por erro de termos.

## Navegação

Entradas diretas, histórico e menu passam pela barreira. Durante atualização de
uma tela já aberta, conserva a URL e seu estado oculto; depois do aceite, retoma o
mesmo contexto autorizado. Em primeiro acesso pendente, `/dash` guarda a intenção
original até a confirmação. Voltar do navegador não libera negócio nem apaga
requisito conhecido. Logout segue a política habitual, incluindo cuidados com fila
Android; não exige concordância.

## Acessibilidade e interação

Texto legal com `text-base` (16 px), contraste por tokens e quebra de palavras sem
overflow no viewport `390x844`. Checkboxes HeroUI possuem rótulos integrais, foco
visível e Space; confirmação tem pending real. Alertas anunciam falhas e mudança de
versão; botões continuam alcançáveis em documentos longos. Histórico usa headings
contínuos e TextArea de fallback possui label. Shell conserva breakpoint `768px`.

## Analytics

`/terms` é path normalizado. Declarações, leitura/histórico/páginas e cancelamento
usam `ui_terms_action` com ação enumerada. Aceite/cópia/retry usam
`ui_operation_started/completed` (`terms_accept`, `terms_copy`, `terms_retry`), uma
emissão de início e uma terminal, sem clique genérico duplicado. Navegação pelo
menu usa o catálogo normal. Nenhum texto, nome, e-mail, hash, número de publicação,
recibo, ID, checkbox concreto, seletor `mock*` ou resposta HTTP é coletado.
Falha da coleta não interrompe uso, leitura nem confirmação.

## Cenários funcionais

### Cenário 1 — Cadastro sem aceite implícito

- Link para testar: `http://localhost:3000/?mockAuth=unauthenticated&mockTerms=required`.
- Given: visitante sem sessão e publicação existente.
- When: conclui login.
- Then: barreira sem Home/links de negócio e declarações desmarcadas.

### Cenário 2 — Aceite libera destino e vale entre sessões

- Link para testar: `http://localhost:3000/training-plan?mockTerms=required`.
- Given: destino privado e nenhum recibo.
- When: marca as duas declarações e confirma.
- Then: chega aos planos somente após confirmação; reload conserva o recibo no cenário.

### Cenário 4 — Nova publicação preserva administração e restringe o uso pessoal

- Link para testar: `http://localhost:3000/global/training-plan?mockAuth=admin&mockTerms=admin`.
- Given: versão 1 aceita e formulário de plano aberto.
- When: outra instância publica versão 2 e o foco revalida a situação.
- Then: o rascunho administrativo continua visível e íntegro, os links pessoais ficam indisponíveis; a leitura da versão 2 e o aceite liberam o uso pessoal.

### Cenário 9 — Versão muda durante a leitura ou confirmação

- Link para testar: `http://localhost:3000/dash?mockTerms=changed-during-acceptance`.
- When: confirma a primeira leitura.
- Then: recebe versão 2 com declarações desmarcadas, ainda bloqueado.

### Cenário 10 — Falha de aceite e resultado ambíguo

- Links para testar: `http://localhost:3000/dash?mockTerms=accept-error` e
  `http://localhost:3000/dash?mockTerms=accept-timeout`.
- Then: falha não libera negócio; nova tentativa conserva/reconcilia um único recibo.

### Cenário 13 — Consulta, cópia e discordância

- Link para testar: `http://localhost:3000/terms?mockTerms=accepted`.
- When: consulta histórico e copia texto, inclusive com clipboard recusado.
- Then: documento e identificação correspondem à versão; fallback legível readonly.

### Cenário 16 — Acessibilidade e isolamento

- Link para testar: `http://localhost:3000/dash?mockTerms=required`.
- When: usa menu móvel, teclado, troca conta ou sai.
- Then: texto e ações alcançáveis, sem links ocultos acionáveis ou estado de outra conta.

## Estrutura técnica relevante

Árvore manual em `src/routes/routes.tsx`; `src/routes/terms/` possui leitura,
formulário, histórico, documento e services. `src/core/terms/` concentra política e
query. HeroUI `Alert`, `Button`, `Checkbox`, `Skeleton`, `TextField` e `TextArea` são
compostos sem primitives equivalentes. Apresentação fica em `styles.ts` por `tv` de
`@heroui/styles`. Shared types vêm de `@dall-fit/types`.

## Cobertura automatizada

`core/terms/policy.test.ts` cobre monotonicidade, geração/conta e offline.
`tests/integration/routes/terms.spec.ts` cobre os cenários numerados acima com
Chromium/Vite/MSW reais; a publicação da outra instância também usa a fronteira MSW.
Handlers/fixtures vivem em `mocks/handlers/terms.ts` e `mocks/fixtures/terms.ts` e
usam somente identificação sintética. A suíte da fronteira de Analytics protege
projeção e omissão de propriedades arbitrárias. Android é validado pelos testes
instrumentados de storage/sync, sem atribuir essa cobertura ao Playwright.

### Administração acessível com pendência ou falha de consulta

- Links para testar: `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=required`
  e `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=load-error`.
- Given: administrador sem aceite ou consulta jurídica indisponível.
- When: navega entre Gestão de termos e Modelos de treino pelo menu.
- Then: ambas as áreas permanecem acessíveis; Home, Meus planos e Treinar não
  aparecem até aceitar. Pessoa comum não recebe esses links nem acesso por URL.

## Referências visuais de layout

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/terms/desktop-1440-acceptance-required.png` | `1440x900` | `mockAuth=theme-light`, `mockTerms=required`, em `/dash` | menu restrito, alerta, documento e duas declarações na região principal |
| `assets/terms/mobile-390-acceptance-required.png` | `390x844` | `mockAuth=theme-light`, `mockTerms=required`, em `/dash` | leitura contínua em uma coluna, declarações e ações abaixo do texto |
| `assets/terms/desktop-1440-history.png` | `1440x900` | `mockAuth=theme-light`, `mockTerms=accepted`, histórico aberto em `/terms` | documento, recibo e histórico com paginação abaixo das ações |
| `assets/terms/mobile-390-history.png` | `390x844` | `mockAuth=theme-light`, `mockTerms=accepted`, histórico aberto em `/terms` | leitura e histórico empilhados, com ações que quebram linha |

Links para reproduzir:

- barreira: `http://localhost:3000/dash?mockAuth=theme-light&mockTerms=required`;
- consulta: `http://localhost:3000/terms?mockAuth=theme-light&mockTerms=accepted`,
  acionar `Meus aceites anteriores`.

As capturas usam a página inteira e tema claro. Documento, identificação, datas e
recibos são fictícios e determinísticos; as imagens orientam exclusivamente layout.
