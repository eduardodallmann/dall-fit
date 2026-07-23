# Fluxo `<nome>`

> Documentação funcional viva de uma jornada ponta a ponta.

## Objetivo funcional

- Ator:
- Problema resolvido:
- Resultado esperado:

## Entrada e pré-condições

## Rotas e endpoints participantes

| Ordem | Etapa | Rota de UI | Endpoint da API |
| ----: | ----- | ---------- | --------------- |
|     1 |       |            |                 |

## Sequência e decisões

1.
2.

## Dados compartilhados

| Dado | Origem | Consumidores | Persistência | Observações |
| ---- | ------ | ------------ | ------------ | ----------- |
|      |        |              |              |             |

## Estados e exceções

- Caminho completo:
- Interrupção ou retomada:
- Erro recuperável:
- Erro não recuperável:
- Indisponibilidade:

## Cenários funcionais

### Cenário 1 — Caminho feliz

- Link para testar:
- Given:
- When:
- Then:

## Cobertura automatizada

- Regras e caminhos de negócio protegidos:
- Unitários e componentes da UI:
- Playwright da jornada UI: `ui/tests/integration/flows/<flow>.spec.ts`
- E2E dos endpoints da API e fixtures MongoDB/Redis:
- Handlers e fixtures MSW:
- Cenários não automatizados e justificativa:

O Playwright usa MSW Browser e valida somente a jornada do frontend. Não declarar
que ele cobre a implementação real dos endpoints.
