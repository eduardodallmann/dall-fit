export const SortDirection = {
  Ascending: 'asc',
  Descending: 'desc',
} as const;

export type SortDirectionValue =
  (typeof SortDirection)[keyof typeof SortDirection];
