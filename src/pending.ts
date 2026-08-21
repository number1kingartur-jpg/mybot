import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { MealAnalysis } from "./meal";

/**
 * Разобранный, но ещё не записанный приём пищи.
 *
 * Цифры живут на сервере, наружу уходит только короткий токен. Иначе
 * подтверждение пришлось бы принимать вместе с калориями от клиента.
 *
 * Один слот на человека: новый разбор заменяет старый. Иначе после правки
 * веса клиент держит один токен, а dayState отдаёт другой — «Да» ловит 410.
 *
 * Файл рядом с базой: память умирает при деплое, а карточка «это оно» на
 * телефоне остаётся. Без файла первое «Записать» после выкладки пишет
 * «разбор устарел».
 */
export interface PendingMeal {
  meal: MealAnalysis;
  /** День, к которому относится приём: подтверждение может прийти после полуночи. */
  date: string;
  /** Чем разобрано — для лога: `photo` или `text`. */
  source: "photo" | "text";
  createdAt: number;
}

type Slot = { token: string; pending: PendingMeal };

const TTL_MS = 30 * 60 * 1000;

const byUser = new Map<number, Slot>();

function pendingPath(): string {
  const data = process.env.DATA_PATH;
  if (data) return path.join(path.dirname(data), "pending.json");
  return path.join(__dirname, "..", "pending.json");
}

function persist(): void {
  try {
    const rows: Record<string, Slot> = {};
    for (const [id, slot] of byUser) rows[String(id)] = slot;
    const file = pendingPath();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rows));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("pending persist:", e instanceof Error ? e.message : e);
  }
}

function hydrate(): void {
  const file = pendingPath();
  if (!fs.existsSync(file)) return;
  try {
    const rows = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, Slot>;
    const now = Date.now();
    for (const [id, slot] of Object.entries(rows ?? {})) {
      if (!slot?.token || !slot.pending) continue;
      if (now - slot.pending.createdAt > TTL_MS) continue;
      byUser.set(Number(id), slot);
    }
  } catch {
    /* битый файл — человек сфотографирует заново */
  }
}

hydrate();

function sweep(): void {
  const now = Date.now();
  let dirty = false;
  for (const [id, slot] of byUser) {
    if (now - slot.pending.createdAt > TTL_MS) {
      byUser.delete(id);
      dirty = true;
    }
  }
  if (dirty) persist();
}

export function putPending(userId: number, meal: MealAnalysis, date: string, source: "photo" | "text"): string {
  sweep();
  const token = crypto.randomBytes(8).toString("hex");
  byUser.set(userId, { token, pending: { meal, date, source, createdAt: Date.now() } });
  persist();
  return token;
}

/**
 * Забрать разбор под запись. Одноразово: два нажатия «Да» подряд не должны
 * давать две записи об одной тарелке.
 *
 * Чужой токен того же человека принимаем: после замены слота на телефоне
 * мог остаться прежний.
 */
export function takePending(userId: number, token: string): PendingMeal | null {
  sweep();
  const slot = byUser.get(userId);
  if (!slot) return null;
  if (token && slot.token !== token) {
    /* слот один — это та же тарелка, не чужой разбор */
  }
  byUser.delete(userId);
  persist();
  return slot.pending;
}

export function peekPending(userId: number, token: string): PendingMeal | null {
  sweep();
  const slot = byUser.get(userId);
  if (!slot) return null;
  if (token && slot.token !== token) return slot.pending;
  return slot.pending;
}

export function updatePending(userId: number, _token: string, meal: MealAnalysis): boolean {
  const slot = byUser.get(userId);
  if (!slot) return false;
  slot.pending.meal = meal;
  persist();
  return true;
}

export function dropPending(userId: number, _token: string): void {
  if (!byUser.has(userId)) return;
  byUser.delete(userId);
  persist();
}

export function latestPending(userId: number): { token: string; pending: PendingMeal } | null {
  sweep();
  return byUser.get(userId) ?? null;
}
