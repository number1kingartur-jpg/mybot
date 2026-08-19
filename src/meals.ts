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

export const MENUS: Record<MenuId, DayMenu> = {
  ru: {
    title: "Русское меню",
    meals: {
      breakfast: [
        { food: "Овсянка на молоке", g: 250, alt: ["Гречка отварная", "Хлеб", "Сырники жареные"] },
        { food: "Банан", g: 120, alt: ["Яблоко", "Сок", "Мёд"] },
        { food: "Яйца", g: 110, alt: ["Омлет", "Яичница на масле", "Сыр"] },
        { food: "Творог", g: 100, alt: ["Йогурт", "Кефир", "Протеин"] },
      ],
      lunch: [
        { food: "Курица", g: 180, alt: ["Индейка", "Говядина", "Рыба на пару"] },
        { food: "Гречка отварная", g: 200, alt: ["Рис отварной", "Паста отварная", "Картофель отварной"] },
        { food: "Овощи", g: 200, alt: ["Салат", "Овощи тушёные", "Суп"] },
        { food: "Масло растительное", g: 5, alt: ["Масло сливочное", "Сметана", "Авокадо"] },
      ],
      snack: [
        { food: "Творог", g: 150, alt: ["Йогурт", "Кефир", "Сыр"] },
        { food: "Орехи", g: 30, alt: ["Арахисовая паста", "Авокадо", "Шоколад"] },
        { food: "Яблоко", g: 180, alt: ["Банан", "Сок", "Молоко"] },
      ],
      dinner: [
        { food: "Рыба на пару", g: 200, alt: ["Лосось", "Тунец", "Креветки"] },
        { food: "Рис отварной", g: 150, alt: ["Гречка отварная", "Картофель отварной", "Паста отварная"] },
        { food: "Салат", g: 150, alt: ["Овощи", "Овощи тушёные", "Суп"] },
      ],
    },
  },
  th: {
    title: "Тайское меню",
    meals: {
      breakfast: [
        { food: "Омлет", g: 150, alt: ["Яйца", "Яичница на масле", "Творог"] },
        { food: "Рис отварной", g: 150, alt: ["Хлеб", "Овсянка на молоке", "Гречка отварная"] },
        { food: "Сок", g: 200, alt: ["Кофе чёрный", "Молоко", "Кефир"] },
      ],
      lunch: [
        { food: "Пад Тай", g: 300, alt: ["Том Ям", "Суши", "Паста отварная"] },
        { food: "Курица запечённая", g: 120, alt: ["Креветки", "Индейка", "Шашлык куриный"] },
      ],
      snack: [
        { food: "Сом Там", g: 200, alt: ["Салат", "Овощи", "Яблоко"] },
        { food: "Сате", g: 120, alt: ["Шашлык куриный", "Креветки", "Курица отварная"] },
      ],
      dinner: [
        { food: "Том Ям", g: 350, alt: ["Суп", "Пад Тай", "Сом Там"] },
        { food: "Рис отварной", g: 150, alt: ["Гречка отварная", "Картофель отварной", "Хлеб"] },
        { food: "Креветки", g: 120, alt: ["Рыба на пару", "Тунец", "Курица отварная"] },
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
const MILLILITRES = new Set(["Кефир", "Молоко", "Сок", "Кофе чёрный"]);

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

function buildItem(def: MenuItemDef, factor: number): MenuItem {
  const baseG = roundG(def.food, def.g * factor);
  const base = option(def.food, baseG);
  const options = [base, ...def.alt.map((name) => option(name, swapG(name, base.kcal)))];
  return { ...base, options };
}

/** Калорийность меню в базовых порциях: от неё считается множитель под цель. */
function baseKcal(menuId: MenuId): number {
  let total = 0;
  for (const key of MEAL_KEYS) {
    for (const def of MENUS[menuId].meals[key]) total += nutr(def.food, def.g).kcal;
  }
  return total;
}

/** Итог: [ккал, белок, углеводы, жиры] — порядок как в тексте бота. */
export function dayMenu(menuId: MenuId, goal: MealGoal): { meals: MenuMeal[]; total: number[] } {
  const factor = GOAL_KCAL[goal] / baseKcal(menuId);
  const meals: MenuMeal[] = MEAL_KEYS.map((key) => {
    const items = MENUS[menuId].meals[key].map((def) => buildItem(def, factor));
    return {
      key,
      label: MEAL_LABELS[key],
      items,
      kcal: items.reduce((s, i) => s + i.kcal, 0),
      proteinG: items.reduce((s, i) => s + i.proteinG, 0),
      fatG: items.reduce((s, i) => s + i.fatG, 0),
      carbsG: items.reduce((s, i) => s + i.carbsG, 0),
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
