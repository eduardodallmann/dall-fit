import { tv } from '@heroui/styles';

export const trainingPlanStyles = tv({
  slots: {
    actions: 'flex flex-wrap items-center justify-end gap-2',
    activeRadio: 'size-4 accent-accent',
    activeRow: '[&>[data-slot=table-cell]]:bg-accent-soft!',
    actionTrigger:
      'flex size-8 items-center justify-center rounded-lg outline-none transition-colors hover:bg-default focus-visible:ring-2 focus-visible:ring-focus',
    breadcrumbItem: 'flex items-center gap-2',
    breadcrumbLabel: 'max-w-56 truncate',
    breadcrumbLink:
      'rounded-sm text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus',
    breadcrumbs: 'flex flex-wrap items-center gap-2 text-sm',
    breadcrumbSeparator: 'size-3.5 shrink-0 text-muted',
    description: 'text-sm leading-6 text-muted',
    emptyContent:
      'mx-auto flex w-full max-w-md flex-col items-center gap-3 py-10 text-center',
    emptyIcon: 'size-8 text-muted',
    emptyState: 'flex w-full items-center justify-center',
    fieldError: 'text-sm text-danger',
    form: 'flex flex-col gap-5',
    icon: 'size-4',
    inlineActions: 'flex shrink-0 items-center gap-1',
    inlineDescriptionField: 'w-full',
    inlineEditor: 'flex w-full min-w-0 flex-col gap-2',
    inlineTitleField: 'min-w-0 flex-1',
    inlineTitleRow: 'flex w-full min-w-0 items-start gap-2',
    libraryItem:
      'flex flex-col gap-4 rounded-xl border border-default-200 p-4 sm:flex-row sm:items-start sm:justify-between',
    libraryList: 'flex max-h-[60vh] flex-col gap-3 overflow-y-auto',
    libraryPreview: 'text-xs leading-5 text-muted',
    newPlanTrigger:
      'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground outline-none transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-focus',
    newPlanButton: 'shrink-0 whitespace-nowrap',
    page: 'mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8',
    pageHeader:
      'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
    pagination: 'flex flex-wrap items-center justify-between gap-3',
    planLink:
      'block max-w-80 truncate rounded-sm font-medium text-accent-soft-foreground underline decoration-accent-soft-foreground/60 underline-offset-4 outline-none transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-focus',
    section: 'flex flex-col gap-4',
    pageSkeleton: 'flex w-full flex-col gap-8',
    skeletonAction: 'h-9 w-28',
    skeletonCell: 'h-5 min-w-0 flex-1',
    skeletonDescription: 'h-4 w-full max-w-md',
    skeletonHeader:
      'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
    skeletonSection: 'flex flex-col gap-4',
    skeletonSubtitle: 'h-6 w-36',
    skeletonTextGroup: 'flex w-full max-w-xl flex-col gap-3',
    skeletonTitle: 'h-8 w-full max-w-xs',
    srOnly: 'sr-only',
    tableSkeleton: 'flex w-full flex-col gap-5 py-6',
    tableSkeletonRow: 'flex w-full gap-6',
    title: 'text-2xl font-semibold tracking-tight text-foreground',
    titleRow: 'flex min-w-0 items-center gap-2',
    titleGroup: 'flex min-w-0 flex-col gap-1',
    truncated: 'block max-w-80 truncate',
  },
});
