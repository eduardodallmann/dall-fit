import { tv } from '@heroui/styles';

export const dashboardStyles = tv({
  slots: {
    actionCopy: 'flex min-w-0 flex-1 flex-col gap-1',
    actionRow:
      'flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between',
    adminSection: 'flex flex-col gap-6 border-t border-border pt-8',
    cardGrid: 'grid gap-4 md:grid-cols-2',
    content:
      'mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-10 sm:px-6 lg:px-8',
    day: 'flex min-w-0 flex-1 flex-col items-center gap-2 text-center',
    dayDot: 'size-3 rounded-full bg-default data-[completed=true]:bg-accent',
    days: 'flex items-start justify-between gap-1',
    error: 'outline-none',
    headingLarge: 'text-3xl font-semibold tracking-tight',
    headingMedium: 'text-2xl font-semibold tracking-tight',
    headingSmall: 'text-xl font-semibold tracking-tight',
    heading: 'flex flex-col gap-1',
    kpiGrid: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
    kpiGridFour: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4',
    list: 'flex flex-col divide-y divide-border',
    metric: 'flex flex-col gap-1',
    metricValue: 'text-xl font-semibold tracking-tight',
    page: 'flex min-w-0 flex-col gap-8',
    recentLink:
      'flex flex-col gap-1 rounded-lg px-1 py-4 outline-none focus-visible:ring-2 focus-visible:ring-focus sm:flex-row sm:items-center sm:justify-between',
    recentMeta: 'flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted',
    skeleton: 'h-36 w-full',
    skeletonGrid: 'grid gap-4 md:grid-cols-2',
    tableName: 'font-medium',
    trendList: 'flex flex-col gap-4',
    trendRow: 'grid gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-center',
    trendValue: 'text-sm font-medium',
    weekSummary: 'flex flex-wrap items-baseline justify-between gap-2',
  },
});
