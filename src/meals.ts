/**
 * Готовые меню на день — русское и тайское, под цель.
 *
 * Позиция меню — ссылка на продукт справочника плюс вес базовой порции, а не
 * строка текста. КБЖУ приёма складывается из позиций, поэтому состав и цифры не
 * могут разойтись: раньше рядом с составом на ~660 ккал стояло записанное руками
 * «520 ккал». К каждой позиции лежат три замены, вес замены считается под
 * калорийность позиции.
 *
 * Приложение повторяет этот файл в `webapp/js/menus.js`, паритет проверяет
 * `scripts/check-menus.mjs`.
 */

import { FOODS, type FoodItem } from "./foods";

export type MealKey = "breakfast" | "lunch" | "snack" | "dinner";
export type MenuId = "ru" | "th";
export type MealGoal = "cut" | "maint" | "bulk";

/** Позиция меню: продукт справочника, вес базовой порции и три замены. */
export type MenuItemDef = {
  food: string;
  g: number;
  alt: [string, string, string];
};

export type DayMenu = {
  title: string;
  meals: Record<MealKey, MenuItemDef[]>;
};

export const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "snack", "dinner"];

export const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: "🌅 Завтрак",
  lunch: "☀️ Обед",
  snack: "🍎 Перекус",
  dinner: "🌙 Ужин",
};

export const GOAL_LABELS: Record<MealGoal, string> = {
  cut: "🔥 Сушка",
  maint: "⚖️ Поддержание",
  bulk: "📈 Набор массы",
};

/** Целевой калораж дня. */
export const GOAL_KCAL: Record<MealGoal, number> = {
  cut: 1600,
  maint: 2200,
  bulk: 2800,
};

/** Доли дня: завтрак / обед / перекус / ужин. */
export const MEAL_SHARE: Record<MealKey, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  snack: 0.15,
  dinner: 0.25,
};

