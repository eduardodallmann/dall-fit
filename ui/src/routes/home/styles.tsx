import type { ComponentPropsWithoutRef } from 'react';

import { tv } from '@heroui/styles';

const homeStyles = tv({
  slots: {
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    pageContent: 'flex w-full max-w-lg flex-col gap-4',
    eyebrow: 'text-sm font-medium text-muted',
    title: 'text-3xl font-semibold tracking-tight',
    description: 'text-sm text-muted',
  },
});

const styles = homeStyles();

type MainProps = Omit<ComponentPropsWithoutRef<'main'>, 'className'>;
type DivProps = Omit<ComponentPropsWithoutRef<'div'>, 'className'>;
type ParagraphProps = Omit<ComponentPropsWithoutRef<'p'>, 'className'>;
type HeadingProps = Omit<ComponentPropsWithoutRef<'h1'>, 'className'>;

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
