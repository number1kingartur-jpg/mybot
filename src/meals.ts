/** Готовые меню на день (~2000 ккал) — русское и тайское. */

export type MealKey = "breakfast" | "lunch" | "snack" | "dinner";

export type MealItem = {
  name: string;
  items: string[];
  kbju: [kcal: number, protein: number, carbs: number, fat: number];
};

export type DayMenu = {
  title: string;
  meals: Record<MealKey, MealItem>;
};

export const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "snack", "dinner"];

export const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: "🌅 Завтрак",
  lunch: "☀️ Обед",
  snack: "🍎 Перекус",
  dinner: "🌙 Ужин",
};

export const MENUS: Record<"ru" | "th", DayMenu> = {
  ru: {
    title: "Русское меню",
    meals: {
      breakfast: {
        name: "Завтрак",
        items: ["Овсянка 80 г", "Банан 1 шт", "Яйца 2 шт", "Творог 5% 100 г"],
        kbju: [520, 35, 55, 12],
      },
      lunch: {
        name: "Обед",
        items: ["Курица 200 г", "Гречка 150 г", "Овощи на пару 200 г", "Оливковое масло 1 ч.л."],
        kbju: [650, 55, 60, 15],
      },
      snack: {
        name: "Перекус",
        items: ["Творог 150 г", "Орехи 30 г", "Яблоко 1 шт"],
        kbju: [380, 25, 20, 22],
      },
      dinner: {
        name: "Ужин",
        items: ["Рыба 200 г", "Рис 100 г", "Салат 150 г"],
        kbju: [450, 40, 35, 18],
      },
    },
  },
  th: {
    title: "Тайское меню",
    meals: {
      breakfast: {
        name: "Завтрак",
        items: ["Khao Tom 300 г", "Яйцо 2 шт", "Pak choi 100 г"],
        kbju: [480, 22, 55, 18],
      },
      lunch: {
        name: "Обед",
        items: ["Pad Kra Pao 300 г", "Рис жасмин 150 г", "Яйцо 1 шт"],
        kbju: [720, 45, 75, 28],
      },
      snack: {
        name: "Перекус",
        items: ["Som Tam 200 г", "Gai Satay 100 г"],
        kbju: [350, 28, 15, 20],
      },
      dinner: {
        name: "Ужин",
        items: ["Tom Yum 300 г", "Рис 100 г", "Овощи 100 г"],
        kbju: [450, 30, 45, 18],
      },
    },
  },
};

export function dayMenuSummary(menuId: "ru" | "th"): { text: string; total: [number, number, number, number] } {
  const menu = MENUS[menuId];
  const total: [number, number, number, number] = [0, 0, 0, 0];
  for (const k of MEAL_KEYS) {
    const [kcal, p, c, f] = menu.meals[k].kbju;
    total[0] += kcal;
    total[1] += p;
    total[2] += c;
    total[3] += f;
  }
  const text =
    `<b>${menu.title} — 2000 ккал</b>\n\n` +
    `Итого: ${total[0]} ккал · Б ${total[1]} · У ${total[2]} · Ж ${total[3]}\n\n` +
    `Выбери приём пищи:`;
  return { text, total };
}

export function mealDetailText(menuId: "ru" | "th", key: MealKey): string {
  const meal = MENUS[menuId].meals[key];
  const [kcal, p, c, f] = meal.kbju;
  const items = meal.items.map((i) => `▪️ ${i}`).join("\n");
  return `<b>${meal.name}</b>\n\n${items}\n\n${kcal} ккал · Б ${p} · У ${c} · Ж ${f}`;
}
