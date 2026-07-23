# Endpoint `<MÉTODO> <path>`

> Documentação viva e humana do fluxo completo. Referencie símbolos e arquivos,
> mas não copie implementações, classes, DTOs ou queries.

## Objetivo funcional

- Problema resolvido:
- Ator/consumidor:
- Resultado esperado:
- Módulo proprietário:
- Fluxos e rotas relacionados:

## Referências técnicas

| Papel      | Símbolo                               | Arquivo | Responsabilidade neste fluxo |
| ---------- | ------------------------------------- | ------- | ---------------------------- |
| Controller | [`<Controller>`](../../../src/<path>) |         |                              |
| Entrada    | [`<InputDto>`](../../../src/<path>)   |         |                              |
| Command    | [`<Command>`](../../../src/<path>)    |         |                              |
| Service    | [`<Service>`](../../../src/<path>)    |         |                              |
| Repository | [`<Repository>`](../../../src/<path>) |         |                              |
| Saída      | [`<OutputType>`](../../../src/<path>) |         |                              |

Adicionar uma linha por service, repository, integração externa, mensageria ou tipo
relevante. Remover papéis que realmente não se apliquem e justificar no fluxo.

## Contrato HTTP resumido

- Método e path:
- Autenticação:
- Autorização/permissões:
- Headers relevantes:
- Path e query params:
- Tipo/classe de entrada:
- Tipo/classe de saída:
- Status de sucesso:
- Dados sensíveis:
- Idempotência:

Não reproduzir o conteúdo completo dos tipos. Referenciar seus arquivos e explicar
em texto somente os campos ou regras importantes ao fluxo.

## Fluxo completo

### 1. Entrada — `<Controller>`

Explicar humanamente:

1. quais dados chegam e por qual tipo;
2. quais validações acontecem antes do command;
3. quais parâmetros sanitizados acompanham
   `<Controller> -> <método> -> params:`;
4. qual command é chamado;
5. o que acompanha `<Controller> -> <método> -> <command> return:`;
6. o que acompanha `<Controller> -> <método> -> return:`;
7. o que o controller devolve após registrar o resultado.

### 2. Orquestração — `<Command>`

Explicar o objetivo do command, os dados recebidos e como ele prepara os contratos
esperados pelos services.

#### Caminho principal

1. Decisão ou preparação:
2. Chamada ao `<Service>`:
   - dado entregue ao service:
   - regra ou operação executada:
   - resultado devolvido ao command:
   - log sanitizado do retorno:
3. Próxima decisão:
4. Montagem da response:
5. Log e retorno da response:

#### Branch — `<condição humana>`

- Gatilho:
- Log emitido ao entrar no branch:
- Decisão tomada pelo command:
- Service chamado:
  - responsabilidade do service:
  - repository ou integração acessada pelo service:
  - resultado ou erro possível:
  - log do retorno ou erro:
- Continuação do fluxo:
- Response e efeitos:

Criar um subtítulo para cada `if`, alternativa ou interrupção relevante. Manter a
hierarquia Command → Service → Repository/integração visível.

### 3. Services e dependências

#### `<Service>`

- Assunto próprio:
- Entrada preparada pelo command:
- Regra, cálculo ou operação:
- Objeto, entidade ou array preparado para a dependência:
- Repository, Redis, mensageria ou serviço externo acessado:
- Log de entrada:
- Log do retorno ou conclusão da dependência:
- Logs de branches:
- Resultado devolvido ao command:
- Log de saída:
- Erros possíveis:

Repetir para cada service. Não copiar o método; explicar sua responsabilidade no
fluxo.

### 4. Saída

Explicar como o command combina os resultados, monta o tipo de saída, registra sua
response, devolve-a ao controller e como o controller registra e retorna o mesmo
resultado.

## Mapa de caminhos possíveis

| Caminho     | Gatilho | Sequência interna resumida                  | Resultado HTTP | Efeitos colaterais |
| ----------- | ------- | ------------------------------------------- | -------------- | ------------------ |
| Feliz       |         | Controller → Command → Service → Repository |                |                    |
| Validação   |         | Controller interrompe antes do Command      |                | Nenhum             |
| Alternativo |         |                                             |                |                    |
| Erro        |         |                                             |                |                    |

