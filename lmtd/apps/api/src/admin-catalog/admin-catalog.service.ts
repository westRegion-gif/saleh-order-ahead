import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, CreateProductDto, SetBranchProductDto, UpdateCategoryDto, UpdateProductDto } from './admin-catalog.dto';

@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts() {
    return this.prisma.product.findMany({
      include: { category: true, branchProducts: { include: { branch: true } }, modifierGroups: { include: { modifiers: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createProduct(dto: CreateProductDto) {
    const branches = await this.prisma.branch.findMany({ where: { isActive: true }, select: { id: true } });
    return this.prisma.product.create({
      data: {
        sku: dto.sku,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        descriptionAr: dto.descriptionAr,
        descriptionEn: dto.descriptionEn,
        imageUrl: dto.imageUrl,
        basePrice: dto.basePrice,
        categoryId: dto.categoryId,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        branchProducts: { create: branches.map((branch) => ({ branchId: branch.id, isAvailable: true })) },
      },
      include: { category: true, branchProducts: { include: { branch: true } } },
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.ensureProduct(id);
    return this.prisma.product.update({ where: { id }, data: dto, include: { category: true, branchProducts: { include: { branch: true } } } });
  }

  async deactivateProduct(id: string) {
    await this.ensureProduct(id);
    return this.prisma.product.update({ where: { id }, data: { isActive: false } });
  }

  listCategories() {
    return this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }] });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { ...dto, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true } });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  listBranches() {
    return this.prisma.branch.findMany({ orderBy: { nameAr: 'asc' } });
  }

  async setBranchProduct(branchId: string, productId: string, dto: SetBranchProductDto) {
    await this.ensureProduct(productId);
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    return this.prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId, productId } },
      create: { branchId, productId, isAvailable: dto.isAvailable, priceOverride: dto.priceOverride, soldOutReason: dto.soldOutReason },
      update: { isAvailable: dto.isAvailable, priceOverride: dto.priceOverride, soldOutReason: dto.soldOutReason },
    });
  }

  private async ensureProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
