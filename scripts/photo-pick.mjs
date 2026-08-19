// Отбор исходников из candidates.json по индексам с контактных листов.
// Копирует выбранные кадры в отдельную папку под понятными именами,
// чтобы дальше подставлять их в генерацию как reference.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, extname } from "node:path";

const SCAN = "C:/Users/admin/OneDrive/Desktop/AKF-PRIMERY/_scan";
const OUT = "C:/Users/admin/OneDrive/Desktop/AKF-PRIMERY/_source";

const PICKS = [
  { i: 210, name: "beach-stand" },
  { i: 240, name: "viewpoint-back" },
  { i: 262, name: "viewpoint-hips" },
  { i: 308, name: "beach-portrait" },
  { i: 318, name: "beach-arms" },
  { i: 415, name: "railing-shirt-back" },
  { i: 433, name: "railing-shirt-front" },
  { i: 512, name: "waterfall-tshirt" },
  { i: 529, name: "tank-outdoor" },
  { i: 640, name: "gym-shirtless" },
  { i: 675, name: "track-run" },
  { i: 788, name: "balcony-city" },
  { i: 1195, name: "gym-fullbody" },
  { i: 1385, name: "indoor-shorts" },
  { i: 1491, name: "indoor-flex" },
  { i: 1653, name: "gym-purple" },
  { i: 1790, name: "stadium-tank" },
  { i: 1812, name: "stadium-track" },
  { i: 1864, name: "bench-press" },
  { i: 1731, name: "gym-flex" },
];

// PowerShell пишет UTF8 с BOM — Node на нём падает.
const raw = readFileSync(join(SCAN, "candidates.json"), "utf8").replace(/^\uFEFF/, "");
const list = JSON.parse(raw);
mkdirSync(OUT, { recursive: true });

const picked = [];
for (const p of PICKS) {
  const item = list[p.i];
  if (!item) {
    console.log(`нет индекса ${p.i}`);
    continue;
  }
  const ext = extname(item.path).toLowerCase();
  const dest = join(OUT, `${p.name}${ext}`);
  copyFileSync(item.path, dest);
  picked.push({ ...p, src: item.path, dest, w: item.w, h: item.h });
  console.log(`${p.i} -> ${p.name}${ext}  (${item.w}x${item.h})  ${item.name}`);
}

writeFileSync(join(OUT, "picked.json"), JSON.stringify(picked, null, 2), "utf8");
console.log(`\nотобрано: ${picked.length}`);
