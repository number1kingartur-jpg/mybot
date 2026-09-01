// Проверка src/metrics.ts: кто считается активным, распределение серий питания
// среди активных за 7 дней и пересечение с базой воронки BABKI\bot.
//
// Каждый сценарий запускается отдельным процессом: DATA_PATH (и, где нужно,
// FUNNEL_USERS_PATH) читаются один раз при загрузке модуля db.js.
//
// Запуск: node scripts/check-metrics.mjs (входит в npm run build)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DB_MODULE = pathToFileURL(path.resolve("dist/db.js")).href;
const METRICS_MODULE = pathToFileURL(path.resolve("dist/metrics.js")).href;

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) return;
  failed++;
  console.error(`ПРОВАЛ: ${name}${detail ? ` → ${detail}` : ""}`);
}

function run(body, env) {
  const code =
    `const db = await import(${JSON.stringify(DB_MODULE)});\n` +
    `const metrics = await import(${JSON.stringify(METRICS_MODULE)});\n` +
    body;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function freshDir(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `km-metrics-${tag}-`));
  return path.join(dir, "data.json");
}

// Ни у одного сценария нет отношения к реальному файлу воронки: по умолчанию
// указываем на заведомо несуществующий путь, чтобы тесты не зависели от того,
// лежит ли рядом с проектом настоящая папка BABKI\bot.
function noFunnelEnv(tag, extra = {}) {
  return { FUNNEL_USERS_PATH: path.join(os.tmpdir(), `km-metrics-nofunnel-${tag}.json`), ...extra };
}

