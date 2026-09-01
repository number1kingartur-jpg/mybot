// ── Общие форматирующие хелперы для хендлеров бота ──────────────────────────
// Вынесены из index.ts без изменения поведения, чтобы доменные модули в
// src/handlers/ могли их использовать, не создавая циклический импорт на index.ts.

import https from "https";

export const HR = "━━━━━━━━━━━━━━━━━━━━";
export const DOT = "·";
export const HTML = { parse_mode: "HTML" as const };

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function today(): string {
  // en-CA → YYYY-MM-DD; дата по Бангкоку, а не UTC
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function bangkokNow(): { dow: number; hour: number } {
  const s = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
  const d = new Date(s);
  return { dow: d.getDay(), hour: d.getHours() };
}

export async function fetchImageBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("chart timeout")));
    req.on("error", reject);
  });
}
