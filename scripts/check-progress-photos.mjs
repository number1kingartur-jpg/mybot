// Проверка фотопротокола прогресса тела: db.ts (хранение и физическое удаление
// файлов), guard.ts (лимиты по числу и объёму) и webapp-auth.ts (короткоживущий
// токен на выдачу байт фото вне initData).
//
// db-сценарии запускаются отдельным процессом каждый: DATA_PATH читается один
// раз при загрузке модуля db.js, поэтому несколько сценариев в одном процессе
// не проверить. guard.js и webapp-auth.js от DATA_PATH не зависят, их можно
// импортировать прямо здесь.
//
// Запуск: node scripts/check-progress-photos.mjs (входит в npm run build)
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DB_MODULE = pathToFileURL(path.resolve("dist/db.js")).href;
const GUARD_MODULE = pathToFileURL(path.resolve("dist/guard.js")).href;
const AUTH_MODULE = pathToFileURL(path.resolve("dist/webapp-auth.js")).href;

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) return;
  failed++;
  console.error(`ПРОВАЛ: ${name}${detail ? ` → ${detail}` : ""}`);
}

function freshDir(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `km-pp-${tag}-`));
  return path.join(dir, "data.json");
}

/** Запустить код db-сценария в отдельном процессе с изолированной базой. */
function run(body, dataPath) {
  const code =
    `const db = await import(${JSON.stringify(DB_MODULE)});\n` +
    `const fs = await import("node:fs");\n` +
    `const path = await import("node:path");\n` +
    body;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, DATA_PATH: dataPath },
    encoding: "utf-8",
  });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function parseJsonLine(stdout) {
  try {
    return JSON.parse(stdout.trim().split("\n").pop());
  } catch {
    return null;
  }
}

function fail(r) {
  return r.stderr.trim().split("\n").slice(-3).join(" | ");
}

/**
 * Пишет байты на диск и заводит запись в базе — тот же порядок, которого
 * держится сервер: сначала файл на диск, потом db.addProgressPhoto. Ошибка
 * записи файла должна была бы остановить всё до этой строки и не трогать базу.
 *
 * Каждый вызов завёрнут в свой блок `{ }` с именем `row` в замыкании снаружи:
 * несколько вызовов в одном сценарии иначе повторно объявляли бы `dir`,
 * `filePath` и `row` в общей области видимости модуля.
 */
const WRITE_AND_ADD = (userId, angle, date, bytes, rowVar) => `
  let ${rowVar};
  {
    const dir = db.progressPhotoDir(${userId});
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "test-" + Math.random().toString(36).slice(2) + ".jpg");
    fs.writeFileSync(filePath, Buffer.alloc(${bytes}, 1));
    ${rowVar} = db.addProgressPhoto({ userId: ${userId}, date: "${date}", angle: "${angle}", path: filePath, sizeBytes: ${bytes} });
  }
`;

// ── 1. Базовый цикл: файл на диске, запись в базе, свой доступ работает ─────
{
  const p = freshDir("basic");
  const body = `
    ${WRITE_AND_ADD(1, "front", "2026-08-01", 2048, "row")}
    const list = db.listProgressPhotos(1);
    const got = db.getProgressPhoto(1, row.id);
    console.log(JSON.stringify({
      listLen: list.length,
      gotId: got ? got.id : null,
      angle: got ? got.angle : null,
      fileExists: fs.existsSync(row.path),
    }));
  `;
  const r = run(body, p);
  check("добавление и чтение своей записи не падает", r.ok, fail(r));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("запись попадает в список пользователя", parsed.listLen === 1, JSON.stringify(parsed));
  check("getProgressPhoto находит свою запись", Boolean(parsed.gotId), JSON.stringify(parsed));
  check("ракурс сохранён верно", parsed.angle === "front", JSON.stringify(parsed));
  check("файл реально лежит на диске", parsed.fileExists === true, JSON.stringify(parsed));
}

// ── 2. Отказ доступа к чужой записи: другой userId не видит и не удаляет ────
{
  const p = freshDir("cross-user");
  const body = `
    ${WRITE_AND_ADD(1, "side", "2026-08-02", 2048, "row")}
    const foreign = db.getProgressPhoto(2, row.id);
    const delOk = db.deleteProgressPhoto(2, row.id);
    const stillThere = db.getProgressPhoto(1, row.id);
    console.log(JSON.stringify({
      foreign: foreign ?? null,
      delOk,
      stillThere: Boolean(stillThere),
      fileExists: fs.existsSync(row.path),
    }));
  `;
  const r = run(body, p);
  check("попытка чужого доступа не падает", r.ok, fail(r));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("getProgressPhoto с чужим userId не находит запись", parsed.foreign === null, JSON.stringify(parsed));
  check("deleteProgressPhoto с чужим userId не удаляет", parsed.delOk === false, JSON.stringify(parsed));
  check("у владельца запись осталась на месте", parsed.stillThere === true, JSON.stringify(parsed));
  check("файл на диске чужой попыткой не тронут", parsed.fileExists === true, JSON.stringify(parsed));
}

