/** Тест editMessageMedia: меняется ли file_unique_id. node scripts/test-channel-edit.mjs 76 sleep */
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { Blob } from "buffer";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const owner = parseInt(process.env.ADMIN_ID || "1775515654", 10);
const messageId = parseInt(process.argv[2], 10);
const assetId = process.argv[3];

const api = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

async function photoMeta(id) {
  const r = await api("forwardMessage", {
    chat_id: owner,
    from_chat_id: channel,
    message_id: id,
    disable_notification: true,
  });
  if (!r.ok) throw new Error(r.description);
  const m = r.result;
  await api("deleteMessage", { chat_id: owner, message_id: m.message_id });
  const ph = m.photo.slice(-1)[0];
  return { file_unique_id: ph.file_unique_id, caption: m.caption || "" };
}

function assetPath(id) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const p = join(process.cwd(), "assets", "channel", id + ext);
    if (existsSync(p)) return p;
  }
  throw new Error(`no asset ${id}`);
}

const before = await photoMeta(messageId);
console.log("BEFORE:", before);

const path = assetPath(assetId);
const caption = before.caption;

const form = new FormData();
form.append("chat_id", channel);
form.append("message_id", String(messageId));
form.append(
  "media",
  JSON.stringify({
    type: "photo",
    media: "attach://photo",
    caption: caption.slice(0, 1024),
  })
);
form.append("photo", new Blob([readFileSync(path)]), assetId + extname(path));

const r = await fetch(`https://api.telegram.org/bot${token}/editMessageMedia`, {
  method: "POST",
  body: form,
}).then((res) => res.json());

console.log("EDIT:", JSON.stringify(r, null, 2));

await new Promise((res) => setTimeout(res, 2000));
const after = await photoMeta(messageId);
console.log("AFTER:", after);
console.log("CHANGED:", before.file_unique_id !== after.file_unique_id);
