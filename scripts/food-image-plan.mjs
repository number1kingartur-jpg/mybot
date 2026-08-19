/**
 * План картинок справочника: какие файлы нужны и каких ещё нет.
 *
 * Картинка блюда не пишется кодом: файл рисуется отдельно и кладётся в
 * `webapp/img/food/<слаг>.webp`. Этот список — способ не запутаться в сотне
 * позиций и видеть, что осталось.
 */
import fs from "node:fs";
import path from "node:path";
import { FOODS, foodSlug } from "../dist/foods.js";

const DIR = path.join("webapp", "img", "food");
const have = fs.existsSync(DIR)
  ? new Set(fs.readdirSync(DIR).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)))
  : new Set();

const rows = FOODS.map((f) => ({ name: f.name, slug: foodSlug(f.name), category: f.category }));
const missing = rows.filter((r) => !have.has(r.slug));
const extra = [...have].filter((slug) => !rows.some((r) => r.slug === slug));

if (process.argv.includes("--missing")) {
  for (const r of missing) console.log(`${r.slug}\t${r.name}`);
} else {
  console.log(`Позиций: ${rows.length} · есть: ${rows.length - missing.length} · нет: ${missing.length}`);
  if (extra.length) console.log(`Лишние файлы (позиции переименованы): ${extra.join(", ")}`);
  for (const r of rows) console.log(`${have.has(r.slug) ? "+" : " "} ${r.slug.padEnd(32)} ${r.name}`);
}
