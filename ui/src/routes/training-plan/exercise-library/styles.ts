import { tv } from '@heroui/styles';

export const exerciseLibraryStyles = tv({
  slots: {
    dialog: 'flex max-h-[90dvh] flex-col',
    body: 'flex min-h-0 flex-col gap-4 overflow-y-auto',
    filters: 'grid gap-3 sm:grid-cols-2',
    description: 'text-sm text-muted',
    list: 'flex flex-col gap-2',
    row: 'flex w-full items-center gap-3 rounded-lg border border-border p-3',
    field: 'w-full',
    thumbnail: 'size-14 shrink-0 rounded-md object-cover',
    fallback:
      'flex size-14 shrink-0 items-center justify-center rounded-md bg-default text-muted',
    label: 'flex min-w-0 flex-1 flex-col gap-1',
    name: 'break-words font-medium',
    metadata: 'text-sm text-muted',
    footer: 'flex flex-wrap items-center justify-between gap-3',
    actions: 'flex flex-wrap gap-2',
    count: 'text-sm font-medium',
    message: 'rounded-lg bg-default p-3 text-sm',
  },
});
