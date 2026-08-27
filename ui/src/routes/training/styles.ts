import { tv } from '@heroui/styles';

export const trainingStyles = tv({
  slots: {
    actionRow: 'flex flex-wrap items-center gap-3',
    bodyAreas: 'flex flex-wrap gap-1.5',
    card: 'overflow-hidden border border-border',
    cardButton:
      'flex w-full items-center justify-between gap-3 rounded-none px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
    cardHeader: 'flex min-w-0 items-center gap-3',
    cardList: 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
    cardLink:
      'block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-focus',
    cardMedia:
      'flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-secondary text-muted',
    cardMediaImage: 'size-full object-cover',
    cardText: 'flex min-w-0 flex-1 flex-col gap-1',
    cardTitle: 'truncate text-base font-semibold text-foreground',
    completionCheck:
      'flex size-24 items-center justify-center self-center rounded-full bg-success-soft text-success-soft-foreground',
    completionGrid: 'grid gap-4 sm:grid-cols-2',
    completionMetric:
      'flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4',
    completionValue: 'text-2xl font-semibold text-foreground',
    empty:
      'flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface p-8 text-center',
    exerciseCard: 'overflow-hidden border border-border',
    exerciseContent: 'flex flex-col gap-4 border-t border-border px-4 py-4',
    exerciseHeading: 'truncate font-semibold text-foreground',
    exerciseIdentity: 'flex min-w-0 items-center gap-3',
    exerciseList: 'flex flex-col gap-3',
    exerciseMedia: 'h-20 w-24 shrink-0',
    exerciseMeta: 'text-sm text-muted',
    exerciseSummary: 'flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted',
    drawerBody: 'p-0',
    drawerContent: 'max-h-[70svh]',
    drawerDialog: 'overflow-hidden p-0',
    drawerHeader: 'border-b border-border',
    header: 'flex flex-col gap-1',
    icon: 'size-5 shrink-0',
    indicator:
      'flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted',
    loadField: 'w-28',
    mediaButton:
      'relative size-full overflow-hidden rounded-xl border border-border bg-surface-secondary p-0',
    mediaImage: 'size-full object-cover',
    mediaOverlay:
      'absolute inset-0 flex items-center justify-center bg-black/35 text-white',
    metricLabel: 'text-xs text-muted',
    modalBody: 'p-0',
    modalDialog: 'overflow-hidden p-0',
    modalHeader: 'border-b border-border pr-14',
    overlayActions: 'flex flex-wrap justify-end gap-3 p-4',
    overlayBody: 'flex flex-col gap-5 p-5',
    overlayCountdown:
      'text-center text-6xl font-semibold tabular-nums text-foreground',
    overlayImage: 'max-h-[70svh] w-full object-contain bg-black',
    player: 'absolute inset-0',
    playerFrame: 'relative aspect-video w-full overflow-hidden bg-black',
    page: 'mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8',
    pageActions: 'flex flex-wrap items-center gap-3',
    placeholder: 'flex flex-col items-center gap-2 text-xs text-muted',
    progress: 'w-full',
    series: 'flex flex-col gap-2',
    seriesRow:
      'grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl bg-surface-secondary p-3',
    seriesState:
      'flex size-7 items-center justify-center rounded-full border border-border text-muted',
    skeleton: 'h-36 w-full rounded-2xl',
    subtitle: 'text-sm text-muted',
    title: 'text-2xl font-semibold tracking-tight text-foreground',
    timerTitle: 'text-center text-lg font-semibold text-foreground',
    week: 'grid grid-cols-7 gap-2',
    weekDay: 'flex flex-col items-center gap-2 text-xs text-muted',
    weekMarker:
      'flex size-8 items-center justify-center rounded-full border border-border',
  },
  variants: {
    completed: {
      true: {
        exerciseCard: 'border-success/40 bg-success-soft/20',
        indicator: 'border-success bg-success text-success-foreground',
        seriesState: 'border-success bg-success text-success-foreground',
        weekMarker: 'border-success bg-success text-success-foreground',
      },
    },
  },
});
