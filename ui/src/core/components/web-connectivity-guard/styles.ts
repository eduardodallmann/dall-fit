import { tv } from '@heroui/styles';

export const webConnectivityGuardStyles = tv({
  slots: {
    actions: 'flex flex-wrap gap-3',
    heading: 'text-2xl font-semibold text-foreground',
    page: 'mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-4 p-4 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary md:p-8',
  },
});
