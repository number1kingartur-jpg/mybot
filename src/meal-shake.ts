/**
 * Коктейль Артура: один тап без фото и без «курицы с рисом» от модели.
 */
import { getMealsForDays } from "./db";
import { macrosFromText } from "./foods";
import { isCompleteShake, mealFromHistory, type MealAnalysis } from "./meal";

/** Текст из дневника Артура; совпадает с scripts/check-foods.mjs. */
export const ARTUR_SHAKE_TEXT =
  "250 мл жидкого белка, 100 мл молока, 3 банана, 8 столовых ложек овсянки, " +
  "1 ложка арахисовой пасты, 2 скупа протеина, пол ложки креатина";

export function defaultShakeMeal(): MealAnalysis | null {
  const meal = macrosFromText(ARTUR_SHAKE_TEXT);
  if (meal && isCompleteShake(meal.parts)) meal.name = "Коктейль";
  return meal;
}

export function lastCompleteShake(userId: number): MealAnalysis | null {
  const rows = getMealsForDays(userId, 30);
  for (const m of rows) {
    if (!m.parts || m.parts.length < 5) continue;
    const meal = mealFromHistory(m);
    if (isCompleteShake(meal.parts)) return meal;
  }
  return null;
}

/** История → иначе эталонный рецепт (~1200 ккал). */
export function resolveUsualShakeMeal(userId: number): MealAnalysis | null {
  return lastCompleteShake(userId) ?? defaultShakeMeal();
}

export function usualShakeBrief(userId: number): {
  name: string;
  kcal: number;
  proteinG: number;
  fromHistory: boolean;
  parts: { name: string; grams: number }[];
} | null {
  const fromHistory = lastCompleteShake(userId);
  const meal = fromHistory ?? defaultShakeMeal();
  if (!meal?.parts?.length) return null;
  return {
    name: "Коктейль",
    kcal: meal.kcal,
    proteinG: meal.proteinG,
    fromHistory: Boolean(fromHistory),
    parts: meal.parts.map((p) => ({ name: p.name, grams: p.grams })),
  };
}
