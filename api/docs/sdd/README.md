# SDD da API

Aqui, **SDD** significa **Spec-Driven Development** (Desenvolvimento Orientado por
Especificação): o processo e a documentação usados para definir e validar o
comportamento do backend antes da implementação.

Este diretório é o contrato vivo exclusivo do backend Dall Fit.

## Estrutura

- `base/`: arquitetura, padrões de endpoint, logging e qualidade do backend.
- `endpoints/`: comportamento HTTP vigente de cada operação ou recurso.
- `templates/`: modelo para novos endpoints.

Features históricas das demandas, decisões que afetam o workspace, contratos
compartilhados e jornadas ponta a ponta pertencem ao SDD da raiz em
`../../../docs/sdd/`. Este nível contém a verdade vigente da API referenciada por
esses documentos.

## Fluxo obrigatório

1. Ler `base/`, o endpoint afetado, os fluxos transversais e a feature aberta
   relacionados.
2. Criar ou atualizar o documento do endpoint antes de implementar uma mudança de
   contrato, fluxo interno ou comportamento.
3. Para cada cenário, implementar ou validar o seed e o cURL reproduzíveis conforme
   `base/05-seeds-e-curls-de-cenario.md`.
4. Atualizar `@dall-fit/types` quando request, response, entidade ou enum for
   consumido pela UI.
5. Implementar testes unitários e E2E conforme o risco, sem criar uma suíte
   intermediária de integração.
6. Atualizar endpoint e fluxo na mesma mudança caso o comportamento observável
   tenha mudado.
7. Executar os quality gates a partir da raiz.

## Regra de documentação

Um documento de endpoint descreve somente o estado atual e explica em linguagem
humana o fluxo interno completo. Ele segue a execução do controller ao command, aos
services e às dependências acessadas por eles, até a response final.

Nomes de símbolos e links para controller, DTOs, command, services, repositories e
tipos de saída são obrigatórios quando existirem. Não copiar classes, DTOs, queries
ou blocos de implementação: referenciar o arquivo e explicar responsabilidade,
decisão, entrada e resultado.

O caminho feliz, todos os branches e todos os erros conhecidos devem ser detalhados
com profundidade suficiente para revisão técnica, implementação e derivação de
testes. O padrão completo está em `base/02-endpoints-e-contratos.md`.

Cada cenário começa com o seed necessário e um cURL copiável que aciona exatamente
aquele caminho. Quando não houver estado a preparar, declarar `não se aplica` e
justificar. A convenção está em `base/05-seeds-e-curls-de-cenario.md`.

O código segue a política de logging de
`base/06-logging-e-rastreabilidade.md`. Documentos de endpoint não reproduzem a
sequência nem as mensagens emitidas; registram observabilidade somente quando ela
for um requisito funcional excepcional.

Alterações Markdown exclusivas dispensam validação automatizada. Demais mudanças
devem aprovar `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci` e `pnpm build`.
Mudanças de endpoint, wiring, MongoDB ou Redis aprovam também
`pnpm -C api test:e2e`.

## Acesso por termos

[Leitura/aceite](endpoints/terms.md) e [administração](endpoints/admin-terms.md)
pertencem a `TermsModule`. Endpoints de negócio exigem recibo da vigente depois dos
guards habituais; sessão válida, isoladamente, não autoriza negócio.
