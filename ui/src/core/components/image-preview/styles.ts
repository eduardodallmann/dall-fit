import { tv } from '@heroui/styles';

export const imagePreviewStyles = tv({
  slots: {
    displayFallback:
      'flex h-[min(78svh,60rem)] items-center justify-center text-sm text-muted',
    displayImage: 'h-[min(78svh,60rem)] w-full object-contain',
    fallback:
      'flex items-center justify-center gap-2 rounded-lg border border-border px-3 text-center text-xs text-muted',
    image: 'size-full object-cover',
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
    trigger:
      'group relative min-w-0 overflow-hidden rounded-lg border border-border bg-black p-0 outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed',
  },
  variants: {
    isPending: {
      true: { image: 'grayscale', trigger: 'opacity-70' },
    },
    size: {
      compact: {
        fallback: 'h-20 w-24 flex-col px-1',
        trigger: 'h-20 w-24',
      },
      editor: {
        fallback: 'h-full max-w-48',
        image: 'h-full w-auto max-w-32',
        trigger: 'h-full',
      },
    },
  },
  defaultVariants: {
    size: 'editor',
  },
});
