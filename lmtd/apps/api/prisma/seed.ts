import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const branches = [
    { code: 'BR001', nameAr: 'LMTD - الفرع الرئيسي', nameEn: 'LMTD - Main Branch', prepTimeMin: 8, prepTimeMax: 15 },
    { code: 'BR002', nameAr: 'LMTD - الفرع الثاني', nameEn: 'LMTD - Branch 2', prepTimeMin: 10, prepTimeMax: 18 },
  ];

  for (const data of branches) {
    const branch = await prisma.branch.upsert({ where: { code: data.code }, update: data, create: data });
    for (let day = 0; day < 7; day += 1) {
      await prisma.branchHour.upsert({
        where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek: day } },
        update: { opensAt: '07:00', closesAt: '23:00', isClosed: false },
        create: { branchId: branch.id, dayOfWeek: day, opensAt: '07:00', closesAt: '23:00' },
      });
    }
  }

  const category = await prisma.category.findFirst({ where: { nameEn: 'Iced Coffee' } })
    ?? await prisma.category.create({ data: { nameAr: 'قهوة مثلجة', nameEn: 'Iced Coffee', sortOrder: 1 } });

  const product = await prisma.product.upsert({
    where: { sku: 'ICED-SPANISH-LATTE' },
    update: {},
    create: {
      sku: 'ICED-SPANISH-LATTE', categoryId: category.id, nameAr: 'سبانش لاتيه مثلج', nameEn: 'Iced Spanish Latte', basePrice: 24,
      modifierGroups: { create: [
        { nameAr: 'الحجم', nameEn: 'Size', selectionType: 'single', isRequired: true, minSelect: 1, maxSelect: 1, sortOrder: 1,
          modifiers: { create: [
            { nameAr: 'صغير', nameEn: 'Small', priceDelta: -4, sortOrder: 1 },
            { nameAr: 'وسط', nameEn: 'Medium', priceDelta: -2, sortOrder: 2 },
            { nameAr: 'كبير', nameEn: 'Large', priceDelta: 0, sortOrder: 3 },
          ] } },
        { nameAr: 'نوع الحليب', nameEn: 'Milk', selectionType: 'single', isRequired: true, minSelect: 1, maxSelect: 1, sortOrder: 2,
          modifiers: { create: [
            { nameAr: 'حليب عادي', nameEn: 'Regular Milk', priceDelta: 0, sortOrder: 1 },
            { nameAr: 'حليب شوفان', nameEn: 'Oat Milk', priceDelta: 2, sortOrder: 2 },
            { nameAr: 'حليب لوز', nameEn: 'Almond Milk', priceDelta: 2, sortOrder: 3 },
          ] } },
      ] },
    },
  });

  const allBranches = await prisma.branch.findMany();
  for (const branch of allBranches) {
    await prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId: branch.id, productId: product.id } },
      update: { isAvailable: true },
      create: { branchId: branch.id, productId: product.id, isAvailable: true },
    });
  }
}

main().finally(async () => prisma.$disconnect());
