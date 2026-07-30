/**
 * Фото канала @kingmode_fit — только реальные IMG_* из архива CONTENT.
 * Приоритет: archiveImage из posts.ts, иначе следующее уникальное IMG.
 * node scripts/assign-channel-photos.mjs
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
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

/** Только камера iPhone/Android — без PNG, UUID, AI. */
const IMG_ONLY = /^IMG_\d+\.(jpe?g)$/i;

function collectImgPool() {
  const files = [];
  for (const dir of POOL_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!IMG_ONLY.test(name)) continue;
      const full = join(dir, name);
      if (!statSync(full).isFile()) continue;
      const rel = full.slice(ARCHIVE.length + 1).replace(/\\/g, "/");
      files.push(rel);
    }
  }
  files.sort();
  return files;
}

function resolveArchive(rel) {
  const path = join(ARCHIVE, rel.replace(/\//g, "\\"));
  return existsSync(path) ? path : null;
}

function clearAllAssets(validIds) {
  if (!existsSync(OUT)) return;
  for (const name of readdirSync(OUT)) {
    if (name === "photo-map.json") continue;
    const id = name.replace(/\.(jpe?g|png|webp)$/i, "");
    unlinkSync(join(OUT, name));
  }
}

const pool = collectImgPool();
if (pool.length < CHANNEL_POSTS.length) {
  console.error(`FAIL: need ${CHANNEL_POSTS.length} IMG photos, found ${pool.length}`);
  process.exit(1);
}

const validIds = new Set(CHANNEL_POSTS.map((p) => p.id));
clearAllAssets(validIds);

const map = {};
const used = new Set();

function assign(postId, rel) {
  if (!rel || used.has(rel)) return false;
  if (!resolveArchive(rel)) return false;
  map[postId] = rel;
  used.add(rel);
  return true;
}

// 1) Явный archiveImage из posts.ts
for (const post of CHANNEL_POSTS) {
  if (post.archiveImage) assign(post.id, post.archiveImage);
}

// 2) Остальным — следующее уникальное IMG из пула
for (const post of CHANNEL_POSTS) {
  if (map[post.id]) continue;
  const rel = pool.find((p) => !used.has(p));
  if (!rel) {
    console.error(`FAIL: no unique IMG left for ${post.id}`);
    process.exit(1);
  }
  assign(post.id, rel);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), "utf-8");

let copied = 0;
for (const post of CHANNEL_POSTS) {
  const rel = map[post.id];
  const src = resolveArchive(rel);
  if (!src) {
    console.error("missing", post.id, rel);
    continue;
  }
  const ext = extname(src).toLowerCase() || ".jpg";
  copyFileSync(src, join(OUT, `${post.id}${ext}`));
  copied++;
}

console.log(`photo-map: ${Object.keys(map).length} posts, ${used.size} unique IMG sources, copied ${copied}`);
