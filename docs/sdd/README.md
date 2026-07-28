# SDD do monorepo Dall Fit

Este diretório reúne a verdade vigente do sistema e o histórico das demandas que
levaram até ela. Documentos vivos descrevem o comportamento atual; feature specs e
ADRs preservam o contexto histórico de entregas e decisões. Detalhes vigentes
exclusivos de backend ou frontend ficam no SDD do projeto proprietário.

## Estrutura

- `base/`: documentação viva da arquitetura, workspace, qualidade e contratos
  transversais vigentes.
- `adr/`: histórico de decisões arquiteturais, alternativas e consequências.
- `features/`: specs autocontidas das demandas e registro histórico das entregas.
- `flows/`: documentação funcional viva das jornadas ponta a ponta vigentes.
- `templates/`: modelos obrigatórios para novos documentos.

Documentação específica:

- backend: `api/docs/sdd/`;
- frontend: `ui/docs/sdd/`.

## Regra de escopo

| Mudança                                                          | Documento proprietário                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Workspace, dependências entre projetos, CI ou padrão transversal | `docs/sdd/base/` ou `docs/sdd/adr/`                                    |
| Demanda ou atividade com escopo e critérios próprios             | `docs/sdd/features/`                                                   |
| Jornada ponta a ponta                                            | `docs/sdd/flows/`                                                      |
| Endpoint, regra ou integração exclusiva do backend               | `api/docs/sdd/`                                                        |
| Rota, tela ou interação exclusiva do frontend                    | `ui/docs/sdd/`                                                         |
| Request, response, entidade ou enum compartilhado                | `docs/sdd/base/03-contratos-compartilhados.md` e docs dos consumidores |

Não duplicar a mesma verdade nos três SDDs. O documento de nível superior descreve
a coordenação; o documento local contém os detalhes do projeto e é referenciado
por link relativo.

A estratégia transversal de MSW, mocks de repositories e bancos efêmeros nos E2E
está registrada em
`adr/ADR-0001-estrategia-de-mocks-e-bancos-de-teste.md`.

## Fluxo obrigatório em duas fases

### Fase 1 — especificação da feature

1. Ler os documentos `base/` deste nível e dos projetos afetados.
2. Ler os fluxos, endpoints e rotas afetados para compreender a verdade vigente.
3. Criar ou refinar somente a spec autocontida em `features/`, com escopo, critérios
   de aceite, decisões, impactos e plano de testes suficientes para que o usuário
   valide tudo que será executado.
4. Não alterar código, configuração, contratos executáveis, mocks, testes ou SDDs
   vivos nesta fase.
5. Apresentar a feature, encerrar o trabalho e aguardar uma ordem posterior e
   explícita do usuário para iniciar sua implementação.

O pedido de criação, documentação, detalhamento, revisão ou refinamento de uma
feature nunca autoriza sua implementação no mesmo turno. Essa separação é um limite
de autorização, não apenas uma ordem recomendada.

### Fase 2 — implementação autorizada

Somente uma mensagem posterior à apresentação da feature, como `implemente a
feature <arquivo>`, inicia esta fase:

1. reler a feature validada e os SDDs vivos afetados;
2. implementar código, configuração, contratos, mocks e testes;
3. atualizar na mesma entrega toda documentação viva cujo comportamento mudou;
4. revisar API e UI para remover componentes, funções e métodos que tenham ficado
   sem uso;
5. executar os comandos de validação aplicáveis a partir da raiz.

A feature validada não é silenciosamente adaptada durante a implementação. Se uma
descoberta exigir mudança em seu escopo ou decisões, a implementação deve parar e a
demanda retorna à fase de especificação para nova validação e nova autorização.

Quando o usuário determinar explicitamente que uma atividade não cria feature,
seguir somente o escopo solicitado. Essa exceção é apropriada, por exemplo, para
ajustes estruturantes na própria documentação base.

Uma feature não substitui a documentação viva. Padrões permanentes descobertos
durante uma demanda devem ser incorporados em `base/`; decisões com trade-offs
relevantes devem ser registradas em `adr/`.

## Histórico de demandas

`features/` contém documentos autocontidos que permitem entender o problema, o
escopo, os critérios e as decisões de uma atividade sem depender de conversas
externas. Ela pode ser refinada durante a fase de especificação. A ordem explícita
de implementação transforma o conteúdo validado no contrato da entrega.

Depois que a demanda for entregue, a feature:

- não é editada, renomeada nem removida;
- não é atualizada para acompanhar mudanças futuras do sistema;
- não deve ser interpretada como descrição do comportamento vigente;
- permanece como registro histórico da atividade naquele momento.

A feature não registra status, etapas de ciclo de vida ou data de conclusão. O
ticket e o histórico do repositório preservam essa cronologia. Uma correção ou
evolução posterior cria outra feature e referencia a anterior quando for útil.
Detalhes completos estão em `base/04-governanca-do-sdd.md`.

Os critérios de aceite da feature registram como a entrega foi validada. Para UI,
usar o link local reproduzível do cenário; para API, referenciar o cenário do
endpoint que contém seed e cURL. Quando não houver reprodução direta, declarar
`não se aplica` com justificativa.

## Documentação viva

Arquivos em `base/`, `flows/`, `api/docs/sdd/base/`,
`api/docs/sdd/endpoints/`, `ui/docs/sdd/base/` e `ui/docs/sdd/routes/`
descrevem somente o comportamento atual. Eles não acumulam histórico de tickets.

Todo cenário funcional deve informar pré-condições, entrada, ação e resultado
esperado. Rotas de UI incluem um `Link para testar:` reproduzível. Endpoints
incluem método, caminho, autenticação, exemplos sanitizados e respostas por status.

## Validação

Mudanças em código, configuração, contratos ou comportamento devem aprovar:

```bash
pnpm lint
pnpm test
pnpm test:coverage:ci
pnpm build
```

Mudanças de endpoint, wiring, MongoDB ou Redis executam também:

```bash
pnpm -C api test:e2e
```

Depois da adoção do Playwright, mudanças em jornadas ou cenários integrados da UI
executam também:

```bash
pnpm test:integration
```

Mudanças exclusivamente Markdown dispensam esses comandos; a entrega deve registrar
que a validação foi omitida por ser `docs-only`.
