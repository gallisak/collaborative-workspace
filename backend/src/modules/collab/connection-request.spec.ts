import { documentIdFromUrl, isAllowedOrigin } from './connection-request.js';

describe('documentIdFromUrl', () => {
  const id = '01a1678d-55e9-771c-bb6e-d12fe04037a0';

  it.each([`/documents/${id}`, `/documents/${id}/`, `/documents/${id.toUpperCase()}?x=1`])(
    'reads the document id from %s',
    (url) => {
      expect(documentIdFromUrl(url)).toBe(id);
    },
  );

  it.each([undefined, '/', '/documents/', '/documents/not-a-uuid', `/other/${id}`])(
    'rejects %s',
    (url) => {
      expect(documentIdFromUrl(url)).toBeNull();
    },
  );
});

describe('isAllowedOrigin', () => {
  it('accepts only configured origins', () => {
    expect(isAllowedOrigin('http://localhost:3000', ['http://localhost:3000'])).toBe(true);
    expect(isAllowedOrigin('https://evil.example', ['http://localhost:3000'])).toBe(false);
    expect(isAllowedOrigin(undefined, ['http://localhost:3000'])).toBe(false);
  });
});
