import crypto from "crypto";
import https from "https";
import { macrosFromItems, macrosFromText } from "./foods";
import { analyzeMealFromTextLocal } from "./meal-fallback";

/**
 * Модель не считает КБЖУ — она называет блюдо и граммы, числа берёт справочник.
 * Поэтому от неё нужен не «сорт продукта», а **способ приготовления**: одна и та
 * же курица отварной и жареной котлетой различается по жиру в 4 раза. Раньше
 * запрос этого не требовал, модель отвечала «курица», справочник подставлял
 * отварную грудку — и жареная котлета получала 4 г жира вместо 14.
 */
export const IDENTIFY_PROMPT =
  "Ты нутрициолог, оцениваешь еду и напитки по фото или описанию: домашнее, ресторанное и магазинное.\n" +
  "Ответь ТОЛЬКО JSON без markdown:\n" +
  '{"items":[{"name":"продукт на русском","grams":число,"kcal100":число,"p100":число,"f100":число,"c100":число}],' +
  '"note":"способ приготовления и что не видно"}\n' +
  "Поля kcal100/p100/f100/c100 — на 100 г или 100 мл. Ставь их всегда, когда продукт магазинный, " +
  "с этикеткой, фирменный или нетиповой: по обычной домашней еде цифры есть у меня, по такому — нет.\n" +
  "\n" +
  "Правила:\n" +
  "1. В названии обязателен способ приготовления: «котлета куриная жареная», " +
  "«рыба на пару», «картофель отварной», «сырник жареный», «овощи тушёные».\n" +
  "2. Способ определи по виду: поджаристая корочка, блеск, тёмные пятна — жарка на масле; " +
  "ровный бледный цвет без корочки — варка или пар; сухая румяная поверхность — запекание.\n" +
  "3. Не пиши «курица», если это котлета, фарш, панировка, запеканка или суп: " +
  "домашнее блюдо называй блюдом, а не мясом внутри него.\n" +
  "4. Если блюдо жарилось, масло уже входит в него — отдельной строкой масло не добавляй. " +
  "Отдельно указывай только то, что добавлено после готовки: масло в кашу, соус, сметану, майонез.\n" +
  "5. Одно и то же не перечисляй дважды: либо готовое блюдо, либо его компоненты.\n" +
  "6. Если блюдо составное и нетиповое — разложи на компоненты с граммами " +
  "(мясо, крупа или хлеб, яйцо, масло).\n" +
  "7. grams — вес готового на тарелке, 20–800 г на компонент. " +
  "Бытовые меры из описания переводи в граммы: столовая ложка — 15 г (масло 14, мёд 21, " +
  "сухие хлопья 12), чайная — 5 г, мерная ложка (скуп) протеина — 30 г, креатина — 5 г, " +
  "банан — 120 г, яйцо — 55 г, стакан — 250 мл. Добавки без калорий (креатин) — grams как есть.\n" +
  "8. В note укажи способ приготовления и главное допущение — например " +
  "«жарка на растительном масле, количество масла не видно».\n" +
  "9. Напиток — это еда: сок, газировка, витаминный напиток, кофе с молоком, пиво, смузи. " +
  "Для жидкости grams = объём в мл (бутылка 0,5 л → 500).\n" +
  "10. Упаковка, бутылка, банка, батончик: прочитай этикетку и назови продукт как на ней " +
  "(«витаминный напиток C-vitt», «кола», «протеиновый батончик»). Если на этикетке видны " +
  "КБЖУ — верни именно их в kcal100/p100/f100/c100; если не видны — поставь по своему знанию " +
  "этого продукта. Объём и вес возьми с упаковки, а не на глаз.\n" +
  "11. Тара пустая или почти пустая — всё равно считай полную порцию упаковки, " +
  "а в note напиши «тара пустая, посчитан полный объём».\n" +
  "12. «не еда» — только если на кадре действительно нет еды и напитков (человек, техника, " +
  "пейзаж). Незнакомая упаковка — это еда: назови, что видишь, и поставь свои цифры.\n" +
  '\nЕсли не еда: {"items":[],"note":"не еда: что на кадре"}';

const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

const photoCache = new Map<string, MealAnalysis>();
const PHOTO_CACHE_MAX = 100;

function sanitizeApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw
    .replace(/^['"`\s]+|['"`\s]+$/g, "")
    .replace(/[\r\n\t\u200b\u200c\u200d\ufeff\u00a0]/g, "")
    .trim();
  if (/^bearer\s+/i.test(cleaned)) cleaned = cleaned.replace(/^bearer\s+/i, "").trim();
  if (cleaned.includes("=")) cleaned = cleaned.split("=").pop()!.trim();
  cleaned = cleaned.replace(/\s+/g, "").replace(/[^\x21-\x7E]/g, "");
  return cleaned || undefined;
}

function geminiKeys(): string[] {
  const keys: string[] = [];
  const main = sanitizeApiKey(process.env.GEMINI_API_KEY);
  if (main) keys.push(main);
  for (let i = 2; i <= 5; i++) {
    const k = sanitizeApiKey(process.env[`GEMINI_API_KEY_${i}`]);
    if (k && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

export function mealVisionEnabled(): boolean {
  return geminiKeys().length > 0;
}

export function mealVisionProvider(): string {
  const n = geminiKeys().length;
  return n ? `Gemini×${n} → справочник RASCHET` : "OFF (no GEMINI_API_KEY)";
}

/**
 * Одна позиция расчёта: из чего сложилась итоговая цифра.
 *
 * Нужна для объяснения. Пока приём был одной строкой «Курица ~90 г, Паста ~70 г
 * — 240 ккал», проверить его было нечем: непонятно, что модель приняла за
 * курицу, сколько весит каждая позиция и откуда взяты калории. Ошибку в такой
 * записи видно только по итогу, а итог человек как раз и не знает.
 */
export interface MealPart {
  name: string;
  grams: number;
  kcal: number;
  /** `catalog` — цифры из справочника, `label` — с упаковки, по словам модели. */
  source: "catalog" | "label";
}

export interface MealAnalysis {
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  note?: string;
  /** Картинка главного продукта приёма: имя файла в `webapp/img/food`. */
  slug?: string;
  /** Состав расчёта — для объяснения человеку перед записью. */
  parts?: MealPart[];
  /** Своими словами модели: способ приготовления и допущения. */
  said?: string;
}

export class MealPhotoUnreadableError extends Error {
  /** Почему не вышло: `not_food`, `no_match`, `no_foods`, `invalid_json`. */
  readonly reason: string;
  /**
   * Список продуктов, годный для подстановки в поле ввода текстом: человеку
   * остаётся поправить вес. Пусто, если подставлять нечего — иначе в поле
   * попадёт комментарий модели, и правка станет дольше, чем набор с нуля.
   */
  readonly seen: string;
  /** Свободное описание кадра — только для текста ошибки, не для ввода. */
  readonly saw: string;

  constructor(reason: string, seen = "", saw = "") {
    super(`photo_unreadable:${reason}`);
    this.name = "MealPhotoUnreadableError";
    this.reason = reason;
    this.seen = seen.slice(0, 120);
    this.saw = saw.slice(0, 120);
  }
}

/**
 * Состав расчёта строками: «котлета куриная жареная, 150 г, 320 ккал».
 *
 * Один форматтер на бота и приложение: две копии текста разошлись бы после
 * первой правки, а человек читает их как один ответ одной программы.
 */
export function mealPartLines(meal: MealAnalysis): string[] {
  if (!meal.parts || !meal.parts.length) return [];
  return meal.parts.map((p) => {
    const from = p.source === "label" ? " (цифры с упаковки)" : "";
    return `${p.name.toLowerCase()}, ${p.grams} г, ${p.kcal} ккал${from}`;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isQuotaError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("429") || m.includes("quota") || m.includes("resource_exhausted") || m.includes("rate limit");
}

function isModelMissing(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("404") || m.includes("not found") || m.includes("no longer available");
}

function extractApiError(raw: string): string {
  try {
    const j = JSON.parse(raw);
    return j.error?.message ?? j.message ?? raw.slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

function httpsJson(opts: https.RequestOptions, body: string): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...opts, timeout: 45_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, raw: Buffer.concat(chunks).toString("utf-8") }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function photoHash(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
}

function getCached(buf: Buffer): MealAnalysis | undefined {
  return photoCache.get(photoHash(buf));
}

function setCached(buf: Buffer, meal: MealAnalysis): void {
  if (photoCache.size >= PHOTO_CACHE_MAX) {
    const first = photoCache.keys().next().value;
    if (first) photoCache.delete(first);
  }
  photoCache.set(photoHash(buf), meal);
}

interface IdentifiedItem {
  name: string;
  grams: number;
  /** КБЖУ на 100 г/мл с этикетки — для продуктов, которых нет в справочнике. */
  kcal100?: number;
  p100?: number;
  f100?: number;
  c100?: number;
}

/** Цифра с этикетки: за пределами диапазона — значит модель ошиблась, не берём. */
function per100(value: unknown, max: number): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return Math.round(n * 10) / 10;
}

function parseIdentifyJson(raw: string): { items: IdentifiedItem[]; note?: string } {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const j = JSON.parse(slice) as { items?: IdentifiedItem[]; note?: string; name?: string; kcal?: number };
  if (Array.isArray(j.items)) {
    const items = j.items
      .map((x) => ({
        name: String(x.name ?? "").trim(),
        grams: Math.round(Number(x.grams) || 0),
        kcal100: per100(x.kcal100, 900),
        p100: per100(x.p100, 100),
        f100: per100(x.f100, 100),
        c100: per100(x.c100, 100),
      }))
      .filter((x) => x.name && x.grams > 0);
    return { items, note: j.note ? String(j.note).slice(0, 120) : undefined };
  }
  // Legacy: полный JSON с kcal от модели — используем как есть
  if (j.kcal !== undefined) {
    return {
      items: [],
      note: "legacy",
    };
  }
  return { items: [], note: j.note };
}

/** Ответ модели → запись в дневник. Экспортируется для проверок на сборке. */
export function mealFromIdentify(raw: string): MealAnalysis {
  let parsed: { items: IdentifiedItem[]; note?: string };
  try {
    parsed = parseIdentifyJson(raw);
  } catch {
    throw new MealPhotoUnreadableError("invalid_json");
  }

  // Legacy fallback: модель вернула старый формат с макросами
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  try {
    const legacy = JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned) as Partial<MealAnalysis>;
    if (legacy.kcal !== undefined && Number(legacy.kcal) > 0) {
      return {
        name: String(legacy.name ?? "Блюдо").slice(0, 80),
        kcal: Math.round(Number(legacy.kcal) || 0),
        proteinG: Math.round(Number(legacy.proteinG) || 0),
        fatG: Math.round(Number(legacy.fatG) || 0),
        carbsG: Math.round(Number(legacy.carbsG) || 0),
        note: legacy.note ? String(legacy.note).slice(0, 120) : "Оценка AI. Точность ±15–20%.",
      };
    }
  } catch { /* use items path */ }

  if (!parsed.items.length) {
    // Заметка модели — это комментарий, а не состав: в поле ввода она не идёт.
    // «не еда» отделяем от «еда есть, но не разобрал»: это разные советы человеку.
    const note = (parsed.note ?? "").trim();
    const notFood = /^не\s*еда/i.test(note);
    const saw = notFood ? note.replace(/^не\s*еда\s*:?\s*/i, "") : note;
    throw new MealPhotoUnreadableError(notFood ? "not_food" : "no_foods", "", saw);
  }

  // Что модель увидела — на случай отказа: человеку нужен путь дальше, а не тупик.
  const seen = parsed.items.map((i) => `${i.name} ${i.grams} г`).join(", ");
  const fromDb = macrosFromItems(parsed.items);
  if (!fromDb || fromDb.kcal === 0) throw new MealPhotoUnreadableError("no_match", seen);

  // Слова модели держим отдельно от нашей строки про точность: в объяснении это
  // разные вещи — «что решила модель» человек может оспорить, «±15%» нет.
  // Раньше они склеивались в одно поле и обрезались по 120 символов, из-за чего
  // способ приготовления часто отрезался на середине слова.
  if (parsed.note && parsed.note !== "legacy") {
    fromDb.said = parsed.note.slice(0, 160);
  }
  return fromDb;
}

async function geminiRequest(apiKey: string, parts: object[], model: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts }],
    // Запас на ответ: в позиции теперь до шести полей (КБЖУ с этикетки), и на
    // тарелке из пяти составляющих обрезанный JSON стоил бы всего разбора.
    generationConfig: { temperature: 0.15, maxOutputTokens: 900 },
  });
  const { status, raw } = await httpsJson(
    {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${model}:generateContent`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );
  if (status >= 400) throw new Error(`gemini ${status} [${model}]: ${extractApiError(raw)}`);
  const json = JSON.parse(raw);
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return String(text).trim();
  throw new Error(`gemini: no content [${model}]`);
}

/**
 * Проход по ключам и моделям — с разбором ответа **внутри** цикла.
 *
 * Раньше список моделей перебирался только по ошибкам сети. Но первой кадр
 * достаётся самой дешёвой модели, и она на понятной бутылке иногда отвечает
 * HTTP 200 и «не еда»: разбор падал, а сильные модели не спрашивались вовсе —
 * снаружи это выглядело как «не разбирает вполне понятные фото». Отказ разбора
 * теперь такой же повод идти дальше по списку, как и 429 или таймаут.
 */
async function geminiMeal(parts: object[], what: string): Promise<MealAnalysis> {
  const keys = geminiKeys();
  if (!keys.length) throw new Error("GEMINI_API_KEY not set");

  let lastErr = "unknown";
  let refusal: MealPhotoUnreadableError | undefined;

  for (const key of keys) {
    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let raw: string;
        try {
          raw = await geminiRequest(key, parts, model);
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          console.error("gemini", model, `${what} attempt=${attempt}`, lastErr.slice(0, 100));
          // Квота отпускает через пару секунд, остальное — сразу к другой модели.
          if (isQuotaError(lastErr) && !isModelMissing(lastErr) && attempt === 0) {
            await sleep(2500);
            continue;
          }
          break;
        }
        try {
          return mealFromIdentify(raw);
        } catch (e) {
          if (!(e instanceof MealPhotoUnreadableError)) throw e;
          // Отказ, где модель назвала продукты, полезнее «не еда»: если сильные
          // тоже не справятся, человеку покажем именно его — с составом.
          if (!refusal || (!refusal.seen && e.seen)) refusal = e;
          console.error("gemini", model, `${what} отказ=${e.reason}`, (e.seen || e.saw).slice(0, 80));
          break; // тот же запрос той же модели даст тот же отказ
        }
      }
    }
  }

  if (refusal) throw refusal;
  throw new Error(`service_unavailable: ${lastErr}`);
}

/** Текст: справочник → Gemini (компоненты) → справочник. */
export async function analyzeMealText(description: string): Promise<MealAnalysis> {
  const local = macrosFromText(description) ?? analyzeMealFromTextLocal(description);
  // Ноль калорий — не повод идти в модель: «пол ложки креатина» именно ноль, и
  // модель на таком запросе начинает выдумывать калории добавке.
  if (local) return local;

  if (!geminiKeys().length) {
    throw new Error("Укажи продукты: лосось 150 г, рис 200 г, салат");
  }

  return geminiMeal([{ text: `${IDENTIFY_PROMPT}\n\nОписание: ${description}` }], "текст");
}

/** Фото: кэш → Gemini (компоненты) → справочник КБЖУ. */
export async function analyzeMealPhoto(imageBuffer: Buffer, mime = "image/jpeg"): Promise<MealAnalysis> {
  const cached = getCached(imageBuffer);
  if (cached) {
    console.log("meal photo: cache hit");
    return { ...cached, note: (cached.note ?? "") + " (кэш)" };
  }

  if (!geminiKeys().length) throw new Error("service_unavailable: GEMINI_API_KEY not set");

  const b64 = imageBuffer.toString("base64");
  try {
    const meal = await geminiMeal([
      { text: IDENTIFY_PROMPT },
      { inline_data: { mime_type: mime, data: b64 } },
    ], "фото");
    setCached(imageBuffer, meal);
    return meal;
  } catch (e) {
    if (e instanceof MealPhotoUnreadableError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (isQuotaError(msg)) throw new Error(`service_unavailable: ${msg}`);
    throw new Error(`service_unavailable: ${msg}`);
  }
}

export function groqMealFallbackEnabled(): boolean {
  return false;
}
