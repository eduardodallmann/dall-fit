import { tv } from '@heroui/styles';

export const exerciseVideoPreviewStyles = tv({
  slots: {
    modalBackdrop: 'data-[exiting=true]:animate-none',
    modalBody: '-m-0 flex-none overflow-hidden p-0',
    modalContainer: 'data-[exiting=true]:animate-none',
    modalDialog: 'max-w-none overflow-hidden p-0',
    modalHeader:
      'min-h-14 shrink-0 justify-center border-b border-border px-6 py-4 pr-14',
    overlay:
      'absolute inset-0 flex items-center justify-center bg-black/35 text-white transition-colors group-hover:bg-black/45',
    playIcon: 'size-[18px] fill-current drop-shadow-md',
    player: 'size-full',
    playerFallback: 'flex size-full items-center justify-center',
    playerFrame: 'bg-black',
    thumbnail: 'size-full object-contain',
    trigger:
      'group absolute inset-0 size-full min-w-0 overflow-hidden rounded-lg border border-border bg-black p-0 outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50',
  },
  variants: {
    orientation: {
      horizontal: {
        modalDialog: 'w-[min(calc(100vw-2rem),calc((100svh-8rem)*16/9),80rem)]',
        playerFrame: 'aspect-video w-full',
      },
      vertical: {
        modalDialog: 'w-[min(calc(100vw-2rem),calc((100svh-8rem)*9/16),45rem)]',
        playerFrame: 'aspect-[9/16] w-full',
      },
    },
  },
});
