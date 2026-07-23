# Componentes e estilização

## Organização

- componentes compartilhados vivem em `src/core/components/<component>/`;
- componentes exclusivos vivem dentro da rota proprietária;
- arquivos e pastas usam `kebab-case`;
- um barrel `index.ts` expõe somente a API pública necessária;
- props públicas usam `Readonly` e são exportadas quando consumidas externamente.

Antes de criar um componente, verificar se semântica e comportamento já existem em
HTML, no design system adotado ou em componente compartilhado.

## Composição

- componentes concentram uma responsabilidade observável;
- lógica complexa sai do JSX para hooks ou funções nomeadas;
- evitar ternários aninhados e callbacks com múltiplos níveis;
- props condicionais usam unions quando isso impede combinações inválidas;
- elementos HTML semânticos têm preferência sobre `role`;
- acessibilidade não é uma variação opcional.

## Estilo

O mecanismo definitivo de design system e styling ainda será decidido. Até lá:

- estilos globais apenas para reset, tokens e estrutura realmente global;
- estilos de componente permanecem encapsulados;
- cores, espaçamentos e breakpoints repetidos devem migrar para tokens centrais;
- não usar seletores por detalhes internos de outro componente;
- dados de negócio não são transformados em arquivos de estilo.

Quando a solução de styling for adotada, esta seção deve registrar organização,
tokens, responsividade e filtragem de props.

Quando uma rota possuir referências em `routes/assets/<route-slug>/`, alterações de
componentes que afetem sua composição ou responsividade devem validar o layout
conforme `06-referencias-visuais-de-layout.md`. Sem imagens, essa validação não se
aplica.

## Testes

Testes de componente validam conteúdo, semântica, teclado, interações, estados e
variações públicas. Não testar nomes internos de classes ou reproduzir a
implementação do CSS nos asserts.
