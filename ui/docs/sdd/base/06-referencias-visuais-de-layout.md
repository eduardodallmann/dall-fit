# Referências visuais de layout

## Objetivo

Screenshots podem complementar a documentação textual de uma rota para orientar
humanos e agentes de IA sobre o layout esperado. Seu uso é opcional e exclusivo
para validação visual de layout.

A documentação textual continua obrigatória, completa e proprietária de:

- comportamento;
- conteúdo e regras de exibição;
- estados e transições;
- validações;
- integrações;
- navegação;
- acessibilidade;
- cenários funcionais.

Uma imagem não substitui, reduz nem torna opcional nenhuma dessas informações.

## Regra de ativação

A validação visual só se aplica quando existir ao menos uma imagem em:

```text
ui/docs/sdd/routes/assets/<route-slug>/
```

São referências visuais os arquivos `.png`, `.webp`, `.jpg` ou `.jpeg` existentes
nesse diretório.

- diretório ausente: validação visual não se aplica;
- diretório presente, mas vazio: validação visual não se aplica;
- ao menos uma imagem presente: a rota deve referenciá-la e o layout correspondente
  deve ser validado.

Na ausência de imagens, agentes e revisores não devem:

- falhar a entrega por falta de referência visual;
- exigir captura ou comparação de screenshots;
- criar imagens apenas para satisfazer o processo;
- inferir que a documentação textual está incompleta.

A criação de referências visuais ocorre somente quando elas forem fornecidas ou
solicitadas como parte do escopo.

## Escopo exclusivo das imagens

Screenshots orientam somente aspectos de layout observáveis:

- composição e agrupamento;
- ordem e posição visual;
- alinhamento;
- distribuição de espaço;
- dimensões relativas;
- largura máxima e ocupação do viewport;
- número de colunas;
- comportamento responsivo visível;
- hierarquia visual e relação entre regiões.

Screenshots não são fonte de verdade para:

- textos e valores;
- regras funcionais;
- resposta de integrações;
- validações;
- semântica HTML;
- foco, teclado ou leitores de tela;
- estados não representados;
- valores exatos de tokens, breakpoints ou espaçamentos.

Valores exatos permanecem descritos em texto e implementados com os tokens do
projeto. Não medir pixels da imagem para inventar regras ausentes.

## Profundidade e seleção da matriz

A matriz visual cobre estados representativos, não todas as combinações funcionais
da aplicação. Cada rota navegável recebe uma referência base nos viewports móvel
`390x844` e desktop `1440x900`. Referências adicionais entram somente quando
acrescentarem uma diferença material de composição, hierarquia, dimensão ou
responsividade, especialmente:

- `Modal`, `Drawer`, `AlertDialog` ou `Popover` com superfície própria;
- modos de leitura e edição que alterem controles ou regiões inteiras;
- estados vazio, erro ou loading que substituam estruturalmente o conteúdo;
- etapas de uma superfície complexa, como coleta e prévia, quando sua composição
  for diferente.

Não criar uma referência separada apenas para variar texto, valor, toast, pending,
erro interno ou confirmação visualmente equivalente. Foco, teclado, concorrência,
rollback, transições e regras funcionais continuam nos testes comportamentais. Uma
rota simples normalmente conserva apenas o par base; rotas com overlays ou estados
estruturais mantêm somente as variações não redundantes necessárias para comunicar
o layout.

## Organização

Exemplo:

```text
ui/docs/sdd/routes/
├── profile.md
└── assets/
    └── profile/
        ├── mobile-390-success.png
        ├── mobile-390-error.png
        ├── desktop-1440-success.png
        └── desktop-1440-loading.png
```

Cada referência deve ser ligada ao documento da rota:

| Cenário         |   Viewport | Estado MSW        | Imagem                                    | Aspectos de layout relevantes       |
| --------------- | ---------: | ----------------- | ----------------------------------------- | ----------------------------------- |
| Sucesso mobile  |  `390x844` | `profile-success` | `assets/profile/mobile-390-success.png`   | Uma coluna e ação após o formulário |
| Sucesso desktop | `1440x900` | `profile-success` | `assets/profile/desktop-1440-success.png` | Formulário e resumo em duas colunas |

O nome do arquivo deve registrar viewport e estado. A tabela informa como reproduzir
o cenário e o que deve ser observado; a IA não precisa adivinhar a intenção da
imagem.

## Fluxo de validação

Quando existirem imagens para a rota afetada:

