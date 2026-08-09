# Feature Spec: TypeScript estrito e fronteiras públicas mínimas

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [`FIT-0031`](https://github.com/eduardodallmann/dall-fit/issues/31).
- Problema:
  - a API possui `strictNullChecks`, mas não ativa `strict` e desabilita
    explicitamente `noImplicitAny`, `strictBindCallApply` e
    `noFallthroughCasesInSwitch`;
  - a configuração específica de ESLint da API desliga
    `@typescript-eslint/no-explicit-any` para todo o backend;
  - as duas unidades compiladas pelo build da UI, aplicação/testes e arquivos de
    tooling, não declaram `strict: true`;
  - `@dall-fit/types` publica `RequestContract`, `SortDirection` e
    `SortDirectionValue` sem consumidores vigentes;
  - `PersonModule` exporta `MongooseModule` e `PersonRepository`, ampliando a API
    pública do domínio além dos services permitidos pela arquitetura;
  - `TrainingPlanModule` importa `PersonModule` para que os guards aplicados por
    `AdminOnly` resolvam `FindPersonByIdService`: embora `AuthModule` importe
    `PersonModule`, ele não o reexporta, e o Nest instancia os guards no contexto
    do módulo proprietário do controller.
- Resultado: API, UI e seus testes/tooling compilam sob TypeScript estrito, a API
  não possui permissão global para `any`, e as superfícies públicas do pacote de
  tipos e dos módulos Nest expõem somente dependências com consumidores
  arquiteturalmente válidos, sem mudar comportamento funcional ou contrato HTTP.
- Referências locais:
  - `docs/sdd/base/01-arquitetura-do-monorepo.md`;
  - `docs/sdd/base/02-workspace-e-qualidade.md`;
  - `docs/sdd/base/03-contratos-compartilhados.md`;
  - `api/docs/sdd/base/01-arquitetura.md`;
  - `api/docs/sdd/base/03-testes-e-qualidade.md`;
  - `ui/docs/sdd/base/01-arquitetura.md`;
  - `ui/docs/sdd/base/04-testes-e-qualidade.md`;
  - `api/tsconfig.json`, `ui/tsconfig.app.json` e `ui/tsconfig.node.json`;
  - `eslint/api.config.mjs`;
  - `packages/types/src/index.ts`, `packages/types/src/contracts.ts` e
    `packages/types/src/enums.ts`;
  - `api/src/person/person.module.ts`;
  - `api/src/auth/auth.module.ts`;
  - `api/src/auth/guards/session-auth.guard.ts`;
  - `api/src/auth/decorators/admin-only.ts`;
  - `api/src/training-plan/training-plan.module.ts`.
- Referências oficiais:
  - [TypeScript — `strict`](https://www.typescriptlang.org/tsconfig/strict.html);
  - [TypeScript — `noImplicitAny`](https://www.typescriptlang.org/tsconfig/noImplicitAny.html);
  - [TypeScript — `strictBindCallApply`](https://www.typescriptlang.org/tsconfig/strictBindCallApply.html);
  - [TypeScript — `noFallthroughCasesInSwitch`](https://www.typescriptlang.org/tsconfig/noFallthroughCasesInSwitch.html);
  - [typescript-eslint — `no-explicit-any`](https://typescript-eslint.io/rules/no-explicit-any/);
  - [NestJS — Modules](https://docs.nestjs.com/modules).
- Features relacionadas: não se aplica — esta demanda reforça regras vivas de
  qualidade e encapsulamento, sem evoluir uma feature histórica específica.

## Escopo

### Incluído

- levantar os diagnósticos produzidos pela versão instalada do TypeScript antes de
  alterar cada configuração, separando erros de API, UI e tooling;
- ativar `strict: true` na API e remover overrides que desabilitem opções da família
  estrita, mantendo `noFallthroughCasesInSwitch: true` de forma explícita porque
  essa opção não é ativada por `strict`;
- ativar `strict: true` nas duas unidades referenciadas por `ui/tsconfig.json`:
  `ui/tsconfig.app.json` e `ui/tsconfig.node.json`;
- corrigir semanticamente os diagnósticos em código de produção, testes, mocks,
  fixtures, seeds, scripts e arquivos de configuração alcançados pelos respectivos
  projetos TypeScript;
- remover de `eslint/api.config.mjs` a desativação global de
  `@typescript-eslint/no-explicit-any`, deixando a regra herdada do preset
  type-aware voltar a valer na API;
- substituir `any` por tipos concretos, generics, `unknown` com narrowing, guards ou
  contratos tipados; uma exceção inevitável de integração deve ser mínima,
  adjacente ao uso e conter justificativa verificável;
- confirmar por busca no repositório, barrel público, declarações geradas e usos de
  runtime que `RequestContract`, `SortDirection` e `SortDirectionValue` não possuem
  consumidores; confirmada a ausência, remover suas declarações e exports e apagar
  `packages/types/src/enums.ts` se ele ficar vazio;
- manter `MongoPersonRepository` e o token `PersonRepository` como providers
  internos de `PersonModule`, mas remover `MongooseModule` e `PersonRepository` de
  `exports`;
- preservar como API pública de `PersonModule` somente os services que possuem
  consumidores válidos: `FindOrCreatePersonService`, `FindPersonByIdService` e
  `UpdatePersonThemeService`;
- reexportar `PersonModule` por `AuthModule`, porque os guards públicos de
  autenticação dependem de `FindPersonByIdService` quando são aplicados em
  controllers pertencentes a módulos consumidores;
- remover o import direto de `PersonModule` de `TrainingPlanModule`, deixando a
  dependência transitiva explícita pela fronteira pública de `AuthModule`, e
  confirmar que o módulo de planos continua resolvendo todo o grafo;
- atualizar os SDDs vivos afetados durante a futura implementação para registrar a
  política estrita, a superfície pública efetiva de `@dall-fit/types` e o
  encapsulamento dos módulos da API.

### Não incluído

- criar ou alterar endpoint, request, response, entidade, regra de negócio, schema
  MongoDB, índice, cache, autenticação, autorização ou fluxo da aplicação;
- alterar telas, rotas, conteúdo, navegação, acessibilidade, estilos ou
  comportamento do PWA;
- criar novos contratos compartilhados para substituir símbolos sem consumidores;
- manter símbolos obsoletos por compatibilidade especulativa ou criar re-exports
  deprecated sem consumidor identificado;
- habilitar opções adicionais que não pertencem à família `strict`, como
  `noUncheckedIndexedAccess` ou `exactOptionalPropertyTypes`, exceto
  `noFallthroughCasesInSwitch` já exigido pela demanda;
- atualizar TypeScript, typescript-eslint, NestJS ou qualquer outra dependência;
- alterar a arquitetura controller → command → service → repository;
- exportar repositories, models Mongoose ou módulos de infraestrutura para atender
  a um consumidor hipotético;
- realizar refactors de estilo, renomeações ou reorganizações não necessários para
  resolver os diagnósticos estritos e estreitar as fronteiras descritas;
- alterar `AppModule` ou alterar `AuthModule` além da reexportação explícita de
  `PersonModule` necessária ao grafo dos guards.

## Projetos e documentação afetados

- API e endpoints:
  - `api/tsconfig.json`, arquivos TypeScript alcançados por ele,
    `eslint/api.config.mjs`, `PersonModule`, `AuthModule` e `TrainingPlanModule`
    são afetados;
  - `api/docs/sdd/base/01-arquitetura.md` deve registrar a fronteira pública dos
    módulos, e `api/docs/sdd/base/03-testes-e-qualidade.md` deve registrar o
    typecheck estrito;
  - documentos em `api/docs/sdd/endpoints/` não mudam, pois método, path, contrato,
    autorização, fluxo interno e resposta permanecem iguais.
- UI e rotas:
  - `ui/tsconfig.app.json`, `ui/tsconfig.node.json` e os arquivos que eles incluem
    são afetados somente por tipagem;
  - `ui/docs/sdd/base/04-testes-e-qualidade.md` deve registrar o typecheck estrito;
  - documentos em `ui/docs/sdd/routes/` não mudam, pois nenhum comportamento de
    tela é alterado.
- Workspace:
  - `docs/sdd/base/02-workspace-e-qualidade.md` deve tornar explícita a política de
    TypeScript estrito e de exceções locais de lint;
  - `docs/sdd/base/03-contratos-compartilhados.md` deve refletir a superfície
    pública restante e deixar de exemplificar símbolos removidos.
- Fluxos: não se aplica — ordem, navegação e troca de dados entre etapas não mudam.
- Contratos em `@dall-fit/types`: a API pública é reduzida pela remoção de símbolos
  sem consumidor; os contratos HTTP vigentes permanecem inalterados.
- Decisões arquiteturais: não exige ADR; a mudança aplica regras já documentadas de
  dependência mínima, código sem uso e encapsulamento de repository, sem adotar
  tecnologia ou trade-off transversal novo.
- Handlers e fixtures MSW: nenhum cenário ou payload muda; ajustes de tipos são
  permitidos somente quando exigidos pelo compilador estrito.
- Mocks de repositories/caches nos unitários da API: nenhum comportamento muda;
  mocks existentes devem continuar tipados contra suas ports e podem receber
  somente ajustes de tipo necessários.
- Fixtures MongoDB/Redis nos E2E: nenhum dado ou cenário muda; ajustes de tipo são
  permitidos somente quando exigidos pelo compilador estrito.

## Requisitos funcionais

1. O typecheck da API deve analisar código de produção e testes com `strict: true`,
   sem opção da família estrita explicitamente desabilitada.
2. A API deve manter `noFallthroughCasesInSwitch: true` e rejeitar um `case` não
   vazio que termine sem `break`, `return` ou `throw`.
3. O build/typecheck da UI deve compilar tanto `tsconfig.app.json` quanto
   `tsconfig.node.json` com `strict: true`.
4. Nenhum diagnóstico deve ser silenciado apenas para concluir a migração com
   `any`, `as unknown as`, non-null assertion, `@ts-ignore`, disable amplo de ESLint
   ou relaxamento de opção do compilador.
5. Valores de origem externa ou formato desconhecido devem entrar como `unknown` e
   ser validados ou estreitados antes do uso. Assertions existentes ou novas só
   podem permanecer quando expressarem uma garantia real não representável pelo
   compilador e estiverem apoiadas por validação, contrato ou API da dependência.
6. `@typescript-eslint/no-explicit-any` deve valer para toda a API pela configuração
   type-aware comum. Exceções inevitáveis devem atingir apenas a expressão ou linha
   de integração necessária e explicar por que um tipo seguro não é possível.
7. `RequestContract`, `SortDirection` e `SortDirectionValue` devem desaparecer da
   API pública e do código-fonte do pacote somente depois de uma busca sem
   consumidores válidos. Nenhum consumidor deve trocar esses símbolos por cópia
   local especulativa.
8. Um módulo que importe ou receba `PersonModule` por reexportação deve enxergar
   somente os três services públicos. `MongooseModule`, models, adapters e a port
   `PersonRepository` permanecem encapsulados no domínio `person`.
9. `AuthModule` deve reexportar `PersonModule` para disponibilizar a dependência
   legítima de `SessionAuthGuard` aos módulos que consomem os guards públicos.
10. `TrainingPlanModule` deve inicializar e executar importando somente
    `AuthModule`, sem importar `PersonModule` diretamente.
11. Requests, responses, dados persistidos, logs, status HTTP, telas e interações
    observáveis devem permanecer equivalentes ao estado anterior à refatoração.
12. Se a busca descobrir outro consumidor válido, uso indireto por decorator/injeção,
    carregamento dinâmico ou API pública externa para qualquer símbolo ou módulo a
    remover, a implementação deve parar e esta feature deve ser refinada antes de
    prosseguir.

## Requisitos não funcionais

- Manutenibilidade:
  - o compilador e o lint devem detectar implicit `any`, chamadas `bind/call/apply`
    incompatíveis, fallthrough acidental e `any` explícito não justificado;
  - barrels e `exports` de módulos representam consumidores presentes, não pontos
    de extensão hipotéticos.
- Performance: não deve haver mudança de bundle, query, I/O ou trabalho em runtime,
  exceto eventual remoção de metadados/imports sem uso.
- Segurança e privacidade: a migração não pode relaxar validação de entrada,
  redaction de logs ou tipos de autenticação; `unknown` exige narrowing antes de
  acessar dados externos.
- Observabilidade: mensagens, níveis e payloads sanitizados dos logs permanecem
  iguais, salvo ajuste de tipo sem efeito no valor registrado.
- Compatibilidade:
  - a versão `~6.0.3` instalada do TypeScript é a referência executável;
  - o pacote é privado e os símbolos removidos não possuem consumidores vigentes;
  - futuras atualizações do TypeScript podem acrescentar verificações à família
    `strict` e devem ser tratadas pela própria atualização, não por flags desligadas
    preventivamente nesta entrega.

## Critérios de aceite

### Cenário 1 — API aprova TypeScript estrito e lint sem exceção global

- Forma de validar: `pnpm -C api typecheck` e `pnpm lint`.
- Given: todo código, teste, seed e script TypeScript incluído pela configuração da
  API.
- When: o compilador e o ESLint são executados.
- Then: os comandos terminam sem diagnóstico.
- And: `api/tsconfig.json` possui `strict: true`, não desabilita opção da família
  estrita e possui `noFallthroughCasesInSwitch: true`.
- And: `eslint/api.config.mjs` não desliga `no-explicit-any` globalmente.
- And: não existe supressão ampla ou escape de tipo introduzido apenas para fazer o
  gate passar.

### Cenário 2 — UI aprova TypeScript estrito em aplicação e tooling

- Forma de validar: `pnpm -C ui typecheck`.
- Given: `ui/tsconfig.json` referencia as unidades de aplicação/testes e tooling.
- When: o build TypeScript das duas referências é executado.
- Then: o comando termina sem diagnóstico.
- And: `ui/tsconfig.app.json` e `ui/tsconfig.node.json` possuem `strict: true` sem
  override que rebaixe a família estrita.

### Cenário 3 — Pacote compartilhado expõe somente contratos consumidos

- Forma de validar: busca de referências no repositório, inspeção do barrel e das
  declarações geradas após `pnpm -C packages/types build`.
- Given: a API, a UI e o próprio pacote foram pesquisados por declaração, import,
  re-export e uso de `RequestContract`, `SortDirection` e `SortDirectionValue`.
- When: o pacote é compilado.
- Then: nenhum dos três símbolos aparece no código-fonte público nem em
  `dist/index.d.ts`.
- And: API e UI continuam compilando contra os contratos restantes.
- And: `packages/types/src/enums.ts` não permanece vazio nem é mantido por uso
  hipotético.

### Cenário 4 — Fronteiras Nest permanecem encapsuladas e funcionais

- Forma de validar: inspeção dos metadados dos módulos e
  `pnpm -C api test:e2e`.
- Given: a aplicação completa é composta com os módulos de pessoa, autenticação e
  planos de treino.
- When: o Nest inicializa o grafo e os E2E vigentes exercitam autenticação e planos.
- Then: não ocorre erro de resolução de dependência.
- And: `PersonModule` não exporta `MongooseModule` nem `PersonRepository`.
- And: `AuthModule` reexporta `PersonModule` para sustentar as dependências dos
  guards que ele torna públicos.
- And: `TrainingPlanModule` não importa `PersonModule` diretamente.
- And: os services públicos de pessoa continuam disponíveis aos consumidores
  válidos e o repository continua acessível somente dentro do domínio por services.

### Cenário 5 — Refatoração preserva comportamento e todos os gates

- Forma de validar: quality gates completos do monorepo.
- Given: configurações, tipagem, exports e módulos foram ajustados.
- When: lint, testes, cobertura, E2E, integrados e build são executados.
- Then: todos terminam com sucesso sem alteração dos cenários funcionais vigentes.
- And: nenhum endpoint, rota, contrato HTTP, fixture de comportamento ou dado
  persistido foi alterado.

## Estratégia de entrega e compatibilidade

1. Registrar o baseline dos comandos atuais e executar o compilador com as opções
   estritas pela linha de comando para inventariar erros antes de editar os
   `tsconfig`.
2. Corrigir a API por grupos de diagnóstico, começando pelas fronteiras externas e
   mocks, usando tipos concretos, generics, `unknown`, narrowing e `satisfies`.
3. Ativar `strict`, remover os overrides contraditórios da API, ativar fallthrough
   e restaurar `no-explicit-any`; reexecutar typecheck e lint antes de avançar.
4. Corrigir separadamente `tsconfig.app.json` e `tsconfig.node.json`, ativando
   `strict` em cada unidade somente junto das correções correspondentes.
5. Pesquisar os símbolos públicos candidatos em todo o monorepo e no resultado de
   build do pacote; remover declaração, barrel, arquivos vazios e referências
   documentais em uma mudança atômica.
6. Estreitar `PersonModule`, reexportá-lo por `AuthModule`, remover seu import
   direto de `TrainingPlanModule` e validar bootstrap e E2E antes de qualquer
   limpeza adicional de módulos.
7. Atualizar somente os SDDs vivos de arquitetura, qualidade e contratos listados
   nesta feature, preservando endpoints, rotas e flows sem mudança observável.
8. Revisar API e UI por imports, exports, helpers e arquivos tornados sem uso e
   remover apenas os que forem consequência direta desta entrega.
9. Executar todos os gates. A branch final não pode conservar flags temporárias,
   suppressions de migração nem configuração parcialmente estrita.

## Plano de testes

- executar `pnpm lint` para compilar `@dall-fit/types`, typecheck de API/UI e ESLint
  type-aware do monorepo;
- executar `pnpm test` para unitários de API e UI;
- executar `pnpm test:coverage:ci` para o gate de cobertura vigente;
- executar `pnpm -C api test:e2e` porque exports/imports de módulos Nest e wiring
  são alterados;
- executar `pnpm test:integration` para confirmar que a UI compilada estritamente
  preserva as jornadas Playwright vigentes; instalar Chromium pelo script vigente
  somente se o ambiente ainda não o possuir;
- executar `pnpm build` para validar geração de declarações do pacote, build Nest e
  build Vite;
- inspecionar `packages/types/dist/index.d.ts` e pesquisar no repositório os três
  símbolos removidos;
- não criar teste de comportamento novo apenas para aumentar cobertura: a mudança
  é protegida pelos compiladores, lint, inspeção de API pública, bootstrap e suítes
  funcionais existentes.

## Riscos e decisões

- `strict` é um grupo de opções e pode ganhar novas verificações em versões futuras
  do TypeScript. A decisão é aceitar essa proteção e corrigir regressões durante a
  atualização da dependência, sem desligar antecipadamente subflags.
- Trocar `any` mecanicamente por `unknown` apenas desloca o erro. Todo `unknown`
  precisa de narrowing antes do uso; quando o formato é conhecido, deve existir um
  tipo concreto.
- Assertions, non-null assertions e directives do compilador podem mascarar o mesmo
  risco que a migração pretende revelar. Elas não são solução padrão e exigem uma
  garantia verificável quando inevitáveis.
- Decorators, injeção do Nest, metadados Mongoose e valores exportados em runtime
  podem possuir uso indireto que uma busca textual simples não detecta. A validação
  do grafo confirmou que `AdminOnly` faz `SessionAuthGuard` depender de
  `FindPersonByIdService` no contexto de `TrainingPlanModule`; por isso
  `AuthModule` reexporta `PersonModule`, conforme o mecanismo oficial de
  reexportação de módulos do Nest.
- Remover um provider do array `exports` não remove seu registro local. A decisão é
  manter repository e adapter disponíveis dentro de `PersonModule`, expondo apenas
  services aos módulos consumidores.
- O `noFallthroughCasesInSwitch` não pertence à família `strict`; ele permanece
  explícito para não ser perdido durante a limpeza das flags atuais.
- A superfície pública de `@dall-fit/types` é privada ao monorepo, mas continua
  sendo um contrato entre projetos. Símbolos só são removidos depois de confirmar
  ausência de consumidor; se houver consumidor válido, a feature retorna à fase de
  especificação.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- API, UI, testes e tooling compilam com TypeScript estrito
- API sem permissão global para `any` e sem suppressions indiscriminadas
- `noFallthroughCasesInSwitch` ativo na API
- `RequestContract`, `SortDirection` e `SortDirectionValue` removidos após busca de
  consumidores
- `PersonModule` exporta apenas services válidos e mantém infraestrutura interna
- `AuthModule` reexporta `PersonModule` para os guards públicos
- `TrainingPlanModule` não importa `PersonModule` diretamente
- Comportamento, contratos HTTP, rotas, dados, logs e integrações preservados
- SDDs vivos de qualidade, contratos e arquitetura atualizados na implementação
- MSW, mocks e fixtures sem mudança de cenário ou payload
- Quality gates completos da raiz, E2E da API e integrados da UI aprovados
