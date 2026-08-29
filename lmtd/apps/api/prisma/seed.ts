import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const IMG = 'https://raw.githubusercontent.com/westRegion-gif/saleh-order-ahead/main/static/products/';

const categories = [
  { key: 'coffee', nameAr: 'قهوة ساخنة وباردة', nameEn: 'Coffee Hot/Cold', sortOrder: 1 },
  { key: 'smoothies', nameAr: 'سموذي وماتشا', nameEn: 'Smoothies & Matcha', sortOrder: 2 },
  { key: 'sourdough', nameAr: 'ساوردو', nameEn: 'Sourdough', sortOrder: 3 },
  { key: 'bowls', nameAr: 'أطباق صحية', nameEn: 'Healthy Bowls', sortOrder: 4 },
  { key: 'dessert', nameAr: 'حلويات', nameEn: 'Dessert', sortOrder: 5 },
  { key: 'juices', nameAr: 'عصائر طازجة', nameEn: 'Fresh Juices', sortOrder: 6 },
];

const products = [
  ['SPANISH-LATTE-COLD','سبانش لاتيه بارد','Spanish Latte Cold',30,'spanish-latte-cold.png','coffee','bar'],
  ['SPANISH-LATTE-HOT','سبانش لاتيه حار','Spanish Latte Hot',28,'spanish-latte-hot.png','coffee','bar'],
  ['CORTADO','كورتادو','Cortado',24,'cortado.png','coffee','bar'],
  ['ESPRESSO','إسبريسو','Espresso',20,'espresso.png','coffee','bar'],
  ['FLAT-WHITE','فلات وايت','Flat White',24,'flat-white.png','coffee','bar'],
  ['LATTE','لاتيه','Latte',25,'latte.png','coffee','bar'],
  ['LONG-BLACK','لونغ بلاك','Long Black',22,'long-black.png','coffee','bar'],
  ['MACCHIATO','ماكياتو','Macchiato',23,'macchiato.png','coffee','bar'],
  ['PICCOLO','بيكولو','Piccolo',23,'piccolo.png','coffee','bar'],
  ['V60','V60','V60',30,'v60.png','coffee','bar'],
  ['CLOUDY-MATCHA','كلاودي ماتشا','Cloudy Matcha',36,'cloudy-matcha.png','smoothies','bar'],
  ['ACAI-SMOOTHIE','أساي سموذي','Acai Smoothie',42,'acai-smoothie.png','smoothies','bar'],
  ['MATCHA','ماتشا','Matcha',32,'matcha.png','smoothies','bar'],
  ['LABNEH-ZAATAR-TOAST','لبنة وزعتر توست','Labneh & Zaatar Toast',28,'labneh-zaatar-toast.png','sourdough','kitchen'],
  ['JAM-PEANUT-BUTTER-NUTS','مربى مع زبدة الفول السوداني والمكسرات','Jam with Peanut Butter & Nuts',34,'jam-peanut-butter-nuts.png','sourdough','kitchen'],
  ['AVOCADO-EGG-SOURDOUGH','أفوكادو مع بيض ساوردو','Avocado with Egg Sourdough',36,'avocado-egg-sourdough.png','sourdough','kitchen'],
  ['ACAI-BOWL','أساي بول','Acai Bowl',42,'acai-bowl.png','bowls','kitchen'],
  ['COCONUT-PUDDING','بودينغ جوز الهند','Coconut Pudding',32,'coconut-pudding.png','dessert','kitchen'],
  ['LATTE-PUDDING','بودينغ لاتيه','Latte Pudding',32,'latte-pudding.png','dessert','kitchen'],
  ['BANANA-PUDDING','بودينغ موز','Banana Pudding',34,'banana-pudding.png','dessert','kitchen'],
  ['TIRAMISU','تيراميسو','Tiramisu',26,'tiramisu.png','dessert','kitchen'],
  ['FRESH-ORANGE-JUICE','عصير برتقال طازج','Fresh Orange Juice',20,'fresh-orange-juice.png','juices','bar'],
] as const;

const drinkGroups = [
  { nameAr:'التقديم', nameEn:'Serve', sortOrder:1, options:[['حار','Hot',0],['بارد','Iced',0]] },
  { nameAr:'الحجم', nameEn:'Size', sortOrder:2, options:[['عادي','Regular',0],['كبير','Large',4]] },
  { nameAr:'الحليب', nameEn:'Milk', sortOrder:3, options:[['حليب عادي','Regular Milk',0],['حليب شوفان','Oat Milk',3]] },
  { nameAr:'الحلاوة', nameEn:'Sweetness', sortOrder:4, options:[['بدون سكر','No Sugar',0],['عادي','Regular',0],['أقل حلاوة','Less Sweet',0]] },
  { nameAr:'حبوب القهوة', nameEn:'Coffee beans', sortOrder:5, options:[['House Blend','House Blend',0],['Decaf','Decaf',0]] },
] as const;

