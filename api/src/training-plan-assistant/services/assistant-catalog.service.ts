import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { BODY_AREAS } from '@dall-fit/types';

import catalogDocument from '~/training-plan-assistant/data/exercise-catalog.v1.json';
import knowledgeDocument from '~/training-plan-assistant/data/fitness-guidelines.v1.json';
import type {
  AssistantCatalogExercise,
  AssistantKnowledge,
} from '~/training-plan-assistant/domain/training-plan-assistant.types';

const optionSchema = z.strictObject({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(80),
});

const knowledgeSchema = z.strictObject({
  catalogVersion: z.literal('exercise-catalog.v1'),
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
  version: z.literal('fitness-guidelines.v1'),
});

const rawCatalogSchema = z.strictObject({
  entries: z
    .array(
      z.strictObject({
        active: z.boolean(),
        bodyArea: z.enum(BODY_AREAS),
        equipment: z.array(z.string().min(1)).min(1),
        goalTags: z.array(z.string().min(1)).min(1),
        impact: z.enum(['high', 'low', 'none']),
        instructions: z.string().min(1).max(300),
        key: z.string().regex(/^youtube-short:[A-Za-z0-9_-]{11}$/),
        level: z.enum(['advanced', 'beginner', 'intermediate']),
        movementPattern: z.string().min(1),
        name: z.string().min(1).max(40),
        notes: z.string().min(1).max(300),
        requiresSupport: z.boolean(),
        type: z.literal('youtube-short'),
        youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
      }),
    )
    .length(75),
  sources: z.array(z.string().min(1)).min(1),
  version: z.literal('exercise-catalog.v1'),
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
      rawCatalog.entries.map((entry) => entry.youtubeId),
    );
    if (youtubeIds.size !== rawCatalog.entries.length) {
      throw new Error('Assistant exercise catalog contains duplicate videos.');
    }
    if (
      rawCatalog.entries.some(
        (entry) => entry.key !== `youtube-short:${entry.youtubeId}`,
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