export const MENUS: Record<MenuId, DayMenu> = {
  ru: {
    title: "Русское меню",
    meals: {
      breakfast: [
        { food: "Овсянка на молоке", g: 250, alt: ["Гречка отварная", "Хлеб", "Сырники жареные"] },
        { food: "Хлеб", g: 60, alt: ["Гречка отварная", "Овсянка на молоке", "Паста отварная"] },
        { food: "Банан", g: 120, alt: ["Яблоко", "Сок", "Мёд"] },
        { food: "Яйца", g: 110, alt: ["Омлет", "Яичница на масле", "Сыр"] },
        { food: "Творог", g: 150, alt: ["Йогурт", "Кефир", "Протеин"] },
      ],
      lunch: [
        { food: "Курица отварная", g: 150, alt: ["Индейка", "Говядина", "Рыба на пару"] },
        { food: "Гречка отварная", g: 200, alt: ["Рис отварной", "Паста отварная", "Картофель отварной"] },
        { food: "Картофель отварной", g: 200, alt: ["Рис отварной", "Гречка отварная", "Паста отварная"] },
        { food: "Овощи", g: 200, alt: ["Салат", "Овощи тушёные", "Суп"] },
        { food: "Масло растительное", g: 10, alt: ["Масло сливочное", "Сметана", "Авокадо"] },
      ],
      snack: [
        { food: "Творог", g: 150, alt: ["Йогурт", "Кефир", "Сыр"] },
        { food: "Паста отварная", g: 180, alt: ["Гречка отварная", "Рис отварной", "Хлеб"] },
        { food: "Яблоко", g: 180, alt: ["Банан", "Сок", "Молоко российское"] },
        { food: "Сок", g: 250, alt: ["Кефир", "Молоко российское", "Банан"] },
        { food: "Курица отварная", g: 150, alt: ["Индейка", "Тунец", "Рыба на пару"] },
        { food: "Орехи", g: 20, alt: ["Арахисовая паста", "Авокадо", "Шоколад"] },
      ],
      dinner: [
        { food: "Рыба на пару", g: 150, alt: ["Лосось", "Тунец", "Креветки"] },
        { food: "Курица отварная", g: 150, alt: ["Индейка", "Тунец", "Креветки"] },
        { food: "Рис отварной", g: 180, alt: ["Гречка отварная", "Картофель отварной", "Паста отварная"] },
        { food: "Салат", g: 150, alt: ["Овощи", "Овощи тушёные", "Суп"] },
        { food: "Сок", g: 0, alt: ["Кефир", "Молоко российское", "Банан"] },
      ],
    },
  },
  th: {
    title: "Тайское меню",
    meals: {
      breakfast: [
        { food: "Омлет", g: 150, alt: ["Яйца", "Яичница на масле", "Творог"] },
        { food: "Рис отварной", g: 150, alt: ["Хлеб", "Овсянка на молоке", "Гречка отварная"] },
        { food: "Сок", g: 200, alt: ["Кофе чёрный", "Молоко таиландское", "Кефир"] },
      ],
      lunch: [
        { food: "Пад Тай", g: 300, alt: ["Том Ям", "Суши", "Паста отварная"] },
        { food: "Курица запечённая", g: 120, alt: ["Креветки", "Индейка", "Шашлык куриный"] },
        { food: "Индейка", g: 150, alt: ["Курица отварная", "Креветки", "Рыба на пару"] },
        { food: "Масло растительное", g: 10, alt: ["Авокадо", "Орехи", "Арахисовая паста"] },
      ],
      snack: [
        { food: "Сом Там", g: 200, alt: ["Салат", "Овощи", "Яблоко"] },
        { food: "Сате", g: 120, alt: ["Шашлык куриный", "Креветки", "Курица отварная"] },
        { food: "Банан", g: 120, alt: ["Яблоко", "Сок", "Хлеб"] },
        { food: "Сок", g: 200, alt: ["Молоко таиландское", "Кефир", "Яблоко"] },
        { food: "Хлеб", g: 30, alt: ["Рис отварной", "Гречка отварная", "Паста отварная"] },
        { food: "Курица отварная", g: 150, alt: ["Индейка", "Креветки", "Рыба на пару"] },
        { food: "Орехи", g: 20, alt: ["Арахисовая паста", "Авокадо", "Шоколад"] },
      ],
      dinner: [
        { food: "Том Ям", g: 350, alt: ["Суп", "Пад Тай", "Сом Там"] },
        { food: "Рис отварной", g: 150, alt: ["Гречка отварная", "Картофель отварной", "Хлеб"] },
        { food: "Паста отварная", g: 120, alt: ["Рис отварной", "Гречка отварная", "Хлеб"] },
        { food: "Креветки", g: 120, alt: ["Рыба на пару", "Тунец", "Курица отварная"] },
        { food: "Курица отварная", g: 150, alt: ["Индейка", "Креветки", "Рыба на пару"] },
      ],
    },
  },
};

type Measure = "piece" | "tsp" | "tbsp" | "scoop";

const MEASURE_LABEL: Record<Measure, string> = {
  piece: "шт",
  tsp: "ч.л.",
  tbsp: "ст.л.",
  scoop: "порция",
};

/**
 * Чем меряется продукт в меню; остальное — граммы.
 *
 * Яйца и бананы в граммах человек не отмеряет, а «33 г мёда» на кухне ничего не
 * значит. Вес самой меры берётся из справочника, здесь только выбор меры.
 */
const MEASURE: Record<string, Measure> = {
  Хлеб: "piece",
  Банан: "piece",
  Яблоко: "piece",
  Яйца: "piece",
  "Сырники жареные": "piece",
  Мёд: "tsp",
  "Масло растительное": "tsp",
  "Масло сливочное": "tsp",
  Сметана: "tbsp",
  "Арахисовая паста": "tbsp",
  Протеин: "scoop",
};

