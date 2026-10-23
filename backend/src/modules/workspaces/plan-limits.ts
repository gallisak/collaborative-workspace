import { PlanLimitExceededException } from '../../common/errors/plan-limit.exception.js';

export interface PlanLimit {
  planName: string;
  resource: string;
  limit: number | null;
}

export function assertCapacity({ planName, resource, limit }: PlanLimit, used: number) {
  if (limit !== null && used >= limit) {
    throw new PlanLimitExceededException(resource, planName, limit);
  }
}
