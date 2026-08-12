import { tv } from '@heroui/styles';

export const applicationFallbackStyles = tv({
  slots: {
    actions: 'flex items-center gap-2',
    description: 'text-sm text-muted',
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    panel: 'w-full max-w-lg',
    title: 'text-xl font-semibold tracking-tight',
  },
});
