/**
 * Формат обложки поста канала: вертикаль 2:3, чёрные края, виньетка.
 * Как w5_no_alcohol — картинка сливается с тёмной лентой Telegram.
 *
 * node scripts/format-channel-photo.mjs path/to/in.png [out.png]
 * node scripts/format-channel-photo.mjs --all assets/channel
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { extname, join } from "path";

export const CHANNEL_W = 1024;
export const CHANNEL_H = 1536;

/** scale → чёрный pad → виньетка по краям */
const VF = [
  `scale=${CHANNEL_W}:${CHANNEL_H}:force_original_aspect_ratio=decrease`,
  `pad=${CHANNEL_W}:${CHANNEL_H}:(ow-iw)/2:(oh-ih)/2:color=0x000000`,
  "vignette=angle=PI/2.8:mode=forward:eval=frame",
].join(",");

export function formatChannelPhoto(input, output = input) {
  if (!existsSync(input)) throw new Error(`missing ${input}`);
  const ext = extname(output).toLowerCase();
  const tmp = output + ".fmt.tmp.png";
  mkdirSync(join(output, ".."), { recursive: true });

  execFileSync(
    "ffmpeg",
    ["-y", "-v", "error", "-i", input, "-vf", VF, "-frames:v", "1", tmp],
    { stdio: "inherit" }
  );

  if (ext === ".jpg" || ext === ".jpeg") {
    execFileSync(
      "ffmpeg",
      ["-y", "-v", "error", "-i", tmp, "-q:v", "2", output],
      { stdio: "inherit" }
    );
  } else {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", tmp, output], { stdio: "inherit" });
  }

  unlinkSync(tmp);
}

function formatAll(dir) {
  const imgs = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  for (const f of imgs) {
    const p = join(dir, f);
    if (!statSync(p).isFile()) continue;
    formatChannelPhoto(p, p);
    console.log("format", f);
  }
}

const args = process.argv.slice(2);
const isMain = process.argv[1]?.endsWith("format-channel-photo.mjs");
if (isMain && args[0] === "--all") {
  formatAll(args[1] || join(process.cwd(), "assets", "channel"));
} else if (isMain && args[0]) {
  formatChannelPhoto(args[0], args[1] || args[0]);
  console.log("ok", args[1] || args[0]);
} else if (isMain) {
  console.error("usage: format-channel-photo.mjs <in> [out] | --all [dir]");
  process.exit(1);
}
