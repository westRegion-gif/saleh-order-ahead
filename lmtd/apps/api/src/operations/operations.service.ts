import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { canTransitionOrder, LIVE_ORDER_STATUSES } from './order-state';

const orderInclude = {
  customer: { select: { id: true, fullName: true, phone: true, email: true } },
  branch: true,
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeService) {}

  listOrders(branchId?: string, scope = 'live') {
    const where: Prisma.OrderWhereInput = {};
    if (branchId) where.branchId = branchId;
    if (scope !== 'all') where.status = { in: [...LIVE_ORDER_STATUSES] };
    return this.prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async updateStatus(id: string, status: string, note?: string, branchId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findFirst({ where: { id, ...(branchId ? { branchId } : {}) } });
      if (!current) throw new NotFoundException('Order not found');
      if (current.status === status) {
        const same = await tx.order.findUnique({ where: { id }, include: orderInclude });
        return { order: same!, changed: false };
      }
      if (!canTransitionOrder(current.status, status)) {
        throw new BadRequestException(`Invalid order transition: ${current.status} -> ${status}`);
      }
      if (status === 'CUSTOMER_ARRIVED' && current.pickupMethod !== 'VEHICLE') {
        throw new BadRequestException('Customer arrival is only available for vehicle pickup');
      }

      const order = await tx.order.update({ where: { id }, data: { status }, include: orderInclude });
      await tx.orderStatusHistory.create({ data: { orderId: id, status, note: note?.trim() || `Operational status changed to ${status}` } });
      await tx.outboxEvent.create({ data: { orderId: id, eventType: 'ORDER_STATUS_CHANGED', payload: { orderId: id, orderNumber: order.orderNumber, from: current.status, to: status } } });
      return { order, changed: true };
    });
    if (result.changed) this.realtime.emitOrderUpdate(result.order);
    return result.order;
  }

  async markCustomerArrived(id: string, customerId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findFirst({ where: { id, customerId } });
      if (!current) throw new NotFoundException('Order not found');
      if (current.pickupMethod !== 'VEHICLE') throw new BadRequestException('Arrival confirmation is only available for vehicle pickup');
      if (current.status === 'CUSTOMER_ARRIVED') {
        const same = await tx.order.findUnique({ where: { id }, include: orderInclude });
        return { order: same!, changed: false };
      }
      if (current.status !== 'READY') throw new BadRequestException('Order is not ready for arrival confirmation');
      const order = await tx.order.update({ where: { id }, data: { status: 'CUSTOMER_ARRIVED' }, include: orderInclude });
      await tx.orderStatusHistory.create({ data: { orderId: id, status: 'CUSTOMER_ARRIVED', note: 'Customer confirmed arrival' } });
      await tx.outboxEvent.create({ data: { orderId: id, eventType: 'CUSTOMER_ARRIVED', payload: { orderId: id, orderNumber: order.orderNumber, customerId } } });
      return { order, changed: true };
    });
    if (result.changed) this.realtime.emitOrderUpdate(result.order);
    return result.order;
  }

  async requestPrint(orderId: string, source = 'MANUAL', branchId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, ...(branchId ? { branchId } : {}) }, include: orderInclude });
    if (!order) throw new NotFoundException('Order not found');
    if (['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status)) throw new BadRequestException('Receipt cannot be printed before successful payment');
    const job = await this.prisma.outboxEvent.create({
      data: { orderId, eventType: 'PRINT_RECEIPT', payload: { status: 'PENDING', source, orderId, orderNumber: order.orderNumber, branchId: order.branchId, requestedAt: new Date().toISOString() } },
    });
    this.realtime.emitPrintJob({ ...job, branchId: order.branchId });
    return { job, order };
  }

  listPrintJobs(branchId?: string) {
    const where: Prisma.OutboxEventWhereInput = { eventType: 'PRINT_RECEIPT', processedAt: null };
    if (branchId) where.order = { is: { branchId } };
    return this.prisma.outboxEvent.findMany({ where, include: { order: { include: { branch: true, items: true } } }, orderBy: { createdAt: 'asc' }, take: 100 });
  }

  async updatePrintJob(id: string, status: 'PRINTING' | 'COMPLETED' | 'FAILED', error?: string, branchId?: string) {
    const job = await this.prisma.outboxEvent.findFirst({
      where: { id, eventType: 'PRINT_RECEIPT', ...(branchId ? { order: { is: { branchId } } } : {}) },
      include: { order: true },
    });
    if (!job) throw new NotFoundException('Print job not found');
    const previous = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? job.payload as Record<string, unknown> : {};
    const payload: Prisma.InputJsonValue = {
      ...previous,
      status,
      ...(error?.trim() ? { error: error.trim().slice(0, 500) } : {}),
      updatedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue;
    const updated = await this.prisma.outboxEvent.update({ where: { id }, data: { payload, processedAt: status === 'COMPLETED' ? new Date() : null } });
    this.realtime.emitPrintJob({ ...updated, branchId: job.order?.branchId ?? null });
    return updated;
  }
}