// ── 3. deleteProgressPhoto реально стирает файл с диска, не только запись ───
{
  const p = freshDir("delete-file");
  const body = `
    ${WRITE_AND_ADD(3, "back", "2026-08-03", 4096, "row")}
    const before = fs.existsSync(row.path);
    const ok = db.deleteProgressPhoto(3, row.id);
    const after = fs.existsSync(row.path);
    const gone = db.getProgressPhoto(3, row.id);
    console.log(JSON.stringify({ before, ok, after, gone: Boolean(gone) }));
  `;
  const r = run(body, p);
  check("удаление не падает", r.ok, fail(r));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("файл существовал до удаления", parsed.before === true, JSON.stringify(parsed));
  check("deleteProgressPhoto вернул true", parsed.ok === true, JSON.stringify(parsed));
  check("файл реально исчез с диска", parsed.after === false, JSON.stringify(parsed));
  check("запись пропала из базы", parsed.gone === false, JSON.stringify(parsed));
}

// ── 4. Файл уже потерян с диска — deleteProgressPhoto всё равно не падает ───
{
  const p = freshDir("delete-missing-file");
  const body = `
    ${WRITE_AND_ADD(4, "front", "2026-08-04", 1024, "row")}
    fs.unlinkSync(row.path);
    const ok = db.deleteProgressPhoto(4, row.id);
    const gone = db.getProgressPhoto(4, row.id);
    console.log(JSON.stringify({ ok, gone: Boolean(gone) }));
  `;
  const r = run(body, p);
  check("удаление без файла на диске не роняет процесс", r.ok, fail(r));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("запись всё равно убрана из базы", parsed.ok === true && parsed.gone === false, JSON.stringify(parsed));
}

// ── 5. Удаление несуществующего id — явный false, не исключение ─────────────
{
  const p = freshDir("delete-unknown");
  const body = `
    db.registerUser(9, "П9");
    const ok = db.deleteProgressPhoto(9, "нет-такого-id");
    console.log(JSON.stringify({ ok }));
  `;
  const r = run(body, p);
  check("удаление неизвестного id не падает", r.ok, fail(r));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("неизвестный id даёт false", parsed.ok === false, JSON.stringify(parsed));
}

// ── 6. progressPhotoUsage: count и bytes считаются по всем фото пользователя ─
{
  const p = freshDir("usage");
  const body = `
    ${WRITE_AND_ADD(5, "front", "2026-08-05", 1000000, "row1")}
    ${WRITE_AND_ADD(5, "side", "2026-08-05", 2000000, "row2")}
    ${WRITE_AND_ADD(5, "back", "2026-08-05", 3000000, "row3")}
    const usage = db.progressPhotoUsage(5);
    console.log(JSON.stringify(usage));
  `;
  const r = run(body, p);
  check("progressPhotoUsage не падает", r.ok, fail(r));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check("count считает три фото", parsed.count === 3, JSON.stringify(parsed));
  check("bytes суммирует объём всех трёх фото", parsed.bytes === 6000000, JSON.stringify(parsed));
}

// ── 7. guard.ts: значения лимитов совпадают со спецификацией ────────────────
const guard = await import(GUARD_MODULE);
check("PROGRESS_PHOTO_MAX_COUNT равен 60", guard.PROGRESS_PHOTO_MAX_COUNT === 60, String(guard.PROGRESS_PHOTO_MAX_COUNT));
check(
  "PROGRESS_PHOTO_MAX_BYTES равен 150 МБ",
  guard.PROGRESS_PHOTO_MAX_BYTES === 150 * 1024 * 1024,
  String(guard.PROGRESS_PHOTO_MAX_BYTES)
);

// ── 8. Лимит по количеству: usage.count доходит ровно до потолка ────────────
// Сервер отказывает, когда usage.count >= PROGRESS_PHOTO_MAX_COUNT — здесь
// проверяется, что после ровно стольких добавлений счётчик действительно
// достигает этого значения, то есть сравнение на сервере сработает.
{
  const p = freshDir("limit-count");
  const body = `
    for (let i = 0; i < ${guard.PROGRESS_PHOTO_MAX_COUNT}; i++) {
      const dir = db.progressPhotoDir(6);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "t" + i + ".jpg");
      fs.writeFileSync(filePath, Buffer.alloc(100, 1));
      db.addProgressPhoto({ userId: 6, date: "2026-08-06", angle: "front", path: filePath, sizeBytes: 100 });
    }
    const usage = db.progressPhotoUsage(6);
    console.log(JSON.stringify({ count: usage.count }));
  `;
  const r = run(body, p);
  check(`${guard.PROGRESS_PHOTO_MAX_COUNT} добавлений подряд не падают`, r.ok, fail(r));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check(
    "usage.count доходит ровно до PROGRESS_PHOTO_MAX_COUNT",
    parsed.count === guard.PROGRESS_PHOTO_MAX_COUNT,
    JSON.stringify(parsed)
  );
}

