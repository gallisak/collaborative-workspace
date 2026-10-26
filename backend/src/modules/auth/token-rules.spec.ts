import { issuedAtMs, issuedBeforeRevocation } from './access-token-revocation.service.js';
import { canReuseRotated, isWithinRotationGrace } from './token-rules.js';

describe('canReuseRotated', () => {
  const now = new Date('2026-10-19T12:00:10Z');
  const rotation = { rotatedAt: new Date('2026-10-19T12:00:05Z'), rotatedFrom: 'tab-device' };

  it('lets another tab of the same device refresh right after rotation', () => {
    expect(canReuseRotated(rotation, 'tab-device', now, 10)).toBe(true);
  });

  it('treats a reuse from another device as theft even inside the grace window', () => {
    expect(canReuseRotated(rotation, 'other-device', now, 10)).toBe(false);
  });

  it('treats a late reuse from the same device as theft', () => {
    expect(canReuseRotated(rotation, 'tab-device', new Date('2026-10-19T12:00:30Z'), 10)).toBe(
      false,
    );
  });
});

describe('isWithinRotationGrace', () => {
  const now = new Date('2026-10-19T12:00:10Z');

  it('allows a concurrent refresh right after rotation', () => {
    expect(isWithinRotationGrace(new Date('2026-10-19T12:00:05Z'), now, 10)).toBe(true);
    expect(isWithinRotationGrace(new Date('2026-10-19T12:00:00Z'), now, 10)).toBe(true);
  });

  it('treats a late reuse as theft', () => {
    expect(isWithinRotationGrace(new Date('2026-10-19T11:59:59Z'), now, 10)).toBe(false);
  });

  it('never grants grace to tokens revoked without rotation', () => {
    expect(isWithinRotationGrace(null, now, 10)).toBe(false);
  });

  it('can be disabled', () => {
    expect(isWithinRotationGrace(new Date('2026-10-19T12:00:09Z'), now, 0)).toBe(false);
  });
});

describe('issuedBeforeRevocation', () => {
  it('rejects tokens issued before the revocation, even within the same second', () => {
    expect(issuedBeforeRevocation(1_000_400, '1000401')).toBe(true);
  });

  it('accepts tokens issued at or after the revocation', () => {
    expect(issuedBeforeRevocation(1_000_401, '1000401')).toBe(false);
    expect(issuedBeforeRevocation(1_000_900, '1000401')).toBe(false);
  });

  it('accepts tokens when nothing was revoked', () => {
    expect(issuedBeforeRevocation(1_000_000, null)).toBe(false);
  });
});

describe('issuedAtMs', () => {
  it('prefers the millisecond claim', () => {
    expect(issuedAtMs({ sub: 'u', iat: 1000, iatMs: 1_000_250 })).toBe(1_000_250);
  });

  it('falls back to the standard iat in seconds', () => {
    expect(issuedAtMs({ sub: 'u', iat: 1000 })).toBe(1_000_000);
  });

  it('returns undefined without any issue time', () => {
    expect(issuedAtMs({ sub: 'u' })).toBeUndefined();
  });
});
