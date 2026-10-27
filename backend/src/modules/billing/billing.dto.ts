import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  CheckoutSessionStatus,
  PlanTier,
  SubscriptionStatus,
} from '../../generated/prisma/enums.js';

export const PAID_PLANS = ['PRO', 'TEAM'] as const;

export class CreateCheckoutDto {
  @ApiProperty({ enum: PAID_PLANS })
  @IsIn(PAID_PLANS)
  planId: (typeof PAID_PLANS)[number];
}

export class PlanDto {
  @ApiProperty({ enum: PlanTier, enumName: 'PlanTier' })
  id: PlanTier;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Monthly price in cents' })
  priceMinor: number;

  @ApiProperty({ nullable: true, type: Number, description: 'null means unlimited' })
  maxMembers: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'null means unlimited' })
  maxDocuments: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'null means unlimited' })
  maxStorageBytes: number | null;
}

export class SubscriptionDto {
  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
  status: SubscriptionStatus;

  @ApiProperty()
  currentPeriodEnd: Date;
}

export class UsageDto {
  @ApiProperty()
  members: number;

  @ApiProperty({
    description: 'People outside the workspace with edit access to a page, they take a member seat',
  })
  guestEditors: number;

  @ApiProperty({ description: 'Open invitations, they take a member seat until they expire' })
  pendingInvitations: number;

  @ApiProperty()
  documents: number;

  @ApiProperty()
  storageBytes: number;
}

export class WorkspaceBillingDto {
  @ApiProperty({ type: PlanDto })
  plan: PlanDto;

  @ApiProperty({ type: SubscriptionDto, nullable: true })
  subscription: SubscriptionDto | null;

  @ApiProperty({ type: UsageDto })
  usage: UsageDto;
}

export class CheckoutSessionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId: string;

  @ApiProperty({ type: PlanDto })
  plan: PlanDto;

  @ApiProperty({ enum: CheckoutSessionStatus, enumName: 'CheckoutSessionStatus' })
  status: CheckoutSessionStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Why a paid checkout was not applied, set when the status is FAILED',
  })
  failureReason: string | null;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ description: 'Page of the mock payment provider' })
  url: string;
}
