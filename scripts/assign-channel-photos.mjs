/**
 * Уникальное фото на каждый пост (без повторов источника).
 * node scripts/assign-channel-photos.mjs && node scripts/sync-channel-photos.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import { extname, join } from "path";
import { CHANNEL_POSTS } from "../dist/channel/posts.js";

const CONTENT_ROOT =
  process.env.CONTENT_ROOT?.trim() ||
  "C:\\Users\\admin\\OneDrive\\Desktop\\CONTENT";
const ARCHIVE = join(CONTENT_ROOT, "brand", "media-archive");
const OUT = join(process.cwd(), "assets", "channel");
const MAP_FILE = join(OUT, "photo-map.json");

const POOL_DIRS = [
  join(ARCHIVE, "master", "photos"),
  join(ARCHIVE, "2026-07-11-icloud", "photos"),
];

function collectPhotos() {
  const files = [];
  for (const dir of POOL_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
      const full = join(dir, name);
      if (!statSync(full).isFile()) continue;
      const rel = full.slice(ARCHIVE.length + 1).replace(/\\/g, "/");
      files.push(rel);
    }
  }
  files.sort();
  return files;
}

const pool = collectPhotos();
if (pool.length < CHANNEL_POSTS.length) {
  console.warn(`warning: only ${pool.length} photos for ${CHANNEL_POSTS.length} posts`);
}

const map = {};
const used = new Set();

for (let i = 0; i < CHANNEL_POSTS.length; i++) {
  const post = CHANNEL_POSTS[i];
  let rel = pool[i % pool.length];
  // избегаем повтора источника подряд
  if (used.has(rel) && pool.length > used.size) {
    rel = pool.find((p) => !used.has(p)) ?? rel;
  }
  used.add(rel);
  map[post.id] = rel;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), "utf-8");
console.log(`photo-map: ${Object.keys(map).length} posts, ${used.size} unique sources`);

for (const post of CHANNEL_POSTS) {
  const rel = map[post.id];
  if (!rel) continue;
  const src = join(ARCHIVE, rel.replace(/\//g, "\\"));
  if (!existsSync(src)) {
    console.log(post.id, "missing", rel);
    continue;
  }
  const ext = extname(src).toLowerCase() || ".jpg";
  const dest = join(OUT, `${post.id}${ext}`);
  copyFileSync(src, dest);
}

console.log("done — unique photos assigned");
