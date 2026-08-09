import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '~/auth/auth.module';
import { validateEnvironment } from '~/config/environment';
import { ObservabilityModule } from '~/observability/observability.module';
import { OperationalModule } from '~/operational/operational.module';
import { PersonModule } from '~/person/person.module';
import { RedisModule } from '~/redis/redis.module';
import { TrainingPlanModule } from '~/training-plan/training-plan.module';

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
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    RedisModule,
    OperationalModule,
    PersonModule,
    AuthModule,
    TrainingPlanModule,
  ],
})
export class AppModule {}
