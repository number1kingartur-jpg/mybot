import fs from "fs";
import path from "path";

/**
 * Какие файлы реально лежат в `webapp/img/food`.
 *
 * Слаг считается из названия. Вариант («куриная грудка», «молоко 1.5%»)
 * получает другой файл, картинки нет, в интерфейсе остаётся буква.
 * Этот список — единственный источник правды: нет файла, нет слага.
 */
export function foodImageDir(): string {
  return path.join(process.cwd(), "webapp", "img", "food");
}

let listed: Set<string> | null = null;

export function listedFoodImages(): Set<string> {
  if (listed) return listed;
  const dir = foodImageDir();
  listed = fs.existsSync(dir)
    ? new Set(fs.readdirSync(dir).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)))
    : new Set();
  return listed;
}

export function hasFoodImage(slug: string | undefined): slug is string {
  return !!slug && listedFoodImages().has(slug);
}

export function existingFoodSlug(...candidates: (string | undefined)[]): string | undefined {
  for (const slug of candidates) {
    if (hasFoodImage(slug)) return slug;
  }
  return undefined;
}

/**
 * Близкий кадр, когда своего файла нет. Только узнаваемые пары:
 * грудка это курица, 1.5% это молоко. Апельсин как яблоко не подставляем.
 */
export const IMAGE_FALLBACK: Record<string, string> = {
  "Куриная грудка": "kurica-zapechennaya",
  "Тунец консервированный": "tunec",
  "Творог обезжиренный": "tvorog",
  "Греческий йогурт": "yogurt",
  "Молоко 1.5%": "moloko-rossiyskoe",
  "Рис коричневый": "ris-otvarnoy",
  "Рис жареный": "ris-otvarnoy",
  "Рис с маслом": "ris-otvarnoy",
  "Хлеб цельнозерновой": "hleb",
  "Хлебцы": "hleb",
  "Овсянка на воде": "ovsyanka-na-moloke",
  "Овсяные хлопья сухие": "ovsyanka-na-moloke",
  "Каша на молоке": "ovsyanka-na-moloke",
  "Гранола": "ovsyanka-na-moloke",
  "Рыба": "ryba-na-paru",
  "Свинина": "svinina-zharenaya",
  "Белок яичный жидкий": "yayca",
  "Гейнер": "protein",
  "Шоколад тёмный": "shokolad",
  "Салат с маслом": "salat",
  "Макароны с маслом": "pasta-otvarnaya",
  "Гречка с маслом": "grechka-otvarnaya",
  "Батат": "kartofel-otvarnoy",
  "Брокколи": "ovoschi",
  "Шпинат": "ovoschi",
  "Капуста": "ovoschi",
  "Цветная капуста": "ovoschi",
  "Морковь": "ovoschi",
  "Перец болгарский": "ovoschi",
  "Кабачок": "ovoschi",
  "Огурец": "ovoschi",
  "Помидоры": "ovoschi",
  "Грибы": "ovoschi",
  "Свёкла": "ovoschi",
  "Чай без сахара": "voda",
  "Кокосовая вода": "voda",
  "Тофу": "ovoschi",
  "Ягоды": "vinograd",
  "Апельсин": "grusha",
  "Киви": "yabloko-zelenoe",
  "Ананас": "banan",
  "Папайя": "banan",
  "Арбуз": "vinograd",
  "Хумус": "fasol",
  "Семена чиа": "orehi",
  "Льняное семя": "orehi",
  "Отруби": "ovsyanka-na-moloke",
};
