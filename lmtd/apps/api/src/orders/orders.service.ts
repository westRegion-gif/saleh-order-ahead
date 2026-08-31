import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  listForCustomer(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { items: true, branch: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getForCustomer(id: string, customerId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, customerId },
      include: { items: true, branch: true, statusHistory: { orderBy: { createdAt: 'asc' } }, payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async findExisting(idempotencyKey: string, customerId: string) {
    return this.prisma.order.findFirst({
      where: { idempotencyKey, customerId },
      include: { items: true, branch: true, statusHistory: true },
    });
  }

  private async taxRatePercent() {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'tax_rate_percent' } });
    const value = Number(setting?.value ?? 0);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;
  }

  async create(dto: CreateOrderDto, customerId: string) {
    const existing = await this.findExisting(dto.idempotencyKey, customerId);
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

      const selectedIds = requested.modifiers.map((modifier) => modifier.modifierId);
      if (new Set(selectedIds).size !== selectedIds.length) throw new BadRequestException('Duplicate modifier selection');
      const snapshots: Array<{ groupId: string; groupName: string; modifierId: string; modifierName: string; priceDelta: number }> = [];
      let modifierTotal = 0;

      for (const group of row.product.modifierGroups) {
        const groupSelected = group.modifiers.filter((modifier) => selectedIds.includes(modifier.id));
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

      const validModifierIds = row.product.modifierGroups.flatMap((group) => group.modifiers.map((modifier) => modifier.id));
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

    const subtotal = Math.round(pricedItems.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    const discountTotal = 0;
    const taxRate = await this.taxRatePercent();
    const taxable = Math.max(0, subtotal - discountTotal);
    const taxTotal = Math.round(taxable * taxRate) / 100;
    const total = Math.round((taxable + taxTotal) * 100) / 100;
    const orderNumber = `LMTD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.orderIdempotency.create({ data: { key: dto.idempotencyKey } });

        const order = await tx.order.create({
          data: {
            orderNumber,
            idempotencyKey: dto.idempotencyKey,
            customerId,
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

        await tx.orderIdempotency.update({ where: { key: dto.idempotencyKey }, data: { orderId: order.id } });
        await tx.outboxEvent.create({
          data: {
            orderId: order.id,
            eventType: 'ORDER_CREATED',
            payload: { orderId: order.id, orderNumber: order.orderNumber, customerId, status: order.status, taxRatePercent: taxRate },
          },
        });
        return order;
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
      if (code === 'P2002') {
        const duplicate = await this.findExisting(dto.idempotencyKey, customerId);
        if (duplicate) return duplicate;
        throw new BadRequestException('Checkout idempotency key conflict');
      }
      throw error;
    }
  }
}
