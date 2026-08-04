import { tv } from '@heroui/styles';

export const pwaUpdateNoticeStyles = tv({
  slots: {
    actions: 'flex shrink-0 flex-wrap items-center gap-2',
    notice:
      'fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl shadow-lg sm:inset-x-6',
  },
});
