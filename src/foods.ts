import type { MealAnalysis, MealPart } from "./meal";

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

  // ── Бытовые меры ───────────────────────────────────────────────────────────
  // Люди не взвешивают коктейль: они говорят «три банана, восемь ложек овсянки,
  // два скупа протеина». Без этих полей такой приём считался порциями по
  // умолчанию, то есть неверно в разы.
  /** Вес одной штуки: банан, яйцо, кусок хлеба, пельмень. */
  pieceG?: number;
  /** Столовая ложка (и просто «ложка»: в быту это столовая). */
  tbspG?: number;
  /** Чайная ложка. */
  tspG?: number;
  /** Мерная ложка из банки: скуп протеина, гейнера, креатина. */
  scoopG?: number;
  /** Грамм в миллилитре: молоко и жидкий белок плотнее воды. */
  densityGml?: number;
  /**
   * Что имеется в виду при измерении ложками. «Овсянка» в справочнике — готовая
   * каша (68 ккал/100 г), а «восемь ложек овсянки» в коктейль — это сухие
   * хлопья (380 ккал/100 г). Разница пятикратная, и это не опечатка в базе,
   * а разные продукты.
   */
  spoonVariant?: string;
  /** Разумный минимум порции: у креатина и масла он граммы, а не 20 г. */
  minG?: number;
  /** Позиция не из справочника, а с этикетки на фото: цифры дала модель. */
  fromLabel?: boolean;
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
  { aliases: ["котлета куриная", "куриная котлета", "котлета из курицы", "котлета из индейки", "котлета индейки", "chicken cutlet", "chicken patty"], name: "Котлета куриная жареная", kcal100: 220, p100: 16, f100: 14, c100: 8, defaultG: 100, category: "protein", fatIncluded: true, pieceG: 100, minG: 40 },
  { aliases: ["котлета", "котлета мясная", "котлета свиная", "котлета говяжья", "котлета домашняя", "биток", "cutlet", "meat patty"], name: "Котлета мясная жареная", kcal100: 265, p100: 15, f100: 20, c100: 9, defaultG: 100, category: "protein", fatIncluded: true, pieceG: 100, minG: 40 },
  { aliases: ["котлета рыбная", "рыбная котлета", "котлета из рыбы", "fish cake"], name: "Котлета рыбная жареная", kcal100: 185, p100: 14, f100: 10, c100: 9, defaultG: 100, category: "protein", fatIncluded: true, pieceG: 100, minG: 40 },
  { aliases: ["тефтели", "тефтеля", "фрикадельки", "митболы", "meatball"], name: "Тефтели в соусе", kcal100: 180, p100: 12, f100: 11, c100: 8, defaultG: 150, category: "protein", fatIncluded: true, pieceG: 40, minG: 30 },
  { aliases: ["наггетсы", "нагетсы", "nuggets", "стрипсы"], name: "Наггетсы", kcal100: 290, p100: 15, f100: 18, c100: 17, defaultG: 120, category: "protein", fatIncluded: true, pieceG: 20, minG: 20 },
  { aliases: ["шашлык куриный", "шашлык из курицы", "куриный шашлык"], name: "Шашлык куриный", kcal100: 200, p100: 25, f100: 10, c100: 2, defaultG: 200, category: "protein", fatIncluded: true },
  { aliases: ["шашлык", "шашлык свиной", "шашлык из свинины", "kebab"], name: "Шашлык свиной", kcal100: 290, p100: 22, f100: 22, c100: 1, defaultG: 200, category: "protein", fatIncluded: true },
  { aliases: ["фарш", "фарш тушёный", "фарш тушеный", "фарш жареный", "мясной соус", "болоньезе", "bolognese"], name: "Фарш тушёный", kcal100: 220, p100: 17, f100: 16, c100: 2, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["beef", "говядин", "стейк", "steak", "ribeye"], name: "Говядина", kcal100: 250, p100: 26, f100: 15, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["говядина тушёная", "говядина тушеная", "гуляш", "рагу мясное", "мясо тушёное", "мясо тушеное"], name: "Говядина тушёная", kcal100: 230, p100: 22, f100: 15, c100: 3, defaultG: 180, category: "protein", fatIncluded: true },
  { aliases: ["pork", "свинин", "свинина"], name: "Свинина", kcal100: 242, p100: 27, f100: 14, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["свинина жареная", "жареная свинина", "рёбра", "ребра", "грудинка"], name: "Свинина жареная", kcal100: 320, p100: 25, f100: 24, c100: 0, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["сосиск", "колбас", "сарделька", "sausage", "hot dog"], name: "Сосиски", kcal100: 300, p100: 12, f100: 27, c100: 3, defaultG: 100, category: "protein", pieceG: 50, minG: 20 },
  { aliases: ["salmon", "лосось", "лосос", "sashimi", "семга", "семги"], name: "Лосось", kcal100: 208, p100: 20, f100: 13, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["turkey", "индейка", "индейк"], name: "Индейка", kcal100: 135, p100: 30, f100: 1, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["рыба на пару", "рыба отварная", "рыба варёная", "рыба варенная", "рыба запечённая", "рыба запеченная", "steamed fish"], name: "Рыба на пару", kcal100: 120, p100: 22, f100: 2, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["рыба жареная", "жареная рыба", "рыба в панировке", "fried fish"], name: "Рыба жареная", kcal100: 200, p100: 20, f100: 12, c100: 4, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["fish", "рыб", "треска", "cod", "tilapia", "тиляпия"], name: "Рыба", kcal100: 120, p100: 22, f100: 2, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["tuna", "тунец", "тунц"], name: "Тунец", kcal100: 132, p100: 28, f100: 1, c100: 0, defaultG: 120, category: "protein" },
  { aliases: ["shrimp", "prawn", "креветк", "креветки"], name: "Креветки", kcal100: 99, p100: 24, f100: 0.3, c100: 0.2, defaultG: 120, category: "protein" },
  { aliases: ["tofu", "тофу"], name: "Тофу", kcal100: 76, p100: 8, f100: 4.8, c100: 1.9, defaultG: 150, category: "protein" },
  { aliases: ["protein", "протеин", "whey", "изолят", "сывороточный белок", "shake"], name: "Протеин", kcal100: 400, p100: 80, f100: 5, c100: 8, defaultG: 30, category: "protein", scoopG: 30, tbspG: 15, tspG: 5, minG: 3 },
  { aliases: ["гейнер", "gainer", "углеводно белковая смесь"], name: "Гейнер", kcal100: 380, p100: 15, f100: 4, c100: 70, defaultG: 100, category: "carb", scoopG: 75, tbspG: 20, minG: 10 },
  { aliases: ["жидкий белок", "жидкого белка", "жидкие белки", "жидких белков", "яичный белок", "яичного белка", "белок яичный", "белки яичные", "egg white", "egg whites", "liquid egg white"], name: "Белок яичный жидкий", kcal100: 52, p100: 11, f100: 0.2, c100: 0.7, defaultG: 200, category: "protein", densityGml: 1.03, tbspG: 15, minG: 20 },
  { aliases: ["креатин", "creatine", "моногидрат"], name: "Креатин", kcal100: 0, p100: 0, f100: 0, c100: 0, defaultG: 5, category: "other", scoopG: 5, tbspG: 5, tspG: 3, minG: 1 },
  { aliases: ["bcaa", "бцаа", "аминокислот", "глютамин"], name: "Аминокислоты", kcal100: 320, p100: 80, f100: 0, c100: 0, defaultG: 10, category: "protein", scoopG: 7, tspG: 5, minG: 1 },
  // ── Яйца: варка и жарка различаются маслом ─────────────────────────────────
  { aliases: ["яйцо отварное", "яйца отварные", "яйцо варёное", "яйцо вареное", "boiled egg"], name: "Яйца отварные", kcal100: 155, p100: 13, f100: 11, c100: 1, defaultG: 110, category: "protein" },
  { aliases: ["яичниц", "глазунья", "яйцо жареное", "яйца жареные", "fried egg"], name: "Яичница на масле", kcal100: 200, p100: 12, f100: 16, c100: 1, defaultG: 120, category: "protein", fatIncluded: true },
  { aliases: ["омлет", "omelet", "omelette", "скрэмбл"], name: "Омлет", kcal100: 185, p100: 11, f100: 14, c100: 3, defaultG: 150, category: "protein", fatIncluded: true },
  { aliases: ["egg", "яйц"], name: "Яйца", kcal100: 155, p100: 13, f100: 11, c100: 1, defaultG: 110, category: "protein", pieceG: 55, minG: 30 },
  // ── Творог и молочное: домашние блюда из творога ───────────────────────────
  { aliases: ["сырник", "сырники", "творожник", "творожники", "cheese pancake"], name: "Сырники жареные", kcal100: 220, p100: 14, f100: 10, c100: 20, defaultG: 120, category: "protein", fatIncluded: true, pieceG: 60, minG: 30 },
  { aliases: ["запеканка", "запеканка творожная", "творожная запеканка", "casserole"], name: "Запеканка творожная", kcal100: 170, p100: 15, f100: 6, c100: 16, defaultG: 150, category: "protein" },
  { aliases: ["творог", "cottage", "cottage cheese", "творож"], name: "Творог", kcal100: 121, p100: 17, f100: 5, c100: 3, defaultG: 150, category: "protein" },
  { aliases: ["yogurt", "йогурт", "greek yogurt"], name: "Йогурт", kcal100: 95, p100: 10, f100: 3, c100: 8, defaultG: 150, category: "protein", tbspG: 25, densityGml: 1.03 },
  { aliases: ["молоко миндальное", "миндальное молоко", "almond milk"], name: "Молоко миндальное", kcal100: 25, p100: 0.5, f100: 1.5, c100: 2.5, defaultG: 200, category: "other", densityGml: 1, minG: 20 },
  { aliases: ["молоко овсяное", "овсяное молоко", "oat milk"], name: "Молоко овсяное", kcal100: 45, p100: 1, f100: 1.5, c100: 7, defaultG: 200, category: "other", densityGml: 1.03, minG: 20 },
  { aliases: ["молок", "milk"], name: "Молоко", kcal100: 60, p100: 3, f100: 3.2, c100: 4.7, defaultG: 200, category: "other", densityGml: 1.03, tbspG: 15, minG: 20 },
  { aliases: ["кефир", "ряженка", "айран"], name: "Кефир", kcal100: 50, p100: 3, f100: 2, c100: 4, defaultG: 200, category: "other", densityGml: 1.03, minG: 20 },
  { aliases: ["сливк", "сливок", "cream"], name: "Сливки", kcal100: 205, p100: 2.5, f100: 20, c100: 4, defaultG: 50, category: "fat", densityGml: 1, tbspG: 15, tspG: 5, minG: 5 },
  { aliases: ["сметана", "sour cream"], name: "Сметана", kcal100: 200, p100: 2.5, f100: 20, c100: 3.4, defaultG: 30, category: "fat", tbspG: 25, tspG: 8, minG: 5 },
  { aliases: ["вода", "воды", "водой", "water"], name: "Вода", kcal100: 0, p100: 0, f100: 0, c100: 0, defaultG: 250, category: "other", densityGml: 1, minG: 10 },
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
  { aliases: ["овсяные хлопья", "хлопья овсяные", "хлопь", "геркулес", "овсянка сухая", "сухая овсянка", "овсяная мука", "rolled oats", "dry oats"], name: "Овсяные хлопья сухие", kcal100: 380, p100: 13, f100: 6.5, c100: 62, defaultG: 60, category: "carb", tbspG: 12, tspG: 4, scoopG: 30, minG: 5 },
  { aliases: ["овсян", "oat", "oatmeal", "овсянка"], name: "Овсянка на воде", kcal100: 68, p100: 2.4, f100: 1.4, c100: 12, defaultG: 250, category: "carb", spoonVariant: "Овсяные хлопья сухие", minG: 30 },
  { aliases: ["мюсли", "гранола", "granola", "muesli"], name: "Гранола", kcal100: 400, p100: 9, f100: 12, c100: 65, defaultG: 50, category: "carb", tbspG: 15, minG: 10 },
  { aliases: ["каша манная", "манка", "каша рисовая", "каша на молоке", "каша пшённая", "каша пшенная"], name: "Каша на молоке", kcal100: 100, p100: 3, f100: 3, c100: 15, defaultG: 250, category: "carb" },
  { aliases: ["картофель фри", "картошка фри", "fries", "french fries"], name: "Картофель фри", kcal100: 310, p100: 3.4, f100: 15, c100: 41, defaultG: 150, category: "carb", fatIncluded: true },
  { aliases: ["картофель жареный", "жареная картошка", "картошка жареная", "картофель на масле"], name: "Картофель жареный", kcal100: 190, p100: 2.5, f100: 9, c100: 23, defaultG: 200, category: "carb", fatIncluded: true },
  { aliases: ["пюре", "картофельное пюре", "mashed potato"], name: "Картофельное пюре", kcal100: 110, p100: 2, f100: 4, c100: 15, defaultG: 200, category: "carb", fatIncluded: true },
  { aliases: ["potato", "картоф", "картошк", "картофель отварной", "картошка варёная"], name: "Картофель отварной", kcal100: 85, p100: 2, f100: 0.4, c100: 17, defaultG: 200, category: "carb" },
  { aliases: ["bread", "хлеб", "toast", "булк", "baguette", "лаваш"], name: "Хлеб", kcal100: 265, p100: 9, f100: 3, c100: 49, defaultG: 60, category: "carb", pieceG: 30, minG: 15 },
  { aliases: ["бутерброд", "сэндвич", "sandwich", "тост с сыром"], name: "Бутерброд с сыром", kcal100: 300, p100: 12, f100: 14, c100: 32, defaultG: 100, category: "other" },
  { aliases: ["banana", "банан"], name: "Банан", kcal100: 89, p100: 1.1, f100: 0.3, c100: 23, defaultG: 120, category: "carb", pieceG: 120, minG: 30 },
  { aliases: ["mango", "манго"], name: "Манго", kcal100: 60, p100: 0.8, f100: 0.4, c100: 15, defaultG: 150, category: "carb", pieceG: 200 },
  { aliases: ["яблок", "apple", "груш"], name: "Яблоко", kcal100: 52, p100: 0.3, f100: 0.2, c100: 14, defaultG: 180, category: "carb", pieceG: 180 },
  { aliases: ["финик", "dates"], name: "Финики", kcal100: 280, p100: 2.5, f100: 0.4, c100: 75, defaultG: 40, category: "carb", pieceG: 8, minG: 5 },
  { aliases: ["изюм", "курага", "чернослив", "сухофрукт"], name: "Изюм", kcal100: 300, p100: 3, f100: 0.5, c100: 79, defaultG: 40, category: "carb", tbspG: 15, minG: 5 },
  { aliases: ["ягод", "черник", "клубник", "малин", "смородин", "berries"], name: "Ягоды", kcal100: 50, p100: 0.8, f100: 0.4, c100: 11, defaultG: 100, category: "carb", tbspG: 20, minG: 20 },
  // ── Домашние составные блюда ───────────────────────────────────────────────
  { aliases: ["плов", "pilaf", "плов с курицей"], name: "Плов", kcal100: 190, p100: 9, f100: 7, c100: 22, defaultG: 250, category: "other", fatIncluded: true },
  { aliases: ["пельмен", "dumplings", "мант", "хинкали"], name: "Пельмени", kcal100: 250, p100: 12, f100: 8, c100: 34, defaultG: 250, category: "other", pieceG: 12, minG: 40 },
  { aliases: ["вареник"], name: "Вареники", kcal100: 215, p100: 6, f100: 6, c100: 35, defaultG: 250, category: "other", pieceG: 20, minG: 40 },
  { aliases: ["блин", "блины", "блинчик", "pancake", "crepe"], name: "Блины", kcal100: 190, p100: 6, f100: 6, c100: 28, defaultG: 150, category: "other", fatIncluded: true, pieceG: 50, minG: 25 },
  { aliases: ["оладь", "оладьи", "оладушки", "фриттер"], name: "Оладьи", kcal100: 230, p100: 6, f100: 9, c100: 31, defaultG: 150, category: "other", fatIncluded: true, pieceG: 35, minG: 20 },
  { aliases: ["голубцы", "голубец", "перец фаршированный"], name: "Голубцы", kcal100: 130, p100: 7, f100: 7, c100: 9, defaultG: 250, category: "other", fatIncluded: true, pieceG: 120, minG: 50 },
  { aliases: ["борщ", "borscht", "щи"], name: "Борщ", kcal100: 75, p100: 3, f100: 4.5, c100: 6, defaultG: 350, category: "other" },
  { aliases: ["soup", "суп", "бульон", "уха", "суп с вермишелью"], name: "Суп", kcal100: 60, p100: 4, f100: 2, c100: 7, defaultG: 350, category: "other" },
  { aliases: ["шаурма", "шаверма", "шаварма", "донер"], name: "Шаурма", kcal100: 220, p100: 12, f100: 12, c100: 16, defaultG: 300, category: "other", fatIncluded: true },
  // ── Овощи: сырые, тушёные и с маслом ──────────────────────────────────────
  { aliases: ["салат с маслом", "салат с оливковым маслом", "салат заправленный"], name: "Салат с маслом", kcal100: 90, p100: 1.5, f100: 7, c100: 5, defaultG: 150, category: "veg", fatIncluded: true },
  { aliases: ["salad", "салат", "greens", "зелень", "leafy"], name: "Салат", kcal100: 35, p100: 1.5, f100: 0.5, c100: 5, defaultG: 120, category: "veg" },
  { aliases: ["овощи тушёные", "овощи тушеные", "овощи жареные", "рагу овощное", "овощи на масле"], name: "Овощи тушёные", kcal100: 90, p100: 2, f100: 6, c100: 7, defaultG: 180, category: "veg", fatIncluded: true },
  { aliases: ["vegetable", "vegetables", "veggies", "овощ", "овощи", "овощи на пару"], name: "Овощи", kcal100: 40, p100: 2, f100: 0.3, c100: 7, defaultG: 150, category: "veg" },
  { aliases: ["broccoli", "брокколи"], name: "Брокколи", kcal100: 34, p100: 2.8, f100: 0.4, c100: 7, defaultG: 120, category: "veg" },
  { aliases: ["cucumber", "огурц", "огурец", "огурцы"], name: "Огурец", kcal100: 15, p100: 0.7, f100: 0.1, c100: 3.6, defaultG: 100, category: "veg", pieceG: 100 },
  { aliases: ["tomato", "помидор", "помидоры"], name: "Помидоры", kcal100: 18, p100: 0.9, f100: 0.2, c100: 3.9, defaultG: 100, category: "veg", pieceG: 110 },
  // ── Жиры и соусы ──────────────────────────────────────────────────────────
  { aliases: ["масло сливочное", "сливочное масло", "butter"], name: "Масло сливочное", kcal100: 750, p100: 0.8, f100: 82, c100: 0.8, defaultG: 10, category: "fat", cookingFat: true, tbspG: 20, tspG: 7, minG: 3 },
  { aliases: ["oil", "масло", "olive", "масло растительное", "оливковое масло", "масло подсолнечное"], name: "Масло растительное", kcal100: 884, p100: 0, f100: 100, c100: 0, defaultG: 10, category: "fat", cookingFat: true, tbspG: 14, tspG: 5, densityGml: 0.92, minG: 3 },
  { aliases: ["сало", "смалец", "lard"], name: "Сало", kcal100: 800, p100: 2, f100: 89, c100: 0, defaultG: 30, category: "fat", cookingFat: true },
  { aliases: ["майонез", "mayo", "соус майонезный"], name: "Майонез", kcal100: 630, p100: 1, f100: 67, c100: 2.6, defaultG: 20, category: "fat" },
  { aliases: ["cheese", "сыр"], name: "Сыр", kcal100: 350, p100: 25, f100: 28, c100: 1, defaultG: 40, category: "fat" },
  { aliases: ["avocado", "авокадо"], name: "Авокадо", kcal100: 160, p100: 2, f100: 15, c100: 9, defaultG: 80, category: "fat" },
  { aliases: ["арахисовая паста", "арахисовой пасты", "паста арахисовая", "арахисовое масло", "ореховая паста", "миндальная паста", "peanut butter"], name: "Арахисовая паста", kcal100: 600, p100: 25, f100: 50, c100: 20, defaultG: 30, category: "fat", tbspG: 16, tspG: 6, minG: 3 },
  { aliases: ["nuts", "орех", "орехи", "almond", "миндаль", "кешью", "грецкий"], name: "Орехи", kcal100: 580, p100: 21, f100: 50, c100: 20, defaultG: 30, category: "fat", tbspG: 15, minG: 5 },
  { aliases: ["семена чиа", "чиа", "льняное семя", "семена льна", "chia"], name: "Семена чиа", kcal100: 490, p100: 17, f100: 31, c100: 42, defaultG: 15, category: "fat", tbspG: 12, tspG: 4, minG: 3 },
  { aliases: ["какао", "какао порошок", "cocoa"], name: "Какао порошок", kcal100: 230, p100: 20, f100: 14, c100: 58, defaultG: 10, category: "other", tbspG: 6, tspG: 2, minG: 2 },
  { aliases: ["coconut", "кокос", "coconut milk"], name: "Кокос", kcal100: 230, p100: 2.3, f100: 24, c100: 6, defaultG: 80, category: "fat" },
  // ── Сладкое ───────────────────────────────────────────────────────────────
  // «Сахарный песок» указан явно: иначе в слове «песок» находился «сок» и в приём
  // приезжал стакан сока.
  { aliases: ["сахарный песок", "песок сахарный", "сахар", "sugar"], name: "Сахар", kcal100: 400, p100: 0, f100: 0, c100: 100, defaultG: 10, category: "other", tbspG: 15, tspG: 5, minG: 2 },
  { aliases: ["мёд", "мед", "honey"], name: "Мёд", kcal100: 320, p100: 0.3, f100: 0, c100: 80, defaultG: 20, category: "other", tbspG: 21, tspG: 7, minG: 3 },
  { aliases: ["варенье", "джем", "jam", "сгущёнка", "сгущенка"], name: "Варенье", kcal100: 250, p100: 0.3, f100: 0, c100: 62, defaultG: 30, category: "other", tbspG: 20, tspG: 7, minG: 3 },
  { aliases: ["шоколад", "chocolate", "конфет"], name: "Шоколад", kcal100: 550, p100: 6, f100: 32, c100: 58, defaultG: 30, category: "other" },
  { aliases: ["печенье", "cookie", "вафли", "пряник"], name: "Печенье", kcal100: 450, p100: 6, f100: 17, c100: 68, defaultG: 50, category: "other" },
  { aliases: ["мороженое", "ice cream"], name: "Мороженое", kcal100: 210, p100: 3.5, f100: 11, c100: 25, defaultG: 100, category: "other" },
  { aliases: ["торт", "пирожное", "cake", "чизкейк"], name: "Торт", kcal100: 380, p100: 5, f100: 20, c100: 45, defaultG: 100, category: "other" },
  // ── Напитки и магазинное ──────────────────────────────────────────────────
  // Напиток — тоже приём: бутылка сока в жару даёт больше углеводов, чем гарнир.
  // Раньше справочник знал из питья только молоко, кефир и воду, поэтому фото
  // любой бутылки заканчивалось ответом «не разобрал, что на фото».
  { aliases: ["витаминный напиток", "c vitt", "cvitt", "витамин с напиток", "vitamin drink"], name: "Витаминный напиток", kcal100: 32, p100: 0, f100: 0, c100: 8, defaultG: 140, category: "other", densityGml: 1.03, pieceG: 140, minG: 50 },
  { aliases: ["сок", "сока", "соку", "соком", "juice", "нектар"], name: "Сок", kcal100: 45, p100: 0.5, f100: 0.1, c100: 11, defaultG: 250, category: "other", densityGml: 1.04, pieceG: 200, minG: 50 },
  { aliases: ["кола без сахара", "кола зеро", "cola zero", "coca cola zero", "pepsi max", "напиток без сахара"], name: "Кола без сахара", kcal100: 0.4, p100: 0, f100: 0, c100: 0, defaultG: 330, category: "other", densityGml: 1, pieceG: 330, minG: 50 },
  { aliases: ["кола", "колы", "колу", "колой", "coca cola", "кокакола", "пепси", "pepsi", "sprite", "спрайт", "фанта"], name: "Кола", kcal100: 42, p100: 0, f100: 0, c100: 10.6, defaultG: 330, category: "other", densityGml: 1.04, pieceG: 330, minG: 50 },
  { aliases: ["энергетик", "red bull", "monster", "энергетический напиток"], name: "Энергетик", kcal100: 45, p100: 0, f100: 0, c100: 11, defaultG: 250, category: "other", densityGml: 1.04, pieceG: 250, minG: 50 },
  { aliases: ["изотоник", "спортивный напиток", "gatorade", "powerade"], name: "Изотоник", kcal100: 25, p100: 0, f100: 0, c100: 6, defaultG: 500, category: "other", densityGml: 1.02, pieceG: 500, minG: 50 },
  { aliases: ["лимонад", "морс", "компот", "квас"], name: "Лимонад", kcal100: 40, p100: 0, f100: 0, c100: 10, defaultG: 330, category: "other", densityGml: 1.04, pieceG: 330, minG: 50 },
  { aliases: ["смузи", "smoothie"], name: "Смузи", kcal100: 60, p100: 1, f100: 0.5, c100: 13, defaultG: 250, category: "other", densityGml: 1.05, pieceG: 250, minG: 50 },
  { aliases: ["молочный коктейль", "милкшейк", "milkshake"], name: "Молочный коктейль", kcal100: 90, p100: 3, f100: 3, c100: 13, defaultG: 300, category: "other", densityGml: 1.05, pieceG: 300, minG: 50 },
  { aliases: ["кофе с молоком", "латте", "latte", "флэт уайт", "flat white"], name: "Латте", kcal100: 45, p100: 2.5, f100: 2, c100: 4, defaultG: 300, category: "other", densityGml: 1.02, pieceG: 300, minG: 50 },
  { aliases: ["капучино", "cappuccino"], name: "Капучино", kcal100: 40, p100: 2.4, f100: 2, c100: 3, defaultG: 200, category: "other", densityGml: 1.02, pieceG: 200, minG: 50 },
  { aliases: ["кофе", "американо", "эспрессо", "coffee", "espresso"], name: "Кофе чёрный", kcal100: 2, p100: 0.1, f100: 0, c100: 0.3, defaultG: 200, category: "other", densityGml: 1, pieceG: 200, minG: 50 },
  { aliases: ["чай без сахара", "зеленый чай", "черный чай", "чай зеленый", "чай черный", "green tea"], name: "Чай без сахара", kcal100: 1, p100: 0, f100: 0, c100: 0.2, defaultG: 250, category: "other", densityGml: 1, pieceG: 250, minG: 50 },
  { aliases: ["пиво", "пива", "пивом", "beer", "лагер"], name: "Пиво", kcal100: 43, p100: 0.5, f100: 0, c100: 3.6, defaultG: 500, category: "other", densityGml: 1.01, pieceG: 500, minG: 50 },
  { aliases: ["вино", "вина", "вином", "wine", "шампанское"], name: "Вино", kcal100: 85, p100: 0.1, f100: 0, c100: 2.6, defaultG: 150, category: "other", densityGml: 0.99, pieceG: 150, minG: 50 },
  { aliases: ["кокосовая вода", "coconut water"], name: "Кокосовая вода", kcal100: 20, p100: 0.7, f100: 0.2, c100: 3.7, defaultG: 330, category: "other", densityGml: 1.01, pieceG: 330, minG: 50 },
  { aliases: ["йогурт питьевой", "питьевой йогурт", "актимель", "снежок"], name: "Йогурт питьевой", kcal100: 70, p100: 2.8, f100: 1.5, c100: 11, defaultG: 290, category: "other", densityGml: 1.04, pieceG: 290, minG: 50 },
  { aliases: ["протеиновый батончик", "протеин батончик", "protein bar"], name: "Протеиновый батончик", kcal100: 380, p100: 30, f100: 12, c100: 40, defaultG: 60, category: "protein", pieceG: 60, minG: 15 },
  { aliases: ["батончик", "сникерс", "snickers", "марс", "twix", "шоколадный батончик"], name: "Шоколадный батончик", kcal100: 490, p100: 5, f100: 24, c100: 62, defaultG: 50, category: "other", pieceG: 50, minG: 15 },
  { aliases: ["чипсы", "chips", "сухарики", "снек"], name: "Чипсы", kcal100: 530, p100: 6, f100: 30, c100: 53, defaultG: 90, category: "other", pieceG: 90, minG: 15 },
  { aliases: ["виноград", "grapes"], name: "Виноград", kcal100: 69, p100: 0.7, f100: 0.2, c100: 17, defaultG: 150, category: "carb", minG: 30 },
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

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e",
  ю: "yu", я: "ya",
};

