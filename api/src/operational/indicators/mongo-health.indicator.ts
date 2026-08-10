import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import type { Connection } from 'mongoose';

const MONGODB_HEALTH_TIMEOUT_MS = 1_000;

@Injectable()
export class MongoHealthIndicator {
  private readonly logger = new Logger(MongoHealthIndicator.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async check(): Promise<HealthIndicatorResult<'mongodb'>> {
    this.logger.log('MongoHealthIndicator -> check -> params:', {
      params: { timeoutMs: MONGODB_HEALTH_TIMEOUT_MS },
    });
    const indicator = this.healthIndicatorService.check('mongodb');
    const database = this.connection.db;

    if (database === undefined) {
      this.logger.warn(
        'MongoHealthIndicator -> check -> disconnected branch:',
        { data: { ready: false } },
      );
      const result = indicator.down();
      this.logger.log('MongoHealthIndicator -> check -> return:', {
        data: result,
      });

      return result;
    }

    let timeout: NodeJS.Timeout | undefined;

    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('MongoHealthTimeoutError'));
        }, MONGODB_HEALTH_TIMEOUT_MS);
        timeout.unref();
      });
      const pingResult = await Promise.race([
        database.command({ ping: 1 }),
        timeoutPromise,
      ]);
      const ready = pingResult.ok === 1;
      this.logger.log('MongoHealthIndicator -> check -> ping return:', {
        data: { ready },
      });

      if (!ready) {
        this.logger.warn(
          'MongoHealthIndicator -> check -> unavailable branch:',
          { data: { ready: false } },
        );
        const result = indicator.down();
        this.logger.log('MongoHealthIndicator -> check -> return:', {
          data: result,
        });

        return result;
      }

      const result = indicator.up();
      this.logger.log('MongoHealthIndicator -> check -> return:', {
        data: result,
      });

      return result;
    } catch (error: unknown) {
      this.logger.warn('MongoHealthIndicator -> check -> unavailable branch:', {
        data: {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          ready: false,
        },
      });
      const result = indicator.down();
      this.logger.log('MongoHealthIndicator -> check -> return:', {
        data: result,
      });

      return result;
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
