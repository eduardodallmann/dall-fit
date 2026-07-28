import { tv } from '@heroui/styles';

export const homeStyles = tv({
  slots: {
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    pageContent: 'flex w-full max-w-lg flex-col gap-4',
    eyebrow: 'text-sm font-medium text-muted',
    title: 'text-3xl font-semibold tracking-tight',
    description: 'text-sm text-muted',
  },
});
