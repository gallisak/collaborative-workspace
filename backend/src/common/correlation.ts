import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const CORRELATION_HEADER = 'x-correlation-id';

const VALID_ID = /^[\w-]{8,128}$/;

export function resolveCorrelationId(req: IncomingMessage, res?: ServerResponse): string {
  const incoming = req.headers[CORRELATION_HEADER];
  const id = typeof incoming === 'string' && VALID_ID.test(incoming) ? incoming : randomUUID();
  req.headers[CORRELATION_HEADER] = id;
  if (res && !res.headersSent) {
    res.setHeader(CORRELATION_HEADER, id);
  }
  return id;
}
