/**
 * Добавить/обновить фото очереди CHANNEL_POSTS в assets/channel.
 * Не удаляет legacy-файлы (nutrition.jpeg, deficit.jpeg и т.д.).
 *
 * node scripts/sync-queue-photos.mjs
 * node scripts/sync-queue-photos.mjs --force w6_plate w7_hydration
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { extname, join } from "path";
import { CHANNEL_POSTS } from "../dist/channel/posts.js";
import { formatChannelPhoto } from "./format-channel-photo.mjs";

const CONTENT_ROOT =
  process.env.CONTENT_ROOT?.trim() ||
  "C:\\Users\\admin\\OneDrive\\Desktop\\CONTENT";
const ARCHIVE = join(CONTENT_ROOT, "brand", "media-archive");
const OUT = join(process.cwd(), "assets", "channel");
const MAP_FILE = join(OUT, "photo-map.json");

const forceIds = new Set(
  process.argv.slice(2).filter((a) => a !== "--force" && !a.startsWith("--"))
);
const forceAll = process.argv.includes("--force-all");

function resolveArchive(rel) {
  const path = join(ARCHIVE, rel.replace(/\//g, "\\"));
  return existsSync(path) ? path : null;
}

mkdirSync(OUT, { recursive: true });
const map = existsSync(MAP_FILE)
  ? JSON.parse(readFileSync(MAP_FILE, "utf-8"))
  : {};

let copied = 0;
let skipped = 0;
const missing = [];

for (const post of CHANNEL_POSTS) {
  const rel = post.archiveImage;
  if (!rel) {
    missing.push(`${post.id}: no archiveImage`);
    continue;
  }
  const src = resolveArchive(rel);
  if (!src) {
    missing.push(`${post.id}: ${rel}`);
    continue;
  }

  map[post.id] = rel;
  const ext = extname(src).toLowerCase() || ".jpg";
  const dest = join(OUT, `${post.id}${ext}`);

  if (existsSync(dest) && !forceAll && !forceIds.has(post.id)) {
    skipped++;
    continue;
  }

  for (const name of readdirSync(OUT)) {
    if (name === "photo-map.json") continue;
    const base = name.replace(/\.(jpe?g|png|webp)$/i, "");
    if (base === post.id && name !== `${post.id}${ext}`) {
      unlinkSync(join(OUT, name));
    }
  }

  copyFileSync(src, dest);
  formatChannelPhoto(dest, dest);
  copied++;
  console.log(`${post.id} ← ${rel.split("/").pop()}`);
}

writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), "utf-8");

console.log(`\nphoto-map: ${Object.keys(map).length} entries, copied ${copied}, skipped ${skipped}`);
if (missing.length) {
  console.error("MISSING:", missing.join("\n"));
  process.exit(1);
}
