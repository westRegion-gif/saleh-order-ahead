import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const nonKitchenBranchCodes = ['AL-WATHBA-STATION', 'MUSSAFAH-STATION'];
const kitchenSkus = [
  'LABNEH-ZAATAR-TOAST',
  'JAM-PEANUT-BUTTER-NUTS',
  'AVOCADO-EGG-SOURDOUGH',
  'ACAI-BOWL',
  'COCONUT-PUDDING',
  'LATTE-PUDDING',
  'BANANA-PUDDING',
  'TIRAMISU',
];

async function main() {
  const branches = await prisma.branch.findMany({
    where: { code: { in: nonKitchenBranchCodes } },
    select: { id: true, code: true },
  });
  const products = await prisma.product.findMany({
    where: { sku: { in: kitchenSkus } },
    select: { id: true, sku: true },
  });

  for (const branch of branches) {
    for (const product of products) {
      await prisma.branchProduct.upsert({
        where: { branchId_productId: { branchId: branch.id, productId: product.id } },
        create: {
          branchId: branch.id,
          productId: product.id,
          isAvailable: false,
          soldOutReason: 'Kitchen not available at this branch',
        },
        update: {
          isAvailable: false,
          soldOutReason: 'Kitchen not available at this branch',
        },
      });
    }
  }

  const [branchCount, categoryCount, productCount, mediaCount, githubCount] = await Promise.all([
    prisma.branch.count(),
    prisma.category.count(),
    prisma.product.count(),
    prisma.product.count({ where: { imageUrl: { contains: '/v1/media/object/' } } }),
    prisma.product.count({ where: { imageUrl: { startsWith: 'https://raw.githubusercontent.com/' } } }),
  ]);
  const unavailableKitchenMappings = await prisma.branchProduct.count({
    where: {
      branch: { code: { in: nonKitchenBranchCodes } },
      product: { sku: { in: kitchenSkus } },
      isAvailable: false,
    },
  });

  console.log('BASELINE_FINAL', JSON.stringify({
    branches: branchCount,
    categories: categoryCount,
    products: productCount,
    mediaImages: mediaCount,
    githubImages: githubCount,
    unavailableKitchenMappings,
    expectedUnavailableKitchenMappings: nonKitchenBranchCodes.length * kitchenSkus.length,
  }));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
