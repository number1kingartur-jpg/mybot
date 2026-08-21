/**
 * Проверка замков: частота, путь раздачи, JSON. Живой Telegram не дергаем.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const g = await import(pathToFileURL(path.resolve("dist/guard.js")).href);

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) return;
  failed++;
  console.error(`ПРОВАЛ: ${name}${detail ? ` → ${detail}` : ""}`);
}

check("json empty", JSON.stringify(g.safeJson("")) === "{}");
check("json obj", g.safeJson('{"a":1}').a === 1);
try {
  g.safeJson("{");
  check("json bad", false);
} catch (e) {
  check("json bad", e instanceof Error && e.message === "bad_json");
}

const root = path.resolve("webapp");
check("path ok", g.resolveUnder(root, "/js/app.js", path)?.endsWith(`${path.sep}js${path.sep}app.js`));
check("path climb", g.resolveUnder(root, "/js/../../src/index.ts", path) === null);
check("path dot", g.resolveUnder(root, "/.env", path) === null);
check("path bad pct", g.resolveUnder(root, "/%E0%A4%A", path) === null);

for (let i = 0; i < 5; i++) g.take("t:one", 5, 60_000);
check("rate allow 5", g.take("t:one", 5, 60_000) === false);
check("rate other", g.take("t:two", 5, 60_000) === true);

check("photo first", g.beginPhoto(1) === "ok");
check("photo same", g.beginPhoto(1) === "user");
check("photo second", g.beginPhoto(2) === "ok");
check("photo third", g.beginPhoto(3) === "busy");
g.endPhoto(1);
g.endPhoto(2);
check("photo after", g.beginPhoto(3) === "ok");
g.endPhoto(3);

check("ip proto", g.clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }) === "1.2.3.4");

if (failed) {
  console.error(`check-guard: ${failed} провал(а)`);
  process.exit(1);
}
console.log("check-guard: ок");
