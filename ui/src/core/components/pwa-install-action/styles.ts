import { tv } from '@heroui/styles';

export const pwaInstallActionStyles = tv({
  slots: {
    compatibility: 'text-xs text-muted',
    instructions: 'flex flex-col gap-3 text-sm text-muted',
    list: 'list-decimal space-y-2 pl-5',
    section: 'mt-auto flex min-w-0 flex-col gap-3 border-t border-divider pt-5',
    title: 'text-xs font-semibold uppercase tracking-wide text-muted',
  },
});
