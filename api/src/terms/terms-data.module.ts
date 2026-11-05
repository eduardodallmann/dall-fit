import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { MongoTermsRepository } from '~/terms/repositories/mongo-terms.repository';
import { TermsRepository } from '~/terms/repositories/terms.repository';
import {
  TERMS_ACCEPTANCE_MODEL,
  TERMS_MODEL,
  TermsAcceptanceSchema,
  TermsSchema,
} from '~/terms/repositories/terms.schema';
import { TermsAccessService } from '~/terms/services/terms-access.service';
import { TermsContentService } from '~/terms/services/terms-content.service';
import { TermsPolicyInterceptor } from '~/terms/terms-policy';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TERMS_MODEL, schema: TermsSchema },
      { name: TERMS_ACCEPTANCE_MODEL, schema: TermsAcceptanceSchema },
    ]),
  ],
  providers: [
    MongoTermsRepository,
    { provide: TermsRepository, useExisting: MongoTermsRepository },
    TermsAccessService,
    TermsContentService,
    { provide: APP_INTERCEPTOR, useClass: TermsPolicyInterceptor },
  ],
  exports: [TermsAccessService, TermsContentService, TermsRepository],
})
export class TermsDataModule {}
