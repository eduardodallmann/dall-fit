import { tv } from '@heroui/styles';

export const durationFieldStyles = tv({
  slots: {
    information: 'flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end',
    nameField: 'min-w-0 flex-1',
    area: 'w-full lg:w-48 lg:shrink-0',
    fields: 'flex min-w-0 flex-col gap-4',
    media: 'flex min-w-0 flex-col gap-3',
    actions: 'flex flex-wrap items-center gap-2',
    preview: 'relative min-h-16 w-24 shrink-0',
  },
});
