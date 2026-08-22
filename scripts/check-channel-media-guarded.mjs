/**
 * Обёртка над check-channel-media.mjs: этот скрипт и часть его зависимостей
 * (channel-photo-assignments.mjs, banned-channel-sources.mjs) не закоммичены
 * в git — это отдельный, ещё не завершённый контент-пайплайн канала, не
 * относящийся к работе самого бота/приложения. Без обёртки его отсутствие
 * останавливает всю сборку раньше проверок движка (foods, meals, db, guard,
 * access, metrics, progress-photos), хотя они друг от друга не зависят.
 *
 * Если файл присутствует (в оригинальном репозитории на диске, или после
 * того как контент-пайплайн будет закоммичен) — проверка выполняется как
 * обычно и красным падает по-настоящему, если сама она не проходит.
 */
import { existsSync } from "fs";
import { pathToFileURL } from "url";
import path from "path";

const target = path.resolve("scripts/check-channel-media.mjs");

if (!existsSync(target)) {
  console.log(
    "check-channel-media: ПРОПУЩЕНО — скрипт не закоммичен в этой копии " +
      "(контент-пайплайн канала, не часть работы приложения)."
  );
  process.exit(0);
}

await import(pathToFileURL(target).href);
