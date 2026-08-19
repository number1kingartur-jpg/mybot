/**
 * Замена Ё на Е во всех текстах канала.
 *
 * Правка механическая и безопасная: русский в этих файлах встречается только
 * в строках и комментариях, в идентификаторах кода его нет. Тире эта правка
 * не трогает, его надо переписывать по смыслу вручную.
 *
 *   node scripts/fix-yo.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const FILES = [
  "scripts/rewrite/wave-r.mjs",
  "src/channel/posts.ts",
  "src/channel/posts-wave5.ts",
  "src/channel/posts-wave6.ts",
];

for (const rel of FILES) {
  const path = join(process.cwd(), rel);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.log(`пропуск ${rel}: файла нет`);
    continue;
  }
  const before = (text.match(/[\u0451\u0401]/g) || []).length;
  if (!before) {
    console.log(`ok ${rel}: Ё нет`);
    continue;
  }
  const fixed = text.replace(/\u0451/g, "\u0435").replace(/\u0401/g, "\u0415");
  writeFileSync(path, fixed, "utf8");
  console.log(`${rel}: заменено ${before}`);
}
