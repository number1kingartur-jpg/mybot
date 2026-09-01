/**
 * Экспорт 30 дней в тексты для закрытого Telegram-канала.
 * node scripts/export-closed-channel.mjs
 * → content/closed-channel/day-01.txt … day-30.txt + welcome.txt + README.md
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  CLOSED_CHANNEL_WELCOME,
  CLOSED_DAYS,
  CLOSED_WEEK_INTROS,
} from "../dist/closed-program.js";

const OUT = join(process.cwd(), "content", "closed-channel");
mkdirSync(OUT, { recursive: true });

function formatDay(d) {
  const weekIntro =
    d.day === 1 || d.day === 8 || d.day === 15 || d.day === 22 || d.day === 29
      ? `\n\n${CLOSED_WEEK_INTROS[d.week] || ""}`
      : "";
  return (
    `${d.title}${weekIntro}\n\n` +
    `${d.intro}\n\n` +
    `Движение (~15–20 мин)\n${d.workout}\n\n` +
    `Привычка: ${d.habit.label}\n${d.habit.detail}\n\n` +
    `Отметка: ${d.checkIn}`
  );
}

writeFileSync(join(OUT, "welcome.txt"), CLOSED_CHANNEL_WELCOME, "utf-8");

let prevWeek = 0;
for (const d of CLOSED_DAYS) {
  const name = `day-${String(d.day).padStart(2, "0")}.txt`;
  writeFileSync(join(OUT, name), formatDay(d), "utf-8");
  prevWeek = d.week;
}

const readme =
  `# Закрытый канал · 30 дней\n\n` +
  `Сгенерировано: scripts/export-closed-channel.mjs\n\n` +
  `## Как залить\n\n` +
  `1. Создай **приватный** канал в Telegram.\n` +
  `2. Опубликуй \`welcome.txt\` и закрепи.\n` +
  `3. По одному посту в день из \`day-01.txt\` … \`day-30.txt\` (или планируй через отложку).\n` +
  `4. Ссылку-приглашение в \`RESTART_PAID_URL\` на Railway.\n\n` +
  `## Отличие от @kingmode_fit\n\n` +
  `| Открытый | Закрытый |\n` +
  `|----------|----------|\n` +
  `| Доверие, мысли, фактура | Задание на сегодня |\n` +
  `| Бесплатно | Платно |\n` +
  `| Без «сделал» | Отметка каждый день |\n`;

writeFileSync(join(OUT, "README.md"), readme, "utf-8");

console.log(`OK: ${CLOSED_DAYS.length} days → ${OUT}`);
