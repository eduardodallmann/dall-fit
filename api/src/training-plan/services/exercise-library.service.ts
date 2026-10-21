import { Injectable, Logger } from '@nestjs/common';

import type {
  ExerciseLibraryQuery,
  ExerciseLibrarySelection,
} from '@dall-fit/types';

import {
  exerciseGroupId,
  normalizeExerciseName,
} from '~/training-plan/domain/exercise-library';
import { createExerciseLibraryStaleException } from '~/training-plan/errors/training-plan.errors';
import { ExerciseLibraryRepository } from '~/training-plan/repositories/exercise-library.repository';

@Injectable()
export class ExerciseLibraryService {
  private readonly logger = new Logger(ExerciseLibraryService.name);
  constructor(private readonly repository: ExerciseLibraryRepository) {}

  async list(query: ExerciseLibraryQuery) {
    this.logger.log('ExerciseLibraryService -> list -> params:', {
      params: {
        page: query.page,
        hasSearch: Boolean(query.search),
        hasBodyArea: Boolean(query.bodyArea),
      },
    });
    const candidates = await this.repository.representatives();
    this.logger.log('ExerciseLibraryService -> list -> repository return:', {
      data: { count: candidates.length },
    });
    const term = normalizeExerciseName(query.search ?? '');
    const filtered = candidates
      .map((item) => ({ ...item, groupId: exerciseGroupId(item.exercise) }))
      .filter((item) => {
        const matchesArea =
          query.bodyArea === undefined ||
          ('bodyArea' in item.exercise &&
            item.exercise.bodyArea === query.bodyArea);
        const name =
          item.exercise.type === 'pause'
            ? 'pausa'
            : normalizeExerciseName(item.exercise.name);
        return matchesArea && name.includes(term);
      })
      .sort((a, b) => {
        const left =
          a.exercise.type === 'pause'
            ? 'pausa'
            : normalizeExerciseName(a.exercise.name);
        const right =
          b.exercise.type === 'pause'
            ? 'pausa'
            : normalizeExerciseName(b.exercise.name);
        return (
          left.localeCompare(right, 'pt') ||
          a.groupId.localeCompare(b.groupId, 'pt')
        );
      });
    const result = {
      data: filtered.slice((query.page - 1) * 20, query.page * 20),
      page: query.page,
      pageSize: 20,
      total: filtered.length,
    };
    this.logger.log('ExerciseLibraryService -> list -> return:', {
      data: { count: result.data.length, total: result.total },
    });
    return result;
  }

  async resolve(selections: readonly ExerciseLibrarySelection[]) {
    this.logger.log('ExerciseLibraryService -> resolve -> params:', {
      params: { count: selections.length },
    });
    const candidates = await this.repository.representatives();
    this.logger.log('ExerciseLibraryService -> resolve -> repository return:', {
      data: { count: candidates.length },
    });
    const byGroup = new Map(
      candidates.map((item) => [exerciseGroupId(item.exercise), item]),
    );
    const stale = selections.filter((selection) => {
      const candidate = byGroup.get(selection.groupId);
      return (
        candidate === undefined ||
        candidate.trainingPlanId !== selection.trainingPlanId ||
        candidate.workoutId !== selection.workoutId ||
        candidate.exerciseId !== selection.exerciseId ||
        candidate.version !== selection.version
      );
    });
    if (stale.length > 0) {
      this.logger.warn('ExerciseLibraryService -> resolve -> stale branch:', {
        data: { count: stale.length },
      });
      throw createExerciseLibraryStaleException(
        stale.map((item) => item.groupId),
      );
    }
    const result = selections.map(
      (selection) => byGroup.get(selection.groupId)!.exercise,
    );
    this.logger.log('ExerciseLibraryService -> resolve -> return:', {
      data: { count: result.length },
    });
    return result;
  }
}
