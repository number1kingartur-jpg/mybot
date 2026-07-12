import https from "https";

const PROMPT =
  "Ты нутрициолог. По фото еды оцени порцию для одного приёма пищи. " +
  "Ответь ТОЛЬКО валидным JSON без markdown: " +
  '{"name":"краткое название блюда на русском","kcal":число,"proteinG":число,"fatG":число,"carbsG":число,"note":"одна строка оценки точности"}';

/** Убирает кавычки, переносы строк и невидимые символы из ключей Railway. */
function sanitizeApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/^['"`\s]+|['"`\s]+$/g, "")
    .replace(/[\r\n\t\u200b\u200c\u200d\ufeff]/g, "")
    .trim();
  return cleaned || undefined;
}

const GROQ_KEY = sanitizeApiKey(process.env.GROQ_API_KEY);
const OPENROUTER_KEY = sanitizeApiKey(process.env.OPENROUTER_API_KEY);
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const OPENROUTER_VISION_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openrouter/free",
];

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
  return geminiKeys().length > 0 || Boolean(OPENROUTER_KEY || GROQ_KEY);
}

export function mealVisionProvider(): string {
  const parts: string[] = [];
  const gk = geminiKeys();
  if (gk.length) parts.push(`Gemini×${gk.length}`);
  if (OPENROUTER_KEY) parts.push("OpenRouter free");
  if (GROQ_KEY) parts.push("Groq");
  return parts.join(" → ") || "none";
}

export function freeMealFallbackEnabled(): boolean {
  return Boolean(OPENROUTER_KEY || geminiKeys().length > 1);
}

export interface MealAnalysis {
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  note?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isQuotaError(msg: string): boolean {
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota");
}

function isModelMissing(msg: string): boolean {
  return msg.includes("404") || msg.includes("not found") || msg.includes("NOT_FOUND");
}

function httpsJson(opts: https.RequestOptions, body: string): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...opts, timeout: 60_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, raw: Buffer.concat(chunks).toString("utf-8") });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function extractApiError(raw: string): string {
  try {
    const j = JSON.parse(raw);
    return j.error?.message ?? j.message ?? raw.slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

async function geminiVisionOne(apiKey: string, model: string, imageBase64: string, mime: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mime, data: imageBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
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

  if (status >= 400) {
    throw new Error(`gemini ${status} [${model}]: ${extractApiError(raw)}`);
  }

  const json = JSON.parse(raw);
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return String(text).trim();

  const block = json.candidates?.[0]?.finishReason;
  if (block) throw new Error(`gemini blocked [${model}]: ${block}`);
  throw new Error(extractApiError(raw) || `gemini: no content [${model}]`);
}

async function geminiVisionWithKey(apiKey: string, imageBase64: string, mime: string): Promise<string> {
  let lastErr = "unknown";
  let quotaHit = false;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await geminiVisionOne(apiKey, model, imageBase64, mime);
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        console.error("gemini try", model, `attempt=${attempt}`, lastErr);

        if (isModelMissing(lastErr)) break;

        if (isQuotaError(lastErr)) {
          quotaHit = true;
          if (attempt === 0) {
            await sleep(3000);
            continue;
          }
          break;
        }

        throw e;
      }
    }
  }

  if (quotaHit) throw new Error(`gemini quota exhausted: ${lastErr}`);
  throw new Error(lastErr);
}

async function chatVision(
  label: string,
  hostname: string,
  path: string,
  headers: Record<string, string>,
  model: string,
  imageBase64: string,
  mime: string
): Promise<string> {
  const body = JSON.stringify({
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
      ],
    }],
    temperature: 0.2,
    max_tokens: 400,
  });

  const { status, raw } = await httpsJson(
    {
      hostname,
      path,
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (status >= 400) throw new Error(`${label} ${status} [${model}]: ${extractApiError(raw)}`);

  const json = JSON.parse(raw);
  const text = json.choices?.[0]?.message?.content;
  if (text) return String(text).trim();
  throw new Error(json.error?.message ?? `${label}: no content`);
}

async function openRouterVision(imageBase64: string, mime: string): Promise<string> {
  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY not set");

  let lastErr = "unknown";
  for (const model of OPENROUTER_VISION_MODELS) {
    try {
      return await chatVision(
        "openrouter",
        "openrouter.ai",
        "/api/v1/chat/completions",
        {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          Referer: "https://t.me/raschet_bot",
          "X-OpenRouter-Title": "RASCHET Bot",
        },
        model,
        imageBase64,
        mime
      );
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.error("openrouter try", model, lastErr);
      if (!isQuotaError(lastErr) && !isModelMissing(lastErr)) throw e;
    }
  }
  throw new Error(`openrouter quota exhausted: ${lastErr}`);
}

async function groqVision(imageBase64: string, mime: string): Promise<string> {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY not set");
  return chatVision(
    "groq",
    "api.groq.com",
    "/openai/v1/chat/completions",
    { Authorization: `Bearer ${GROQ_KEY}` },
    GROQ_VISION_MODEL,
    imageBase64,
    mime
  );
}

function parseJson(raw: string): MealAnalysis {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const j = JSON.parse(slice) as Partial<MealAnalysis>;
  return {
    name: String(j.name ?? "Блюдо").slice(0, 80),
    kcal: Math.max(0, Math.round(Number(j.kcal) || 0)),
    proteinG: Math.max(0, Math.round(Number(j.proteinG) || 0)),
    fatG: Math.max(0, Math.round(Number(j.fatG) || 0)),
    carbsG: Math.max(0, Math.round(Number(j.carbsG) || 0)),
    note: j.note ? String(j.note).slice(0, 120) : undefined,
  };
}

/** Анализ фото: Gemini (несколько ключей) → OpenRouter free → Groq. */
export async function analyzeMealPhoto(imageBuffer: Buffer, mime = "image/jpeg"): Promise<MealAnalysis> {
  const b64 = imageBuffer.toString("base64");
  const errors: string[] = [];

  for (const key of geminiKeys()) {
    try {
      const raw = await geminiVisionWithKey(key, b64, mime);
      return parseJson(raw);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(errMsg);
      console.error("gemini key failed:", errMsg.slice(0, 120));
      if (!isQuotaError(errMsg)) throw e;
    }
  }

  if (OPENROUTER_KEY) {
    try {
      const raw = await openRouterVision(b64, mime);
      return parseJson(raw);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(errMsg);
      console.error("openrouter failed:", errMsg.slice(0, 120));
      if (!isQuotaError(errMsg)) throw e;
    }
  }

  if (GROQ_KEY) {
    try {
      const raw = await groqVision(b64, mime);
      return parseJson(raw);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  throw new Error(errors.at(-1) ?? "all vision providers failed");
}

// backward compat for index.ts
export function groqMealFallbackEnabled(): boolean {
  return Boolean(GROQ_KEY || OPENROUTER_KEY);
}
