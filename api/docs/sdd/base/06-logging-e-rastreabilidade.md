# Logging e rastreabilidade

## Objetivo

Os logs do backend devem permitir reconstruir a sequência de execução de um
endpoint: entrada em cada método, retorno das dependências, caminho escolhido em
cada decisão e valor que cada método está prestes a devolver.

Esta política vale para todo método de classe que participe de um fluxo da API,
incluindo controllers, commands, services, repositories, adapters de MongoDB ou
Redis, clients externos, publishers e consumers. Métodos privados usados por essas
classes também seguem o padrão.

O backend usa o `Logger` do NestJS. Não usar `console.log`, `console.warn` ou
`console.error`.

## Limites atuais

Esta política padroniza os logs da aplicação com as dependências existentes. Ela
não introduz biblioteca adicional, correlação distribuída, tracing nem plataforma
externa de observabilidade. A adoção futura desses recursos exige atualizar esta
base e registrar ADR quando houver trade-offs arquiteturais ou operacionais.

## Formato da mensagem

Toda mensagem começa com:

```text
NomeDaClasse -> nomeDoMetodo -> etapa:
```

Usar os nomes exatos da classe e do método no código, preservando maiúsculas e
minúsculas. A etapa deve ser curta, estável e pesquisável.

Cada classe cria seu logger com o próprio contexto:

```ts
private readonly logger = new Logger(NomeDaClasse.name);
```

O contexto do `Logger` não elimina o prefixo textual. Os dois são mantidos para que
a mensagem continue rastreável em transportes e agregadores diferentes.

## Pontos obrigatórios

### Entrada do método

Todo método começa registrando seus parâmetros:

```ts
const params = sanitizeForLog(input);

this.logger.log('NomeDaClasse -> nomeDoMetodo -> params:', { params });
```

Quando houver vários argumentos, `params` representa um objeto nomeado:

```ts
const params = sanitizeForLog({ options, userId });

this.logger.log('NomeDaClasse -> nomeDoMetodo -> params:', { params });
```

Um método sem argumentos usa um objeto vazio:

```ts
this.logger.log('NomeDaClasse -> nomeDoMetodo -> params:', { params: {} });
```

O log de entrada ocorre antes da primeira decisão ou chamada de dependência, mas
somente depois que a camada de transporte tiver aplicado a validação que a precede.

### Retorno de uma dependência

O chamador registra todo retorno recebido de service, repository, Redis, broker,
client ou outra dependência. Em chamadas assíncronas, o log ocorre depois do
`await`:

```ts
const serviceResult = await this.profileService.execute(serviceParams);
const data = sanitizeForLog(serviceResult);

this.logger.log('NomeDaClasse -> nomeDoMetodo -> profileService return:', {
  data,
});
```

O nome da etapa usa o identificador da dependência no chamador seguido de
`return`. O método chamado também registra sua própria entrada e saída; o log no
chamador registra a transição entre as duas responsabilidades.

Retornos `null`, `undefined`, vazios ou negativos também são registrados, pois
frequentemente determinam o próximo branch.

### Etapas intermediárias

Após cada passo relevante executado dentro do método, registrar sua conclusão antes
de iniciar o próximo. Isso inclui normalização, cálculo, mapeamento, montagem de
contrato para uma dependência e mudança de estado que influencie o restante do
fluxo:

```ts
const serviceParams = mapToServiceParams(input);
const data = sanitizeForLog(serviceParams);

this.logger.log('NomeDaClasse -> nomeDoMetodo -> serviceParams prepared:', {
  data,
});
```

Usar `<etapa> completed:` quando não houver um resultado nominal mais claro.
Atribuições triviais que não representam avanço do fluxo não recebem um log
artificial. A divisão dos passos deve acompanhar as responsabilidades humanas
descritas no SDD do endpoint.

### Branches e decisões

Ao entrar em qualquer caminho de `if`, `else`, `switch`, ternário com comportamento
relevante ou decisão equivalente, registrar o branch escolhido antes de executar
seu primeiro passo:

```ts
const data = sanitizeForLog({ profileId });

this.logger.log('NomeDaClasse -> nomeDoMetodo -> existingProfile branch:', {
  data,
});
```

Cada caminho recebe nome humano e estável. Não usar mensagens genéricas como
`entered if`, `condition true` ou `else`, pois elas não explicam a decisão.

Não é obrigatório registrar todos os valores brutos usados pela condição. O
registro informa qual caminho foi escolhido e apenas o contexto seguro necessário
para identificá-lo.

### Retorno do método

Um método de classe nunca retorna diretamente uma expressão. O valor é atribuído a
uma variável, resumido ou sanitizado para o log, registrado e somente então
devolvido:

```ts
const result = buildResponse(serviceResult);
const data = sanitizeForLog(result);

this.logger.log('NomeDaClasse -> nomeDoMetodo -> return:', { data });

return result;
```

São proibidos:

```ts
return this.profileService.execute(params);
return buildResponse(data);
return { id, status };
```

Mais de um ponto de retorno é permitido somente quando cada caminho registra o
branch e o valor imediatamente antes do respectivo `return`. Quando isso não for
necessário, preferir um único retorno ao final.

Métodos sem valor de retorno registram a conclusão antes de terminar:

```ts
this.logger.log('NomeDaClasse -> nomeDoMetodo -> completed:', { data: {} });
```

### Efeitos sem retorno útil

