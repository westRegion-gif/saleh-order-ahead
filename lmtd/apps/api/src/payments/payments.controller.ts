import { BadRequestException, Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { CustomerAuthService } from '../customer-auth/customer-auth.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly auth: CustomerAuthService) {}

  @Post('intent')
  async createIntent(@Body() dto: CreatePaymentIntentDto, @Headers('authorization') authorization?: string) {
    const customer = await this.auth.customerFromAuthorization(authorization);
    return this.payments.createIntent(customer.id, dto.orderId, dto.idempotencyKey);
  }

  @Post('stripe/webhook')
  stripeWebhook(@Req() req: any, @Headers('stripe-signature') signature?: string) {
    if (!signature || !req.rawBody) throw new BadRequestException('Missing Stripe webhook signature');
    return this.payments.handleStripeWebhook(req.rawBody as Buffer, signature);
  }
}
