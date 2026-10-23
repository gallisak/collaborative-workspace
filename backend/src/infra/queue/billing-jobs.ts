export const BILLING_QUEUE = 'billing';

export const BillingJob = {
  ProcessEvent: 'event.process',
} as const;

export interface ProcessBillingEventJob {
  eventId: string;
}
