import { tv } from '@heroui/styles';

export const routeStatusStyles = tv({
  slots: {
    page: 'flex min-h-svh items-center justify-center bg-background p-6 text-foreground',
    pageContent: 'flex w-full max-w-lg flex-col gap-4',
    title: 'text-xl font-semibold tracking-tight',
    description: 'text-sm text-muted',
    skeletonAvatar: 'size-12 rounded-full',
    skeletonContent: 'mt-4 h-40 w-full',
    skeletonEmail: 'h-4 w-48 max-w-full',
    skeletonIdentity: 'flex items-center gap-3',
    skeletonName: 'h-5 w-36 max-w-full',
    skeletonNavigation: 'h-10 w-full',
    skeletonText: 'flex min-w-0 flex-1 flex-col gap-2',
    srOnly: 'sr-only',
  },
});
