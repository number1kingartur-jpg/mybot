/** Бренд: сайт Artur King + канал KINGMODE + бот. */

import { InlineKeyboard } from "grammy";
import { SITE, siteLink } from "./site";

function cleanUser(raw: string | undefined, fallback: string): string {
  return (raw ?? "").trim().replace(/^@/, "") || fallback;
}

export function getBrandLinks() {
  const botUser = cleanUser(process.env.BOT_USERNAME, "Raschettbot");
  const dmUser = cleanUser(process.env.KINGMODE_DM_USERNAME, SITE.telegram);
  const siteUrl = SITE.url.replace(/\/$/, "");
  return {
    siteUrl,
    programsUrl: siteLink(SITE.paths.programs),
    contactsUrl: siteLink(SITE.paths.contacts),
    bookUrl: siteLink(SITE.paths.book),
    nutritionUrl: siteLink(SITE.paths.nutrition),
    botUrl: `https://t.me/${botUser}?start=kingmode`,
    dmUrl: `https://t.me/${dmUser}`,
    botUser,
    dmUser,
  };
}

export const BRAND = {
  name: SITE.community,
  siteName: SITE.brand,
  tagline: SITE.footer,
  methodLine: "Данные вместо ощущений. Система вместо мотивации.",
  channelTitle: SITE.community,
  get channelAbout() {
    const { dmUser, botUser } = getBrandLinks();
    const host = new URL(getBrandLinks().siteUrl).hostname.replace(/^www\./, "");
    return (
      `${SITE.tagline.slice(0, 55)}… ` +
      `Сайт → ${host} · @${dmUser} · бот @${botUser}`
    ).slice(0, 255);
  },
} as const;

/** HTML-футер для сообщений бота. */
export function brandLinksHtml(): string {
  const { siteUrl, programsUrl, dmUrl, botUrl } = getBrandLinks();
  return (
    `🌐 <a href="${siteUrl}">${SITE.brand}</a> · ` +
    `<a href="${programsUrl}">Форматы</a> · ` +
    `💬 <a href="${dmUrl}">Личка</a> · ` +
    `🤖 <a href="${botUrl}">Бот</a>`
  );
}

/** Кнопки под постом канала — 3 ссылки, без дубля в тексте. */
export function brandKeyboard(): InlineKeyboard {
  const { siteUrl, dmUrl, botUrl } = getBrandLinks();
  return new InlineKeyboard()
    .url("🌐 Сайт", siteUrl)
    .row()
    .url("💬 Личка", dmUrl)
    .url("🤖 Бот", botUrl);
}
