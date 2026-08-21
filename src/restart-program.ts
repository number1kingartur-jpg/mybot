/**
 * «Старт 3 дня» — бесплатный вход для тех, кто снова начинает.
 * Платный «30 дней шаг за шагом» — ссылка RESTART_PAID_URL (закрытый канал / подписка).
 */

export const RESTART_FREE_DAYS = 3;

export interface RestartTask {
  id: string;
  label: string;
  detail: string;
}

export interface RestartDayPlan {
  day: number;
  title: string;
  intro: string;
  tasks: RestartTask[];
  workout: string;
}

export const RESTART_DAYS: RestartDayPlan[] = [
  {
    day: 1,
    title: "День 1 · вернуть движение",
    intro:
      "Сегодня не зал и не подвиг. Пятнадцать минут дома, без формы и без отговорок. " +
      "Задача одна: сделать и отметить, что сделал.",
    tasks: [
      {
        id: "water",
        label: "Вода",
        detail: "Пол-литра до обеда. Не «пить больше», а один конкретный стакан.",
      },
    ],
    workout:
      "<b>Разминка</b> 2 мин ходьба на месте, плечи и таз.\n\n" +
      "<b>1. Присед к стулу</b> 2×8\n" +
      "Касаешься стулом и встаешь. Колени в сторону носков.\n\n" +
      "<b>2. Отжимания от стены</b> 2×8\n" +
      "Тело прямое, грудь к стене.\n\n" +
      "<b>3. Планка на коленях</b> 2×15 сек\n" +
      "Живот втянут, дыши ровно.",
  },
  {
    day: 2,
    title: "День 2 · тело просыпается",
    intro:
      "Вчера ты уже держал слово. Сегодня чуть другие движения, тот же принцип: коротко, без героизма.",
    tasks: [
      {
        id: "weight",
        label: "Вес (по желанию)",
        detail: "Один раз утром, до еды. Запиши в приложении или просто запомни цифру.",
      },
    ],
    workout:
      "<b>Разминка</b> 2 мин.\n\n" +
      "<b>1. Ягодичный мостик</b> 2×10\n" +
      "Вверху задержка на секунду.\n\n" +
      "<b>2. Отжимания от стола</b> 2×6\n" +
      "Руки на столе, корпус прямой.\n\n" +
      "<b>3. Подъем колена на месте</b> 2×10 на ногу\n" +
      "Медленно, без рывка.",
  },
  {
    day: 3,
    title: "День 3 · закрепить",
    intro:
      "Повторяем базу. Плюс одна вещь с едой: не диета, а один осознанный прием.",
    tasks: [
      {
        id: "protein",
        label: "Белок в одном приеме",
        detail:
          "Ладонь мяса, рыбы, яиц или творога. Не перестраивай весь день, добавь одно.",
      },
    ],
    workout:
      "<b>Разминка</b> 2 мин.\n\n" +
      "<b>1. Присед к стулу</b> 2×8\n\n" +
      "<b>2. Отжимания от стены</b> 2×10\n\n" +
      "<b>3. Планка на коленях</b> 2×20 сек",
  },
];

export function restartDayPlan(day: number): RestartDayPlan | undefined {
  return RESTART_DAYS.find((d) => d.day === day);
}

export function paidRestartOffer(): { label: string; url: string; line: string } {
  const url = (process.env.RESTART_PAID_URL || "").trim();
  const label = (process.env.RESTART_PAID_LABEL || "30 дней шаг за шагом").trim();
  const price = (process.env.RESTART_PAID_PRICE || "").trim();
  const dm = (process.env.KINGMODE_DM_USERNAME || "arturking10").replace(/^@/, "");
  const fallback = `https://t.me/${dm}`;
  const line = price
    ? `${label} · ${price}. Дальше веду я, каждый день маленький шаг.`
    : `${label}. Напиши мне «СТАРТ30» — пришлю вход.`;
  return { label, url: url || fallback, line };
}
