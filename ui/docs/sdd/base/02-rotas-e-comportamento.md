# Rotas e comportamento funcional

## Roteamento

TanStack Router é o roteador oficial. A árvore é declarada manualmente em
`src/routes/routes.tsx` e registrada por module augmentation para preservar
tipagem de paths, parâmetros, links e navegação. Não usar roteamento por arquivos,
strings de URL espalhadas em componentes nem acesso direto a `window.history`.

Search params com representação canônica são validados antes da consulta. Quando
uma forma inválida ou não canônica precisa ser corrigida, a navegação usa
`replace`, preserva os demais params válidos e não deixa a URL descartada no
histórico. A listagem de planos aplica essa regra a `page`: ausência representa 1,
a página 1 é omitida e somente inteiros decimais canônicos de 2 a 100 permanecem.
Depois da response, uma página acima do último resultado é substituída pela última
página existente antes de apresentar o conteúdo.

As rotas pessoais `/training-plan`, `/training-plan/:catalogEntryId` e workout são
filhas autenticadas. As equivalentes `/global/training-plan*` permanecem filhas
administrativas. O shell autenticado monta uma única conexão SSE para ambos os
fluxos. O menu mostra “Meus planos” para todas as pessoas e, adicionalmente,
“Planos globais” para admins.

Todo segmento estático de um path navegável usa inglês, letras minúsculas e
`kebab-case`, conforme a
[convenção transversal de paths públicos](../../../../docs/sdd/base/01-arquitetura-do-monorepo.md#convenção-de-paths-públicos).
Palavras de um mesmo segmento são separadas por hífen; não usar `camelCase`,
`PascalCase`, `snake_case` ou espaços. A regra vale para a declaração da rota e
para todos os links, redirects e navegações que apontam para ela.

## Retomada após autenticação

Uma entrada efetiva em rota privada impedida por `401` guarda o destino e substitui
a URL por `/`. Depois do login Google, o callback continua chegando a `/dash`;
a UI confirma pessoa e CSRF e retoma o destino com `replace`, antes de apresentar
o dashboard. O probe autenticado de `/` também prioriza uma intenção válida e
reutiliza a pessoa confirmada na proteção do destino. Sem intenção, usa `/dash`.

O destino contém somente path, parâmetros aceitos pelos validadores da rota e
fragmento. A árvore manual determina quais paths são privados; URL externa,
protocolo, path público/desconhecido, caracteres de controle, barras invertidas e
codificações que alterem a origem ou o reconhecimento do path são rejeitados.
Canonicalização de paginação continua pertencendo à listagem. Parâmetros
arbitrários não são guardados. `mockAuth` não faz parte do destino; seletores de
dados `mock*` só são conservados com MSW habilitado no desenvolvimento.

`src/auth/auth-return-to.ts` guarda uma intenção por aba em
`sessionStorage`, na chave `dall-fit:auth-return-to`, com `href` relativo e
`capturedAt` em milissegundos. A validade é de 30 minutos desde a captura, sem
renovação por leitura, recarga ou retry OAuth. Recarregar o login ou receber
`authError=oauth_failed` mantém a intenção válida. O dado não contém pessoa,
credencial, CSRF, cache, draft ou payload; não é enviado à API ou ao Google.

A última navegação efetiva bloqueada prevalece. Preload, navegação cancelada e
resposta de navegação anterior não gravam nem consomem a intenção. A resolução
usa `location` do guard e uma sequência da navegação corrente. Uma revalidação da
tela já montada que expira encerra a sessão sem criar retomada. O teardown elimina
intenções antigas e coordena a captura da nova entrada bloqueada antes de navegar.
Um `401` público sem geração ativa preserva a intenção existente; a entrada
intermediária em `/dash` também não a substitui durante falha do callback bootstrap.

A decisão de retomada revalida e consome a intenção uma vez. Destino igual ao atual
é somente removido; entrar autenticado explicitamente em outra rota privada
elimina a intenção antiga. Logout, inclusive falha remota, troca de identidade e
expiração de tela já montada descartam a intenção. O bypass transitório da raiz
continua impedindo que um teardown seja desfeito por novo probe no mesmo ciclo.
Falha técnica antes da decisão mantém o destino para retry; não vira ausência de
sessão. Storage indisponível ou destino inválido/expirado usa `/dash` como fallback
sem bloquear login. Falha de remoção desabilita retomada no documento atual.

Todos os guards e contratos do destino continuam sendo aplicados: pessoa comum
que tentou uma rota administrativa termina em `/dash` sem logout; recurso
inexistente/alheio ou execução encerrada segue os estados próprios da tela. Não
restaurar trabalho local nem repetir writes. A intenção não reaparece após consumo,
recarregamento ou Voltar, e redirects automáticos não emitem interação humana nem
transportam a URL bruta para telemetria.

O storage é local à origem e à aba. Abas independentes não compartilham destinos;
abas abertas com `opener` podem começar com cópia do storage do navegador. Não há
sincronização entre abas ou garantia de retomada em outro dispositivo.

## Documentação viva

Cada arquivo em `routes/` representa o estado atual de uma tela ou rota navegável.
Não acumular versões antigas ou narrar implementação. A profundidade deve permitir
que QA derive testes sem abrir o código.

Registrar:

- entrada, parâmetros, contexto, permissões e pré-condições;
- elementos visíveis e ações disponíveis;
- caminho feliz passo a passo;
- alternativas e decisões condicionais;
- validações por campo e momento de disparo;
- loading, vazio, sucesso, erro e indisponibilidade;
- navegação de entrada, avanço, retorno e retomada;
- integrações e comportamento por status;
- para cada mutation, estado confirmado e draft, estratégia otimista ou confirmada,
  duração do pending, momento de fechamento e prevenção de duplicidade;
- rollback localizado, tratamento de resposta tardia, erro persistente, retry,
  cancelamento e proteção de navegação aplicáveis;
- participação no ciclo transversal de sessão: queries encaminham `AbortSignal`,
  callbacks não escrevem depois da geração e recursos privados externos ao
  QueryClient registram reset sem mover regras do domínio para `core`;
- idempotência e concorrência, incluindo precondição, versão, fila e recuperação de
  conflito quando o recurso for um aggregate versionado;
- acessibilidade, foco e teclado;
- cenários Given/When/Then e casos limite.

Se um estado não existir, declarar “não se aplica”.

A documentação textual é sempre obrigatória e não pode delegar regras a uma
screenshot. Referências visuais opcionais complementam apenas o layout e seguem
`06-referencias-visuais-de-layout.md`.

## Links reproduzíveis

Cada cenário começa com `Link para testar:` apontando para o estado inicial local.
Quando a URL não puder iniciar o cenário, registrar `não se aplica` e justificar.
Mocks MSW podem selecionar cenários por path, query ou dados de request, sem alterar
o contrato de produção. A política completa está em `05-mocks-de-api.md`.

## Relação com fluxos e endpoints

Uma rota descreve detalhes locais; o fluxo da raiz descreve como etapas se conectam.
A rota referencia endpoints da API, mas não duplica todo o contrato HTTP.

Mudanças de navegação, dados preservados ou ordem de etapas atualizam também o fluxo.
Mudanças de request, response ou erro atualizam também endpoint e tipos compartilhados.

Cenários integrados relevantes da rota são cobertos por Playwright com MSW Browser,
conforme `07-testes-integrados-playwright.md`. Jornadas entre rotas pertencem ao
spec de flow, sem transformar o teste de rota em duplicação do fluxo completo.

## Referências visuais opcionais

Antes de alterar o layout, verificar se existe ao menos uma imagem em
`routes/assets/<route-slug>/`.

- com imagens: inspecionar e validar somente os estados e viewports representados;
- sem imagens ou com diretório vazio: não executar nem exigir validação visual.

A inexistência de imagens não altera os requisitos de documentação funcional,
testes, acessibilidade ou quality gates.
