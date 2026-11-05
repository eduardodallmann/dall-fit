import { Injectable, Logger } from '@nestjs/common';

import type {
  CollectionResponse,
  CreateTermsRequest,
  CurrentTerms,
  PublishTermsRequest,
  TermsAcceptance,
  TermsDocument,
  TermsFields,
  TermsList,
  TermsPublication,
} from '@dall-fit/types';

import { RealtimePublisherService } from '~/realtime/realtime-publisher.service';
import initialTerms from '~/terms/domain/initial-terms.json';
import { termsRejected } from '~/terms/domain/terms-errors';
import { termsLog } from '~/terms/domain/terms-log';
import { TermsRepository } from '~/terms/repositories/terms.repository';
import { TermsAccessService } from '~/terms/services/terms-access.service';
import { TermsContentService } from '~/terms/services/terms-content.service';

@Injectable()
export class TermsService {
  private readonly logger = new Logger(TermsService.name);
  constructor(
    private readonly repository: TermsRepository,
    private readonly content: TermsContentService,
    private readonly accessService: TermsAccessService,
    private readonly realtime: RealtimePublisherService,
  ) {}

  async current(personId: string): Promise<CurrentTerms> {
    termsLog(this.logger, 'TermsService', 'current', 'params');
    const access = await this.accessService.access(personId);
    termsLog(this.logger, 'TermsService', 'current', 'access return', {
      state: access.state,
    });
    if (access.current === null)
      throw termsRejected(
        this.logger,
        'TermsService',
        'current',
        503,
        'TERMS_NOT_CONFIGURED',
      );
    const publication = await this.published(access.current.id);
    const result = { publication, access };
    termsLog(this.logger, 'TermsService', 'current', 'return', {
      number: publication.publicationNumber,
    });
    return result;
  }
  async published(id: string): Promise<TermsPublication> {
    termsLog(this.logger, 'TermsService', 'published', 'params', { id });
    const doc = await this.detail(id);
    const result = this.content.publication(doc);
    termsLog(this.logger, 'TermsService', 'published', 'return', {
      number: result.publicationNumber,
    });
    return result;
  }
  async detail(id: string): Promise<TermsDocument> {
    termsLog(this.logger, 'TermsService', 'detail', 'params', { id });
    const result = await this.repository.find(id);
    termsLog(this.logger, 'TermsService', 'detail', 'repository return', {
      found: result !== null,
    });
    if (result === null)
      throw termsRejected(
        this.logger,
        'TermsService',
        'detail',
        404,
        'TERMS_VERSION_NOT_FOUND',
      );
    termsLog(this.logger, 'TermsService', 'detail', 'return', {
      state: result.state,
    });
    return result;
  }
  async list(page: number): Promise<TermsList> {
    termsLog(this.logger, 'TermsService', 'list', 'params', { page });
    const collection = await this.repository.list(page);
    const result = { ...collection, initialDraft: this.initial() };
    termsLog(this.logger, 'TermsService', 'list', 'return', {
      total: result.total,
    });
    return result;
  }
  async history(
    personId: string,
    page: number,
  ): Promise<CollectionResponse<TermsAcceptance>> {
    termsLog(this.logger, 'TermsService', 'history', 'params', { page });
    const result = await this.repository.receipts(personId, page);
    termsLog(this.logger, 'TermsService', 'history', 'return', {
      total: result.total,
    });
    return result;
  }
  async create(
    personId: string,
    input: CreateTermsRequest,
  ): Promise<TermsDocument> {
    termsLog(this.logger, 'TermsService', 'create', 'params');
    let fields: TermsFields = input as TermsFields;
    if ('sourceVersionId' in input) {
      const source = await this.detail(input.sourceVersionId);
      if (source.state !== 'published') {
        termsLog(
          this.logger,
          'TermsService',
          'create',
          'sourceNotPublished branch',
        );
        throw termsRejected(
          this.logger,
          'TermsService',
          'create',
          404,
          'TERMS_VERSION_NOT_FOUND',
        );
      }
      fields = source;
    }
    const prepared = this.content.prepare({
      title: fields.title,
      bodyHtml: fields.bodyHtml,
      operatorName: fields.operatorName,
      operatorEmail: fields.operatorEmail,
      changeSummary: fields.changeSummary,
    });
    termsLog(this.logger, 'TermsService', 'create', 'content return', {
      sanitized: prepared.wasSanitized,
    });
    const result = await this.repository.create(prepared, personId);
    termsLog(this.logger, 'TermsService', 'create', 'return', {
      id: result.id,
    });
    return result;
  }
  async update(
    id: string,
    version: number,
    fields: TermsFields,
  ): Promise<TermsDocument> {
    termsLog(this.logger, 'TermsService', 'update', 'params', { id, version });
    const doc = await this.draft(id, version);
    const prepared = this.content.prepare(fields);
    const result = await this.repository.update(doc.id, doc.version, prepared);
    termsLog(this.logger, 'TermsService', 'update', 'repository return', {
      changed: result !== null,
    });
    if (result === null)
      throw termsRejected(
        this.logger,
        'TermsService',
        'update',
        412,
        'TERMS_DRAFT_VERSION_CONFLICT',
      );
    termsLog(this.logger, 'TermsService', 'update', 'return', {
      version: result.version,
    });
    return result;
  }
  async preview(id: string, version: number): Promise<TermsDocument> {
    termsLog(this.logger, 'TermsService', 'preview', 'params', { id, version });
    const result = await this.draft(id, version);
    termsLog(this.logger, 'TermsService', 'preview', 'return', {
      version: result.version,
    });
    return result;
  }
  async publish(
    id: string,
    version: number,
    personId: string,
    request: PublishTermsRequest,
  ): Promise<TermsDocument> {
    termsLog(this.logger, 'TermsService', 'publish', 'params', { id, version });
    const doc = await this.detail(id);
    if (doc.state === 'published') {
      termsLog(this.logger, 'TermsService', 'publish', 'replay return', {
        number: doc.publicationNumber,
      });
      return doc;
    }
    if (doc.version !== version)
      throw termsRejected(
        this.logger,
        'TermsService',
        'publish',
        412,
        'TERMS_DRAFT_VERSION_CONFLICT',
      );
    const prepared = this.content.prepare(doc);
    if (prepared.contentHash !== request.previewContentHash)
      throw termsRejected(
        this.logger,
        'TermsService',
        'publish',
        409,
        'TERMS_PREVIEW_CHANGED',
      );
    const current = await this.repository.currentReference();
    termsLog(this.logger, 'TermsService', 'publish', 'current return', {
      number: current?.publicationNumber,
    });
    if ((current?.id ?? null) !== request.expectedCurrentTermsId)
      throw termsRejected(
        this.logger,
        'TermsService',
        'publish',
        409,
        'TERMS_PUBLICATION_CONFLICT',
      );
    let result: TermsDocument | null;
    try {
      result = await this.repository.publish(
        id,
        version,
        (current?.publicationNumber ?? 0) + 1,
        personId,
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        termsLog(this.logger, 'TermsService', 'publish', 'collision branch');
        throw termsRejected(
          this.logger,
          'TermsService',
          'publish',
          409,
          'TERMS_PUBLICATION_CONFLICT',
        );
      }
      throw error;
    }
    termsLog(this.logger, 'TermsService', 'publish', 'repository return', {
      published: result !== null,
    });
    if (result === null)
      throw termsRejected(
        this.logger,
        'TermsService',
        'publish',
        412,
        'TERMS_DRAFT_VERSION_CONFLICT',
      );
    await this.realtime.publish({
      resource: 'terms',
      resourceId: result.id,
      state: 'present',
      version: result.publicationNumber ?? 0,
    });
    termsLog(this.logger, 'TermsService', 'publish', 'return', {
      number: result.publicationNumber,
    });
    return result;
  }
  async remove(id: string, version: number): Promise<void> {
    termsLog(this.logger, 'TermsService', 'remove', 'params', { id, version });
    await this.draft(id, version);
    const removed = await this.repository.remove(id, version);
    termsLog(this.logger, 'TermsService', 'remove', 'repository return', {
      removed,
    });
    if (!removed)
      throw termsRejected(
        this.logger,
        'TermsService',
        'remove',
        412,
        'TERMS_DRAFT_VERSION_CONFLICT',
      );
    termsLog(this.logger, 'TermsService', 'remove', 'completed');
  }
  private async draft(id: string, version: number): Promise<TermsDocument> {
    termsLog(this.logger, 'TermsService', 'draft', 'params', { id, version });
    const result = await this.detail(id);
    if (result.state !== 'draft')
      throw termsRejected(
        this.logger,
        'TermsService',
        'draft',
        409,
        'TERMS_VERSION_IMMUTABLE',
      );
    if (result.version !== version)
      throw termsRejected(
        this.logger,
        'TermsService',
        'draft',
        412,
        'TERMS_DRAFT_VERSION_CONFLICT',
      );
    termsLog(this.logger, 'TermsService', 'draft', 'return', { version });
    return result;
  }
  initial(): TermsFields {
    termsLog(this.logger, 'TermsService', 'initial', 'params');
    const result: TermsFields = { ...initialTerms };
    termsLog(this.logger, 'TermsService', 'initial', 'return', {
      available: true,
    });
    return result;
  }
}
