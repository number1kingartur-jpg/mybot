/**
 * Скан канала через forward в личку бота (без спама пользователю — в getMe id).
 * node scripts/scan-channel.mjs [maxId]
 */
import "dotenv/config";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const maxId = parseInt(process.argv[2] || "55", 10);

const api = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

const owner = parseInt(process.env.ADMIN_ID || process.env.OWNER_ID || "1775515654", 10);
const sink = owner;

const found = [];
for (let id = 1; id <= maxId; id++) {
  const r = await api("forwardMessage", {
    chat_id: sink,
    from_chat_id: channel,
    message_id: id,
    disable_notification: true,
  });
  if (!r.ok) continue;
  const m = r.result;
  const text = (m.text || m.caption || "").trim();
  const preview = text.split("\n")[0].slice(0, 70);
  found.push({
    id,
    hasPhoto: Boolean(m.photo?.length),
    preview,
    len: text.length,
  });
  // удаляем пересылку из лички бота сразу
  await api("deleteMessage", { chat_id: sink, message_id: m.message_id });
  await new Promise((res) => setTimeout(res, 120));
}

console.log(`channel ${channel}: ${found.length} messages (1..${maxId})`);
for (const x of found) {
  console.log(`#${x.id} ${x.hasPhoto ? "📷" : "  "} ${x.preview}`);
}
