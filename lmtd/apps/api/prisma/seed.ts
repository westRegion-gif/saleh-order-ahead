import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const IMG = 'https://raw.githubusercontent.com/westRegion-gif/saleh-order-ahead/main/static/products/';

const categories = [
  { key: 'cold', nameAr: 'قهوة باردة', nameEn: 'Cold Coffee', sortOrder: 1 },
  { key: 'hot', nameAr: 'قهوة ساخنة', nameEn: 'Hot Coffee', sortOrder: 2 },
  { key: 'matcha', nameAr: 'ماتشا', nameEn: 'Matcha', sortOrder: 3 },
  { key: 'specialty', nameAr: 'قهوة مختصة', nameEn: 'Specialty Coffee', sortOrder: 4 },
  { key: 'desserts', nameAr: 'حلويات', nameEn: 'Desserts', sortOrder: 5 },
];

const products = [
  { sku: 'SPANISH-LATTE-COLD', nameAr: 'سبانش لاتيه بارد', nameEn: 'Spanish Latte Cold', price: 24, image: 'spanish-latte-cold.png', category: 'cold', sortOrder: 1 },
  { sku: 'LATTE', nameAr: 'لاتيه', nameEn: 'Latte', price: 22, image: 'latte.png', category: 'hot', sortOrder: 2 },
  { sku: 'MATCHA', nameAr: 'ماتشا', nameEn: 'Matcha', price: 25, image: 'matcha.png', category: 'matcha', sortOrder: 3 },
  { sku: 'V60', nameAr: 'V60', nameEn: 'V60', price: 24, image: 'v60.png', category: 'specialty', sortOrder: 4 },
  { sku: 'FLAT-WHITE', nameAr: 'فلات وايت', nameEn: 'Flat White', price: 23, image: 'flat-white.png', category: 'hot', sortOrder: 5 },
  { sku: 'CORTADO', nameAr: 'كورتادو', nameEn: 'Cortado', price: 21, image: 'cortado.png', category: 'hot', sortOrder: 6 },
];

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

  const categoryIds: Record<string, string> = {};
  for (const data of categories) {
    const existing = await prisma.category.findFirst({ where: { nameAr: data.nameAr } });
    const category = existing
      ? await prisma.category.update({ where: { id: existing.id }, data: { nameEn: data.nameEn, sortOrder: data.sortOrder, isActive: true } })
      : await prisma.category.create({ data: { nameAr: data.nameAr, nameEn: data.nameEn, sortOrder: data.sortOrder, isActive: true } });
    categoryIds[data.key] = category.id;
  }

  const allBranches = await prisma.branch.findMany({ where: { isActive: true } });
  for (const item of products) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        categoryId: categoryIds[item.category], nameAr: item.nameAr, nameEn: item.nameEn,
        basePrice: item.price, imageUrl: IMG + item.image, sortOrder: item.sortOrder, isActive: true,
      },
      create: {
        sku: item.sku, categoryId: categoryIds[item.category], nameAr: item.nameAr, nameEn: item.nameEn,
        basePrice: item.price, imageUrl: IMG + item.image, sortOrder: item.sortOrder, isActive: true,
      },
    });
    for (const branch of allBranches) {
      await prisma.branchProduct.upsert({
        where: { branchId_productId: { branchId: branch.id, productId: product.id } },
        update: { isAvailable: true },
        create: { branchId: branch.id, productId: product.id, isAvailable: true },
      });
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
