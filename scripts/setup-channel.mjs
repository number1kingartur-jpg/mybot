/**
 * Одноразовая настройка @kingmode_fit: только title + about.
 * Посты в канал НЕ шлёт — они уже есть у Артура; автопост через cron.
 * node scripts/setup-channel.mjs
 */
import "dotenv/config";

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

const title = process.env.CHANNEL_TITLE?.trim() || "KINGMODE";
const about =
  process.env.CHANNEL_DESCRIPTION?.trim() ||
  "Метод: тренировка по плану, каждая сессия в цифрах, питание и нагрузка по данным — не по ощущениям. Сила и дисциплина. @Raschettbot";

console.log("channel:", channel);

let r = await api("setChatTitle", { chat_id: channel, title: title.slice(0, 128) });
console.log("title:", r.ok ? "ok" : r.description);

r = await api("setChatDescription", { chat_id: channel, description: about.slice(0, 255) });
console.log("about:", r.ok ? "ok" : r.description);

console.log("post: skip (канал уже с контентом Артура; автопост — cron /channel_post)");
console.log("done");
