import { describe, expect, it, vi } from 'vitest';

import {
  exerciseGroupId,
  type ExerciseLibraryCandidate,
} from '~/training-plan/domain/exercise-library';
import { ExerciseLibraryService } from '~/training-plan/services/exercise-library.service';

function candidate(
  name: string,
  bodyArea: 'chest' | 'back' = 'chest',
): ExerciseLibraryCandidate {
  return {
    exerciseId: 'exercise',
    trainingPlanId: 'plan',
    workoutId: 'workout',
    version: 3,
    exercise: {
      id: 'exercise',
      name,
      type: 'duration',
      bodyArea,
      durationMinutes: 5,
    },
  };
}

describe('ExerciseLibraryService', () => {
  it('normalizes accents, whitespace and case while isolating nameless pauses', () => {
    expect(exerciseGroupId(candidate('  ELEVAÇÃO   lateral ').exercise)).toBe(
      'name:elevacao lateral',
    );
    expect(
      exerciseGroupId({ id: 'pause', type: 'pause', restSeconds: 60 }),
    ).not.toBe(exerciseGroupId(candidate('Pausa').exercise));
  });

  it('filters representatives by area and normalized search before pagination', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      candidate(`Elevação ${String(i).padStart(2, '0')}`, 'chest'),
    );
    rows.push(candidate('Elevação costas', 'back'));
    const repository = {
      representatives: vi.fn().mockResolvedValue(rows),
      append: vi.fn(),
    };
    const service = new ExerciseLibraryService(repository);
    const result = await service.list({
      page: 2,
      search: 'elevacao',
      bodyArea: 'chest',
    });
    expect(result.total).toBe(25);
    expect(result.data).toHaveLength(5);
    expect(
      result.data.every(
        (row) =>
          row.exercise.type !== 'pause' && row.exercise.bodyArea === 'chest',
      ),
    ).toBe(true);
  });

  it('captures all fields in selection order and rejects replaced representatives', async () => {
    const first = candidate('Primeiro');
    const second = { ...candidate('Segundo'), exerciseId: 'second' };
    const service = new ExerciseLibraryService({
      representatives: vi.fn().mockResolvedValue([first, second]),
      append: vi.fn(),
    });
    const selections = [second, first].map(({ exercise, ...source }) => ({
      ...source,
      groupId: exerciseGroupId(exercise),
    }));
    expect(await service.resolve(selections)).toEqual([
      second.exercise,
      first.exercise,
    ]);
    await expect(
      service.resolve([{ ...selections[0], version: 2 }]),
    ).rejects.toMatchObject({
      response: {
        code: 'EXERCISE_LIBRARY_SELECTION_STALE',
        details: { staleGroupIds: ['name:segundo'] },
      },
    });
  });
});
