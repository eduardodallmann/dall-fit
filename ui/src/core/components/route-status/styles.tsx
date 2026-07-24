import type { ComponentPropsWithoutRef } from 'react';

import { tv } from '@heroui/styles';

const routeStatusStyles = tv({
  slots: {
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    pageContent: 'flex w-full max-w-lg flex-col items-center gap-4 text-center',
    title: 'text-xl font-semibold tracking-tight',
    description: 'text-sm text-muted',
  },
});

const styles = routeStatusStyles();

type MainProps = Omit<ComponentPropsWithoutRef<'main'>, 'className'>;
type DivProps = Omit<ComponentPropsWithoutRef<'div'>, 'className'>;
type HeadingProps = Omit<ComponentPropsWithoutRef<'h1'>, 'className'>;
type ParagraphProps = Omit<ComponentPropsWithoutRef<'p'>, 'className'>;

export function Page(props: Readonly<MainProps>) {
  return <main {...props} className={styles.page()} />;
}

export function PageContent(props: Readonly<DivProps>) {
  return <div {...props} className={styles.pageContent()} />;
}

export function Title(props: Readonly<HeadingProps>) {
  return <h1 {...props} className={styles.title()} />;
}

export function Description(props: Readonly<ParagraphProps>) {
  return <p {...props} className={styles.description()} />;
}
