import https from "https";

const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim();
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Пробуем по порядку — если одна модель недоступна, следующая
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const PROMPT =
  "Ты нутрициолог. По фото еды оцени порцию для одного приёма пищи. " +
  "Ответь ТОЛЬКО валидным JSON без markdown: " +
  '{"name":"краткое название блюда на русском","kcal":число,"proteinG":число,"fatG":число,"carbsG":число,"note":"одна строка оценки точности"}';

export function mealVisionEnabled(): boolean {
  return Boolean(GEMINI_KEY || GROQ_KEY);
}

export function mealVisionProvider(): string {
  if (GEMINI_KEY) return `Gemini (${GEMINI_MODELS[0]})`;
  if (GROQ_KEY) return "Groq Llama 4 Scout";
  return "none";
}

export interface MealAnalysis {
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  note?: string;
}

function httpsJson(opts: https.RequestOptions, body: string): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...opts, timeout: 45_000 }, (res) => {
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

function extractGeminiError(raw: string): string {
  try {
    const j = JSON.parse(raw);
    return j.error?.message ?? raw.slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

async function geminiVisionOne(model: string, imageBase64: string, mime: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not set");

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
        "x-goog-api-key": GEMINI_KEY,
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (status >= 400) {
    throw new Error(`gemini ${status} [${model}]: ${extractGeminiError(raw)}`);
  }

  const json = JSON.parse(raw);
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return String(text).trim();

  const block = json.candidates?.[0]?.finishReason;
  if (block) throw new Error(`gemini blocked [${model}]: ${block}`);
  throw new Error(extractGeminiError(raw) || `gemini: no content [${model}]`);
}

async function geminiVision(imageBase64: string, mime: string): Promise<string> {
  let lastErr = "unknown";
  for (const model of GEMINI_MODELS) {
    try {
      return await geminiVisionOne(model, imageBase64, mime);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.error("gemini try", model, lastErr);
      // 404/400 model not found — пробуем следующую
      if (!lastErr.includes("404") && !lastErr.includes("not found") && !lastErr.includes("NOT_FOUND")) {
        throw e;
      }
    }
  }
  throw new Error(lastErr);
}

async function groqVision(imageBase64: string, mime: string): Promise<string> {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY not set");

  const body = JSON.stringify({
    model: GROQ_VISION_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
      ],
    }],
    temperature: 0.2,
    max_tokens: 300,
  });

  const { status, raw } = await httpsJson(
    {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (status >= 400) throw new Error(`groq ${status}: ${raw.slice(0, 300)}`);

  const json = JSON.parse(raw);
  const text = json.choices?.[0]?.message?.content;
  if (text) return String(text).trim();
  throw new Error(json.error?.message ?? "groq: no content");
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

/** Анализ фото еды: Gemini (приоритет) или Groq Vision. */
export async function analyzeMealPhoto(imageBuffer: Buffer, mime = "image/jpeg"): Promise<MealAnalysis> {
  const b64 = imageBuffer.toString("base64");
  const raw = GEMINI_KEY
    ? await geminiVision(b64, mime)
    : await groqVision(b64, mime);
  return parseJson(raw);
}
