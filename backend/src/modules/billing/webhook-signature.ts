import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'billing-signature';
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const digest = (secret: string, timestamp: number, payload: string) =>
  createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

export function signPayload(secret: string, payload: string, timestamp: number): string {
  return `t=${timestamp},v1=${digest(secret, timestamp, payload)}`;
}

export function verifySignature(
  secret: string,
  payload: string,
  header: string | undefined,
  nowSeconds: number,
): boolean {
  const parts = new Map(
    (header ?? '').split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')] as const;
    }),
  );
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (!Number.isInteger(timestamp) || !signature) {
    return false;
  }
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = Buffer.from(digest(secret, timestamp, payload), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
