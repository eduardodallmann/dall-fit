import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

import type {
  TermsDocument,
  TermsFields,
  TermsPublication,
} from '@dall-fit/types';

import { termsRejected } from '~/terms/domain/terms-errors';
import { termsLog } from '~/terms/domain/terms-log';
import type { PreparedTerms } from '~/terms/repositories/terms.repository';

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

@Injectable()
export class TermsContentService {
  private readonly logger = new Logger(TermsContentService.name);

  prepare(fields: TermsFields): PreparedTerms {
    termsLog(this.logger, 'TermsContentService', 'prepare', 'params');
    if (Buffer.byteLength(fields.bodyHtml, 'utf8') > 256 * 1024) {
      termsLog(
        this.logger,
        'TermsContentService',
        'prepare',
        'sizeRejected branch',
      );
      throw termsRejected(
        this.logger,
        'TermsContentService',
        'prepare',
        400,
        'VALIDATION_ERROR',
      );
    }
    const bodyHtml = sanitizeHtml(fields.bodyHtml.trim(), {
      allowedTags: [
        'h2',
        'h3',
        'p',
        'strong',
        'em',
        'ul',
        'ol',
        'li',
        'br',
        'blockquote',
        'a',
      ],
      allowedAttributes: { a: ['href', 'target', 'rel'] },
      allowedSchemes: ['https', 'mailto'],
      allowProtocolRelative: false,
      transformTags: {
        a: (_tag, attributes) => {
          const href = attributes.href ?? '';
          const valid =
            /^https:\/\/[^\s]+$/i.test(href) || /^mailto:[^\s]+$/i.test(href);
          const attribs: Record<string, string> = valid
            ? { href, target: '_blank', rel: 'noopener noreferrer' }
            : {};
          return { tagName: 'a', attribs };
        },
      },
    });
    const text = sanitizeHtml(bodyHtml, {
      allowedTags: [],
      allowedAttributes: {},
    })
      .replace(/&(?:nbsp|#160);/g, ' ')
      .trim();
    if (text.length === 0) {
      termsLog(
        this.logger,
        'TermsContentService',
        'prepare',
        'emptyRejected branch',
      );
      throw termsRejected(
        this.logger,
        'TermsContentService',
        'prepare',
        400,
        'VALIDATION_ERROR',
      );
    }
    const contentHtml = `<h2>${escape(fields.title)}</h2>\n<h3>1. Responsável pela aplicação e contato</h3>\n<p>O Dall Fit é disponibilizado por <strong>${escape(fields.operatorName)}</strong>. Para dúvidas sobre estes termos, problemas da aplicação, comunicação de conteúdo inadequado ou exercício de direitos relacionados ao serviço e aos seus dados, entre em contato pelo e-mail <strong>${escape(fields.operatorEmail)}</strong>.</p>\n${bodyHtml}`;
    if (Buffer.byteLength(contentHtml, 'utf8') > 256 * 1024)
      throw termsRejected(
        this.logger,
        'TermsContentService',
        'prepare',
        400,
        'VALIDATION_ERROR',
      );
    const result = {
      ...fields,
      bodyHtml,
      contentHtml,
      contentHash: createHash('sha256')
        .update(contentHtml, 'utf8')
        .digest('hex'),
      wasSanitized: bodyHtml !== fields.bodyHtml.trim(),
    };
    termsLog(this.logger, 'TermsContentService', 'prepare', 'return', {
      wasSanitized: result.wasSanitized,
      bytes: Buffer.byteLength(contentHtml),
    });
    return result;
  }

  publication(document: TermsDocument): TermsPublication {
    termsLog(this.logger, 'TermsContentService', 'publication', 'params', {
      id: document.id,
    });
    if (
      document.state !== 'published' ||
      document.publicationNumber === undefined ||
      document.publishedAt === undefined
    )
      throw termsRejected(
        this.logger,
        'TermsContentService',
        'publication',
        404,
        'TERMS_VERSION_NOT_FOUND',
      );
    const result = {
      id: document.id,
      publicationNumber: document.publicationNumber,
      title: document.title,
      operatorName: document.operatorName,
      operatorEmail: document.operatorEmail,
      changeSummary: document.changeSummary,
      contentHtml: document.contentHtml,
      contentHash: document.contentHash,
      publishedAt: document.publishedAt,
    };
    termsLog(this.logger, 'TermsContentService', 'publication', 'return', {
      number: result.publicationNumber,
    });
    return result;
  }
}
