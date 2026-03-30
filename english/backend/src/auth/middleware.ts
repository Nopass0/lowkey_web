import { db } from "../db";

export async function getUserFromToken(token: string | undefined): Promise<any | null> {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    if (!payload?.userId) return null;
    const user = await db.findOne("EnglishUsers", [db.filter.eq("id", payload.userId)]);
    return user;
  } catch {
    return null;
  }
}

export function authGuard(user: any) {
  if (!user) throw new Error("Unauthorized");
  return user;
}

export function adminGuard(user: any) {
  if (!user) throw new Error("Unauthorized");
  if (user.role !== "admin") throw new Error("Forbidden");
  return user;
}

export function premiumGuard(user: any) {
  if (!user) throw new Error("Unauthorized");
  if (!user.isPremium && user.role !== "admin") throw new Error("Premium required");
  return user;
}
