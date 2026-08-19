/**
 * Копирует фото разборов в assets/channel/{id}.ext
 * node scripts/assign-analysis-photos.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { extname, join } from "path";
import { ANALYSIS_PHOTOS } from "../dist/channel/analysis-photos.js";

const CONTENT_ROOT =
  process.env.CONTENT_ROOT?.trim() ||
  "C:\\Users\\admin\\OneDrive\\Desktop\\CONTENT";
const ARCHIVE = join(CONTENT_ROOT, "brand", "media-archive");
const OUT = join(process.cwd(), "assets", "channel");
const MAP_FILE = join(OUT, "photo-map.json");

function resolveArchive(rel) {
  const path = join(ARCHIVE, rel.replace(/\//g, "\\"));
  return existsSync(path) ? path : null;
}

mkdirSync(OUT, { recursive: true });
const map = existsSync(MAP_FILE)
  ? JSON.parse(readFileSync(MAP_FILE, "utf-8"))
  : {};

const missing = [];
for (const [id, rel] of Object.entries(ANALYSIS_PHOTOS)) {
  const src = resolveArchive(rel);
  if (!src) {
    missing.push(`${id}: ${rel}`);
    continue;
  }
  map[id] = rel;
  const ext = extname(src).toLowerCase() || ".jpg";
  copyFileSync(src, join(OUT, `${id}${ext}`));
}

if (missing.length) {
  console.error("FAIL missing:", missing.join("; "));
  process.exit(1);
}

writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), "utf-8");
console.log(`analysis photos: ${Object.keys(ANALYSIS_PHOTOS).length} copied`);
