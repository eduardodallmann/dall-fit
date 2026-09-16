import { tv } from '@heroui/styles';

export const nativeAppCompatibilityGuardStyles = tv({
  slots: {
    actions: 'flex flex-col items-stretch gap-3 sm:items-start',
    page: 'mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-6 p-6 md:p-10',
    text: 'text-muted',
    title: 'text-2xl font-semibold text-foreground',
  },
});