/** Напитки показываются в миллилитрах, считаются как 1 мл = 1 г. */
const MILLILITRES = new Set(["Кефир", "Молоко таиландское", "Молоко российское", "Сок", "Кофе чёрный"]);

export type MenuOption = {
  food: string;
  g: number;
  amount: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
};

export type MenuItem = MenuOption & {
  /** Продукт позиции и три замены: первый в списке — сама позиция. */
  options: MenuOption[];
};

export type MenuMeal = {
  key: MealKey;
  label: string;
  items: MenuItem[];
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
};

export function menuFood(name: string): FoodItem {
  const food = FOODS.find((f) => f.name === name);
  if (!food) throw new Error(`Продукта нет в справочнике: ${name}`);
  return food;
}

/** Вес одной меры продукта: штука, ложка, порция. */
export function measureG(name: string): number | null {
  const food = menuFood(name);
  switch (MEASURE[name]) {
    case "piece":
      return food.pieceG ?? null;
    case "tsp":
      return food.tspG ?? null;
    case "tbsp":
      return food.tbspG ?? null;
    case "scoop":
      return food.scoopG ?? null;
    default:
      return null;
  }
}

function nutr(name: string, g: number): Omit<MenuOption, "food" | "amount"> {
  const f = menuFood(name);
  const k = g / 100;
  return {
    g,
    kcal: Math.round(f.kcal100 * k),
    proteinG: Math.round(f.p100 * k),
    fatG: Math.round(f.f100 * k),
    carbsG: Math.round(f.c100 * k),
  };
}

/** Вес до понятной величины: штуки и ложки целые, граммы кратны 5 или 10. */
function roundG(name: string, g: number): number {
  const piece = measureG(name);
  if (piece) return Math.max(1, Math.round(g / piece)) * piece;
  const step = g < 50 ? 5 : 10;
  return Math.max(step, Math.round(g / step) * step);
}

/**
 * Вес замены под калорийность позиции.
 *
 * Границы от обычной порции продукта: без них замена кофе на завтрак в 90 ккал
 * дала бы четыре с половиной литра. Упёрлись в границу — калорийность честно
 * разойдётся, и это видно в строке замены.
 */
function swapG(name: string, kcal: number): number {
  const f = menuFood(name);
  const raw = (kcal / f.kcal100) * 100;
  const def = f.defaultG;
  return roundG(name, Math.min(Math.max(raw, def * 0.4), def * 2.5));
}

function amountText(name: string, g: number): string {
  const piece = measureG(name);
  if (piece) return `${g / piece} ${MEASURE_LABEL[MEASURE[name]]}`;
  return `${g} ${MILLILITRES.has(name) ? "мл" : "г"}`;
}

function option(name: string, g: number): MenuOption {
  return { food: name, amount: amountText(name, g), ...nutr(name, g) };
}

function buildItem(def: MenuItemDef, grams: number): MenuItem {
  const baseG = roundG(def.food, grams);
  const base = option(def.food, baseG);
  const options = [base, ...def.alt.map((name) => option(name, swapG(name, base.kcal)))];
  return { ...base, options };
}

/** Калорийность меню в базовых порциях: от неё считается множитель под норму. */
function baseKcal(menuId: MenuId): number {
  let total = 0;
  for (const key of MEAL_KEYS) {
    for (const def of MENUS[menuId].meals[key]) total += nutr(def.food, def.g).kcal;
  }
  return total;
}

/**
 * Крупы и объёмный белок. Штуки (яйца) не делятся, ими норму не добираю.
 * Углеводы раскладываю по тарелкам, а не сыплю все в рис.
 */
const FLEX_FOODS = new Set([
  "Овсянка на молоке",
  "Гречка отварная",
  "Рис отварной",
  "Паста отварная",
  "Картофель отварной",
  "Хлеб",
  "Сок",
  "Курица",
  "Курица отварная",
  "Курица запечённая",
  "Творог",
  "Рыба на пару",
  "Индейка",
  "Пад Тай",
  "Том Ям",
  "Сом Там",
  "Креветки",
  "Сате",
  "Омлет",
]);

