import { describe, expect, it } from 'vitest';

import { BODY_AREAS } from '@dall-fit/types';

import seedDocument from '~/training-plan-assistant/data/global-training-plan-seeds.v1.json';
import { AssistantCatalogService } from '~/training-plan-assistant/services/assistant-catalog.service';

describe('AssistantCatalogService', () => {
  it('loads the versioned knowledge and 75 unique approved videos', () => {
    const service = new AssistantCatalogService();

    const catalog = service.all();
    const knowledge = service.getKnowledge();

    expect(catalog).toHaveLength(75);
    expect(new Set(catalog.map((entry) => entry.youtubeId)).size).toBe(75);
    expect(catalog.every((entry) => entry.youtubeId.length === 11)).toBe(true);
    expect(catalog.every((entry) => BODY_AREAS.includes(entry.bodyArea))).toBe(
      true,
    );
    expect(
      knowledge.questions.filter((question) => question.when === undefined),
    ).toHaveLength(19);
    expect(knowledge.catalogVersion).toBe('exercise-catalog.v1');
    expect(
      catalog.every(
        (entry) =>
          entry.key === `youtube-short:${entry.youtubeId}` &&
          entry.equipment.length > 0 &&
          entry.goalTags.length > 0 &&
          entry.instructions.length > 0 &&
          entry.notes.length > 0,
      ),
    ).toBe(true);
  });

  it('asks a conditional health clarification without making it universal', () => {
    const service = new AssistantCatalogService();
    const knowledge = service.getKnowledge();
    const answers = Object.fromEntries(
      knowledge.questions
        .filter((question) => question.when === undefined)
        .map((question) => [question.key, question.options[0]?.value ?? '']),
    );

    expect(service.nextQuestion(answers)).toBeNull();
    expect(
      service.nextQuestion({ ...answers, chronic: 'controlled' })?.key,
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

  it('keeps the two global seeds on 45 distinct catalog entries with 3x12/60 materialization', () => {
    const service = new AssistantCatalogService();
    const keys = seedDocument.plans.flatMap((plan) =>
      plan.workouts.flatMap((workout) => workout.catalogKeys),
    );

    expect(seedDocument.plans.map((plan) => plan.workouts.length)).toEqual([
      3, 5,
    ]);
    expect(keys).toHaveLength(45);
    expect(new Set(keys).size).toBe(45);
    expect(keys.every((key) => service.findByKey(key) !== null)).toBe(true);
  });
});
