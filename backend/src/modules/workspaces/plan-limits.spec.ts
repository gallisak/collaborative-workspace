import { HttpStatus } from '@nestjs/common';
import { PlanLimitExceededException } from '../../common/errors/plan-limit.exception.js';
import { assertCapacity } from './plan-limits.js';

const members = (limit: number | null) => ({ planName: 'Free', resource: 'members', limit });

describe('assertCapacity', () => {
  it('treats a missing limit as unlimited', () => {
    expect(() => assertCapacity(members(null), 1_000_000)).not.toThrow();
  });

  it('allows usage strictly below the limit', () => {
    expect(() => assertCapacity(members(3), 2)).not.toThrow();
  });

  it('rejects usage at or above the limit with a 402 and an explanation', () => {
    expect(() => assertCapacity(members(3), 3)).toThrow(PlanLimitExceededException);
    try {
      assertCapacity(members(3), 4);
    } catch (error) {
      expect((error as PlanLimitExceededException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect((error as Error).message).toBe(
        'The Free plan allows up to 3 members. Upgrade the plan to add more.',
      );
    }
  });
});
