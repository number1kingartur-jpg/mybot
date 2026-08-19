// Проверка сохранности базы: воспроизводит аварии, из-за которых данные пропадали.
//
// Каждый случай запускается отдельным процессом: путь к базе читается один раз при
// загрузке модуля, поэтому в одном процессе несколько сценариев не проверить.
//
// Запуск: node scripts/check-db.mjs (входит в npm run build)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DB_MODULE = pathToFileURL(path.resolve("dist/db.js")).href;

let failed = 0;

function check(name, ok, detail = "") {
  if (ok) return;
  failed++;
  console.error(`ПРОВАЛ: ${name}${detail ? ` → ${detail}` : ""}`);
}

/**
 * Запустить код в отдельном процессе с указанной базой.
 *
 * Именно spawnSync, а не execFileSync: второй отдаёт stderr только через
 * исключение, поэтому предупреждение об успешном подъёме резерва оставалось
 * невидимым — проверка на строку в логе падала при рабочем коде.
 */
function run(body, dataPath) {
  const code = `const db = await import(${JSON.stringify(DB_MODULE)});\n${body}`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, DATA_PATH: dataPath },
    encoding: "utf-8",
  });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function freshDir(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `km-db-${tag}-`));
  return path.join(dir, "data.json");
}

const REGISTER = (id) => `db.registerUser(${id}, "П${id}");\nconsole.log(String(db.getUsers().length));`;
const COUNT = `console.log(String(db.getUsers().length));`;

// ── 1. Первый запуск: файла нет вовсе ────────────────────────────────────────
// Отсутствие файла — не авария, а первый старт. Исключение здесь означало бы,
// что бот не поднимется на чистом томе.
{
  const p = freshDir("first");
  const r = run(REGISTER(1), p);
  check("первый запуск не падает", r.ok, r.stderr.trim().split("\n").slice(-3).join(" | "));
  check("пользователь записан", r.stdout.trim() === "1", r.stdout.trim());
  check("файл базы создан", fs.existsSync(p));
}

// ── 2. Данные переживают перезапуск процесса ─────────────────────────────────
{
  const p = freshDir("restart");
  run(REGISTER(1), p);
  const r = run(COUNT, p);
  check("данные читаются новым процессом", r.stdout.trim() === "1", r.stdout.trim());
}

// ── 3. Формат: без отступов ──────────────────────────────────────────────────
// Файл перезаписывается целиком при каждом изменении, отступы раздували его почти
// вдвое — то есть удваивали работу на каждое нажатие кнопки.
{
  const p = freshDir("compact");
  run(REGISTER(1), p);
  const raw = fs.readFileSync(p, "utf-8");
  check("база пишется без отступов", !raw.includes('\n  "'), raw.slice(0, 40));
}

// ── 4. Резервная копия появляется со второй записи ───────────────────────────
{
  const p = freshDir("bak");
  run(REGISTER(1), p);
  check("после первой записи резерва ещё нет", !fs.existsSync(`${p}.bak`));
  run(REGISTER(2), p);
  check("после второй записи резерв есть", fs.existsSync(`${p}.bak`));
  const bak = JSON.parse(fs.readFileSync(`${p}.bak`, "utf-8"));
  check("в резерве предыдущее состояние", bak.users.length === 1, String(bak.users.length));
}

// ── 5. Главное: битый файл не превращается в пустую базу ─────────────────────
// Это тот самый случай, который стирал дневники: разбор падал, чтение отдавало
// пустоту, следующая запись закрепляла её на диске.
{
  const p = freshDir("corrupt");
  run(REGISTER(1), p);
  run(REGISTER(2), p); // теперь в резерве один пользователь, в основном — два
  fs.writeFileSync(p, '{"users":[{"chatId":1,', "utf-8"); // обрыв записи
  const r = run(COUNT, p);
  check("на битом файле процесс поднимается", r.ok, r.stderr.trim().split("\n").slice(-3).join(" | "));
  check("база НЕ обнулилась", r.stdout.trim() !== "0", `вернулось ${r.stdout.trim()}`);
  check("поднят резерв", r.stdout.trim() === "1", r.stdout.trim());
  check("в лог написано про резерв", /резервную копию/.test(r.stderr), r.stderr.slice(0, 120));
  const aside = fs.readdirSync(path.dirname(p)).filter((f) => f.includes(".corrupt-"));
  check("битый файл сохранён для разбора", aside.length === 1, JSON.stringify(aside));
}

// ── 6. Битый файл и резерва нет — громкий отказ вместо тишины ────────────────
// Пустая база в этом случае была бы хуже мёртвого бота: она бы записалась на диск.
{
  const p = freshDir("noway");
  run(REGISTER(1), p);
  fs.writeFileSync(p, "не json", "utf-8");
  const r = run(COUNT, p);
  check("процесс отказывается работать", !r.ok, `вышел успешно, отдав ${r.stdout.trim()}`);
  check("причина названа в ошибке", /не разбирается/.test(r.stderr), r.stderr.slice(0, 160));
  check("битый файл на месте, не затёрт", fs.readFileSync(p, "utf-8") === "не json");
}

// ── 7. Обрыв между переименованиями: основного файла нет, резерв есть ────────
{
  const p = freshDir("gap");
  run(REGISTER(1), p);
  run(REGISTER(2), p);
  fs.renameSync(p, `${p}.gone`); // как будто процесс умер между двумя переименованиями
  const r = run(COUNT, p);
  check("поднимается из резерва без основного файла", r.ok, r.stderr.slice(0, 120));
  check("данные из резерва на месте", r.stdout.trim() === "1", r.stdout.trim());
}

// ── 8. Брошенный временный файл не мешает ────────────────────────────────────
{
  const p = freshDir("tmp");
  run(REGISTER(1), p);
  fs.writeFileSync(`${p}.tmp`, "мусор от прерванной записи", "utf-8");
  const r = run(COUNT, p);
  check("временный файл игнорируется", r.stdout.trim() === "1", r.stdout.trim());
}

if (failed) {
  console.error(`check-db: провалов ${failed}`);
  process.exit(1);
}
console.log("check-db: база держит обрыв записи, обнуления нет");
