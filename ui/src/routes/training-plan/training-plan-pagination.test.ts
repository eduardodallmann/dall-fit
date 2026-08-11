import { describe, expect, it } from 'vitest';

import {
  canonicalTrainingPlanPage,
  trainingPlanLastPage,
  trainingPlanPaginationItems,
} from './training-plan-pagination';

describe('training plan pagination', () => {
  it.each([
    [null, { page: 1, shouldReplace: false }],
    ['1', { page: 1, shouldReplace: true }],
    ['2', { page: 2, shouldReplace: false }],
    ['100', { page: 100, shouldReplace: false }],
    ['', { page: 1, shouldReplace: true }],
    ['0', { page: 1, shouldReplace: true }],
    ['-1', { page: 1, shouldReplace: true }],
    ['01', { page: 1, shouldReplace: true }],
    ['1.5', { page: 1, shouldReplace: true }],
    ['101', { page: 1, shouldReplace: true }],
    ['text', { page: 1, shouldReplace: true }],
  ])('canonicalizes raw page %s', (rawPage, expected) => {
    expect(canonicalTrainingPlanPage(rawPage)).toEqual(expected);
  });

  it.each([
    [0, 20, 1],
    [1, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [2000, 20, 100],
    [2021, 20, 100],
  ])('calculates the bounded last page', (total, pageSize, expected) => {
    expect(trainingPlanLastPage(total, pageSize)).toBe(expected);
  });

  it.each([
    [1, 0],
    [-1, 20],
    [1.5, 20],
    [1, -1],
    [1, 1.5],
  ])('rejects invalid collection metadata', (total, pageSize) => {
    expect(() => trainingPlanLastPage(total, pageSize)).toThrow(
      'Training plan pagination response is invalid.',
    );
  });

  it.each([
    [1, 1, [1]],
    [4, 7, [1, 2, 3, 4, 5, 6, 7]],
    [1, 100, [1, 2, 3, 4, 5, 'ellipsis', 100]],
    [4, 100, [1, 2, 3, 4, 5, 'ellipsis', 100]],
    [5, 100, [1, 'ellipsis', 4, 5, 6, 'ellipsis', 100]],
    [50, 100, [1, 'ellipsis', 49, 50, 51, 'ellipsis', 100]],
    [97, 100, [1, 'ellipsis', 96, 97, 98, 99, 100]],
    [100, 100, [1, 'ellipsis', 96, 97, 98, 99, 100]],
  ])('builds a bounded window for page %i of %i', (page, total, expected) => {
    expect(trainingPlanPaginationItems(page, total)).toEqual(expected);
  });
});