/**
 * Имя файла картинки блюда.
 *
 * Считается из названия, а не хранится рядом с ним: сто с лишним позиций с
 * ручными слагами разъехались бы с папкой при первой же правке названия.
 */
export function foodSlug(name: string): string {
  return norm(name)
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
 * Алиас → регулярное выражение, терпимое к падежам.
 *
 * Человек пишет «2 ложки сметаны», «2 котлеты», «10 г масла сливочного». Поиск
 * подстрокой такие формы не находил вовсе — приём молча терял продукты и
 * выходил легче, чем был. Поэтому у слова длиннее четырёх букв отрезаем
 * окончание и разрешаем любое другое.
 */
const aliasCache = new Map<string, RegExp>();

function stemWord(word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (word.length >= 5 && /[аяоеыиуюйь]$/.test(word)) {
    return escaped.slice(0, -1) + String.raw`\p{L}{0,3}`;
  }
  return escaped;
}

function aliasRe(alias: string): RegExp {
  const cached = aliasCache.get(alias);
  if (cached) return cached;
  const re = new RegExp(norm(alias).split(" ").map(stemWord).join(String.raw`\s+`), "u");
  aliasCache.set(alias, re);
  return re;
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
      else if (aliasRe(raw).test(t)) score = 1000 + alias.length; // «котлета куриная жареная» ⊃ «котлета куриная»
      else if (alias.includes(t) && t.length >= 4) score = 100 + t.length; // «котлет» → «котлета»
      if (score > bestScore) {
        best = food;
        bestScore = score;
      }
    }
  }
  return best;
}

