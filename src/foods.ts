import type { MealAnalysis } from "./meal";

export interface FoodItem {
  aliases: string[];
  name: string;
  kcal100: number;
  p100: number;
  f100: number;
  c100: number;
  defaultG: number;
  category: "protein" | "carb" | "veg" | "fat" | "other";
}

export const FOODS: FoodItem[] = [
  // Белок
  { aliases: ["salmon", "лосось", "лосос", "sashimi", "семга", "семги"], name: "Лосось", kcal100: 208, p100: 20, f100: 13, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["chicken", "курица", "куриц", "курин", "grilled chicken"], name: "Курица", kcal100: 165, p100: 31, f100: 3.6, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["turkey", "индейка", "индейк"], name: "Индейка", kcal100: 135, p100: 30, f100: 1, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["beef", "говядин", "стейк", "steak", "ribeye"], name: "Говядина", kcal100: 250, p100: 26, f100: 15, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["pork", "свинин", "свинина"], name: "Свинина", kcal100: 242, p100: 27, f100: 14, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["fish", "рыба", "треска", "cod", "tilapia", "тиляпия"], name: "Рыба", kcal100: 120, p100: 22, f100: 2, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["tuna", "тунец"], name: "Тунец", kcal100: 132, p100: 28, f100: 1, c100: 0, defaultG: 120, category: "protein" },
  { aliases: ["shrimp", "prawn", "креветк", "креветки"], name: "Креветки", kcal100: 99, p100: 24, f100: 0.3, c100: 0.2, defaultG: 120, category: "protein" },
  { aliases: ["egg", "яйц", "omelet", "омлет", "яичниц"], name: "Яйца", kcal100: 155, p100: 13, f100: 11, c100: 1, defaultG: 120, category: "protein" },
  { aliases: ["tofu", "тофу"], name: "Тофу", kcal100: 76, p100: 8, f100: 4.8, c100: 1.9, defaultG: 150, category: "protein" },
  { aliases: ["yogurt", "йогурт", "greek yogurt"], name: "Йогурт", kcal100: 95, p100: 10, f100: 3, c100: 8, defaultG: 150, category: "protein" },
  { aliases: ["творог", "cottage", "cottage cheese", "творож"], name: "Творог", kcal100: 121, p100: 17, f100: 5, c100: 3, defaultG: 150, category: "protein" },
  { aliases: ["protein", "протеин", "whey", "shake"], name: "Протеин", kcal100: 400, p100: 80, f100: 5, c100: 8, defaultG: 30, category: "protein" },
  // Углеводы
  { aliases: ["rice", "рис", "jasmine", "basmati", "fried rice", "жареный рис"], name: "Рис", kcal100: 130, p100: 2.7, f100: 0.3, c100: 28, defaultG: 180, category: "carb" },
  { aliases: ["pasta", "макарон", "spaghetti", "паста"], name: "Паста", kcal100: 131, p100: 5, f100: 1.1, c100: 25, defaultG: 180, category: "carb" },
  { aliases: ["noodle", "лапша", "noodles", "rice noodle", "udon", "ramen", "фо", "pho"], name: "Лапша", kcal100: 138, p100: 4, f100: 2, c100: 25, defaultG: 200, category: "carb" },
  { aliases: ["гречк", "buckwheat", "гречневая"], name: "Гречка", kcal100: 132, p100: 4.5, f100: 1.6, c100: 25, defaultG: 180, category: "carb" },
  { aliases: ["овсян", "oat", "oatmeal", "овсянка"], name: "Овсянка", kcal100: 68, p100: 2.4, f100: 1.4, c100: 12, defaultG: 200, category: "carb" },
  { aliases: ["potato", "картоф", "fries", "фри", "картошк"], name: "Картофель", kcal100: 110, p100: 2, f100: 4, c100: 17, defaultG: 180, category: "carb" },
  { aliases: ["bread", "хлеб", "toast", "булк", "baguette"], name: "Хлеб", kcal100: 265, p100: 9, f100: 3, c100: 49, defaultG: 60, category: "carb" },
  { aliases: ["banana", "банан"], name: "Банан", kcal100: 89, p100: 1.1, f100: 0.3, c100: 23, defaultG: 120, category: "carb" },
  { aliases: ["mango", "манго"], name: "Манго", kcal100: 60, p100: 0.8, f100: 0.4, c100: 15, defaultG: 150, category: "carb" },
  // Овощи
  { aliases: ["salad", "салат", "greens", "зелень", "leafy"], name: "Салат", kcal100: 35, p100: 1.5, f100: 0.5, c100: 5, defaultG: 100, category: "veg" },
  { aliases: ["vegetable", "vegetables", "veggies", "овощ", "овощи"], name: "Овощи", kcal100: 40, p100: 2, f100: 0.3, c100: 7, defaultG: 120, category: "veg" },
  { aliases: ["broccoli", "брокколи"], name: "Брокколи", kcal100: 34, p100: 2.8, f100: 0.4, c100: 7, defaultG: 120, category: "veg" },
  { aliases: ["cucumber", "огурц"], name: "Огурец", kcal100: 15, p100: 0.7, f100: 0.1, c100: 3.6, defaultG: 100, category: "veg" },
  { aliases: ["tomato", "помидор", "помидоры"], name: "Помидоры", kcal100: 18, p100: 0.9, f100: 0.2, c100: 3.9, defaultG: 100, category: "veg" },
  // Жиры
  { aliases: ["avocado", "авокадо"], name: "Авокадо", kcal100: 160, p100: 2, f100: 15, c100: 9, defaultG: 80, category: "fat" },
  { aliases: ["cheese", "сыр"], name: "Сыр", kcal100: 350, p100: 25, f100: 28, c100: 1, defaultG: 40, category: "fat" },
  { aliases: ["nuts", "орех", "орехи", "almond", "миндаль"], name: "Орехи", kcal100: 580, p100: 21, f100: 50, c100: 20, defaultG: 30, category: "fat" },
  { aliases: ["oil", "масло", "olive"], name: "Масло", kcal100: 884, p100: 0, f100: 100, c100: 0, defaultG: 10, category: "fat" },
  { aliases: ["coconut", "кокос", "coconut milk"], name: "Кокос", kcal100: 230, p100: 2.3, f100: 24, c100: 6, defaultG: 80, category: "fat" },
  // Тайская / ресторанная кухня
  { aliases: ["pad thai", "пад тай", "padthai"], name: "Пад Тай", kcal100: 180, p100: 8, f100: 7, c100: 22, defaultG: 300, category: "other" },
  { aliases: ["tom yum", "том ям", "tomyum"], name: "Том Ям", kcal100: 60, p100: 5, f100: 2, c100: 6, defaultG: 350, category: "other" },
  { aliases: ["green curry", "зеленое карри", "green curry"], name: "Зелёное карри", kcal100: 120, p100: 8, f100: 7, c100: 6, defaultG: 300, category: "other" },
  { aliases: ["massaman", "массаман"], name: "Массаман", kcal100: 140, p100: 7, f100: 8, c100: 10, defaultG: 300, category: "other" },
  { aliases: ["som tam", "сом там", "papaya salad", "салат из папайи"], name: "Сом Там", kcal100: 55, p100: 2, f100: 1, c100: 10, defaultG: 200, category: "other" },
  { aliases: ["spring roll", "спринг ролл", "spring rolls"], name: "Спринг-роллы", kcal100: 180, p100: 6, f100: 6, c100: 24, defaultG: 150, category: "other" },
  { aliases: ["satay", "сате", "satay chicken"], name: "Сате", kcal100: 200, p100: 18, f100: 10, c100: 5, defaultG: 150, category: "other" },
  { aliases: ["sticky rice", "клейкий рис", "mango sticky"], name: "Клейкий рис", kcal100: 170, p100: 3, f100: 3, c100: 35, defaultG: 150, category: "carb" },
  // Готовые блюда
  { aliases: ["pizza", "пицц"], name: "Пицца", kcal100: 266, p100: 11, f100: 10, c100: 33, defaultG: 200, category: "other" },
  { aliases: ["burger", "бургер"], name: "Бургер", kcal100: 250, p100: 14, f100: 12, c100: 22, defaultG: 220, category: "other" },
  { aliases: ["soup", "суп", "борщ", "borscht"], name: "Суп", kcal100: 60, p100: 4, f100: 2, c100: 7, defaultG: 300, category: "other" },
  { aliases: ["sushi", "суши", "ролл", "roll", "maki"], name: "Суши", kcal100: 150, p100: 6, f100: 3, c100: 24, defaultG: 200, category: "other" },
  { aliases: ["burrito", "боул", "bowl", "poke", "поке"], name: "Боул", kcal100: 140, p100: 10, f100: 5, c100: 15, defaultG: 350, category: "other" },
];