const CARB_FLEX = new Set([
  "Овсянка на молоке",
  "Гречка отварная",
  "Рис отварной",
  "Паста отварная",
  "Картофель отварной",
  "Хлеб",
  "Сок",
  "Пад Тай",
  "Сом Там",
]);

/** Одна тарелка, не гора. Граммы в один приём. */
const PORTION_MAX: Record<string, number> = {
  "Овсянка на молоке": 430,
  "Гречка отварная": 300,
  "Рис отварной": 300,
  "Паста отварная": 300,
  "Картофель отварной": 300,
  Хлеб: 90,
  Сок: 400,
  "Пад Тай": 500,
  "Том Ям": 500,
  "Сом Там": 300,
  Курица: 220,
  "Курица отварная": 220,
  "Курица запечённая": 220,
  Творог: 200,
  "Рыба на пару": 200,
  Индейка: 220,
  Креветки: 180,
  Сате: 180,
  Омлет: 200,
  Орехи: 45,
};

const PROT_FLEX = new Set([
  "Курица",
  "Курица отварная",
  "Курица запечённая",
  "Творог",
  "Рыба на пару",
  "Индейка",
  "Креветки",
  "Сате",
  "Омлет",
]);

const FAT_FLEX = new Set(["Орехи", "Масло растительное", "Сате"]);

/** Можно убрать с тарелки, если калораж низкий. */
const OPTIONAL_CARB = new Set([
  "Картофель отварной",
  "Паста отварная",
  "Сок",
  "Хлеб",
  "Банан",
  "Яблоко",
  "Пад Тай",
]);

export type MenuMacros = { proteinG: number; fatG: number; carbsG: number };

type MenuSlot = { key: MealKey; def: MenuItemDef; g: number };

type SlotNutr = { kcal: number; proteinG: number; fatG: number; carbsG: number };

const FIT = { protein: 8, carbs: 20, fat: 8, kcal: 25 };

function inferredMacros(kcal: number): MenuMacros {
  const proteinG = Math.round((kcal * 149) / 3011);
  const fatG = Math.round((kcal * 75) / 3011);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { proteinG, fatG, carbsG };
}

const PROTEIN_PORTION: Record<string, number> = {
  Яйца: 110,
  Творог: 150,
  "Рыба на пару": 150,
  Омлет: 150,
  Сате: 120,
  Креветки: 120,
  "Курица отварная": 150,
  "Курица запечённая": 120,
  Индейка: 150,
};

function slotFood(slot: MenuSlot): string {
  return slot.def.food;
}

function isAnchorProtein(slot: MenuSlot): boolean {
  const name = slotFood(slot);
  return (
    (name === "Курица отварная" && slot.key === "lunch") || name === "Курица запечённая"
  );
}

function isOptionalProtein(slot: MenuSlot): boolean {
  return Boolean(PROTEIN_PORTION[slotFood(slot)]) && !isAnchorProtein(slot);
}

const MEAL_RANK: Record<MealKey, number> = { lunch: 0, dinner: 1, breakfast: 2, snack: 3 };

function sharePenalty(slots: MenuSlot[], targetKcal: number): number {
  let s = 0;
  for (const key of MEAL_KEYS) {
    const have = slots.filter((x) => x.key === key).reduce((n, x) => n + nutr(x.def.food, x.g).kcal, 0);
    const want = Math.round(targetKcal * MEAL_SHARE[key]);
    s += Math.max(0, Math.abs(have - want) - 70) / 10;
  }
  return s;
}

function carbsHaveRoom(slots: MenuSlot[], macros: MenuMacros): boolean {
  return slots.some((slot) => {
    const lim = flexLimit(slotFood(slot), slot.g, macros, slot.key);
    return Boolean(lim && slot.g + lim.step <= lim.max && CARB_FLEX.has(slotFood(slot)));
  });
}

