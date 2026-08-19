// Сквозной тест приложения без телефона: новый пользователь от анкеты до записи
// еды, воды, веса, тренировки. Два пользователя — проверка изоляции.
//
// Запуск:
//   railway run --service mybot node scripts/e2e-app.mjs
//   $env:TRY_BASE="https://mybot-production-e7a5.up.railway.app"; railway run --service mybot node scripts/e2e-app.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const liveBase = process.env.TRY_BASE?.replace(/\/$/, "") ?? "";
process.env.PORT = process.env.TRY_PORT ?? "8101";
const tmp = path.join(process.cwd(), ".tmp-e2e");
fs.mkdirSync(tmp, { recursive: true });
process.env.DATA_PATH = path.join(tmp, "data.json");

const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN не задан — запусти через railway run");
  process.exit(1);
}

const USER_A = 999000101;
const USER_B = 999000102;

function initData(userId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "E2E" }),
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
console.log(`e2e: ${base}`);

let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ok  ${name}`);
    return;
  }
  failed++;
  console.error(`  FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

async function req(method, url, userId, body) {
  const headers = { "X-Telegram-Init-Data": initData(userId) };
  const opts = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(base + url, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

// ── 1. Пустой пользователь ───────────────────────────────────────────────────
const empty = await req("GET", "/api/state", USER_A);
check("пустой state 200", empty.status === 200);
check("дневник пуст", (empty.body?.meals?.length ?? 0) === 0, String(empty.body?.meals?.length));

// ── 2. Анкета / норма ────────────────────────────────────────────────────────
const profile = {
  sex: "m",
  age: 34,
  heightCm: 178,
  weightKg: 83,
  activity: "high",
  goal: "maint",
  kcal: 2800,
  proteinG: 165,
  fatG: 78,
  carbsG: 340,
};
const nut = await req("POST", "/api/nutrition", USER_A, profile);
check("анкета 200", nut.status === 200);
check("норма сохранена", nut.body?.nutrition?.kcal === 2800, String(nut.body?.nutrition?.kcal));

// ── 3. Вода ──────────────────────────────────────────────────────────────────
const water = await req("POST", "/api/water", USER_A, { ml: 250 });
check("вода 200", water.status === 200);
check("вода накопилась", (water.body?.waterMl ?? 0) >= 250, String(water.body?.waterMl));

// ── 4. Вес ───────────────────────────────────────────────────────────────────
const bw = await req("POST", "/api/bodyweight", USER_A, { weightKg: 83.2 });
check("вес 200", bw.status === 200);
check("вес записан", bw.body?.bodyweight?.length >= 1, String(bw.body?.bodyweight?.length));

// ── 5. Еда: текст → подтверждение → дневник ─────────────────────────────────
const mealText = await req("POST", "/api/meal/text", USER_A, { text: "курица 200 г, рис 150 г" });
check("разбор текста 200", mealText.status === 200);
const pending = mealText.body?.pending;
check("есть pending", !!pending?.token);
check("есть состав", (pending?.parts?.length ?? 0) >= 1, String(pending?.parts?.length));

const confirm = await req("POST", "/api/meal/confirm", USER_A, { token: pending?.token });
check("подтверждение 200", confirm.status === 200);
check("приём в дневнике", (confirm.body?.meals?.length ?? 0) >= 1, String(confirm.body?.meals?.length));

const dup = await req("POST", "/api/meal/confirm", USER_A, { token: pending?.token });
check("повторный токен отбит", dup.status === 410, String(dup.status));

// ── 6. Повтор последнего приёма ──────────────────────────────────────────────
const repeat = await req("POST", "/api/meal/repeat", USER_A, {});
check("повтор 200", repeat.status === 200);
check("два приёма за день", (repeat.body?.meals?.length ?? 0) >= 2, String(repeat.body?.meals?.length));

// ── 6b. Отдых в маршруте дня ─────────────────────────────────────────────────
const restOn = await req("POST", "/api/settings", USER_A, { rest: true });
check("отдых 200", restOn.status === 200);
check("отдых записан", restOn.body?.restDate === restOn.body?.today, String(restOn.body?.restDate));
const restOff = await req("POST", "/api/settings", USER_A, { rest: false });
check("отдых снят", !restOff.body?.restDate, String(restOff.body?.restDate));

// ── 7. Простая тренировка ────────────────────────────────────────────────────
const wo = await req("POST", "/api/workout/simple", USER_A, { place: "home", level: "train" });
check("тренировка 200", wo.status === 200);
check("тренировка отмечена", !!wo.body?.done, String(wo.body?.done));

// ── 8. Изоляция: пользователь B не видит данные A ────────────────────────────
const bState = await req("GET", "/api/state", USER_B);
check("B: state 200", bState.status === 200);
check("B: дневник пуст", (bState.body?.meals?.length ?? 0) === 0, String(bState.body?.meals?.length));
check("B: нормы нет", !bState.body?.nutrition?.kcal, String(bState.body?.nutrition?.kcal));

// B записывает своё
await req("POST", "/api/nutrition", USER_B, { ...profile, kcal: 2200, weightKg: 70 });
const bMeal = await req("POST", "/api/meal/text", USER_B, { text: "яйца 3 шт" });
const bPending = bMeal.body?.pending;
await req("POST", "/api/meal/confirm", USER_B, { token: bPending?.token });

const aAgain = await req("GET", "/api/state", USER_A);
check("A: свои приёмы на месте", (aAgain.body?.meals?.length ?? 0) >= 2, String(aAgain.body?.meals?.length));
check("A: норма 2800", aAgain.body?.nutrition?.kcal === 2800, String(aAgain.body?.nutrition?.kcal));

const bAgain = await req("GET", "/api/state", USER_B);
check("B: один приём", bAgain.body?.meals?.length === 1, String(bAgain.body?.meals?.length));
check("B: норма 2200", bAgain.body?.nutrition?.kcal === 2200, String(bAgain.body?.nutrition?.kcal));

// ── 9. Без подписи — отказ ───────────────────────────────────────────────────
const noAuth = await fetch(base + "/api/state");
check("без подписи 401", noAuth.status === 401, String(noAuth.status));

server?.close();

if (failed) {
  console.error(`\ne2e-app: провалов ${failed}`);
  process.exit(1);
}
console.log("\ne2e-app: новый пользователь прошёл полный контур");
