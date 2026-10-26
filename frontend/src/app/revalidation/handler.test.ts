import { revalidateTag } from 'next/cache';
import { createRevalidateHandler } from './handler';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/entities/public-document', () => ({
  publicDocumentTag: (id: string) => `public-document:${id}`,
}));

const SECRET = 'test-revalidate-secret';
const DOCUMENT_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const call = (authorization: string | null, body: unknown, secret: string | undefined = SECRET) =>
  createRevalidateHandler(secret)(
    new Request('http://localhost/internal/revalidate', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

describe('revalidate handler', () => {
  beforeEach(() => vi.mocked(revalidateTag).mockClear());

  it('expires the cached page of the document', async () => {
    const response = await call(`Bearer ${SECRET}`, { documentId: DOCUMENT_ID });

    expect(response.status).toBe(204);
    expect(revalidateTag).toHaveBeenCalledWith(`public-document:${DOCUMENT_ID}`, { expire: 0 });
  });

  it.each([
    ['no header', null],
    ['a wrong secret', 'Bearer another-secret-value'],
    ['another scheme', `Basic ${SECRET}`],
  ])('rejects a request with %s', async (_, authorization) => {
    const response = await call(authorization, { documentId: DOCUMENT_ID });

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects every request when no secret is configured', async () => {
    const response = await call('Bearer ', { documentId: DOCUMENT_ID }, undefined);

    expect(response.status).toBe(401);
  });

  it.each([
    ['malformed JSON', '{'],
    ['a missing id', {}],
    ['an id that is not a uuid', { documentId: '../admin' }],
  ])('rejects %s', async (_, body) => {
    const response = await call(`Bearer ${SECRET}`, body);

    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
