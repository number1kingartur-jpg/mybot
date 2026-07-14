/**
 * Применить ссылки KINGMODE: описание бота + профиль канала.
 * node scripts/apply-brand-links.mjs
 */
import "dotenv/config";

const token = process.env.BOT_TOKEN;
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

function cleanUser(raw, fallback) {
  return (raw ?? "").trim().replace(/^@/, "") || fallback;
}

function normalizeSite(raw) {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s.startsWith("http") ? s.replace(/\/$/, "") : `https://${s.replace(/\/$/, "")}`;
}

const botUser = cleanUser(process.env.BOT_USERNAME, "Raschettbot");
const dmUser = cleanUser(process.env.KINGMODE_DM_USERNAME, "arturking10");
const siteUrl = normalizeSite(process.env.KINGMODE_SITE_URL);
const sitePart = siteUrl ? `Сайт → ${new URL(siteUrl).hostname.replace(/^www\./, "")} · ` : "";

const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const channelAbout =
  process.env.CHANNEL_DESCRIPTION?.trim() ||
  `${sitePart}Метод: план → цифры → результат. Написать → @${dmUser} · Бот → @${botUser}`.slice(0, 255);

const botDesc =
  `KINGMODE · план → цифры → результат. ` +
  (siteUrl ? `Сайт: ${siteUrl} · ` : "") +
  `Личка: t.me/${dmUser} · Бот: t.me/${botUser}`;

let r = await api("setMyDescription", { description: botDesc.slice(0, 512), language_code: "ru" });
console.log("bot description:", r.ok ? "ok" : r.description);

r = await api("setMyShortDescription", {
  short_description: `Сайт + личка + система KINGMODE`.slice(0, 120),
  language_code: "ru",
});
console.log("bot short:", r.ok ? "ok" : r.description);

r = await api("setChatDescription", { chat_id: channel, description: channelAbout });
console.log("channel about:", r.ok ? "ok" : r.description);

console.log("site:", siteUrl || "(not set — add KINGMODE_SITE_URL)");
console.log("dm:", `https://t.me/${dmUser}`);
console.log("bot:", `https://t.me/${botUser}?start=kingmode`);
