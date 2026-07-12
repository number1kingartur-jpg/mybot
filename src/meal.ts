import https from "https";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GEMINI_MODEL = "gemini-2.0-flash";

const PROMPT =
  "Ты нутрициолог. По фото еды оцени порцию для одного приёма пищи. " +
  "Ответь ТОЛЬКО валидным JSON без markdown: " +
  '{"name":"краткое название блюда на русском","kcal":число,"proteinG":число,"fatG":число,"carbsG":число,"note":"одна строка оценки точности"}';

export function mealVisionEnabled(): boolean {
  return Boolean(GEMINI_KEY || GROQ_KEY);
}

export function mealVisionProvider(): string {
  if (GEMINI_KEY) return "Gemini 2.0 Flash";
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

function httpsJson(
  opts: https.RequestOptions,
  body: string,
  label: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { ...opts, timeout: 45_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`${label} ${res.statusCode}: ${raw.slice(0, 300)}`));
              return;
            }
            resolve(raw);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error(`${label} timeout`)));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function geminiVision(imageBase64: string, mime: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not set");

  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mime, data: imageBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
  });

  const path = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const raw = await httpsJson(
    {
      hostname: "generativelanguage.googleapis.com",
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body,
    "gemini"
  );

  const json = JSON.parse(raw);
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return String(text).trim();
  throw new Error(json.error?.message ?? "gemini: no content");
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

  const raw = await httpsJson(
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
    body,
    "groq"
  );

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
