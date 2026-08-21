import { createHash, createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRelatedProject } from '@vercel/related-projects';

import {
  TrainingPlanCloneStarter,
  TrainingPlanCloneStartError,
  type StartTrainingPlanCloneInput,
} from '~/training-plan/adapters/training-plan-clone-starter';

const START_PATHNAME = '/internal/training-plan-clone-runs';
const BRIDGE_VERSION = '1';

@Injectable()
export class HttpTrainingPlanCloneStarter extends TrainingPlanCloneStarter {
  private readonly logger = new Logger(HttpTrainingPlanCloneStarter.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async start(input: StartTrainingPlanCloneInput): Promise<void> {
    this.logger.log('HttpTrainingPlanCloneStarter -> start -> params:', {
      params: { cloneJobId: input.cloneJobId, generation: input.generation },
    });
    const body = JSON.stringify({
      cloneJobId: input.cloneJobId,
      generation: input.generation,
    });
    const timestamp = Date.now().toString();
    const bodyHash = createHash('sha256').update(body).digest('hex');
    const canonical = ['POST', START_PATHNAME, timestamp, bodyHash].join('\n');
    const signature = createHmac(
      'sha256',
      this.configService.getOrThrow<string>('WORKFLOW_HMAC_SECRET'),
    )
      .update(canonical)
      .digest('hex');
    const baseUrl = withRelatedProject({
      defaultHost: this.configService.getOrThrow<string>('WORKFLOW_BASE_URL'),
      projectName: this.configService.getOrThrow<string>(
        'WORKFLOW_PROJECT_NAME',
      ),
    });
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-dall-fit-workflow-signature': `sha256=${signature}`,
      'x-dall-fit-workflow-timestamp': timestamp,
      'x-dall-fit-workflow-version': BRIDGE_VERSION,
    };
    const bypass = this.configService.get<string>(
      'WORKFLOW_PROTECTION_BYPASS_SECRET',
    );
    if (bypass !== undefined) headers['x-vercel-protection-bypass'] = bypass;
    let response: Response;
    try {
      response = await fetch(new URL(START_PATHNAME, baseUrl), {
        body,
        headers,
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(
          this.configService.getOrThrow<number>('WORKFLOW_START_TIMEOUT_MS'),
        ),
      });
    } catch (error: unknown) {
      this.logger.warn('HttpTrainingPlanCloneStarter -> start -> failed:', {
        data: {
          cloneJobId: input.cloneJobId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          generation: input.generation,
        },
      });
      throw new TrainingPlanCloneStartError(true);
    }
    this.logger.log(
      'HttpTrainingPlanCloneStarter -> start -> workflow return:',
      {
        data: {
          cloneJobId: input.cloneJobId,
          generation: input.generation,
          status: response.status,
        },
      },
    );
    if (response.status !== 202) {
      this.logger.warn(
        'HttpTrainingPlanCloneStarter -> start -> rejected response branch:',
        { data: { cloneJobId: input.cloneJobId, status: response.status } },
      );
      throw new TrainingPlanCloneStartError(false);
    }
    this.logger.log('HttpTrainingPlanCloneStarter -> start -> completed:', {
      data: { cloneJobId: input.cloneJobId, generation: input.generation },
    });
  }
}
