import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
db.user
  .create({
    data: {
      login: "testuser_500",
      passwordHash: "hash",
      referralCode: "code500",
    },
  })
  .then(console.log)
  .catch(console.error)
  .finally(() => db.$disconnect());
