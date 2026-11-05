import { Module } from '@nestjs/common';

import { AuthModule } from '~/auth/auth.module';
import { TermsCommand } from '~/terms/commands/terms.command';
import { AdminTermsController } from '~/terms/controllers/admin-terms.controller';
import { TermsController } from '~/terms/controllers/terms.controller';
import { TermsService } from '~/terms/services/terms.service';
import { TermsDataModule } from '~/terms/terms-data.module';

@Module({
  imports: [AuthModule, TermsDataModule],
  controllers: [TermsController, AdminTermsController],
  providers: [TermsCommand, TermsService],
})
export class TermsModule {}
