import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLANS = [
  {
    slug: "starter",
    name: "Начальный",
    features: ["1 устройство", "Базовая скорость", "Доступ к 5 локациям"],
    isPopular: false,
    sortOrder: 1,
    prices: {
      monthly: 149,
      "3months": 129,
      "6months": 99,
      yearly: 79,
    },
  },
  {
    slug: "pro",
    name: "Продвинутый",
    features: [
      "3 устройства",
      "Высокая скорость",
      "Доступ ко всем локациям",
      "Kill Switch",
    ],
    isPopular: true,
    sortOrder: 2,
    prices: {
      monthly: 299,
      "3months": 249,
      "6months": 199,
      yearly: 149,
    },
  },
  {
    slug: "advanced",
    name: "Максимальный",
    features: [
      "5 устройств",
      "Максимальная скорость",
      "Доступ ко всем локациям",
      "Kill Switch",
      "Выделенный IP",
      "Приоритетная поддержка",
    ],
    isPopular: false,
    sortOrder: 3,
    prices: {
      monthly: 499,
      "3months": 399,
      "6months": 349,
      yearly: 249,
    },
  },
];

async function main() {
  console.log("Seed started...");

  for (const p of PLANS) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        features: p.features,
        isPopular: p.isPopular,
        sortOrder: p.sortOrder,
        isActive: true,
      },
      create: {
        slug: p.slug,
        name: p.name,
        features: p.features,
        isPopular: p.isPopular,
        sortOrder: p.sortOrder,
        isActive: true,
      },
    });

    console.log(`Plan ${plan.slug} updated/created.`);

    for (const [period, price] of Object.entries(p.prices)) {
      await prisma.subscriptionPrice.upsert({
        where: {
          planId_period: {
            planId: plan.id,
            period: period,
          },
        },
        update: { price },
        create: {
          planId: plan.id,
          period: period,
          price: price,
        },
      });
    }
    console.log(`Prices for ${plan.slug} updated.`);
  }

  console.log("Seed finished successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
