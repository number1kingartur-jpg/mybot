/**
 * Полный скан канала: id, фото, текст.
 * node scripts/scan-channel-full.mjs
 */
import "dotenv/config";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const owner = parseInt(process.env.ADMIN_ID || process.env.OWNER_ID || "1775515654", 10);
const maxId = parseInt(process.argv[2] || "55", 10);

const api = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

const found = [];
for (let id = 1; id <= maxId; id++) {
  const r = await api("forwardMessage", {
    chat_id: owner,
    from_chat_id: channel,
    message_id: id,
    disable_notification: true,
  });
  if (!r.ok) continue;
  const m = r.result;
  const text = (m.text || m.caption || "").trim();
  found.push({
    id,
    photo: Boolean(m.photo?.length),
    textLen: text.length,
    text,
  });
  await api("deleteMessage", { chat_id: owner, message_id: m.message_id });
  await new Promise((res) => setTimeout(res, 150));
}

console.log(`=== ${channel}: ${found.length} messages ===\n`);
for (const x of found) {
  console.log(`--- #${x.id} ${x.photo ? "PHOTO" : "TEXT"} (${x.textLen} chars) ---`);
  console.log(x.text || "[NO TEXT]");
  console.log();
}