1. Ler integralmente a documentação textual da rota.
2. Inspecionar todas as imagens aplicáveis ao estado e viewport alterados.
3. Reproduzir o cenário pelo link e estado MSW documentados.
4. Renderizar no viewport exato da referência.
5. Comparar apenas os aspectos de layout declarados na tabela.
6. Corrigir divergências não intencionais.
7. Registrar no resumo quais referências foram verificadas.

Uma imagem de outro estado ou viewport não ativa validação para combinações que ela
não representa.

## Atualização das referências

Uma referência visual não deve ser sobrescrita automaticamente para fazer uma
implementação divergente parecer correta.

Quando a mudança de layout for intencional:

1. atualizar primeiro o contrato textual;
2. obter ou produzir a nova referência aprovada;
3. substituir a imagem vigente;
4. remover referências obsoletas;
5. atualizar a tabela da rota;
6. validar novamente no mesmo cenário e viewport.

Screenshots são documentação viva e não acumulam histórico visual.

## Dados e estabilidade

- usar somente dados fictícios e determinísticos;
- preferir cenários MSW nomeados;
- não capturar tokens, credenciais ou dados pessoais reais;
- estabilizar animações, timestamps, cursores e conteúdo randômico;
- manter fontes e assets carregados antes da captura;
- preferir PNG ou WebP sem perda;
- evitar imagens redundantes que não acrescentem uma variação de layout.

## Automação

Playwright é usado para testes integrados comportamentais conforme
`07-testes-integrados-playwright.md`, mas esses testes não exigem screenshots.
Regressão visual pode ser adicionada quando houver necessidade. As golden images
executáveis permanecem junto dos testes, separadas das referências curadas do SDD.

### Geração de candidatas para curadoria

O comando abaixo usa uma configuração Playwright isolada, sobe o mesmo Vite com
MSW Browser e captura a matriz declarada em
`ui/tests/sdd-screenshots/capture.spec.ts`:

```bash
pnpm capture:sdd
```

A configuração de captura sempre inicia e encerra seu próprio servidor na porta
`3100`; a porta precisa estar livre. Ela espera a confirmação de prontidão emitida
pelo Vite em vez de reutilizar um processo externo, evitando capturar uma instância
iniciada sem MSW.

As candidatas são recriadas em:

```text
ui/test-results/sdd-screenshots/<route-slug>/<arquivo>.png
```

Esse diretório é ignorado pelo Git e não ativa validação visual. O comando nunca
grava nem sobrescreve `routes/assets/`, portanto uma execução não transforma o
layout atual em referência aprovada. Cada captura define explicitamente rota,
estado MSW, viewport e condição observável de prontidão. A captura espera fontes e
assets locais ou mockados visíveis, reduz movimento, encerra animações e usa escala
de um pixel por CSS pixel. Miniaturas remotas do YouTube são ocultadas somente no
bitmap candidato, preservando sua área de layout sem tornar conteúdo externo uma
fonte instável.

Capturas base usam a página inteira para registrar conteúdo que ultrapasse o
viewport. Overlays são capturados somente no viewport, preservando backdrop,
ancoragem e dimensões do painel sem estender artificialmente a camada modal pela
altura total do documento. Cenários curados usam tema e timestamps determinísticos;
seletores MSW exclusivos `sdd-*` podem fixar dados temporais sem alterar contratos
ou comportamento de produção.

É possível gerar apenas parte da matriz pelo título da captura:

```bash
pnpm -C ui capture:sdd -- --grep 'training-plan'
```

Depois da execução:

1. revisar todas as candidatas aplicáveis;
2. descartar as que não representam um layout aprovado ou não acrescentam uma
   variação útil;
3. copiar somente as aprovadas para
   `ui/docs/sdd/routes/assets/<route-slug>/`;
4. preencher no documento da rota a tabela com cenário, viewport, estado MSW,
   imagem e aspectos de layout relevantes;
5. conferir novamente a referência no mesmo estado e viewport;
6. versionar juntos a imagem aprovada e o documento da rota.

Uma nova execução limpa apenas o diretório de candidatas. Referências já promovidas
para `routes/assets/` permanecem intocadas. Atualizar uma referência vigente exige
o fluxo explícito de aprovação descrito em “Atualização das referências”; não usar
o comando de geração como aceite automático.

Enquanto Playwright ainda não estiver adotado, as referências do SDD continuam
válidas para conferência de layout. A ausência de referências no SDD não exige
testes visuais.
