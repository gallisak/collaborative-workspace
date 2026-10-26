import { redactUrl } from './redact-url.js';

describe('redactUrl', () => {
  it('hides the token of a public page', () => {
    expect(redactUrl('/api/public/documents/abcDEF_123-xyz?x=1')).toBe(
      '/api/public/documents/[redacted]?x=1',
    );
  });

  it('keeps other paths', () => {
    expect(redactUrl('/api/documents/1f1f/threads')).toBe('/api/documents/1f1f/threads');
  });
});
