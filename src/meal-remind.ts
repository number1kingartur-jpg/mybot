import { slotLabel, slotOfMeal, type MealSlot } from "./meal-same";

export const MEAL_PING_HOURS: Record<number, MealSlot> = {
  8: "breakfast",
  13: "lunch",
  19: "dinner",
};

export type MealPing =
  | { kind: "slot"; slot: MealSlot; label: string }
  | { kind: "empty-day" };

export function mealPingForHour(hour: number): MealPing | null {
  const slot = MEAL_PING_HOURS[hour];
  if (slot) return { kind: "slot", slot, label: slotLabel(slot) };
  if (hour === 20) return { kind: "empty-day" };
  return null;
}

export function dayHasSlot(meals: { hour?: number }[], slot: MealSlot): boolean {
  return meals.some((m, i) => slotOfMeal(m, i, meals.length) === slot);
}

export function shouldSendMealPing(input: {
  paused?: boolean;
  hasNutrition: boolean;
  mealsToday: { hour?: number }[];
  loggedThisWeek: boolean;
  ping: MealPing | null;
}): boolean {
  if (!input.ping || input.paused || !input.hasNutrition || !input.loggedThisWeek) return false;
  if (input.ping.kind === "empty-day") return input.mealsToday.length === 0;
  return !dayHasSlot(input.mealsToday, input.ping.slot);
}

export function mealPingText(ping: MealPing, streakDays: number): string {
  const dayWord = streakDays % 10 === 1 && streakDays % 100 !== 11 ? "день" : "дня";
  const streak =
    streakDays >= 2
      ? `Серия: <b>${streakDays} ${dayWord}</b> подряд.`
      : `Одно фото — и приём записан.`;
  if (ping.kind === "empty-day") {
    return `🍽 <b>Сегодня в дневнике пусто.</b>\n\n${streak}`;
  }
  return `🍽 <b>Пора есть: ${ping.label}.</b>\n\nВ дневнике этого приёма ещё нет.\n${streak}`;
}
