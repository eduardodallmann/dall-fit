import { Injectable, Logger } from '@nestjs/common';

import type {
  TrainingOverviewResponse,
  TrainingSessionResponse,
  TrainingWorkoutPreviewResponse,
  WorkoutExecutionSummaryResponse,
} from '@dall-fit/types';

import { TrainingService } from '~/training/services/training.service';

@Injectable()
export class TrainingCommand {
  private readonly logger = new Logger(TrainingCommand.name);

  constructor(private readonly service: TrainingService) {}

  async overview(personId: string): Promise<TrainingOverviewResponse> {
    this.logParams('overview', { personId });
    const data = await this.service.overview(personId);
    const result = { data };
    this.logReturn('overview', {
      personId,
      workoutCount: data.workouts.length,
    });
    return result;
  }

  async preview(
    personId: string,
    workoutId: string,
  ): Promise<TrainingWorkoutPreviewResponse> {
    this.logParams('preview', { personId, workoutId });
    const data = await this.service.preview(personId, workoutId);
    const result = { data };
    this.logReturn('preview', {
      exerciseCount: data.exercises.length,
      personId,
      workoutId,
    });
    return result;
  }

  async start(
    personId: string,
    workoutId: string,
  ): Promise<TrainingSessionResponse> {
    this.logParams('start', { personId, workoutId });
    const data = await this.service.start(personId, workoutId);
    const result = { data };
    this.logReturn('start', { personId, version: data.version, workoutId });
    return result;
  }

  async session(personId: string): Promise<TrainingSessionResponse> {
    this.logParams('session', { personId });
    const data = await this.service.getSession(personId);
    const result = { data };
    this.logReturn('session', { personId, version: data.version });
    return result;
  }

  async abandon(personId: string): Promise<void> {
    this.logParams('abandon', { personId });
    await this.service.abandon(personId);
    this.logReturn('abandon', { personId });
  }

  async load(
    personId: string,
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
    version: number,
  ): Promise<TrainingSessionResponse> {
    this.logParams('load', { exerciseId, personId, seriesNumber, version });
    const data = await this.service.updateLoad(
      personId,
      exerciseId,
      seriesNumber,
      loadKg,
      version,
    );
    const result = { data };
    this.logReturn('load', { personId, version: data.version });
    return result;
  }

  async completeSeries(
    personId: string,
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
    version: number,
  ): Promise<TrainingSessionResponse> {
    this.logParams('completeSeries', {
      exerciseId,
      personId,
      seriesNumber,
      version,
    });
    const data = await this.service.completeSeries(
      personId,
      exerciseId,
      seriesNumber,
      loadKg,
      version,
    );
    const result = { data };
    this.logReturn('completeSeries', { personId, version: data.version });
    return result;
  }

  async completeRemaining(
    personId: string,
    exerciseId: string,
    loadsKg: readonly (number | null)[],
    version: number,
  ): Promise<TrainingSessionResponse> {
    this.logParams('completeRemaining', {
      exerciseId,
      personId,
      seriesCount: loadsKg.length,
      version,
    });
    const data = await this.service.completeRemainingSeries(
      personId,
      exerciseId,
      loadsKg,
      version,
    );
    const result = { data };
    this.logReturn('completeRemaining', { personId, version: data.version });
    return result;
  }

  async startTimer(
    personId: string,
    exerciseId: string,
    kind: 'duration' | 'pause',
    version: number,
  ): Promise<TrainingSessionResponse> {
    this.logParams('startTimer', { exerciseId, kind, personId, version });
    const data = await this.service.startTimer(
      personId,
      exerciseId,
      kind,
      version,
    );
    const result = { data };
    this.logReturn('startTimer', { personId, version: data.version });
    return result;
  }

  async resolveTimer(
    personId: string,
    outcome: 'cancel' | 'finish' | 'skip',
    version: number,
  ): Promise<TrainingSessionResponse> {
    this.logParams('resolveTimer', { outcome, personId, version });
    const data = await this.service.resolveTimer(personId, outcome, version);
    const result = { data };
    this.logReturn('resolveTimer', { personId, version: data.version });
    return result;
  }

  async completeExercise(
    personId: string,
    exerciseId: string,
    version: number,
  ): Promise<TrainingSessionResponse> {
    this.logParams('completeExercise', { exerciseId, personId, version });
    const data = await this.service.completeExercise(
      personId,
      exerciseId,
      version,
    );
    const result = { data };
    this.logReturn('completeExercise', { personId, version: data.version });
    return result;
  }

  async restartExercise(
    personId: string,
    exerciseId: string,
    version: number,
  ): Promise<TrainingSessionResponse> {
    this.logParams('restartExercise', { exerciseId, personId, version });
    const data = await this.service.restartExercise(
      personId,
      exerciseId,
      version,
    );
    const result = { data };
    this.logReturn('restartExercise', { personId, version: data.version });
    return result;
  }

  async complete(
    personId: string,
    version: number,
    confirmIncomplete: boolean,
    timezone: string,
  ): Promise<WorkoutExecutionSummaryResponse> {
    this.logParams('complete', { confirmIncomplete, personId, version });
    const data = await this.service.completeSession(
      personId,
      version,
      confirmIncomplete,
      timezone,
    );
    const result = { data };
    this.logReturn('complete', { executionId: data.id, personId });
    return result;
  }

  async completion(
    personId: string,
    executionId: string,
  ): Promise<WorkoutExecutionSummaryResponse> {
    this.logParams('completion', { executionId, personId });
    const data = await this.service.completion(personId, executionId);
    const result = { data };
    this.logReturn('completion', { executionId, personId });
    return result;
  }

  private logParams(method: string, params: Record<string, unknown>): void {
    this.logger.log(`TrainingCommand -> ${method} -> params:`, { params });
  }

  private logReturn(method: string, data: Record<string, unknown>): void {
    this.logger.log(`TrainingCommand -> ${method} -> return:`, { data });
  }
}
