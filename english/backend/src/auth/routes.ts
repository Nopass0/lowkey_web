import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { config } from "../config";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))
  .post(
    "/register",
    async ({ body, jwt, set }) => {
      const { email, password, name } = body;
      const existing = await db.findOne("EnglishUsers", [db.filter.eq("email", email.toLowerCase())]);
      if (existing) {
        set.status = 400;
        return { error: "Email already registered" };
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await db.create("EnglishUsers", {
        email: email.toLowerCase(),
        passwordHash,
        name,
        role: "user",
        isPremium: false,
        dailyGoal: 20,
        studyStreak: 0,
        xp: 0,
        notificationsEnabled: true,
        notificationTime: "09:00",
        nativeLanguage: "ru",
        level: "beginner",
        timezone: "Europe/Moscow",
      });
      // Create default deck
      await db.create("EnglishDecks", {
        userId: user.id,
        name: "Мои слова",
        description: "Первые слова для изучения",
        emoji: "⭐",
        color: "#6366f1",
        category: "general",
        cardCount: 0,
      });
      const token = await jwt.sign({ userId: user.id });
      const { passwordHash: _, ...safeUser } = user;
      return { token, user: safeUser };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        name: t.String({ minLength: 2 }),
      }),
    }
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const { email, password } = body;
      const user = await db.findOne("EnglishUsers", [db.filter.eq("email", email.toLowerCase())]);
      if (!user) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }
      const token = await jwt.sign({ userId: user.id });
      const { passwordHash: _, ...safeUser } = user;
      return { token, user: safeUser };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    }
  )
  .get("/me", async ({ headers, jwt, set }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    if (!token) { set.status = 401; return { error: "Unauthorized" }; }
    const payload = await jwt.verify(token);
    if (!payload) { set.status = 401; return { error: "Invalid token" }; }
    const user = await db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
    if (!user) { set.status = 404; return { error: "User not found" }; }
    const { passwordHash: _, ...safeUser } = user;
    // Check premium expiry
    if (user.isPremium && user.premiumUntil && new Date(user.premiumUntil) < new Date()) {
      await db.update("EnglishUsers", user.id, { isPremium: false });
      safeUser.isPremium = false;
    }
    return safeUser;
  })
  .patch(
    "/me",
    async ({ headers, body, jwt, set }) => {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) { set.status = 401; return { error: "Unauthorized" }; }
      const payload = await jwt.verify(token);
      if (!payload) { set.status = 401; return { error: "Invalid token" }; }
      const updated = await db.update("EnglishUsers", (payload as any).userId, body);
      const { passwordHash: _, ...safeUser } = updated;
      return safeUser;
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        dailyGoal: t.Optional(t.Number()),
        notificationsEnabled: t.Optional(t.Boolean()),
        notificationTime: t.Optional(t.String()),
        timezone: t.Optional(t.String()),
        level: t.Optional(t.String()),
        nativeLanguage: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/change-password",
    async ({ headers, body, jwt, set }) => {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) { set.status = 401; return { error: "Unauthorized" }; }
      const payload = await jwt.verify(token);
      if (!payload) { set.status = 401; return { error: "Invalid token" }; }
      const user = await db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
      if (!user) { set.status = 404; return { error: "Not found" }; }
      const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!valid) { set.status = 400; return { error: "Wrong current password" }; }
      const passwordHash = await bcrypt.hash(body.newPassword, 10);
      await db.update("EnglishUsers", user.id, { passwordHash });
      return { success: true };
    },
    {
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String({ minLength: 6 }),
      }),
    }
  )
  .post(
    "/avatar",
    async ({ headers, jwt, set, request }) => {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) { set.status = 401; return { error: "Unauthorized" }; }
      const payload = await jwt.verify(token);
      if (!payload) { set.status = 401; return { error: "Invalid token" }; }
      const userId = (payload as any).userId;

      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) { set.status = 400; return { error: "No file" }; }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const allowed = ["jpg", "jpeg", "png", "webp", "gif"];
      if (!allowed.includes(ext)) { set.status = 400; return { error: "Invalid file type" }; }
      if (file.size > 5 * 1024 * 1024) { set.status = 400; return { error: "File too large (max 5MB)" }; }

      const dir = "./uploads/avatars";
      const { mkdir } = await import("node:fs/promises");
      await mkdir(dir, { recursive: true });

      const filename = `${userId}.${ext}`;
      const buf = await file.arrayBuffer();
      await Bun.write(`${dir}/${filename}`, buf);

      const avatarUrl = `/uploads/avatars/${filename}`;
      const updated = await db.update("EnglishUsers", userId, { avatarUrl });
      const { passwordHash: _, ...safeUser } = updated;
      return safeUser;
    }
  )
  .post(
    "/link-telegram",
    async ({ headers, body, jwt, set }) => {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) { set.status = 401; return { error: "Unauthorized" }; }
      const payload = await jwt.verify(token);
      if (!payload) { set.status = 401; return { error: "Invalid token" }; }
      const userId = (payload as any).userId;
      const { telegramId, telegramUsername, firstName } = body;
      await db.upsert(
        "EnglishTelegramLinks",
        [db.filter.eq("userId", userId)],
        { userId, telegramId, telegramUsername, firstName, isActive: true }
      );
      await db.update("EnglishUsers", userId, { telegramId, telegramUsername });
      return { success: true };
    },
    {
      body: t.Object({
        telegramId: t.String(),
        telegramUsername: t.Optional(t.String()),
        firstName: t.Optional(t.String()),
      }),
    }
  );
