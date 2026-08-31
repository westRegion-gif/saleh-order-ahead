import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeService) {}

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
    const provider = (process.env.PAYMENT_PROVIDER || 'disabled').trim().toLowerCase();
    if (provider !== 'stripe') throw new ServiceUnavailableException('Payment provider is not enabled');
  }

  private async stripeRequest(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      method: init.method,
      headers: { authorization: `Bearer ${this.stripeSecret()}`, ...(init.headers || {}) },
      body: init.body,
    });
    const body = await response.json().catch(() => null) as any;
    if (!response.ok) throw new BadRequestException(body?.error?.message || 'Stripe request failed');
    return body;
  }

  private intentParams(order: { id: string; orderNumber: string; total: unknown; currency: string }, customerId: string) {
    const amount = Math.round(Number(order.total) * 100);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Invalid order total');
    const params = new URLSearchParams();
    params.set('amount', String(amount));
    params.set('currency', order.currency.toLowerCase());
    params.set('automatic_payment_methods[enabled]', 'true');
    params.set('metadata[orderId]', order.id);
    params.set('metadata[orderNumber]', order.orderNumber);
    params.set('metadata[customerId]', customerId);
    return params;
  }

  private async createStripeIntent(attemptId: string, idempotencyKey: string, order: { id: string; orderNumber: string; total: unknown; currency: string }, customerId: string) {
    try {
      const intent = await this.stripeRequest('/payment_intents', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': idempotencyKey },
        body: this.intentParams(order, customerId).toString(),
      });
      await this.prisma.paymentAttempt.update({
        where: { id: attemptId },
        data: { providerReference: intent.id, status: String(intent.status || 'REQUIRES_PAYMENT_METHOD').toUpperCase(), failureReason: null },
      });
      return { paymentAttemptId: attemptId, provider: 'stripe', status: intent.status, clientSecret: intent.client_secret };
    } catch (error) {
      await this.prisma.paymentAttempt.update({
        where: { id: attemptId },
        data: { status: 'FAILED', failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Stripe request failed' },
      }).catch(() => undefined);
      throw error;
    }
  }

  async createIntent(customerId: string, orderId: string, idempotencyKey: string) {
    this.provider();
    const order = await this.prisma.order.findFirst({ where: { id: orderId, customerId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status)) throw new BadRequestException('Order is not awaiting payment');

    const existing = await this.prisma.paymentAttempt.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.customerId !== customerId || existing.orderId !== orderId) throw new BadRequestException('Invalid payment idempotency key');
      if (existing.providerReference) {
        const intent = await this.stripeRequest(`/payment_intents/${encodeURIComponent(existing.providerReference)}`);
        return { paymentAttemptId: existing.id, provider: 'stripe', status: intent.status, clientSecret: intent.client_secret };
      }
      return this.createStripeIntent(existing.id, idempotencyKey, order, customerId);
    }

    let attempt;
    try {
      attempt = await this.prisma.paymentAttempt.create({
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
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
      if (code !== 'P2002') throw error;
      const duplicate = await this.prisma.paymentAttempt.findUnique({ where: { idempotencyKey } });
      if (!duplicate || duplicate.customerId !== customerId || duplicate.orderId !== orderId) throw new BadRequestException('Payment idempotency key conflict');
      if (duplicate.providerReference) {
        const intent = await this.stripeRequest(`/payment_intents/${encodeURIComponent(duplicate.providerReference)}`);
        return { paymentAttemptId: duplicate.id, provider: 'stripe', status: intent.status, clientSecret: intent.client_secret };
      }
      return this.createStripeIntent(duplicate.id, idempotencyKey, order, customerId);
    }

    return this.createStripeIntent(attempt.id, idempotencyKey, order, customerId);
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
    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid Stripe webhook payload');
    }

    const intent = event?.data?.object;
    const providerReference = intent?.id as string | undefined;
    if (!providerReference) return { received: true };

    const attempt = await this.prisma.paymentAttempt.findUnique({ where: { providerReference } });
    if (!attempt) return { received: true };

    if (event.type === 'payment_intent.succeeded') {
      const changed = await this.prisma.$transaction(async (tx) => {
        const currentOrder = await tx.order.findUnique({ where: { id: attempt.orderId } });
        await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCEEDED', failureReason: null } });
        if (currentOrder?.status !== 'PAYMENT_PENDING' && currentOrder?.status !== 'PAYMENT_FAILED') return null;

        const order = await tx.order.update({ where: { id: attempt.orderId }, data: { status: 'PENDING' } });
        await tx.orderStatusHistory.create({ data: { orderId: attempt.orderId, status: 'PENDING', note: 'Payment confirmed' } });
        await tx.outboxEvent.create({
          data: { orderId: attempt.orderId, eventType: 'PAYMENT_SUCCEEDED', payload: { orderId: attempt.orderId, paymentAttemptId: attempt.id, providerReference } },
        });
        const printEvent = await tx.outboxEvent.create({
          data: {
            orderId: attempt.orderId,
            eventType: 'PRINT_RECEIPT',
            payload: { status: 'PENDING', source: 'PAYMENT_SUCCEEDED', orderId: attempt.orderId, orderNumber: order.orderNumber, branchId: order.branchId, requestedAt: new Date().toISOString() },
          },
        });
        return { order, printEvent };
      });

      if (changed) {
        this.realtime.emitOrderUpdate(changed.order, { newOrder: true });
        this.realtime.emitPrintJob({ ...changed.printEvent, branchId: changed.order.branchId });
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const changed = await this.prisma.$transaction(async (tx) => {
        await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: String(intent?.last_payment_error?.message || 'Payment failed').slice(0, 500) } });
        const currentOrder = await tx.order.findUnique({ where: { id: attempt.orderId } });
        if (currentOrder?.status !== 'PAYMENT_PENDING') return null;
        const order = await tx.order.update({ where: { id: attempt.orderId }, data: { status: 'PAYMENT_FAILED' } });
        await tx.orderStatusHistory.create({ data: { orderId: attempt.orderId, status: 'PAYMENT_FAILED', note: 'Payment failed' } });
        await tx.outboxEvent.create({ data: { orderId: attempt.orderId, eventType: 'PAYMENT_FAILED', payload: { orderId: attempt.orderId, paymentAttemptId: attempt.id } } });
        return order;
      });
      if (changed) this.realtime.emitOrderUpdate(changed);
    }

    return { received: true };
  }
}
