export const TRAINING_PLAN_PAGE_SIZE = 20;
export const TRAINING_PLAN_MAX_PAGE = 100;

export type TrainingPlanPaginationItem = number | 'ellipsis';

export interface CanonicalTrainingPlanPage {
  page: number;
  shouldReplace: boolean;
}

export function canonicalTrainingPlanPage(
  rawPage: string | null,
): CanonicalTrainingPlanPage {
  if (rawPage === null) {
    return { page: 1, shouldReplace: false };
  }

  if (rawPage === '1') {
    return { page: 1, shouldReplace: true };
  }

  if (!/^[1-9]\d*$/.test(rawPage)) {
    return { page: 1, shouldReplace: true };
  }

  const page = Number(rawPage);
  if (
    !Number.isSafeInteger(page) ||
    page < 2 ||
    page > TRAINING_PLAN_MAX_PAGE
  ) {
    return { page: 1, shouldReplace: true };
  }

  return { page, shouldReplace: false };
}

export function trainingPlanLastPage(total: number, pageSize: number): number {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize <= 0
  ) {
    throw new Error('Training plan pagination response is invalid.');
  }

  return Math.min(
    TRAINING_PLAN_MAX_PAGE,
    Math.max(1, Math.ceil(total / pageSize)),
  );
}

export function trainingPlanPaginationItems(
  currentPage: number,
  lastPage: number,
): readonly TrainingPlanPaginationItem[] {
  if (
    !Number.isSafeInteger(currentPage) ||
    !Number.isSafeInteger(lastPage) ||
    currentPage < 1 ||
    lastPage < 1 ||
    currentPage > lastPage ||
    lastPage > TRAINING_PLAN_MAX_PAGE
  ) {
    throw new Error('Training plan pagination state is invalid.');
  }

  if (lastPage <= 7) {
    return Array.from({ length: lastPage }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', lastPage];
  }

  if (currentPage >= lastPage - 3) {
    return [
      1,
      'ellipsis',
      lastPage - 4,
      lastPage - 3,
      lastPage - 2,
      lastPage - 1,
      lastPage,
    ];
  }

  return [
    1,
    'ellipsis',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis',
    lastPage,
  ];
}
