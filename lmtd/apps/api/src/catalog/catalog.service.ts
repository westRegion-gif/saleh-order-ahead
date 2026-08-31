import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async menu(branchId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) throw new NotFoundException('Branch not found');

    const rows = await this.prisma.branchProduct.findMany({
      where: { branchId, product: { isActive: true, category: { isActive: true } } },
      include: {
        product: {
          include: {
            category: true,
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: { modifiers: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { branchModifiers: { where: { branchId } } } } },
            },
          },
        },
      },
      orderBy: { product: { sortOrder: 'asc' } },
    });

    const products = rows.map((row) => ({
      id: row.product.id,
      sku: row.product.sku,
      category: row.product.category,
      nameAr: row.product.nameAr,
      nameEn: row.product.nameEn,
      descriptionAr: row.product.descriptionAr,
      descriptionEn: row.product.descriptionEn,
      imageUrl: row.product.imageUrl,
      price: Number(row.priceOverride ?? row.product.basePrice),
      isAvailable: row.isAvailable,
      soldOutReason: row.soldOutReason,
      modifierGroups: row.product.modifierGroups.map((group) => ({
        id: group.id,
        nameAr: group.nameAr,
        nameEn: group.nameEn,
        selectionType: group.selectionType,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        isRequired: group.isRequired,
        options: group.modifiers.map((modifier) => {
          const override = modifier.branchModifiers[0];
          return {
            id: modifier.id,
            nameAr: modifier.nameAr,
            nameEn: modifier.nameEn,
            priceDelta: Number(override?.priceDeltaOverride ?? modifier.priceDelta),
            isAvailable: override?.isAvailable ?? true,
          };
        }),
      })),
    }));

    return { branch: { id: branch.id, code: branch.code, nameAr: branch.nameAr, nameEn: branch.nameEn }, products };
  }
}
