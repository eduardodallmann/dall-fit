import { tv } from '@heroui/styles';

export const applicationMenuStyles = tv({
  slots: {
    appearance: 'flex items-center',
    avatar: 'shrink-0',
    content:
      'flex h-full min-w-0 flex-col gap-8 bg-surface p-6 text-foreground',
    identity: 'flex min-w-0 flex-col items-start gap-3',
    identityText: 'w-full min-w-0',
    identityTextGroup: 'flex w-full min-w-0 flex-col gap-1',
    navigation: 'flex min-w-0 flex-col gap-1',
    navigationIcon: 'size-5 shrink-0 text-muted',
    navigationLink:
      'flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none transition-colors hover:bg-default focus-visible:ring-2 focus-visible:ring-focus data-[status=active]:bg-default data-[status=active]:font-semibold',
    logout: 'mt-auto w-full justify-start',
  },
});
