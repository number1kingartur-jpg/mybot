/** Данные с arturkingfitness.com — единый источник для бота и канала. */

export const SITE = {
  url: process.env.KINGMODE_SITE_URL?.trim() || "https://arturkingfitness.com",
  brand: "Artur King",
  community: "KINGMODE",
  tagline: "Персональная система развития, а не тренировка",
  hero: "Вы покупаете не тренировку. Вы строите систему.",
  footer: "Дисциплина. Практика. Система.",
  telegram: "arturking10",
  instagram: "artur_king_fitness",
  paths: {
    programs: "/programs",
    book: "/book",
    about: "/about",
    blog: "/blog",
    contacts: "/contacts",
    nutrition: "/tools/nutrition",
    training: "/tools/training-plan",
  },
  packs: [
    {
      id: "program",
      name: "Готовая программа",
      price: "1 490 THB",
      line: "8–12 недель, PDF, прогрессия, стартовое КБЖУ",
      url: "/programs",
    },
    {
      id: "consult",
      name: "Разовая консультация",
      price: "2 000 THB",
      line: "Разбор программы, техники, плато — план действий",
      url: "/programs",
    },
    {
      id: "online",
      name: "Онлайн-сопровождение",
      price: "после диагностики",
      line: "Еженедельный контроль: вес, замеры, видео, коррекция плана",
      url: "/programs",
    },
    {
      id: "personal",
      name: "Индивидуальное сопровождение",
      price: "после диагностики",
      line: "Очно: тренировки, питание, восстановление под контролем",
      url: "/programs",
    },
  ],
  freeTools: [
    { name: "Калькулятор питания", path: "/tools/nutrition" },
    { name: "Подбор тренировок", path: "/tools/training-plan" },
    { name: "Книга «Система вместо мотивации»", path: "/book" },
  ],
} as const;

export function siteLink(path: string): string {
  const base = SITE.url.replace(/\/$/, "");
  return path.startsWith("http") ? path : `${base}${path}`;
}
