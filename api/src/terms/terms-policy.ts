import {
  Injectable,
  Logger,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';

import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import { termsLog } from '~/terms/domain/terms-log';
import { TermsAccessService } from '~/terms/services/terms-access.service';

const POLICY = 'dall-fit:terms-policy';
export const TermsExempt = () => SetMetadata(POLICY, 'exempt');
export const TermsAdministration = () => SetMetadata(POLICY, 'administration');

@Injectable()
export class TermsPolicyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TermsPolicyInterceptor.name);
  constructor(
    private readonly reflector: Reflector,
    private readonly access: TermsAccessService,
  ) {}
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    termsLog(this.logger, 'TermsPolicyInterceptor', 'intercept', 'params');
    const request = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest>>();
    const policy = this.reflector.getAllAndOverride<string | undefined>(
      POLICY,
      [context.getHandler(), context.getClass()],
    );
    if (request.currentPerson !== undefined && policy !== 'exempt') {
      await this.access.require(
        request.currentPerson.id,
        policy === 'administration' && request.currentPerson.isAdmin === true,
      );
      termsLog(
        this.logger,
        'TermsPolicyInterceptor',
        'intercept',
        'access completed',
      );
    }
    const result = next.handle();
    termsLog(this.logger, 'TermsPolicyInterceptor', 'intercept', 'return', {
      authorized: true,
    });
    return result;
  }
}
