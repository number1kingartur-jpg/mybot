// Приложение локально с подписанной сессией: печатает адрес и держит сервер.
// Нужен, чтобы смотреть экраны глазами — API-проверки не показывают, как карточка
// выглядит на телефонной ширине и не ломается ли вёрстка.
//
// Запуск: railway run --service mybot node scripts/try-ui.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

process.env.PORT = process.env.TRY_PORT ?? "8140";
const tmp = path.join(process.cwd(), ".tmp-try");
fs.mkdirSync(tmp, { recursive: true });
process.env.DATA_PATH = path.join(tmp, "ui.json");

const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN не задан — запусти через railway run");
  process.exit(1);
}

const USER_ID = 999000002;

function initData(userId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "Артур" }),
  });
  const pairs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort();
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(pairs.join("\n")).digest("hex"));
  return params.toString();
}

const { startWebappServer } = await import("../dist/server.js");
const { registerUser, setNutrition } = await import("../dist/db.js");

registerUser(USER_ID, "Артур");
// Норма нужна, иначе экран питания показывает анкету вместо ввода еды.
setNutrition(USER_ID, {
  sex: "m", age: 34, heightCm: 178, weightKg: 83,
  activity: "high", goal: "maint",
  kcal: 2800, proteinG: 165, fatG: 78, carbsG: 340,
});

const server = startWebappServer(token);
if (!server) {
  console.error("сервер не поднялся");
  process.exit(1);
}

const signed = encodeURIComponent(initData(USER_ID));
const url = `http://127.0.0.1:${process.env.PORT}/#tgWebAppData=${signed}`;
console.log("ОТКРОЙ:");
console.log(url);

/**
 * Файл-переход для headless-снимков.
 *
 * Подпись сессии остаётся внутри скрипта и не уезжает в команды оболочки:
 * браузеру достаточно открыть локальный файл, дальше он сам попадёт в приложение
 * с готовой подписью. Шаг проверки задаётся параметром `step`.
 */
const step = process.env.TRY_STEP ?? "";
fs.writeFileSync(
  path.join(tmp, "open.html"),
  `<!DOCTYPE html><meta charset="utf-8">` +
    `<meta http-equiv="refresh" content="0;url=http://127.0.0.1:${process.env.PORT}` +
    `/_probe.html?data=${signed}${step}">`
);
console.log(`снимок: .tmp-try/open.html (step=${step || "нет"})`);
