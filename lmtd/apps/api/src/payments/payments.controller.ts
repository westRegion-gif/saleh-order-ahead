import { BadRequestException, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:orderId/session')
  createSession(@Param('orderId') orderId: string) {
    return this.payments.createCheckoutSession(orderId);
  }

  @Post('stripe/webhook')
  stripeWebhook(@Req() request: { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    if (!request.rawBody || !signature) throw new BadRequestException('Missing Stripe webhook signature');
    return this.payments.handleStripeWebhook(request.rawBody, signature);
  }
}