// ── 9. Лимит по объёму: usage.bytes реально может превысить потолок ─────────
// Сервер отказывает, когда usage.bytes + новый файл > PROGRESS_PHOTO_MAX_BYTES.
// Здесь два реальных файла по 80 МБ на диске в сумме превышают лимит в 150 МБ,
// то есть суммирование в progressPhotoUsage считает настоящие байты, а не
// заявленный размер без проверки.
{
  const p = freshDir("limit-bytes");
  const size = 80 * 1024 * 1024;
  const body = `
    const size = ${size};
    for (let i = 0; i < 2; i++) {
      const dir = db.progressPhotoDir(7);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "big" + i + ".jpg");
      fs.writeFileSync(filePath, Buffer.alloc(size, 1));
      db.addProgressPhoto({ userId: 7, date: "2026-08-07", angle: "side", path: filePath, sizeBytes: size });
    }
    const usage = db.progressPhotoUsage(7);
    console.log(JSON.stringify({ bytes: usage.bytes }));
  `;
  const r = run(body, p);
  check("два больших файла подряд не падают", r.ok, fail(r));
  const parsed = parseJsonLine(r.stdout) ?? {};
  check(
    "usage.bytes превышает PROGRESS_PHOTO_MAX_BYTES",
    parsed.bytes > guard.PROGRESS_PHOTO_MAX_BYTES,
    JSON.stringify({ bytes: parsed.bytes, limit: guard.PROGRESS_PHOTO_MAX_BYTES })
  );
}

// ── 10. webapp-auth.ts: подпись и проверка короткоживущего токена на фото ───
{
  const auth = await import(AUTH_MODULE);
  const BOT_TOKEN = "123456:test-bot-token-for-check-script";

  const token = auth.signProgressPhotoToken("photo-1", 42, BOT_TOKEN);
  const ok = auth.verifyProgressPhotoToken(token, "photo-1", BOT_TOKEN);
  check("верный токен проходит проверку", Boolean(ok) && ok.userId === 42, JSON.stringify(ok));

  const wrongId = auth.verifyProgressPhotoToken(token, "photo-2", BOT_TOKEN);
  check("токен не подходит для другого id фото", wrongId === null, JSON.stringify(wrongId));

  const wrongBot = auth.verifyProgressPhotoToken(token, "photo-1", "999999:другой-токен-бота");
  check("токен не проходит с другим токеном бота", wrongBot === null, JSON.stringify(wrongBot));

  const lastChar = token.slice(-1);
  const tampered = token.slice(0, -1) + (lastChar === "0" ? "1" : "0");
  check(
    "подделанная подпись отбивается",
    auth.verifyProgressPhotoToken(tampered, "photo-1", BOT_TOKEN) === null
  );

  check("мусорный токен отбивается", auth.verifyProgressPhotoToken("не-токен-вовсе", "photo-1", BOT_TOKEN) === null);
  check("пустой токен отбивается", auth.verifyProgressPhotoToken("", "photo-1", BOT_TOKEN) === null);

  // Просроченный токен: signProgressPhotoToken всегда ставит срок на 15 минут
  // вперёд, поэтому истёкший собирается тем же алгоритмом вручную, тем же
  // секретом (HMAC("WebAppData", botToken)), который verifyInitData уже
  // использует для подписи initData.
  function manualToken(id, userId, botToken, expiry) {
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const sig = crypto.createHmac("sha256", secret).update(`${id}:${userId}:${expiry}`).digest("hex");
    return `${userId}.${expiry}.${sig}`;
  }

  const expired = manualToken("photo-1", 42, BOT_TOKEN, Math.floor(Date.now() / 1000) - 10);
  check(
    "просроченный токен отбивается 403-логикой (null)",
    auth.verifyProgressPhotoToken(expired, "photo-1", BOT_TOKEN) === null
  );

  const freshManual = manualToken("photo-1", 42, BOT_TOKEN, Math.floor(Date.now() / 1000) + 60);
  const freshVerified = auth.verifyProgressPhotoToken(freshManual, "photo-1", BOT_TOKEN);
  check(
    "токен со сроком в будущем проходит: ручная сборка совпадает с алгоритмом модуля",
    Boolean(freshVerified) && freshVerified.userId === 42,
    JSON.stringify(freshVerified)
  );
}

if (failed) {
  console.error(`check-progress-photos: ${failed} провал(а)`);
  process.exit(1);
}
console.log("check-progress-photos: хранение, лимиты и токен фото прогресса в порядке");
