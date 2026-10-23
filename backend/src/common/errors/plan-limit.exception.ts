import { HttpException, HttpStatus } from '@nestjs/common';

export class PlanLimitExceededException extends HttpException {
  constructor(resource: string, planName: string, limit: number | string) {
    super(
      `The ${planName} plan allows up to ${limit} ${resource}. Upgrade the plan to add more.`,
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
