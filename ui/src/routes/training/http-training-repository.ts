import type { TrainingRepository } from './training-repository';
import {
  abandonTrainingSession,
  completeRemainingTrainingSeries,
  completeTrainingExercise,
  completeTrainingSeries,
  completeTrainingSession,
  getTrainingOverview,
  getTrainingSession,
  getTrainingWorkoutPreview,
  getWorkoutExecutionSummary,
  resolveTrainingTimer,
  restartTrainingExercise,
  saveTrainingLoad,
  startTrainingSession,
  startTrainingTimer,
  type MockTrainingScenario,
} from './training-service';

export function createHttpTrainingRepository(
  scenario: MockTrainingScenario,
): TrainingRepository {
  return {
    source: 'web',
    abandonSession: () => abandonTrainingSession(scenario),
    completeExercise: (exerciseId, version) =>
      completeTrainingExercise(exerciseId, version, scenario),
    completeRemainingSeries: (exerciseId, loadsKg, version) =>
      completeRemainingTrainingSeries(exerciseId, loadsKg, version, scenario),
    completeSeries: (exerciseId, seriesNumber, loadKg, version) =>
      completeTrainingSeries(
        exerciseId,
        seriesNumber,
        loadKg,
        version,
        scenario,
      ),
    completeSession: (confirmIncomplete, timezone, version) =>
      completeTrainingSession(confirmIncomplete, timezone, version, scenario),
    getCompletion: (executionId, signal) =>
      getWorkoutExecutionSummary(executionId, scenario, signal),
    getOverview: (catalogEntryId, signal) =>
      getTrainingOverview(scenario, catalogEntryId, signal),
    getPreview: (workoutId, catalogEntryId, signal) =>
      getTrainingWorkoutPreview(workoutId, scenario, catalogEntryId, signal),
    getSession: (signal) => getTrainingSession(scenario, signal),
    resolveTimer: (outcome, version) =>
      resolveTrainingTimer(outcome, version, scenario),
    restartExercise: (exerciseId, version) =>
      restartTrainingExercise(exerciseId, version, scenario),
    saveLoad: (exerciseId, seriesNumber, loadKg, version) =>
      saveTrainingLoad(exerciseId, seriesNumber, loadKg, version, scenario),
    startSession: (workoutId, catalogEntryId) =>
      startTrainingSession(workoutId, scenario, catalogEntryId),
    startTimer: (exerciseId, kind, version) =>
      startTrainingTimer(exerciseId, kind, version, scenario),
  };
}
