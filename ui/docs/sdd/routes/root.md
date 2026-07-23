# Rota `/`

## Objetivo funcional

Exibir a tela inicial do scaffold e confirmar o funcionamento da interação React.

## Entradas e pré-condições

- URL: `http://localhost:5173/`
- Parâmetros obrigatórios: não se aplica
- Estado persistido: não se aplica
- Permissões: não se aplica

## Elementos e conteúdo

- ilustração inicial com logos do React e Vite;
- título `Get started`;
- orientação para editar `src/App.tsx`;
- botão contador iniciado em zero;
- links externos de documentação e comunidade.

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

O contador é um botão nativo e pode ser acionado por mouse ou teclado. Imagens
decorativas usam texto alternativo vazio; links e imagens informativas possuem nome
acessível.

## Cenários funcionais

### Cenário 1 — Incrementar contador

- Link para testar: `http://localhost:5173/`
- Given: a rota inicial está carregada e o contador mostra zero
- When: o usuário aciona o botão do contador uma vez
- Then: o botão passa a mostrar o valor um

## Cobertura

- Teste de componente: `src/App.test.tsx`
