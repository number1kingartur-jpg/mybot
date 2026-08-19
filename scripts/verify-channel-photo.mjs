/** Проверка: что реально в канале vs assets. node scripts/verify-channel-photo.mjs 76 70 66 */
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { createHash } from "crypto";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const owner = parseInt(process.env.ADMIN_ID || process.env.OWNER_ID || "1775515654", 10);
const ids = process.argv.slice(2).map((x) => parseInt(x, 10)).filter(Boolean);

const api = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

async function fetchPost(messageId) {
  const r = await api("forwardMessage", {
    chat_id: owner,
    from_chat_id: channel,
    message_id: messageId,
    disable_notification: true,
  });
  if (!r.ok) return { messageId, error: r.description };
  const m = r.result;
  await api("deleteMessage", { chat_id: owner, message_id: m.message_id });
  const ph = m.photo?.slice(-1)[0];
  return {
    messageId,
    caption: (m.caption || "").slice(0, 60),
    file_id: ph?.file_id,
    file_unique_id: ph?.file_unique_id,
    width: ph?.width,
    height: ph?.height,
  };
}

console.log(`Channel: ${channel}\n`);

for (const id of ids) {
  const info = await fetchPost(id);
  console.log(JSON.stringify(info, null, 2));
  await new Promise((r) => setTimeout(r, 300));
}

// local asset hashes for comparison
const assetsDir = join(process.cwd(), "assets", "channel");
console.log("\nLocal assets sample:");
for (const name of ["sleep.jpg", "sleep.jpeg", "protein.jpg", "guide_7mistakes.jpg", "guide_7mistakes.jpeg"]) {
  const p = join(assetsDir, name);
  if (existsSync(p)) {
    const h = createHash("md5").update(readFileSync(p)).digest("hex").slice(0, 12);
    console.log(`  ${name}: md5=${h}`);
  }
}
