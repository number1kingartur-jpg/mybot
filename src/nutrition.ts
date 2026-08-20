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

/** Ккал в килограмме жира. Для оценки расхода по балансу энергии. */
const KCAL_PER_KG = 7700;

export interface ExpenditureEstimate {
  tdee: number;
  days: number;
  intakeAvg: number;
  rateKgWeek: number;
}

/**
 * Расход по факту: средний приём минус энергия, ушедшая в вес.
 *
 * Если человек ел 2200 и за две недели ушло 0.5 кг, расход выше приёма.
 * Формула даёт старт. Этот расчёт сильнее анкеты, когда дневник уже есть.
 * Сдвиг относительно формулы режется до 400 ккал: одна кривая неделя
 * не должна ломать норму.
 */
export function estimateExpenditure(
  meals: { date: string; kcal: number }[],
  weights: { date: string; weightKg: number }[],
  formulaTdee: number
): ExpenditureEstimate | null {
  const cutoff = new Date(Date.now() - 21 * 86400_000).toISOString().slice(0, 10);
  const byDay = new Map<string, number>();
  for (const m of meals) {
    if (m.date < cutoff) continue;
    byDay.set(m.date, (byDay.get(m.date) || 0) + m.kcal);
  }
  if (byDay.size < 8) return null;

  const w = weights
    .filter((e) => e.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 4) return null;
  const days = Math.round(
    (new Date(w[w.length - 1].date).getTime() - new Date(w[0].date).getTime()) / 86400_000
  );
  if (days < 10) return null;

  const intakeDays = [...byDay.values()];
  const intakeAvg = intakeDays.reduce((a, b) => a + b, 0) / intakeDays.length;
  const rateKgWeek = ((w[w.length - 1].weightKg - w[0].weightKg) / days) * 7;
  const raw = Math.round(intakeAvg - (rateKgWeek / 7) * KCAL_PER_KG);
  if (raw < 1200 || raw > 5000) return null;
  const tdee = Math.max(formulaTdee - 400, Math.min(formulaTdee + 400, raw));
  return {
    tdee,
    days,
    intakeAvg: Math.round(intakeAvg),
    rateKgWeek: Math.round(rateKgWeek * 100) / 100,
  };
}

export function applyKcalDelta(base: MacroResult, delta: number): MacroResult {
  const kcal = Math.max(1200, Math.round(base.kcal + delta));
  const carbsKcal = kcal - base.proteinG * 4 - base.fatG * 9;
  return { ...base, kcal, carbsG: Math.max(0, Math.round(carbsKcal / 4)) };
}

export interface AdaptiveTarget extends MacroResult {
  formulaKcal: number;
  kcalDelta: number;
  source: "formula" | "trend" | "intake";
  note: string;
}

/**
 * Норма, которой пользуется кольцо дня.
 *
 * 1. Есть дневник еды и вес: расход считается по балансу, цель накручивается
 *    тем же множителем, что и формула.
 * 2. Есть только тренд веса: формула сдвигается на 150–200 ккал.
 * 3. Иначе остаётся Миффлин.
 */
export function adaptiveTarget(
  profile: NutritionProfile,
  actualWeightKg: number | undefined,
  meals: { date: string; kcal: number }[],
  weights: { date: string; weightKg: number }[]
): AdaptiveTarget {
  const base = calcMacros(profile, actualWeightKg);
  const exp = estimateExpenditure(meals, weights, base.tdee);
  if (exp) {
    const cfg = GOAL_CFG[profile.goal];
    const kcal = Math.max(1200, Math.round(exp.tdee * cfg.kcalMul));
    const carbsKcal = kcal - base.proteinG * 4 - base.fatG * 9;
    const carbsG = Math.max(0, Math.round(carbsKcal / 4));
    const sign = exp.rateKgWeek > 0 ? "+" : "";
    return {
      ...base,
      kcal,
      carbsG,
      tdee: exp.tdee,
      formulaKcal: base.kcal,
      kcalDelta: kcal - base.kcal,
      source: "intake",
      note:
        `Норма от фактического расхода ${exp.tdee} ккал. ` +
        `Ел в среднем ${exp.intakeAvg}, вес ${sign}${exp.rateKgWeek} кг/нед за ${exp.days} дней.`,
    };
  }
  const advice = weightTrendAdvice(weights, profile.goal);
  if (advice && advice.kcalDelta !== 0) {
    const next = applyKcalDelta(base, advice.kcalDelta);
    return {
      ...next,
      formulaKcal: base.kcal,
      kcalDelta: advice.kcalDelta,
      source: "trend",
      note: advice.text,
    };
  }
  return {
    ...base,
    formulaKcal: base.kcal,
    kcalDelta: 0,
    source: "formula",
    note: "Норма из формулы. Когда наберутся вес и дневник, цифра станет от факта.",
  };
}