/** Средние бытовые меры, когда у продукта нет своей. */
const TBSP_G = 15;
const TSP_G = 5;
const SCOOP_G = 30;

type Unit = "g" | "kg" | "ml" | "l" | "glass" | "tbsp" | "tsp" | "scoop" | "piece";

/**
 * Границы слова для кириллицы.
 *
 * `\b` в JavaScript считает буквой только латиницу, поэтому «100 г» через
 * `\bг\b` не находилось никогда: и пробел, и «г» для движка одинаково
 * не-буквы. Отсюда прежний разбор жил на «просто числе» и ломался на любой
 * записи с единицами.
 */
const NB = String.raw`(?<![\p{L}\p{N}])`;
const NA = String.raw`(?![\p{L}\p{N}])`;

/** Количество словами: «пол ложки», «три банана», «полторы порции». */
const WORD_QTY: Record<string, number> = {
  пол: 0.5,
  половина: 0.5,
  половину: 0.5,
  половины: 0.5,
  полтора: 1.5,
  полторы: 1.5,
  один: 1,
  одна: 1,
  одно: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
};

const QTY_RE = new RegExp(
  String.raw`(\d+(?:[.,]\d+)?)\s*\/\s*(\d+)|(\d+(?:[.,]\d+)?)|${NB}(${Object.keys(WORD_QTY).join("|")})${NA}`,
  "gu"
);

