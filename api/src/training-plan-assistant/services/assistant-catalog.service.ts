import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { BODY_AREAS } from '@dall-fit/types';

import catalogDocument from '~/training-plan-assistant/data/exercise-catalog.v2.json';
import knowledgeDocument from '~/training-plan-assistant/data/fitness-guidelines.v2.json';
import type {
  AssistantCatalogExercise,
  AssistantKnowledge,
} from '~/training-plan-assistant/domain/training-plan-assistant.types';

const optionSchema = z.strictObject({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(80),
});

const knowledgeSchema = z.strictObject({
  catalogVersion: z.literal('exercise-catalog.v2'),
  noticeVersion: z.string().min(1),
  promptVersion: z.string().min(1),
  questions: z
    .array(
      z.strictObject({
        key: z.string().min(1),
        options: z.array(optionSchema).min(2),
        prompt: z.string().min(1).max(300),
        sensitive: z.boolean().optional(),
        when: z
          .strictObject({
            key: z.string().min(1),
            values: z.array(z.string().min(1)).min(1),
          })
          .optional(),
      }),
    )
    .min(1),
  sources: z.array(z.url()).min(1),
  version: z.literal('fitness-guidelines.v2'),
});

const catalogBase = {
  active: z.boolean(),
  bodyArea: z.enum(BODY_AREAS),
  category: z.enum(['strength', 'warmup', 'cardio', 'cooldown', 'stretching']),
  equipment: z.array(z.string().min(1)).min(1),
  goalTags: z.array(z.string().min(1)).min(1),
  impact: z.enum(['high', 'low', 'none']),
  instructions: z.string().min(1).max(300),
  level: z.enum(['advanced', 'beginner', 'intermediate']),
  movementPattern: z.string().min(1),
  name: z.string().min(1).max(40),
  notes: z.string().min(1).max(300),
  requiresSupport: z.boolean(),
};
const rawCatalogSchema = z.strictObject({
  entries: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({
          ...catalogBase,
          type: z.literal('youtube-short'),
          key: z.string().regex(/^youtube-short:[A-Za-z0-9_-]{11}$/),
          youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
        }),
        z.strictObject({
          ...catalogBase,
          type: z.literal('duration'),
          key: z.string().regex(/^duration:[a-z0-9-]+$/),
          youtubeId: z
            .string()
            .regex(/^[A-Za-z0-9_-]{11}$/)
            .optional(),
          minDurationMinutes: z.number().int().min(1).max(30),
          maxDurationMinutes: z.number().int().min(1).max(30),
        }),
      ]),
    )
    .min(1),
  sources: z.array(z.string().min(1)).min(1),
  version: z.literal('exercise-catalog.v2'),
});

@Injectable()
export class AssistantCatalogService {
  private readonly logger = new Logger(AssistantCatalogService.name);
  private readonly knowledge: AssistantKnowledge;
  private readonly catalog: readonly AssistantCatalogExercise[];

  constructor() {
    this.logger.log('AssistantCatalogService -> constructor -> params:', {
      params: {},
    });
    const knowledge = knowledgeSchema.parse(knowledgeDocument);
    const rawCatalog = rawCatalogSchema.parse(catalogDocument);
    const youtubeIds = new Set(
      rawCatalog.entries.flatMap((entry) =>
        entry.youtubeId === undefined ? [] : [entry.youtubeId],
      ),
    );
    if (
      youtubeIds.size !==
      rawCatalog.entries.filter((entry) => entry.youtubeId !== undefined).length
    ) {
      throw new Error('Assistant exercise catalog contains duplicate videos.');
    }
    if (
      rawCatalog.entries.some(
        (entry) =>
          (entry.type === 'youtube-short' &&
            entry.key !== `youtube-short:${entry.youtubeId}`) ||
          (entry.type === 'duration' &&
            entry.minDurationMinutes > entry.maxDurationMinutes),
      )
    ) {
      throw new Error(
        'Assistant exercise catalog contains an inconsistent key.',
      );
    }
    const questionKeys = new Set(
      knowledge.questions.map((question) => question.key),
    );
    if (questionKeys.size !== knowledge.questions.length) {
      throw new Error('Assistant knowledge contains duplicate question keys.');
    }
    if (
      knowledge.questions.some(
        (question) =>
          question.when !== undefined && !questionKeys.has(question.when.key),
      )
    ) {
      throw new Error('Assistant knowledge contains an invalid dependency.');
    }
    this.knowledge = knowledge;
    this.catalog = rawCatalog.entries;
    this.logger.log('AssistantCatalogService -> constructor -> completed:', {
      data: {
        catalogVersion: rawCatalog.version,
        exerciseCount: this.catalog.length,
        knowledgeVersion: knowledge.version,
      },
    });
  }