export function matchFood(name: string): FoodItem | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  let best: FoodItem | null = null;
  let bestLen = 0;
  for (const food of FOODS) {
    for (const alias of food.aliases) {
      if (t.includes(alias) || alias.includes(t)) {
        if (alias.length > bestLen) {
          best = food;
          bestLen = alias.length;
        }
      }
    }
  }
  return best;
}

function parseGrams(text: string, food: FoodItem): number {
  for (const alias of food.aliases) {
    const re = new RegExp(`(\\d{2,4})\\s*(?:g|г|gram|grams|грам)\\s*(?:of\\s+)?${alias}|${alias}\\s*(\\d{2,4})\\s*(?:g|г)`, "i");
    const m = text.match(re);
    const g = Number(m?.[1] ?? m?.[2]);
    if (g >= 20 && g <= 800) return g;
  }
  return food.defaultG;
}

function buildMeal(matched: { food: FoodItem; grams: number }[], note: string): MealAnalysis {
  const byCategory = new Map<string, typeof matched[0]>();
  for (const item of matched) {
    const key = item.food.category === "other" ? item.food.name : item.food.category;
    if (!byCategory.has(key)) byCategory.set(key, item);
  }
  const unique = [...byCategory.values()];

  let kcal = 0;
  let proteinG = 0;
  let fatG = 0;
  let carbsG = 0;
  const parts: string[] = [];

  for (const { food, grams } of unique) {
    const mul = grams / 100;
    kcal += food.kcal100 * mul;
    proteinG += food.p100 * mul;
    fatG += food.f100 * mul;
    carbsG += food.c100 * mul;
    parts.push(`${food.name.toLowerCase()} ~${Math.round(grams)} г`);
  }

  return {
    name: parts.slice(0, 4).join(", ").replace(/(^|\s)\S/g, (s) => s.toUpperCase()),
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
    note,
  };
}

export function macrosFromItems(items: { name: string; grams: number }[]): MealAnalysis | null {
  const matched: { food: FoodItem; grams: number }[] = [];
  for (const item of items) {
    const food = matchFood(item.name);
    if (!food) continue;
    const grams = item.grams >= 20 && item.grams <= 800 ? item.grams : food.defaultG;
    matched.push({ food, grams });
  }
  if (!matched.length) return null;
  const n = matched.length;
  const note = n >= 2
    ? `Справочник RASCHET (${n} компонента). Точность ±10–15%.`
    : "Справочник RASCHET. Точность ±10–15%.";
  return buildMeal(matched, note);
}

export function macrosFromText(description: string): MealAnalysis | null {
  const text = description.toLowerCase();
  const matched: { food: FoodItem; grams: number }[] = [];

  for (const food of FOODS) {
    if (food.aliases.some((a) => text.includes(a))) {
      matched.push({ food, grams: parseGrams(text, food) });
    }
  }

  if (!matched.length) return null;
  return buildMeal(matched, "Справочник RASCHET. Точность ±10–15%.");
}
