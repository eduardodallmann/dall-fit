import { tv } from '@heroui/styles';

export const routeStatusStyles = tv({
  slots: {
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    pageContent: 'flex w-full max-w-lg flex-col items-center gap-4 text-center',
    title: 'text-xl font-semibold tracking-tight',
    description: 'text-sm text-muted',
  },
});