const UNIT_RE: [Unit, RegExp][] = [
  ["scoop", new RegExp(String.raw`скуп|scoop|мерн\p{L}*\s*лож`, "u")],
  ["tsp", new RegExp(String.raw`чайн\p{L}*\s*лож|${NB}ч\.?\s*л\.?${NA}`, "u")],
  ["tbsp", new RegExp(String.raw`лож|${NB}ст\.?\s*л\.?${NA}|стол\p{L}*|сталов\p{L}*`, "u")],
  ["glass", new RegExp(String.raw`стакан\p{L}*|чашк\p{L}*|кружк\p{L}*`, "u")],
  ["ml", new RegExp(String.raw`${NB}(?:мл|ml)${NA}`, "u")],
  ["kg", new RegExp(String.raw`${NB}(?:кг|kg)${NA}`, "u")],
  ["g", new RegExp(String.raw`${NB}(?:г|гр|g|грам\p{L}*|gram\p{L}*)${NA}`, "u")],
  ["l", new RegExp(String.raw`${NB}(?:л|литр\p{L}*|liter\p{L}*)${NA}`, "u")],
  // Тара — тоже штука: «бутылка пива», «банка энергетика», «бокал вина»
  ["piece", new RegExp(String.raw`${NB}(?:шт|штук\p{L}*|pcs)${NA}|бутылк\p{L}*|банк\p{L}*|бокал\p{L}*|порци\p{L}*`, "u")],
];

