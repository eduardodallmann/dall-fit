# Rota `<caminho>`

> Documentação funcional viva. Deve permitir derivar testes sem consultar código,
> ticket ou conversa externa.

## Objetivo funcional

- Problema resolvido:
- Ator:
- Resultado esperado:
- Fluxos relacionados:

## Entradas e pré-condições

- Como o usuário chega:
- Path e query params:
- Contexto e estado persistido:
- Permissões:

## Elementos e conteúdo

- Textos e componentes:
- Ações:
- Elementos condicionais:

## Caminho feliz

1.
2.

Resultado esperado:

## Caminhos alternativos

### Alternativa 1 — `<nome>`

- Condição:
- Comportamento:
- Resultado:

## Validações

| Campo/ação | Regra | Quando valida | Mensagem/efeito | Bloqueia avanço? |
| ---------- | ----- | ------------- | --------------- | ---------------: |
|            |       |               |                 |                  |

## Estados

### Loading

### Vazio

### Sucesso

### Erro recuperável

### Erro não recuperável

### Ações desabilitadas

Para estados inexistentes, declarar “não se aplica”.

## Integrações

### `<operação>`

- Momento:
- Endpoint documentado:
- Dados enviados:
- Resposta utilizada:
- Sucesso:
- Erros:
- Retry, timeout e idempotência:

## Navegação

- Entrada:
- Avanço:
- Retorno:
- Botão voltar do navegador:
- Dados preservados:

## Acessibilidade e interação

- Ordem de foco e teclado:
- Labels e anúncios:
- Foco após erro ou navegação interna:

## Referências visuais de layout — opcional

> Preencher somente quando existirem imagens em
> `routes/assets/<route-slug>/`. Sem imagens, remover esta seção ou declarar “não se
> aplica”; nenhuma validação visual será exigida. As imagens complementam apenas o
> layout e não substituem nenhuma seção textual.

| Cenário | Viewport | Estado MSW | Imagem | Aspectos de layout relevantes |
| ------- | -------: | ---------- | ------ | ----------------------------- |
|         |          |            |        |                               |

## Cenários funcionais

### Cenário 1 — Caminho feliz

- Link para testar:
- Given:
- When:
- Then:

### Cenário 2 — Alternativa ou validação

- Link para testar:
- Given:
- When:
- Then:

### Cenário 3 — Erro de integração

- Link para testar:
- Given:
- When:
- Then:

## Estrutura técnica relevante

- Arquivo da rota:
- Componentes:
- Hooks e serviços:
- Tipos compartilhados:

## Cobertura automatizada

| Regra ou cenário de negócio | Vitest | Playwright |
| --------------------------- | ------ | ---------- |
|                             |        |            |

- Handlers e fixtures MSW:
- Spec Playwright da rota:
- Cenários manuais e justificativa:

O título do teste integrado mantém o identificador e o nome do cenário deste
documento. Não criar testes somente para aumentar cobertura de linhas.
