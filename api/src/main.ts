import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '~/app.module';
import { configureApplication } from '~/configure-application';

const bootstrapLogger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigin = configService.getOrThrow<string>('CORS_ORIGIN');
  const port = configService.getOrThrow<number>('PORT');

  configureApplication(app);
  app.enableCors({ credentials: true, origin: corsOrigin });

  await app.listen(port);
}

void bootstrap().catch((error: unknown) => {
  bootstrapLogger.error('Bootstrap -> bootstrap -> failed:', {
    data: {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    },
  });
  process.exitCode = 1;
});