/**
 * Единица измерения сразу за числом.
 *
 * Порядок важен: «ч. л.» нужно отличить от «ст. л.» до общего «лож», а «ст.л» —
 * до литров, иначе одинокая «л» в сокращении превратит ложку мёда в литр.
 */
function unitOf(rest: string): Unit | null {
  const s = rest.slice(0, 26);
  for (const [unit, re] of UNIT_RE) if (re.test(s)) return unit;
  return null;
}

function byName(name: string): FoodItem | null {
  return FOODS.find((f) => f.name === name) ?? null;
}

/** Ложками меряют сухое: «восемь ложек овсянки» — это хлопья, а не готовая каша. */
function spoonFood(food: FoodItem): FoodItem {
  if (!food.spoonVariant) return food;
  return byName(food.spoonVariant) ?? food;
}

function sane(food: FoodItem, grams: number): number | null {
  if (!Number.isFinite(grams)) return null;
  const min = food.minG ?? 20;
  if (grams < min || grams > 2000) return null;
  return grams;
}

type Amount = { food: FoodItem; grams: number; household: boolean };

/** Число + единица → граммы конкретного продукта. */
function toGrams(food: FoodItem, n: number, unit: Unit | null): Amount | null {
  switch (unit) {
    case "g":
      return { food, grams: n, household: false };
    case "kg":
      return { food, grams: n * 1000, household: false };
    case "ml":
      return { food, grams: n * (food.densityGml ?? 1), household: false };
    case "l":
      return { food, grams: n * 1000 * (food.densityGml ?? 1), household: false };
    case "glass":
      return { food, grams: n * 250 * (food.densityGml ?? 1), household: true };
    case "tbsp": {
      const f = spoonFood(food);
      return { food: f, grams: n * (f.tbspG ?? TBSP_G), household: true };
    }
    case "tsp": {
      const f = spoonFood(food);
      return { food: f, grams: n * (f.tspG ?? TSP_G), household: true };
    }
    case "scoop": {
      const f = spoonFood(food);
      return { food: f, grams: n * (f.scoopG ?? f.tbspG ?? SCOOP_G), household: true };
    }
    case "piece":
      return { food, grams: n * (food.pieceG ?? food.defaultG), household: true };
    default:
      // Без единицы: «3 банана» — штуки, «150 риса» — граммы. Малое число у
      // продукта без веса штуки — не количество («1 борщ»), берём порцию.
      if (food.pieceG && n <= 20) return { food, grams: n * food.pieceG, household: true };
      if (n >= 20) return { food, grams: n, household: false };
      return null;
  }
}

