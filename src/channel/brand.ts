/** Бренд KINGMODE — единый источник для канала и постов. */

export const BRAND = {
  name: "KINGMODE",
  tagline: "План → данные → результат",
  /** Название группы (до 128 символов) */
  channelTitle: "KINGMODE",
  /** Описание профиля (до 255 символов) */
  channelAbout:
    "Метод: тренировка по плану, каждая сессия в цифрах, питание и нагрузка по данным — не по ощущениям. Сила и дисциплина. @Raschettbot",
  siteUrl: process.env.KINGMODE_SITE_URL?.trim() || "",
  botUsername: process.env.BOT_USERNAME?.trim().replace(/^@/, "") || "Raschettbot",
  methodLine: "Тренируешься по цифрам, а не по настроению.",
} as const;

export function brandCta(): string {
  const bot = `@${BRAND.botUsername}`;
  const lines = [
    "",
    "—".repeat(12),
    `🎯 <b>KINGMODE</b> · ${BRAND.methodLine}`,
    `📲 Система в боте: ${bot}`,
  ];
  if (BRAND.siteUrl.startsWith("http")) lines.push(`🔗 ${BRAND.siteUrl}`);
  return lines.join("\n");
}