const TODAY = "2026-08-22";
function shift(back) {
  const d = new Date(TODAY + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function parseJsonLine(stdout) {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

// ── 1. activeUserIds: разные виды активности, окна 7 и 30 дней ──────────────
{
  const p = freshDir("active");
  const body = `
    db.registerUser(1, "П1");
    db.registerUser(2, "П2");
    db.registerUser(3, "П3");
    db.registerUser(4, "П4");
    db.registerUser(5, "П5");
    db.addWorkout({ userId: 1, date: "${TODAY}", exercise: "Присед", sets: 3, reps: 5, weightKg: 100 });
    db.addMeal({ userId: 2, date: "${shift(10)}", name: "Рис", kcal: 300, proteinG: 10, fatG: 2, carbsG: 60 });
    db.addWater(3, 500, "${shift(40)}");
    db.addBodyweight(4, 80, "${TODAY}", "profile");
    db.addBodyweight(5, 80, "${TODAY}", "user");
    const a7 = [...metrics.activeUserIds(7, "${TODAY}")].sort((x, y) => x - y);
    const a30 = [...metrics.activeUserIds(30, "${TODAY}")].sort((x, y) => x - y);
    console.log(JSON.stringify({ a7, a30 }));
  `;
  const r = run(body, { DATA_PATH: p, ...noFunnelEnv("active") });
  check("activeUserIds не падает", r.ok, r.stderr.trim().split("\n").slice(-3).join(" | "));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("активны 7д: тренировка и взвешивание пользователем", JSON.stringify(parsed.a7) === JSON.stringify([1, 5]), JSON.stringify(parsed.a7));
  check("активны 30д: включает еду 10 дней назад", JSON.stringify(parsed.a30) === JSON.stringify([1, 2, 5]), JSON.stringify(parsed.a30));
  check("вода 40 дней назад не входит ни в одно окно", !parsed.a7?.includes(3) && !parsed.a30?.includes(3), JSON.stringify(parsed));
  check("вес из анкеты (source=profile) не считается действием", !parsed.a7?.includes(4) && !parsed.a30?.includes(4), JSON.stringify(parsed));
}

// ── 2. streakDistribution: серия mealStreak среди активных за 7 дней ────────
{
  const p = freshDir("streak");
  const days4 = [3, 2, 1, 0].map(shift);
  const days8 = [7, 6, 5, 4, 3, 2, 1, 0].map(shift);
  const addMeals = (userId, dates) =>
    dates
      .map((d) => `db.addMeal({ userId: ${userId}, date: "${d}", name: "M", kcal: 100, proteinG: 5, fatG: 5, carbsG: 5 });`)
      .join("\n");
  const body = `
    db.registerUser(10, "A");
    db.registerUser(11, "B");
    db.registerUser(12, "C");
    db.registerUser(13, "D");
    db.addMeal({ userId: 10, date: "${TODAY}", name: "Яйца", kcal: 200, proteinG: 12, fatG: 10, carbsG: 2 });
    ${addMeals(11, days4)}
    ${addMeals(12, days8)}
    db.addWorkout({ userId: 13, date: "${TODAY}", exercise: "Тяга", sets: 3, reps: 5, weightKg: 100 });
    const snap = metrics.retentionSnapshot("${TODAY}");
    console.log(JSON.stringify({ usersTotal: snap.usersTotal, active7d: snap.active7d, dist: snap.streakDistribution }));
  `;
  const r = run(body, { DATA_PATH: p, ...noFunnelEnv("streak") });
  check("retentionSnapshot не падает", r.ok, r.stderr.trim().split("\n").slice(-3).join(" | "));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("usersTotal считает всех зарегистрированных", parsed.usersTotal === 4, String(parsed.usersTotal));
  check("active7d включает всех четверых", parsed.active7d === 4, String(parsed.active7d));
  check(
    "streakDistribution: 1 без еды, 1 короткая, 1 средняя, 1 длинная",
    JSON.stringify(parsed.dist) === JSON.stringify({ none: 1, d1to3: 1, d4to6: 1, d7plus: 1 }),
    JSON.stringify(parsed.dist)
  );
}

// ── 3. funnelOverlap: файла нет ──────────────────────────────────────────────
{
  const p = freshDir("funnel-missing");
  const body = `
    db.registerUser(1, "П1");
    db.addWorkout({ userId: 1, date: "${TODAY}", exercise: "Присед", sets: 3, reps: 5, weightKg: 100 });
    const snap = metrics.retentionSnapshot("${TODAY}");
    console.log(JSON.stringify({ funnelOverlap: snap.funnelOverlap }));
  `;
  const r = run(body, { DATA_PATH: p, ...noFunnelEnv("missing") });
  check("не падает без файла воронки", r.ok, r.stderr.trim().split("\n").slice(-3).join(" | "));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("funnelOverlap === null, если файла нет", parsed.funnelOverlap === null, JSON.stringify(parsed.funnelOverlap));
}

// ── 4. funnelOverlap: реальный формат BABKI\bot\data\users.json ─────────────
// { "users": { "<telegram_id>": {...} }, "pending": [...] } — id это ключ объекта.
{
  const p = freshDir("funnel-found");
  const funnelDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-metrics-funnel-"));
  const funnelPath = path.join(funnelDir, "users.json");
  fs.writeFileSync(
    funnelPath,
    JSON.stringify({
      users: {
        "1": { username: "one", source: "lead", purchases: [], joined: "2026-07-29T16:33:25.650187" },
        "999": { username: "nine", source: "lead", purchases: [] },
      },
      pending: [],
    }),
    "utf-8"
  );
  const body = `
    db.registerUser(1, "П1");
    db.registerUser(5, "П5");
    db.addWorkout({ userId: 1, date: "${TODAY}", exercise: "Присед", sets: 3, reps: 5, weightKg: 100 });
    db.addBodyweight(5, 80, "${TODAY}", "user");
    const snap = metrics.retentionSnapshot("${TODAY}");
    console.log(JSON.stringify({ funnelOverlap: snap.funnelOverlap }));
  `;
  const r = run(body, { DATA_PATH: p, FUNNEL_USERS_PATH: funnelPath });
  check("не падает с файлом воронки", r.ok, r.stderr.trim().split("\n").slice(-3).join(" | "));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check(
    "funnelOverlap: 1 из 2 активных за 7д уже в воронке",
    JSON.stringify(parsed.funnelOverlap) === JSON.stringify({ active7dInFunnel: 1, active7dTotal: 2 }),
    JSON.stringify(parsed.funnelOverlap)
  );
}

// ── 5. funnelOverlap: запасной разбор (массив записей с telegram_id) ────────
{
  const p = freshDir("funnel-array");
  const funnelDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-metrics-funnel-arr-"));
  const funnelPath = path.join(funnelDir, "users.json");
  fs.writeFileSync(funnelPath, JSON.stringify([{ telegram_id: 1 }, { telegram_id: 42 }]), "utf-8");
  const body = `
    db.registerUser(1, "П1");
    db.addWorkout({ userId: 1, date: "${TODAY}", exercise: "Присед", sets: 3, reps: 5, weightKg: 100 });
    const snap = metrics.retentionSnapshot("${TODAY}");
    console.log(JSON.stringify({ funnelOverlap: snap.funnelOverlap }));
  `;
  const r = run(body, { DATA_PATH: p, FUNNEL_USERS_PATH: funnelPath });
  check("не падает с массивом в файле воронки", r.ok, r.stderr.trim().split("\n").slice(-3).join(" | "));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check(
    "funnelOverlap: запасной формат массива тоже разбирается",
    JSON.stringify(parsed.funnelOverlap) === JSON.stringify({ active7dInFunnel: 1, active7dTotal: 1 }),
    JSON.stringify(parsed.funnelOverlap)
  );
}

// ── 6. funnelOverlap: битый JSON воронки не роняет бота ─────────────────────
{
  const p = freshDir("funnel-broken");
  const funnelDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-metrics-funnel-broken-"));
  const funnelPath = path.join(funnelDir, "users.json");
  fs.writeFileSync(funnelPath, "не json", "utf-8");
  const body = `
    db.registerUser(1, "П1");
    const snap = metrics.retentionSnapshot("${TODAY}");
    console.log(JSON.stringify({ funnelOverlap: snap.funnelOverlap }));
  `;
  const r = run(body, { DATA_PATH: p, FUNNEL_USERS_PATH: funnelPath });
  check("битый файл воронки не роняет процесс", r.ok, r.stderr.trim().split("\n").slice(-3).join(" | "));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("funnelOverlap === null на битом JSON", parsed.funnelOverlap === null, JSON.stringify(parsed.funnelOverlap));
}

if (failed) {
  console.error(`check-metrics: провалов ${failed}`);
  process.exit(1);
}
console.log("check-metrics: активность, серии и пересечение с воронкой считаются верно");
