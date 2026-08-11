# ADR-0005: Limites, concorrência e mídia dos planos de treino

- Status: `aceita`
- Data: `2026-08-10`
- Responsáveis: time Dall Fit

## Contexto

A árvore embutida decidida na ADR-0003 agora possui editor de exercícios,
reordenação e imagens externas. Sem limites e coordenação, writes concorrentes
poderiam sobrescrever partes distintas e o documento poderia crescer até o limite
físico do MongoDB. MongoDB e Vercel Blob também não oferecem transação comum.

## Decisão

Manter workouts e exercícios embutidos em `training_plans`, com no máximo 25
workouts e 50 exercícios por workout. Os cinco tipos usam discriminadores
Mongoose, a ordem física do array é pública e o aggregate possui `version` no
top-level. Toda mutação de plano existente usa ETag forte, `If-Match`, filtro CAS
com ownership/IDs/versão e um único incremento; ordem idêntica e remoção de imagem
já nula são no-op.

O limite operacional é 12 MiB, com warning seguro a partir de 8 MiB, 20 workouts
ou 40 exercícios. Elevar limites, alcançar 8 MiB ou exigir paginação/consulta
independente de exercícios obriga nova avaliação antes de separar coleções.

Imagens públicas guardam no MongoDB duas referências WebP e suas keys internas.
O original não é armazenado. Novas variantes são enviadas antes do CAS; falha
pré-commit tenta removê-las, e variantes antigas são removidas após o commit. A
associação MongoDB é a verdade; limpeza posterior é idempotente e um comando de
reconciliação, dry-run por padrão, remove órfãos apenas sob
`exercise-images/` no store público `gvi3tyf5ckqiqlak`.

Listagens usam ordem `{ createdAt: -1, _id: -1 }` e índice
`{ ownerPersonId: 1, createdAt: -1, _id: -1 }`. `autoIndex` fica ativo somente em
local/teste; preview/produção aplicam o conjunto versionado por comando protegido.

## Consequências

- leitura do editor continua sendo uma projeção única, e reordenação permanece
  atômica;
- alterações simultâneas em linhas diferentes conflitam intencionalmente; a UI
  serializa suas próprias mutações e nunca faz merge silencioso após `412`;
- o aggregate tem fronteiras mensuráveis antes do limite BSON;
- a limpeza de mídia é eventualmente consistente e observável, sem broker ou
  transação distribuída;
- uma futura extração exigirá feature e ADR próprias, não aumento silencioso dos
  limites.

## Links relacionados

- `ADR-0003-modelagem-dos-planos-de-treino.md`
- `../features/fit-0028-editor-exercicios-escalabilidade-concorrencia.md`
- `../flows/gestao-planos-treino-globais.md`
- `../../../api/docs/sdd/endpoints/global-training-plans.md`
