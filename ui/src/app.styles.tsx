import type { ComponentPropsWithoutRef } from 'react';

import { tv } from '@heroui/styles';

const appStyles = tv({
  slots: {
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    pageContent: 'w-full max-w-lg',
    eyebrow: 'text-sm font-medium text-muted',
    title: 'text-3xl font-semibold tracking-tight',
    description: 'text-sm text-muted',
    inlineCode: 'rounded-md bg-default px-1.5 py-0.5 font-mono text-foreground',
  },
});

const styles = appStyles();

type MainProps = Omit<ComponentPropsWithoutRef<'main'>, 'className'>;
type DivProps = Omit<ComponentPropsWithoutRef<'div'>, 'className'>;
type ParagraphProps = Omit<ComponentPropsWithoutRef<'p'>, 'className'>;
type HeadingProps = Omit<ComponentPropsWithoutRef<'h1'>, 'className'>;
type CodeProps = Omit<ComponentPropsWithoutRef<'code'>, 'className'>;

export function Page(props: Readonly<MainProps>) {
  return <main {...props} className={styles.page()} />;
}

export function PageContent(props: Readonly<DivProps>) {
  return <div {...props} className={styles.pageContent()} />;
}

export function Eyebrow(props: Readonly<ParagraphProps>) {
  return <p {...props} className={styles.eyebrow()} />;
}

export function Title(props: Readonly<HeadingProps>) {
  return <h1 {...props} className={styles.title()} />;
}

export function Description(props: Readonly<ParagraphProps>) {
  return <p {...props} className={styles.description()} />;
}

export function InlineCode(props: Readonly<CodeProps>) {
  return <code {...props} className={styles.inlineCode()} />;
}
