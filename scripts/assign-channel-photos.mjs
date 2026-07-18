/**
 * Уникальное фото на каждый пост. Удаляет старые {id}.* перед копированием.
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

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

function collectPhotos() {
  const files = [];
  for (const dir of POOL_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!IMAGE_EXT.test(name)) continue;
      const full = join(dir, name);
      if (!statSync(full).isFile()) continue;
      const rel = full.slice(ARCHIVE.length + 1).replace(/\\/g, "/");
      files.push(rel);
    }
  }
  files.sort();
  return files;
}

function clearPostAssets(postId) {
  if (!existsSync(OUT)) return;
  for (const name of readdirSync(OUT)) {
    if (name === "photo-map.json") continue;
    const base = name.replace(IMAGE_EXT, "");
    if (base === postId) unlinkSync(join(OUT, name));
  }
}

function clearOrphans(validIds) {
  if (!existsSync(OUT)) return;
  let removed = 0;
  for (const name of readdirSync(OUT)) {
    if (name === "photo-map.json") continue;
    if (!IMAGE_EXT.test(name)) continue;
    const id = name.replace(IMAGE_EXT, "");
    if (!validIds.has(id)) {
      unlinkSync(join(OUT, name));
      removed++;
    }
  }
  if (removed) console.log(`removed ${removed} orphan assets`);
}

const pool = collectPhotos();
const validIds = new Set(CHANNEL_POSTS.map((p) => p.id));
clearOrphans(validIds);

if (pool.length < CHANNEL_POSTS.length) {
  console.warn(`warning: only ${pool.length} photos for ${CHANNEL_POSTS.length} posts`);
}

const map = {};
const used = new Set();

for (let i = 0; i < CHANNEL_POSTS.length; i++) {
  const post = CHANNEL_POSTS[i];
  let rel = pool[i % pool.length];
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
  clearPostAssets(post.id);
  const ext = extname(src).toLowerCase() || ".jpg";
  const dest = join(OUT, `${post.id}${ext}`);
  copyFileSync(src, dest);
}

console.log("done — unique photos assigned");
