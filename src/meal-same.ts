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

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function yesterdayOf(dateStr: string): string {
  return shiftDate(dateStr, -1);
}

/** Имена, которые были не в один день: коктейль каждый день попадает сюда со второго дня. */
export function usualNames(days: { name: string }[][], minDays = 2): Set<string> {
  const counts = new Map<string, number>();
  for (const day of days) {
    const seen = new Set<string>();
    for (const m of day) {
      const key = m.name.trim().toLowerCase();
      if (key) seen.add(key);
    }
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n >= minDays).map(([name]) => name));
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

function uniqueMeals(list: SameMeal[]): SameMeal[] {
  const out: SameMeal[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    const key = m.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/**
 * Что предложить сейчас: вчерашний слот по часу плюс то, что человек ест
 * почти каждый день. Коктейль в 10 утра вчера не должен пропадать в полдень.
 */
export function sameAsYesterday(
  yesterday: SameMeal[],
  todayMeals: { name: string }[],
  hour: number,
  usual?: Iterable<string>
): SameAs | null {
  if (!yesterday.length) return null;
  const slot = slotByHour(hour);
  const usualSet = usual instanceof Set ? usual : new Set(usual ?? []);
  const inSlot = yesterday.filter((m, i) => slotOfMeal(m, i, yesterday.length) === slot);
  const usualYesterday = yesterday.filter((m) => usualSet.has(m.name.trim().toLowerCase()));
  const fallback = !inSlot.length && !usualYesterday.length && yesterday.length === 1 && yesterday[0].hour === undefined;
  const source = uniqueMeals([...inSlot, ...usualYesterday, ...(fallback ? yesterday : [])]);
  if (!source.length) return null;

  const have = new Set(todayMeals.map((m) => m.name.trim().toLowerCase()));
  const meals = source.filter((m) => !have.has(m.name.trim().toLowerCase()));
  if (!meals.length) return null;

  const extraUsual = usualYesterday.some((m) => !inSlot.includes(m));
  const title =
    fallback
      ? "вчера"
      : extraUsual || (!inSlot.length && usualYesterday.length)
        ? "как обычно"
        : slotLabel(slot);

  return {
    slot,
    title,
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
