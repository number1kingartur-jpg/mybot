/**
 * Подготовка живого материала для канала в assets/rewrite-media.
 *
 * clip:  съемка упражнения уже 720x1280 и без звука, копируется как есть.
 * loc:   кусок видео обрезается по времени, звук снимается (в архиве это ветер
 *        и дорога), кадр приводится к вертикали 720 по ширине. Тем же типом
 *        режется съемка упражнения, когда полезна только часть клипа.
 * shot:  один кадр в полном качестве, когда исходник короче трех секунд.
 * photo: предметный кадр, копируется как есть; ставится туда, где живого
 *        материала под тему нет, и подделывать его нечем.
 *
 *   node scripts/prep-media.mjs
 */
import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { MEDIA } from "./rewrite/media-r.mjs";

const OUT = join(process.cwd(), "assets", "rewrite-media");
mkdirSync(OUT, { recursive: true });

const ff = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });

let done = 0;
const missing = [];

for (const [id, m] of Object.entries(MEDIA)) {
  if (!existsSync(m.src)) {
    missing.push(`${id}: нет исходника ${m.src}`);
    continue;
  }
  const dst = join(OUT, m.out);

  if (m.type === "clip" || m.type === "photo") {
    copyFileSync(m.src, dst);
  } else if (m.type === "loc") {
    ff([
      "-ss", String(m.ss),
      "-i", m.src,
      "-t", String(m.dur),
      "-an",
      "-vf", "scale=720:-2",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      dst,
    ]);
  } else if (m.type === "shot") {
    ff(["-ss", String(m.ss), "-i", m.src, "-frames:v", "1", "-q:v", "2", dst]);
  }

  const kb = Math.round(statSync(dst).size / 1024);
  console.log(`${id.padStart(3)} ${m.type.padEnd(4)} ${m.out.padEnd(26)} ${kb} КБ`);
  done++;
}

console.log(`\nготово: ${done} из ${Object.keys(MEDIA).length}`);
if (missing.length) {
  console.error(missing.join("\n"));
  process.exit(1);
}
