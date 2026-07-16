import type { Guide, GuideSection } from "./content";

function sectionToText(s: GuideSection): string {
  const lines: string[] = [`\n${s.title.toUpperCase()}`, "—".repeat(40)];
  if (s.paragraphs?.length) lines.push(...s.paragraphs.map((p) => p.replace(/\*\*/g, "")));
  if (s.bullets?.length) {
    for (const b of s.bullets) lines.push(`• ${b}`);
  }
  if (s.meals?.length) {
    for (const meal of s.meals) {
      lines.push(`\n${meal.label}:`);
      for (const item of meal.items) lines.push(`  — ${item}`);
    }
  }
  if (s.training?.length) {
    lines.push("\nТренировка:");
    for (const t of s.training) lines.push(`  — ${t}`);
  }
  if (s.steps) lines.push(`\nШаги: ${s.steps}`);
  return lines.join("\n");
}

export function formatGuideText(guide: Guide): string {
  const header = [
    "KINGMODE · Artur King",
    guide.title,
    guide.subtitle,
    "",
    guide.description,
    "",
    `Сайт: ${guide.webPath}`,
    `Бот: @Raschettbot`,
    "=".repeat(48),
  ];
  const body = guide.sections.map(sectionToText).join("\n");
  const footer = [
    "",
    "=".repeat(48),
    "© Artur King · arturkingfitness.com",
    "Пересылай только со ссылкой на канал @kingmode_fit",
  ];
  return [...header, body, ...footer].join("\n");
}

/** UTF-8 с BOM — нормально открывается в Windows как «документ». */
export function guideFileBuffer(guide: Guide): Buffer {
  const text = formatGuideText(guide);
  return Buffer.from("\uFEFF" + text, "utf-8");
}
