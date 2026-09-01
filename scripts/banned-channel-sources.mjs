/**
 * Запрещённые исходники для очереди и rewrite.
 * Стройка закрыта в фактуре (19.08.2026) — такие кадры не публикуем.
 */
export const BANNED_ARCHIVE_PATHS = new Set([
  "generated/akf-2026-08/akf-site-dawn.png",
  "generated/akf-real/akf-basement-gym.png",
]);

export function isBannedArchivePath(rel) {
  if (!rel) return false;
  const norm = rel.replace(/\\/g, "/");
  if (BANNED_ARCHIVE_PATHS.has(norm)) return true;
  const base = norm.split("/").pop() ?? "";
  return /site-dawn|basement-gym/i.test(base);
}
