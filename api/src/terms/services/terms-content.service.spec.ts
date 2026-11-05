import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { TermsContentService } from './terms-content.service';

const fields = {
  title: 'Termos <exemplo>',
  operatorName: 'Responsável <exemplo>',
  operatorEmail: 'legal@example.test',
  changeSummary: 'Cuidados de uso',
  bodyHtml: '<h3>Cuidados</h3><p><strong>Respeite limites.</strong></p>',
};
describe('TermsContentService', () => {
  const service = new TermsContentService();
  it('seals the exact safe content and escapes versioned identity', () => {
    const result = service.prepare(fields);
    expect(result.contentHtml).toContain('Responsável &lt;exemplo&gt;');
    expect(result.contentHash).toBe(
      createHash('sha256').update(result.contentHtml).digest('hex'),
    );
    expect(
      service.prepare({ ...fields, operatorEmail: 'other@example.test' })
        .contentHash,
    ).not.toBe(result.contentHash);
  });
  it('removes executable content, event handlers, styling, media and unsafe links', () => {
    const result = service.prepare({
      ...fields,
      bodyHtml:
        '<script>alert(1)</script><p class="x" style="color:red" onclick="alert(1)">Seguro<img src=x onerror=alert(1)></p><a href="javascript:alert(1)">link</a><a href="//evil.test">relativo</a><iframe src="https://evil.test"></iframe><a href="https://example.test">externo</a>',
    });
    expect(result.contentHtml).not.toMatch(
      /<script|onclick|onerror|<img|style=|<iframe|href="javascript|href="\/\//,
    );
    expect(result.contentHtml).toContain('rel="noopener noreferrer"');
    expect(result.wasSanitized).toBe(true);
  });
  it.each(['<script>alert(1)</script>', '<br>', ' '])(
    'rejects an empty readable body: %s',
    (bodyHtml) => {
      expect(() => service.prepare({ ...fields, bodyHtml })).toThrow();
    },
  );
  it('limits UTF-8 bytes, including the complete identity section', () => {
    expect(() =>
      service.prepare({ ...fields, bodyHtml: 'á'.repeat(140_000) }),
    ).toThrow();
    expect(() =>
      service.prepare({ ...fields, bodyHtml: 'a'.repeat(256 * 1024) }),
    ).toThrow();
  });
});
