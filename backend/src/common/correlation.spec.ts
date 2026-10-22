import type { IncomingMessage, ServerResponse } from 'node:http';
import { CORRELATION_HEADER, resolveCorrelationId } from './correlation.js';

const makeReq = (headers: Record<string, string> = {}) =>
  ({ headers: { ...headers } }) as unknown as IncomingMessage;

const makeRes = () => {
  const headers: Record<string, string> = {};
  const res = {
    headersSent: false,
    setHeader: (name: string, value: string) => (headers[name] = value),
  } as unknown as ServerResponse;
  return { res, headers };
};

describe('resolveCorrelationId', () => {
  it('reuses a valid incoming id and echoes it back', () => {
    const req = makeReq({ [CORRELATION_HEADER]: 'abc-12345678' });
    const { res, headers } = makeRes();

    expect(resolveCorrelationId(req, res)).toBe('abc-12345678');
    expect(headers[CORRELATION_HEADER]).toBe('abc-12345678');
  });

  it('replaces a malformed id', () => {
    const req = makeReq({ [CORRELATION_HEADER]: 'bad id with spaces' });

    expect(resolveCorrelationId(req)).not.toBe('bad id with spaces');
  });

  it('returns the same id when called twice for one request', () => {
    const req = makeReq();

    expect(resolveCorrelationId(req)).toBe(resolveCorrelationId(req));
  });
});
