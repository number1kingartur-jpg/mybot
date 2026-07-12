import crypto from "crypto";
import https from "https";
import { macrosFromItems, macrosFromText } from "./foods";
import { analyzeMealFromTextLocal } from "./meal-fallback";

const IDENTIFY_PROMPT =
  "Ты нутрициолог. Определи компоненты еды и оцени граммы одной порции.\n" +
  "Ответь ТОЛЬКО JSON без markdown:\n" +
  '{"items":[{"name":"название на русском","grams":число}],"note":"краткая оценка точности"}\n' +
  "grams — реалистичная порция 30–500 г. Если не еда: {\"items\":[],\"note\":\"не еда\"}";

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

export interface MealAnalysis {
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  note?: string;
}

export class MealPhotoUnreadableError extends Error {
  constructor(reason: string) {
    super(`photo_unreadable:${reason}`);
    this.name = "MealPhotoUnreadableError";
  }
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
}

function parseIdentifyJson(raw: string): { items: IdentifiedItem[]; note?: string } {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const j = JSON.parse(slice) as { items?: IdentifiedItem[]; note?: string; name?: string; kcal?: number };
  if (Array.isArray(j.items)) {
    const items = j.items
      .map((x) => ({ name: String(x.name ?? "").trim(), grams: Math.round(Number(x.grams) || 0) }))
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

function mealFromIdentify(raw: string): MealAnalysis {
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

  if (!parsed.items.length) throw new MealPhotoUnreadableError("no_foods");

  const fromDb = macrosFromItems(parsed.items);
  if (!fromDb || fromDb.kcal === 0) throw new MealPhotoUnreadableError("no_match");

  if (parsed.note && parsed.note !== "legacy") {
    fromDb.note = `${fromDb.note} ${parsed.note}`.slice(0, 120);
  }
  return fromDb;
}

async function geminiRequest(apiKey: string, parts: object[], model: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.15, maxOutputTokens: 512 },
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

async function geminiVision(imageBase64: string, mime: string): Promise<string> {
  const keys = geminiKeys();
  if (!keys.length) throw new Error("GEMINI_API_KEY not set");

  let lastErr = "unknown";
  for (const key of keys) {
    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await geminiRequest(key, [
            { text: IDENTIFY_PROMPT },
            { inline_data: { mime_type: mime, data: imageBase64 } },
          ], model);
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          console.error("gemini", model, `attempt=${attempt}`, lastErr.slice(0, 100));
          if (isModelMissing(lastErr)) break;
          if (isQuotaError(lastErr) && attempt === 0) {
            await sleep(2500);
            continue;
          }
          if (!isQuotaError(lastErr) && !isModelMissing(lastErr)) break;
        }
      }
    }
  }
  throw new Error(`service_unavailable: ${lastErr}`);
}

async function geminiText(description: string): Promise<string> {
  const keys = geminiKeys();
  if (!keys.length) throw new Error("GEMINI_API_KEY not set");
  const prompt = `${IDENTIFY_PROMPT}\n\nОписание: ${description}`;
  let lastErr = "unknown";
  for (const key of keys) {
    try {
      return await geminiRequest(key, [{ text: prompt }], GEMINI_MODELS[0]);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

/** Текст: справочник → Gemini (компоненты) → справочник. */
export async function analyzeMealText(description: string): Promise<MealAnalysis> {
  const local = macrosFromText(description) ?? analyzeMealFromTextLocal(description);
  if (local && local.kcal > 0) return local;

  if (!geminiKeys().length) {
    throw new Error("Укажи продукты: лосось 150 г, рис 200 г, салат");
  }

  const raw = await geminiText(description);
  return mealFromIdentify(raw);
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
    const raw = await geminiVision(b64, mime);
    const meal = mealFromIdentify(raw);
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
