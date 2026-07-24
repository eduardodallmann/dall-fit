import type { ComponentPropsWithoutRef } from 'react';

import { tv } from '@heroui/styles';

const meStyles = tv({
  slots: {
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    pageContent: 'w-full max-w-lg',
    eyebrow: 'text-sm font-medium text-muted',
    title: 'text-3xl font-semibold tracking-tight',
    detailList: 'grid gap-4',
    detailLabel: 'text-sm font-medium text-muted',
    detailValue: 'break-words text-base text-foreground',
  },
});

const styles = meStyles();

type MainProps = Omit<ComponentPropsWithoutRef<'main'>, 'className'>;
type DivProps = Omit<ComponentPropsWithoutRef<'div'>, 'className'>;
type ParagraphProps = Omit<ComponentPropsWithoutRef<'p'>, 'className'>;
type HeadingProps = Omit<ComponentPropsWithoutRef<'h1'>, 'className'>;
type DescriptionListProps = Omit<ComponentPropsWithoutRef<'dl'>, 'className'>;
type TermProps = Omit<ComponentPropsWithoutRef<'dt'>, 'className'>;
type DescriptionProps = Omit<ComponentPropsWithoutRef<'dd'>, 'className'>;

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

export function DetailList(props: Readonly<DescriptionListProps>) {
  return <dl {...props} className={styles.detailList()} />;
}

export function DetailLabel(props: Readonly<TermProps>) {
  return <dt {...props} className={styles.detailLabel()} />;
}

export function DetailValue(props: Readonly<DescriptionProps>) {
  return <dd {...props} className={styles.detailValue()} />;
}
