import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private stripeSecret() {
    const value = process.env.STRIPE_SECRET_KEY?.trim();
    if (!value) throw new ServiceUnavailableException('Stripe is not configured');
    return value;
  }

  private stripeWebhookSecret() {
    const value = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!value) throw new ServiceUnavailableException('Stripe webhook is not configured');
    return value;
  }

  private provider() {
    const provider = (process.env.PAYMENT_PROVIDER || 'disabled').toLowerCase();
    if (provider !== 'stripe') throw new ServiceUnavailableException('Payment provider is not enabled');
    return provider;
  }

  private async stripeRequest(path: string, init: RequestInit = {}) {
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.stripeSecret()}`,
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => null) as any;
    if (!response.ok) throw new BadRequestException(body?.error?.message || 'Stripe request failed');
    return body;
  }

  async createIntent(customerId: string, orderId: string, idempotencyKey: string) {
    this.provider();
    const order = await this.prisma.order.findFirst({ where: { id: orderId, customerId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status)) throw new BadRequestException('Order is not awaiting payment');

    const existing = await this.prisma.paymentAttempt.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.customerId !== customerId || existing.orderId !== orderId) throw new BadRequestException('Invalid payment idempotency key');
      if (!existing.providerReference) throw new BadRequestException('Payment attempt is not ready');
      const intent = await this.stripeRequest(`/payment_intents/${encodeURIComponent(existing.providerReference)}`);
      return { paymentAttemptId: existing.id, provider: 'stripe', status: existing.status, clientSecret: intent.client_secret };
    }

    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        orderId,
        customerId,
        provider: 'stripe',
        idempotencyKey,
        status: 'CREATING',
        amount: order.total,
        currency: order.currency,
      },
    });

    try {
      const params = new URLSearchParams();
      params.set('amount', String(Math.round(Number(order.total) * 100)));
      params.set('currency', order.currency.toLowerCase());
      params.set('automatic_payment_methods[enabled]', 'true');
      params.set('metadata[orderId]', order.id);
      params.set('metadata[orderNumber]', order.orderNumber);
      params.set('metadata[customerId]', customerId);
      const intent = await this.stripeRequest('/payment_intents', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': idempotencyKey },
        body: params.toString(),
      });
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { providerReference: intent.id, status: String(intent.status || 'REQUIRES_PAYMENT_METHOD').toUpperCase() },
      });
      return { paymentAttemptId: attempt.id, provider: 'stripe', status: intent.status, clientSecret: intent.client_secret };
    } catch (error) {
      await this.prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: error instanceof Error ? error.message : 'Stripe request failed' } }).catch(() => undefined);
      throw error;
    }
  }

  private verifyStripeSignature(rawBody: Buffer, signature: string) {
    const parts = signature.split(',').map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
    const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
    if (!timestamp || signatures.length === 0) throw new UnauthorizedException('Invalid Stripe signature');
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) throw new UnauthorizedException('Expired Stripe signature');
    const expectedHex = createHmac('sha256', this.stripeWebhookSecret()).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    const expected = Buffer.from(expectedHex, 'hex');
    const valid = signatures.some((candidate) => {
      try {
        const actual = Buffer.from(candidate, 'hex');
        return actual.length === expected.length && timingSafeEqual(actual, expected);
      } catch {
        return false;
      }
    });
    if (!valid) throw new UnauthorizedException('Invalid Stripe signature');
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    this.verifyStripeSignature(rawBody, signature);
    const event = JSON.parse(rawBody.toString('utf8')) as any;
    const intent = event?.data?.object;
    const providerReference = intent?.id as string | undefined;
    if (!providerReference) return { received: true };

    const attempt = await this.prisma.paymentAttempt.findUnique({ where: { providerReference } });
    if (!attempt) return { received: true };

    if (event.type === 'payment_intent.succeeded') {
      await this.prisma.$transaction(async (tx) => {
        const currentOrder = await tx.order.findUnique({ where: { id: attempt.orderId } });
        await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCEEDED', failureReason: null } });
        if (currentOrder?.status === 'PAYMENT_PENDING' || currentOrder?.status === 'PAYMENT_FAILED') {
          await tx.order.update({ where: { id: attempt.orderId }, data: { status: 'PENDING' } });
          await tx.orderStatusHistory.create({ data: { orderId: attempt.orderId, status: 'PENDING', note: 'Payment confirmed' } });
          await tx.outboxEvent.create({ data: { orderId: attempt.orderId, eventType: 'PAYMENT_SUCCEEDED', payload: { orderId: attempt.orderId, paymentAttemptId: attempt.id, providerReference } } });
        }
      });
    }

    if (event.type === 'payment_intent.payment_failed') {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: intent?.last_payment_error?.message || 'Payment failed' } });
        const currentOrder = await tx.order.findUnique({ where: { id: attempt.orderId } });
        if (currentOrder?.status === 'PAYMENT_PENDING') {
          await tx.order.update({ where: { id: attempt.orderId }, data: { status: 'PAYMENT_FAILED' } });
          await tx.orderStatusHistory.create({ data: { orderId: attempt.orderId, status: 'PAYMENT_FAILED', note: 'Payment failed' } });
          await tx.outboxEvent.create({ data: { orderId: attempt.orderId, eventType: 'PAYMENT_FAILED', payload: { orderId: attempt.orderId, paymentAttemptId: attempt.id } } });
        }
      });
    }

    return { received: true };
  }
}
