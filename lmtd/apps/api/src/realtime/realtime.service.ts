import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

type OrderLike = {
  id: string;
  orderNumber: string;
  status: string;
  branchId: string;
  customerId?: string | null;
  updatedAt?: Date | string;
  pickupMethod?: string;
  total?: unknown;
};

type PrintLike = {
  id: string;
  orderId?: string | null;
  eventType?: string;
  createdAt?: Date | string;
  payload?: unknown;
};

@Injectable()
export class RealtimeService {
  private server?: Server;

  bindServer(server: Server) {
    this.server = server;
  }

  emitOrderUpdate(order: OrderLike, options: { newOrder?: boolean } = {}) {
    if (!this.server) return;
    const payload = {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      branchId: order.branchId,
      customerId: order.customerId ?? null,
      pickupMethod: order.pickupMethod ?? null,
      total: order.total == null ? null : Number(order.total),
      updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt ?? new Date().toISOString(),
    };

    this.server.to('admin:all').emit(options.newOrder ? 'order:new' : 'order:update', payload);
    this.server.to(`branch:${order.branchId}`).emit('order:update', payload);
    if (order.customerId) this.server.to(`customer:${order.customerId}`).emit('order:update', payload);
  }

  emitPrintJob(job: PrintLike & { branchId?: string | null }) {
    if (!this.server) return;
    const payload = {
      id: job.id,
      orderId: job.orderId ?? null,
      branchId: job.branchId ?? null,
      createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt ?? new Date().toISOString(),
      payload: job.payload ?? null,
    };
    this.server.to('admin:all').emit('print:new', payload);
    if (job.branchId) this.server.to(`branch:${job.branchId}`).emit('print:new', payload);
  }
}
