import crypto from "crypto";
import fs from "fs";
import path from "path";
import { isOffImage } from "./product-db";

/**
 * Снимок из приложения — картинка записи, если своего файла в справочнике нет.
 * Каталог не успевает за каждым новым плодом: без этого в дневнике пустой квадрат.
 *
 * Лежит рядом с базой: код на Railway перезаписывается, том — нет.
 */
const ID_RE = /^[a-f0-9]{16,32}$/;

export function thumbsDir(): string {
  const data = process.env.DATA_PATH;
  if (data) return path.join(path.dirname(data), "meal-thumbs");
  return path.join(__dirname, "..", "meal-thumbs");
}

function extOf(mime: string): "jpg" | "png" | "webp" {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/** Сохранить кадр и вернуть публичный путь для `<img>`. */
export function saveMealThumb(buf: Buffer, mime: string): string {
  const id = crypto.randomBytes(12).toString("hex");
  const ext = extOf(mime);
  fs.mkdirSync(thumbsDir(), { recursive: true });
  fs.writeFileSync(path.join(thumbsDir(), `${id}.${ext}`), buf);
  return `/img/meal/${id}.${ext}`;
}

export function readMealThumb(urlPath: string): { buf: Buffer; mime: string } | null {
  const m = urlPath.match(/^\/img\/meal\/([a-f0-9]{16,32})\.(jpg|jpeg|png|webp)$/i);
  if (!m || !ID_RE.test(m[1])) return null;
  const id = m[1];
  const want = m[2].toLowerCase() === "jpeg" ? "jpg" : m[2].toLowerCase();
  const file = path.join(thumbsDir(), `${id}.${want}`);
  if (!fs.existsSync(file)) return null;
  const mime = want === "png" ? "image/png" : want === "webp" ? "image/webp" : "image/jpeg";
  return { buf: fs.readFileSync(file), mime };
}

export function isMealThumbUrl(url: string | undefined): url is string {
  return !!url && /^\/img\/meal\/[a-f0-9]{16,32}\.(jpg|jpeg|png|webp)$/i.test(url);
}

/** Что можно отдать клиенту: OFF или наш кадр с тома. Остальное отсекаем. */
export function publicMealPhoto(url?: string): string | undefined {
  if (!url) return undefined;
  if (isMealThumbUrl(url)) return url;
  if (isOffImage(url)) return url;
  return undefined;
}
