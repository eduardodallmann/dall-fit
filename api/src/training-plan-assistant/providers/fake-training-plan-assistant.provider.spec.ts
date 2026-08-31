import { describe, expect, it } from 'vitest';

import { FakeTrainingPlanAssistantProvider } from '~/training-plan-assistant/providers/fake-training-plan-assistant.provider';
import { AssistantCatalogService } from '~/training-plan-assistant/services/assistant-catalog.service';

describe('FakeTrainingPlanAssistantProvider', () => {
  it('keeps interpretation and reformulation restricted to the current question', async () => {
    const provider = new FakeTrainingPlanAssistantProvider();
    const currentQuestion = {
      key: 'adult',
      options: [
        { label: 'Sim', value: 'yes' },
        { label: 'Não', value: 'no' },
      ],
      prompt: 'Você confirma que tem 18 anos ou mais?',
    };

    await expect(
      provider.interpret({ currentQuestion, existingAnswers: {}, text: 'Sim' }),
    ).resolves.toEqual({ kind: 'answer', suggestedValue: 'yes' });
    const reformulation = await provider.reformulate({
      currentQuestion,
      invalidAttemptCount: 3,
    });
    expect(reformulation.text).toContain('Escolha');
  });

  it('creates the exact requested frequency from eligible catalog keys', async () => {
    const catalog = new AssistantCatalogService();
    const provider = new FakeTrainingPlanAssistantProvider();
    const candidates = catalog.candidates({});

    const result = await provider.propose({
      answers: { experience: 'beginner', frequency: '3' },
      candidates,
      catalogVersion: 'exercise-catalog.v1',
      knowledgeVersion: 'fitness-guidelines.v1',
      promptVersion: 'training-plan-assistant.v1',
    });

    expect(result.workouts).toHaveLength(3);
    expect(
      result.workouts.every((workout) => workout.exercises.length > 0),
    ).toBe(true);
    const allowed = new Set(candidates.map((candidate) => candidate.key));
    expect(
      result.workouts.every((workout) =>
        workout.exercises.every((exercise) => allowed.has(exercise.catalogKey)),
      ),
    ).toBe(true);
  });
});
