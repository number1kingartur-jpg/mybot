/**
 * Один и тот же рацион: не набирать заново то, что вчера было в этот приём.
 *
 * Приёмы в базе долго жили без часа, поэтому слот берётся из часа, если он
 * записан, иначе из порядка за день: первое это завтрак, последнее это ужин.
 */

export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";

export interface SameMeal {
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  slug?: string;
  photoUrl?: string;
  hour?: number;
}

export interface SameAs {
  slot: MealSlot;
  title: string;
  meals: SameMeal[];
}

export function bangkokHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

export function yesterdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function slotByHour(hour: number): MealSlot {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 19) return "snack";
  return "dinner";
}

export function slotLabel(slot: MealSlot): string {
  return { breakfast: "завтрак", lunch: "обед", snack: "перекус", dinner: "ужин" }[slot];
}

/** Порядок за день, когда часа в записи нет. */
export function inferSlots(count: number): MealSlot[] {
  if (count <= 0) return [];
  if (count === 1) return ["breakfast"];
  if (count === 2) return ["breakfast", "dinner"];
  if (count === 3) return ["breakfast", "lunch", "dinner"];
  const slots: MealSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) slots.push("breakfast");
    else if (i === 1) slots.push("lunch");
    else if (i === count - 1) slots.push("dinner");
    else slots.push("snack");
  }
  return slots;
}

export function slotOfMeal(meal: { hour?: number }, index: number, total: number): MealSlot {
  if (meal.hour !== undefined && meal.hour >= 0 && meal.hour <= 23) return slotByHour(meal.hour);
  return inferSlots(total)[index] ?? "dinner";
}

/**
 * Что предложить записать сейчас: вчерашние позиции того же слота, которых
 * сегодня ещё нет. Один приём вчера без часа предлагаем в любой слот:
 * иначе ужин никогда не спросит про единственную вчерашнюю запись.
 */
export function sameAsYesterday(yesterday: SameMeal[], todayMeals: { name: string }[], hour: number): SameAs | null {
  if (!yesterday.length) return null;
  const slot = slotByHour(hour);
  const picked = yesterday.filter((m, i) => slotOfMeal(m, i, yesterday.length) === slot);
  const fallback = !picked.length && yesterday.length === 1 && yesterday[0].hour === undefined;
  const source = fallback ? yesterday : picked;
  if (!source.length) return null;

  const have = new Set(todayMeals.map((m) => m.name.trim().toLowerCase()));
  const meals = source.filter((m) => !have.has(m.name.trim().toLowerCase()));
  if (!meals.length) return null;

  return {
    slot,
    title: fallback ? "вчера" : slotLabel(slot),
    meals: meals.map((m) => ({
      name: m.name,
      kcal: m.kcal,
      proteinG: m.proteinG,
      fatG: m.fatG,
      carbsG: m.carbsG,
      slug: m.slug,
      photoUrl: m.photoUrl,
    })),
  };
}
