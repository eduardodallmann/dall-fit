# Componentes e estilização

## Stack vigente

A UI usa:

- Tailwind CSS 4 para utilities, tokens e responsividade;
- HeroUI como design system e primeira fonte de componentes;
- `@heroui/styles`, construído sobre Tailwind Variants, para estilização própria,
  variantes e wrappers tipados.

O projeto não mantém uma dependência direta de `tailwind-variants`. `tv`,
`VariantProps` e as funções de variantes do HeroUI são importados de
`@heroui/styles`. Isso mantém a mesma implementação e versão usadas internamente
pelo design system.

Antes de construir ou alterar uma tela, consultar:

- [catálogo oficial de componentes HeroUI](https://heroui.com/en/docs/react/components);
- [styling e wrappers tipados](https://heroui.com/en/docs/react/getting-started/styling);
- [composição de componentes](https://heroui.com/en/docs/react/getting-started/composition).

## Ordem de decisão

Para cada necessidade visual ou interativa:

1. procurar o componente no catálogo do HeroUI;
2. usar diretamente sua API, variantes semânticas e compound components;
3. quando a necessidade for uma composição de domínio, compor componentes HeroUI;
4. somente quando não houver componente adequado, criar um componente próprio;
5. elementos sem comportamento próprio, como containers semânticos, permanecem
   explícitos no JSX e recebem classes produzidas por `styles.ts`.

Não recriar localmente `Button`, `Card`, `Alert`, `Input`, `Modal`, `Select` ou
outro componente existente no HeroUI. Um wrapper só é válido quando cria uma API
de domínio, aplica uma composição recorrente ou acrescenta variantes que o design
system não possui; não criar wrapper apenas para anexar uma classe a um elemento.

## Integração vigente

HeroUI é consumido por `@heroui/react` e `@heroui/styles`. `src/index.css`
preserva esta ordem obrigatória:

```css
@import 'tailwindcss';
@import '@heroui/styles';
@import '@fontsource-variable/inter';
```

HeroUI v3 não exige provider global. Não criar provider vazio apenas para envolver
a aplicação. Providers de locale, tema ou outra responsabilidade só entram quando
essa necessidade existir e estiver documentada.

Seus componentes são importados de `@heroui/react`; nenhum código do catálogo é
copiado ou gerado dentro do projeto.

## Política global de seleção de texto

`src/index.css` bloqueia declarativamente a seleção de texto em todos os elementos
do documento. A fronteira global inclui a árvore React e overlays montados por
portal diretamente no `body`, portanto componentes e rotas não repetem classes ou
listeners para aplicar essa política.

As únicas superfícies liberadas são controles nos quais o usuário realmente edita
texto e campos textuais `readonly` cujo valor pode ser consultado e copiado:

- `:read-write` cobre inputs textuais mutáveis, `textarea` e elementos
  `contenteditable`, inclusive `contenteditable="plaintext-only"` e seus
  descendentes efetivamente editáveis;
- `input` textual e `textarea` com `readonly` recebem a mesma liberação;
- checkbox, radio, range, color, file e controles de ação implementados com
  `input` não recebem a exceção textual;
- controles `disabled` preservam sua interação nativa.

A regra usa `user-select` e seu alias de compatibilidade
`-webkit-user-select`. Não usar listeners de `selectstart`, ponteiro, toque,
teclado, clipboard ou menu de contexto para reforçá-la. O bloqueio não altera
foco, navegação, cursor ou semântica e não é proteção contra leitura, inspeção ou
cópia programática do conteúdo.

## Tema global

O tema vigente foi gerado no Theme Builder do HeroUI e fica declarado em
`src/index.css`, depois dos imports globais. Ele sobrescreve exclusivamente as
variáveis semânticas públicas do HeroUI:

- cores de tema e seus respectivos foregrounds;
- cores de superfícies, campos, bordas, separadores e estados;
- `--radius` e `--field-radius`;
- `--font-sans`.

O modo claro é o fallback de `:root` e também responde a `.light`, `.default`,
`data-theme="light"` e `data-theme="default"`. Os tokens escuros respondem a
`.dark` ou `data-theme="dark"`. A aplicação controla exclusivamente
`data-theme="light" | "dark"` em `<html>` pelo `ThemeProvider` documentado em
`01-arquitetura.md`; não manter classe de tema paralela nem duplicar esse estado em
componentes. A escolha inicial usa a preferência local válida ou o sistema e a
reconciliação autenticada usa `Person.configs.theme` ou o sistema quando ela não
existe.

A fonte Inter Variable é fornecida localmente por `@fontsource-variable/inter`.
`src/index.css` carrega seus arquivos e define `--font-inter`, usado por
`--font-sans`. Não carregar uma segunda cópia por CDN, Google Fonts ou regra
`@font-face` manual.

Componentes consomem os tokens por nomes semânticos, como
`bg-background`, `text-foreground`, `bg-surface`, `text-muted` e `border-border`.
No tema escuro, `--field-background` e `--field-border` mantêm contraste semântico
em relação a `--surface` e `--overlay`, para que campos em cards e modais não
desapareçam visualmente no contêiner. O tema claro conserva sua relação própria de
superfície e borda.
Não copiar valores OKLCH ou raios do tema para `styles.ts`. Uma mudança global
do Theme Builder substitui os tokens em `src/index.css`; exceções locais continuam
expressas pelas variantes públicas do HeroUI ou por `tv`.

## Localização e estrutura

- reutilizável e transversal: `src/core/components/<component-name>/`;
- exclusivo de uma rota:
  `src/routes/<flow>/<route>/components/<component-name>/`.

Todo componente visual próprio segue:

```text
component-name/
├── index.tsx
├── styles.ts              # somente quando houver estilização própria
├── types.ts                 # somente quando o contrato justificar
├── use-component-name.ts    # somente quando houver lógica coesa e complexa
└── __tests__/
    └── index.test.tsx
```

Arquivos e pastas usam `kebab-case`; componentes e tipos usam inglês. Um barrel
expõe somente a API pública necessária.

Um componente nasce dentro da rota enquanto só existe um consumidor. Ele migra
para `core` quando possuir responsabilidade estável e reutilização real em mais de
uma rota. Não criar abstração transversal por possibilidade futura.

## Separação obrigatória de apresentação

`index.tsx` concentra API, estado, eventos, condições, semântica e composição. Toda
definição de estilização própria fica em `styles.ts`.

O arquivo principal:

- usa componentes do HeroUI e elementos semânticos nativos;
- não contém strings de classes Tailwind;
- não declara `tv`, slots, variants ou compound variants;
- não usa `style={{ ... }}`;
- pode aplicar em `className` somente o resultado de uma função importada de
  `./styles`, como `styles.content()` ou `buttonStyles({ tone })`;
- recebe e encaminha variantes por nomes semânticos, sem conhecer as utilities que
  as implementam;
- preserva semântica, foco, teclado, labels e estados acessíveis.

O arquivo `styles.ts`:

- declara e exporta as funções `tv`;
- mantém `base`, `slots`, `variants`, `compoundVariants` e
  `defaultVariants`;
- exporta tipos de variantes públicas derivados com
  `VariantProps<typeof variantFunction>`;
- não renderiza JSX nem exporta wrappers cuja única responsabilidade seja anexar
  classes;
- não contém regra de negócio, acesso a hooks de domínio ou transformação de
  dados.

O sufixo é `.ts` porque o arquivo exporta exclusivamente funções e tipos, sem JSX.
Um componente de apresentação com API própria continua em seu `index.tsx`; não é
movido para o arquivo de estilos.

### Exemplo de container estilizado

```ts
// styles.ts
import { tv, type VariantProps } from '@heroui/styles';

export const pageLayoutStyles = tv({
  slots: {
    page: 'flex min-h-svh flex-col bg-background text-foreground',
    content: 'mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6',
  },
  variants: {
    density: {
      compact: {
        content: 'gap-3',
      },
      comfortable: {
        content: 'gap-6',
      },
    },
  },
  defaultVariants: {
    density: 'comfortable',
  },
});

export type PageLayoutVariants = VariantProps<typeof pageLayoutStyles>;
```

```tsx
// index.tsx
import type { ReactNode } from 'react';

import { Card } from '@heroui/react';

import { pageLayoutStyles, type PageLayoutVariants } from './styles';

interface WorkoutPageProps extends PageLayoutVariants {
  children: ReactNode;
}

export function WorkoutPage({ children, density }: Readonly<WorkoutPageProps>) {
  const styles = pageLayoutStyles({ density });

  return (
    <main className={styles.page()}>
      <div className={styles.content()}>
        <Card>{children}</Card>
      </div>
    </main>
  );
}
```

O JSX mantém a semântica explícita e expressa intenção sem carregar strings ou
definições visuais. Variantes são valores semânticos; suas classes continuam
encapsuladas em `styles.ts`.

## Tailwind Variants pelo HeroUI

Importar sempre de:

```ts
import { tv, type VariantProps } from '@heroui/styles';
```

Usar:

- `base` para estilos invariantes;
- `slots` para partes coordenadas;
- `variants` para dimensões públicas semanticamente nomeadas;
- `defaultVariants` para o comportamento padrão;
- `compoundVariants` para combinações que exigem regra própria;
- `VariantProps<typeof styles>` para derivar tipos;
- `extend` para estender uma função de variantes do HeroUI.

Responsividade usa modifiers Tailwind dentro do `styles.ts`, como `sm:`, `md:` e
`lg:`. Não usar `withTV`, `withTv` ou `responsiveVariants`.

Nomes de variantes descrevem intenção, como `tone: 'positive'`, e não a utility,
como `green`. Não criar uma prop para cada classe possível.

O VS Code reconhece classes em `tv` por meio de
`tailwindCSS.classFunctions` em `.vscode/settings.json`.

## Customização do HeroUI

Preferir as props e variantes públicas do HeroUI. Se um componente precisar de
uma variante própria recorrente, criar o componente em `index.tsx` e estender em
`styles.ts` a função de variantes exportada por `@heroui/styles`.

```ts
// styles.ts
import { buttonVariants, tv, type VariantProps } from '@heroui/styles';

export const actionStyles = tv({
  extend: buttonVariants,
  variants: {
    emphasis: {
      normal: '',
      strong: 'font-semibold shadow-md',
    },
  },
  defaultVariants: {
    emphasis: 'normal',
  },
});

export type ActionVariants = VariantProps<typeof actionStyles>;
```

```tsx
// index.tsx
import { Button, type ButtonRootProps } from '@heroui/react';

import { actionStyles, type ActionVariants } from './styles';

export type ActionProps = Readonly<
  Omit<ButtonRootProps, 'className'> &
    ActionVariants & {
      className?: string;
    }
>;

export function Action({ className, emphasis, ...props }: ActionProps) {
  return (
    <Button {...props} className={actionStyles({ className, emphasis })} />
  );
}
```

Esse wrapper só deve existir quando `emphasis` representar uma decisão recorrente
da aplicação. Para o uso padrão, importar `Button` diretamente de
`@heroui/react`.

Não sobrescrever globalmente classes BEM do HeroUI para resolver um caso local.
Não usar classes literais diretamente no `index.tsx`, mesmo que a documentação
externa demonstre essa possibilidade.

## Tipagem de componentes

Seguir a recomendação atual do HeroUI:

- preferir imports nomeados de tipos, como `ButtonRootProps` e
  `AvatarRootProps`;
- como alternativa, usar `Button['RootProps']`;
- não usar `Button.RootProps`, pois essa sintaxe de namespace não é suportada;
- wrappers HeroUI omitem `className` quando precisam controlá-la e a reintroduzem
  explicitamente;
- variantes próprias derivam de `VariantProps<typeof variantFunction>`;
- props públicas são exportadas e usam `Readonly`;
- props condicionais usam unions quando isso impedir combinações inválidas.

`styles.ts` não transforma dados de negócio. A função `tv` recebe somente variantes
visuais tipadas e `className` quando a API pública permitir customização.

## Compound components e composição

Quando o HeroUI oferecer compound components, usar preferencialmente a sintaxe
principal:

```tsx
<Card>
  <Card.Header>
    <Card.Title>Resumo</Card.Title>
    <Card.Description>Dados do treino atual</Card.Description>
  </Card.Header>
  <Card.Content>{content}</Card.Content>
</Card>
```

Não substituir o root de um compound component sem compreender seu contexto,
slots e requisitos de acessibilidade. Quando a substituição for necessária,
seguir a documentação de composição e repassar todas as props fornecidas pelo
HeroUI ao elemento DOM compatível.

## Decomposição e complexidade

O `index.tsx` deve ser legível como composição das partes da tela. Evitar
componentes extensos que concentram regras, transformação de dados, múltiplos
estados e grandes árvores JSX.

Extrair uma parte para componente próprio quando ela:

- possui condição própria de exibição;
- contém um branch relevante ou bloco JSX extenso;
- pode receber um nome funcional claro;
- possui interação, estado ou cenário de teste próprio;
- é reutilizada;
- torna o componente pai difícil de entender sem percorrer seus detalhes.

Evitar ternários com blocos JSX e ternários aninhados. Um componente responsável
pelo branch usa retorno antecipado:

```tsx
export function OptionalMessage({
  shouldShow,
}: Readonly<{ shouldShow: boolean }>) {
  if (!shouldShow) {
    return null;
  }

  return <MessageContent />;
}
```

O componente pai permanece declarativo:

```tsx
export function WorkoutPage() {
  return (
    <Page>
      <Header />
      <OptionalMessage shouldShow={hasMessage} />
      <WorkoutForm />
    </Page>
  );
}
```

Condições triviais de um único elemento ainda podem usar renderização
condicional. A extração é obrigatória quando houver lógica, múltiplos elementos ou
branches relevantes.

## IA e documentação oficial

Para APIs atuais, agentes de IA consultam preferencialmente:

- `https://heroui.com/react/llms.txt`: índice rápido do HeroUI React;
- `https://heroui.com/react/llms-components.txt`: contratos dos componentes;
- `https://heroui.com/react/llms-patterns.txt`: padrões e receitas;
- `https://heroui.com/react/llms-full.txt`: documentação completa quando o
  contexto exigir.

Esses arquivos ajudam a evitar APIs antigas ou inventadas. O agente continua
obrigado a consultar este SDD primeiro: as páginas externas mostram possibilidades
do HeroUI, enquanto este documento define as restrições do Dall Fit.
O catálogo transversal e o processo de consulta das demais tecnologias ficam em
[`docs/sdd/base/05-documentacao-oficial-das-tecnologias.md`](../../../../docs/sdd/base/05-documentacao-oficial-das-tecnologias.md).

## Testes e validação visual

Testes de componente validam conteúdo, semântica, teclado, interações, estados e
variantes públicas. Não testar nomes internos de classes nem reproduzir a
implementação do estilo nos asserts.

Quando uma rota possuir imagens em `routes/assets/<route-slug>/`, alterações que
afetem composição ou responsividade validam o layout conforme
`06-referencias-visuais-de-layout.md`. Sem imagens, essa validação não se aplica.

## Checklist de revisão

- [ ] O catálogo HeroUI foi consultado antes de criar componente local
- [ ] `index.tsx` não contém classes Tailwind nem estilos inline
- [ ] Toda definição de apresentação própria está em `styles.ts` com `tv`
- [ ] `className` no JSX recebe somente resultados importados de funções de estilo
- [ ] Não existem wrappers cuja única responsabilidade seja anexar classes
- [ ] Props e variantes são derivadas e tipadas, não duplicadas manualmente
- [ ] Componentes extensos foram decompostos em partes nomeadas e testáveis
- [ ] O JSX não contém ternários extensos ou aninhados
- [ ] Semântica e acessibilidade do HeroUI foram preservadas
- [ ] Testes cobrem o contrato público e regras observáveis
- [ ] A documentação viva da rota foi atualizada quando necessário

## Referências

- [Componentes HeroUI](https://heroui.com/en/docs/react/components)
- [HeroUI com Vite](https://heroui.com/en/docs/react/getting-started/frameworks)
- [HeroUI Quick Start](https://heroui.com/en/docs/react/getting-started/quick-start)
- [HeroUI Styling](https://heroui.com/en/docs/react/getting-started/styling)
- [HeroUI Composition](https://heroui.com/en/docs/react/getting-started/composition)
- [HeroUI LLMs.txt](https://heroui.com/en/docs/react/getting-started/llms-txt)
