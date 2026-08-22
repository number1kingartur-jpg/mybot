import fs from "fs";
import path from "path";
import { load, getUsers, mealStreak } from "./db";

export interface RetentionSnapshot {
  usersTotal: number;
  active7d: number;
  active30d: number;
  streakDistribution: { none: number; d1to3: number; d4to6: number; d7plus: number };
  /** null, если файл воронки BABKI\bot не найден (например, в отдельной копии проекта). */
  funnelOverlap: { active7dInFunnel: number; active7dTotal: number } | null;
}

function shiftDate(base: string, deltaDays: number): string {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Активные пользователи за последние `days` дней, включая сегодня: есть запись в
 * тренировках, дневнике еды, воде или взвешивании. Запись веса с source==="profile"
 * не считается — это цифра из анкеты, а не действие пользователя.
 */
export function activeUserIds(days: number, todayStr: string): Set<number> {
  const db = load();
  const from = shiftDate(todayStr, -(days - 1));
  const inRange = (date: string) => date >= from && date <= todayStr;

  const ids = new Set<number>();
  for (const w of db.workouts) if (inRange(w.date)) ids.add(w.userId);
  for (const m of db.meals) if (inRange(m.date)) ids.add(m.userId);
  for (const wa of db.water ?? []) if (inRange(wa.date)) ids.add(wa.userId);
  for (const b of db.bodyweight) if (b.source !== "profile" && inRange(b.date)) ids.add(b.userId);
  return ids;
}

/**
 * Путь к базе пользователей воронки `BABKI\bot` (соседний проект: та же папка `BABKI`,
 * на уровень выше `mybot`, затем `bot/data/users.json`). Переопределяется
 * `FUNNEL_USERS_PATH` — нужно только для `check-metrics.mjs`: реальный файл вне этого
 * проекта трогать нельзя, а без переменной проверить найденный файл было бы нечем.
 */
function funnelUsersPath(): string {
  return process.env.FUNNEL_USERS_PATH ?? path.join(__dirname, "..", "..", "bot", "data", "users.json");
}

/**
 * Telegram ID пользователей воронки. `null` — файла нет или он не разбирается: это
 * отдельный проект, его отсутствие (например, в этой копии) не должно ронять бота.
 *
 * Реальный формат (сверено по `BABKI\bot\data\users.json`):
 * `{ "users": { "<telegram_id>": { ... } }, "pending": [...] }` — id это ключ объекта,
 * отдельного поля telegram_id в реальном файле нет. На случай другого формата данных —
 * запасной разбор массива записей с полем telegram_id/chatId/id.
 */
function readFunnelUserIds(): Set<number> | null {
  const file = funnelUsersPath();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const container =
      raw && typeof raw === "object" && !Array.isArray(raw) && raw.users !== undefined ? raw.users : raw;

    const ids = new Set<number>();
    if (container && typeof container === "object" && !Array.isArray(container)) {
      for (const key of Object.keys(container)) {
        const id = Number(key);
        if (Number.isFinite(id)) ids.add(id);
      }
    } else if (Array.isArray(container)) {
      for (const row of container) {
        const rec = row as Record<string, unknown> | null;
        const id = Number(rec?.telegram_id ?? rec?.chatId ?? rec?.id);
        if (Number.isFinite(id)) ids.add(id);
      }
    }
    return ids;
  } catch {
    return null;
  }
}

function funnelOverlap(active7d: Set<number>): RetentionSnapshot["funnelOverlap"] {
  const funnelIds = readFunnelUserIds();
  if (funnelIds === null) return null;
  let inFunnel = 0;
  for (const id of active7d) if (funnelIds.has(id)) inFunnel++;
  return { active7dInFunnel: inFunnel, active7dTotal: active7d.size };
}

/**
 * Сводка удержания для владельца: сколько людей реально возвращается, а не только
 * сколько всего зарегистрировано. Ничего не пишет, только читает существующую базу.
 */
export function retentionSnapshot(todayStr: string): RetentionSnapshot {
  const usersTotal = getUsers().length;
  const active7dSet = activeUserIds(7, todayStr);
  const active30dSet = activeUserIds(30, todayStr);

  const streakDistribution = { none: 0, d1to3: 0, d4to6: 0, d7plus: 0 };
  for (const id of active7dSet) {
    const days = mealStreak(id, todayStr).days;
    if (days <= 0) streakDistribution.none++;
    else if (days <= 3) streakDistribution.d1to3++;
    else if (days <= 6) streakDistribution.d4to6++;
    else streakDistribution.d7plus++;
  }

  return {
    usersTotal,
    active7d: active7dSet.size,
    active30d: active30dSet.size,
    streakDistribution,
    funnelOverlap: funnelOverlap(active7dSet),
  };
}
