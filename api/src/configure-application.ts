import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';

export function configureApplication(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const trustProxyHops = configService.getOrThrow<number>('TRUST_PROXY_HOPS');
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', trustProxyHops);
  app.use(helmet());
  app.use(cookieParser());
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
