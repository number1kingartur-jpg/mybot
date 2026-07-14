/**
 * Удалить дубликаты постов в @kingmode_fit (оставить самый ранний по message_id).
 * node scripts/cleanup-channel-duplicates.mjs
 * node scripts/cleanup-channel-duplicates.mjs --dry-run
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const dryRun = process.argv.includes("--dry-run");

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

function norm(text) {
  return (text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const corpusPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "kingmode-channel-corpus.json"
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));

const byText = new Map();
for (const item of corpus) {
  const key = norm(item.text);
  if (!key) continue;
  if (!byText.has(key)) byText.set(key, []);
  byText.get(key).push(item.channelMsgId);
}

const toDelete = [];
for (const [, ids] of byText) {
  ids.sort((a, b) => a - b);
  const keep = ids[0];
  for (const id of ids.slice(1)) toDelete.push(id);
  console.log(`keep #${keep}, delete ${ids.slice(1).map((x) => `#${x}`).join(", ") || "—"}`);
}

toDelete.sort((a, b) => b - a);
console.log(`\nTotal to delete: ${toDelete.length}${dryRun ? " (dry-run)" : ""}`);

for (const messageId of toDelete) {
  if (dryRun) continue;
  const r = await api("deleteMessage", { chat_id: channel, message_id: messageId });
  console.log(`delete #${messageId}:`, r.ok ? "ok" : r.description);
  await new Promise((res) => setTimeout(res, 350));
}

console.log("done");
