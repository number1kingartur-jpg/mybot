/**
 * Проверка текста, который читает человек.
 *
 * Зачем в сборке: правки в интерфейсе делаются по одной строке, и стиль
 * расползается незаметно. Тире вместо запятой, «2 подхода» вместо «2 подходов»,
 * фраза без точки — по отдельности мелочь, вместе приложение выглядит машинным.
 * Проверка держит один стандарт: обычные предложения со знаками препинания.
 *
 * Смотрим только строковые литералы: комментарии в коде пишутся для разработчика,
 * там тире уместно.
 *
 * Запуск: node scripts/check-text.mjs [--list]
 */
import fs from "node:fs";
import path from "node:path";

const FILES = [
  "webapp/js/app.js",
  "webapp/js/api.js",
  "webapp/js/engine.js",
  // Планы тренировок и меню — такой же текст на экране, как остальное. Первая
  // версия проверки их не читала, и в описаниях упражнений тире осталось.
  "webapp/js/plans.js",
  "webapp/js/menus.js",
  "webapp/index.html",
];

const CYR = /[а-яёА-ЯЁ]/;

/**
 * Литерал берём в проверку, если в нём есть русские буквы или тире. Одного
 * условия про буквы мало: фразу нередко склеивают из куска текста и отдельного
 * разделителя `" — "`, и в таком куске букв нет, а тире в готовой строке есть.
 */
const WATCHED = (s) => CYR.test(s) || s.includes("—");

/** Убираем комментарии: иначе половина находок будет из пояснений к коду. */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === "\\") {
        out += ch + (next ?? "");
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** HTML: текст между тегами и значения подписей, но не имена классов и путей. */
function htmlTexts(src) {
  const found = [];
  const withoutTags = src.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  for (const m of withoutTags.matchAll(/>([^<>]+)</g)) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (t && WATCHED(t)) found.push({ text: t, line: 0 });
  }
  for (const m of withoutTags.matchAll(/(?:placeholder|title|alt|aria-label|content)="([^"]+)"/g)) {
    if (WATCHED(m[1])) found.push({ text: m[1], line: 0 });
  }
  return found;
}

/**
 * Строки ищем построчно и без переносов внутри: в JavaScript обычный литерал не
 * может идти через строку, а разрешённый перенос склеивал кавычку с кавычкой из
 * другого места. В находки тогда попадал код, а не текст — по такому отчёту
 * править нечего.
 */
function jsStrings(src) {
  const clean = stripComments(src);
  const found = [];
  clean.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g)) {
      const raw = m[1] ?? m[2] ?? "";
      if (WATCHED(raw)) found.push({ text: raw, line: i + 1 });
    }
  });
  return found;
}

const problems = [];
const all = [];

for (const rel of FILES) {
  const file = path.join(process.cwd(), rel);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, "utf-8");
  const texts = rel.endsWith(".html") ? htmlTexts(src) : jsStrings(src);

  for (const { text, line } of texts) {
    all.push({ rel, text, line });
    const where = `${rel}:${line}`;

    // Тире в фразе: человек так не говорит.
    if (/—/.test(text)) problems.push({ where, text, why: "тире в тексте" });
    if (/ - /.test(text)) problems.push({ where, text, why: "дефис вместо запятой" });
    if (/[а-яё]\s+[,.;:!?]/.test(text)) problems.push({ where, text, why: "пробел перед знаком" });
    if (/\S {2,}\S/.test(text)) problems.push({ where, text, why: "двойной пробел" });
  }
}

const report = [
  ...all.map((a) => `${a.rel}:${a.line}\t${a.text}`),
  "",
  `всего строк с текстом: ${all.length}`,
  "",
  ...problems.map((p) => `ЗАМЕЧАНИЕ [${p.why}] ${p.where}\t${p.text}`),
  `замечаний: ${problems.length}`,
].join("\n");
fs.mkdirSync(".tmp-try", { recursive: true });
fs.writeFileSync(path.join(".tmp-try", "text-report.txt"), report, "utf-8");

if (problems.length) {
  console.error(`check-text: ${problems.length} замечан(ий), список в .tmp-try/text-report.txt`);
  process.exit(1);
}
console.log(`check-text: текст в порядке (${all.length} строк)`);
