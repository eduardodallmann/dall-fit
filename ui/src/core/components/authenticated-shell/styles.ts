import { tv } from '@heroui/styles';

export const authenticatedShellStyles = tv({
  slots: {
    content: 'min-h-svh min-w-0 flex-1 pt-20 md:pt-0',
    desktopMenu:
      'sticky top-0 hidden h-svh w-72 shrink-0 border-r border-border md:block',
    drawerBody: 'p-0',
    drawerCloseTrigger:
      '-right-12 top-4 rounded-full bg-surface text-foreground shadow-overlay',
    drawerDialog: 'relative p-0',
    menuIcon: 'size-5',
    mobileTrigger: 'fixed top-4 left-4 z-40 md:hidden',
    shell: 'flex min-h-svh min-w-0 bg-background text-foreground',
  },
});
