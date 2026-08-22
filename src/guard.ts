/**
 * Защита процесса: частота запросов, очередь фото, разбор JSON.
 * Без этого один человек выжигает Gemini, память и Telegram API, а приложение
 * выглядит «упавшим» для всех остальных.
 */

type Bucket = { n: number; reset: number };

const buckets = new Map<string, Bucket>();
let takes = 0;

function prune(now: number): void {
  if (takes % 200 !== 0) return;
  for (const [k, v] of buckets) {
    if (v.reset <= now) buckets.delete(k);
  }
}

/** true = можно, false = лимит. */
export function take(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  takes += 1;
  prune(now);
  const row = buckets.get(key);
  if (!row || row.reset <= now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  if (row.n >= limit) return false;
  row.n += 1;
  return true;
}

export function clientIp(req: { headers: { [k: string]: string | string[] | undefined } }): string {
  const raw = req.headers["x-forwarded-for"];
  const first = (Array.isArray(raw) ? raw[0] : raw ?? "").split(",")[0].trim();
  if (first && first.length <= 64) return first;
  return "unknown";
}

export function safeJson(raw: string): unknown {
  if (!raw || !raw.trim()) return {};
  if (raw.length > 12 * 1024 * 1024) throw new Error("payload_too_large");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("bad_json");
  }
}

const photoBusy = new Set<number>();
let photoGlobal = 0;
const PHOTO_GLOBAL_MAX = 2;

// Фотопротокол прогресса тела: лимиты на пользователя, не на процесс. Фото не
// удаляются автоматически, поэтому без потолка один человек мог бы залить том
// целиком — эти цифры дают понятную ошибку задолго до того.
export const PROGRESS_PHOTO_MAX_COUNT = 60;
export const PROGRESS_PHOTO_MAX_BYTES = 150 * 1024 * 1024;

export function beginPhoto(userId: number): "ok" | "user" | "busy" {
  if (photoBusy.has(userId)) return "user";
  if (photoGlobal >= PHOTO_GLOBAL_MAX) return "busy";
  photoBusy.add(userId);
  photoGlobal += 1;
  return "ok";
}

export function endPhoto(userId: number): void {
  if (photoBusy.delete(userId)) photoGlobal = Math.max(0, photoGlobal - 1);
}

export function resolveUnder(rootDir: string, urlPath: string, pathMod: { resolve: (...p: string[]) => string; sep: string }): string | null {
  let rel: string;
  try {
    rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath).replace(/^[/\\]+/, "");
  } catch {
    return null;
  }
  if (!rel || rel.includes("\0")) return null;
  const parts = rel.split(/[/\\]+/);
  if (parts.some((p) => p === ".." || p === "." || p.startsWith("."))) return null;
  const root = pathMod.resolve(rootDir);
  const full = pathMod.resolve(root, rel);
  if (full !== root && !full.startsWith(root + pathMod.sep)) return null;
  return full;
}