async function main() {
  const branches = [
    { code:'BR001', nameAr:'LMTD - الفرع الرئيسي', nameEn:'LMTD - Main Branch', prepTimeMin:8, prepTimeMax:15 },
    { code:'BR002', nameAr:'LMTD - الفرع الثاني', nameEn:'LMTD - Branch 2', prepTimeMin:10, prepTimeMax:18 },
  ];
  for (const data of branches) {
    const branch = await prisma.branch.upsert({ where:{code:data.code}, update:data, create:data });
    for (let day=0; day<7; day++) await prisma.branchHour.upsert({
      where:{branchId_dayOfWeek:{branchId:branch.id,dayOfWeek:day}},
      update:{opensAt:'07:00',closesAt:'23:00',isClosed:false},
      create:{branchId:branch.id,dayOfWeek:day,opensAt:'07:00',closesAt:'23:00'}
    });
  }

  const categoryIds:Record<string,string>={};
  for (const data of categories) {
    const existing = await prisma.category.findFirst({ where:{nameEn:data.nameEn} });
    const category = existing
      ? await prisma.category.update({where:{id:existing.id},data:{nameAr:data.nameAr,sortOrder:data.sortOrder,isActive:true}})
      : await prisma.category.create({data:{nameAr:data.nameAr,nameEn:data.nameEn,sortOrder:data.sortOrder,isActive:true}});
    categoryIds[data.key]=category.id;
  }

  const legacySeedCategories = ['Cold Coffee','Hot Coffee','Matcha','Specialty Coffee','Desserts'];
  await prisma.category.updateMany({ where:{nameEn:{in:legacySeedCategories}}, data:{isActive:false} });

  const allBranches = await prisma.branch.findMany({where:{isActive:true}});
  let sortOrder=1;
  for (const [sku,nameAr,nameEn,price,image,category,station] of products) {
    const product = await prisma.product.upsert({
      where:{sku},
      update:{categoryId:categoryIds[category],nameAr,nameEn,basePrice:price,imageUrl:IMG+image,sortOrder,isActive:true},
      create:{sku,categoryId:categoryIds[category],nameAr,nameEn,basePrice:price,imageUrl:IMG+image,sortOrder,isActive:true},
    });
    sortOrder++;

    for (const branch of allBranches) await prisma.branchProduct.upsert({
      where:{branchId_productId:{branchId:branch.id,productId:product.id}},
      update:{isAvailable:true}, create:{branchId:branch.id,productId:product.id,isAvailable:true}
    });

    if (station==='bar') {
      for (const groupData of drinkGroups) {
        let group = await prisma.modifierGroup.findFirst({where:{productId:product.id,nameEn:groupData.nameEn}});
        group = group
          ? await prisma.modifierGroup.update({where:{id:group.id},data:{nameAr:groupData.nameAr,selectionType:'single',isRequired:true,minSelect:1,maxSelect:1,sortOrder:groupData.sortOrder}})
          : await prisma.modifierGroup.create({data:{productId:product.id,nameAr:groupData.nameAr,nameEn:groupData.nameEn,selectionType:'single',isRequired:true,minSelect:1,maxSelect:1,sortOrder:groupData.sortOrder}});
        let optionOrder=1;
        for (const [optAr,optEn,delta] of groupData.options) {
          const existing = await prisma.modifier.findFirst({where:{modifierGroupId:group.id,nameEn:optEn}});
          const modifier = existing
            ? await prisma.modifier.update({where:{id:existing.id},data:{nameAr:optAr,priceDelta:delta,isActive:true,sortOrder:optionOrder}})
            : await prisma.modifier.create({data:{modifierGroupId:group.id,nameAr:optAr,nameEn:optEn,priceDelta:delta,isActive:true,sortOrder:optionOrder}});
          optionOrder++;
          for (const branch of allBranches) await prisma.branchModifier.upsert({
            where:{branchId_modifierId:{branchId:branch.id,modifierId:modifier.id}},
            update:{isAvailable:true},create:{branchId:branch.id,modifierId:modifier.id,isAvailable:true}
          });
        }
      }
    }
  }
}

main().catch((error)=>{console.error(error);process.exitCode=1}).finally(async()=>prisma.$disconnect());
