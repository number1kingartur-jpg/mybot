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
  /** Блюдо уже готовилось на масле: жир жарки входит в кбжу, второй раз его не добавляем. */
  fatIncluded?: boolean;
  /** Чистый жир готовки (не заправка): именно его отбрасываем рядом с жареным блюдом. */
  cookingFat?: boolean;
}

/**
 * Справочник КБЖУ на 100 г **готового** продукта.
 *
 * Ключевое требование Артура: домашняя еда, а не только магазинная и ресторанная.
 * Поэтому у одного продукта столько позиций, сколько у него способов приготовления:
 * курица отварная и курица жареная различаются по жиру втрое, а котлета из той же
 * курицы — вчетверо, потому что в ней хлеб, яйцо и впитанное масло. Пока в
 * справочнике была одна «Курица» (отварная грудка), любая домашняя котлета
 * получала 4 г жира вместо 14 — цифра, которой не бывает у жареного.
 */
export const FOODS: FoodItem[] = [
  // ── Мясо и рыба: отдельно способ приготовления ──────────────────────────────
  { aliases: ["курица отварная", "курица варёная", "курица варенная", "курица на пару", "отварная курица", "куриная грудка отварная", "boiled chicken"], name: "Курица отварная", kcal100: 165, p100: 31, f100: 3.6, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["курица жареная", "жареная курица", "куриная грудка жареная", "курица на масле", "fried chicken breast"], name: "Курица жареная", kcal100: 210, p100: 28, f100: 10, c100: 1, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["курица запечённая", "курица запеченная", "курица в духовке", "курица гриль", "куриная ножка", "куриное бедро", "grilled chicken", "baked chicken"], name: "Курица запечённая", kcal100: 235, p100: 26, f100: 14, c100: 0, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["chicken", "курица", "куриц", "курин"], name: "Курица", kcal100: 190, p100: 29, f100: 7, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["котлета куриная", "куриная котлета", "котлета из курицы", "котлета из индейки", "котлета индейки", "chicken cutlet", "chicken patty"], name: "Котлета куриная жареная", kcal100: 220, p100: 16, f100: 14, c100: 8, defaultG: 100, category: "protein", fatIncluded: true },
  { aliases: ["котлета", "котлета мясная", "котлета свиная", "котлета говяжья", "котлета домашняя", "биток", "cutlet", "meat patty"], name: "Котлета мясная жареная", kcal100: 265, p100: 15, f100: 20, c100: 9, defaultG: 100, category: "protein", fatIncluded: true },
  { aliases: ["котлета рыбная", "рыбная котлета", "котлета из рыбы", "fish cake"], name: "Котлета рыбная жареная", kcal100: 185, p100: 14, f100: 10, c100: 9, defaultG: 100, category: "protein", fatIncluded: true },
  { aliases: ["тефтели", "тефтеля", "фрикадельки", "митболы", "meatball"], name: "Тефтели в соусе", kcal100: 180, p100: 12, f100: 11, c100: 8, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["наггетсы", "нагетсы", "nuggets", "стрипсы"], name: "Наггетсы", kcal100: 290, p100: 15, f100: 18, c100: 17, defaultG: 120, category: "protein", fatIncluded: true },
  { aliases: ["шашлык куриный", "шашлык из курицы", "куриный шашлык"], name: "Шашлык куриный", kcal100: 200, p100: 25, f100: 10, c100: 2, defaultG: 200, category: "protein", fatIncluded: true },
  { aliases: ["шашлык", "шашлык свиной", "шашлык из свинины", "kebab"], name: "Шашлык свиной", kcal100: 290, p100: 22, f100: 22, c100: 1, defaultG: 200, category: "protein", fatIncluded: true },
  { aliases: ["фарш", "фарш тушёный", "фарш тушеный", "фарш жареный", "мясной соус", "болоньезе", "bolognese"], name: "Фарш тушёный", kcal100: 220, p100: 17, f100: 16, c100: 2, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["beef", "говядин", "стейк", "steak", "ribeye"], name: "Говядина", kcal100: 250, p100: 26, f100: 15, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["говядина тушёная", "говядина тушеная", "гуляш", "рагу мясное", "мясо тушёное", "мясо тушеное"], name: "Говядина тушёная", kcal100: 230, p100: 22, f100: 15, c100: 3, defaultG: 180, category: "protein", fatIncluded: true },
  { aliases: ["pork", "свинин", "свинина"], name: "Свинина", kcal100: 242, p100: 27, f100: 14, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["свинина жареная", "жареная свинина", "рёбра", "ребра", "грудинка"], name: "Свинина жареная", kcal100: 320, p100: 25, f100: 24, c100: 0, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["сосиск", "колбас", "сарделька", "sausage", "hot dog"], name: "Сосиски", kcal100: 300, p100: 12, f100: 27, c100: 3, defaultG: 100, category: "protein" },
  { aliases: ["salmon", "лосось", "лосос", "sashimi", "семга", "семги"], name: "Лосось", kcal100: 208, p100: 20, f100: 13, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["turkey", "индейка", "индейк"], name: "Индейка", kcal100: 135, p100: 30, f100: 1, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["рыба на пару", "рыба отварная", "рыба варёная", "рыба варенная", "рыба запечённая", "рыба запеченная", "steamed fish"], name: "Рыба на пару", kcal100: 120, p100: 22, f100: 2, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["рыба жареная", "жареная рыба", "рыба в панировке", "fried fish"], name: "Рыба жареная", kcal100: 200, p100: 20, f100: 12, c100: 4, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["fish", "рыба", "треска", "cod", "tilapia", "тиляпия"], name: "Рыба", kcal100: 120, p100: 22, f100: 2, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["tuna", "тунец"], name: "Тунец", kcal100: 132, p100: 28, f100: 1, c100: 0, defaultG: 120, category: "protein" },
  { aliases: ["shrimp", "prawn", "креветк", "креветки"], name: "Креветки", kcal100: 99, p100: 24, f100: 0.3, c100: 0.2, defaultG: 120, category: "protein" },
  { aliases: ["tofu", "тофу"], name: "Тофу", kcal100: 76, p100: 8, f100: 4.8, c100: 1.9, defaultG: 150, category: "protein" },
  { aliases: ["protein", "протеин", "whey", "shake"], name: "Протеин", kcal100: 400, p100: 80, f100: 5, c100: 8, defaultG: 30, category: "protein" },
  // ── Яйца: варка и жарка различаются маслом ─────────────────────────────────
  { aliases: ["яйцо отварное", "яйца отварные", "яйцо варёное", "яйцо вареное", "boiled egg"], name: "Яйца отварные", kcal100: 155, p100: 13, f100: 11, c100: 1, defaultG: 110, category: "protein" },
  { aliases: ["яичниц", "глазунья", "яйцо жареное", "яйца жареные", "fried egg"], name: "Яичница на масле", kcal100: 200, p100: 12, f100: 16, c100: 1, defaultG: 120, category: "protein", fatIncluded: true },
  { aliases: ["омлет", "omelet", "omelette", "скрэмбл"], name: "Омлет", kcal100: 185, p100: 11, f100: 14, c100: 3, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["egg", "яйц"], name: "Яйца", kcal100: 155, p100: 13, f100: 11, c100: 1, defaultG: 110, category: "protein" },
  // ── Творог и молочное: домашние блюда из творога ───────────────────────────
  { aliases: ["сырник", "сырники", "творожник", "творожники", "cheese pancake"], name: "Сырники жареные", kcal100: 220, p100: 14, f100: 10, c100: 20, defaultG: 120, category: "protein", fatIncluded: true },
  { aliases: ["запеканка", "запеканка творожная", "творожная запеканка", "casserole"], name: "Запеканка творожная", kcal100: 170, p100: 15, f100: 6, c100: 16, defaultG: 150, category: "protein" },
  { aliases: ["творог", "cottage", "cottage cheese", "творож"], name: "Творог", kcal100: 121, p100: 17, f100: 5, c100: 3, defaultG: 150, category: "protein" },
  { aliases: ["yogurt", "йогурт", "greek yogurt"], name: "Йогурт", kcal100: 95, p100: 10, f100: 3, c100: 8, defaultG: 150, category: "protein" },
  { aliases: ["молоко", "milk"], name: "Молоко", kcal100: 60, p100: 3, f100: 3.2, c100: 4.7, defaultG: 200, category: "other" },
  { aliases: ["кефир", "ряженка", "айран"], name: "Кефир", kcal100: 50, p100: 3, f100: 2, c100: 4, defaultG: 200, category: "other" },
  { aliases: ["сметана", "sour cream"], name: "Сметана", kcal100: 200, p100: 2.5, f100: 20, c100: 3.4, defaultG: 30, category: "fat" },
  // ── Гарниры: с маслом и без — разные позиции ───────────────────────────────
  { aliases: ["рис жареный", "жареный рис", "fried rice"], name: "Рис жареный", kcal100: 180, p100: 4, f100: 6, c100: 28, defaultG: 200, category: "carb", fatIncluded: true },
  { aliases: ["рис с маслом", "рис со сливочным маслом"], name: "Рис с маслом", kcal100: 155, p100: 2.7, f100: 3.5, c100: 28, defaultG: 180, category: "carb", fatIncluded: true },
  { aliases: ["rice", "рис", "рис отварной", "jasmine", "basmati"], name: "Рис отварной", kcal100: 130, p100: 2.7, f100: 0.3, c100: 28, defaultG: 180, category: "carb" },
  { aliases: ["макароны с маслом", "паста с маслом", "макароны со сливочным маслом", "макароны с сыром"], name: "Макароны с маслом", kcal100: 165, p100: 5, f100: 5.5, c100: 25, defaultG: 180, category: "carb", fatIncluded: true },
  { aliases: ["pasta", "макарон", "spaghetti", "паста", "рожки", "спираль", "фузилли", "радиаторе"], name: "Паста отварная", kcal100: 131, p100: 5, f100: 1.1, c100: 25, defaultG: 180, category: "carb" },
  { aliases: ["noodle", "лапша", "noodles", "rice noodle", "udon", "ramen", "фо", "pho"], name: "Лапша", kcal100: 138, p100: 4, f100: 2, c100: 25, defaultG: 200, category: "carb" },
  { aliases: ["гречка с маслом", "гречневая с маслом"], name: "Гречка с маслом", kcal100: 160, p100: 4.5, f100: 5, c100: 25, defaultG: 180, category: "carb", fatIncluded: true },
  { aliases: ["гречк", "buckwheat", "гречневая"], name: "Гречка отварная", kcal100: 132, p100: 4.5, f100: 1.6, c100: 25, defaultG: 180, category: "carb" },
  { aliases: ["овсянка на молоке", "овсяная каша на молоке", "каша овсяная на молоке"], name: "Овсянка на молоке", kcal100: 105, p100: 3.5, f100: 3.5, c100: 15, defaultG: 250, category: "carb" },
  { aliases: ["овсян", "oat", "oatmeal", "овсянка"], name: "Овсянка на воде", kcal100: 68, p100: 2.4, f100: 1.4, c100: 12, defaultG: 250, category: "carb" },
  { aliases: ["каша манная", "манка", "каша рисовая", "каша на молоке", "каша пшённая", "каша пшенная"], name: "Каша на молоке", kcal100: 100, p100: 3, f100: 3, c100: 15, defaultG: 250, category: "carb" },
  { aliases: ["картофель фри", "картошка фри", "fries", "french fries"], name: "Картофель фри", kcal100: 310, p100: 3.4, f100: 15, c100: 41, defaultG: 150, category: "carb", fatIncluded: true },
  { aliases: ["картофель жареный", "жареная картошка", "картошка жареная", "картофель на масле"], name: "Картофель жареный", kcal100: 190, p100: 2.5, f100: 9, c100: 23, defaultG: 200, category: "carb", fatIncluded: true },
  { aliases: ["пюре", "картофельное пюре", "mashed potato"], name: "Картофельное пюре", kcal100: 110, p100: 2, f100: 4, c100: 15, defaultG: 200, category: "carb", fatIncluded: true },
  { aliases: ["potato", "картоф", "картошк", "картофель отварной", "картошка варёная"], name: "Картофель отварной", kcal100: 85, p100: 2, f100: 0.4, c100: 17, defaultG: 200, category: "carb" },
  { aliases: ["bread", "хлеб", "toast", "булк", "baguette", "лаваш"], name: "Хлеб", kcal100: 265, p100: 9, f100: 3, c100: 49, defaultG: 60, category: "carb" },
  { aliases: ["бутерброд", "сэндвич", "sandwich", "тост с сыром"], name: "Бутерброд с сыром", kcal100: 300, p100: 12, f100: 14, c100: 32, defaultG: 100, category: "other" },
  { aliases: ["banana", "банан"], name: "Банан", kcal100: 89, p100: 1.1, f100: 0.3, c100: 23, defaultG: 120, category: "carb" },
  { aliases: ["mango", "манго"], name: "Манго", kcal100: 60, p100: 0.8, f100: 0.4, c100: 15, defaultG: 150, category: "carb" },
  { aliases: ["яблоко", "apple", "груша"], name: "Яблоко", kcal100: 52, p100: 0.3, f100: 0.2, c100: 14, defaultG: 180, category: "carb" },
  // ── Домашние составные блюда ───────────────────────────────────────────────
  { aliases: ["плов", "pilaf", "плов с курицей"], name: "Плов", kcal100: 190, p100: 9, f100: 7, c100: 22, defaultG: 250, category: "other", fatIncluded: true },
  { aliases: ["пельмени", "dumplings", "манты", "хинкали"], name: "Пельмени", kcal100: 250, p100: 12, f100: 8, c100: 34, defaultG: 250, category: "other" },
  { aliases: ["вареники", "вареник"], name: "Вареники", kcal100: 215, p100: 6, f100: 6, c100: 35, defaultG: 250, category: "other" },
  { aliases: ["блин", "блины", "блинчик", "pancake", "crepe"], name: "Блины", kcal100: 190, p100: 6, f100: 6, c100: 28, defaultG: 150, category: "other", fatIncluded: true },
  { aliases: ["оладь", "оладьи", "оладушки", "фриттер"], name: "Оладьи", kcal100: 230, p100: 6, f100: 9, c100: 31, defaultG: 150, category: "other", fatIncluded: true },
  { aliases: ["голубцы", "голубец", "перец фаршированный"], name: "Голубцы", kcal100: 130, p100: 7, f100: 7, c100: 9, defaultG: 250, category: "other", fatIncluded: true },
  { aliases: ["борщ", "borscht", "щи"], name: "Борщ", kcal100: 75, p100: 3, f100: 4.5, c100: 6, defaultG: 350, category: "other" },
  { aliases: ["soup", "суп", "бульон", "уха", "суп с вермишелью"], name: "Суп", kcal100: 60, p100: 4, f100: 2, c100: 7, defaultG: 350, category: "other" },
  { aliases: ["шаурма", "шаверма", "шаварма", "донер"], name: "Шаурма", kcal100: 220, p100: 12, f100: 12, c100: 16, defaultG: 300, category: "other", fatIncluded: true },
  // ── Овощи: сырые, тушёные и с маслом ──────────────────────────────────────
  { aliases: ["салат с маслом", "салат с оливковым маслом", "салат заправленный"], name: "Салат с маслом", kcal100: 90, p100: 1.5, f100: 7, c100: 5, defaultG: 150, category: "veg", fatIncluded: true },
  { aliases: ["salad", "салат", "greens", "зелень", "leafy"], name: "Салат", kcal100: 35, p100: 1.5, f100: 0.5, c100: 5, defaultG: 120, category: "veg" },
  { aliases: ["овощи тушёные", "овощи тушеные", "овощи жареные", "рагу овощное", "овощи на масле"], name: "Овощи тушёные", kcal100: 90, p100: 2, f100: 6, c100: 7, defaultG: 180, category: "veg", fatIncluded: true },
  { aliases: ["vegetable", "vegetables", "veggies", "овощ", "овощи", "овощи на пару"], name: "Овощи", kcal100: 40, p100: 2, f100: 0.3, c100: 7, defaultG: 150, category: "veg" },
  { aliases: ["broccoli", "брокколи"], name: "Брокколи", kcal100: 34, p100: 2.8, f100: 0.4, c100: 7, defaultG: 120, category: "veg" },
  { aliases: ["cucumber", "огурц", "огурец", "огурцы"], name: "Огурец", kcal100: 15, p100: 0.7, f100: 0.1, c100: 3.6, defaultG: 100, category: "veg" },
  { aliases: ["tomato", "помидор", "помидоры"], name: "Помидоры", kcal100: 18, p100: 0.9, f100: 0.2, c100: 3.9, defaultG: 100, category: "veg" },
  // ── Жиры и соусы ──────────────────────────────────────────────────────────
  { aliases: ["масло сливочное", "сливочное масло", "butter"], name: "Масло сливочное", kcal100: 750, p100: 0.8, f100: 82, c100: 0.8, defaultG: 10, category: "fat", cookingFat: true },
  { aliases: ["oil", "масло", "olive", "масло растительное", "оливковое масло", "масло подсолнечное"], name: "Масло растительное", kcal100: 884, p100: 0, f100: 100, c100: 0, defaultG: 10, category: "fat", cookingFat: true },
  { aliases: ["сало", "смалец", "lard"], name: "Сало", kcal100: 800, p100: 2, f100: 89, c100: 0, defaultG: 30, category: "fat", cookingFat: true },
  { aliases: ["майонез", "mayo", "соус майонезный"], name: "Майонез", kcal100: 630, p100: 1, f100: 67, c100: 2.6, defaultG: 20, category: "fat" },
  { aliases: ["cheese", "сыр"], name: "Сыр", kcal100: 350, p100: 25, f100: 28, c100: 1, defaultG: 40, category: "fat" },
  { aliases: ["avocado", "авокадо"], name: "Авокадо", kcal100: 160, p100: 2, f100: 15, c100: 9, defaultG: 80, category: "fat" },
  { aliases: ["nuts", "орех", "орехи", "almond", "миндаль"], name: "Орехи", kcal100: 580, p100: 21, f100: 50, c100: 20, defaultG: 30, category: "fat" },
  { aliases: ["coconut", "кокос", "coconut milk"], name: "Кокос", kcal100: 230, p100: 2.3, f100: 24, c100: 6, defaultG: 80, category: "fat" },
  // ── Сладкое ───────────────────────────────────────────────────────────────
  { aliases: ["сахар", "sugar"], name: "Сахар", kcal100: 400, p100: 0, f100: 0, c100: 100, defaultG: 10, category: "other" },
  { aliases: ["мёд", "мед", "honey"], name: "Мёд", kcal100: 320, p100: 0.3, f100: 0, c100: 80, defaultG: 20, category: "other" },
  { aliases: ["варенье", "джем", "jam", "сгущёнка", "сгущенка"], name: "Варенье", kcal100: 250, p100: 0.3, f100: 0, c100: 62, defaultG: 30, category: "other" },
  { aliases: ["шоколад", "chocolate", "конфет"], name: "Шоколад", kcal100: 550, p100: 6, f100: 32, c100: 58, defaultG: 30, category: "other" },
  { aliases: ["печенье", "cookie", "вафли", "пряник"], name: "Печенье", kcal100: 450, p100: 6, f100: 17, c100: 68, defaultG: 50, category: "other" },
  { aliases: ["мороженое", "ice cream"], name: "Мороженое", kcal100: 210, p100: 3.5, f100: 11, c100: 25, defaultG: 100, category: "other" },
  { aliases: ["торт", "пирожное", "cake", "чизкейк"], name: "Торт", kcal100: 380, p100: 5, f100: 20, c100: 45, defaultG: 100, category: "other" },
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
  { aliases: ["sushi", "суши", "ролл", "roll", "maki"], name: "Суши", kcal100: 150, p100: 6, f100: 3, c100: 24, defaultG: 200, category: "other" },
  { aliases: ["burrito", "боул", "bowl", "poke", "поке"], name: "Боул", kcal100: 140, p100: 10, f100: 5, c100: 15, defaultG: 350, category: "other" },
];

