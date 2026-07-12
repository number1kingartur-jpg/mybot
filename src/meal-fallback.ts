import type { MealAnalysis } from "./meal";

interface FoodItem {
  aliases: string[];
  name: string;
  kcal100: number;
  p100: number;
  f100: number;
  c100: number;
  defaultG: number;
  category: "protein" | "carb" | "veg" | "fat" | "other";
}

const FOODS: FoodItem[] = [
  { aliases: ["salmon", "лосось", "лосос", "fish", "рыба", "seafood", "треска", "cod", "tuna", "тунец", "sashimi", "steak"], name: "Лосось", kcal100: 208, p100: 20, f100: 13, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["chicken", "курица", "куриц", "turkey", "индейка", "beef", "говядин", "pork", "свинин", "meat"], name: "Курица", kcal100: 165, p100: 31, f100: 3.6, c100: 0, defaultG: 150, category: "protein" },
  { aliases: ["rice", "рис", "risotto", "fried rice", "white rice", "brown rice"], name: "Рис", kcal100: 130, p100: 2.7, f100: 0.3, c100: 28, defaultG: 180, category: "carb" },
  { aliases: ["pasta", "макарон", "spaghetti", "noodle", "лапша", "гречк", "buckwheat", "овсян", "oat"], name: "Гарнир", kcal100: 140, p100: 5, f100: 1.5, c100: 25, defaultG: 180, category: "carb" },
  { aliases: ["potato", "картоф", "fries", "фри"], name: "Картофель", kcal100: 110, p100: 2, f100: 4, c100: 17, defaultG: 180, category: "carb" },
  { aliases: ["salad", "салат", "vegetable", "vegetables", "veggies", "овощ", "carrot", "морков", "cucumber", "огурц", "tomato", "помидор", "greens", "зелень", "broccoli", "брокколи"], name: "Салат", kcal100: 35, p100: 1.5, f100: 0.5, c100: 5, defaultG: 100, category: "veg" },
  { aliases: ["egg", "яйц", "omelet", "омлет"], name: "Яйца", kcal100: 155, p100: 13, f100: 11, c100: 1, defaultG: 120, category: "protein" },
  { aliases: ["cheese", "сыр"], name: "Сыр", kcal100: 350, p100: 25, f100: 28, c100: 1, defaultG: 40, category: "fat" },
  { aliases: ["bread", "хлеб", "toast"], name: "Хлеб", kcal100: 265, p100: 9, f100: 3, c100: 49, defaultG: 60, category: "carb" },
  { aliases: ["avocado", "авокадо"], name: "Авокадо", kcal100: 160, p100: 2, f100: 15, c100: 9, defaultG: 80, category: "fat" },
  { aliases: ["yogurt", "йогурт", "творог", "cottage"], name: "Йогурт", kcal100: 95, p100: 10, f100: 3, c100: 8, defaultG: 150, category: "protein" },
  { aliases: ["pizza", "пицц"], name: "Пицца", kcal100: 266, p100: 11, f100: 10, c100: 33, defaultG: 200, category: "other" },
  { aliases: ["burger", "бургер"], name: "Бургер", kcal100: 250, p100: 14, f100: 12, c100: 22, defaultG: 220, category: "other" },
  { aliases: ["soup", "суп", "борщ", "borscht"], name: "Суп", kcal100: 60, p100: 4, f100: 2, c100: 7, defaultG: 300, category: "other" },
];

const HF_CAPTION_MODEL = "Salesforce/blip-image-captioning-base";
const HF_FOOD_MODEL = "nateraw/food";

function hfApiUrl(model: string): string {
  return `https://router.huggingface.co/hf-inference/models/${model}`;
}

function hfToken(): string | undefined {
  const raw = process.env.HF_TOKEN ?? process.env.HUGGINGFACE_API_KEY;
  if (!raw) return undefined;
  return raw.replace(/^['"`\s]+|['"`\s]+$/g, "").trim() || undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

function estimateFromCaption(caption: string): MealAnalysis | null {
  const text = caption.toLowerCase();
  const matched: { food: FoodItem; grams: number }[] = [];

  for (const food of FOODS) {
    if (food.aliases.some((a) => text.includes(a))) {
      matched.push({ food, grams: parseGrams(text, food) });
    }
  }

  if (!matched.length) return null;

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
    name: parts.slice(0, 3).join(", ").replace(/(^|\s)\S/g, (s) => s.toUpperCase()),
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
    note: "Оценка по распознаванию блюда (бесплатный fallback). Точность ±15–25%.",
  };
}

async function hfRequest(model: string, imageBuffer: Buffer, mime: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": mime };
  const token = hfToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(hfApiUrl(model), {
      method: "POST",
      headers,
      body: imageBuffer,
      signal: AbortSignal.timeout(45_000),
    });

    const raw = await res.text();
    if (res.status === 503 || res.status === 429) {
      await sleep(3000 + attempt * 2000);
      continue;
    }
    if (!res.ok) throw new Error(`hf ${model} ${res.status}: ${raw.slice(0, 160)}`);
    return raw;
  }
  throw new Error(`hf ${model}: model loading timeout`);
}

async function hfImageCaption(imageBuffer: Buffer, mime: string): Promise<string> {
  const raw = await hfRequest(HF_CAPTION_MODEL, imageBuffer, mime);
  try {
    const json = JSON.parse(raw) as Array<{ generated_text?: string }>;
    const caption = json[0]?.generated_text?.trim();
    if (caption) return caption;
  } catch {
    throw new Error(`hf caption parse: ${raw.slice(0, 160)}`);
  }
  throw new Error("hf caption: empty");
}

async function hfFoodLabels(imageBuffer: Buffer, mime: string): Promise<string[]> {
  const raw = await hfRequest(HF_FOOD_MODEL, imageBuffer, mime);
  try {
    const json = JSON.parse(raw) as Array<{ label?: string; score?: number }>;
    return json
      .filter((x) => (x.score ?? 0) >= 0.08)
      .map((x) => String(x.label ?? "").replace(/_/g, " "))
      .filter(Boolean)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function analyzeMealFromTextLocal(description: string): MealAnalysis | null {
  return estimateFromCaption(description);
}

/** Бесплатный fallback без Gemini/OpenRouter/Groq — caption + справочник КБЖУ. */
export async function analyzeMealPhotoFallback(imageBuffer: Buffer, mime = "image/jpeg"): Promise<MealAnalysis> {
  const hints: string[] = [];
  try {
    hints.push(await hfImageCaption(imageBuffer, mime));
  } catch (e) {
    console.error("hf caption failed:", (e instanceof Error ? e.message : String(e)).slice(0, 120));
  }

  try {
    const labels = await hfFoodLabels(imageBuffer, mime);
    if (labels.length) hints.push(labels.join(", "));
  } catch (e) {
    console.error("hf food failed:", (e instanceof Error ? e.message : String(e)).slice(0, 120));
  }

  for (const hint of hints) {
    const meal = estimateFromCaption(hint);
    if (meal && meal.kcal > 0) return meal;
  }

  throw new Error(`hf_fallback_no_foods: ${hints.join(" | ") || "no hints"}`);
}

export function mealFallbackEnabled(): boolean {
  return true;
}
