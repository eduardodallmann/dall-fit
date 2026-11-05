import { HttpException, Injectable, Logger } from '@nestjs/common';

import type {
  AcceptedTerms,
  AcceptTermsRequest,
  TermsAccess,
  TermsReference,
} from '@dall-fit/types';

import { termsRejected } from '~/terms/domain/terms-errors';
import { termsLog } from '~/terms/domain/terms-log';
import { TermsRepository } from '~/terms/repositories/terms.repository';

@Injectable()
export class TermsAccessService {
  private readonly logger = new Logger(TermsAccessService.name);
  constructor(private readonly repository: TermsRepository) {}

  async access(personId: string): Promise<TermsAccess> {
    termsLog(this.logger, 'TermsAccessService', 'access', 'params');
    try {
      const current = await this.repository.currentReference();
      termsLog(
        this.logger,
        'TermsAccessService',
        'access',
        'repository return',
        { number: current?.publicationNumber },
      );
      let result: TermsAccess = {
        state: 'not-configured',
        current: null,
        acceptance: null,
      };
      if (current !== null) {
        const acceptance = await this.repository.receipt(personId, current.id);
        termsLog(
          this.logger,
          'TermsAccessService',
          'access',
          'receipt return',
          { found: acceptance !== null },
        );
        result =
          acceptance !== null &&
          acceptance.contentHash === current.contentHash &&
          acceptance.isAdult === true &&
          acceptance.accepted === true
            ? { state: 'accepted', current, acceptance }
            : { state: 'required', current, acceptance: null };
      }
      termsLog(this.logger, 'TermsAccessService', 'access', 'return', {
        state: result.state,
      });
      return result;
    } catch (error: unknown) {
      termsLog(
        this.logger,
        'TermsAccessService',
        'access',
        'unavailable branch',
      );
      if (error instanceof HttpException) throw error;
      throw termsRejected(
        this.logger,
        'TermsAccessService',
        'access',
        503,
        'TERMS_UNAVAILABLE',
      );
    }
  }

  async require(personId: string, bootstrap = false): Promise<void> {
    termsLog(this.logger, 'TermsAccessService', 'require', 'params', {
      bootstrap,
    });
    const access = await this.access(personId);
    termsLog(this.logger, 'TermsAccessService', 'require', 'access return', {
      state: access.state,
    });
    if (access.state === 'required') {
      termsLog(this.logger, 'TermsAccessService', 'require', 'required branch');
      throw termsRejected(
        this.logger,
        'TermsAccessService',
        'require',
        403,
        'TERMS_ACCEPTANCE_REQUIRED',
        { ...access.current },
      );
    }
    if (access.state === 'not-configured' && !bootstrap) {
      termsLog(
        this.logger,
        'TermsAccessService',
        'require',
        'notConfigured branch',
      );
      throw termsRejected(
        this.logger,
        'TermsAccessService',
        'require',
        503,
        'TERMS_NOT_CONFIGURED',
      );
    }
    termsLog(this.logger, 'TermsAccessService', 'require', 'completed');
  }

  async accept(
    personId: string,
    channel: 'web' | 'native',
    request: AcceptTermsRequest,
  ): Promise<{ result: AcceptedTerms; created: boolean }> {
    termsLog(this.logger, 'TermsAccessService', 'accept', 'params', {
      termsVersionId: request.termsVersionId,
      channel,
    });
    const document = await this.repository.find(request.termsVersionId);
    termsLog(this.logger, 'TermsAccessService', 'accept', 'document return', {
      found: document !== null,
    });
    if (
      document?.state !== 'published' ||
      document.publicationNumber === undefined
    )
      throw termsRejected(
        this.logger,
        'TermsAccessService',
        'accept',
        404,
        'TERMS_VERSION_NOT_FOUND',
      );
    const current: TermsReference | null =
      await this.repository.currentReference();
    termsLog(this.logger, 'TermsAccessService', 'accept', 'current return', {
      number: current?.publicationNumber,
    });
    if (
      current?.id !== document.id ||
      document.contentHash !== request.contentHash
    )
      throw termsRejected(
        this.logger,
        'TermsAccessService',
        'accept',
        409,
        'TERMS_VERSION_CHANGED',
      );
    const recorded = await this.repository.record(personId, {
      termsVersionId: document.id,
      publicationNumber: document.publicationNumber,
      contentHash: document.contentHash,
      acceptedAt: new Date().toISOString(),
      channel,
      accepted: true,
      isAdult: true,
    });
    termsLog(this.logger, 'TermsAccessService', 'accept', 'record return', {
      created: recorded.created,
    });
    const access = await this.access(personId);
    const result = {
      result: { acceptance: recorded.acceptance, access },
      created: recorded.created,
    };
    termsLog(this.logger, 'TermsAccessService', 'accept', 'return', {
      state: access.state,
      created: result.created,
    });
    return result;
  }
}
