import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const servers = await db.vpnServer.findMany();
  console.log(JSON.stringify(servers, null, 2));
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
