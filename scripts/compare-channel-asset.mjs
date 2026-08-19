/** Скачать фото поста канала и сравнить с asset. node scripts/verify-channel-photo.mjs 76 sleep */
import "dotenv/config";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { createHash } from "crypto";

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

async function fetchPost(id) {
  const r = await api("forwardMessage", {
    chat_id: owner,
    from_chat_id: channel,
    message_id: id,
    disable_notification: true,
  });
  if (!r.ok) throw new Error(r.description);
  const m = r.result;
  await api("deleteMessage", { chat_id: owner, message_id: m.message_id });
  return m;
}

function assetPath(id) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const p = join(process.cwd(), "assets", "channel", id + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

const m = await fetchPost(messageId);
const ph = m.photo.slice(-1)[0];
const file = await api("getFile", { file_id: ph.file_id });
const url = `https://api.telegram.org/file/bot${token}/${file.result.file_path}`;
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
const tgHash = createHash("md5").update(buf).digest("hex");

mkdirSync("_tmp", { recursive: true });
const tgPath = join("_tmp", `tg-${messageId}.jpg`);
writeFileSync(tgPath, buf);

const asset = assetPath(assetId);
const assetHash = asset
  ? createHash("md5").update(readFileSync(asset)).digest("hex")
  : null;

console.log({
  channel,
  messageId,
  assetId,
  tgSize: buf.length,
  tgHash,
  assetPath: asset,
  assetHash,
  match: assetHash === tgHash,
  file_unique_id: ph.file_unique_id,
});