/**
 * Количество в куске текста рядом с названием продукта.
 *
 * Слева берём последнее число (оно ближе к названию: «...молока 3 банана»),
 * справа — первое («рис 100 г»).
 */
function amountIn(window: string, food: FoodItem, fromLeft: boolean): Amount | null {
  const matches = [...window.matchAll(QTY_RE)];
  if (matches.length) {
    const m = fromLeft ? matches[matches.length - 1] : matches[0];
    let n: number;
    if (m[1] && m[2]) n = Number(m[1].replace(",", ".")) / Number(m[2]); // «1/2 ложки»
    else if (m[3]) n = Number(m[3].replace(",", "."));
    else n = WORD_QTY[m[4]] ?? 0;
    if (n) {
      const rest = window.slice((m.index ?? 0) + m[0].length);
      const amount = toGrams(food, n, unitOf(rest));
      const grams = amount ? sane(amount.food, amount.grams) : null;
      if (amount && grams !== null) return { ...amount, grams };
    }
  }

  // Мера без числа — это одна мера: «стакан кефира», «ложка мёда», «скуп протеина».
  const near = window.trim();
  const unit = unitOf(fromLeft ? near.slice(-26) : near.slice(0, 26));
  if (unit && unit !== "g" && unit !== "kg" && unit !== "ml" && unit !== "l") {
    const amount = toGrams(food, 1, unit);
    const grams = amount ? sane(amount.food, amount.grams) : null;
    if (amount && grams !== null) return { ...amount, grams };
  }
  return null;
}

