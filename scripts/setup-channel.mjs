/**
 * Одноразовая настройка @kingmode_fit: оформление + приветственный пост.
 * node scripts/setup-channel.mjs
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";

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

// Дефолты синхронны с src/channel/brand.ts
const title = process.env.CHANNEL_TITLE?.trim() || "KINGMODE";
const about =
  process.env.CHANNEL_DESCRIPTION?.trim() ||
  "Метод: тренировка по плану, каждая сессия в цифрах, питание и нагрузка по данным — не по ощущениям. Сила и дисциплина. @Raschettbot";

console.log("channel:", channel);

let r = await api("setChatTitle", { chat_id: channel, title: title.slice(0, 128) });
console.log("title:", r.ok ? "ok" : r.description);

r = await api("setChatDescription", { chat_id: channel, description: about.slice(0, 255) });
console.log("about:", r.ok ? "ok" : r.description);

const postsPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "channel", "posts.ts");
const postsSrc = readFileSync(postsPath, "utf-8");
const welcomeBlock = postsSrc.match(
  /post\(\s*\n\s*"Добро пожаловать в KINGMODE",[\s\S]*?"welcome"\s*\)/
);
const bodyMatch = welcomeBlock?.[0]?.match(/`([\s\S]*?)`/);
const firstBody = bodyMatch?.[1];
const botUser = (process.env.BOT_USERNAME || "Raschettbot").replace(/^@/, "");

if (firstBody) {
  const html =
    `<b>Добро пожаловать в KINGMODE</b>\n\n` +
    firstBody +
    `\n\n${"—".repeat(12)}\n` +
    `🎯 <b>KINGMODE</b> · Тренируешься по цифрам, а не по настроению.\n` +
    `📲 Система в боте: @${botUser}`;
  r = await api("sendMessage", {
    chat_id: channel,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  console.log("post:", r.ok ? "ok" : r.description);
  if (r.ok && r.result?.message_id) {
    const pin = await api("pinChatMessage", {
      chat_id: channel,
      message_id: r.result.message_id,
      disable_notification: true,
    });
    console.log("pin:", pin.ok ? "ok" : pin.description);
  }
} else {
  console.log("post: skip (parse fail)");
}

console.log("done");
