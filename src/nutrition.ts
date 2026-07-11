import type { NutritionProfile } from "./db";

export interface MacroResult {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  bmr: number;
  tdee: number;
}

const ACTIVITY_FACTOR: Record<NutritionProfile["activity"], number> = {
  low: 1.375,   // 1–3 тренировки в неделю, сидячая работа
  mid: 1.55,    // 3–5 тренировок
  high: 1.725,  // 6+ тренировок или физическая работа
};

// Белок и корректировка калорий по цели
const GOAL_CFG: Record<NutritionProfile["goal"], { kcalMul: number; proteinPerKg: number }> = {
  bulk: { kcalMul: 1.12, proteinPerKg: 1.8 },
  cut: { kcalMul: 0.8, proteinPerKg: 2.2 },
  maint: { kcalMul: 1.0, proteinPerKg: 1.8 },
};

/** Миффлин – Сан-Жеор + макросы: белок г/кг по цели, жиры 0.9 г/кг, остаток — углеводы. */
export function calcMacros(p: NutritionProfile, actualWeightKg?: number): MacroResult {
  const w = actualWeightKg ?? p.weightKg;
  const bmr =
    10 * w + 6.25 * p.heightCm - 5 * p.age + (p.sex === "m" ? 5 : -161);
  const tdee = bmr * ACTIVITY_FACTOR[p.activity];
  const cfg = GOAL_CFG[p.goal];
  const kcal = Math.round(tdee * cfg.kcalMul);

  const proteinG = Math.round(w * cfg.proteinPerKg);
  const fatG = Math.round(w * 0.9);
  const carbsKcal = kcal - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(0, Math.round(carbsKcal / 4));

  return { kcal, proteinG, fatG, carbsG, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

// ── Адаптивная корректировка по фактическому тренду веса ────────────────────
// Идея MacroFactor: формула даёт стартовую точку, а дальше рулит реальный тренд.
// Целевые скорости: набор +0.2…+0.5 кг/нед, сушка −0.3…−0.8, поддержание ±0.25.

export interface TrendAdvice {
  rateKgWeek: number;   // фактическая скорость изменения веса
  days: number;         // за какой период посчитано
  kcalDelta: number;    // рекомендованная корректировка калорий (0 = всё ок)
  text: string;         // готовая рекомендация
}

export function weightTrendAdvice(
  entries: { date: string; weightKg: number }[],
  goal: NutritionProfile["goal"]
): TrendAdvice | null {
  // берём записи за последние 28 дней
  const cutoff = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);
  const recent = entries.filter((e) => e.date >= cutoff);
  if (recent.length < 4) return null;

  const first = recent[0];
  const last = recent[recent.length - 1];
  const days = Math.round(
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400_000
  );
  if (days < 10) return null; // слишком короткий период — тренд ненадёжен

  const rate = Math.round(((last.weightKg - first.weightKg) / days) * 7 * 100) / 100;

  let kcalDelta = 0;
  let verdict: string;
  if (goal === "bulk") {
    if (rate < 0.15) { kcalDelta = 150; verdict = "вес почти не растёт — добавь калорий"; }
    else if (rate > 0.6) { kcalDelta = -150; verdict = "вес растёт слишком быстро (лишний жир) — убавь"; }
    else verdict = "скорость набора в норме, ничего не меняй";
  } else if (goal === "cut") {
    if (rate > -0.2) { kcalDelta = -200; verdict = "вес не снижается — урежь калории"; }
    else if (rate < -1.0) { kcalDelta = 150; verdict = "слишком быстрое похудение (риск потери мышц) — добавь"; }
    else verdict = "скорость снижения в норме, продолжай";
  } else {
    if (rate > 0.25) { kcalDelta = -150; verdict = "вес ползёт вверх — слегка убавь"; }
    else if (rate < -0.25) { kcalDelta = 150; verdict = "вес уходит вниз — слегка добавь"; }
    else verdict = "вес стабилен — цель выполняется";
  }

  const sign = rate > 0 ? "+" : "";
  const deltaStr = kcalDelta === 0 ? "" : ` (${kcalDelta > 0 ? "+" : ""}${kcalDelta} ккал/день)`;
  return {
    rateKgWeek: rate,
    days,
    kcalDelta,
    text: `Тренд веса: ${sign}${rate} кг/нед за ${days} дн. ${verdict}${deltaStr}.`,
  };
}
