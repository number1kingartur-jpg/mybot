/**
 * Одноразовая настройка @kingmode_fit: оформление + первый пост.
 * node scripts/setup-channel.mjs
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const botUser = process.env.BOT_USERNAME?.trim() || "Raschettbot";

if (!token) {
  console.error("BOT_TOKEN missing");
  process.exit(1);
}

const api = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

const title = process.env.CHANNEL_TITLE || "KINGMODE · Сила и дисциплина";
const about =
  process.env.CHANNEL_DESCRIPTION ||
  `Тренировки, питание, прогресс без воды. Бот → @${botUser.replace(/^@/, "")}`;

console.log("channel:", channel);

let r = await api("setChatTitle", { chat_id: channel, title });
console.log("title:", r.ok ? "ok" : r.description);

r = await api("setChatDescription", { chat_id: channel, description: about.slice(0, 255) });
console.log("about:", r.ok ? "ok" : r.description);

const postsPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "channel", "posts.ts");
const postsSrc = readFileSync(postsPath, "utf-8");
const firstBody = postsSrc.match(/body:\s*\n\s*`([\s\S]*?)`/)?.[1];
const firstTitle = postsSrc.match(/title:\s*"([^"]+)"/)?.[1] ?? "KINGMODE";

if (firstBody) {
  const html =
    `<b>${firstTitle}</b>\n\n` +
    firstBody +
    `\n\n${"—".repeat(12)}\n📲 Тренировки, питание, прогресс → @${botUser.replace(/^@/, "")}`;
  r = await api("sendMessage", {
    chat_id: channel,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  console.log("post:", r.ok ? "ok" : r.description);
} else {
  console.log("post: skip (parse fail)");
}

console.log("done");
