import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';
import type { AssistantProposal } from '~/training-plan-assistant/domain/training-plan-assistant.types';
import {
  assistantDisabled,
  assistantProviderUnavailable,
} from '~/training-plan-assistant/errors/training-plan-assistant.errors';
import { FakeTrainingPlanAssistantProvider } from '~/training-plan-assistant/providers/fake-training-plan-assistant.provider';
import { GroqTrainingPlanAssistantProvider } from '~/training-plan-assistant/providers/groq-training-plan-assistant.provider';
import type {
  AssistantAnswerInterpretation,
  AssistantQuestionReformulation,
  InterpretAssistantAnswerInput,
  ProposeTrainingPlanInput,
  ReformulateAssistantQuestionInput,
  TrainingPlanAssistantProvider,
} from '~/training-plan-assistant/providers/training-plan-assistant.provider';

const CIRCUIT_TTL_SECONDS = 60;
const FAILURE_LIMIT = 3;

@Injectable()
export class AssistantProviderService {
  private readonly logger = new Logger(AssistantProviderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly fakeProvider: FakeTrainingPlanAssistantProvider,
    private readonly groqProvider: GroqTrainingPlanAssistantProvider,
    private readonly redis: RedisClientService,
    private readonly redisKeys: RedisKeyService,
  ) {}

  assertEnabled(): void {
    this.logger.log('AssistantProviderService -> assertEnabled -> params:', {
      params: {},
    });
    if (!this.config.getOrThrow<boolean>('TRAINING_PLAN_ASSISTANT_ENABLED')) {
      this.logger.warn(
        'AssistantProviderService -> assertEnabled -> disabled branch:',
        { data: {} },
      );
      throw assistantDisabled();
    }
    this.logger.log('AssistantProviderService -> assertEnabled -> completed:', {
      data: {},
    });
  }

  providerName(): string {
    const result = this.config.getOrThrow<string>(
      'TRAINING_PLAN_ASSISTANT_PROVIDER',
    );
    return result;
  }

  modelName(): string {
    const result = this.config.getOrThrow<string>(
      'TRAINING_PLAN_ASSISTANT_MODEL',
    );
    return result;
  }

  async interpret(
    input: InterpretAssistantAnswerInput,
  ): Promise<AssistantAnswerInterpretation> {
    const result = await this.execute('interpret', (provider) =>
      provider.interpret(input),
    );
    return result;
  }

  async reformulate(
    input: ReformulateAssistantQuestionInput,
  ): Promise<AssistantQuestionReformulation> {
    const result = await this.execute('reformulate', (provider) =>
      provider.reformulate(input),
    );
    return result;
  }

  async propose(input: ProposeTrainingPlanInput): Promise<AssistantProposal> {
    const result = await this.execute('propose', (provider) =>
      provider.propose(input),
    );
    return result;
  }

  private async execute<T>(
    operation: 'interpret' | 'propose' | 'reformulate',
    invoke: (provider: TrainingPlanAssistantProvider) => Promise<T>,
  ): Promise<T> {
    this.logger.log('AssistantProviderService -> execute -> params:', {
      params: { operation },
    });
    this.assertEnabled();
    const circuitKey = this.redisKeys.create(
      'assistant-provider-circuit',
      `${this.providerName()}:${this.modelName()}`,
    );
    const isOpen = await this.redis.execute((client) =>
      client.exists(`${circuitKey}:open`),
    );
    if (isOpen === 1) {
      this.logger.warn(
        'AssistantProviderService -> execute -> circuitOpen branch:',
        { data: { operation } },
      );
      throw assistantProviderUnavailable();
    }
    try {
      const result = await invoke(this.selectedProvider());
      await this.redis.execute(async (client) => {
        await client.del(`${circuitKey}:failures`, `${circuitKey}:open`);
      });
      this.logger.log('AssistantProviderService -> execute -> return:', {
        data: { operation },
      });
      return result;
    } catch (error: unknown) {
      await this.redis.execute(async (client) => {
        const failureKey = `${circuitKey}:failures`;
        const failures = await client.incr(failureKey);
        if (failures === 1)
          await client.expire(failureKey, CIRCUIT_TTL_SECONDS);
        if (failures >= FAILURE_LIMIT) {
          await client.set(
            `${circuitKey}:open`,
            '1',
            'EX',
            CIRCUIT_TTL_SECONDS,
          );
        }
      });
      throw error;
    }
  }

  private selectedProvider(): TrainingPlanAssistantProvider {
    const result =
      this.providerName() === 'groq' ? this.groqProvider : this.fakeProvider;
    return result;
  }
}
