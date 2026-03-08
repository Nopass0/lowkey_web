import { PrismaClient } from "@prisma/client";
import { getSbpClient } from "./src/payments/sbp";

const db = new PrismaClient();
const sbp = getSbpClient();

async function main() {
  const pId = "70367d53-ae0f-4dcb-9329-6720aa9bf133";
  const p = await db.payment.findUnique({ where: { id: pId } });
  if (!p) {
    console.log("Not found");
    return;
  }
  console.log("DB Payment:", p);
  try {
    const statusData = await sbp.getPaymentStatus(p.sbpPaymentId);
    console.log("SBP returned:", JSON.stringify(statusData, null, 2));
  } catch (e) {
    console.error("SBP error:", e);
  }
}

main().finally(() => db.$disconnect());
