/** Проверка очереди канала при сборке. */
import { existsSync, readFileSync } from "fs";
import { extname, join } from "path";
import { createHash } from "crypto";
import { CHANNEL_POSTS } from "../dist/channel/posts.js";

const footer = "Что сделать на этой неделе";
const dupEnds = new Map();
const assetsDir = join(process.cwd(), "assets", "channel");
const mapFile = join(assetsDir, "photo-map.json");
const map = existsSync(mapFile)
  ? JSON.parse(readFileSync(mapFile, "utf-8"))
  : {};

for (const p of CHANNEL_POSTS) {
  const text = p.parts?.join("\n\n") ?? p.body;
  if (text.includes(footer)) {
    console.error(`FAIL: post ${p.id} has old generic footer`);
    process.exit(1);
  }
  const end = text.slice(-100);
  const list = dupEnds.get(end) ?? [];
  list.push(p.id);
  dupEnds.set(end, list);
}

const dup = [...dupEnds.entries()].filter(([, ids]) => ids.length > 1);
if (dup.length) {
  console.error("FAIL: identical endings:", dup.map(([, ids]) => ids.join("=")).join("; "));
  process.exit(1);
}

const hashes = new Map();
for (const p of CHANNEL_POSTS) {
  const rel = map[p.id];
  if (!rel) {
    console.error(`FAIL: no photo-map entry for ${p.id}`);
    process.exit(1);
  }
  const ext = extname(rel).toLowerCase() || ".jpg";
  const file = join(assetsDir, p.id + ext);
  if (!existsSync(file)) {
    console.error(`FAIL: missing asset ${p.id}${ext}`);
    process.exit(1);
  }
  const h = createHash("md5").update(readFileSync(file)).digest("hex");
  const prev = hashes.get(h);
  if (prev) {
    console.error(`FAIL: duplicate photo ${p.id} == ${prev}`);
    process.exit(1);
  }
  hashes.set(h, p.id);
}

const lens = CHANNEL_POSTS.map((p) => (p.parts?.join("") ?? p.body).length);
console.log(
  `OK: ${CHANNEL_POSTS.length} posts, unique endings, unique photos, min ${Math.min(...lens)} chars`
);
