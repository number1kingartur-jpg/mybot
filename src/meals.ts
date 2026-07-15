/** Готовые меню на день — русское и тайское, под цель. */

export type MealKey = "breakfast" | "lunch" | "snack" | "dinner";
export type MenuId = "ru" | "th";
export type MealGoal = "cut" | "maint" | "bulk";

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

export const GOAL_LABELS: Record<MealGoal, string> = {
  cut: "🔥 Сушка",
  maint: "⚖️ Поддержание",
  bulk: "📈 Набор массы",
};

/** Целевой калораж дня от базового меню ~2000 ккал. */
export const GOAL_KCAL: Record<MealGoal, number> = {
  cut: 1600,
  maint: 2200,
  bulk: 2800,
};

const BASE_KCAL = 2000;

export const MENUS: Record<MenuId, DayMenu> = {
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

const PORTION_HINT: Record<MealGoal, string> = {
  cut: "Порции на ~20% меньше базовых. Больше овощей, меньше масла и круп.",
  maint: "Стандартные порции под ежедневную активность.",
  bulk: "Порции на ~30–40% больше. Добавь рис/гречку и белок в обед и ужин.",
};

function scaleKbju(kbju: MealItem["kbju"], goal: MealGoal): MealItem["kbju"] {
  const f = GOAL_KCAL[goal] / BASE_KCAL;
  return kbju.map((v) => Math.round(v * f)) as MealItem["kbju"];
}

function dayTotal(menuId: MenuId, goal: MealGoal): [number, number, number, number] {
  const total: [number, number, number, number] = [0, 0, 0, 0];
  for (const k of MEAL_KEYS) {
    const s = scaleKbju(MENUS[menuId].meals[k].kbju, goal);
    total[0] += s[0];
    total[1] += s[1];
    total[2] += s[2];
    total[3] += s[3];
  }
  return total;
}

export function goalPickerText(menuId: MenuId): string {
  const menu = MENUS[menuId];
  return (
    `<b>${menu.title}</b>\n\n` +
    `Выбери цель — подстрою калораж и порции:\n\n` +
    `🔥 <b>Сушка</b> — ~${GOAL_KCAL.cut} ккал\n` +
    `⚖️ <b>Поддержание</b> — ~${GOAL_KCAL.maint} ккал\n` +
    `📈 <b>Набор</b> — ~${GOAL_KCAL.bulk} ккал`
  );
}

export function dayMenuSummary(menuId: MenuId, goal: MealGoal): { text: string; total: [number, number, number, number] } {
  const menu = MENUS[menuId];
  const total = dayTotal(menuId, goal);
  const text =
    `<b>${menu.title}</b> · ${GOAL_LABELS[goal]}\n` +
    `<i>${PORTION_HINT[goal]}</i>\n\n` +
    `Итого: <b>${total[0]} ккал</b> · Б ${total[1]} · У ${total[2]} · Ж ${total[3]}\n\n` +
    `Выбери приём пищи:`;
  return { text, total };
}

export function mealDetailText(menuId: MenuId, goal: MealGoal, key: MealKey): string {
  const meal = MENUS[menuId].meals[key];
  const [kcal, p, c, f] = scaleKbju(meal.kbju, goal);
  const items = meal.items.map((i) => `▪️ ${i}`).join("\n");
  return (
    `<b>${meal.name}</b> · ${GOAL_LABELS[goal]}\n\n` +
    `${items}\n\n` +
    `<b>${kcal} ккал</b> · Б ${p} · У ${c} · Ж ${f}\n\n` +
    `<i>${PORTION_HINT[goal]}</i>`
  );
}

export function scaledMealKcal(menuId: MenuId, goal: MealGoal, key: MealKey): number {
  return scaleKbju(MENUS[menuId].meals[key].kbju, goal)[0];
}
