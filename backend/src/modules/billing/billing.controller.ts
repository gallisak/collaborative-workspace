import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import {
  CheckoutSessionDto,
  CreateCheckoutDto,
  PlanDto,
  WorkspaceBillingDto,
} from './billing.dto.js';
import { BillingService } from './billing.service.js';
import { BillingWebhookService } from './billing-webhook.service.js';
import { MockPaymentProvider } from './mock-payment-provider.service.js';
import { SIGNATURE_HEADER } from './webhook-signature.js';

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly provider: MockPaymentProvider,
    private readonly webhook: BillingWebhookService,
  ) {}

  @Get('billing/plans')
  @ApiOkResponse({ type: [PlanDto] })
  plans() {
    return this.billing.plans();
  }

  @Get('workspaces/:workspaceId/billing')
  @ApiOkResponse({ type: WorkspaceBillingDto })
  @ApiNotFoundResponse({ description: 'Workspace does not exist or you are not a member' })
  overview(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.billing.overview(user.id, workspaceId);
  }

  @Post('workspaces/:workspaceId/billing/checkout')
  @ApiCreatedResponse({ type: CheckoutSessionDto })
  @ApiBadRequestResponse({ description: 'The workspace is already on this plan' })
  @ApiConflictResponse({ description: 'The workspace has more members than the plan allows' })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
  createCheckout(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billing.createCheckout(user.id, workspaceId, dto);
  }

  @Get('billing/checkout-sessions/:sessionId')
  @ApiOkResponse({ type: CheckoutSessionDto })
  @ApiNotFoundResponse({ description: 'Session does not exist or you cannot manage billing' })
  checkout(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.billing.checkout(user.id, sessionId);
  }

  @Post('billing/checkout-sessions/:sessionId/pay')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'Mock provider accepted the payment and sent a signed webhook',
  })
  @ApiBadRequestResponse({ description: 'The session has expired' })
  @ApiConflictResponse({ description: 'The session is already paid' })
  pay(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.provider.pay(user.id, sessionId);
  }

  @Public()
  @Post('billing/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: SIGNATURE_HEADER, description: 't=<unix seconds>,v1=<hmac sha256 hex>' })
  @ApiOkResponse({ description: 'Event stored, it is processed asynchronously' })
  @ApiBadRequestResponse({ description: 'Invalid signature or malformed event' })
  async receiveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers(SIGNATURE_HEADER) signature: string | undefined,
  ) {
    await this.webhook.receive(req.rawBody, signature);
    return { received: true };
  }
}
