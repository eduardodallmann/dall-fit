import { tv } from '@heroui/styles';

export const imageFilePickerStyles = tv({
  slots: {
    actionButton: 'size-7 min-h-7 min-w-7',
    actionIcon: 'size-4',
    actions: 'flex h-full flex-col justify-center gap-1',
    dropZone:
      'flex aspect-square h-full items-center justify-center rounded-lg border border-dashed border-border bg-surface-secondary text-muted outline-none transition-colors enabled:hover:border-accent enabled:hover:text-accent focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60 disabled:transition-none',
    input: 'sr-only',
    root: 'flex h-16 items-stretch gap-2 md:h-[3.75rem]',
    status: 'sr-only',
  },
  variants: {
    isDragging: {
      true: { dropZone: 'border-accent bg-accent/10 text-accent' },
    },
  },
});
