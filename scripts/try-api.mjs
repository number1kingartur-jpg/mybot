// Сквозная проверка API приёма пищи без телефона: подписывает initData токеном
// бота и отправляет фото или текст. По умолчанию поднимает сервер локально;
// с TRY_BASE=<url> бьёт по живому серверу — так виден именно задеплоенный код.
//
// Запуск (переменные подставляет Railway, в команду токен не попадает):
//   railway run --service mybot node scripts/try-api.mjs <фото>
//   railway run --service mybot node scripts/try-api.mjs --text "курица 200 г, рис 150 г"
//   $env:TRY_BASE="https://…"; railway run --service mybot node scripts/try-api.mjs <фото>
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const liveBase = process.env.TRY_BASE?.replace(/\/$/, "") ?? "";

process.env.PORT = process.env.TRY_PORT ?? "8099";
// Отдельная база: проверка не должна писать в живой дневник.
const tmp = path.join(process.cwd(), ".tmp-try");
fs.mkdirSync(tmp, { recursive: true });
process.env.DATA_PATH = path.join(tmp, "data.json");

const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN не задан — запусти через railway run");
  process.exit(1);
}

function initData(userId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "Проверка" }),
  });
  const pairs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort();
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(pairs.join("\n")).digest("hex"));
  return params.toString();
}

let server = null;
if (!liveBase) {
  const { startWebappServer } = await import("../dist/server.js");
  server = startWebappServer(token);
  if (!server) {
    console.error("сервер не поднялся");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}

const base = liveBase || `http://127.0.0.1:${process.env.PORT}`;
console.log(`цель: ${base}`);
const auth = initData(999000001);

async function post(url, body) {
  const res = await fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": auth },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const textIdx = process.argv.indexOf("--text");
let out;
if (textIdx > 0) {
  out = await post("/api/meal/text", { text: process.argv[textIdx + 1] });
} else {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error("укажи путь к фото или --text \"...\"");
    process.exit(1);
  }
  const mime = file.toLowerCase().endsWith(".png")
    ? "image/png"
    : file.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  console.log(`файл: ${file}, ${(fs.statSync(file).size / 1024).toFixed(0)} КБ, ${mime}`);
  out = await post("/api/meal/photo", {
    imageBase64: fs.readFileSync(file).toString("base64"),
    mime,
  });
}

console.log(`HTTP ${out.status}`);

// Разбор теперь не пишет в дневник сам: проверять надо обе ступени, иначе тест
// показывает «распознал» там, где запись до дневника не дошла.
const pending = out.body?.pending;
if (!pending) {
  console.log(JSON.stringify(out.body, null, 1));
  server?.close();
  process.exit(0);
}

console.log(`\nРАЗБОР: ${pending.meal.name} — ${pending.meal.kcal} ккал`);
console.log(`  Б ${pending.meal.proteinG} / Ж ${pending.meal.fatG} / У ${pending.meal.carbsG} г`);
for (const line of pending.parts ?? []) console.log(`  · ${line}`);
if (pending.meal.said) console.log(`  вижу так: ${pending.meal.said}`);
if (pending.meal.note) console.log(`  ${pending.meal.note}`);

if (process.argv.includes("--no-confirm")) {
  const rej = await post("/api/meal/reject", { token: pending.token });
  console.log(`\nОТКАЗ: HTTP ${rej.status}`);
  server?.close();
  process.exit(0);
}

// Правка состава до записи. Проверяется именно этот путь: модель приписала к
// одному яблоку салат, и человек должен снять лишнюю позицию, а не весь разбор.
let live = pending;
const dropIdx = process.argv.indexOf("--drop");
if (dropIdx > 0) {
  const res = await post("/api/meal/pending", { token: pending.token, drop: Number(process.argv[dropIdx + 1]) });
  console.log(`\nСНЯТА ПОЗИЦИЯ: HTTP ${res.status}`);
  live = res.body?.pending ?? live;
  console.log(`  стало: ${live.meal.name} — ${live.meal.kcal} ккал`);
  for (const line of live.parts ?? []) console.log(`  · ${line}`);
}
const gramsIdx = process.argv.indexOf("--grams");
if (gramsIdx > 0) {
  const res = await post("/api/meal/pending", {
    token: pending.token,
    index: Number(process.argv[gramsIdx + 1]),
    grams: Number(process.argv[gramsIdx + 2]),
  });
  console.log(`\nПОПРАВЛЕН ВЕС: HTTP ${res.status}`);
  live = res.body?.pending ?? live;
  console.log(`  стало: ${live.meal.name} — ${live.meal.kcal} ккал`);
  for (const line of live.parts ?? []) console.log(`  · ${line}`);
}

const ok = await post("/api/meal/confirm", { token: pending.token });
console.log(`\nПОДТВЕРЖДЕНИЕ: HTTP ${ok.status}`);
console.log(`  в дневнике: ${ok.body?.meal?.name} — ${ok.body?.meal?.kcal} ккал, id ${ok.body?.mealId}`);
console.log(`  за день: ${ok.body?.totals?.kcal ?? "?"} ккал, приёмов ${ok.body?.meals?.length ?? "?"}`);

// Второе подтверждение тем же токеном должно быть отбито: двойной тап по кнопке
// не должен превращать одну тарелку в две записи.
const again = await post("/api/meal/confirm", { token: pending.token });
console.log(`  повтор тем же токеном: HTTP ${again.status} (ожидается 410)`);

server?.close();
process.exit(0);
