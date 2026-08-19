/**
 * Подмена медиа в уже опубликованных постах канала на живой материал.
 * Дата публикации сохраняется: сообщение редактируется, а не пересоздается.
 *
 * Telegram при editMessageMedia сбрасывает подпись, поэтому текст заново
 * берется из scripts/rewrite/wave-r.mjs.
 *
 *   node scripts/replace-media.mjs             показать план
 *   node scripts/replace-media.mjs --apply     применить ко всем
 *   node scripts/replace-media.mjs --apply 85  применить к одному сообщению
 */
import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { REWRITES } from "./rewrite/wave-r.mjs";
import { MEDIA } from "./rewrite/media-r.mjs";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const apply = process.argv.includes("--apply");
const only = process.argv.filter((a) => /^\d+$/.test(a)).map(Number);
const DIR = join(process.cwd(), "assets", "rewrite-media");

if (!token) {
  console.error("нет BOT_TOKEN");
  process.exit(1);
}

const byId = new Map(REWRITES.map((r) => [r.id, r]));
let ids = Object.keys(MEDIA).map(Number).sort((a, b) => a - b);
if (only.length) ids = ids.filter((id) => only.includes(id));

const problems = [];
for (const id of ids) {
  const post = byId.get(id);
  if (!post) problems.push(`${id}: нет текста в wave-r.mjs`);
  else if (post.kind === "text") problems.push(`${id}: текстовое сообщение, медиа не вставить`);
  if (!existsSync(join(DIR, MEDIA[id].out))) {
    problems.push(`${id}: нет файла ${MEDIA[id].out}, сначала node scripts/prep-media.mjs`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`целей: ${ids.length}, режим: ${apply ? "ПРИМЕНЯЮ" : "показ плана"}`);

if (!apply) {
  for (const id of ids) {
    const m = MEDIA[id];
    console.log(`${String(id).padStart(3)} ${byId.get(id).title.padEnd(34)} ${m.out}  (${m.note})`);
  }
  process.exit(0);
}

let ok = 0;
const failed = [];
for (const id of ids) {
  const post = byId.get(id);
  const m = MEDIA[id];
  const isPhoto = m.out.endsWith(".jpg");
  const field = isPhoto ? "photo" : "clip";

  const media = isPhoto
    ? { type: "photo", media: `attach://${field}`, caption: post.text }
    : {
        type: "video",
        media: `attach://${field}`,
        caption: post.text,
        width: 720,
        height: 1280,
        supports_streaming: true,
      };

  const form = new FormData();
  form.append("chat_id", channel);
  form.append("message_id", String(id));
  form.append("media", JSON.stringify(media));
  form.append(field, new Blob([readFileSync(join(DIR, m.out))]), m.out);

  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageMedia`, {
    method: "POST",
    body: form,
  }).then((r) => r.json());

  if (res.ok) {
    ok++;
    console.log(`ok   ${id} ${post.title} -> ${m.out}`);
  } else {
    failed.push({ id, error: res.description });
    console.error(`FAIL ${id} ${post.title}: ${res.description}`);
  }
  await new Promise((s) => setTimeout(s, 2500));
}

console.log(`\nготово: ${ok}/${ids.length}`);
if (failed.length) {
  console.log("не прошли:", JSON.stringify(failed, null, 2));
  process.exit(1);
}
