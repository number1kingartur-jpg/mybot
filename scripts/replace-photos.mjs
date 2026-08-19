/**
 * Замена фото в уже опубликованных постах канала. Дата публикации сохраняется.
 *
 * Подпись перезаписывается вместе с медиа — Telegram сбрасывает caption,
 * поэтому текст берётся из scripts/rewrite/wave-r.mjs.
 *
 *   node scripts/replace-photos.mjs             — показать план
 *   node scripts/replace-photos.mjs --apply     — применить
 *   node scripts/replace-photos.mjs --apply 85  — применить к одному сообщению
 */
import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { REWRITES } from "./rewrite/wave-r.mjs";
import { PHOTOS } from "./rewrite/photos-r.mjs";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const apply = process.argv.includes("--apply");
const only = process.argv.filter((a) => /^\d+$/.test(a)).map(Number);
const DIR = join(process.cwd(), "assets", "rewrite-photos");

if (!token) {
  console.error("нет BOT_TOKEN");
  process.exit(1);
}

const byId = new Map(REWRITES.map((r) => [r.id, r]));
let ids = Object.keys(PHOTOS).map(Number).sort((a, b) => a - b);
if (only.length) ids = ids.filter((id) => only.includes(id));

const problems = [];
for (const id of ids) {
  const post = byId.get(id);
  if (!post) problems.push(`${id}: нет текста в wave-r.mjs`);
  else if (post.kind === "text") problems.push(`${id}: текстовое сообщение, фото не вставить`);
  if (!existsSync(join(DIR, PHOTOS[id]))) problems.push(`${id}: нет файла ${PHOTOS[id]}`);
}

const files = ids.map((id) => PHOTOS[id]);
const dupes = files.filter((f, i) => files.indexOf(f) !== i);
if (dupes.length) problems.push(`повторы кадров: ${[...new Set(dupes)].join(", ")}`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`целей: ${ids.length}, режим: ${apply ? "ПРИМЕНЯЮ" : "показ плана"}`);

if (!apply) {
  for (const id of ids) console.log(`${id} ${byId.get(id).title} → ${PHOTOS[id]}`);
  process.exit(0);
}

let ok = 0;
const failed = [];
for (const id of ids) {
  const post = byId.get(id);
  const path = join(DIR, PHOTOS[id]);

  const form = new FormData();
  form.append("chat_id", channel);
  form.append("message_id", String(id));
  form.append(
    "media",
    JSON.stringify({ type: "photo", media: "attach://photo", caption: post.text })
  );
  form.append("photo", new Blob([readFileSync(path)]), PHOTOS[id]);

  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageMedia`, {
    method: "POST",
    body: form,
  }).then((r) => r.json());

  if (res.ok) {
    ok++;
    console.log(`ok   ${id} ${post.title} -> ${PHOTOS[id]}`);
  } else {
    failed.push({ id, error: res.description });
    console.error(`FAIL ${id} ${post.title}: ${res.description}`);
  }
  await new Promise((s) => setTimeout(s, 1500));
}

console.log(`\nготово: ${ok}/${ids.length}`);
if (failed.length) {
  console.log("не прошли:", JSON.stringify(failed, null, 2));
  process.exit(1);
}
