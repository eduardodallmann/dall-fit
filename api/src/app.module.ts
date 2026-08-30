import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '~/auth/auth.module';
import { validateEnvironment } from '~/config/environment';
import { ObservabilityModule } from '~/observability/observability.module';
import { OperationalModule } from '~/operational/operational.module';
import { PersonModule } from '~/person/person.module';
import { RealtimeModule } from '~/realtime/realtime.module';
import { RedisModule } from '~/redis/redis.module';
import { TrainingPlanAssistantModule } from '~/training-plan-assistant/training-plan-assistant.module';
import { TrainingPlanModule } from '~/training-plan/training-plan.module';
import { TrainingModule } from '~/training/training.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ObservabilityModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        autoIndex: ['local', 'test'].includes(
          configService.getOrThrow<string>('RUNTIME_ENVIRONMENT'),
        ),
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    RedisModule,
    RealtimeModule,
    OperationalModule,
    PersonModule,
    AuthModule,
    TrainingPlanModule,
    TrainingPlanAssistantModule,
    TrainingModule,
  ],
})
export class AppModule {}