  getKnowledge(): AssistantKnowledge {
    this.logger.log('AssistantCatalogService -> getKnowledge -> params:', {
      params: {},
    });
    const result = this.knowledge;
    this.logger.log('AssistantCatalogService -> getKnowledge -> return:', {
      data: { version: result.version },
    });
    return result;
  }

  getQuestion(key: string | null) {
    this.logger.log('AssistantCatalogService -> getQuestion -> params:', {
      params: { key },
    });
    const result =
      key === null
        ? null
        : (this.knowledge.questions.find((question) => question.key === key) ??
          null);
    this.logger.log('AssistantCatalogService -> getQuestion -> return:', {
      data: { found: result !== null, key },
    });
    return result;
  }

  nextQuestion(answers: Readonly<Record<string, string>>) {
    this.logger.log('AssistantCatalogService -> nextQuestion -> params:', {
      params: { answerKeys: Object.keys(answers) },
    });
    const result =
      this.knowledge.questions.find(
        (question) =>
          answers[question.key] === undefined &&
          (question.when === undefined ||
            question.when.values.includes(answers[question.when.key] ?? '')),
      ) ?? null;
    this.logger.log('AssistantCatalogService -> nextQuestion -> return:', {
      data: { questionKey: result?.key ?? null },
    });
    return result;
  }

  candidates(answers: Readonly<Record<string, string>>) {
    this.logger.log('AssistantCatalogService -> candidates -> params:', {
      params: { answerKeys: Object.keys(answers) },
    });
    const simpleGym = answers.location === 'simple-gym';
    const avoidFreeWeights = answers.preferences === 'machines';
    const result = this.catalog.filter((entry) => {
      if (!this.isTimedActivityEligible(entry, answers)) return false;
      if (!entry.active) return false;
      if (simpleGym && entry.equipment.includes('specialized-machine'))
        return false;
      if (avoidFreeWeights && entry.equipment.includes('free-weight'))
        return false;
      return true;
    });
    this.logger.log('AssistantCatalogService -> candidates -> return:', {
      data: { candidateCount: result.length },
    });
    return result;
  }

  private isTimedActivityEligible(
    entry: AssistantCatalogExercise,
    answers: Readonly<Record<string, string>>,
  ): boolean {
    if (entry.type !== 'duration') return true;
    const cardioToleranceAccepted =
      answers.tolerance === 'good' || answers.tolerance === 'avoid-impact';
    if (entry.category === 'cardio' && !cardioToleranceAccepted) return false;
    const equipment = answers.cardioEquipment ?? '';
    if (
      entry.equipment.includes('treadmill') &&
      equipment !== 'both' &&
      equipment !== 'treadmill'
    )
      return false;
    if (
      entry.equipment.includes('stationary-bike') &&
      equipment !== 'both' &&
      equipment !== 'bike'
    )
      return false;
    const canRun =
      answers.runningHabit === 'yes' &&
      answers.tolerance === 'good' &&
      answers.interruption === 'none';
    const result = entry.impact !== 'high' || canRun;
    return result;
  }

  findByKey(key: string) {
    this.logger.log('AssistantCatalogService -> findByKey -> params:', {
      params: { key },
    });
    const result = this.catalog.find((entry) => entry.key === key) ?? null;
    this.logger.log('AssistantCatalogService -> findByKey -> return:', {
      data: { found: result !== null, key },
    });
    return result;
  }

  all() {
    this.logger.log('AssistantCatalogService -> all -> params:', {
      params: {},
    });
    const result = this.catalog;
    this.logger.log('AssistantCatalogService -> all -> return:', {
      data: { exerciseCount: result.length },
    });
    return result;
  }
}
