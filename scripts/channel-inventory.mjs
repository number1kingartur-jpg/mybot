/**
 * Инвентарь канала: id сообщений, дата, есть ли фото, текст.
 * Источник — публичное превью t.me/s/<channel>, постранично через ?before=.
 *
 * node scripts/channel-inventory.mjs > channel-inventory.json
 */
import "dotenv/config";
import { writeFileSync } from "fs";

const channel = (process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit").replace(/^@/, "");

function decode(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseBubbles(html) {
  const out = [];
  const re = /data-post="[^"]*\/(\d+)"([\s\S]*?)(?=data-post="[^"]*\/\d+"|$)/g;
  let m;
  while ((m = re.exec(html))) {
    const id = parseInt(m[1], 10);
    const chunk = m[2];
    const dateM = chunk.match(/datetime="([^"]+)"/);
    const textM = chunk.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const photo = /tgme_widget_message_photo_wrap/.test(chunk);
    if (out.some((o) => o.id === id)) continue;
    out.push({ id, date: dateM ? dateM[1] : null, photo, text: textM ? decode(textM[1]) : "" });
  }
  return out;
}

async function page(before) {
  const url = `https://t.me/s/${channel}${before ? `?before=${before}` : ""}`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return parseBubbles(await res.text());
}

const all = new Map();
let before;
for (let i = 0; i < 30; i++) {
  const batch = await page(before);
  if (batch.length === 0) break;
  for (const b of batch) all.set(b.id, b);
  const min = Math.min(...batch.map((b) => b.id));
  if (before !== undefined && min >= before) break;
  before = min;
  if (min <= 1) break;
  await new Promise((r) => setTimeout(r, 400));
}

const list = [...all.values()].sort((a, b) => a.id - b.id);
const out = process.argv[2] ?? "channel-inventory.json";
writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
console.log(`собрано сообщений: ${list.length} → ${out}`);