Após escrita em MongoDB, alteração no Redis, publicação em broker ou outra operação
sem payload de retorno útil, registrar a conclusão e um resumo seguro do efeito:

```ts
const data = sanitizeForLog({ entityId, operation: 'saved' });

this.logger.log('NomeDaClasse -> nomeDoMetodo -> userRepository completed:', {
  data,
});
```

Nunca registrar documento completo, query com valores, mensagem integral ou
payload binário somente para demonstrar que o passo terminou.

### Erros

Erros funcionais criados intencionalmente são registrados antes do `throw` com
`warn`, incluindo código e contexto sanitizado:

```ts
this.logger.warn('NomeDaClasse -> nomeDoMetodo -> profileNotFound error:', {
  data,
});
```

Falhas técnicas são registradas com `error` no ponto em que forem tratadas,
traduzidas ou compensadas. Não criar `try/catch` apenas para repetir o mesmo erro em
todas as camadas. Erros não tratados são registrados pelo mecanismo global da
aplicação.

Stacks, objetos de driver e respostas externas brutas não entram como dados
estruturados comuns. Quando uma stack for necessária, ela é registrada somente no
ponto central responsável pelo erro e nunca é devolvida ao consumidor.

## Sequência esperada por camada

### Controller

1. recebe e valida a entrada;
2. registra `params` já sanitizados;
3. chama o command;
4. registra `<command> return`;
5. registra `return`;
6. devolve o resultado.

### Command

1. registra `params`;
2. prepara entradas dos services e registra a conclusão de cada preparação;
3. chama cada service e registra seu retorno;
4. registra todo branch escolhido antes de executá-lo;
5. monta a response;
6. registra `return`;
7. devolve a response.

### Service

1. registra `params`;
2. executa suas regras e registra etapas intermediárias e branches;
3. chama repository, Redis, client, broker ou outra dependência;
4. registra o retorno ou a conclusão de cada dependência;
5. registra `return` ou `completed`;
6. devolve o resultado.

### Repository e adapters

1. registram `params` sanitizados;
2. executam a operação de infraestrutura;
3. registram o resumo seguro do retorno ou da conclusão;
4. registram `return` ou `completed`;
5. devolvem o resultado.

Repositories não registram connection strings, queries com valores sensíveis,
documentos persistidos completos, dumps de cache ou comandos que exponham
credenciais.

## Segurança e sanitização

Segurança tem prioridade sobre completude. Os objetos `params` e `data` dos
exemplos sempre são representações sanitizadas; não são sinônimos para logar o
objeto original sem análise.

Nunca registrar:

- `authorization`, cookies, API keys, senhas, secrets ou tokens;
- documentos pessoais, dados bancários ou credenciais;
- nome, e-mail, telefone, endereço ou outro dado pessoal completo;
- bodies, entidades ou respostas externas integrais quando contiverem dados
  sensíveis;
- arquivos, buffers, imagens, documentos ou conteúdo binário;
- connection strings e configurações com credenciais;
- stacks fora do tratamento central autorizado.

Preferir:

- IDs técnicos fictícios ou autorizados pela política de privacidade;
- códigos de erro e status;
- contagens, flags e nomes de operações;
- listas de nomes de campos em vez de seus valores;
- máscaras, hashes não reversíveis ou últimos caracteres quando realmente
  necessários;
- resumos de coleções em vez de registrar cada item.

Sanitização acontece antes da chamada ao logger. Não confiar no transporte de logs
para remover dados depois. Um helper compartilhado de sanitização pode ser criado
quando houver repetição real, mas não deve esconder quais campos são permitidos.

## Volume e legibilidade

- Não registrar payload grande apenas porque ele é tecnicamente seguro.
- Em loops, registrar a entrada e um resumo final; não emitir um log por item sem
  necessidade operacional explícita.
- Não duplicar a mesma mensagem na mesma camada.
- Usar `log` para execução normal, `warn` para caminhos degradados ou erros
  funcionais e `error` para falhas técnicas tratadas.
- Mensagens não incluem valores interpolados. Dados variáveis ficam no segundo
  argumento estruturado.

## Documentação dos endpoints

Cada documento em `endpoints/` explica, em linguagem humana, os logs de seu fluxo e
informa:

- método e classe que emitem o log;
- etapa registrada;
- mensagem textual exata;
- quais dados sanitizados acompanham a mensagem;
- quais dados são ocultados;
- logs específicos de cada branch e cenário de erro.

O documento não copia a implementação do método. Mensagens de log e formatos
estruturados são contratos de observabilidade e podem aparecer integralmente.

## Validação e testes

O padrão é obrigatório em código novo ou modificado. A revisão deve verificar
entrada, retornos de dependências, branches, efeitos e saída.

Testes não devem mockar ou verificar cada chamada do logger apenas para reproduzir
a implementação. Criar asserts de log quando a mensagem:

- for requisito de auditoria ou observabilidade;
- comprovar que um branch operacional relevante foi escolhido;
- proteger redaction de segredo ou dado pessoal;
- representar alerta ou erro que precisa acionar monitoramento.

A proteção contra vazamento de dados sensíveis merece teste próprio quando houver
sanitizador ou payload de risco. O foco geral da suíte continua sendo regra de
negócio, não cobertura de linhas de logging.

## Exceção atual

O endpoint técnico `GET /` é um scaffold anterior a esta política e ainda não
possui logging. A exceção está registrada em `../endpoints/root.md`. Ela termina
quando esse endpoint ou seus métodos forem alterados, removidos ou transformados em
comportamento de produto.
