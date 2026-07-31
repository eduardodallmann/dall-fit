# Rotas e comportamento funcional

## Roteamento

TanStack Router é o roteador oficial. A árvore é declarada manualmente em
`src/routes/routes.tsx` e registrada por module augmentation para preservar
tipagem de paths, parâmetros, links e navegação. Não usar roteamento por arquivos,
strings de URL espalhadas em componentes nem acesso direto a `window.history`.

Todo segmento estático de um path navegável usa inglês, letras minúsculas e
`kebab-case`, conforme a
[convenção transversal de paths públicos](../../../../docs/sdd/base/01-arquitetura-do-monorepo.md#convenção-de-paths-públicos).
Palavras de um mesmo segmento são separadas por hífen; não usar `camelCase`,
`PascalCase`, `snake_case` ou espaços. A regra vale para a declaração da rota e
para todos os links, redirects e navegações que apontam para ela.

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
