import { Injectable, Logger } from '@nestjs/common';

import type {
  AcceptedTerms,
  AcceptTermsRequest,
  ApiResponse,
  CollectionResponse,
  CreateTermsRequest,
  CurrentTerms,
  PublishTermsRequest,
  TermsAcceptance,
  TermsAccess,
  TermsDocument,
  TermsFields,
  TermsList,
  TermsPublication,
} from '@dall-fit/types';

import { termsLog } from '~/terms/domain/terms-log';
import { TermsAccessService } from '~/terms/services/terms-access.service';
import { TermsService } from '~/terms/services/terms.service';

@Injectable()
export class TermsCommand {
  private readonly logger = new Logger(TermsCommand.name);
  constructor(
    private readonly service: TermsService,
    private readonly accessService: TermsAccessService,
  ) {}
  async access(personId: string): Promise<ApiResponse<TermsAccess>> {
    termsLog(this.logger, 'TermsCommand', 'access', 'params');
    const data = await this.accessService.access(personId);
    termsLog(this.logger, 'TermsCommand', 'access', 'service return', {
      completed: true,
    });
    const result = { data };
    termsLog(this.logger, 'TermsCommand', 'access', 'return', {
      completed: true,
    });
    return result;
  }
  async current(personId: string): Promise<ApiResponse<CurrentTerms>> {
    termsLog(this.logger, 'TermsCommand', 'current', 'params');
    const data = await this.service.current(personId);
    termsLog(this.logger, 'TermsCommand', 'current', 'service return', {
      completed: true,
    });
    const result = { data };
    termsLog(this.logger, 'TermsCommand', 'current', 'return', {
      completed: true,
    });
    return result;
  }
  async published(id: string): Promise<ApiResponse<TermsPublication>> {
    termsLog(this.logger, 'TermsCommand', 'published', 'params');
    const data = await this.service.published(id);
    termsLog(this.logger, 'TermsCommand', 'published', 'service return', {
      completed: true,
    });
    const result = { data };
    termsLog(this.logger, 'TermsCommand', 'published', 'return', {
      completed: true,
    });
    return result;
  }
  async detail(id: string): Promise<ApiResponse<TermsDocument>> {
    termsLog(this.logger, 'TermsCommand', 'detail', 'params');
    const data = await this.service.detail(id);
    termsLog(this.logger, 'TermsCommand', 'detail', 'service return', {
      completed: true,
    });
    const result = { data };
    termsLog(this.logger, 'TermsCommand', 'detail', 'return', {
      completed: true,
    });
    return result;
  }
  async create(
    personId: string,
    input: CreateTermsRequest,
  ): Promise<ApiResponse<TermsDocument>> {
    termsLog(this.logger, 'TermsCommand', 'create', 'params');
    const data = await this.service.create(personId, input);
    termsLog(this.logger, 'TermsCommand', 'create', 'service return', {
      completed: true,
    });
    const result = { data };
    termsLog(this.logger, 'TermsCommand', 'create', 'return', {
      completed: true,
    });
    return result;
  }
  async update(
    id: string,
    version: number,
    fields: TermsFields,
  ): Promise<ApiResponse<TermsDocument>> {
    termsLog(this.logger, 'TermsCommand', 'update', 'params');
    const data = await this.service.update(id, version, fields);
    termsLog(this.logger, 'TermsCommand', 'update', 'service return', {
      completed: true,
    });
    const result = { data };
    termsLog(this.logger, 'TermsCommand', 'update', 'return', {
      completed: true,
    });
    return result;
  }
  async preview(
    id: string,
    version: number,
  ): Promise<ApiResponse<TermsDocument>> {
    termsLog(this.logger, 'TermsCommand', 'preview', 'params');
    const data = await this.service.preview(id, version);
    termsLog(this.logger, 'TermsCommand', 'preview', 'service return', {
      completed: true,
    });
    const result = { data };
    termsLog(this.logger, 'TermsCommand', 'preview', 'return', {
      completed: true,
    });
    return result;
  }
  async publish(
    id: string,
    version: number,
    personId: string,
    input: PublishTermsRequest,
  ): Promise<ApiResponse<TermsDocument>> {
    termsLog(this.logger, 'TermsCommand', 'publish', 'params');
    const data = await this.service.publish(id, version, personId, input);
    termsLog(this.logger, 'TermsCommand', 'publish', 'service return', {
      completed: true,
    });
    const result = { data };
    termsLog(this.logger, 'TermsCommand', 'publish', 'return', {
      completed: true,
    });
    return result;
  }
  async list(page: number): Promise<TermsList> {
    termsLog(this.logger, 'TermsCommand', 'list', 'params');
    const result = await this.service.list(page);
    termsLog(this.logger, 'TermsCommand', 'list', 'return', {
      total: result.total,
    });
    return result;
  }
  async history(
    personId: string,
    page: number,
  ): Promise<CollectionResponse<TermsAcceptance>> {
    termsLog(this.logger, 'TermsCommand', 'history', 'params');
    const result = await this.service.history(personId, page);
    termsLog(this.logger, 'TermsCommand', 'history', 'return', {
      total: result.total,
    });
    return result;
  }
  async accept(
    personId: string,
    channel: 'web' | 'native',
    input: AcceptTermsRequest,
  ): Promise<{ status: number; response: ApiResponse<AcceptedTerms> }> {
    termsLog(this.logger, 'TermsCommand', 'accept', 'params', { channel });
    const accepted = await this.accessService.accept(personId, channel, input);
    termsLog(this.logger, 'TermsCommand', 'accept', 'service return', {
      created: accepted.created,
    });
    const result = {
      status: accepted.created ? 201 : 200,
      response: { data: accepted.result },
    };
    termsLog(this.logger, 'TermsCommand', 'accept', 'return', {
      status: result.status,
    });
    return result;
  }
  async remove(id: string, version: number): Promise<void> {
    termsLog(this.logger, 'TermsCommand', 'remove', 'params', { id, version });
    await this.service.remove(id, version);
    termsLog(this.logger, 'TermsCommand', 'remove', 'completed');
  }
}
