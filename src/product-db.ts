import https from "https";

/**
 * Открытая база продуктов: цифры по штрихкоду, а не по смыслу.
 *
 * Зачем понадобилась. Магазинный продукт распознаётся по этикетке, но этикетка
 * не всегда читается: надпись мелкая, на тайском, стёрта, повёрнута. Тогда
 * оставалось два выхода — считать по категории («похожий по смыслу») или просить
 * человека вбить КБЖУ руками. Первое врёт, второе работает не всегда: у бутылки
 * может не быть таблицы, а у человека — желания её набирать.
 *
 * Штрихкод снимает обе проблемы: это не догадка, а точный ключ. Один и тот же
 * код всегда даёт один и тот же продукт вместе с настоящими цифрами.
 *
 * **Поиск по названию здесь сознательно не используется.** Проверено на живом
 * API: запрос «sting energy» отдаёт три разных продукта с 28 и 42 ккал/100 и с
 * пустым полем; выбрать из них один — это ровно та подмена похожего, от которой
 * мы уходим, только с чужим авторитетом «база данных». Плюс поиск нестабилен:
 * на «c-vitt» приходит 503. По коду ответ однозначный.
 */

const HOST = "world.openfoodfacts.org";
const TIMEOUT_MS = 2500;
/** Правила Open Food Facts требуют узнаваемый User-Agent от клиента. */
const UA = "KINGMODE/1.0 (Telegram Mini App; raschet bot)";

export function productDbEnabled(): boolean {
  return process.env.PRODUCT_DB !== "0";
}

/** КБЖУ на 100 г вместе с именем продукта — то, чего не хватало для записи. */
export interface ProductFacts {
  name: string;
  kcal100: number;
  p100: number;
  f100: number;
  c100: number;
}

/**
 * Проверка контрольной цифры GTIN (EAN-8, UPC-12, EAN-13, GTIN-14).
 *
 * Модель читает цифры под полосами глазами, и одна перевранная цифра дала бы
 * чужой, но существующий продукт — ошибку хуже отказа. Контрольная цифра
 * отсекает такое чтение с вероятностью 9 из 10: сумма по весам 1 и 3 сойдётся
 * только у верной последовательности.
 */
export function validGtin(raw: string): string | null {
  const code = String(raw ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(code.length)) return null;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Веса идут справа налево: ближняя к контрольной цифра всегда умножается на 3.
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight;
  }
  return (10 - (sum % 10)) % 10 === check ? code : null;
}

function num(value: unknown, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Имя продукта: марка впереди, если её нет внутри названия.
 *
 * В базе поля заполняют люди, и одно и то же встречается по-разному: у Actimel
 * марка лежит в `brands`, а название — «Actimel»; у колы наоборот. Склейка без
 * проверки давала бы «Actimel Actimel».
 */
function productName(product: { product_name?: unknown; brands?: unknown }): string {
  const title = String(product.product_name ?? "").trim();
  const brand = String(product.brands ?? "").split(",")[0].trim();
  if (!title) return brand;
  // Название часто набирают строчными («coca-cola»), а марку — как на упаковке.
  // При совпадении берём написание марки: «Coca-Cola», а не «Coca-cola».
  if (brand && title.toLowerCase() === brand.toLowerCase()) return brand;
  const full = brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${title}` : title;
  return full.charAt(0).toUpperCase() + full.slice(1);
}

/** Ответ базы → цифры для записи. Отдельно от сети, чтобы проверялось на сборке. */
export function factsFromOffJson(raw: string): ProductFacts | null {
  let json: { status?: unknown; product?: Record<string, unknown> };
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Number(json.status) !== 1 || !json.product) return null;

  const n = (json.product.nutriments ?? {}) as Record<string, unknown>;
  // Ноль калорий — настоящая цифра: у диетической колы и минералки так и есть.
  // Отличаем ноль от незаполненного поля по наличию ключа, а не по значению.
  const kcal100 = n["energy-kcal_100g"] === undefined ? null : num(n["energy-kcal_100g"], 900);
  if (kcal100 === null) return null;
  const c100 = num(n.carbohydrates_100g, 100);
  // У пустой карточки заполнено только энергетическое поле. Без углеводов запись
  // выйдет с нулевыми макросами при ненулевых калориях — это хуже отказа.
  if (c100 === null) return null;

  const name = productName(json.product as { product_name?: unknown; brands?: unknown });
  if (!name) return null;

  return {
    name: name.slice(0, 60),
    kcal100,
    p100: num(n.proteins_100g, 100) ?? 0,
    f100: num(n.fat_100g, 100) ?? 0,
    c100,
  };
}

function httpsGetJson(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: HOST, path, method: "GET", timeout: TIMEOUT_MS, headers: { "User-Agent": UA } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) reject(new Error(`off ${res.statusCode}`));
          else resolve(Buffer.concat(chunks).toString("utf-8"));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Промах кэшируется вместе с попаданием: тайская полка в базе покрыта неровно, и
 * повторный кадр той же бутылки не должен снова ждать сеть впустую.
 */
const cache = new Map<string, ProductFacts | null>();
const CACHE_MAX = 300;

export async function factsByBarcode(code: string): Promise<ProductFacts | null> {
  const gtin = validGtin(code);
  if (!gtin || !productDbEnabled()) return null;
  if (cache.has(gtin)) return cache.get(gtin) ?? null;

  let facts: ProductFacts | null = null;
  try {
    const raw = await httpsGetJson(
      `/api/v2/product/${gtin}.json?fields=product_name,brands,nutriments`
    );
    facts = factsFromOffJson(raw);
  } catch (e) {
    // Недоступность базы — не ошибка приёма пищи: разбор продолжается без неё.
    console.error("product-db", gtin, e instanceof Error ? e.message : String(e));
    return null;
  }

  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(gtin, facts);
  console.log(`product-db ${gtin}: ${facts ? `${facts.name}, ${facts.kcal100} ккал/100` : "нет в базе"}`);
  return facts;
}
