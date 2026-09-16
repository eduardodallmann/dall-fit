import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';

import { RequestContextLogger } from '~/observability/request-context.logger';
import { RequestContextMiddleware } from '~/observability/request-context.middleware';

export function configureApplication(app: INestApplication): void {
  const expressApplication = app as NestExpressApplication;
  expressApplication.useBodyParser('json', { limit: 1024 * 1024 });
  const configService = app.get(ConfigService);
  const corsOrigin = configService.getOrThrow<string>('CORS_ORIGIN');
  const trustProxyHops = configService.getOrThrow<number>('TRUST_PROXY_HOPS');
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', trustProxyHops);
  const requestContextMiddleware = app.get(RequestContextMiddleware);
  app.use(requestContextMiddleware.use.bind(requestContextMiddleware));
  app.useLogger(app.get(RequestContextLogger));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Resource-Version',
      'X-CSRF-Token',
      'X-Client-Instance-Id',
      'X-App-Version-Code',
      'X-Request-Id',
      'X-Sync-Contract-Version',
    ],
    credentials: true,
    exposedHeaders: ['X-Resource-Version', 'X-Request-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: corsOrigin,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: () =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: {},
          message: 'Request validation failed.',
        }),
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
