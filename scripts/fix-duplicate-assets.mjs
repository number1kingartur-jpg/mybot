/**
 * Убрать побайтовые дубли в assets/channel: пересобрать из уникальных источников.
 * node scripts/fix-duplicate-assets.mjs
 */
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join, extname } from "path";
import { ASSET_REBUILD } from "./channel-photo-assignments.mjs";
import { formatChannelPhoto } from "./format-channel-photo.mjs";

const ASSETS = join(process.cwd(), "assets", "channel");

function resolve(name) {
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const base = name.replace(/\.(png|jpe?g|webp)$/i, "");
    const p = join(ASSETS, base + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

let ok = 0;
let fail = 0;

for (const [destName, srcName] of ASSET_REBUILD) {
  const src = resolve(srcName);
  const dest = join(ASSETS, destName);
  if (!src) {
    console.error(`SKIP ${destName}: нет источника ${srcName}`);
    fail++;
    continue;
  }
  const tmp = dest + ".rebuild.tmp" + extname(destName);
  copyFileSync(src, tmp);
  formatChannelPhoto(tmp, dest);
  try {
    unlinkSync(tmp);
  } catch {
    /* ok */
  }
  console.log(`${destName} ← ${src.split(/[/\\]/).pop()}`);
  ok++;
}

console.log(`\nготово: ${ok} пересобрано, ${fail} пропущено`);
