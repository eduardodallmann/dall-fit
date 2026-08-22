import { tv } from '@heroui/styles';

export const readOnlyWorkoutStyles = tv({
  slots: {
    bodyArea: 'text-sm text-muted',
    card: 'gap-0 border border-border',
    cardContent: 'pt-0',
    cardHeader:
      'flex-row flex-wrap items-center justify-between gap-3 sm:flex-nowrap',
    cardIdentity: 'flex min-w-0 items-center gap-3',
    cardText: 'flex min-w-0 flex-col gap-0.5',
    cardTitle: 'truncate font-semibold text-foreground',
    content: 'grid min-w-0 items-start gap-4',
    description: 'max-w-2xl text-sm leading-6 text-muted',
    emptyState:
      'flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface-secondary p-8 text-center text-sm text-muted',
    header: 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
    icon: 'size-5 shrink-0 text-muted',
    index:
      'flex size-8 shrink-0 items-center justify-center rounded-full bg-default text-sm font-semibold text-muted',
    list: 'flex flex-col gap-3',
    media: 'relative h-20 w-24 justify-self-end',
    mediaHint: 'self-center text-sm text-muted',
    mediaPlaceholder:
      'flex h-20 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-surface-secondary px-2 text-center text-xs text-muted',
    metric: 'min-w-24 rounded-xl bg-surface-secondary px-3 py-2',
    metricLabel: 'text-xs text-muted',
    metricList: 'flex min-w-0 flex-wrap gap-2',
    metricValue: 'mt-0.5 font-medium text-foreground',
    root: 'flex flex-col gap-5',
    title: 'text-2xl font-semibold tracking-tight text-foreground',
    titleGroup: 'flex min-w-0 flex-col gap-1',
  },
  variants: {
    hasMedia: {
      true: {
        content: 'grid-cols-[minmax(0,1fr)_auto]',
      },
    },
  },
});
