import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const branches = [
  { code: 'MARSA-AL-BATEEN', nameAr: 'مرسى البطين', nameEn: 'Marsa Al Bateen', prepTimeMin: 10 },
  { code: 'SSMC-STATION', nameAr: 'محطة SSMC', nameEn: 'SSMC Station', prepTimeMin: 10 },
  { code: 'SAADIYAT-ROTANA', nameAr: 'سعديات روتانا', nameEn: 'Saadiyat Rotana', prepTimeMin: 12 },
  { code: 'AL-WATHBA-STATION', nameAr: 'محطة الوثبة', nameEn: 'Al Wathba Station', prepTimeMin: 10 },
  { code: 'MUSSAFAH-STATION', nameAr: 'محطة مصفح', nameEn: 'Mussafah Station', prepTimeMin: 12 },
] as const;

async function main() {
  const count = await prisma.branch.count();
  if (count > 0) {
    console.log(`Baseline branch bootstrap skipped: ${count} branch(es) already exist.`);
    return;
  }

  for (const branch of branches) {
    await prisma.branch.create({
      data: {
        ...branch,
        timezone: 'Asia/Dubai',
        prepTimeMax: branch.prepTimeMin + 10,
        isActive: true,
        acceptsOrders: true,
      },
    });
  }

  console.log(`Baseline branch bootstrap complete. ${branches.length} branches created.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
