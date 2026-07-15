/**
 * Скопировать фото из CONTENT/media-archive в assets/channel для деплоя.
 * node scripts/sync-channel-photos.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { CHANNEL_POSTS } from "../dist/channel/posts.js";

const CONTENT_ROOT =
  process.env.CONTENT_ROOT?.trim() ||
  "C:\\Users\\admin\\OneDrive\\Desktop\\CONTENT";
const ARCHIVE = join(CONTENT_ROOT, "brand", "media-archive");
const OUT = join(process.cwd(), "assets", "channel");

mkdirSync(OUT, { recursive: true });

function pickSource(post) {
  if (post.archiveImage) {
    const p = join(ARCHIVE, post.archiveImage.replace(/\//g, "\\"));
    if (existsSync(p)) return { path: p, kind: "archive" };
  }
  if (post.generatedImage) {
    const p = join(ARCHIVE, post.generatedImage.replace(/\//g, "\\"));
    if (existsSync(p)) return { path: p, kind: "generated" };
  }
  return null;
}

for (const post of CHANNEL_POSTS) {
  const src = pickSource(post);
  if (!src) {
    console.log(post.id, "skip (no image)");
    continue;
  }
  const ext = extname(src.path) || ".jpg";
  const dest = join(OUT, `${post.id}${ext.toLowerCase()}`);
  copyFileSync(src.path, dest);
  console.log(post.id, src.kind, "->", dest.split(/[/\\]/).pop());
}

console.log("done");
