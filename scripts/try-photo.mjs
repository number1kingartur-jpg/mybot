// Проверка распознавания на реальном снимке: печатает сырой ответ модели и итог.
// Запуск: node scripts/try-photo.mjs <путь к фото>
import fs from "node:fs";
import https from "node:https";
import { mealFromIdentify, IDENTIFY_PROMPT } from "../dist/meal.js";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Укажи путь к фото");
  process.exit(1);
}

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY не задан");
  process.exit(1);
}

const mime = file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const b64 = fs.readFileSync(file).toString("base64");

const prompt = IDENTIFY_PROMPT;

function call(model) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
    generationConfig: { temperature: 0.15, maxOutputTokens: 900 },
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/${model}:generateContent`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 45000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf-8") }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const models = process.argv[3]
  ? [process.argv[3]]
  : ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.1-flash-lite"];

for (const model of models) {
  const { status, raw } = await call(model);
  console.log(`\n=== ${model} · HTTP ${status} ===`);
  if (status >= 400) {
    console.log(raw.slice(0, 400));
    continue;
  }
  const text = JSON.parse(raw).candidates?.[0]?.content?.parts?.[0]?.text ?? "(нет текста)";
  console.log(text.trim());
  try {
    console.log("ИТОГ:", JSON.stringify(mealFromIdentify(text), null, 1));
  } catch (e) {
    console.log("ОТКАЗ:", e.message, "| seen:", e.seen ?? "");
  }
}
