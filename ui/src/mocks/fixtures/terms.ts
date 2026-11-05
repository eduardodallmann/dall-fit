import type {
  TermsDocument,
  TermsFields,
  TermsPublication,
} from '@dall-fit/types';

export const mockTermsFields: TermsFields = {
  title: 'Termos de Uso — Dall Fit',
  operatorName: 'Responsável Exemplo',
  operatorEmail: 'responsavel@example.test',
  changeSummary: 'Condições de uso e cuidados com exercícios.',
  bodyHtml:
    '<h3>2. Cuidados com exercícios</h3><p>Respeite seus limites e procure orientação profissional. O aplicativo não substitui avaliação médica.</p><p><strong>Interrompa atividades diante de sintomas preocupantes.</strong> Seu aceite preserva seus direitos legais.</p>',
};
export function mockTermsDocument(number = 1): TermsDocument {
  return {
    ...mockTermsFields,
    id: `64b000000000000000000${String(100 + number).padStart(3, '0')}`,
    state: 'published',
    version: 1,
    publicationNumber: number,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    publishedAt: '2026-08-01T12:00:00.000Z',
    contentHash: String(number).repeat(64),
    contentHtml: `<h2>${mockTermsFields.title}</h2><h3>1. Responsável pela aplicação e contato</h3><p>${mockTermsFields.operatorName} — ${mockTermsFields.operatorEmail}</p>${mockTermsFields.bodyHtml}`,
    wasSanitized: false,
  };
}
export function mockTermsPublication(doc: TermsDocument): TermsPublication {
  return {
    id: doc.id,
    title: doc.title,
    publicationNumber: doc.publicationNumber ?? 1,
    publishedAt: doc.publishedAt ?? doc.updatedAt,
    contentHtml: doc.contentHtml,
    contentHash: doc.contentHash,
    changeSummary: doc.changeSummary,
    operatorName: doc.operatorName,
    operatorEmail: doc.operatorEmail,
  };
}