function plateScore(slots: MenuSlot[], macros: MenuMacros, targetKcal: number, relax = false): number {
  const now = slotNutr(slots);
  let s =
    Math.abs(now.proteinG - macros.proteinG) +
    Math.max(0, now.fatG - macros.fatG) * 1.2 +
    Math.max(0, macros.fatG - now.fatG) * 0.15;
  if (!relax) {
    s += Math.max(0, targetKcal - now.kcal) / 8 + sharePenalty(slots, targetKcal);
  }
  return s;
}

function isStarterProtein(slot: MenuSlot): boolean {
  const name = slotFood(slot);
  return isAnchorProtein(slot) || name === "Яйца" || name === "Омлет" || name === "Рыба на пару";
}

/** Обычная порция или нет. Какой продукт включить, считает норма, а не порог веса. */
function resetProteinPlate(slots: MenuSlot[]) {
  for (const slot of slots) {
    const name = slotFood(slot);
    const cat = PROTEIN_PORTION[name];
    if (!cat) continue;
    slot.g = isStarterProtein(slot) ? cat : 0;
  }
}

function chooseProtein(slots: MenuSlot[], macros: MenuMacros, targetKcal: number) {
  const opts = slots.filter(isOptionalProtein);
  for (let n = 0; n < 24; n++) {
    const now = slotNutr(slots);
    const relax = now.proteinG - macros.proteinG > 12 && carbsHaveRoom(slots, macros);
    const score = plateScore(slots, macros, targetKcal, relax);
    let best: { slot: MenuSlot; g: number; score: number } | null = null;
    for (const slot of opts) {
      const name = slotFood(slot);
      const cat = PROTEIN_PORTION[name];
      const prev = slot.g;
      if (prev === 0 && now.proteinG >= macros.proteinG - 8) continue;
      if (prev > 0 && isStarterProtein(slot) && now.proteinG - macros.proteinG <= 12) continue;
      if (
        prev === 0 &&
        name === "Курица отварная" &&
        slot.key === "snack" &&
        opts.some((s) => s.key === "dinner" && slotFood(s) === "Курица отварная" && s.g === 0)
      ) {
        continue;
      }
      slot.g = prev > 0 ? 0 : cat;
      const next = plateScore(slots, macros, targetKcal, relax);
      slot.g = prev;
      const betterMeal = !best || MEAL_RANK[slot.key] < MEAL_RANK[best.slot.key];
      if (
        next + 0.35 < score &&
        (!best || next < best.score - 0.05 || (Math.abs(next - best.score) < 0.05 && betterMeal))
      ) {
        best = { slot, g: prev > 0 ? 0 : cat, score: next };
      }
    }
    if (!best) break;
    best.slot.g = best.g;
  }
}

function snackCarbCap(name: string, mealKey?: MealKey): number | undefined {
  if (mealKey !== "snack") return undefined;
  if (
    name === "Паста отварная" ||
    name === "Рис отварной" ||
    name === "Гречка отварная" ||
    name === "Картофель отварной"
  ) {
    return 180;
  }
  if (name === "Сок") return 250;
  if (name === "Хлеб") return 60;
  return undefined;
}

function flexLimit(
  name: string,
  g: number,
  macros?: MenuMacros | null,
  mealKey?: MealKey
): { min: number; max: number; step: number } | null {
  if (PROT_FLEX.has(name) || name === "Яйца") return null;
  if (macros && name === "Масло растительное") {
    const piece = measureG(name) || 5;
    return { min: piece, max: piece * 6, step: piece };
  }
  if (name === "Хлеб" || name === "Банан" || name === "Яблоко") {
    const piece = measureG(name) || 30;
    const cap = snackCarbCap(name, mealKey) ?? (name === "Хлеб" ? PORTION_MAX.Хлеб : piece);
    return { min: 0, max: cap, step: piece };
  }
  if (!FLEX_FOODS.has(name) && !(macros && FAT_FLEX.has(name))) return null;
  if (measureG(name)) return null;
  const food = menuFood(name);
  const step = g < 50 ? 5 : 10;
  const snackCap = snackCarbCap(name, mealKey);
  const cap = Math.min(PORTION_MAX[name] ?? Math.round(food.defaultG * 2.5), snackCap ?? Infinity);
  return {
    min: OPTIONAL_CARB.has(name) ? 0 : Math.max(step, roundG(name, food.defaultG * 0.4)),
    max: cap,
    step,
  };
}

