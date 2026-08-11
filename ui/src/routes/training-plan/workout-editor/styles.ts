import { tv } from '@heroui/styles';

export const workoutEditorStyles = tv({
  slots: {
    addTrigger:
      'inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50',
    editor: 'flex flex-col gap-5',
    exerciseActions: 'flex items-center justify-end gap-2',
    exerciseFields:
      'grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7',
    exerciseHeader: 'flex items-center justify-between gap-3',
    exerciseItem:
      'grid grid-cols-1 gap-4 rounded-2xl border border-border bg-surface p-4 lg:grid-cols-[auto_1fr_auto] lg:items-start',
    exerciseList: 'flex flex-col gap-3',
    handle:
      'flex size-9 cursor-grab items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus active:cursor-grabbing',
    image: 'size-20 rounded-lg object-cover',
    inlineActions: 'flex items-center gap-1',
    media: 'flex flex-col gap-2',
    status: 'min-h-5 text-xs text-muted',
    titleRow: 'flex flex-wrap items-center gap-2',
    youtubeThumbnail: 'aspect-video w-full max-w-40 rounded-lg object-cover',
  },
});