/**
 * Кусок текста, в котором количество относится именно к этому продукту.
 *
 * Слева отрезаем всё до последнего разделителя, справа — всё после первого:
 * иначе в записи «банан, 2 ст.л. пасты» банан забирал ложки пасты, а в «курица
 * 200 г, рис 150 г» рис забирал вес курицы.
 */
const SEP_RE = new RegExp(String.raw`[,;+\n·•]|${NB}и${NA}|${NB}с${NA}|${NB}со${NA}|${NB}на${NA}`, "gu");

function cutLeft(window: string): string {
  let cut = 0;
  for (const m of window.matchAll(SEP_RE)) cut = (m.index ?? 0) + m[0].length;
  return window.slice(cut);
}

function cutRight(window: string): string {
  const m = SEP_RE.exec(window);
  SEP_RE.lastIndex = 0;
  return m ? window.slice(0, m.index) : window;
}

function measure(food: FoodItem, left: string, right: string): Amount {
  return (
    amountIn(cutLeft(left), food, true) ??
    amountIn(cutRight(right), food, false) ?? { food, grams: food.defaultG, household: false }
  );
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
  // Состав уходит наружу вместе с итогом: по нему человек проверяет расчёт до
  // записи. Без него ошибку видно только по одной цифре, которую сверить не с чем.
  const detail: MealPart[] = [];

  for (const { food, grams } of unique) {
    const mul = grams / 100;
    kcal += food.kcal100 * mul;
    proteinG += food.p100 * mul;
    fatG += food.f100 * mul;
    carbsG += food.c100 * mul;
    parts.push(`${food.name.toLowerCase()} ~${Math.round(grams)} г`);
    detail.push({
      name: food.name,
      grams: Math.round(grams),
      kcal: Math.round(food.kcal100 * mul),
      source: food.fromLabel ? "label" : "catalog",
    });
  }

  // Заглавная только первая буква: прежний вариант поднимал каждое слово и
  // выдавал «Курица ~90 Г, Паста ~70 Г» с заглавной единицей измерения
  // Коктейль из семи составляющих не должен превращаться в четыре: остальное
  // прячем в счётчик, иначе человек не поймёт, всё ли попало в расчёт.
  const shown = parts.slice(0, 4);
  const hidden = parts.length - shown.length;
  const title = hidden > 0 ? `${shown.join(", ")} и ещё ${hidden}` : shown.join(", ");

  // Картинка приёма — по самой тяжёлой позиции: в тарелке «курица + рис + салат»
  // человек узнаёт запись по мясу, а не по первому слову в строке.
  const main = unique.reduce((a, b) => (b.food.kcal100 * b.grams > a.food.kcal100 * a.grams ? b : a));

  return {
    name: title.charAt(0).toUpperCase() + title.slice(1),
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
    note,
    slug: foodSlug(main.food.name),
    parts: detail,
  };
}

