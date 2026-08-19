/**
 * Импорт картинок справочника: PNG из папки-источника → webp 256×256 в `webapp/img/food`.
 *
 * Картинки рисуются отдельно и попадают в папку загрузок под именем слага.
 * В приложение они идут сжатыми: миниатюра в списке — 42 пикселя, тащить в
 * Telegram-браузер полноразмерный PNG незачем.
 *
 * Использование: node scripts/food-images-import.mjs <папка-источник>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { FOODS, foodSlug } from "../dist/foods.js";

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("Укажи папку с PNG: node scripts/food-images-import.mjs <папка>");
  process.exit(1);
}

const OUT = path.join("webapp", "img", "food");
fs.mkdirSync(OUT, { recursive: true });

const slugs = new Set(FOODS.map((f) => foodSlug(f.name)));
let done = 0;
let skipped = 0;

for (const file of fs.readdirSync(src)) {
  const ext = path.extname(file).toLowerCase();
  if (ext !== ".png" && ext !== ".jpg" && ext !== ".jpeg" && ext !== ".webp") continue;
  const slug = path.basename(file, ext);
  if (!slugs.has(slug)) {
    skipped++;
    continue;
  }
  const out = path.join(OUT, `${slug}.webp`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", path.join(src, file),
    // Кадр квадратный: обрезаем по короткой стороне, чтобы не плющить блюдо
    "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=256:256:flags=lanczos",
    "-quality", "72",
    out,
  ]);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${slug}.webp — ${kb} КБ`);
  done++;
}

console.log(`\nПеренесено: ${done} · не из справочника: ${skipped}`);
