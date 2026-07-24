import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '~/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigin = configService.getOrThrow<string>('CORS_ORIGIN');
  const port = configService.getOrThrow<number>('PORT');

  app.enableCors({ origin: corsOrigin });

  await app.listen(port);
}

void bootstrap().catch((error: unknown) => {
  console.error('Failed to start the API.', error);
  process.exitCode = 1;
});