function slotNutr(slots: MenuSlot[]): SlotNutr {
  return slots.reduce(
    (s, x) => {
      const n = nutr(x.def.food, x.g);
      return {
        kcal: s.kcal + n.kcal,
        proteinG: s.proteinG + n.proteinG,
        fatG: s.fatG + n.fatG,
        carbsG: s.carbsG + n.carbsG,
      };
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }
  );
}

function stepGroup(
  slots: MenuSlot[],
  macros: MenuMacros,
  pick: (name: string) => boolean,
  dir: 1 | -1,
  preferLowProtein = false
): boolean {
  let best: { i: number; g: number; fill: number; p100: number } | null = null;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!pick(slot.def.food)) continue;
    const lim = flexLimit(slot.def.food, slot.g, macros, slot.key);
    if (!lim) continue;
    const next = slot.g + dir * lim.step;
    if (next < lim.min || next > lim.max) continue;
    const fill = (slot.g - lim.min) / Math.max(lim.max - lim.min, 1);
    const p100 = menuFood(slot.def.food).p100;
    const better = !best
      ? true
      : preferLowProtein
        ? dir > 0
          ? p100 < best.p100 || (p100 === best.p100 && fill < best.fill)
          : p100 > best.p100 || (p100 === best.p100 && fill > best.fill)
        : dir > 0
          ? fill < best.fill
          : fill > best.fill;
    if (better) best = { i, g: next, fill, p100 };
  }
  if (!best) return false;
  slots[best.i].g = best.g;
  return true;
}

function fitKcalOnly(slots: MenuSlot[], target: number, macros?: MenuMacros | null) {
  for (let n = 0; n < 60; n++) {
    const nowKcal = slots.reduce((s, x) => s + nutr(x.def.food, x.g).kcal, 0);
    const gap = target - nowKcal;
    if (Math.abs(gap) <= 20) return;
    const proteinHigh = Boolean(macros && slotNutr(slots).proteinG >= macros.proteinG);
    let best: { i: number; g: number; err: number; p100: number } | null = null;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const lim = flexLimit(slot.def.food, slot.g, macros, slot.key);
      if (!lim) continue;
      const next = gap > 0 ? slot.g + lim.step : slot.g - lim.step;
      if (next < lim.min || next > lim.max) continue;
      const err = Math.abs(
        target - (nowKcal - nutr(slot.def.food, slot.g).kcal + nutr(slot.def.food, next).kcal)
      );
      const p100 = menuFood(slot.def.food).p100;
      const better = !best
        ? true
        : proteinHigh && gap > 0
          ? p100 < best.p100 || (p100 === best.p100 && err < best.err)
          : err < best.err;
      if (better) best = { i, g: next, err, p100 };
    }
    if (!best || best.err >= Math.abs(gap)) return;
    slots[best.i].g = best.g;
  }
}

