import { describe, expect, it } from 'vitest';

import { BODY_AREAS } from '@dall-fit/types';

import seedDocument from '~/training-plan-assistant/data/global-training-plan-seeds.v2.json';
import { AssistantCatalogService } from '~/training-plan-assistant/services/assistant-catalog.service';

describe('AssistantCatalogService', () => {
  it('loads strength videos and timed activities with valid media and keys', () => {
    const service = new AssistantCatalogService();

    const catalog = service.all();
    const knowledge = service.getKnowledge();

    expect(catalog).toHaveLength(83);
    const videos = catalog.flatMap((entry) =>
      entry.youtubeId === undefined ? [] : [entry.youtubeId],
    );
    expect(new Set(videos).size).toBe(78);
    expect(videos.every((id) => id.length === 11)).toBe(true);
    expect(catalog.every((entry) => BODY_AREAS.includes(entry.bodyArea))).toBe(
      true,
    );
    expect(
      knowledge.questions.filter((question) => question.when === undefined),
    ).toHaveLength(18);
    expect(knowledge.catalogVersion).toBe('exercise-catalog.v2');
    expect(knowledge.version).toBe('fitness-guidelines.v3');
    expect(
      knowledge.questions.some((question) => question.key === 'pregnancy'),
    ).toBe(false);
    expect(
      knowledge.questions.find((question) => question.key === 'otherReason')
        ?.prompt,
    ).toBe(
      'Existe alguma situação que exija acompanhamento profissional para você começar a se exercitar, como gestação, pós-parto ou outra condição específica?',
    );
    expect(
      catalog.every(
        (entry) =>
          (entry.type === 'duration' ||
            entry.key === `youtube-short:${entry.youtubeId}`) &&
          entry.equipment.length > 0 &&
          entry.goalTags.length > 0 &&
          entry.instructions.length > 0 &&
          entry.notes.length > 0,
      ),
    ).toBe(true);
  });

  it('skips the interruption question when the person has never trained', () => {
    const service = new AssistantCatalogService();
    const questions = service.getKnowledge().questions;
    const interruptionIndex = questions.findIndex(
      (question) => question.key === 'interruption',
    );
    const answersBeforeInterruption = Object.fromEntries(
      questions
        .slice(0, interruptionIndex)
        .map((question) => [question.key, question.options[0]?.value ?? '']),
    );

    expect(
      service.nextQuestion({
        ...answersBeforeInterruption,
        experience: 'never',
      })?.key,
    ).toBe('schedule');
    expect(
      service.nextQuestion({
        ...answersBeforeInterruption,
        experience: 'beginner',
      })?.key,
    ).toBe('interruption');
  });

  it('asks a conditional health clarification without making it universal', () => {
    const service = new AssistantCatalogService();
    const knowledge = service.getKnowledge();
    const answers = Object.fromEntries(
      knowledge.questions
        .filter((question) => question.when === undefined)
        .map((question) => [question.key, question.options[0]?.value ?? '']),
    );

    expect(
      service.nextQuestion({ ...answers, cardioEquipment: 'none' }),
    ).toBeNull();
    expect(
      service.nextQuestion({
        ...answers,
        cardioEquipment: 'none',
        chronic: 'controlled',
      })?.key,
    ).toBe('chronicClarification');
  });

  it('filters free weights when the person prefers machines', () => {
    const service = new AssistantCatalogService();

    const candidates = service.candidates({
      location: 'full-gym',
      preferences: 'machines',
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every((entry) => !entry.equipment.includes('free-weight')),
    ).toBe(true);
  });

  it('requires explicit equipment and established running before offering those activities', () => {
    const service = new AssistantCatalogService();
    const base = {
      tolerance: 'good',
      interruption: 'none',
      runningHabit: 'yes',
    };
    const keys = (answers: Record<string, string>) =>
      service.candidates(answers).map((entry) => entry.key);
    expect(keys(base)).not.toContain('duration:treadmill-walk');
    expect(keys({ ...base, cardioEquipment: 'bike' })).toContain(
      'duration:stationary-bike',
    );
    expect(keys({ ...base, cardioEquipment: 'bike' })).not.toContain(
      'duration:treadmill-run',
    );
    expect(keys({ ...base, cardioEquipment: 'both' })).toContain(
      'duration:treadmill-run',
    );
    for (const changes of [
      { runningHabit: 'no' },
      { tolerance: 'avoid-impact' },
      { interruption: 'up-to-3-months' },
    ]) {
      expect(
        keys({ ...base, cardioEquipment: 'both', ...changes }),
      ).not.toContain('duration:treadmill-run');
    }
    expect(
      service
        .candidates({ ...base, cardioEquipment: 'both', tolerance: 'limited' })
        .some((entry) => entry.category === 'cardio'),
    ).toBe(false);
  });

  it('keeps the global seeds aligned with the catalog across duration, impact and volume variants', () => {
    const service = new AssistantCatalogService();
    const exercises = seedDocument.plans.flatMap((plan) =>
      plan.workouts.flatMap((workout) => workout.exercises),
    );
    const keys = exercises.map((exercise) => exercise.catalogKey);
    const strengthExercises = exercises.filter(
      (exercise) => !('durationMinutes' in exercise),
    );
    const durationExercises = exercises.filter(
      (exercise) => 'durationMinutes' in exercise,
    );

    expect(seedDocument.plans.map((plan) => plan.workouts.length)).toEqual([
      1, 2, 3, 3, 3, 4, 4, 5,
    ]);
    expect(seedDocument.version).toBe('assistant-global-training-plans.v2');
    expect(keys.every((key) => service.findByKey(key) !== null)).toBe(true);
    expect(
      seedDocument.plans.every((plan) =>
        plan.workouts.every((workout) =>
          workout.exercises.at(-1)?.catalogKey.includes('-stretch'),
        ),
      ),
    ).toBe(true);
    expect(new Set(strengthExercises.map((exercise) => exercise.sets))).toEqual(
      new Set([2, 3, 4]),
    );
    expect(
      new Set(durationExercises.map((exercise) => exercise.durationMinutes)),
    ).toEqual(new Set([2, 5, 10, 15, 20, 30]));
    expect(keys).toContain('duration:treadmill-walk');
    expect(keys).toContain('duration:stationary-bike');
    expect(keys).toContain('duration:treadmill-run');
  });
});
