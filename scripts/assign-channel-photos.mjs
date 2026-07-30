/**
 * Фото канала — только archiveImage из posts.ts (твои кадры).
 * Повтор одного фото на разных постах — нормально.
 * node scripts/assign-channel-photos.mjs
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
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

function resolveArchive(rel) {
  const path = join(ARCHIVE, rel.replace(/\//g, "\\"));
  return existsSync(path) ? path : null;
}

function clearAllAssets() {
  if (!existsSync(OUT)) return;
  for (const name of readdirSync(OUT)) {
    if (name === "photo-map.json") continue;
    unlinkSync(join(OUT, name));
  }
}

clearAllAssets();

const map = {};
const missing = [];

for (const post of CHANNEL_POSTS) {
  const rel = post.archiveImage;
  if (!rel) {
    missing.push(post.id);
    continue;
  }
  if (!resolveArchive(rel)) {
    missing.push(`${post.id} (${rel})`);
    continue;
  }
  map[post.id] = rel;
}

if (missing.length) {
  console.error("FAIL: no archiveImage or file missing:", missing.join(", "));
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), "utf-8");

let copied = 0;
for (const post of CHANNEL_POSTS) {
  const rel = map[post.id];
  const src = resolveArchive(rel);
  const ext = extname(src).toLowerCase() || ".jpg";
  copyFileSync(src, join(OUT, `${post.id}${ext}`));
  copied++;
}

const unique = new Set(Object.values(map));
console.log(
  `photo-map: ${Object.keys(map).length} posts, ${unique.size} unique sources, copied ${copied}`
);