/** Подгоняю приём к своей доле дня, даже если итог уже сошёлся. */
function reconcileDay(slots: MenuSlot[], target: number, macros?: MenuMacros | null) {
  const shareTol = Math.max(80, Math.round(target * 0.05));
  for (let n = 0; n < 80; n++) {
    let worst: MealKey | null = null;
    let worstErr = -1;
    for (const key of MEAL_KEYS) {
      const have = slots.filter((s) => s.key === key).reduce((s, x) => s + nutr(x.def.food, x.g).kcal, 0);
      const want = Math.round(target * MEAL_SHARE[key]);
      const err = Math.abs(want - have);
      if (err > worstErr) {
        worstErr = err;
        worst = key;
      }
    }
    if (!worst || worstErr <= shareTol) break;
    const part = slots.filter((s) => s.key === worst);
    const share = MEAL_SHARE[worst];
    const before = part.map((s) => s.g).join();
    if (macros) {
      fitSlots(part, Math.round(target * share), {
        proteinG: Math.round(macros.proteinG * share),
        fatG: Math.round(macros.fatG * share),
        carbsG: Math.round(macros.carbsG * share),
      });
    } else {
      fitKcalOnly(part, Math.round(target * share));
    }
    if (part.map((s) => s.g).join() === before) break;
  }
  fitSlots(slots, target, macros);
}

/** Без БЖУ добиваю только ккал. С нормой: белковые порции уже выбраны, двигаю крупы и жир. */
function fitSlots(slots: MenuSlot[], target: number, macros?: MenuMacros | null) {
  if (!macros) {
    fitKcalOnly(slots, target);
    return;
  }
  fitKcalOnly(slots, target, macros);
  for (let n = 0; n < 200; n++) {
    const now = slotNutr(slots);
    const pGap = now.proteinG - macros.proteinG;
    const cGap = macros.carbsG - now.carbsG;
    const fGap = now.fatG - macros.fatG;
    const kGap = target - now.kcal;
    if (Math.abs(kGap) <= FIT.kcal && Math.abs(cGap) <= FIT.carbs && Math.abs(fGap) <= FIT.fat) {
      return;
    }
    const lowP = pGap > 0;
    let moved = false;
    if (cGap < -FIT.carbs) moved = stepGroup(slots, macros, (name) => CARB_FLEX.has(name), -1, lowP);
    if (!moved && cGap > FIT.carbs && fGap > 0) moved = stepGroup(slots, macros, (name) => FAT_FLEX.has(name), -1);
    if (!moved && cGap > FIT.carbs && kGap >= -FIT.kcal) {
      moved = stepGroup(slots, macros, (name) => CARB_FLEX.has(name), 1, lowP);
    }
    if (!moved && fGap > FIT.fat) moved = stepGroup(slots, macros, (name) => FAT_FLEX.has(name), -1);
    if (!moved && fGap < -FIT.fat) moved = stepGroup(slots, macros, (name) => FAT_FLEX.has(name), 1);
    if (!moved && kGap > FIT.kcal) {
      moved = stepGroup(slots, macros, (name) => CARB_FLEX.has(name), 1, lowP);
    }
    if (!moved && kGap < -FIT.kcal) {
      moved = stepGroup(slots, macros, (name) => CARB_FLEX.has(name), -1, lowP);
    }
    if (!moved) return;
  }
}

/**
 * Итог: [ккал, белок, углеводы, жиры] — порядок как в тексте бота.
 * personalKcal важнее цели: сушка с нормой 2100 получает 2100, а не шаблон 1600.
 * macros, если есть, тянет белок и углеводы к формуле, а не оставляет их составу блюд.
 */
