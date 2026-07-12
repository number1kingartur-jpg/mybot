// Карта восстановления мышечных групп и силовой балл.
// Rule-based аналог фич Fitbod (recovery heat map, Strength Score) — без ML,
// на основе истории тренировок пользователя.

import { getAllWorkouts, getBodyweight } from "./db";

// Порядок важен: первое совпадение выигрывает
// (например, «румынская тяга» должна попасть в ноги, а не в спину по слову «тяга»)
const GROUPS: { name: string; emoji: string; re: RegExp }[] = [
  { name: "Ноги", emoji: "🦵", re: /присед|выпад|жим ногами|румынск|ягодичн|икр|зашагив|разгибания ног|сгибания ног|стул/i },
  { name: "Плечи", emoji: "🔺", re: /жим стоя|жим сидя|вверх сидя|ох жим|армейск|мах|протяжк|дельт/i },
  { name: "Грудь", emoji: "🏋️", re: /жим лёжа|жим лежа|отжиман|брусья|разводк|кроссовер|груд|наклонн/i },
  { name: "Спина", emoji: "🚣", re: /тяга|подтягив|становая|гиперэкстенз|пуловер|блок/i },
  { name: "Руки", emoji: "💪", re: /бицепс|трицепс|молот|сгибания рук|разгибания рук|французск/i },
  { name: "Пресс/кор", emoji: "🧱", re: /планк|скручив|пресс|супермен|подъём ног|подъем ног/i },
];

export function muscleGroupOf(exercise: string): string | null {
  for (const g of GROUPS) if (g.re.test(exercise)) return g.name;
  return null;
}

export type RecoveryStatus = "loaded" | "recovering" | "fresh";

export interface GroupStatus {
  name: string;
  emoji: string;
  lastDate: string | null; // последняя тренировка группы
  daysAgo: number | null;
  status: RecoveryStatus;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400_000);
}

/** Статус каждой группы: 0–1 дн — нагружена, 2 дн — восстанавливается, 3+ — готова. */
export function recoveryMap(userId: number, todayStr: string): GroupStatus[] {
  const all = getAllWorkouts(userId);
  const lastByGroup = new Map<string, string>();
  for (const w of all) {
    const g = muscleGroupOf(w.exercise);
    if (!g) continue;
    const prev = lastByGroup.get(g);
    if (!prev || w.date > prev) lastByGroup.set(g, w.date);
  }

  return GROUPS.map((g) => {
    const lastDate = lastByGroup.get(g.name) ?? null;
    if (!lastDate) return { name: g.name, emoji: g.emoji, lastDate: null, daysAgo: null, status: "fresh" as const };
    const daysAgo = daysBetween(lastDate, todayStr);
    const status: RecoveryStatus = daysAgo <= 1 ? "loaded" : daysAgo === 2 ? "recovering" : "fresh";
    return { name: g.name, emoji: g.emoji, lastDate, daysAgo, status };
  });
}

// ── Силовой балл ─────────────────────────────────────────────────────────────
// Балл 0–100 по отношению e1RM к весу тела. Максимумы соотношений — уровень
// сильного атлета-любителя (не элита): присед 2.5×BW, жим 1.8×BW, тяга 3×BW, ОХ жим 1.2×BW.

const SCORE_LIFTS: { name: string; re: RegExp; ratioMax: number }[] = [
  { name: "Присед", re: /присед/i, ratioMax: 2.5 },
  { name: "Жим лёжа", re: /жим лёжа|жим лежа/i, ratioMax: 1.8 },
  { name: "Становая", re: /станов/i, ratioMax: 3.0 },
  { name: "Жим стоя", re: /жим стоя|ох жим|армейск/i, ratioMax: 1.2 },
];

function e1rm(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

export interface LiftScore {
  name: string;
  e1rm: number;
  ratio: number | null;  // ×BW, null если вес тела неизвестен
  score: number | null;  // 0–100
}

export interface StrengthResult {
  bodyweight: number | null;
  lifts: LiftScore[];
  overall: number | null; // средний балл по доступным движениям
}

/** Балл по лучшим e1RM за последние 90 дней. */
export function strengthScore(userId: number, todayStr: string): StrengthResult {
  const cutoff = new Date(new Date(todayStr + "T00:00:00Z").getTime() - 90 * 86400_000)
    .toISOString().slice(0, 10);
  const all = getAllWorkouts(userId).filter((w) => w.date >= cutoff && w.weightKg > 0);

  const bw = getBodyweight(userId, 1);
  const bodyweight = bw.length ? bw[bw.length - 1].weightKg : null;

  const lifts: LiftScore[] = [];
  for (const lift of SCORE_LIFTS) {
    const rows = all.filter((w) => lift.re.test(w.exercise));
    if (rows.length === 0) continue;
    const best = rows.reduce((m, w) => Math.max(m, e1rm(w.weightKg, w.reps)), 0);
    const ratio = bodyweight ? Math.round((best / bodyweight) * 100) / 100 : null;
    const score = ratio !== null ? Math.min(100, Math.round((ratio / lift.ratioMax) * 100)) : null;
    lifts.push({ name: lift.name, e1rm: Math.round(best), ratio, score });
  }

  const scored = lifts.filter((l) => l.score !== null);
  const overall = scored.length
    ? Math.round(scored.reduce((s, l) => s + (l.score ?? 0), 0) / scored.length)
    : null;

  return { bodyweight, lifts, overall };
}

/** Тренд e1RM по группам: лучшие за последние 30 дней против предыдущих 30. */
export interface GroupTrend {
  name: string;
  emoji: string;
  cur: number;   // лучший e1RM за последние 30 дней
  prev: number;  // за предыдущие 30
  pct: number;   // изменение в %
}

export function groupTrends(userId: number, todayStr: string): GroupTrend[] {
  const t = new Date(todayStr + "T00:00:00Z").getTime();
  const d30 = new Date(t - 30 * 86400_000).toISOString().slice(0, 10);
  const d60 = new Date(t - 60 * 86400_000).toISOString().slice(0, 10);
  const all = getAllWorkouts(userId).filter((w) => w.weightKg > 0 && w.date >= d60);

  const out: GroupTrend[] = [];
  for (const g of GROUPS) {
    const rows = all.filter((w) => muscleGroupOf(w.exercise) === g.name);
    const cur = rows.filter((w) => w.date >= d30).reduce((m, w) => Math.max(m, e1rm(w.weightKg, w.reps)), 0);
    const prev = rows.filter((w) => w.date < d30).reduce((m, w) => Math.max(m, e1rm(w.weightKg, w.reps)), 0);
    if (cur === 0 || prev === 0) continue;
    out.push({
      name: g.name,
      emoji: g.emoji,
      cur: Math.round(cur),
      prev: Math.round(prev),
      pct: Math.round(((cur - prev) / prev) * 100),
    });
  }
  return out;
}
