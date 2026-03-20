import { config } from "./config";

interface TelegramMessageParams {
  botToken?: string;
  chatId: string | number;
  text: string;
  buttonText?: string | null;
  buttonUrl?: string | null;
  callbackData?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildTelegramPostText(input: {
  title?: string | null;
  message: string;
}): string {
  const title = input.title?.trim();
  const message = input.message.trim();

  if (!title) {
    return escapeHtml(message);
  }

  return `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}`;
}

export async function sendTelegramMessage(
  params: TelegramMessageParams,
): Promise<void>;
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
): Promise<void>;
export async function sendTelegramMessage(
  input: TelegramMessageParams | string | number,
  textArg?: string,
): Promise<void> {
  const params: TelegramMessageParams =
    typeof input === "object"
      ? input
      : {
          botToken: config.TELEGRAM_BOT_TOKEN,
          chatId: input,
          text: textArg ?? "",
        };

  const {
    botToken = config.TELEGRAM_MAILING_BOT_TOKEN,
    chatId,
    text,
    buttonText,
    buttonUrl,
    callbackData,
  } = params;

  if (!botToken) {
    throw new Error("Telegram bot token is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup:
          buttonText && (buttonUrl || callbackData)
            ? {
                inline_keyboard: [[
                  buttonUrl
                    ? { text: buttonText, url: buttonUrl }
                    : { text: buttonText, callback_data: callbackData },
                ]],
              }
            : undefined,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Telegram API error: ${response.status} ${await response.text()}`,
    );
  }
}
