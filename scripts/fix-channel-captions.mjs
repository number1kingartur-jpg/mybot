/**
 * Восстановить подписи к постам канала.
 * node scripts/fix-channel-captions.mjs 8 9
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const ids = process.argv.slice(2).map((x) => parseInt(x, 10)).filter(Boolean);

const corpusPath = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "kingmode-channel-corpus.json");
const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
const byId = new Map(corpus.map((x) => [x.channelMsgId, x.text]));

const siteUrl = (process.env.KINGMODE_SITE_URL || "https://arturkingfitness.com").replace(/\/$/, "");
const dmUser = (process.env.KINGMODE_DM_USERNAME || "arturking10").replace(/^@/, "");
const botUser = (process.env.BOT_USERNAME || "Raschettbot").replace(/^@/, "");

const keyboard = {
  inline_keyboard: [
    [
      { text: "Сайт", url: siteUrl },
      { text: "Личка", url: `https://t.me/${dmUser}` },
      { text: "Бот", url: `https://t.me/${botUser}?start=kingmode` },
    ],
  ],
};

const api = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

for (const messageId of ids) {
  const caption = byId.get(messageId);
  if (!caption) {
    console.log(`#${messageId}: no text in corpus`);
    continue;
  }
  const r = await api("editMessageCaption", {
    chat_id: channel,
    message_id: messageId,
    caption,
    reply_markup: keyboard,
  });
  console.log(`#${messageId}:`, r.ok ? "caption restored" : r.description);
  await new Promise((res) => setTimeout(res, 400));
}
