import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const servers = await db.vpnServer.findMany({
    where: {
      connectLinkTemplate: {
        contains: "vless://",
      },
    },
  });

  console.log(`Found ${servers.length} VLESS servers.`);

  for (const server of servers) {
    if (
      server.connectLinkTemplate &&
      !server.connectLinkTemplate.includes("type=")
    ) {
      // Split by # to preserve the fragment/tag at the end
      const [baseUrl, tag] = server.connectLinkTemplate.split("#");

      // Check if it already has parameters
      const separator = baseUrl.includes("?") ? "&" : "?";
      const newTemplate = `${baseUrl}${separator}type=tcp${tag ? "#" + tag : ""}`;

      await db.vpnServer.update({
        where: { id: server.id },
        data: { connectLinkTemplate: newTemplate },
      });

      console.log(`Updated server ${server.ip}:${server.port}`);
      console.log(`New template: ${newTemplate}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
