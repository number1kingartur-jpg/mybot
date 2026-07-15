/**
 * node scripts/delete-channel-msgs.mjs 40 41 42
 */
import "dotenv/config";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const ids = process.argv.slice(2).map((x) => parseInt(x, 10)).filter(Boolean);

if (!token || !ids.length) {
  console.error("Usage: node scripts/delete-channel-msgs.mjs <id> [id...]");
  process.exit(1);
}

const api = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

for (const messageId of ids.sort((a, b) => b - a)) {
  const r = await api("deleteMessage", { chat_id: channel, message_id: messageId });
  console.log(`#${messageId}:`, r.ok ? "deleted" : r.description);
  await new Promise((res) => setTimeout(res, 300));
}