function norm(s: string): string {
  // Дефис — то же слово: «спринг-роллы» иначе не совпадали с «спринг ролл»
  // и подтягивались к «ролл» из суши.
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Подбор позиции справочника по названию от модели.
 *
 * Точное совпадение важнее длины, а прямое вхождение важнее обратного: без этого
 * короткое «котлета» подтягивалось к длинному алиасу «котлета куриная» и мясная
 * котлета считалась куриной — 20 г жира превращались в 14.
 */
export function matchFood(name: string): FoodItem | null {
  const t = norm(name);
  if (!t) return null;
  let best: FoodItem | null = null;
  let bestScore = 0;
  for (const food of FOODS) {
    for (const raw of food.aliases) {
      const alias = norm(raw);
      let score = 0;
      if (t === alias) score = 10000;
      else if (t.includes(alias)) score = 1000 + alias.length; // «котлета куриная жареная» ⊃ «котлета куриная»
      else if (alias.includes(t) && t.length >= 4) score = 100 + t.length; // «котлет» → «котлета»
      if (score > bestScore) {
        best = food;
        bestScore = score;
      }
    }
  }
  return best;
}

/**
 * Граммы рядом с найденным названием.
 *
 * Прежний разбор требовал число вплотную к названию, поэтому «котлета куриная
 * жареная 90 г» давало порцию по умолчанию — 100 г вместо 90, а для пасты 180
 * вместо 95. Теперь берём кусок строки между разделителями (одно блюдо — один
 * кусок) и ищем число в нём.
 */
function parseGrams(text: string, food: FoodItem, at = -1): number {
  const from = at >= 0 ? text.lastIndexOf(",", at) + 1 : 0;
  let to = at >= 0 ? text.indexOf(",", at) : -1;
  if (to < 0) to = text.length;
  const segment = text.slice(from, to);

  const withUnit = segment.match(/(\d{2,4})\s*(?:г|g|гр|грам\w*|gram\w*)\b/i);
  if (withUnit) {
    const g = Number(withUnit[1]);
    if (g >= 20 && g <= 800) return g;
  }
  const bare = segment.match(/\b(\d{2,4})\b/);
  if (bare) {
    const g = Number(bare[1]);
    if (g >= 20 && g <= 800) return g;
  }
  return food.defaultG;
}

function buildMeal(matched: { food: FoodItem; grams: number }[], note: string): MealAnalysis {
  // Складываем одинаковое, но не выбрасываем разное. Прежняя дедупликация шла по
  // категории и оставляла только первый продукт в ней: тарелка «котлета + яйцо»
  // теряла яйцо, «рис + хлеб» теряли хлеб — и приём выходил легче, чем был.
  const byName = new Map<string, { food: FoodItem; grams: number }>();
  for (const item of matched) {
    const cur = byName.get(item.food.name);
    if (cur) cur.grams = Math.min(cur.grams + item.grams, 1500);
    else byName.set(item.food.name, { ...item });
  }
  let unique = [...byName.values()];

  // У жареного блюда масло уже в составе. Если модель назовёт его отдельной
  // строкой, жир удвоится — а это самая крупная ошибка из возможных здесь.
  let oilDropped = false;
  if (unique.some((i) => i.food.fatIncluded)) {
    const before = unique.length;
    unique = unique.filter((i) => !i.food.cookingFat);
    oilDropped = unique.length !== before;
  }
  if (oilDropped) note = `${note} Масло учтено в блюде.`;

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

  // Заглавная только первая буква: прежний вариант поднимал каждое слово и
  // выдавал «Курица ~90 Г, Паста ~70 Г» с заглавной единицей измерения
  const title = parts.slice(0, 4).join(", ");
  return {
    name: title.charAt(0).toUpperCase() + title.slice(1),
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
  // Точность честнее прежних ±10–15%: на фото не видно, сколько масла впитало
  // блюдо, а это единственная цифра, которая может уехать вдвое
  const fried = matched.some((m) => m.food.fatIncluded);
  const note = fried
    ? "Справочник RASCHET. Жарка учтена, масло на глаз: ±20%."
    : "Справочник RASCHET. Точность ±15%.";
  return buildMeal(matched, note);
}

export function macrosFromText(description: string): MealAnalysis | null {
  const text = norm(description);
  const matched: { food: FoodItem; grams: number }[] = [];

  // Ищем все продукты в строке, запоминая, каким куском текста опознан каждый.
  type Hit = { food: FoodItem; start: number; end: number; len: number };
  const hits: Hit[] = [];
  for (const food of FOODS) {
    let best: Hit | null = null;
    for (const raw of food.aliases) {
      const alias = norm(raw);
      const idx = text.indexOf(alias);
      if (idx < 0) continue;
      if (!best || alias.length > best.len) {
        best = { food, start: idx, end: idx + alias.length, len: alias.length };
      }
    }
    if (best) hits.push(best);
  }

  // Точное совпадение вытесняет общее: «котлета куриная жареная» перекрывает и
  // «котлета», и «курин», иначе одна котлета посчиталась бы тремя продуктами.
  const kept = hits.filter(
    (h) => !hits.some((o) => o !== h && o.len > h.len && o.start <= h.start && o.end >= h.end)
  );
  for (const h of kept) matched.push({ food: h.food, grams: parseGrams(text, h.food, h.start) });

  if (!matched.length) return null;
  const fried = matched.some((m) => m.food.fatIncluded);
  return buildMeal(
    matched,
    fried ? "Справочник RASCHET. Жарка учтена, масло на глаз: ±20%." : "Справочник RASCHET. Точность ±15%."
  );
}
