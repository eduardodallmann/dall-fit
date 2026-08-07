# Seeds e cURLs de cenário

## Objetivo

Todo cenário documentado em `endpoints/` deve ser reproduzível localmente. Logo
abaixo do título do cenário, antes de Given/When/Then ou da explicação do fluxo,
devem aparecer:

1. o seed necessário para preparar o estado;
2. o cURL que aciona exatamente aquele cenário.

Essa regra aproxima a documentação de endpoint dos links reproduzíveis usados nas
rotas da UI.

## Formato obrigatório

Quando o cenário depende de estado prévio:

````md
### Cenário — Usuário ativo encontrado

**Seed**

```bash
pnpm -C api seed -- users:get-active
```

**cURL**

```bash
curl --request GET \
  --url http://localhost:4000/users/user-active-001 \
  --header 'authorization: Bearer local-test-token'
```

- Given:
````

Quando não depende de estado:

````md
### Cenário — Body inválido

**Seed:** não se aplica — a validação interrompe o fluxo antes de qualquer acesso a
MongoDB ou Redis.

**cURL**

```bash
curl --request POST \
  --url http://localhost:4000/users \
  --header 'content-type: application/json' \
  --data '{}'
```

- Given:
````

`Seed: não se aplica` sempre inclui uma justificativa. Não omitir silenciosamente o
seed.

## Convenção do comando

A API disponibiliza:

```bash
pnpm -C api seed -- <endpoint-slug>:<scenario-slug>
```

Identificadores vigentes incluem:

- `auth:person-new`, `auth:person-existing` e `auth:person-admin`;
- `training-plans:list`, `training-plans:create`, `training-plans:detail`,
  `training-plans:update`, `training-plans:delete`,
  `training-plans:create-workout`, `training-plans:delete-workout` e
  `training-plans:not-found`.

O identificador é estável, usa `kebab-case` em cada segmento e pertence ao cenário
documentado. Renomear ou remover um cenário atualiza atomicamente seed, documento e
testes.

## Responsabilidades do seed

Um seed:

- prepara todo o estado necessário ao cenário em MongoDB e Redis;
- pode preparar doubles locais de serviços externos ou mensageria quando o cenário
  exigir uma falha ou resposta determinística;
- usa os mesmos IDs, valores e condições presentes no cURL;
- é idempotente: execuções repetidas produzem o mesmo estado;
- limpa somente os dados que pertencem ao próprio cenário;
- não depende da execução anterior de outro seed;
- informa ao final qual cenário foi preparado;
- falha de forma explícita quando não consegue preparar alguma dependência.

Seeds podem reutilizar factories usadas pelos E2E, mas não reutilizam dumps inteiros
de ambientes.

## Organização

O entrypoint vigente é:

```text
test/seeds/cli.ts
```

O script `seed` do `api/package.json` executa esse arquivo com `tsx`. Quando o
volume justificar, cenários podem migrar para módulos sob `test/seeds/scenarios/`
sem alterar os identificadores públicos. Seeds não duplicam regra de negócio.

## Regras do cURL

Cada cURL:

- é copiável e executável contra a API local;
- usa URL completa, normalmente `http://localhost:4000`;
- informa método, path, query, headers e body relevantes;
- usa exatamente os dados preparados pelo seed;
- contém somente credenciais locais, fictícias e seguras;
- não possui placeholders indefinidos como `<id>` ou `<token>`;
- aciona naturalmente o branch, sem header ou query criado apenas para escolher um
  cenário;
- omite headers irrelevantes gerados por navegador ou ferramentas;
- permite observar o status e body esperados.

Se autenticação ou uma integração impedir um cURL local reproduzível, a mesma
mudança deve criar um mecanismo local seguro e documentado. Nunca copiar tokens de
ambientes reais.

## Relação entre cenário, seed e cURL

A documentação está inconsistente quando:

- o seed cria um ID e o cURL usa outro;
- o cURL não alcança o branch descrito;
- o seed prepara mais de um cenário implícito;
- a resposta depende de ordem, horário ou dado aleatório não estabilizado;
- o comando documentado não existe ou não conclui com sucesso;
- um erro documentado não pode ser reproduzido localmente.

Ao alterar um fluxo, executar o seed e o cURL de todos os cenários afetados e
registrar a validação no resumo da mudança.

## Segurança

- nenhum dado pessoal real;
- nenhum token, segredo ou credencial de ambiente;
- IDs claramente fictícios;
- logs do seed seguem `06-logging-e-rastreabilidade.md`, incluindo redaction,
  sanitização e formato quando forem emitidos por classes;
- seeds são bloqueados fora de ambientes local e de teste;
- o comando nunca limpa banco ou Redis sem validar explicitamente o ambiente alvo.
