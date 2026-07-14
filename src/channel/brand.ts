/** Бренд KINGMODE — единый источник ссылок для канала, бота и постов. */

import { InlineKeyboard } from "grammy";

function cleanUser(raw: string | undefined, fallback: string): string {
  return (raw ?? "").trim().replace(/^@/, "") || fallback;
}

function normalizeSite(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s.startsWith("http") ? s.replace(/\/$/, "") : `https://${s.replace(/\/$/, "")}`;
}

export function getBrandLinks() {
  const botUser = cleanUser(process.env.BOT_USERNAME, "Raschettbot");
  const dmUser = cleanUser(process.env.KINGMODE_DM_USERNAME, "arturking10");
  const siteUrl = normalizeSite(process.env.KINGMODE_SITE_URL);
  return {
    siteUrl,
    botUrl: `https://t.me/${botUser}?start=kingmode`,
    dmUrl: `https://t.me/${dmUser}`,
    botUser,
    dmUser,
  };
}

export const BRAND = {
  name: "KINGMODE",
  tagline: "План → данные → результат",
  channelTitle: "KINGMODE",
  methodLine: "Тренируешься по цифрам, а не по настроению.",
  get channelAbout() {
    const { siteUrl, botUser } = getBrandLinks();
    const sitePart = siteUrl ? `Сайт → ${shortSite(siteUrl)} · ` : "";
    return (
      `${sitePart}Метод: план → цифры → результат. Написать → @${getBrandLinks().dmUser} · Бот → @${botUser}`
    ).slice(0, 255);
  },
} as const;

function shortSite(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return url;
  }
}

/** HTML-футер для постов и сообщений бота. */
export function brandCta(): string {
  const { siteUrl, botUrl, dmUrl } = getBrandLinks();
  const lines = [
    "",
    "—".repeat(12),
    `🎯 <b>KINGMODE</b> · ${BRAND.methodLine}`,
  ];
  if (siteUrl) lines.push(`🌐 <a href="${siteUrl}">Сайт</a>`);
  lines.push(`💬 <a href="${dmUrl}">Написать в личку</a>`);
  lines.push(`🤖 <a href="${botUrl}">Открыть бота</a>`);
  return lines.join("\n");
}

/** Кнопки под постом / в /start. */
export function brandKeyboard(): InlineKeyboard {
  const { siteUrl, botUrl, dmUrl } = getBrandLinks();
  const kb = new InlineKeyboard();
  if (siteUrl) kb.url("🌐 Сайт", siteUrl);
  kb.url("💬 В личку", dmUrl);
  kb.row().url("🤖 Бот", botUrl);
  return kb;
}

/** Короткий блок ссылок для приветствия в боте. */
export function brandLinksHtml(): string {
  const { siteUrl, dmUrl, botUrl } = getBrandLinks();
  const parts: string[] = [];
  if (siteUrl) parts.push(`🌐 <a href="${siteUrl}">Сайт</a>`);
  parts.push(`💬 <a href="${dmUrl}">Личка</a>`);
  parts.push(`🤖 <a href="${botUrl}">Бот</a>`);
  return parts.join(" · ");
}
