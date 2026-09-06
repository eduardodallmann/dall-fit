import { describe, expect, it } from 'vitest';

import { mapAssistantProposal } from '~/training-plan-assistant/domain/assistant-proposal';
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
      provider.interpret({
        candidateQuestions: [],
        currentQuestion,
        existingAnswers: {},
        text: 'Sim',
      }),
    ).resolves.toEqual({
      anticipatedAnswers: [],
      kind: 'answer',
      suggestedValue: 'yes',
    });
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
      catalogVersion: 'exercise-catalog.v2',
      knowledgeVersion: 'fitness-guidelines.v2',
      promptVersion: 'training-plan-assistant.v2',
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

  it.each([15, 30, 45, 60])(
    'generates a validated mixed plan within %s minutes',
    async (duration) => {
      const catalog = new AssistantCatalogService();
      const answers = {
        duration: String(duration),
        experience: 'beginner',
        frequency: '3',
        interruption: 'none',
        tolerance: 'good',
        cardioEquipment: 'both',
      };
      const candidates = catalog.candidates(answers);
      const proposal = await new FakeTrainingPlanAssistantProvider().propose({
        answers,
        candidates,
        catalogVersion: 'exercise-catalog.v2',
        knowledgeVersion: 'fitness-guidelines.v2',
        promptVersion: 'training-plan-assistant.v2',
      });
      const draft = mapAssistantProposal(proposal, candidates, answers, true);
      expect(
        draft.workouts.every(
          (workout) => workout.estimatedDurationMinutes <= duration,
        ),
      ).toBe(true);
    },
  );

  it('preserves an anticipated non-sensitive answer while clarifying the current question', async () => {
    const provider = new FakeTrainingPlanAssistantProvider();

    await expect(
      provider.interpret({
        candidateQuestions: [
          {
            key: 'interruption',
            options: [
              { label: 'Até 3 meses', value: 'up-to-3-months' },
              { label: 'Mais de 1 ano', value: 'over-1-year' },
            ],
            prompt: 'Há quanto tempo você está sem treinar?',
          },
        ],
        currentQuestion: {
          key: 'experience',
          options: [
            { label: 'Iniciante', value: 'beginner' },
            { label: 'Intermediário', value: 'intermediate' },
          ],
          prompt: 'Como você descreve sua experiência com treino?',
        },
        existingAnswers: {},
        text: 'Já treinei por 1 ano, mas estou parado há 3 meses.',
      }),
    ).resolves.toMatchObject({
      anticipatedAnswers: [
        {
          questionKey: 'interruption',
          suggestedValue: 'up-to-3-months',
        },
      ],
      kind: 'clarification',
    });
  });
});
