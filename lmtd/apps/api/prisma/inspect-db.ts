import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [products, categories, branches] = await Promise.all([
    prisma.product.findMany({
      select: {
        sku: true,
        nameEn: true,
        imageUrl: true,
        isActive: true,
        basePrice: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.category.findMany({
      select: { nameEn: true, isActive: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.branch.findMany({
      select: { nameEn: true, isActive: true, acceptsOrders: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  console.log('INSPECT_COUNTS', JSON.stringify({
    products: products.length,
    categories: categories.length,
    branches: branches.length,
    productsWithImages: products.filter((p) => Boolean(p.imageUrl)).length,
    githubImages: products.filter((p) => p.imageUrl?.startsWith('https://raw.githubusercontent.com/')).length,
    railwayMediaImages: products.filter((p) => p.imageUrl?.includes('/v1/media/object/')).length,
  }));
  console.log('INSPECT_PRODUCTS', JSON.stringify(products));
  console.log('INSPECT_CATEGORIES', JSON.stringify(categories));
  console.log('INSPECT_BRANCHES', JSON.stringify(branches));
}

main()
  .catch((error) => {
    console.error('INSPECT_ERROR', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
