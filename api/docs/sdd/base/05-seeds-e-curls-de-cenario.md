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

- `duration-media:ready`, que prepara pessoa própria, plano ativo, exercício de
  duração com vídeo/instruções, PNG sintético em `/tmp/dall-fit-duration.png` e sessão
  em `/tmp/dall-fit-duration-token.txt`; upload segue o Blob privado configurado;

- `exercise-library:ready`, `exercise-library:limit`, `exercise-library:size`,
  `exercise-library:stale`, `exercise-library:read-only`,
  `exercise-library:not-found` e `exercise-library:image-failure`; preparam IDs
  FIT107 isolados, body em `/tmp/dall-fit-exercise-copy.json` e sessão Bearer local
  em `/tmp/dall-fit-exercise-library-token.txt`, com permissões restritas;

- `auth:person-new`, `auth:person-existing` e `auth:person-admin`;
- `auth:person-legacy`, `auth:person-theme-light` e
  `auth:person-theme-dark`;
- `auth:native-session`, que também cria uma sessão Bearer local no Redis e grava o
  token fictício com permissão restrita em
  `/tmp/dall-fit-native-session-token.txt`;
- `offline-training-lease:create`, `offline-training-lease:unchanged`,
  `offline-training-lease:takeover-required`, `offline-training-lease:takeover`,
  `offline-training-lease:no-active-plan` e
  `offline-training-lease:invalid-body`, que criam pessoa, sessão Bearer e o estado
  mínimo de plano/lease do caminho correspondente; esses seeds também gravam o
  cookie Web fictício em `/tmp/dall-fit-web-session-cookie.txt` para validar a
  restrição de canal;
- `offline-training-snapshot:ready`, `offline-training-snapshot:current`,
  `offline-training-snapshot:expired`, `offline-training-snapshot:revoked`, `offline-training-snapshot:terms-required` e
  `offline-training-snapshot:invalid`, que preparam pessoa, sessões, plano, lease
  e, quando aplicável, revisão corrente. O body v1 determinístico é gravado com
  permissão restrita em `/tmp/dall-fit-offline-training-snapshot.json`; os cenários
  de conflito, resolução, conclusão e cancelamento usam esse body com as
  transformações `jq` documentadas no endpoint;
- `training-plans:list`, `training-plans:create`, `training-plans:detail`,
  `training-plans:update`, `training-plans:delete`,
  `training-plans:create-workout`, `training-plans:delete-workout` e
  `training-plans:not-found`.
- `assistant:ready`, `assistant:draft-invalid` e `assistant:confirm`.

Os oito planos globais versionados usam um comando operacional próprio, pois
podem ser aplicados fora de local/teste: `pnpm -C api seed:assistant-globals` faz
dry-run e `--execute` aplica. Ambiente publicado exige a confirmação exata
documentada em `endpoints/global-training-plans.md`; ele nunca roda no startup.

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

## Cenários jurídicos locais

`terms:not-configured`, `terms:required`, `terms:accepted`, `terms:admin`, `terms:admin-required`,
`terms:draft` e `terms:updated` preparam documentos/recibos sintéticos, sessão nativa
em `/tmp/dall-fit-terms-token.txt`, cookie Web em `/tmp/dall-fit-terms-cookie.txt` e
bodies `dall-fit-terms-{fields,acceptance,publication}.json` no mesmo diretório,
com permissão `0600`. Exigem segredo de sessão configurado e Redis/Mongo locais;
recusam publicações externas à fixture, sem apagar documentos jurídicos de outros
usos. Usar banco local dedicado para esses cenários.

Seeds de negócio preparam recibos somente para pessoas sintéticas de cenário; isso
é fixture explícita, não parte do login. Seeds `auth:*` não fabricam concordância.
O bootstrap real da minuta possui outro comando, com confirmação/dry-run, descrito
em [admin-terms.md](../endpoints/admin-terms.md#bootstrap-operacional-da-minuta-inicial).

`terms:admin-required` prepara um administrador com publicação vigente e nenhum
recibo, para verificar administração disponível e uso pessoal bloqueado.
