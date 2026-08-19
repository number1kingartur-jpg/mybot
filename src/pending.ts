import crypto from "crypto";
import type { MealAnalysis } from "./meal";

/**
 * Разобранный, но ещё не записанный приём пищи.
 *
 * Зачем: распознавание — это догадка, и раньше она попадала в дневник молча.
 * Человек видел итоговую цифру уже внутри дня и не знал, что именно модель
 * приняла за еду; исправить можно было только удалением записи. Теперь разбор
 * сначала показывается с составом и допущениями, а в дневник идёт по ответу
 * «да, это оно».
 *
 * Цифры живут на сервере, наружу уходит только короткий токен. Иначе
 * подтверждение пришлось бы принимать вместе с калориями от клиента, и любая
 * запись стала бы «сколько скажут», а не «сколько посчитано».
 *
 * Память, а не база: неподтверждённый разбор ничего не значит после перезапуска —
 * человек просто сфотографирует заново. Держать такое на диске не за что.
 */
export interface PendingMeal {
  meal: MealAnalysis;
  /** День, к которому относится приём: подтверждение может прийти после полуночи. */
  date: string;
  /** Чем разобрано — для лога: `photo` или `text`. */
  source: "photo" | "text";
  createdAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const MAX = 500;

const store = new Map<string, PendingMeal>();

function key(userId: number, token: string): string {
  return `${userId}:${token}`;
}

/** Просроченное выкидываем при каждой записи: отдельный таймер тут не нужен. */
function sweep(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > TTL_MS) store.delete(k);
  }
  if (store.size > MAX) {
    const oldest = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [k] of oldest.slice(0, store.size - MAX)) store.delete(k);
  }
}

export function putPending(userId: number, meal: MealAnalysis, date: string, source: "photo" | "text"): string {
  sweep();
  const token = crypto.randomBytes(8).toString("hex");
  store.set(key(userId, token), { meal, date, source, createdAt: Date.now() });
  return token;
}

/**
 * Забрать разбор под запись. Одноразово: два нажатия «Да» подряд (двойной тап,
 * повтор запроса) не должны давать две записи об одной тарелке.
 */
export function takePending(userId: number, token: string): PendingMeal | null {
  sweep();
  const k = key(userId, token);
  const found = store.get(k);
  if (!found) return null;
  store.delete(k);
  return found;
}

/**
 * Посмотреть разбор, не забирая его: нужно для правки состава до записи.
 * Токен остаётся живым, потому что после правки человек ещё скажет «да».
 */
export function peekPending(userId: number, token: string): PendingMeal | null {
  sweep();
  return store.get(key(userId, token)) ?? null;
}

/** Заменить разбор поправленным. Токен и срок те же: это та же тарелка. */
export function updatePending(userId: number, token: string, meal: MealAnalysis): boolean {
  const found = store.get(key(userId, token));
  if (!found) return false;
  found.meal = meal;
  return true;
}

export function dropPending(userId: number, token: string): void {
  store.delete(key(userId, token));
}
