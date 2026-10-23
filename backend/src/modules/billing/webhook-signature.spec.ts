import { signPayload, verifySignature } from './webhook-signature.js';

const secret = 'whsec-test-secret';
const payload = '{"id":"evt_1"}';
const now = 1_800_000_000;

describe('webhook signature', () => {
  it('accepts a payload signed with the shared secret', () => {
    expect(verifySignature(secret, payload, signPayload(secret, payload, now), now)).toBe(true);
  });

  it('rejects a modified payload', () => {
    const header = signPayload(secret, payload, now);
    expect(verifySignature(secret, '{"id":"evt_2"}', header, now)).toBe(false);
  });

  it('rejects a different secret', () => {
    expect(verifySignature(secret, payload, signPayload('other', payload, now), now)).toBe(false);
  });

  it('rejects old signatures to stop replays', () => {
    const header = signPayload(secret, payload, now - 301);
    expect(verifySignature(secret, payload, header, now)).toBe(false);
  });

  it('rejects missing or malformed headers', () => {
    expect(verifySignature(secret, payload, undefined, now)).toBe(false);
    expect(verifySignature(secret, payload, 't=abc,v1=00', now)).toBe(false);
    expect(verifySignature(secret, payload, `t=${now},v1=zz`, now)).toBe(false);
  });
});
