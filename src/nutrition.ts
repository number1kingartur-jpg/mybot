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
