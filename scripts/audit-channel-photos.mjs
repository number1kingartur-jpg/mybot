/**
 * Аудит photo-постов: уникальность файлов + назначение из channel-photo-assignments.
 * node scripts/audit-channel-photos.mjs
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { REWRITES } from "./rewrite/wave-r.mjs";
import { MEDIA } from "./rewrite/media-r.mjs";
import { PHOTO_ASSIGNMENTS, QUEUE_ASSET } from "./channel-photo-assignments.mjs";

const ASSETS = join(process.cwd(), "assets", "channel");
const REWRITE = join(process.cwd(), "assets", "rewrite-media");

function assetPath(id) {
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const p = join(ASSETS, id + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

function hashFile(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
}

function expectedAsset(postId) {
  return PHOTO_ASSIGNMENTS[postId] ?? null;
}

const photos = REWRITES.filter((r) => r.kind === "photo");
const rows = [];
const byHash = new Map();
const usedAssets = new Map();

for (const post of photos) {
  let path = null;
  let assetName = expectedAsset(post.id);

  if (assetName) {
    path = assetPath(assetName);
  } else if (MEDIA[post.id]?.type === "photo" || MEDIA[post.id]?.type === "shot") {
    path = join(REWRITE, MEDIA[post.id].out);
    assetName = MEDIA[post.id].out;
  }

  const h = path && existsSync(path) ? hashFile(path) : "MISSING";
  rows.push({
    id: post.id,
    title: post.title,
    asset: assetName ?? "—",
    file: path?.split(/[/\\]/).pop() ?? "—",
    hash: h,
    kind: MEDIA[post.id] ? MEDIA[post.id].type : "photo",
  });

  if (path && existsSync(path)) {
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(post.id);
    if (!usedAssets.has(assetName)) usedAssets.set(assetName, []);
    usedAssets.get(assetName).push(post.id);
  }
}

console.log("ID  | kind  | title                   | asset                | дубль?");
console.log("----|-------|-------------------------|----------------------|--------");
for (const r of rows) {
  const dupIds = byHash.get(r.hash)?.filter((x) => x !== r.id) ?? [];
  const dupAsset = usedAssets.get(r.asset)?.length > 1 ? `asset×${usedAssets.get(r.asset).length}` : "";
  const dup = r.hash === "MISSING" ? "MISSING" : dupIds.length ? `#${dupIds.join(", #")}` : dupAsset;
  console.log(
    `${String(r.id).padStart(3)} | ${r.kind.padEnd(5)} | ${r.title.slice(0, 23).padEnd(23)} | ${(r.asset ?? "—").slice(0, 20).padEnd(20)} | ${dup}`
  );
}

const dups = [...byHash.entries()].filter(([, ids]) => ids.length > 1);
console.log(`\nГрупп одинаковых файлов (photo rewrite): ${dups.length}`);
for (const [h, ids] of dups) {
  console.log(`  ${h}: посты ${ids.join(", ")}`);
}

const assetDups = [...usedAssets.entries()].filter(([, ids]) => ids.length > 1);
if (assetDups.length) {
  console.log(`\nОдин asset на несколько постов:`);
  for (const [name, ids] of assetDups) console.log(`  ${name}: ${ids.join(", ")}`);
}

const allFiles = readdirSync(ASSETS).filter((f) => !f.includes("photo-map"));
const allByHash = new Map();
for (const f of allFiles) {
  const p = join(ASSETS, f);
  const h = hashFile(p);
  if (!allByHash.has(h)) allByHash.set(h, []);
  allByHash.get(h).push(f);
}
const folderDups = [...allByHash.entries()].filter(([, fs]) => fs.length > 1);
console.log(`\nДубли в assets/channel/: ${folderDups.length} групп`);
for (const [h, fs] of folderDups) {
  console.log(`  ${h}: ${fs.join(", ")}`);
}

const missingAssign = photos.filter((p) => !MEDIA[p.id] && !PHOTO_ASSIGNMENTS[p.id]);
if (missingAssign.length) {
  console.log(`\nWARN: нет назначения для photo-постов: ${missingAssign.map((p) => p.id).join(", ")}`);
}

const exitCode = dups.length + folderDups.length + missingAssign.length > 0 ? 1 : 0;
process.exit(exitCode);
