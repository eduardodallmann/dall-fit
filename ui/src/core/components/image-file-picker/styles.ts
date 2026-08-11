import { tv } from '@heroui/styles';

export const imageFilePickerStyles = tv({
  slots: {
    actions: 'flex flex-wrap items-center gap-2',
    image: 'size-20 rounded-lg border border-border object-cover',
    input: 'sr-only',
    root: 'flex flex-col gap-2',
    status: 'text-sm text-muted',
  },
});
