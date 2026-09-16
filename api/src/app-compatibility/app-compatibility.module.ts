import { Module } from '@nestjs/common';

import { GetAndroidAppCompatibilityCommand } from '~/app-compatibility/commands/get-android-app-compatibility.command';
import { AppCompatibilityController } from '~/app-compatibility/controllers/app-compatibility.controller';
import { AndroidAppCompatibilityRateLimitGuard } from '~/app-compatibility/guards/android-app-compatibility-rate-limit.guard';
import { AndroidAppCompatibilityService } from '~/app-compatibility/services/android-app-compatibility.service';

@Module({
  controllers: [AppCompatibilityController],
  providers: [
    AndroidAppCompatibilityRateLimitGuard,
    AndroidAppCompatibilityService,
    GetAndroidAppCompatibilityCommand,
  ],
  exports: [AndroidAppCompatibilityService],
})
export class AppCompatibilityModule {}
