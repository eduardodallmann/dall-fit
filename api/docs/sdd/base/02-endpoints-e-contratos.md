# Endpoints e contratos HTTP

## Convenções

- recursos e paths em inglês, minúsculos e com substantivos;
- JSON como formato padrão;
- datas e horários em ISO 8601, com timezone explícito;
- IDs opacos são strings;
- paginação usa convenção única e tipos compartilhados;
- códigos HTTP representam o resultado, enquanto o body de erro inclui código
  estável legível por máquina.

Formato base de erro:

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "Resource not found",
  "details": {}
}
```

Mensagens não são contrato para lógica do cliente; consumidores usam `code`.

## Compatibilidade

Adicionar campo opcional costuma ser compatível. Remover, renomear, tornar
obrigatório ou mudar semântica exige migração coordenada e atualização de:

1. tipo público em `@dall-fit/types`;
2. validação e serialização da API;
3. consumidores da UI;
4. documento do endpoint;
5. rota e fluxo afetados;
6. testes de contrato e comportamento.

Não expor diretamente entidades de banco. A resposta HTTP é montada explicitamente.

## Idempotência e concorrência

Cada operação de escrita documenta se é idempotente, como duplicidade é tratada e
qual estratégia evita perda de atualização concorrente. Se não se aplicar, declarar
explicitamente.

## Documentação

Um endpoint novo usa `../templates/endpoint-spec.md`. Operações inseparáveis do
mesmo recurso podem dividir um arquivo; caso contrário, usar um arquivo por operação.

### Objetivo humano

O documento explica, em linguagem humana, o fluxo completo do endpoint. Uma pessoa
deve conseguir entender o que entra, como é validado, quais decisões são tomadas,
quais componentes participam, quais efeitos acontecem e como cada caminho termina
sem precisar reconstruir o fluxo lendo o código.

É válido e esperado citar, com links para os arquivos:

- nome e rota do endpoint;
- controller;
- DTO ou tipo de entrada;
- command;
- services;
- repositories;
- services externos, mensageria e cache;
- entidades e tipos intermediários relevantes;
- tipo ou classe de saída.

Essas referências ancoram a explicação no código atual. Elas não substituem a
descrição humana.

### O que não documentar

Não copiar integralmente:

- classes, funções ou métodos;
- interfaces e DTOs completos;
- blocos de `if` ou `switch`;
- queries;
- bodies extensos;
- implementação de mapeamentos;
- trechos de teste.

Código pequeno só é aceito quando indispensável para explicar um contrato que não
possa ser comunicado claramente em texto. Preferir sempre nomear o símbolo, criar
um link para o arquivo e explicar sua responsabilidade e resultado.

A documentação não replica o código linha a linha e não funciona como API reference
gerada. Quando o código mudar, a narrativa deve continuar legível e descrever a nova
verdade.

### Fluxo interno obrigatório

Organizar o fluxo em hierarquia Markdown, seguindo a execução:

1. entrada no controller e validação;
2. chamada do command pelo controller;
3. preparação dos contratos necessários;
4. decisões e branches dentro do command;
5. chamada de cada service pelo command;
6. acesso a repository, Redis, mensageria ou serviço externo pelo service;
7. retorno dos resultados ao command;
8. montagem da response pelo command;
9. devolução pelo controller.

Cada branch relevante recebe subtítulo ou lista aninhada própria. O leitor deve
visualizar claramente qual condição conduz a qual service e qual dependência é
alcançada.

O código continua sujeito a `06-logging-e-rastreabilidade.md`, mas o documento do
endpoint não replica mensagens, payloads sanitizados nem a sequência de logs.
Observabilidade é documentada somente quando for requisito funcional excepcional.

### Todos os caminhos possíveis

Documentar o caminho feliz e todos os caminhos alternativos ou de erro conhecidos:

- falha de validação antes do command;
- ausência, conflito ou estado inválido de dados;
- cada decisão condicional do command;
- retorno vazio;
- falha de repository ou Redis;
- timeout ou erro de serviço externo;
- falha de mensageria;
- retry, idempotência e concorrência;
- resposta e efeitos colaterais de cada caminho.

Não agrupar erros com comportamentos diferentes em um cenário genérico. Cada cenário
informa gatilho, sequência interna, resultado HTTP, efeitos persistidos e
possibilidade de recuperação.

Imediatamente abaixo do título de cada cenário, registrar o seed necessário e o
cURL completo que aciona aquele caminho. Seed ausente é declarado como
`não se aplica` com justificativa; o cURL nunca é omitido. Seguir
`05-seeds-e-curls-de-cenario.md`.

Exemplos de request e response, quando úteis, devem ser mínimos, sanitizados e
secundários à explicação humana.
