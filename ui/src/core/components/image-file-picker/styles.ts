import { tv } from '@heroui/styles';

export const imageFilePickerStyles = tv({
  slots: {
    actionButton: 'size-7 min-h-7 min-w-7',
    actionIcon: 'size-4',
    actions: 'flex h-full flex-col justify-between gap-1',
    displayFallback:
      'flex h-[min(78svh,60rem)] items-center justify-center text-sm text-muted',
    displayImage: 'h-[min(78svh,60rem)] w-full object-contain',
    dropZone:
      'flex aspect-square h-full items-center justify-center rounded-lg border border-dashed border-border bg-surface-secondary text-muted outline-none transition-colors hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60',
    fallback:
      'flex h-full max-w-48 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted',
    image: 'h-full w-auto max-w-32 object-cover',
    input: 'sr-only',
    modalBackdrop: 'data-[exiting=true]:animate-none',
    modalBody: '-m-0 flex-none overflow-hidden bg-black p-0',
    modalContainer: 'data-[exiting=true]:animate-none',
    modalDialog:
      'w-[min(calc(100vw-2rem),80rem)] max-w-none overflow-hidden p-0',
    modalHeader:
      'min-h-14 shrink-0 justify-center border-b border-border px-6 py-4 pr-14',
    previewIcon: 'size-7',
    previewOverlay:
      'absolute inset-0 flex items-center justify-center bg-black/35 text-white transition-colors group-hover:bg-black/45',
    previewTrigger:
      'group relative h-full min-w-0 overflow-hidden rounded-lg border border-border bg-black p-0 outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed',
    root: 'flex h-full items-stretch gap-2',
    status: 'sr-only',
  },
  variants: {
    isDragging: {
      true: { dropZone: 'border-accent bg-accent/10 text-accent' },
    },
    isPending: {
      true: { image: 'grayscale', previewTrigger: 'opacity-70' },
    },
  },
});
