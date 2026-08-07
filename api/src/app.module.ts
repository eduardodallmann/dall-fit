import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from '~/app.controller';
import { AuthModule } from '~/auth/auth.module';
import { GetRootCommand } from '~/commands/get-root.command';
import { validateEnvironment } from '~/config/environment';
import { PersonModule } from '~/person/person.module';
import { TrainingPlanModule } from '~/training-plan/training-plan.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    PersonModule,
    AuthModule,
    TrainingPlanModule,
  ],
  controllers: [AppController],
  providers: [GetRootCommand],
})
export class AppModule {}
