import { tv } from '@heroui/styles';

export const assistantStyles = tv({
  slots: {
    announcer: 'sr-only',
    actions: 'flex flex-wrap items-center justify-end gap-2',
    answerActions: 'flex flex-wrap gap-2',
    body: 'min-h-0 overflow-hidden',
    conversation:
      'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-3',
    draft: 'flex flex-col gap-4',
    exercise:
      'grid gap-1 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto]',
    footer: 'flex items-center justify-between gap-3',
    footerActions: 'flex flex-wrap items-center gap-2',
    form: 'flex shrink-0 flex-col gap-3',
    layout: 'flex h-full min-h-0 flex-col gap-4',
    message:
      'max-w-[90%] rounded-xl px-3 py-2 text-sm leading-6 data-[role=assistant]:self-start data-[role=assistant]:bg-default data-[role=person]:self-end data-[role=person]:bg-accent-soft data-[role=person]:text-accent-soft-foreground',
    metadata: 'text-xs text-muted',
    notice: 'flex flex-col gap-4',
    previewWorkout: 'flex flex-col gap-3 rounded-xl border border-border p-4',
    prompt: 'font-medium text-foreground',
    response: 'flex min-h-0 flex-col gap-3',
    status: 'text-sm text-muted',
    textArea: 'min-h-24',
  },
  variants: {
    preview: {
      false: {
        response: 'shrink-0',
      },
      true: {
        draft: 'min-h-0 flex-1 overflow-y-auto pr-1',
        response: 'flex-1 overflow-hidden p-1',
      },
    },
  },
});
