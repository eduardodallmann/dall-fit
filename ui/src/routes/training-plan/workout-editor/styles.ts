import { tv } from '@heroui/styles';

export const workoutEditorStyles = tv({
  slots: {
    addExerciseRow: 'flex w-full items-center gap-3',
    addIndicator: 'size-4 shrink-0',
    addSeparator: 'min-w-0 flex-1',
    addTrigger:
      'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50',
    bodyAreaField: 'w-full lg:w-48 lg:shrink-0',
    cardHeader:
      'flex min-w-0 flex-wrap items-center justify-between gap-3 sm:flex-nowrap',
    cardIdentity: 'flex shrink-0 items-center gap-2',
    contextLabel: 'text-sm font-medium text-muted',
    deleteSlot: 'flex size-8 shrink-0 items-center justify-center',
    dragPreview:
      'flex w-full flex-col gap-3 rounded-2xl border border-accent bg-overlay p-4 text-overlay-foreground shadow-xl',
    dragPreviewName: 'truncate text-sm font-medium',
    editor: 'flex flex-col gap-5',
    emptyContent: 'flex flex-col gap-1',
    emptyDescription: 'text-sm text-muted',
    emptyIcon: 'size-8 shrink-0 text-muted',
    emptyState:
      'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface-secondary p-8 text-center sm:flex-row sm:text-left',
    emptyTitle: 'font-semibold text-foreground',
    exerciseActions:
      'flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap',
    exerciseFields: 'flex min-w-0 flex-col gap-4',
    exerciseHeader: 'flex items-center justify-between gap-3',
    exerciseItem:
      'flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 will-change-transform motion-reduce:transition-none',
    exerciseList: 'flex flex-col gap-3',
    exerciseTypeIcon: 'size-5 shrink-0 text-muted',
    flexibleField: 'min-w-0 flex-1',
    handle:
      'flex size-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus active:cursor-grabbing',
    informationFields: 'flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end',
    inlineActions: 'flex shrink-0 items-center gap-1',
    mediaRegion: 'w-full shrink-0 lg:w-auto',
    nameEditor: 'min-w-0 flex-1',
    numericField: 'min-w-0 flex-1',
    numericFields: 'flex min-w-0 flex-col gap-3 sm:flex-row',
    pageTitle:
      'min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground',
    sectionTitle: 'text-xl font-semibold tracking-tight text-foreground',
    srOnly: 'sr-only',
    status: 'min-h-5 text-xs text-muted',
    titleGroup: 'flex min-w-0 flex-col gap-1',
    titleRow: 'flex min-w-0 items-center gap-2',
    typeDescription: 'flex min-w-0 flex-col',
    typeIcon: 'size-5 shrink-0 text-muted',
    youtubeThumbnail:
      'aspect-video w-full rounded-lg border border-border object-cover lg:w-40',
  },
  variants: {
    isDragging: {
      true: {
        exerciseItem: 'opacity-30',
      },
    },
  },
});
