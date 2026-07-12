import https from "https";

const PROMPT =
  "Ты нутрициолог. По фото еды оцени порцию для одного приёма пищи. " +
  "Ответь ТОЛЬКО валидным JSON без markdown: " +
  '{"name":"краткое название блюда на русском","kcal":число,"proteinG":число,"fatG":число,"carbsG":число,"note":"одна строка оценки точности"}';

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

/** Убирает всё лишнее из ключей Railway — только printable ASCII. */
function sanitizeApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw
    .replace(/^['"`\s]+|['"`\s]+$/g, "")
    .replace(/[\r\n\t\u200b\u200c\u200d\ufeff\u00a0]/g, "")
    .trim();
  if (/^bearer\s+/i.test(cleaned)) cleaned = cleaned.replace(/^bearer\s+/i, "").trim();
  if (cleaned.includes("=")) cleaned = cleaned.split("=").pop()!.trim();
  cleaned = cleaned.replace(/\s+/g, "");
  cleaned = cleaned.replace(/[^\x21-\x7E]/g, "");
  return cleaned || undefined;
}

function openRouterKey(): string | undefined {
  return sanitizeApiKey(process.env.OPENROUTER_API_KEY);
}

function groqKey(): string | undefined {
  return sanitizeApiKey(process.env.GROQ_API_KEY);
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
  return geminiKeys().length > 0 || Boolean(openRouterKey() || groqKey());
}

export function mealVisionProvider(): string {
  const parts: string[] = [];
  if (openRouterKey()) parts.push("OpenRouter free");
  const gk = geminiKeys();
  if (gk.length) parts.push(`Gemini×${gk.length}`);
  if (groqKey()) parts.push("Groq");
  return parts.join(" → ") || "none";
}

export function freeMealFallbackEnabled(): boolean {
  return Boolean(openRouterKey() || geminiKeys().length > 1);
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

function isHeaderKeyError(msg: string): boolean {
  return msg.includes("Invalid character in header") || msg.includes("ERR_INVALID_CHAR");
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

async function chatVisionFetch(
  label: string,
  url: string,
  token: string,
  extraHeaders: Record<string, string>,
  model: string,
  imageBase64: string,
  mime: string
): Promise<string> {
  if (!token || !/^[\x21-\x7E]+$/.test(token)) {
    throw new Error(`${label} API key invalid format (len=${token?.length ?? 0})`);
  }

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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`${label} ${res.status} [${model}]: ${extractApiError(raw)}`);

  const json = JSON.parse(raw);
  const text = json.choices?.[0]?.message?.content;
  if (text) return String(text).trim();
  throw new Error(json.error?.message ?? `${label}: no content`);
}

async function openRouterVision(imageBase64: string, mime: string): Promise<string> {
  const key = openRouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  console.log(`openrouter key ok: ${key.slice(0, 10)}... len=${key.length}`);

  let lastErr = "unknown";
  for (const model of OPENROUTER_VISION_MODELS) {
    try {
      return await chatVisionFetch(
        "openrouter",
        "https://openrouter.ai/api/v1/chat/completions",
        key,
        {
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
      if (!isQuotaError(lastErr) && !isModelMissing(lastErr) && !isHeaderKeyError(lastErr)) throw e;
    }
  }
  throw new Error(`openrouter failed: ${lastErr}`);
}

async function groqVision(imageBase64: string, mime: string): Promise<string> {
  const key = groqKey();
  if (!key) throw new Error("GROQ_API_KEY not set");
  return chatVisionFetch(
    "groq",
    "https://api.groq.com/openai/v1/chat/completions",
    key,
    {},
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

/** Анализ фото: OpenRouter free → Gemini → Groq. */
export async function analyzeMealPhoto(imageBuffer: Buffer, mime = "image/jpeg"): Promise<MealAnalysis> {
  const b64 = imageBuffer.toString("base64");
  const errors: string[] = [];

  if (openRouterKey()) {
    try {
      const raw = await openRouterVision(b64, mime);
      return parseJson(raw);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(errMsg);
      console.error("openrouter failed:", errMsg.slice(0, 120));
    }
  }

  for (const key of geminiKeys()) {
    try {
      const raw = await geminiVisionWithKey(key, b64, mime);
      return parseJson(raw);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(errMsg);
      console.error("gemini key failed:", errMsg.slice(0, 120));
    }
  }

  if (groqKey()) {
    try {
      const raw = await groqVision(b64, mime);
      return parseJson(raw);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const last = errors.at(-1) ?? "all vision providers failed";
  if (errors.some(isHeaderKeyError)) {
    throw new Error(`OPENROUTER_API_KEY invalid: ${last}`);
  }
  throw new Error(last);
}

export function groqMealFallbackEnabled(): boolean {
  return Boolean(groqKey() || openRouterKey());
}
