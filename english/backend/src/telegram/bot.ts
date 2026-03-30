import { Bot, InlineKeyboard } from "grammy";
import { db } from "../db";
import { config } from "../config";

let bot: Bot | null = null;

export function getBot(): Bot | null {
  return bot;
}

export async function initBot() {
  if (!config.telegram.botToken) {
    console.log("[Telegram] No bot token configured, skipping");
    return;
  }

  bot = new Bot(config.telegram.botToken);

  bot.command("start", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    const firstName = ctx.from?.first_name || "друг";
    const username = ctx.from?.username;

    // Check if already linked
    const link = await db.findOne("EnglishTelegramLinks", [db.filter.eq("telegramId", telegramId)]);

    if (link) {
      const user = await db.findOne("EnglishUsers", [db.filter.eq("id", link.userId)]);
      if (user) {
        await ctx.reply(
          `👋 С возвращением, ${user.name}!\n\n` +
          `📊 Твоя статистика:\n` +
          `🔥 Серия: ${user.studyStreak || 0} дней\n` +
          `⭐ XP: ${user.xp || 0}\n\n` +
          `Открой приложение для продолжения обучения: ${config.frontendUrl}`,
          { reply_markup: new InlineKeyboard().url("Открыть LowKey English", config.frontendUrl) }
        );
        return;
      }
    }

    // Start linking flow — user needs to get link token from website
    await ctx.reply(
      `🇬🇧 Привет, ${firstName}! Добро пожаловать в LowKey English!\n\n` +
      `Для подключения уведомлений:\n` +
      `1️⃣ Войди в приложение: ${config.frontendUrl}\n` +
      `2️⃣ Перейди в Настройки → Telegram\n` +
      `3️⃣ Нажми "Подключить Telegram"\n\n` +
      `Или отправь /link <твой_код> если у тебя уже есть код.`,
      { reply_markup: new InlineKeyboard().url("Открыть приложение", config.frontendUrl) }
    );
  });

  bot.command("link", async (ctx) => {
    const parts = ctx.message?.text?.split(" ");
    if (!parts || parts.length < 2) {
      await ctx.reply("Использование: /link <код>\n\nКод можно получить в настройках приложения.");
      return;
    }
    const code = parts[1];
    const telegramId = String(ctx.from?.id);

    // Look for pending link by code (stored as telegramId temporarily)
    const pendingLink = await db.findOne("EnglishTelegramLinks", [db.filter.eq("telegramId", code)]);
    if (!pendingLink) {
      await ctx.reply("❌ Неверный или устаревший код. Попробуй снова.");
      return;
    }

    await db.update("EnglishTelegramLinks", pendingLink.id, {
      telegramId,
      telegramUsername: ctx.from?.username,
      firstName: ctx.from?.first_name,
      isActive: true,
    });
    await db.update("EnglishUsers", pendingLink.userId, {
      telegramId,
      telegramUsername: ctx.from?.username,
    });

    await ctx.reply(
      "✅ Telegram успешно подключён!\n\n" +
      "Теперь ты будешь получать ежедневные напоминания об изучении английского. 🎉"
    );
  });

  bot.command("stats", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    const link = await db.findOne("EnglishTelegramLinks", [db.filter.eq("telegramId", telegramId)]);
    if (!link) { await ctx.reply("Сначала подключи аккаунт с помощью /start"); return; }

    const user = await db.findOne("EnglishUsers", [db.filter.eq("id", link.userId)]);
    if (!user) { await ctx.reply("Аккаунт не найден"); return; }

    const today = new Date().toISOString().split("T")[0];
    const progress = await db.findOne("EnglishProgress", [
      db.filter.eq("userId", user.id),
      db.filter.eq("date", today),
    ]);

    const totalCards = await db.count("EnglishCards", [db.filter.eq("userId", user.id)]);

    await ctx.reply(
      `📊 *Твоя статистика*\n\n` +
      `👤 ${user.name}\n` +
      `🔥 Серия: ${user.studyStreak || 0} дней\n` +
      `⭐ XP: ${user.xp || 0}\n` +
      `📚 Карточек в коллекции: ${totalCards}\n\n` +
      `📅 *Сегодня:*\n` +
      `✅ Повторено: ${progress?.cardsStudied || 0} карточек\n` +
      `⏱ Время занятий: ${progress?.minutesStudied || 0} мин\n` +
      `💫 Получено XP: ${progress?.xpEarned || 0}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("review", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    const link = await db.findOne("EnglishTelegramLinks", [db.filter.eq("telegramId", telegramId)]);
    if (!link) { await ctx.reply("Сначала подключи аккаунт с помощью /start"); return; }

    await ctx.reply(
      "📖 Время повторить карточки!\n\nОткрой приложение для начала занятия:",
      { reply_markup: new InlineKeyboard().url("Повторить сейчас", `${config.frontendUrl}/study`) }
    );
  });

  bot.command("stop", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    const link = await db.findOne("EnglishTelegramLinks", [db.filter.eq("telegramId", telegramId)]);
    if (link) {
      await db.update("EnglishTelegramLinks", link.id, { isActive: false });
    }
    await ctx.reply("🔕 Уведомления отключены. Для повторного подключения используй /start");
  });

  bot.on("message", async (ctx) => {
    await ctx.reply(
      "Используй команды:\n" +
      "/start — начало\n" +
      "/stats — статистика\n" +
      "/review — повторить карточки\n" +
      "/stop — отключить уведомления"
    );
  });

  if (config.telegram.webhookUrl) {
    await bot.api.setWebhook(`${config.telegram.webhookUrl}/telegram/webhook`);
    console.log("[Telegram] Webhook set");
  } else {
    bot.start();
    console.log("[Telegram] Bot started in polling mode");
  }

  console.log("[Telegram] Bot initialized");
}

export async function sendDailyReminders() {
  if (!bot) return;

  const activeLinks = await db.findMany("EnglishTelegramLinks", {
    filters: [db.filter.eq("isActive", true)],
    limit: 1000,
  });

  const today = new Date().toISOString().split("T")[0];

  for (const link of activeLinks) {
    try {
      const user = await db.findOne("EnglishUsers", [db.filter.eq("id", link.userId)]);
      if (!user || !user.notificationsEnabled) continue;

      // Check if already reminded today
      const alreadyReminded = await db.findOne("EnglishDailyReminders", [
        db.filter.eq("userId", user.id),
        db.filter.eq("type", "daily_review"),
      ]);
      // Simple date check
      if (alreadyReminded) {
        const reminderDate = new Date(alreadyReminded.sentAt).toISOString().split("T")[0];
        if (reminderDate === today) continue;
      }

      // Count due cards
      const allCards = await db.findMany("EnglishCards", {
        filters: [db.filter.eq("userId", user.id)],
        limit: 500,
      });
      const now = new Date();
      const dueCards = allCards.filter((c: any) =>
        !c.nextReview || new Date(c.nextReview) <= now || c.status === "new"
      );

      if (dueCards.length === 0) continue;

      const progress = await db.findOne("EnglishProgress", [
        db.filter.eq("userId", user.id),
        db.filter.eq("date", today),
      ]);

      if (progress && (progress.cardsStudied || 0) >= (user.dailyGoal || 20)) continue;

      const streakText = user.studyStreak > 0
        ? `🔥 Серия: ${user.studyStreak} ${getStreakWord(user.studyStreak)} — не прерывай!\n`
        : "";

      await bot.api.sendMessage(
        link.telegramId,
        `🇬🇧 *Время учить английский!*\n\n` +
        `${streakText}` +
        `📚 Карточек для повторения: *${dueCards.length}*\n` +
        `✅ Сегодня уже повторено: ${progress?.cardsStudied || 0}\n\n` +
        `Уделяй хотя бы 10 минут в день — и через месяц ты удивишься своему прогрессу! 💪`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .url("📖 Повторить сейчас", `${config.frontendUrl}/study`)
            .row()
            .url("🎮 Сыграть в ассоциации", `${config.frontendUrl}/games`),
        }
      );

      await db.create("EnglishDailyReminders", {
        userId: user.id,
        telegramId: link.telegramId,
        type: "daily_review",
        cardsToReview: dueCards.length,
      });
    } catch (e) {
      console.error(`[Telegram] Failed to send reminder to ${link.telegramId}:`, e);
    }
  }
}

function getStreakWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "день";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "дня";
  return "дней";
}
