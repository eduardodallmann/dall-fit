# Rota `/`

## Objetivo funcional

Exibir a tela inicial do scaffold e confirmar o funcionamento da interação React.

## Entradas e pré-condições

- URL: `http://localhost:3000/`
- Parâmetros obrigatórios: não se aplica
- Estado persistido: não se aplica
- Permissões: não se aplica

## Elementos e conteúdo

- identificação `Dall Fit`;
- título `Get started`;
- orientação para editar `src/routes/home/index.tsx`;
- botão contador iniciado em zero, fornecido pelo HeroUI.

## Caminho feliz

1. O usuário acessa `/`.
2. A tela exibe o conteúdo inicial.
3. O usuário aciona o botão `Count is 0`.
4. O botão passa a exibir `Count is 1`.

## Estados, validações e integrações

- loading: não se aplica;
- vazio: não se aplica;
- erro: não se aplica;
- validações: não se aplica;
- integrações com a API: não se aplica.

## Acessibilidade

O contador usa o componente `Button` do HeroUI, renderizado como `button` nativo,
com nome acessível correspondente ao valor atual. Ele pode ser acionado por mouse
ou teclado.

## Cenários funcionais

### Cenário 1 — Incrementar contador

- Link para testar: `http://localhost:3000/`
- Given: a rota inicial está carregada e o contador mostra zero
- When: o usuário aciona o botão do contador uma vez
- Then: o botão passa a mostrar o valor um

## Cobertura

- Teste de componente: `src/routes/home/__tests__/index.test.tsx`
- Teste de composição do router e providers: `src/app.test.tsx`

## Estrutura técnica relevante

- Arquivo da rota: `src/routes/home/index.tsx`
- Registro no router: `src/routes/routes.tsx`
- Componentes HeroUI: `Button` e `Card` de `@heroui/react`
- Apresentação própria: `src/routes/home/styles.tsx`
- Componentes core: não se aplica
- Componentes exclusivos da rota: não se aplica
- Integrações: não se aplica