O mapa funciona como índice. Todos os caminhos são detalhados abaixo.

## Cenários detalhados

### Cenário 1 — Caminho feliz

**Seed**

```bash
pnpm -C api seed -- <endpoint-slug>:<scenario-slug>
```

**cURL**

```bash
curl --request <METHOD> \
  --url http://localhost:3000/<path> \
  --header 'content-type: application/json' \
  --data '<body-ficticio-e-completo>'
```

- Given:
- When:
- Sequência interna:
  1. `<primeiro passo>`
  2. `<segundo passo>`
- Then:
- Response:
- Persistência, cache, mensagem ou chamada externa:
- Sequência de logs seguros:
- Métricas:

### Cenário 2 — Falha de validação

**Seed:** não se aplica — `<justificar por que nenhum estado prévio é acessado>`.

**cURL**

```bash
curl --request <METHOD> \
  --url http://localhost:3000/<path> \
  --header 'content-type: application/json' \
  --data '<body-invalido-que-aciona-o-cenario>'
```

- Given:
- When:
- Validação que falha:
- Ponto de interrupção:
- Then:
- Response:
- Efeitos que não acontecem:
- Sequência de logs seguros:

### Cenário 3 — Branch alternativo

**Seed**

```bash
pnpm -C api seed -- <endpoint-slug>:<alternative-scenario-slug>
```

**cURL**

```bash
curl --request <METHOD> \
  --url http://localhost:3000/<path-com-dados-do-seed>
```

- Given:
- When:
- Condição avaliada pelo command:
- Services e dependências chamados:
- Branch e sequência de logs seguros:
- Then:
- Response:
- Efeitos:

### Cenário 4 — Falha de dependência

**Seed**

```bash
pnpm -C api seed -- <endpoint-slug>:<dependency-error-scenario-slug>
```

**cURL**

```bash
curl --request <METHOD> \
  --url http://localhost:3000/<path-com-dados-do-seed>
```

- Given:
- When:
- Repository, Redis, mensageria ou serviço externo que falha:
- Propagação ou tratamento do erro:
- Sequência de logs seguros:
- Then:
- Response:
- Retry ou recuperação:
- Efeitos parciais e compensação:

Adicionar cenários até cobrir todas as validações, decisões, retornos vazios,
conflitos, erros e casos limites conhecidos. Declarar “não se aplica” somente após
verificar que o caminho realmente não existe.

Em documentos reais, substituir todos os placeholders. Cada cURL deve funcionar
após o seed e acionar exatamente o cenário descrito. Seguir
`../base/05-seeds-e-curls-de-cenario.md`.

## Observabilidade e segurança

Seguir `../base/06-logging-e-rastreabilidade.md`. Listar toda etapa do fluxo; não
resumir apenas a entrada do controller.

| Ordem | Classe e método | Etapa                  | Mensagem textual exata | Dados sanitizados | Dados ocultados |
| ----: | --------------- | ---------------------- | ---------------------- | ----------------- | --------------- |
|     1 |                 | Entrada                |                        | `{ params }`      |                 |
|     2 |                 | Etapa intermediária    |                        | `{ data }`        |                 |
|     3 |                 | Retorno de dependência |                        | `{ data }`        |                 |
|     4 |                 | Branch                 |                        | `{ data }`        |                 |
|     5 |                 | Retorno                |                        | `{ data }`        |                 |

- Erros funcionais e técnicos registrados:
- Métricas:
- Traces:
- Alertas:

## Regras de negócio cobertas por testes

| Regra ou cenário de negócio | Teste unitário | Teste E2E | Mock ou fixture |
| --------------------------- | -------------- | --------- | --------------- |
|                             |                |           |                 |

Os testes existem para validar regras e caminhos documentados, não apenas para
aumentar cobertura de linhas.

## Fora do comportamento atual

- Caminhos explicitamente não suportados:
- Funcionalidades futuras que não devem ser inferidas:
