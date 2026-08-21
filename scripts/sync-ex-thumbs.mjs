/**
 * Единые превью упражнений: кадр из видео Артура, 720 px по ширине, webp.
 * Домашний план раньше тянул AI-квадраты 384×384 — в одной тренировке
 * рядом оказывались разные люди, локации и форматы.
 *
 *   node scripts/sync-ex-thumbs.mjs          план
 *   node scripts/sync-ex-thumbs.mjs --apply  перезаписать webp
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const apply = process.argv.includes("--apply");
const SRC = "C:\\Users\\admin\\OneDrive\\Desktop\\CURSOR\\public\\video\\artur\\exercises";
const OUT = path.join("webapp", "img", "ex");
const DEFAULT_PCT = 0.4;

/** slug → { clip, pct? }. Только кадры из зала; outdoor-ролики в архиве пропускаем. */
const MAP = {
  "prisedaniya-na-stul": { clip: "goblet-squat.mp4", pct: 0.5 },
  "prisedaniya-do-paralleli": { clip: "goblet-squat.mp4", pct: 0.5 },
  "otzhimaniya-ot-steny": { clip: "push-up.mp4", pct: 0.4 },
  "otzhimaniya-ot-opory": { clip: "pike-push-up.mp4", pct: 0.4 },
  "otzhimaniya-ot-pola": { clip: "push-up.mp4", pct: 0.4 },
  "otzhimaniya-s-kolen": { clip: "push-up.mp4", pct: 0.4 },
  "otzhimaniya-s-noskov": { clip: "diamond-push-up.mp4", pct: 0.4 },
  "yagodichnyy-mostik": { clip: "goblet-squat.mp4", pct: 0.5 },
  "yagodichnyy-mostik-na-odnoy-noge": { clip: "walking-lunge.mp4", pct: 0.4 },
  "planka-na-kolenyah": { clip: "plank.mp4", pct: 0.4 },
  planka: { clip: "plank.mp4", pct: 0.4 },
  "vypady-na-meste": { clip: "walking-lunge.mp4", pct: 0.4 },
  "shagayuschie-vypady": { clip: "walking-lunge.mp4", pct: 0.4 },
  supermen: { clip: "romanian-deadlift.mp4", pct: 0.4 },
  "supermen-s-pauzoy": { clip: "romanian-deadlift.mp4", pct: 0.4 },
  skruchivaniya: { clip: "pike-push-up.mp4", pct: 0.4 },
  "skruchivaniya-do-seda": { clip: "pike-push-up.mp4", pct: 0.4 },
  "sgibanie-ruk-s-kanistroy": { clip: "hammer-curl.mp4", pct: 0.4 },
  "razgibanie-ruk-s-kanistroy": { clip: "rope-pushdown.mp4", pct: 0.4 },
  "prisedaniya-s-gantelyu-u-grudi": { clip: "goblet-squat.mp4", pct: 0.5 },
  "zhim-ganteley-lezha": { clip: "dumbbell-bench-press.mp4" },
  "tyaga-ganteli-v-naklone": { clip: "single-arm-dumbbell-row.mp4" },
  "moloty-dvumya-rukami": { clip: "hammer-curl.mp4" },
  "rumynskaya-tyaga-s-gantelyami": { clip: "romanian-deadlift.mp4" },
  "zhim-ganteley-vverh-sidya": { clip: "seated-dumbbell-press.mp4" },
  "tyaga-verhnego-bloka-k-grudi": { clip: "lat-pulldown.mp4" },
  "bolgarskie-split-prisedaniya": { clip: "bulgarian-split-squat.mp4" },
  "tyaga-dvuh-ganteley-v-naklone": { clip: "barbell-row.mp4" },
  "vypady-s-gantelyami": { clip: "walking-lunge.mp4" },
  "stanovaya-tyaga": { clip: "deadlift.mp4" },
  "tyaga-shtangi-v-naklone": { clip: "barbell-row.mp4" },
  podtyagivaniya: { clip: "pull-up.mp4" },
  "mahi-girey": { clip: "kettlebell-swing.mp4" },
  "zhim-giri-stoya": { clip: "kettlebell-press.mp4" },
  "vis-na-turnike": { clip: "dead-hang.mp4" },
  "podnos-noskov-k-perekladine": { clip: "hanging-leg-raise.mp4" },
  "zhim-na-naklonnoy": { clip: "incline-bench-press.mp4" },
  "svedenie-ruk-v-krossovere": { clip: "cable-crossover.mp4" },
  "razgibanie-ruk-s-kanatom": { clip: "rope-pushdown.mp4" },
  "zhim-golovoy-dlya-shei": { clip: "neck-press.mp4" },
  "mahi-giri-do-urovnya-glaz": { clip: "kettlebell-eye-level-swing.mp4" },
  "tyaga-pryamymi-rukami-na-bloke": { clip: "straight-arm-pulldown.mp4" },
  "tyaga-verhnego-bloka-odnoy-rukoy": { clip: "single-arm-lat-pulldown.mp4" },
  "razvedenie-ganteley-v-storony": { clip: "lateral-raise.mp4" },
  "razvedenie-ganteley-v-naklone": { clip: "rear-delt-fly.mp4" },
  "podem-na-noski-stoya": { clip: "standing-calf-raise.mp4" },
  "razvedenie-ganteley-na-naklonnoy": { clip: "incline-dumbbell-fly.mp4" },
  "zhim-ganteley-na-naklonnoy": { clip: "incline-dumbbell-press.mp4" },
  "zhim-shtangi-stoya": { clip: "overhead-press.mp4" },
  "zhim-ganteley-stoya": { clip: "overhead-press.mp4" },
  "rumynskaya-tyaga-na-odnoy-noge": { clip: "romanian-deadlift.mp4" },
};

function dur(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" }
  ).trim();
  const n = Number(out);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function probeSize(file) {
  try {
    return execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file],
      { encoding: "utf8" }
    ).trim();
  } catch {
    return "?";
  }
}

const problems = [];
const plan = [];

for (const [slug, spec] of Object.entries(MAP)) {
  const clip = spec.clip;
  const pct = spec.pct ?? DEFAULT_PCT;
  const video = path.join(SRC, clip);
  const out = path.join(OUT, `${slug}.webp`);
  if (!fs.existsSync(video)) {
    problems.push(`${slug}: нет ${clip}`);
    continue;
  }
  const seconds = dur(video);
  if (seconds <= 0) {
    problems.push(`${slug}: нет длительности ${clip}`);
    continue;
  }
  const t = (seconds * pct).toFixed(2);
  const before = fs.existsSync(out) ? fs.statSync(out).size : 0;
  plan.push({ slug, clip, pct, t, out, before });
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`${apply ? "ПРИМЕНЯЮ" : "ПЛАН"}: ${plan.length} превью из ${SRC}`);

for (const row of plan) {
  const video = path.join(SRC, row.clip);
  if (!apply) {
    console.log(`${row.slug.padEnd(36)} ← ${row.clip} @ ${row.t}s (${Math.round(row.before / 1024)} КБ)`);
    continue;
  }
  const tmp = path.join(os.tmpdir(), `km-ex-${row.slug}.webp`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-ss",
      row.t,
      "-i",
      video,
      "-frames:v",
      "1",
      "-vf",
      "scale=720:-2",
      "-c:v",
      "libwebp",
      "-quality",
      "85",
      tmp,
    ],
    { stdio: "inherit" }
  );
  fs.copyFileSync(tmp, row.out);
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* temp cleanup optional */
  }
  const after = fs.statSync(row.out).size;
  console.log(`ok ${row.slug} ${probeSize(row.out)} ${Math.round(after / 1024)} КБ`);
}

if (!apply) {
  console.log("\nnode scripts/sync-ex-thumbs.mjs --apply");
}
