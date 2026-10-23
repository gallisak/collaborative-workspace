import { type CheckoutCompleted, decideCheckoutCompleted } from './billing-event.js';

const payload: CheckoutCompleted = {
  id: '01a16800-0000-7000-8000-000000000001',
  workspaceId: '01a16800-0000-7000-8000-000000000002',
  planId: 'PRO',
  subscriptionId: 'sub_0123456789',
  currentPeriodEnd: '2026-11-23T00:00:00.000Z',
};
const openSession = { status: 'OPEN', workspaceId: payload.workspaceId, planId: 'PRO' } as const;
const unprocessed = { processedAt: null };

describe('decideCheckoutCompleted', () => {
  it('activates the plan for an open session', () => {
    expect(decideCheckoutCompleted(unprocessed, openSession, payload)).toEqual({
      kind: 'activate',
      workspaceId: payload.workspaceId,
      planId: 'PRO',
      subscriptionId: 'sub_0123456789',
      periodEnd: new Date('2026-11-23T00:00:00.000Z'),
    });
  });

  it('does nothing when the same event is delivered again', () => {
    expect(decideCheckoutCompleted({ processedAt: new Date() }, openSession, payload)).toEqual({
      kind: 'already-processed',
    });
  });

  it('does not charge twice when another event completes the same session', () => {
    expect(
      decideCheckoutCompleted(unprocessed, { ...openSession, status: 'COMPLETED' }, payload).kind,
    ).toBe('ignore');
  });

  it('ignores events for unknown or expired sessions', () => {
    expect(decideCheckoutCompleted(unprocessed, null, payload).kind).toBe('ignore');
    expect(
      decideCheckoutCompleted(unprocessed, { ...openSession, status: 'EXPIRED' }, payload).kind,
    ).toBe('ignore');
  });

  it('ignores events that do not match the session they reference', () => {
    expect(
      decideCheckoutCompleted(unprocessed, { ...openSession, planId: 'TEAM' }, payload).kind,
    ).toBe('ignore');
    expect(
      decideCheckoutCompleted(
        unprocessed,
        { ...openSession, workspaceId: '01a16800-0000-7000-8000-000000000009' },
        payload,
      ).kind,
    ).toBe('ignore');
  });
});
