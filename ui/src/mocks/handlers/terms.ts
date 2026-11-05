import { http, HttpResponse } from 'msw/http';
import { delay } from 'msw/utils/delay';

import type {
  TermsAcceptance,
  TermsAccess,
  TermsDocument,
  TermsFields,
} from '@dall-fit/types';

import {
  mockTermsDocument,
  mockTermsFields,
  mockTermsPublication,
} from '~/mocks/fixtures/terms';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

const base = import.meta.env.VITE_API_URL.replace(/\/$/, '');
interface Scenario {
  documents: TermsDocument[];
  receipts: TermsAcceptance[];
  acceptAttempts: number;
}
const states = new Map<string, Scenario>();
function scenario(request: Request): { key: string; state: Scenario } {
  const key = request.headers.get('x-dall-fit-mock-terms') ?? 'accepted';
  let state = states.get(key);
  if (state === undefined) {
    let documents = [mockTermsDocument(1)];
    if (key === 'not-configured') documents = [];
    if (key === 'updated') documents.push(mockTermsDocument(2));
    state = { documents, receipts: [], acceptAttempts: 0 };
    if (
      ['accepted', 'admin', 'publication-conflict', 'unsafe-html'].includes(key)
    )
      state.receipts.push(receipt(documents[0]));
    const remembered = document.cookie
      .split('; ')
      .find((item) => item.startsWith('dall-fit-mock-terms-receipt='))
      ?.split('=')[1];
    const rememberedKey = `${encodeURIComponent(key)}:`;
    if (remembered?.startsWith(rememberedKey)) {
      const acceptedNumber = Number(remembered.slice(rememberedKey.length));
      const doc = state.documents.find(
        (item) => item.publicationNumber === acceptedNumber,
      );
      if (
        doc !== undefined &&
        !state.receipts.some((item) => item.termsVersionId === doc.id)
      )
        state.receipts.push(receipt(doc));
    }
    states.set(key, state);
  }
  return { key, state };
}
function receipt(doc: TermsDocument): TermsAcceptance {
  return {
    id: `receipt-${doc.id}`,
    termsVersionId: doc.id,
    publicationNumber: doc.publicationNumber ?? 1,
    contentHash: doc.contentHash,
    acceptedAt: '2026-08-01T13:00:00.000Z',
    channel: 'web',
    accepted: true,
    isAdult: true,
  };
}
function current(state: Scenario): TermsDocument | undefined {
  return state.documents
    .filter((doc) => doc.state === 'published')
    .sort((a, b) => (b.publicationNumber ?? 0) - (a.publicationNumber ?? 0))[0];
}
function access(state: Scenario): TermsAccess {
  const doc = current(state);
  if (doc === undefined)
    return { state: 'not-configured', current: null, acceptance: null };
  const reference = {
    id: doc.id,
    publicationNumber: doc.publicationNumber ?? 1,
    contentHash: doc.contentHash,
  };
  const accepted = state.receipts.find(
    (item) => item.termsVersionId === doc.id,
  );
  return accepted === undefined
    ? { state: 'required', current: reference, acceptance: null }
    : { state: 'accepted', current: reference, acceptance: accepted };
}
function failure(status: number, code: string) {
  return HttpResponse.json(
    createMockApiError(code, 'Terms operation failed.'),
    createMockResponseInit({ status }),
  );
}
function success(data: unknown, status = 200, version?: number) {
  return HttpResponse.json(
    { data },
    createMockResponseInit({
      status,
      headers: {
        ...(version === undefined
          ? {}
          : { 'X-Resource-Version': String(version) }),
        'Cache-Control': 'private, no-store',
      },
    }),
  );
}
export function resetTermsScenarioStates(): void {
  states.clear();
  document.cookie = 'dall-fit-mock-terms=; Max-Age=0; Path=/';
  document.cookie = 'dall-fit-mock-terms-receipt=; Max-Age=0; Path=/';
}
export const termsHandlers = [
  http.get(`${base}/terms/access`, async ({ request }) => {
    const { key, state } = scenario(request);
    if (key === 'load-error') return failure(503, 'TERMS_UNAVAILABLE');
    if (key === 'loading') await delay(800);
    return success(access(state));
  }),
  http.get(`${base}/terms/current`, ({ request }) => {
    const { state } = scenario(request);
    const doc = current(state);
    return doc === undefined
      ? failure(503, 'TERMS_NOT_CONFIGURED')
      : success({
          publication: mockTermsPublication(doc),
          access: access(state),
        });
  }),
  http.get(`${base}/terms/versions/:id`, ({ request, params }) => {
    const doc = scenario(request).state.documents.find(
      (item) => item.id === params.id && item.state === 'published',
    );
    return doc === undefined
      ? failure(404, 'TERMS_VERSION_NOT_FOUND')
      : success(mockTermsPublication(doc));
  }),
  http.get(`${base}/terms/acceptances`, ({ request }) => {
    const { state } = scenario(request);
    const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
    return HttpResponse.json(
      {
        data: state.receipts.slice((page - 1) * 20, page * 20),
        total: state.receipts.length,
        page,
        pageSize: 20,
      },
      createMockResponseInit(),
    );
  }),
  http.post(`${base}/terms/acceptances`, async ({ request }) => {
    const { key, state } = scenario(request);
    state.acceptAttempts++;
    const input = (await request.json()) as {
      termsVersionId?: string;
      contentHash?: string;
      accepted?: boolean;
      isAdult?: boolean;
    };
    if (
      input.accepted !== true ||
      input.isAdult !== true ||
      Object.keys(input).some(
        (name) =>
          !['termsVersionId', 'contentHash', 'accepted', 'isAdult'].includes(
            name,
          ),
      )
    )
      return failure(400, 'VALIDATION_ERROR');
    if (key === 'changed-during-acceptance' && state.acceptAttempts === 1)
      state.documents.push(mockTermsDocument(2));
    const doc = current(state);
    if (
      doc === undefined ||
      doc.id !== input.termsVersionId ||
      doc.contentHash !== input.contentHash
    )
      return failure(409, 'TERMS_VERSION_CHANGED');
    await delay(300);
    if (key === 'accept-error' && state.acceptAttempts === 1)
      return failure(503, 'TERMS_UNAVAILABLE');
    const previous = state.receipts.find(
      (item) => item.termsVersionId === doc.id,
    );
    const accepted = previous ?? receipt(doc);
    if (previous === undefined) state.receipts.push(accepted);
    document.cookie = `dall-fit-mock-terms-receipt=${encodeURIComponent(key)}:${accepted.publicationNumber}; Path=/; SameSite=Lax`;
    if (key === 'accept-timeout' && state.acceptAttempts === 1)
      return HttpResponse.error();
    return success(
      { acceptance: accepted, access: access(state) },
      previous === undefined ? 201 : 200,
    );
  }),
  http.get(`${base}/admin/terms`, ({ request }) => {
    const { state } = scenario(request);
    const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
    const summaries = state.documents.map(
      ({ bodyHtml: _body, contentHtml: _content, ...summary }) => summary,
    );
    return HttpResponse.json(
      {
        data: summaries.slice((page - 1) * 20, page * 20),
        total: summaries.length,
        page,
        pageSize: 20,
        initialDraft: mockTermsFields,
      },
      createMockResponseInit(),
    );
  }),
  http.get(`${base}/admin/terms/:id`, ({ request, params }) => {
    const doc = scenario(request).state.documents.find(
      (item) => item.id === params.id,
    );
    return doc === undefined
      ? failure(404, 'TERMS_VERSION_NOT_FOUND')
      : success(doc, 200, doc.version);
  }),
  http.post(`${base}/admin/terms`, async ({ request }) => {
    const { state } = scenario(request);
    const input = (await request.json()) as
      TermsFields | { sourceVersionId: string };
    const source =
      'sourceVersionId' in input
        ? state.documents.find((doc) => doc.id === input.sourceVersionId)
        : input;
    if (source === undefined) return failure(404, 'TERMS_VERSION_NOT_FOUND');
    const doc: TermsDocument = {
      ...mockTermsDocument(1),
      ...source,
      id: `64b${String(state.documents.length + 200).padStart(21, '0')}`,
      state: 'draft',
      version: 0,
      publicationNumber: undefined,
      publishedAt: undefined,
    };
    state.documents.push(doc);
    return success(doc, 201, 0);
  }),
  http.patch(`${base}/admin/terms/:id`, async ({ request, params }) => {
    const { state } = scenario(request);
    const doc = state.documents.find((item) => item.id === params.id);
    if (doc === undefined) return failure(404, 'TERMS_VERSION_NOT_FOUND');
    if (doc.state !== 'draft') return failure(409, 'TERMS_VERSION_IMMUTABLE');
    if (Number(request.headers.get('X-Resource-Version')) !== doc.version)
      return failure(412, 'TERMS_DRAFT_VERSION_CONFLICT');
    const input = (await request.json()) as TermsFields;
    if (!input.operatorEmail.includes('@') || !input.title.trim())
      return failure(400, 'VALIDATION_ERROR');
    Object.assign(doc, input);
    doc.version++;
    doc.wasSanitized = input.bodyHtml.includes('<script');
    doc.bodyHtml = doc.wasSanitized ? mockTermsFields.bodyHtml : input.bodyHtml;
    doc.contentHtml = `<h2>${doc.title}</h2><h3>1. Responsável pela aplicação e contato</h3><p>${doc.operatorName} — ${doc.operatorEmail}</p>${doc.bodyHtml}`;
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(doc.contentHtml),
    );
    doc.contentHash = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    await delay(300);
    return success(doc, 200, doc.version);
  }),
  http.post(`${base}/admin/terms/:id/preview`, ({ request, params }) => {
    const doc = scenario(request).state.documents.find(
      (item) => item.id === params.id,
    );
    return doc === undefined
      ? failure(404, 'TERMS_VERSION_NOT_FOUND')
      : success(doc, 200, doc.version);
  }),
  http.post(`${base}/admin/terms/:id/publish`, async ({ request, params }) => {
    const { key, state } = scenario(request);
    const doc = state.documents.find((item) => item.id === params.id);
    if (doc === undefined) return failure(404, 'TERMS_VERSION_NOT_FOUND');
    const input = (await request.json()) as {
      previewContentHash: string;
      expectedCurrentTermsId: string | null;
    };
    if (doc.state === 'published') return success(doc, 200, doc.version);
    if (
      key === 'publication-conflict' ||
      input.expectedCurrentTermsId !== (current(state)?.id ?? null)
    )
      return failure(409, 'TERMS_PUBLICATION_CONFLICT');
    if (input.previewContentHash !== doc.contentHash)
      return failure(409, 'TERMS_PREVIEW_CHANGED');
    doc.publicationNumber = (current(state)?.publicationNumber ?? 0) + 1;
    doc.publishedAt = '2026-08-02T12:00:00.000Z';
    doc.state = 'published';
    doc.version++;
    await delay(300);
    return success(doc, 200, doc.version);
  }),
  http.delete(`${base}/admin/terms/:id`, ({ request, params }) => {
    const { state } = scenario(request);
    const doc = state.documents.find((item) => item.id === params.id);
    if (doc === undefined) return failure(404, 'TERMS_VERSION_NOT_FOUND');
    if (doc.state !== 'draft') return failure(409, 'TERMS_VERSION_IMMUTABLE');
    state.documents = state.documents.filter((item) => item.id !== doc.id);
    return new HttpResponse(null, createMockResponseInit({ status: 204 }));
  }),
];
