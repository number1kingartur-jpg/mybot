import { InlineKeyboard, InputFile, type Context } from "grammy";
import { GUIDES, getGuide } from "./content";
import { guideFileBuffer } from "./delivery";
import { getBrandLinks } from "../channel/brand";

const HR = "━━━━━━━━━━━━━━━━━━━━";

export function guidesListHtml(): string {
  const lines = GUIDES.map(
    (g, i) => `${i + 1}. <b>${g.title}</b>\n   <i>${g.description}</i>`
  );
  return (
    `📥 <b>ГАЙДЫ KINGMODE</b>\n${HR}\n\n` +
    `Файлы с планом — сохрани и открой на телефоне.\n\n` +
    lines.join("\n\n") +
    `\n\n<i>Нажми кнопку ниже или /guide 7day</i>`
  );
}

export function guidesKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const g of GUIDES) {
    kb.text(`📄 ${g.shortName}`, `guide_dl_${g.slug}`).row();
  }
  return kb;
}

export async function sendGuideFile(
  ctx: Pick<Context, "replyWithDocument" | "reply">,
  slug: string
): Promise<boolean> {
  const guide = getGuide(slug);
  if (!guide) return false;
  const buf = guideFileBuffer(guide);
  await ctx.replyWithDocument(new InputFile(buf, guide.filename), {
    caption:
      `📥 <b>${guide.title}</b>\n` +
      `${guide.subtitle}\n\n` +
      `Сохрани файл. На сайте: ${guide.webPath}`,
    parse_mode: "HTML",
  });
  return true;
}

/** Текст + кнопки списка гайдов. */
export async function sendGuidesMenu(ctx: Context): Promise<void> {
  await ctx.reply(guidesListHtml(), {
    parse_mode: "HTML",
    reply_markup: guidesKeyboard(),
  });
}

/** Диплинк из канала: короткое приветствие + файл. */
export async function sendGuideWelcome(
  ctx: Context,
  slug: string,
  userName: string
): Promise<void> {
  const guide = getGuide(slug);
  if (!guide) {
    await sendGuidesMenu(ctx);
    return;
  }
  await ctx.reply(
    `💪 <b>${userName}</b>, держи гайд:\n\n` +
    `<b>${guide.title}</b>\n` +
    `<i>${guide.description}</i>\n\n` +
    `Файл ниже 👇 Сохрани в «Файлы» — откроется в блокноте или PDF-ридере.`,
    { parse_mode: "HTML" }
  );
  await sendGuideFile(ctx, guide.slug);
  const { botUrl } = getBrandLinks();
  await ctx.reply(
    `Дальше в боте:\n` +
    `• 🏋️ тренировка на сегодня\n` +
    `• 🍗 расчёт КБЖУ\n` +
    `• 📸 фото еды → калории\n\n` +
    `<a href="${botUrl}">Открыть меню бота</a>`,
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
  );
}

export function parseGuidePayload(payload: string): string | null {
  const p = payload.trim();
  if (!p.startsWith("guide")) return null;
  const rest = p.replace(/^guide_?/, "");
  if (!rest) return "list";
  return rest;
}

export { GUIDES, getGuide };
