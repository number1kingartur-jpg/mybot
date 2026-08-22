/**
 * Жёсткая проверка медиа канала: уникальность + полнота назначений.
 * Входит в npm run build.
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { join, extname } from "path";
import { CHANNEL_POSTS } from "../dist/channel/posts.js";
import { REWRITES } from "./rewrite/wave-r.mjs";
import { MEDIA } from "./rewrite/media-r.mjs";
import { PHOTO_ASSIGNMENTS, QUEUE_ASSET } from "./channel-photo-assignments.mjs";
import { isBannedArchivePath } from "./banned-channel-sources.mjs";

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
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

let fail = 0;
const err = (msg) => {
  console.error(`FAIL: ${msg}`);
  fail++;
};

// 1) PHOTO_ASSIGNMENTS: файл есть, asset не повторяется
const assignAssets = new Map();
for (const [msgId, assetId] of Object.entries(PHOTO_ASSIGNMENTS)) {
  if (!assetPath(assetId)) err(`PHOTO_ASSIGNMENTS #${msgId}: нет файла ${assetId}`);
  const prev = assignAssets.get(assetId);
  if (prev) err(`PHOTO_ASSIGNMENTS: asset ${assetId} на #${prev} и #${msgId}`);
  else assignAssets.set(assetId, msgId);
}

// 2) rewrite photo-посты: назначение или MEDIA photo/shot
for (const r of REWRITES.filter((x) => x.kind === "photo")) {
  if (PHOTO_ASSIGNMENTS[r.id]) continue;
  const m = MEDIA[r.id];
  if (m) {
    const p =
      m.type === "photo" || m.type === "shot"
        ? join(REWRITE, m.out)
        : join(REWRITE, m.out);
    if (!existsSync(p)) err(`MEDIA #${r.id}: нет ${m.out}`);
    continue;
  }
  err(`rewrite photo #${r.id} (${r.title}): нет PHOTO_ASSIGNMENTS и нет MEDIA`);
}

// 3) MEDIA: уникальные out, нет дублей src+ss для loc
const outs = new Map();
const locKeys = new Map();
for (const [id, m] of Object.entries(MEDIA)) {
  const prev = outs.get(m.out);
  if (prev) err(`MEDIA out ${m.out} на #${prev} и #${id}`);
  else outs.set(m.out, id);

  if (m.type === "loc") {
    const key = `${m.src}@${m.ss}`;
    const prevLoc = locKeys.get(key);
    if (prevLoc) err(`MEDIA loc дубль ${key} на #${prevLoc} и #${id}`);
    else locKeys.set(key, id);
  }
}

// 4) активные файлы канала: очередь + rewrite assigns, без сирот с другим ext
const activeNames = new Set();
for (const p of CHANNEL_POSTS) {
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const name = p.id + ext;
    if (existsSync(join(ASSETS, name))) {
      activeNames.add(name);
      break;
    }
  }
}
for (const assetId of Object.values(PHOTO_ASSIGNMENTS)) {
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const name = assetId + ext;
    if (existsSync(join(ASSETS, name))) {
      activeNames.add(name);
      break;
    }
  }
}

const byHash = new Map();
for (const name of activeNames) {
  const p = join(ASSETS, name);
  const h = hashFile(p).slice(0, 16);
  const list = byHash.get(h) ?? [];
  list.push(name);
  byHash.set(h, list);
}
for (const [, files] of byHash.entries()) {
  if (files.length > 1) err(`active assets дубль: ${files.join(" = ")}`);
}

// 5) QUEUE_ASSET → файл существует
for (const [queueId, assetId] of Object.entries(QUEUE_ASSET)) {
  if (!assetPath(assetId)) err(`QUEUE_ASSET ${queueId} → ${assetId}: файла нет`);
}

// 6) Запрещённые исходники (стройка и т.п.)
const map = JSON.parse(
  readFileSync(join(process.cwd(), "assets", "channel", "photo-map.json"), "utf-8")
);
for (const p of CHANNEL_POSTS) {
  const rel = p.archiveImage ?? map[p.id];
  if (isBannedArchivePath(rel)) err(`queue ${p.id}: запрещённый исходник ${rel}`);
}
for (const [id, rel] of Object.entries(map)) {
  if (isBannedArchivePath(rel)) err(`photo-map ${id}: запрещённый исходник ${rel}`);
}

if (fail) {
  console.error(`\n${fail} ошибок медиа`);
  process.exit(1);
}

console.log(
  `OK: media — ${Object.keys(PHOTO_ASSIGNMENTS).length} rewrite assigns, ${Object.keys(MEDIA).length} video/map, ${activeNames.size} active assets, 0 dupes`
);