/** Позиция от модели: имя, вес и — если продукта нет в справочнике — цифры с этикетки. */
export interface IdentifiedFood {
  name: string;
  grams: number;
  kcal100?: number;
  p100?: number;
  f100?: number;
  c100?: number;
}

/**
 * Продукт, которого нет в справочнике, — по цифрам с этикетки.
 *
 * Иначе выходил тупик: магазинный напиток или батончик модель узнаёт по упаковке,
 * но в справочнике его нет, совпадение не находится, и приложение отвечало
 * «не разобрал, что на фото» — при том, что разобрало.
 */
function labelFood(item: IdentifiedFood): FoodItem | null {
  const kcal100 = item.kcal100;
  if (kcal100 === undefined || kcal100 <= 0) return null;
  const name = item.name.trim().slice(0, 60);
  if (!name) return null;
  return {
    aliases: [],
    name: name.charAt(0).toUpperCase() + name.slice(1),
    kcal100,
    p100: item.p100 ?? 0,
    f100: item.f100 ?? 0,
    c100: item.c100 ?? 0,
    defaultG: 100,
    category: "other",
    minG: 5,
    fromLabel: true,
  };
}

export function macrosFromItems(items: IdentifiedFood[]): MealAnalysis | null {
  const matched: { food: FoodItem; grams: number }[] = [];
  for (const item of items) {
    const food = matchFood(item.name) ?? labelFood(item);
    if (!food) continue;
    matched.push({ food, grams: sane(food, item.grams) ?? food.defaultG });
  }
  if (!matched.length) return null;
  // Точность честнее прежних ±10–15%: на фото не видно, сколько масла впитало
  // блюдо, а это единственная цифра, которая может уехать вдвое
  const fried = matched.some((m) => m.food.fatIncluded);
  let note = fried
    ? "Справочник RASCHET. Жарка учтена, масло на глаз: ±20%."
    : "Справочник RASCHET. Точность ±15%.";
  if (matched.some((m) => m.food.fromLabel)) {
    note = "Часть цифр — с упаковки, а не из справочника. Проверь этикетку.";
  }
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
      const m = aliasRe(raw).exec(text);
      if (!m) continue;
      const len = m[0].length;
      if (!best || len > best.len) {
        best = { food, start: m.index, end: m.index + len, len };
      }
    }
    if (best) hits.push(best);
  }

  // Точное совпадение вытесняет общее: «котлета куриная жареная» перекрывает и
  // «котлета», и «курин», иначе одна котлета посчиталась бы тремя продуктами.
  const kept = hits
    .filter((h) => !hits.some((o) => o !== h && o.len > h.len && o.start <= h.start && o.end >= h.end))
    .sort((a, b) => a.start - b.start);

  // Количество ищем в куске текста между соседними продуктами. Раньше границей
  // была запятая, и строка «100 молока 3 банана 8 ложек овсянки» без запятых
  // отдавала всем продуктам первое найденное число.
  let household = false;
  for (let i = 0; i < kept.length; i++) {
    const h = kept[i];
    const left = text.slice(i === 0 ? 0 : kept[i - 1].end, h.start);
    const right = text.slice(h.end, i + 1 < kept.length ? kept[i + 1].start : text.length);
    const amount = measure(h.food, left, right);
    if (amount.household) household = true;
    matched.push({ food: amount.food, grams: amount.grams });
  }

  if (!matched.length) return null;
  const fried = matched.some((m) => m.food.fatIncluded);
  let note = fried
    ? "Справочник RASCHET. Жарка учтена, масло на глаз: ±20%."
    : "Справочник RASCHET. Точность ±15%.";
  if (household) note = `${note} Ложки, скупы и штуки — по среднему весу.`;
  return buildMeal(matched, note);
}
