/**
 * Проверка замка Mini App на уровне checkAccess(): сеть и битые ответы
 * Telegram не должны выгонять живого подписчика.
 *
 * check-access.mjs проверяет isMemberStatus/parseMemberApi/joinUrl/accessEnabled
 * по отдельности — это чистые функции без сети. Здесь другое: сама сетевая
 * логика внутри telegramMember() (она не экспортирована и вызывает fetch
 * напрямую), которая решает, что значит «не удалось проверить» против
 * «точно не подписан». Два реальных бага здесь уже были: сбой сети и
 * ok:false (например 429 при наплыве после поста в канале) когда-то
 * трактовались как «не подписан» вместо «неизвестно» — оба чинили в
 * src/access.ts, но ни один тест это не подтверждал.
 *
 * Прямого доступа к telegramMember() нет (не экспортирована), поэтому
 * дергаем её через checkAccess() и подменяем global.fetch в дочернем
 * процессе — так же, как check-access.mjs уже подменяет process.env через
 * spawnSync. Это немного менее «юнитово», чем прямой вызов, но честно
 * покрывает ровно то поведение, которое сломалось: fail-open при сбое и
 * fail-closed при подтверждённом «left»/«kicked».
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ACCESS = pathToFileURL(path.resolve("dist/access.js")).href;

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) return;
  failed++;
  console.error(`ПРОВАЛ: ${name}${detail ? ` → ${detail}` : ""}`);
}

// Дочерний процесс: своя подмена global.fetch (чтобы реальный Telegram не
// трогать) + свой userId (чтобы кэш checkAccess не мешал соседним кейсам).
function runWithFetch(fetchBody, env, userId) {
  const code = `
const a = await import(${JSON.stringify(ACCESS)});
globalThis.fetch = async () => (${fetchBody});
const r = await a.checkAccess({ userId: ${userId}, botToken: "TEST_TOKEN", owner: false });
console.log(JSON.stringify(r));
`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: {
      ...process.env,
      ACCESS_GATE: "1",
      ACCESS_CHAT_ID: "@kingmode_fit",
      ...env,
    },
    encoding: "utf-8",
  });
  return {
    status: r.status,
    out: (r.stdout ?? "").trim(),
    err: (r.stderr ?? "").trim(),
  };
}

// (a) сеть упала (таймаут/обрыв/DNS) — fetch кидает исключение.
const netError = runWithFetch(
  `(() => { throw new Error("network down"); })()`,
  {},
  1001
);
check(
  "сбой сети → fail-open (ok:true), не блокируем",
  netError.status === 0 && JSON.parse(netError.out || "{}").ok === true,
  netError.out + netError.err
);

// (b) Telegram ответил валидным JSON, но ok:false — например 429 при
// наплыве людей сразу после поста в канале, протухший токен, битый chat_id.
const rateLimited = runWithFetch(
  `{ json: async () => ({ ok: false, error_code: 429, description: "Too Many Requests: retry after 1" }) }`,
  {},
  1002
);
check(
  "ok:false (429 и т.п.) → fail-open (ok:true), НЕ «не подписан»",
  rateLimited.status === 0 && JSON.parse(rateLimited.out || "{}").ok === true,
  rateLimited.out + rateLimited.err
);

// (c) Telegram подтвердил: пользователь вышел/забанен — это уже точный
// отказ, кэшируется и должен звать вступить.
for (const status of ["left", "kicked"]) {
  const res = runWithFetch(
    `{ json: async () => ({ ok: true, result: { status: "${status}" } }) }`,
    {},
    2000 + status.length
  );
  let body;
  try {
    body = JSON.parse(res.out || "{}");
  } catch {
    body = {};
  }
  check(
    `status=${status} → подтверждённый отказ (ok:false, есть body.url/message)`,
    res.status === 0 && body.ok === false && body.body?.error === "join",
    res.out + res.err
  );
}

// (d) Telegram подтвердил членство в разных статусах — доступ открыт.
for (const status of ["member", "administrator", "creator", "restricted"]) {
  const res = runWithFetch(
    `{ json: async () => ({ ok: true, result: { status: "${status}" } }) }`,
    {},
    3000 + status.length
  );
  let body;
  try {
    body = JSON.parse(res.out || "{}");
  } catch {
    body = {};
  }
  check(
    `status=${status} → подтверждённый доступ (ok:true)`,
    res.status === 0 && body.ok === true,
    res.out + res.err
  );
}

if (failed) {
  console.error(`check-access-gate: ${failed} провал(а)`);
  process.exit(1);
}
console.log("check-access-gate: ок");
