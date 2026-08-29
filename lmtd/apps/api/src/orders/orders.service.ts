import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublic(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        pickupMethod: true,
        currency: true,
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
        total: true,
        note: true,
        createdAt: true,
        branch: {
          select: {
            id: true,
            code: true,
            nameAr: true,
            nameEn: true,
            addressAr: true,
            addressEn: true,
            imageUrl: true,
            prepTimeMin: true,
            prepTimeMax: true,
            acceptsOrders: true,
            isOpenOverride: true,
          },
        },
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            modifiersJson: true,
            note: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, note: true, createdAt: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(dto: CreateOrderDto) {
    const existing = await this.prisma.order.findFirst({ where: { idempotencyKey: dto.idempotencyKey }, include: { items: true } });
    if (existing) return existing;

    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, isActive: true } });
    if (!branch) throw new NotFoundException('Branch not found');
    if (!branch.acceptsOrders || branch.isOpenOverride === false) throw new BadRequestException('Branch is not accepting orders');
    if (dto.pickupMethod === 'VEHICLE' && !dto.vehiclePlate?.trim()) throw new BadRequestException('Vehicle plate is required');

    const pricedItems: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      modifiersJson: Prisma.InputJsonValue;
      note?: string;
    }> = [];

    for (const requested of dto.items) {
      const row = await this.prisma.branchProduct.findUnique({
        where: { branchId_productId: { branchId: dto.branchId, productId: requested.productId } },
        include: {
          product: {
            include: {
              modifierGroups: {
                where: { isActive: true },
                include: {
                  modifiers: {
                    where: { isActive: true },
                    include: { branchModifiers: { where: { branchId: dto.branchId } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!row || !row.product.isActive) throw new BadRequestException('Product is unavailable');
      if (!row.isAvailable) throw new BadRequestException(`${row.product.nameAr} is sold out`);

      const selectedIds = requested.modifiers.map((m) => m.modifierId);
      const snapshots: Array<{ groupId: string; groupName: string; modifierId: string; modifierName: string; priceDelta: number }> = [];
      let modifierTotal = 0;

      for (const group of row.product.modifierGroups) {
        const groupSelected = group.modifiers.filter((m) => selectedIds.includes(m.id));
        const count = groupSelected.length;
        if (count < group.minSelect || (group.isRequired && count === 0)) throw new BadRequestException(`Required modifier missing: ${group.nameAr}`);
        if (group.maxSelect != null && count > group.maxSelect) throw new BadRequestException(`Too many modifiers selected: ${group.nameAr}`);
        if ((group.selectionType === 'SINGLE' || group.maxSelect === 1) && count > 1) throw new BadRequestException(`Only one modifier allowed: ${group.nameAr}`);

        for (const modifier of groupSelected) {
          const override = modifier.branchModifiers[0];
          if (override && !override.isAvailable) throw new BadRequestException(`Modifier unavailable: ${modifier.nameAr}`);
          const priceDelta = Number(override?.priceDeltaOverride ?? modifier.priceDelta);
          modifierTotal += priceDelta;
          snapshots.push({ groupId: group.id, groupName: group.nameAr, modifierId: modifier.id, modifierName: modifier.nameAr, priceDelta });
        }
      }

      const validModifierIds = row.product.modifierGroups.flatMap((g) => g.modifiers.map((m) => m.id));
      if (selectedIds.some((id) => !validModifierIds.includes(id))) throw new BadRequestException('Invalid modifier selection');

      const basePrice = Number(row.priceOverride ?? row.product.basePrice);
      const unitPrice = basePrice + modifierTotal;
      const lineTotal = unitPrice * requested.quantity;
      pricedItems.push({
        productId: row.product.id,
        productName: row.product.nameAr,
        quantity: requested.quantity,
        unitPrice,
        lineTotal,
        modifiersJson: snapshots,
        note: requested.note,
      });
    }

    const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountTotal = 0;
    const taxTotal = 0;
    const total = subtotal - discountTotal + taxTotal;
    const orderNumber = `LMTD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          idempotencyKey: dto.idempotencyKey,
          branchId: dto.branchId,
          status: 'PAYMENT_PENDING',
          pickupMethod: dto.pickupMethod,
          currency: 'AED',
          subtotal,
          discountTotal,
          taxTotal,
          total,
          note: dto.note?.trim() || null,
          vehiclePlate: dto.pickupMethod === 'VEHICLE' ? dto.vehiclePlate?.trim() || null : null,
          vehicleEmirate: dto.pickupMethod === 'VEHICLE' ? dto.vehicleEmirate?.trim() || null : null,
          vehicleMakeModel: dto.pickupMethod === 'VEHICLE' ? dto.vehicleMakeModel?.trim() || null : null,
          vehicleColor: dto.pickupMethod === 'VEHICLE' ? dto.vehicleColor?.trim() || null : null,
          items: { create: pricedItems },
          statusHistory: { create: { status: 'PAYMENT_PENDING', note: 'Order created and awaiting payment' } },
        },
        include: { items: true, branch: true, statusHistory: true },
      });
      await tx.outboxEvent.create({
        data: {
          orderId: order.id,
          eventType: 'ORDER_CREATED',
          payload: { orderId: order.id, orderNumber: order.orderNumber, status: order.status },
        },
      });
      return order;
    });
  }
}
