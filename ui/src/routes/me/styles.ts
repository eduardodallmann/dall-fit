import { tv } from '@heroui/styles';

export const meStyles = tv({
  slots: {
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    pageContent: 'w-full max-w-lg',
    eyebrow: 'text-sm font-medium text-muted',
    title: 'text-3xl font-semibold tracking-tight',
    detailList: 'grid gap-4',
    detailLabel: 'text-sm font-medium text-muted',
    detailValue: 'break-words text-base text-foreground',
  },
});
