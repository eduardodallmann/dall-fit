import { tv } from '@heroui/styles';

export const pwaUpdateNoticeStyles = tv({
  slots: {
    actions: 'flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0',
    content:
      'min-w-0 gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4',
    message: 'min-w-0',
    notice:
      'fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-3xl shadow-lg sm:inset-x-6',
  },
});