export function dayMenu(
  menuId: MenuId,
  goal: MealGoal,
  personalKcal = 0,
  macros?: MenuMacros | null
): { meals: MenuMeal[]; total: number[] } {
  const target = personalKcal > 0 ? personalKcal : GOAL_KCAL[goal];
  const slots: MenuSlot[] = [];
  for (const key of MEAL_KEYS) {
    for (const def of MENUS[menuId].meals[key]) {
      slots.push({ key, def, g: def.g });
    }
  }
  const plate = macros ?? inferredMacros(target);
  resetProteinPlate(slots);
  fitSlots(slots, target, macros);
  chooseProtein(slots, plate, target);
  fitSlots(slots, target, macros);
  chooseProtein(slots, plate, target);
  reconcileDay(slots, target, macros);
  chooseProtein(slots, plate, target);
  fitSlots(slots, target, macros);
  const meals: MenuMeal[] = MEAL_KEYS.map((key) => {
    const items = slots.filter((s) => s.key === key && s.g > 0).map((s) => buildItem(s.def, s.g));
    const share = MEAL_SHARE[key];
    return {
      key,
      label: MEAL_LABELS[key],
      items,
      kcal: items.reduce((s, i) => s + i.kcal, 0),
      proteinG: items.reduce((s, i) => s + i.proteinG, 0),
      fatG: items.reduce((s, i) => s + i.fatG, 0),
      carbsG: items.reduce((s, i) => s + i.carbsG, 0),
      targetKcal: Math.round(target * share),
      targetProteinG: macros ? Math.round(macros.proteinG * share) : 0,
      targetFatG: macros ? Math.round(macros.fatG * share) : 0,
      targetCarbsG: macros ? Math.round(macros.carbsG * share) : 0,
    };
  });
  const total = [
    meals.reduce((s, m) => s + m.kcal, 0),
    meals.reduce((s, m) => s + m.proteinG, 0),
    meals.reduce((s, m) => s + m.carbsG, 0),
    meals.reduce((s, m) => s + m.fatG, 0),
  ];
  return { meals, total };
}

const PORTION_HINT: Record<MealGoal, string> = {
  cut: "Порции меньше базовых. Больше овощей, меньше масла и круп.",
  maint: "Стандартные порции под ежедневную активность.",
  bulk: "Порции больше базовых. Добавь рис, гречку и белок в обед и ужин.",
};

export function goalPickerText(menuId: MenuId): string {
  const menu = MENUS[menuId];
  return (
    `<b>${menu.title}</b>\n\n` +
    `Выбери цель, и я подстрою калораж и порции:\n\n` +
    `🔥 <b>Сушка</b> — ~${GOAL_KCAL.cut} ккал\n` +
    `⚖️ <b>Поддержание</b> — ~${GOAL_KCAL.maint} ккал\n` +
    `📈 <b>Набор</b> — ~${GOAL_KCAL.bulk} ккал`
  );
}

export function dayMenuSummary(menuId: MenuId, goal: MealGoal): { text: string; total: number[] } {
  const menu = MENUS[menuId];
  const { total } = dayMenu(menuId, goal);
  const text =
    `<b>${menu.title}</b> · ${GOAL_LABELS[goal]}\n` +
    `<i>${PORTION_HINT[goal]}</i>\n\n` +
    `Итого: <b>${total[0]} ккал</b> · Б ${total[1]} · У ${total[2]} · Ж ${total[3]}\n\n` +
    `Выбери приём пищи:`;
  return { text, total };
}

export function mealDetailText(menuId: MenuId, goal: MealGoal, key: MealKey): string {
  const meal = dayMenu(menuId, goal).meals.find((m) => m.key === key)!;
  const items = meal.items
    .map((i) => {
      const swaps = i.options
        .slice(1)
        .map((o) => `${o.food} ${o.amount}`)
        .join(" · ");
      return `▪️ <b>${i.food}</b> ${i.amount} · ${i.kcal} ккал\n<i>вместо: ${swaps}</i>`;
    })
    .join("\n\n");
  return (
    `<b>${MEAL_LABELS[key]}</b> · ${GOAL_LABELS[goal]}\n\n` +
    `${items}\n\n` +
    `<b>${meal.kcal} ккал</b> · Б ${meal.proteinG} · У ${meal.carbsG} · Ж ${meal.fatG}\n\n` +
    `<i>${PORTION_HINT[goal]}</i>`
  );
}

export function scaledMealKcal(menuId: MenuId, goal: MealGoal, key: MealKey): number {
  return dayMenu(menuId, goal).meals.find((m) => m.key === key)!.kcal;
}

/** Чтобы hint в приложении и проверка паритета видели ту же базу. */
export function menuBaseKcal(menuId: MenuId): number {
  return baseKcal(menuId);
}
