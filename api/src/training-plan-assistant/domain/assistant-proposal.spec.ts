import { describe, expect, it } from 'vitest';

import { mapAssistantProposal } from '~/training-plan-assistant/domain/assistant-proposal';
import type { AssistantProposalExercise } from '~/training-plan-assistant/domain/training-plan-assistant.types';
import { AssistantCatalogService } from '~/training-plan-assistant/services/assistant-catalog.service';

const catalog = new AssistantCatalogService();
const answers = {
  frequency: '2',
  duration: '60',
  experience: 'intermediate',
  interruption: 'none',
  tolerance: 'good',
  cardioEquipment: 'both',
  runningHabit: 'yes',
};
const candidates = catalog.candidates(answers);
const upper = candidates.find(
  (entry) => entry.bodyArea === 'chest' && entry.category === 'strength',
);
const lower = candidates.find(
  (entry) => entry.bodyArea === 'quadriceps' && entry.category === 'strength',
);
if (upper === undefined || lower === undefined)
  throw new Error('Missing strength fixtures');
const strength = (key = upper.key): AssistantProposalExercise => ({
  catalogKey: key,
  sets: 3,
  repetitions: 12,
  restSeconds: 60,
});
const timed = (
  key: string,
  durationMinutes: number,
): AssistantProposalExercise => ({
  catalogKey: `duration:${key}`,
  durationMinutes,
});
const complete = (
  cardio = 'stationary-bike',
  minutes = 10,
  key = upper.key,
) => [
  timed('warmup-walk', 5),
  strength(key),
  timed(cardio, minutes),
  timed('cooldown-walk', 5),
  timed('quadriceps-stretch', 2),
];
const proposal = (exercises: readonly AssistantProposalExercise[]) => ({
  planName: 'Evolução equilibrada',
  description: 'Plano geral para desenvolver força e condicionamento.',
  workouts: [
    { name: 'Força de tronco', exercises },
    { name: 'Base de pernas', exercises },
  ],
});

describe('assistant proposal activity rules', () => {
  it('counts all phases and uses catalog instructions and video for a timed stretch', () => {
    const result = mapAssistantProposal(
      proposal(complete()),
      candidates,
      answers,
      true,
    );
    expect(result.workouts[0]?.estimatedDurationMinutes).toBe(28);
    const stretch = result.workouts[0]?.exercises.at(-1);
    expect(stretch).toMatchObject({
      type: 'duration',
      durationMinutes: 2,
      youtubeId: 'yFvf_tdVook',
    });
    expect(
      stretch?.type === 'duration' ? stretch.instructions : undefined,
    ).toContain('10–20 s');
    expect(result.planName).toBe('Evolução equilibrada');
    expect(result.workouts.map((workout) => workout.name)).toEqual([
      'Força de tronco',
      'Base de pernas',
    ]);
  });

  it('rejects English titles or descriptions instead of replacing creative text', () => {
    const valid = proposal(complete());
    for (const invalid of [
      { ...valid, planName: 'Balanced fitness plan' },
      {
        ...valid,
        description: 'This workout builds strength for the whole body.',
      },
      {
        ...valid,
        workouts: [
          { ...valid.workouts[0], name: 'Upper body' },
          valid.workouts[1],
        ],
      },
    ])
      expect(() =>
        mapAssistantProposal(invalid, candidates, answers),
      ).toThrow();
  });

  it('allows light cycling on a leg day but rejects longer cardio and running', () => {
    expect(() =>
      mapAssistantProposal(
        proposal(complete('stationary-bike', 10, lower.key)),
        candidates,
        answers,
      ),
    ).not.toThrow();
    for (const exercises of [
      complete('stationary-bike', 15, lower.key),
      complete('treadmill-run', 5, lower.key),
    ]) {
      expect(() =>
        mapAssistantProposal(proposal(exercises), candidates, answers),
      ).toThrow();
    }
  });

  it('limits beginners and returners to ten minutes of main cardio', () => {
    for (const profile of [
      { ...answers, experience: 'beginner' },
      { ...answers, interruption: 'up-to-3-months' },
    ]) {
      expect(() =>
        mapAssistantProposal(
          proposal(complete('treadmill-walk', 15)),
          candidates,
          profile,
        ),
      ).toThrow();
    }
    expect(() =>
      mapAssistantProposal(
        proposal(complete('treadmill-walk', 20)),
        candidates,
        answers,
      ),
    ).not.toThrow();
  });

  it('rejects wrong order, missing cool down, wrong prescription kind and total time overflow', () => {
    for (const exercises of [
      [timed('quadriceps-stretch', 2), ...complete().slice(0, -1)],
      complete().filter((item) => item.catalogKey !== 'duration:cooldown-walk'),
      [strength('duration:stationary-bike')],
      [timed(upper.key, 5)],
    ])
      expect(() =>
        mapAssistantProposal(proposal(exercises), candidates, answers),
      ).toThrow();
    expect(() =>
      mapAssistantProposal(proposal(complete()), candidates, {
        ...answers,
        duration: '20',
      }),
    ).toThrow();
  });

  it('requires eligible cardio in an initial plan with enough time, but permits a short session', () => {
    const short = [
      timed('warmup-walk', 5),
      strength(),
      timed('quadriceps-stretch', 2),
    ];
    expect(() =>
      mapAssistantProposal(proposal(short), candidates, answers, true),
    ).toThrow();
    expect(() =>
      mapAssistantProposal(
        proposal(short),
        candidates,
        { ...answers, duration: '15' },
        true,
      ),
    ).not.toThrow();
    expect(() =>
      mapAssistantProposal(proposal([strength()]), candidates, answers, true),
    ).toThrow();
  });
});
