import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBranchDto, CreateCategoryDto, CreateModifierDto, CreateModifierGroupDto, CreateProductDto, CreatePromotionDto,
  SetBranchModifierDto, SetBranchProductDto, UpdateBranchDto, UpdateCategoryDto, UpdateModifierDto, UpdateModifierGroupDto,
  UpdateProductDto, UpdatePromotionDto,
} from './admin-catalog.dto';

@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts() {
    return this.prisma.product.findMany({
      include: {
        category: true,
        branchProducts: { include: { branch: true } },
        modifierGroups: { include: { modifiers: { include: { branchModifiers: true }, orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createProduct(dto: CreateProductDto) {
    const branches = await this.prisma.branch.findMany({ where: { isActive: true }, select: { id: true } });
    return this.prisma.product.create({
      data: {
        sku: dto.sku, nameAr: dto.nameAr, nameEn: dto.nameEn, descriptionAr: dto.descriptionAr,
        descriptionEn: dto.descriptionEn, imageUrl: dto.imageUrl, basePrice: dto.basePrice,
        categoryId: dto.categoryId, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true,
        branchProducts: { create: branches.map((branch) => ({ branchId: branch.id, isAvailable: true })) },
      },
      include: { category: true, branchProducts: { include: { branch: true } } },
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.ensureProduct(id);
    return this.prisma.product.update({ where: { id }, data: dto, include: { category: true, branchProducts: { include: { branch: true } } } });
  }
  async deactivateProduct(id: string) { await this.ensureProduct(id); return this.prisma.product.update({ where: { id }, data: { isActive: false } }); }

  listCategories() {
    return this.prisma.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }
  createCategory(dto: CreateCategoryDto) { return this.prisma.category.create({ data: { ...dto, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true } }); }
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    if (!await this.prisma.category.findUnique({ where: { id } })) throw new NotFoundException('Category not found');
    return this.prisma.category.update({ where: { id }, data: dto });
  }
  async deactivateCategory(id: string) {
    if (!await this.prisma.category.findUnique({ where: { id } })) throw new NotFoundException('Category not found');
    return this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }

  listBranches() {
    return this.prisma.branch.findMany({ include: { hours: { orderBy: { dayOfWeek: 'asc' } }, _count: { select: { branchProducts: true } } }, orderBy: { nameAr: 'asc' } });
  }
  async createBranch(dto: CreateBranchDto) {
    const products = await this.prisma.product.findMany({ where: { isActive: true }, select: { id: true } });
    const modifiers = await this.prisma.modifier.findMany({ where: { isActive: true }, select: { id: true } });
    return this.prisma.branch.create({
      data: {
        ...dto, isActive: dto.isActive ?? true, acceptsOrders: dto.acceptsOrders ?? true,
        branchProducts: { create: products.map((p) => ({ productId: p.id, isAvailable: true })) },
        branchModifiers: { create: modifiers.map((m) => ({ modifierId: m.id, isAvailable: true })) },
      },
    });
  }
  async updateBranch(id: string, dto: UpdateBranchDto) {
    if (!await this.prisma.branch.findUnique({ where: { id } })) throw new NotFoundException('Branch not found');
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  async setBranchProduct(branchId: string, productId: string, dto: SetBranchProductDto) {
    await this.ensureProduct(productId);
    if (!await this.prisma.branch.findUnique({ where: { id: branchId } })) throw new NotFoundException('Branch not found');
    return this.prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId, productId } },
      create: { branchId, productId, isAvailable: dto.isAvailable, priceOverride: dto.priceOverride, soldOutReason: dto.soldOutReason },
      update: { isAvailable: dto.isAvailable, priceOverride: dto.priceOverride, soldOutReason: dto.soldOutReason },
    });
  }

  listModifierGroups() {
    return this.prisma.modifierGroup.findMany({ include: { product: { select: { id: true, nameAr: true, nameEn: true } }, modifiers: { include: { branchModifiers: true }, orderBy: { sortOrder: 'asc' } } }, orderBy: [{ product: { nameAr: 'asc' } }, { sortOrder: 'asc' }] });
  }
  async createModifierGroup(dto: CreateModifierGroupDto) {
    await this.ensureProduct(dto.productId);
    return this.prisma.modifierGroup.create({ data: { ...dto, selectionType: dto.selectionType ?? 'SINGLE', minSelect: dto.minSelect ?? 0, isRequired: dto.isRequired ?? false, isActive: dto.isActive ?? true } });
  }
  async updateModifierGroup(id: string, dto: UpdateModifierGroupDto) {
    if (!await this.prisma.modifierGroup.findUnique({ where: { id } })) throw new NotFoundException('Modifier group not found');
    return this.prisma.modifierGroup.update({ where: { id }, data: dto });
  }
  async deactivateModifierGroup(id: string) {
    if (!await this.prisma.modifierGroup.findUnique({ where: { id } })) throw new NotFoundException('Modifier group not found');
    return this.prisma.modifierGroup.update({ where: { id }, data: { isActive: false } });
  }
  async createModifier(dto: CreateModifierDto) {
    if (!await this.prisma.modifierGroup.findUnique({ where: { id: dto.modifierGroupId } })) throw new NotFoundException('Modifier group not found');
    const branches = await this.prisma.branch.findMany({ where: { isActive: true }, select: { id: true } });
    return this.prisma.modifier.create({ data: { ...dto, priceDelta: dto.priceDelta ?? 0, isActive: dto.isActive ?? true, branchModifiers: { create: branches.map((b) => ({ branchId: b.id, isAvailable: true })) } } });
  }
  async updateModifier(id: string, dto: UpdateModifierDto) {
    if (!await this.prisma.modifier.findUnique({ where: { id } })) throw new NotFoundException('Modifier not found');
    return this.prisma.modifier.update({ where: { id }, data: dto });
  }
  async deactivateModifier(id: string) {
    if (!await this.prisma.modifier.findUnique({ where: { id } })) throw new NotFoundException('Modifier not found');
    return this.prisma.modifier.update({ where: { id }, data: { isActive: false } });
  }
  async setBranchModifier(branchId: string, modifierId: string, dto: SetBranchModifierDto) {
    if (!await this.prisma.branch.findUnique({ where: { id: branchId } })) throw new NotFoundException('Branch not found');
    if (!await this.prisma.modifier.findUnique({ where: { id: modifierId } })) throw new NotFoundException('Modifier not found');
    return this.prisma.branchModifier.upsert({ where: { branchId_modifierId: { branchId, modifierId } }, create: { branchId, modifierId, ...dto }, update: dto });
  }

  listPromotions() { return this.prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } }); }
  createPromotion(dto: CreatePromotionDto) {
    return this.prisma.promotion.create({ data: { ...dto, value: dto.value, scope: dto.scope ?? 'ALL', branchIds: dto.branchIds ?? [], startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined, isActive: dto.isActive ?? true } });
  }
  async updatePromotion(id: string, dto: UpdatePromotionDto) {
    if (!await this.prisma.promotion.findUnique({ where: { id } })) throw new NotFoundException('Promotion not found');
    const data = { ...dto, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined };
    return this.prisma.promotion.update({ where: { id }, data });
  }
  async deactivatePromotion(id: string) {
    if (!await this.prisma.promotion.findUnique({ where: { id } })) throw new NotFoundException('Promotion not found');
    return this.prisma.promotion.update({ where: { id }, data: { isActive: false } });
  }

  listCustomers() {
    return this.prisma.customer.findMany({ include: { orders: { select: { id: true, total: true, createdAt: true, branch: { select: { id: true, nameAr: true, nameEn: true } } }, orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } });
  }
  listOrders() { return this.prisma.order.findMany({ include: { customer: true, branch: true, items: true }, orderBy: { createdAt: 'desc' }, take: 200 }); }

  async report(from?: string, to?: string, branchId?: string) {
    const where: { createdAt?: { gte?: Date; lte?: Date }; branchId?: string } = {};
    if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
    if (branchId) where.branchId = branchId;
    const orders = await this.prisma.order.findMany({ where, include: { items: true, branch: true }, orderBy: { createdAt: 'desc' } });
    const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
    const cancelled = orders.filter((o) => ['CANCELLED', 'REJECTED', 'REFUNDED'].includes(o.status)).length;
    const productMap = new Map<string, { name: string; qty: number; sales: number }>();
    for (const o of orders) for (const i of o.items) {
      const k = i.productId ?? i.productName; const prev = productMap.get(k) ?? { name: i.productName, qty: 0, sales: 0 };
      prev.qty += i.quantity; prev.sales += Number(i.lineTotal); productMap.set(k, prev);
    }
    return { totalSales, orders: orders.length, averageOrderValue: orders.length ? totalSales / orders.length : 0, cancelled, topProducts: [...productMap.values()].sort((a,b)=>b.qty-a.qty).slice(0,10), recentOrders: orders.slice(0,50) };
  }

  listSettings() { return this.prisma.appSetting.findMany({ orderBy: { key: 'asc' } }); }
  setSetting(key: string, value: string) { return this.prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } }); }

  private async ensureProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
