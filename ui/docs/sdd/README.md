# SDD da UI

Aqui, **SDD** significa **Spec-Driven Development** (Desenvolvimento Orientado por
Especificação): o processo e a documentação usados para definir e validar o
comportamento do frontend antes da implementação.

Este diretório é o contrato vivo exclusivo do frontend Dall Fit.

## Estrutura

- `base/`: arquitetura, rotas, componentes, estilo, testes e qualidade.
- `routes/`: comportamento funcional vigente de cada tela.
- `templates/`: modelo para novas rotas.

Features históricas das demandas do frontend e fluxos que coordenam frontend e
backend pertencem ao SDD da raiz em `../../../docs/sdd/`. Contratos HTTP detalhados
pertencem a `../../../api/docs/sdd/endpoints/`.

## Fluxo obrigatório

1. Ler `base/`, a rota afetada, os fluxos e a feature aberta relacionados.
2. Atualizar ou criar a spec viva da rota antes da implementação.
3. Se `routes/assets/<route-slug>/` contiver imagens, inspecioná-las e validar
   exclusivamente o layout conforme `base/06-referencias-visuais-de-layout.md`.
4. Implementar comportamento e testes observáveis.
5. Atualizar `@dall-fit/types` junto com a API quando o contrato compartilhado
   mudar.
6. Criar ou atualizar handlers e fixtures MSW para toda integração HTTP afetada.
7. Atualizar os fluxos da raiz quando ordem, navegação ou dados entre etapas
   mudarem.
8. Executar os quality gates pela raiz.

Toda construção ou alteração visual segue
`base/03-componentes-e-estilizacao.md`: consultar o catálogo oficial do HeroUI
antes de criar componentes, separar composição em `index.tsx` e apresentação em
`styles.ts`, e usar `tv` de `@heroui/styles` em toda estilização própria. Cada
documento de rota deve permitir que QA derive casos de teste sem consultar código
ou conversa externa.

Toda integração HTTP segue `base/05-mocks-de-api.md`.
Testes integrados de rotas e flows seguem
`base/07-testes-integrados-playwright.md`.

Referências visuais são opcionais e nunca substituem a documentação textual. Sem
imagens na pasta da rota, nenhuma validação visual é exigida.

Alterações Markdown exclusivas dispensam validação automatizada. Demais mudanças
devem aprovar `pnpm lint`, `pnpm test`, `pnpm test:coverage:ci` e `pnpm build`.
Depois da adoção do Playwright, mudanças em cenários integrados aprovam também
`pnpm test:integration`.
