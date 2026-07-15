import { existsSync } from "fs";
import { join } from "path";
import { InputFile } from "grammy";
import type { ChannelPost } from "./posts";

const ASSETS_DIR = join(__dirname, "..", "..", "assets", "channel");

/** Desktop\CONTENT — см. CONTENT/brand/INDEX.md */
const CONTENT_ROOT =
  process.env.CONTENT_ROOT?.trim() ||
  "C:\\Users\\admin\\OneDrive\\Desktop\\CONTENT";
const ARCHIVE_ROOT = join(CONTENT_ROOT, "brand", "media-archive");

function resolvePath(rel: string): string | undefined {
  const path = join(ARCHIVE_ROOT, rel.replace(/\//g, "\\"));
  return existsSync(path) ? path : undefined;
}

/** 1) assets/channel (деплой) → 2) фото Артура из CONTENT → 3) generated в CONTENT */
export function postImageFile(post: ChannelPost): InputFile | undefined {
  const candidates: string[] = [];

  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    candidates.push(join(ASSETS_DIR, post.id + ext));
  }

  if (post.image) candidates.push(join(ASSETS_DIR, post.image));

  if (post.archiveImage) {
    const p = resolvePath(post.archiveImage);
    if (p) candidates.push(p);
  }

  if (post.generatedImage) {
    const p = resolvePath(post.generatedImage);
    if (p) candidates.push(p);
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      return new InputFile(path, path.split(/[/\\]/).pop()!);
    }
  }

  if (post.archiveImage || post.generatedImage || post.image) {
    console.warn(`channel image missing for ${post.id}`);
  }
  return undefined;
}
