import { db } from "./db";

async function test() {
  try {
    const user = await db.user.findFirst();
    if (!user) return;
    const device =
      (await db.device.findFirst({ where: { userId: user.id } })) ||
      (await db.device.create({
        data: {
          userId: user.id,
          name: "Test",
          os: "OS",
          version: "1",
          lastIp: "127.0.0.1",
        },
      }));

    console.log("Trying simple CREATE...");
    const token = await db.vpnToken.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        deviceId: device.id,
        token: "test-" + Date.now(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    console.log("CREATE SUCCESS:", token.id);
  } catch (err: any) {
    console.log("CREATE FAILED!");
    console.log("Message:", err.message);
  } finally {
    process.exit(0);
  }
}
test();
