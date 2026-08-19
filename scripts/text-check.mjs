/**
 * Проверка набора знаков в текстах канала: тире и буква Ё запрещены.
 *
 * Требование Артура от 19.08.2026. Правило механическое, поэтому проверяется
 * кодом, а не глазами: раньше такие договорённости жили в голове агента и
 * терялись через сессию.
 *
 * Дефис внутри слова (по-другому, из-за, что-то) разрешён, ловятся только
 * длинное тире U+2014 и среднее U+2013.
 *
 *   node scripts/text-check.mjs
 */
import { readFileSync } from "fs";
import { join } from "path";

const FILES = [
  "scripts/rewrite/wave-r.mjs",
  "src/channel/posts.ts",
  "src/channel/posts-wave5.ts",
  "src/channel/posts-wave6.ts",
];

const DASH = /[\u2013\u2014]/;
const YO = /[\u0451\u0401]/;

let bad = 0;
for (const rel of FILES) {
  let text;
  try {
    text = readFileSync(join(process.cwd(), rel), "utf8");
  } catch {
    console.log(`пропуск ${rel}: файла нет`);
    continue;
  }

  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    const dash = DASH.test(line);
    const yo = YO.test(line);
    if (dash || yo) {
      const what = [dash ? "тире" : null, yo ? "Ё" : null].filter(Boolean).join(" и ");
      hits.push(`  ${i + 1}: ${what}  ${line.trim().slice(0, 90)}`);
    }
  });

  if (hits.length) {
    bad += hits.length;
    console.error(`${rel}: ${hits.length} строк`);
    console.error(hits.join("\n"));
  } else {
    console.log(`ok ${rel}`);
  }
}

if (bad) {
  console.error(`\nвсего строк с нарушением: ${bad}`);
  process.exit(1);
}
console.log("\nнабор знаков чистый");
