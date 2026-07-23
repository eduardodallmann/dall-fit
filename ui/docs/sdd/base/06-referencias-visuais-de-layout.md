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

Enquanto Playwright ainda não estiver adotado, as referências do SDD continuam
válidas para conferência de layout. A ausência de referências no SDD não exige
testes visuais.
