import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private provider() {
    return (this.config.get<string>('PAYMENT_PROVIDER') || 'disabled').toLowerCase();
  }

  async createCheckoutSession(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { branch: true } });
    if (!order) throw new BadRequestException('Order not found');
    if (order.status !== 'PAYMENT_PENDING') throw new BadRequestException('Order is not awaiting payment');
    if (Number(order.total) <= 0) throw new BadRequestException('Order total must be greater than zero');

    const provider = this.provider();
    if (provider !== 'stripe') throw new ServiceUnavailableException('Payment provider is not configured');
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    const customerUrl = (this.config.get<string>('CUSTOMER_APP_URL') || '').replace(/\/$/, '');
    if (!secret || !customerUrl) throw new ServiceUnavailableException('Payment provider is not configured');

    const amount = Math.round(Number(order.total) * 100);
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${customerUrl}/tracking?order=${encodeURIComponent(order.id)}&payment=success`);
    params.set('cancel_url', `${customerUrl}/payment?order=${encodeURIComponent(order.id)}&payment=cancelled`);
    params.set('client_reference_id', order.id);
    params.set('metadata[orderId]', order.id);
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', order.currency.toLowerCase());
    params.set('line_items[0][price_data][unit_amount]', String(amount));
    params.set('line_items[0][price_data][product_data][name]', `LMTD Order ${order.orderNumber}`);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': `lmtd-order-${order.id}`,
      },
      body: params,
    });
    const payload = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !payload.id || !payload.url) {
      throw new ServiceUnavailableException(payload.error?.message || 'Unable to start payment');
    }

    await this.prisma.paymentAttempt.upsert({
      where: { provider_providerRef: { provider: 'stripe', providerRef: payload.id } },
      create: {
        orderId: order.id,
        provider: 'stripe',
        providerRef: payload.id,
        status: 'CHECKOUT_CREATED',
        amount: order.total,
        currency: order.currency,
        checkoutUrl: payload.url,
      },
      update: { status: 'CHECKOUT_CREATED', checkoutUrl: payload.url },
    });
    return { provider: 'stripe', checkoutUrl: payload.url };
  }

  private verifyStripeSignature(rawBody: Buffer, signature: string) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Stripe webhook is not configured');
    const parts = signature.split(',').map((part) => part.split('='));
    const timestamp = parts.find(([key]) => key === 't')?.[1];
    const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
    if (!timestamp || signatures.length === 0) throw new BadRequestException('Invalid Stripe signature');
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) throw new BadRequestException('Expired Stripe signature');
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const valid = signatures.some((value) => {
      const candidate = Buffer.from(value || '');
      return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
    });
    if (!valid) throw new BadRequestException('Invalid Stripe signature');
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    this.verifyStripeSignature(rawBody, signature);
    const event = JSON.parse(rawBody.toString('utf8')) as {
      type?: string;
      data?: { object?: { id?: string; client_reference_id?: string; metadata?: { orderId?: string } } };
    };
    const session = event.data?.object;
    const orderId = session?.metadata?.orderId || session?.client_reference_id;
    if (!orderId || !session?.id) return { received: true };

    if (event.type === 'checkout.session.completed') {
      await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) return;
        await tx.paymentAttempt.updateMany({
          where: { provider: 'stripe', providerRef: session.id },
          data: { status: 'PAID' },
        });
        if (order.status === 'PAYMENT_PENDING' || order.status === 'PAYMENT_FAILED') {
          await tx.order.update({ where: { id: order.id }, data: { status: 'PENDING' } });
          await tx.orderStatusHistory.create({ data: { orderId: order.id, status: 'PENDING', note: 'Payment confirmed' } });
          await tx.outboxEvent.create({
            data: { orderId: order.id, eventType: 'PAYMENT_SUCCEEDED', payload: { orderId: order.id, provider: 'stripe', providerRef: session.id } },
          });
        }
      });
    } else if (event.type === 'checkout.session.expired') {
      await this.prisma.paymentAttempt.updateMany({
        where: { provider: 'stripe', providerRef: session.id },
        data: { status: 'EXPIRED' },
      });
    }
    return { received: true };
  }
}
