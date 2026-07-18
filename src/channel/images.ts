import { existsSync, readFileSync } from "fs";
import { extname, join } from "path";
import { InputFile } from "grammy";
import type { ChannelPost } from "./posts";

const ASSETS_DIR = join(__dirname, "..", "..", "assets", "channel");
const MAP_FILE = join(ASSETS_DIR, "photo-map.json");

/** Desktop\CONTENT — только fallback на машине разработчика */
const CONTENT_ROOT =
  process.env.CONTENT_ROOT?.trim() ||
  "C:\\Users\\admin\\OneDrive\\Desktop\\CONTENT";
const ARCHIVE_ROOT = join(CONTENT_ROOT, "brand", "media-archive");

let photoMap: Record<string, string> | undefined;

function loadPhotoMap(): Record<string, string> {
  if (photoMap) return photoMap;
  if (!existsSync(MAP_FILE)) {
    photoMap = {};
    return photoMap;
  }
  photoMap = JSON.parse(readFileSync(MAP_FILE, "utf-8")) as Record<string, string>;
  return photoMap;
}

function resolveArchive(rel: string): string | undefined {
  const path = join(ARCHIVE_ROOT, rel.replace(/\//g, "\\"));
  return existsSync(path) ? path : undefined;
}

/** Одно фото на post.id — из assets/channel (photo-map), без старых дублей .jpg/.jpeg. */
export function postImageFile(post: ChannelPost): InputFile | undefined {
  const map = loadPhotoMap();
  const mapped = map[post.id];

  if (mapped) {
    const ext = extname(mapped).toLowerCase() || ".jpg";
    const local = join(ASSETS_DIR, post.id + ext);
    if (existsSync(local)) {
      return new InputFile(local, `${post.id}${ext}`);
    }
    const archive = resolveArchive(mapped);
    if (archive) {
      return new InputFile(archive, `${post.id}${ext}`);
    }
  }

  // Legacy: один файл {id}.{ext} без map
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const path = join(ASSETS_DIR, post.id + ext);
    if (existsSync(path)) {
      return new InputFile(path, post.id + ext);
    }
  }

  if (mapped) {
    console.warn(`channel image missing for ${post.id} (map: ${mapped})`);
  }
  return undefined;
}
