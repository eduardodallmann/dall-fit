import { createHash, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type {
  TrainingPlanAssistantDraft,
  TrainingPlanAssistantScreeningOutcome,
  TrainingPlanAssistantSession,
} from '@dall-fit/types';

import type {
  AssistantProposal,
  AssistantSessionEntity,
} from '~/training-plan-assistant/domain/training-plan-assistant.types';
import {
  assistantCatalogMismatch,
  assistantDraftInvalid,
  assistantIdempotencyReused,
  assistantInvalidState,
  assistantMessageLimit,
  assistantProviderUnavailable,
  assistantScreeningBlocked,
  assistantSessionExpired,
  assistantSessionNotFound,
  assistantVersionConflict,
} from '~/training-plan-assistant/errors/training-plan-assistant.errors';
import { TrainingPlanAssistantRepository } from '~/training-plan-assistant/repositories/training-plan-assistant.repository';
import { AssistantCatalogService } from '~/training-plan-assistant/services/assistant-catalog.service';
import { AssistantProviderService } from '~/training-plan-assistant/services/assistant-provider.service';
import { AssistantTrainingPlanMaterializationService } from '~/training-plan/services/assistant-training-plan-materialization.service';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PERSON_MESSAGES = 40;
const OFF_TOPIC_RESPONSE =
  'Posso ajudar apenas a montar seu plano de treino. Vamos continuar:';
const ANTICIPATABLE_QUESTION_KEYS = new Set([
  'experience',
  'goal',
  'infrastructure',
  'interruption',
  'preferences',
  'schedule',
  'tolerance',
]);

@Injectable()
export class TrainingPlanAssistantSessionService {
  private readonly logger = new Logger(
    TrainingPlanAssistantSessionService.name,
  );

  constructor(
    private readonly repository: TrainingPlanAssistantRepository,
    private readonly catalog: AssistantCatalogService,
    private readonly provider: AssistantProviderService,
    private readonly materialization: AssistantTrainingPlanMaterializationService,
  ) {}

  async get(personId: string): Promise<TrainingPlanAssistantSession | null> {
    this.logger.log('TrainingPlanAssistantSessionService -> get -> params:', {
      params: { personId },
    });
    const session = await this.repository.findActive(personId);
    this.logger.log(
      'TrainingPlanAssistantSessionService -> get -> repository return:',
      { data: { found: session !== null, personId } },
    );
    if (session === null) {
      const result = null;
      this.logger.log('TrainingPlanAssistantSessionService -> get -> return:', {
        data: { found: false, personId },
      });
      return result;
    }
    await this.assertNotExpired(session);
    const result = this.toPublic(session);
    this.logger.log('TrainingPlanAssistantSessionService -> get -> return:', {
      data: { sessionId: result.id, status: result.status },
    });
    return result;
  }

  async createOrResume(
    personId: string,
    noticeVersion: string,
  ): Promise<{ created: boolean; session: TrainingPlanAssistantSession }> {
    this.logger.log(
      'TrainingPlanAssistantSessionService -> createOrResume -> params:',
      { params: { noticeVersion, personId } },
    );
    this.provider.assertEnabled();
    const existing = await this.repository.findActive(personId);
    if (existing !== null) {
      if (existing.expiresAt.getTime() <= Date.now()) {
        await this.repository.deleteActive(personId);
      } else {
        const result = { created: false, session: this.toPublic(existing) };
        this.logger.log(
          'TrainingPlanAssistantSessionService -> createOrResume -> existing branch:',
          { data: { sessionId: existing.id } },
        );
        return result;
      }
    }
    const knowledge = this.catalog.getKnowledge();
    if (noticeVersion !== knowledge.noticeVersion) {
      throw assistantCatalogMismatch();
    }
    const firstQuestion = knowledge.questions[0];
    if (firstQuestion === undefined) throw assistantInvalidState();
    const now = new Date();
    const created = await this.repository.create({
      active: true,
      answers: {},
      catalogVersion: knowledge.catalogVersion,
      createdAt: now,
      currentQuestionKey: firstQuestion.key,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      generatedDraft: null,
      invalidAttempts: {},
      knowledgeVersion: knowledge.version,
      materialization: null,
      messages: [
        {
          createdAt: now,
          id: randomUUID(),
          role: 'assistant',
          text: firstQuestion.prompt,
        },
      ],
      model: this.provider.modelName(),
      noticeVersion,
      operationKeys: {},
      personId,
      promptVersion: knowledge.promptVersion,
      provider: this.provider.providerName(),
      screeningOutcome: null,
      status: 'collecting',
      updatedAt: now,
      version: 0,
    });
    const result = { created: true, session: this.toPublic(created) };
    this.logger.log(
      'TrainingPlanAssistantSessionService -> createOrResume -> return:',
      { data: { created: true, sessionId: created.id } },
    );
    return result;
  }

  // The state transition intentionally keeps message validation, screening and CAS in one atomic orchestration.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async sendMessage(
    personId: string,
    expectedVersion: number,
    clientMessageId: string,
    text: string,
  ): Promise<TrainingPlanAssistantSession> {
    this.logger.log(
      'TrainingPlanAssistantSessionService -> sendMessage -> params:',
      {
        params: {
          clientMessageId,
          expectedVersion,
          personId,
          textLength: text.length,
        },
      },
    );
    const session = await this.requireActive(personId);
    const operationKey = `message:${clientMessageId}`;
    const hash = this.hash(text);
    const replay = session.operationKeys[operationKey];
    if (replay !== undefined) {
      if (replay.hash !== hash) throw assistantIdempotencyReused();
      const result = replay.session;
      this.logger.log(
        'TrainingPlanAssistantSessionService -> sendMessage -> replay branch:',
        { data: { sessionId: session.id, version: result.version } },
      );
      return result;
    }
    this.assertVersion(session, expectedVersion);
    const personMessageCount = session.messages.filter(
      (message) => message.role === 'person',
    ).length;
    if (personMessageCount >= MAX_PERSON_MESSAGES)
      throw assistantMessageLimit();
    if (
      session.status === 'blocked' ||
      session.status === 'completed' ||
      session.status === 'generating'
    ) {
      throw assistantInvalidState();
    }

    const now = new Date();
    const receivedQuestion = this.catalog.getQuestion(
      session.currentQuestionKey,
    );
    const visiblePersonText =
      receivedQuestion?.options.find((option) => option.value === text)
        ?.label ?? text;
    const messages = [
      ...session.messages,
      {
        createdAt: now,
        id: clientMessageId,
        role: 'person' as const,
        text: visiblePersonText,
      },
    ];
    let answers = { ...session.answers };
    const invalidAttempts = { ...session.invalidAttempts };
    let generatedDraft = session.generatedDraft;
    let status: AssistantSessionEntity['status'] = session.status;
    let currentQuestionKey = session.currentQuestionKey;
    let screeningOutcome = session.screeningOutcome;
    let assistantText = '';
    let anticipatedAcknowledgement = '';
    let contextualClarification = '';

    if (this.isUnsafeOrOffTopic(text)) {
      const question = this.catalog.getQuestion(currentQuestionKey);
      assistantText = `${OFF_TOPIC_RESPONSE} ${question?.prompt ?? ''}`.trim();
      this.logger.warn(
        'TrainingPlanAssistantSessionService -> sendMessage -> restrictedContent branch:',
        { data: { questionKey: currentQuestionKey, sessionId: session.id } },
      );
    } else {
      let parsed = this.parseAnswers(text, currentQuestionKey, answers);
      const currentQuestion = this.catalog.getQuestion(currentQuestionKey);
      const scheduleNeedsInterpretation =
        currentQuestionKey === 'schedule' &&
        !this.hasCompleteSchedule({ ...answers, ...parsed });
      if (
        currentQuestion !== null &&
        (Object.keys(parsed).length === 0 || scheduleNeedsInterpretation)
      ) {
        const deterministicAnticipated =
          this.deterministicAnticipatedAnswers(text);
        const describesTrainingHistory =
          currentQuestion.key === 'experience' &&
          this.describesTrainingHistory(text);
        const interpretation = await this.provider.interpret({
          candidateQuestions: this.interpretableQuestions(
            answers,
            currentQuestion.key,
          ),
          currentQuestion,
          existingAnswers: answers,
          text,
        });
        const suggestedOption = currentQuestion.options.find(
          (option) => option.value === interpretation.suggestedValue,
        );
        contextualClarification = interpretation.clarification ?? '';
        if (
          interpretation.kind === 'answer' &&
          suggestedOption !== undefined &&
          currentQuestionKey !== null &&
          this.canAcceptSuggestedOption(currentQuestion.key, text)
        ) {
          parsed = {
            ...parsed,
            ...this.parseAnswers(
              suggestedOption.value,
              currentQuestionKey,
              answers,
            ),
          };
        } else if (interpretation.kind === 'injection') {
          assistantText = `${OFF_TOPIC_RESPONSE} ${currentQuestion.prompt}`;
          parsed = {};
        } else if (
          interpretation.kind === 'off_topic' &&
          deterministicAnticipated.length === 0 &&
          !describesTrainingHistory
        ) {
          assistantText = `${OFF_TOPIC_RESPONSE} ${currentQuestion.prompt}`;
          parsed = {};
        }
        if (describesTrainingHistory && parsed.experience === undefined) {
          contextualClarification = this.experienceClarification(text);
        }
        if (
          currentQuestionKey === 'schedule' &&
          interpretation.kind !== 'injection' &&
          interpretation.kind !== 'off_topic'
        ) {
          parsed = {
            ...parsed,
            ...(interpretation.extractedSchedule?.durationMinutes === undefined
              ? {}
              : {
                  duration: String(
                    interpretation.extractedSchedule.durationMinutes,
                  ),
                }),
            ...(interpretation.extractedSchedule?.frequency === undefined
              ? {}
              : {
                  frequency: String(interpretation.extractedSchedule.frequency),
                }),
          };
          parsed = this.completeSchedule(parsed, answers);
        }
        if (
          interpretation.kind !== 'injection' &&
          (interpretation.kind !== 'off_topic' ||
            deterministicAnticipated.length > 0 ||
            describesTrainingHistory)
        ) {
          const anticipated = this.validatedAnticipatedAnswers(
            [
              ...(interpretation.anticipatedAnswers ?? []),
              ...deterministicAnticipated,
            ],
            answers,
            currentQuestion.key,
          );
          if (Object.keys(anticipated).length > 0) {
            answers = { ...answers, ...anticipated };
            generatedDraft = null;
            anticipatedAcknowledgement =
              this.anticipatedAcknowledgement(anticipated);
          }
        }
      }
      if (Object.keys(parsed).length === 0) {
        if (currentQuestionKey === null || currentQuestion === null)
          throw assistantInvalidState();
        invalidAttempts[currentQuestionKey] =
          (invalidAttempts[currentQuestionKey] ?? 0) + 1;
        status = 'clarifying';
        if (assistantText.length === 0) {
          if (contextualClarification.length > 0) {
            assistantText = contextualClarification;
          } else {
            const reformulation = await this.provider.reformulate({
              currentQuestion,
              invalidAttemptCount: invalidAttempts[currentQuestionKey] ?? 0,
            });
            assistantText =
              (invalidAttempts[currentQuestionKey] ?? 0) >= 3
                ? `Não consegui confirmar a resposta. ${reformulation.text}`
                : reformulation.text;
          }
        }
      } else {
        const changedKeys = Object.keys(parsed).filter(
          (key) => answers[key] !== undefined && answers[key] !== parsed[key],
        );
        answers = { ...answers, ...parsed };
        if (changedKeys.length > 0 || session.generatedDraft !== null) {
          generatedDraft = null;
        }
        if (
          currentQuestionKey === 'schedule' &&
          !this.hasCompleteSchedule(answers)
        ) {
          status = 'clarifying';
          assistantText = this.scheduleClarification(answers);
        } else {
          screeningOutcome = this.screen(answers);
          const transition = this.resolveTransition(answers, screeningOutcome);
          status = transition.status;
          currentQuestionKey = transition.questionKey;
          assistantText = transition.message;
        }
      }
    }

    if (anticipatedAcknowledgement.length > 0) {
      assistantText =
        contextualClarification.length > 0 &&
        assistantText === contextualClarification
          ? `${assistantText} ${anticipatedAcknowledgement}`.trim()
          : `${anticipatedAcknowledgement} ${assistantText}`.trim();
    }

    const draftSession: AssistantSessionEntity = {
      ...session,
      answers,
      currentQuestionKey,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      generatedDraft,
      invalidAttempts,
      messages: [
        ...messages,
        {
          createdAt: now,
          id: randomUUID(),
          role: 'assistant',
          text: assistantText,
        },
      ],
      screeningOutcome,
      status,
      updatedAt: now,
    };
    const predicted = this.toPublic({
      ...draftSession,
      version: expectedVersion + 1,
    });
    draftSession.operationKeys = {
      ...draftSession.operationKeys,
      [operationKey]: { hash, session: predicted },
    };
    const saved = await this.repository.save(draftSession, expectedVersion);
    if (saved === null) throw assistantVersionConflict();
    const result = this.toPublic(saved);
    this.logger.log(
      'TrainingPlanAssistantSessionService -> sendMessage -> return:',
      {
        data: {
          questionKey: saved.currentQuestionKey,
          sessionId: saved.id,
          status: saved.status,
          version: saved.version,
        },
      },
    );
    return result;
  }

  // Generation reserves the state, translates provider failures and commits the validated draft atomically.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async generateDraft(
    personId: string,
    expectedVersion: number,
    idempotencyKey: string,
    adjustment?: string,
  ): Promise<TrainingPlanAssistantSession> {
    this.logger.log(
      'TrainingPlanAssistantSessionService -> generateDraft -> params:',
      {
        params: {
          adjustmentPresent: adjustment !== undefined,
          expectedVersion,
          personId,
        },
      },
    );
    const session = await this.requireActive(personId);
    const operationKey = `draft:${idempotencyKey}`;
    const hash = this.hash(adjustment ?? 'initial');
    const replay = session.operationKeys[operationKey];
    if (replay !== undefined) {
      if (replay.hash !== hash) throw assistantIdempotencyReused();
      const result = replay.session;
      this.logger.log(
        'TrainingPlanAssistantSessionService -> generateDraft -> replay branch:',
        { data: { sessionId: session.id, version: result.version } },
      );
      return result;
    }
    this.assertVersion(session, expectedVersion);
    if (
      session.screeningOutcome !== 'apto_para_fluxo_geral' ||
      (session.status !== 'ready' && session.status !== 'preview')
    ) {
      throw assistantScreeningBlocked();
    }
    if (
      session.catalogVersion !== this.catalog.getKnowledge().catalogVersion ||
      session.knowledgeVersion !== this.catalog.getKnowledge().version
    ) {
      throw assistantCatalogMismatch();
    }
    if (adjustment !== undefined && this.isUnsafeOrOffTopic(adjustment)) {
      throw assistantInvalidState();
    }
    const generating = await this.repository.save(
      {
        ...session,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        status: 'generating',
      },
      expectedVersion,
    );
    if (generating === null) throw assistantVersionConflict();
    const candidates = this.catalog.candidates(session.answers);
    let proposal: AssistantProposal;
    try {
      proposal = await this.provider.propose({
        adjustment,
        answers: session.answers,
        candidates,
        catalogVersion: session.catalogVersion,
        ...(session.generatedDraft === null
          ? {}
          : { currentDraft: session.generatedDraft }),
        knowledgeVersion: session.knowledgeVersion,
        promptVersion: session.promptVersion,
      });
    } catch (error: unknown) {
      await this.repository.save(
        {
          ...generating,
          status: session.generatedDraft === null ? 'ready' : 'preview',
        },
        generating.version,
      );
      if (error instanceof Error && 'getStatus' in error) throw error;
      throw assistantProviderUnavailable();
    }
    let draft: TrainingPlanAssistantDraft;
    try {
      draft = this.validateAndMapProposal(
        proposal,
        candidates,
        session.answers,
      );
    } catch (error: unknown) {
      await this.repository.save(
        {
          ...generating,
          status: session.generatedDraft === null ? 'ready' : 'preview',
        },
        generating.version,
      );
      throw error;
    }
    const now = new Date();
    const draftSession: AssistantSessionEntity = {
      ...generating,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      generatedDraft: draft,
      messages: [
        ...generating.messages,
        {
          createdAt: now,
          id: randomUUID(),
          role: 'assistant',
          text:
            adjustment === undefined
              ? 'Preparei uma prévia. Revise antes de criar o plano.'
              : 'Atualizei a prévia dentro do escopo informado.',
        },
      ],
      status: 'preview',
      updatedAt: now,
    };
    const predicted = this.toPublic({
      ...draftSession,
      version: generating.version + 1,
    });
    draftSession.operationKeys = {
      ...draftSession.operationKeys,
      [operationKey]: { hash, session: predicted },
    };
    const saved = await this.repository.save(draftSession, generating.version);
    if (saved === null) throw assistantVersionConflict();
    const result = this.toPublic(saved);
    this.logger.log(
      'TrainingPlanAssistantSessionService -> generateDraft -> return:',
      {
        data: {
          sessionId: result.id,
          version: result.version,
          workoutCount: result.draft?.workouts.length ?? 0,
        },
      },
    );
    return result;
  }

  async confirm(
    personId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<{
    catalogEntryId: string;
    trainingPlanId: string;
    replay: boolean;
  }> {
    this.logger.log(
      'TrainingPlanAssistantSessionService -> confirm -> params:',
      { params: { expectedVersion, personId } },
    );
    const idempotencyHash = this.hash(idempotencyKey);
    const receipt = await this.repository.findReceipt(
      personId,
      idempotencyHash,
    );
    if (receipt !== null) {
      const result = {
        catalogEntryId: receipt.catalogEntryId,
        replay: true,
        trainingPlanId: receipt.trainingPlanId,
      };
      this.logger.log(
        'TrainingPlanAssistantSessionService -> confirm -> replay branch:',
        { data: result },
      );
      return result;
    }
    let session = await this.requireActive(personId);
    this.assertVersion(session, expectedVersion);
    if (
      session.status !== 'preview' ||
      session.generatedDraft === null ||
      this.screen(session.answers) !== 'apto_para_fluxo_geral'
    ) {
      throw assistantInvalidState();
    }
    if (session.catalogVersion !== this.catalog.getKnowledge().catalogVersion) {
      throw assistantCatalogMismatch();
    }
    if (session.materialization === null) {
      const ids = this.materialization.reserveIds();
      const reserved = await this.repository.save(
        {
          ...session,
          materialization: { ...ids, idempotencyHash },
        },
        expectedVersion,
      );
      if (reserved === null) throw assistantVersionConflict();
      session = reserved;
    } else if (session.materialization.idempotencyHash !== idempotencyHash) {
      throw assistantIdempotencyReused();
    }
    const materialization = session.materialization;
    const generatedDraft = session.generatedDraft;
    if (materialization === null || generatedDraft === null)
      throw assistantInvalidState();
    await this.materialization.materialize(
      personId,
      materialization,
      generatedDraft,
    );
    const confirmation = {
      catalogEntryId: materialization.catalogEntryId,
      expiresAt: new Date(Date.now() + RECEIPT_TTL_MS),
      idempotencyHash,
      personId,
      trainingPlanId: materialization.trainingPlanId,
    };
    const createdReceipt = await this.repository.createReceipt(confirmation);
    if (createdReceipt === null) {
      const concurrent = await this.repository.findReceipt(
        personId,
        idempotencyHash,
      );
      if (concurrent === null) throw assistantInvalidState();
    }
    await this.repository.deleteActive(personId);
    const result = {
      catalogEntryId: confirmation.catalogEntryId,
      replay: false,
      trainingPlanId: confirmation.trainingPlanId,
    };
    this.logger.log(
      'TrainingPlanAssistantSessionService -> confirm -> return:',
      { data: result },
    );
    return result;
  }

  async abandon(personId: string): Promise<void> {
    this.logger.log(
      'TrainingPlanAssistantSessionService -> abandon -> params:',
      { params: { personId } },
    );
    await this.repository.deleteActive(personId);
    this.logger.log(
      'TrainingPlanAssistantSessionService -> abandon -> completed:',
      { data: { personId } },
    );
  }

  private async requireActive(personId: string) {
    const session = await this.repository.findActive(personId);
    if (session === null) throw assistantSessionNotFound();
    await this.assertNotExpired(session);
    return session;
  }

  private async assertNotExpired(
    session: AssistantSessionEntity,
  ): Promise<void> {
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.repository.deleteActive(session.personId);
      throw assistantSessionExpired();
    }
  }

  private assertVersion(
    session: AssistantSessionEntity,
    expectedVersion: number,
  ): void {
    if (session.version !== expectedVersion) throw assistantVersionConflict();
  }

  // Deterministic extraction deliberately handles every supported composite answer without delegating safety to the model.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  private parseAnswers(
    text: string,
    currentQuestionKey: string | null,
    existing: Readonly<Record<string, string>>,
  ): Record<string, string> {
    const normalized = text.normalize('NFKC').toLocaleLowerCase('pt-BR');
    const result: Record<string, string> = {};
    const question = this.catalog.getQuestion(currentQuestionKey);
    const direct = question?.options.find(
      (option) =>
        option.value.toLocaleLowerCase('pt-BR') === normalized ||
        option.label.toLocaleLowerCase('pt-BR') === normalized,
    );
    if (direct !== undefined && currentQuestionKey !== null) {
      result[currentQuestionKey] = direct.value;
      if (currentQuestionKey === 'schedule') {
        const [frequencyValue, durationValue] = direct.value.split('-');
        if (frequencyValue !== undefined && durationValue !== undefined) {
          result.frequency = frequencyValue;
          result.duration = durationValue;
        }
      }
      if (currentQuestionKey === 'infrastructure') {
        result.location = this.locationFromInfrastructure(direct.value);
        result.equipment = this.equipmentFromInfrastructure(direct.value);
      }
      if (currentQuestionKey === 'tolerance') {
        result.walkingTolerance = direct.value === 'good' ? 'good' : 'limited';
        result.cyclingTolerance = direct.value === 'good' ? 'good' : 'limited';
        result.impactTolerance =
          direct.value === 'avoid-impact' ? 'avoid' : direct.value;
      }
    }
    const frequency =
      normalized.match(/\b([2-7])\s*(?:dias?|vezes?)(?:\s+por)?\s+semana\b/) ??
      normalized.match(/(?:frequ[eê]ncia|treinar|semana)\D{0,12}([2-7])/);
    if (frequency?.[1] !== undefined) result.frequency = frequency[1];
    const duration = normalized.match(
      /\b(15|20|30|40|45|50|60|75|90|120)\s*min/,
    );
    if (duration?.[1] !== undefined) result.duration = duration[1];
    else if (/\b(?:uma\s+)?hora\s+e\s+meia\b/.test(normalized))
      result.duration = '90';
    else if (/\bmeia\s+hora\b/.test(normalized)) result.duration = '30';
    else if (/\b(?:uma|1)\s+hora\b/.test(normalized)) result.duration = '60';
    const goals: readonly [string, string][] = [
      ['hipertrof', 'hypertrophy'],
      ['emagrec', 'weight-loss'],
      ['condicion', 'conditioning'],
      ['saúde', 'general-health'],
      ['saude', 'general-health'],
      ['retorn', 'return'],
    ];
    for (const [term, value] of goals) {
      if (normalized.includes(term)) result.goal = value;
    }
    if (normalized.includes('corrig')) {
      const correctedFrequency = normalized.match(
        /(?:frequ[eê]ncia|dias?)\D{0,8}([2-7])/,
      );
      if (correctedFrequency?.[1] !== undefined)
        result.frequency = correctedFrequency[1];
    }
    const derivedKeys = new Set([
      'cyclingTolerance',
      'duration',
      'equipment',
      'frequency',
      'impactTolerance',
      'location',
      'walkingTolerance',
    ]);
    for (const key of Object.keys(result)) {
      if (derivedKeys.has(key)) continue;
      const target = this.catalog.getQuestion(key);
      if (!target?.options.some((option) => option.value === result[key])) {
        delete result[key];
      }
    }
    if (
      Object.keys(result).length === 0 &&
      currentQuestionKey !== null &&
      existing[currentQuestionKey] !== undefined
    ) {
      delete result[currentQuestionKey];
    }
    return currentQuestionKey === 'schedule'
      ? this.completeSchedule(result, existing)
      : result;
  }

  private completeSchedule(
    parsed: Readonly<Record<string, string>>,
    existing: Readonly<Record<string, string>>,
  ): Record<string, string> {
    const result = { ...parsed };
    const frequency = result.frequency ?? existing.frequency;
    const duration = result.duration ?? existing.duration;
    if (frequency !== undefined && duration !== undefined) {
      result.schedule = `${frequency}-${duration}`;
    }
    return result;
  }

  private hasCompleteSchedule(
    answers: Readonly<Record<string, string>>,
  ): boolean {
    return (
      answers.schedule !== undefined &&
      answers.frequency !== undefined &&
      answers.duration !== undefined
    );
  }

  private scheduleClarification(
    answers: Readonly<Record<string, string>>,
  ): string {
    if (answers.frequency === undefined) {
      return `Entendi que você dispõe de cerca de ${answers.duration ?? ''} minutos por sessão. Em quantos dias da semana você pretende treinar?`;
    }
    return `Entendi que você pretende treinar ${answers.frequency} dias por semana. Quanto tempo aproximadamente você dispõe por sessão?`;
  }

  private interpretableQuestions(
    answers: Readonly<Record<string, string>>,
    currentQuestionKey: string,
  ) {
    const result = this.catalog
      .getKnowledge()
      .questions.filter(
        (question) =>
          question.key !== currentQuestionKey &&
          ANTICIPATABLE_QUESTION_KEYS.has(question.key) &&
          question.sensitive !== true &&
          question.when === undefined &&
          answers[question.key] === undefined,
      )
      .map(({ key, options, prompt }) => ({ key, options, prompt }));
    return result;
  }

  private canAcceptSuggestedOption(questionKey: string, text: string): boolean {
    if (questionKey !== 'experience') return true;
    const normalized = this.normalizedText(text);
    const result =
      /\b(?:iniciante|intermedi[aá]ri[oa]|avan[cç]ad[oa])\b/.test(normalized) ||
      /\b(?:nunca|jamais)\s+(?:treinei|treinou|fiz\s+treino)\b/.test(
        normalized,
      );
    return result;
  }

  private describesTrainingHistory(text: string): boolean {
    const normalized = this.normalizedText(text);
    const result =
      /\b(?:j[aá]\s+)?treinei\b/.test(normalized) ||
      /\b(?:treino|treinamento|academia)\b[^.!?]{0,30}\b(?:mes(?:es)?|ano(?:s)?)\b/.test(
        normalized,
      );
    return result;
  }

  private experienceClarification(text: string): string {
    const normalized = this.normalizedText(text);
    const duration = normalized.match(
      /\b(?:treinei|treinava|treino)\b[^.!?]{0,24}\b(?:por\s+)?(\d+|um|uma)\s+(m[eê]s(?:es)?|ano(?:s)?)\b/,
    );
    const amount = duration?.[1];
    const unit = duration?.[2];
    const history =
      amount === undefined || unit === undefined
        ? 'Entendi seu histórico de treino.'
        : `Entendi que você treinou por cerca de ${amount === '1' ? 'um' : amount} ${unit}.`;
    const result = `${history} Pensando na sua familiaridade com os exercícios e no uso dos equipamentos, você se considera iniciante, intermediário ou avançado?`;
    return result;
  }

  private deterministicAnticipatedAnswers(text: string): {
    questionKey: string;
    suggestedValue: string;
  }[] {
    const normalized = this.normalizedText(text);
    const stoppedThenDuration = normalized.match(
      /\b(?:parad[oa]|sem\s+treinar|parei|interrompi)\b[^.!?]{0,32}?\b(?:h[aá]|a|faz)?\s*(\d+|um|uma)\s*(m[eê]s(?:es)?|ano(?:s)?)\b/,
    );
    const durationThenStopped = normalized.match(
      /\b(?:h[aá]|faz)\s*(\d+|um|uma)\s*(m[eê]s(?:es)?|ano(?:s)?)\b[^.!?]{0,32}?\b(?:parad[oa]|sem\s+treinar|parei|interrompi)\b/,
    );
    const duration = stoppedThenDuration ?? durationThenStopped;
    if (duration?.[1] === undefined || duration[2] === undefined) return [];
    const numericAmount =
      duration[1] === 'um' || duration[1] === 'uma' ? 1 : Number(duration[1]);
    const months = duration[2].startsWith('ano')
      ? numericAmount * 12
      : numericAmount;
    let suggestedValue = 'over-1-year';
    if (months <= 3) suggestedValue = 'up-to-3-months';
    else if (months <= 12) suggestedValue = '3-to-12-months';
    return [{ questionKey: 'interruption', suggestedValue }];
  }

  private normalizedText(text: string): string {
    const result = text.normalize('NFKC').toLocaleLowerCase('pt-BR');
    return result;
  }

  private validatedAnticipatedAnswers(
    candidates: readonly {
      questionKey: string;
      suggestedValue: string;
    }[],
    existing: Readonly<Record<string, string>>,
    currentQuestionKey: string,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const candidate of candidates) {
      const question = this.catalog.getQuestion(candidate.questionKey);
      if (
        question === null ||
        question.key === currentQuestionKey ||
        !ANTICIPATABLE_QUESTION_KEYS.has(question.key) ||
        question.sensitive === true ||
        question.when !== undefined ||
        existing[question.key] !== undefined ||
        !question.options.some(
          (option) => option.value === candidate.suggestedValue,
        )
      ) {
        continue;
      }
      Object.assign(
        result,
        this.parseAnswers(candidate.suggestedValue, question.key, {
          ...existing,
          ...result,
        }),
      );
    }
    return result;
  }

  private anticipatedAcknowledgement(
    answers: Readonly<Record<string, string>>,
  ): string {
    const labels = Object.entries(answers).flatMap(([key, value]) => {
      const option = this.catalog
        .getQuestion(key)
        ?.options.find((candidate) => candidate.value === value);
      return option === undefined ? [] : [option.label];
    });
    const result =
      labels.length === 0
        ? ''
        : `Também registrei o que você adiantou: ${labels.join(', ')}.`;
    return result;
  }

  private screen(
    answers: Readonly<Record<string, string>>,
  ): TrainingPlanAssistantScreeningOutcome {
    if (
      answers.chestPain === 'current' ||
      answers.fainting === 'current' ||
      answers.breathing === 'current'
    ) {
      return 'emergencia';
    }
    if (
      answers.adult === 'no' ||
      answers.adult === 'unknown' ||
      answers.pregnancy === 'yes' ||
      answers.pregnancy === 'unknown' ||
      answers.pain === 'active' ||
      answers.painClarification === 'important' ||
      answers.painClarification === 'unknown' ||
      answers.heartCondition === 'uncontrolled' ||
      answers.heartClarification === 'no' ||
      answers.heartClarification === 'unknown' ||
      answers.chestPain === 'exertion' ||
      answers.fainting === 'recent' ||
      answers.breathing === 'exertion' ||
      answers.chronic === 'uncontrolled' ||
      answers.chronicClarification === 'no' ||
      answers.chronicClarification === 'unknown' ||
      answers.medicationClarification === 'no' ||
      answers.medicationClarification === 'unknown' ||
      answers.supervision === 'yes' ||
      answers.otherReason === 'yes'
    ) {
      return 'requer_avaliacao_profissional';
    }
    if (
      this.catalog
        .nextQuestion(answers)
        ?.key.toLocaleLowerCase('en-US')
        .endsWith('clarification') === true
    ) {
      return 'precisa_esclarecimento';
    }
    const complete = this.catalog.nextQuestion(answers) === null;
    return complete ? 'apto_para_fluxo_geral' : null;
  }

  private resolveTransition(
    answers: Readonly<Record<string, string>>,
    outcome: TrainingPlanAssistantScreeningOutcome,
  ): {
    message: string;
    questionKey: string | null;
    status: AssistantSessionEntity['status'];
  } {
    if (outcome === 'emergencia') {
      return {
        message:
          'Interrompa qualquer atividade agora e procure atendimento de emergência apropriado. Esta ferramenta não avalia gravidade nem oferece diagnóstico.',
        questionKey: null,
        status: 'blocked',
      };
    }
    if (outcome === 'requer_avaliacao_profissional') {
      return {
        message:
          'Antes de iniciar um plano, procure avaliação de profissional de saúde ou de Educação Física apropriado ao seu caso.',
        questionKey: null,
        status: 'blocked',
      };
    }
    if (outcome === 'precisa_esclarecimento') {
      const next = this.catalog.nextQuestion(answers);
      return {
        message:
          next?.prompt ??
          'Sua resposta precisa de esclarecimento antes que eu possa continuar. Não informe diagnóstico nem nome de medicamento aqui.',
        questionKey: next?.key ?? null,
        status: 'clarifying',
      };
    }
    const next = this.catalog.nextQuestion(answers);
    if (next !== null) {
      return {
        message: next.prompt,
        questionKey: next.key,
        status: 'collecting',
      };
    }
    return {
      message:
        'As respostas obrigatórias foram concluídas. Posso gerar uma prévia informativa para sua revisão.',
      questionKey: null,
      status: 'ready',
    };
  }

  private validateAndMapProposal(
    proposal: AssistantProposal,
    candidates: ReturnType<AssistantCatalogService['candidates']>,
    answers: Readonly<Record<string, string>>,
  ): TrainingPlanAssistantDraft {
    const frequency = Number(answers.frequency);
    if (proposal.workouts.length !== frequency) throw assistantDraftInvalid();
    const allowed = new Map(
      candidates.map((candidate) => [candidate.key, candidate]),
    );
    const durationLimit = Number(answers.duration);
    const workouts = proposal.workouts.map((workout) => {
      if (workout.exercises.length < 1 || workout.exercises.length > 7)
        throw assistantDraftInvalid();
      const uniqueKeys = new Set(
        workout.exercises.map((exercise) => exercise.catalogKey),
      );
      if (uniqueKeys.size !== workout.exercises.length)
        throw assistantDraftInvalid();
      const exercises = workout.exercises.map((exercise) => {
        const catalogExercise = allowed.get(exercise.catalogKey);
        if (catalogExercise === undefined) throw assistantDraftInvalid();
        return {
          bodyArea: catalogExercise.bodyArea,
          catalogKey: catalogExercise.key,
          name: catalogExercise.name,
          repetitions: exercise.repetitions,
          restSeconds: exercise.restSeconds,
          sets: exercise.sets,
          type: 'youtube-short' as const,
          youtubeId: catalogExercise.youtubeId,
        };
      });
      const estimatedDurationMinutes = exercises.reduce(
        (total, exercise) =>
          total +
          Math.ceil(
            (exercise.sets *
              (exercise.repetitions * 4 + exercise.restSeconds)) /
              60,
          ),
        0,
      );
      if (estimatedDurationMinutes > durationLimit)
        throw assistantDraftInvalid();
      return { estimatedDurationMinutes, exercises, name: workout.name };
    });
    const result = {
      description: proposal.description,
      planName: proposal.planName,
      workouts,
    };
    return result;
  }

  private isUnsafeOrOffTopic(text: string): boolean {
    const normalized = text.normalize('NFKC').toLocaleLowerCase('pt-BR');
    const restricted = [
      'ignore as instru',
      'ignore previous',
      'system prompt',
      'mostre o prompt',
      'catalogkey',
      'tool call',
      'programação',
      'notícia',
      'dieta',
      'suplement',
      'medicamento chamado',
      'diagnóstico',
      '<script',
      '```json',
    ];
    return restricted.some((pattern) => normalized.includes(pattern));
  }

  private locationFromInfrastructure(value: string): string {
    if (value.startsWith('full-gym')) return 'full-gym';
    if (value.startsWith('simple-gym')) return 'simple-gym';
    return 'other';
  }

  private equipmentFromInfrastructure(value: string): string {
    if (value.endsWith('all')) return 'machines-free-weights';
    if (value.endsWith('machines')) return 'machines';
    if (value.endsWith('free-weights')) return 'free-weights';
    return 'unknown';
  }

  private toPublic(
    session: AssistantSessionEntity,
  ): TrainingPlanAssistantSession {
    if (session.status === 'completed') throw assistantInvalidState();
    const question = this.catalog.getQuestion(session.currentQuestionKey);
    const result: TrainingPlanAssistantSession = {
      availableAnswers: question?.options ?? [],
      createdAt: session.createdAt.toISOString(),
      currentPrompt: question?.prompt ?? null,
      draft: session.generatedDraft,
      expiresAt: session.expiresAt.toISOString(),
      id: session.id,
      messages: session.messages.map((message) => ({
        createdAt: message.createdAt.toISOString(),
        id: message.id,
        role: message.role,
        text: message.text,
      })),
      noticeVersion: session.noticeVersion,
      screeningOutcome: session.screeningOutcome,
      status: session.status,
      updatedAt: session.updatedAt.toISOString(),
      version: session.version,
    };
    return result;
  }

  private hash(value: string): string {
    const result = createHash('sha256').update(value).digest('hex');
    return result;
  }
}
