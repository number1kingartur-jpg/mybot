/**
 * Правка уже опубликованных постов канала на месте: дата публикации сохраняется.
 *
 * Тексты берутся из scripts/rewrite/wave-r.mjs — массив { id, title, text }.
 * Фото-сообщения правятся через editMessageCaption, текстовые — editMessageText.
 *
 *   node scripts/rewrite-published.mjs            — показать план, ничего не менять
 *   node scripts/rewrite-published.mjs --apply    — применить
 *   node scripts/rewrite-published.mjs --apply 51 — применить только к сообщению 51
 */
import "dotenv/config";
import { REWRITES } from "./rewrite/wave-r.mjs";

const token = process.env.BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID?.trim() || "@kingmode_fit";
const apply = process.argv.includes("--apply");
const only = process.argv.filter((a) => /^\d+$/.test(a)).map(Number);

const CAPTION_MAX = 1024;
const TEXT_MAX = 4096;

if (!token) {
  console.error("нет BOT_TOKEN");
  process.exit(1);
}

const api = (method, params) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json());

const targets = only.length ? REWRITES.filter((r) => only.includes(r.id)) : REWRITES;

let tooLong = 0;
for (const r of targets) {
  const limit = r.kind === "text" ? TEXT_MAX : CAPTION_MAX;
  if (r.text.length > limit) {
    console.error(`ДЛИННО ${r.id} «${r.title}»: ${r.text.length} > ${limit}`);
    tooLong++;
  }
}
if (tooLong) {
  console.error(`\n${tooLong} текстов не влезают — правка не запускается.`);
  process.exit(1);
}

console.log(`целей: ${targets.length}, режим: ${apply ? "ПРИМЕНЯЮ" : "показ плана"}`);

if (!apply) {
  for (const r of targets) {
    console.log(`${r.id} [${r.kind}] ${r.title} — ${r.text.length} симв.`);
  }
  process.exit(0);
}

let ok = 0;
const failed = [];
for (const r of targets) {
  const method = r.kind === "text" ? "editMessageText" : "editMessageCaption";
  const payload =
    r.kind === "text"
      ? { chat_id: channel, message_id: r.id, text: r.text, link_preview_options: { is_disabled: true } }
      : { chat_id: channel, message_id: r.id, caption: r.text };

  const res = await api(method, payload);
  if (res.ok) {
    ok++;
    console.log(`ok   ${r.id} ${r.title}`);
  } else {
    failed.push({ id: r.id, error: res.description });
    console.error(`FAIL ${r.id} ${r.title}: ${res.description}`);
  }
  await new Promise((s) => setTimeout(s, 1200));
}

console.log(`\nготово: ${ok}/${targets.length}`);
if (failed.length) {
  console.log("не прошли:", JSON.stringify(failed, null, 2));
  process.exit(1);
}
