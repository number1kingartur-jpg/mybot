import https from "https";

const GROQ_KEY = process.env.GROQ_API_KEY;

export function mealVisionEnabled(): boolean {
  return Boolean(GROQ_KEY);
}

export interface MealAnalysis {
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  note?: string;
}

function groqVision(imageBase64: string, mime: string): Promise<string> {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY not set");

  const body = JSON.stringify({
    model: "llama-3.2-11b-vision-preview",
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Ты нутрициолог. По фото еды оцени порцию для одного приёма пищи. " +
            "Ответь ТОЛЬКО валидным JSON без markdown: " +
            '{"name":"краткое название блюда на русском","kcal":число,"proteinG":число,"fatG":число,"carbsG":число,"note":"одна строка оценки точности"}',
        },
        {
          type: "image_url",
          image_url: { url: `data:${mime};base64,${imageBase64}` },
        },
      ],
    }],
    temperature: 0.2,
    max_tokens: 300,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.groq.com",
        path: "/openai/v1/chat/completions",
        method: "POST",
        timeout: 45_000,
        headers: {
          Authorization: `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            const text = json.choices?.[0]?.message?.content;
            if (text) resolve(String(text).trim());
            else reject(new Error(json.error?.message ?? "no content"));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("groq vision timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
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

/** Анализ фото еды через Groq Vision (аналог Forkly / Zenetic). */
export async function analyzeMealPhoto(imageBuffer: Buffer, mime = "image/jpeg"): Promise<MealAnalysis> {
  const b64 = imageBuffer.toString("base64");
  const raw = await groqVision(b64, mime);
  return parseJson(raw);
}
