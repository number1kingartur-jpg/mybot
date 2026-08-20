import fs from "fs";
import path from "path";

// Railway Volume mounts at /data; locally falls back to project root
const DB_PATH = process.env.DATA_PATH ?? path.join(__dirname, "..", "data.json");
// Запись идёт во временный файл, прежнее состояние остаётся в резервном.
const TMP_PATH = `${DB_PATH}.tmp`;
const BAK_PATH = `${DB_PATH}.bak`;

export interface WorkoutEntry {
  id: string;
  userId: number;
  date: string;        // YYYY-MM-DD
  exercise: string;
  sets: number;
  reps: number;
  weightKg: number;
  notes?: string;
}

export interface BodyweightEntry {
  userId: number;
  date: string;        // YYYY-MM-DD
  weightKg: number;
  /** profile: цифра из анкеты, не взвешивание. user: человек встал на весы. */
  source?: "profile" | "user";
}

export interface SessionPlan {
  day: number;
  focus: string;
  intensity: number;
  sets: number;
  reps: number;
  weightKg: number;
  rpe: number;
  detail?: string;   // полная раскладка рабочих подходов (для 5/3/1, GZCLP)
}

export interface WeekPlan {
  week: number;
  sessions: SessionPlan[];
}

export interface Lift {
  name: string;
  oneRmKg: number;
}

export interface Program {
  id: string;
  userId: number;
  createdAt: string;
  model: string;
  goal: string;
  oneRmKg: number;          // сохраняем для совместимости (= 1RM первого движения)
  lifts?: Lift[];           // 1RM по каждому базовому движению
  weeks: number;
  daysPerWeek: number;
  weeksData: WeekPlan[];
  peakWeek: number;
  deloadWeek: number;
  currentWeek: number;
  currentDay: number;
  active: boolean;
}

export interface NutritionProfile {
  sex: "m" | "f";
  age: number;
  heightCm: number;
  weightKg: number;         // запасной вес, если нет записей в дневнике веса
  goal: "bulk" | "cut" | "maint";
  activity: "low" | "mid" | "high";
}

export interface UserRecord {
  chatId: number;
  firstName: string;
  registeredAt: string;
  reminderDays?: number[];  // 0=Вс … 6=Сб
  reminderHour?: number;    // час по Asia/Bangkok
  nutrition?: NutritionProfile;
  mode?: "simple" | "pro";
  simpleIdx?: number;       // номер следующей тренировки в простом режиме (A/B чередование)
  simplePlace?: "home" | "gym";
  simpleLevel?: "start" | "train";
  simpleDiff?: number;      // накопленная сложность по фидбэку: >0 легко, <0 тяжело
  lastReminderDate?: string;   // когда отправлено последнее напоминание (YYYY-MM-DD)
  remindersMissed?: number;    // сколько напоминаний подряд проигнорировано
  remindersPaused?: boolean;   // авто-пауза после 3 игноров
  premiumUntil?: string;       // ISO-дата окончания подписки
  photoWeekKey?: string;       // неделя для лимита бесплатных фото-анализов
  photoCount?: number;         // сколько фото-анализов за текущую неделю
  photoDayKey?: string;        // день для дневной планки (YYYY-MM-DD)
  photoDayCount?: number;      // сколько фото-анализов за сегодня
  mealRemindDate?: string;     // когда напомнили про дневник еды (YYYY-MM-DD)
  mealRemindMissed?: number;   // сколько напоминаний подряд не привели к записи
  mealRemindPaused?: boolean;  // авто-пауза: не надоедаем тому, кто не отвечает
  ref?: string;                // источник: kingmode, channel, …
  restDate?: string;           // YYYY-MM-DD: сегодня отмечен отдых в маршруте дня
}

export interface MealEntry {
  id: string;
  userId: number;
  date: string;        // YYYY-MM-DD
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** Картинка главного продукта: имя файла в `webapp/img/food`. */
  slug?: string;
  /** Официальное фото упаковки из открытой базы. */
  photoUrl?: string;
  /** Час Бангкока, когда записали. Нужен, чтобы утром предлагать вчерашний завтрак. */
  hour?: number;
}

export interface Challenge {
  id: string;
  fromId: number;
  toId?: number;         // присоединившийся соперник
  startDate: string;     // YYYY-MM-DD, ставится при принятии вызова
  endDate: string;       // последний день (включительно)
  finished?: boolean;
  lastPingFrom?: number; // анти-спам уведомлений о тренировке соперника
  lastPingDate?: string;
}

/** Вода: одна строка на день, объём накапливается за сутки. */
export interface WaterEntry {
  userId: number;
  date: string;        // YYYY-MM-DD
  ml: number;
}

interface DB {
  workouts: WorkoutEntry[];
  programs: Program[];
  bodyweight: BodyweightEntry[];
  users: UserRecord[];
  challenges: Challenge[];
  meals: MealEntry[];
  water?: WaterEntry[];
  channelPosted?: { postId: string; date: string }[];
  /** Последняя публикация бота в канал — для удаления всей серии (1–3 сообщения). */
  channelLastPublish?: { postId: string; messageIds: number[]; date: string };
}

function emptyDb(): DB {
  return { workouts: [], programs: [], bodyweight: [], users: [], challenges: [], meals: [], water: [], channelPosted: [], channelLastPublish: undefined };
}

/** Прочитать и привести к полной форме. `null` — файла нет или он не разбирается. */
function readAt(file: string): DB | null {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<DB>;
    return {
      workouts: parsed.workouts ?? [],
      programs: parsed.programs ?? [],
      bodyweight: parsed.bodyweight ?? [],
      users: parsed.users ?? [],
      challenges: parsed.challenges ?? [],
      meals: parsed.meals ?? [],
      water: parsed.water ?? [],
      channelPosted: parsed.channelPosted ?? [],
      // Поле терялось при каждом чтении базы, из-за чего /channel_delete_last
      // не находил последнюю публикацию: записать её было можно, прочитать — нет.
      channelLastPublish: parsed.channelLastPublish,
    };
  } catch {
    return null;
  }
}

/**
 * Битый файл больше не превращается в пустую базу.
 *
 * Раньше на любой ошибке разбора чтение отдавало пустую базу, а первая же
 * следующая запись закрепляла эту пустоту на диске. Одна прерванная запись —
 * и дневники, веса и программы всех пользователей исчезали без строки в логе.
 * Похоже, именно так пропали отметки опубликованного в канале: очередь
 * посчитала неопубликованными все 28 постов, включая уже вышедшие.
 *
 * Порядок теперь такой: основной файл, затем резервная копия, и только
 * отсутствие обоих считается первым запуском. Если файл есть, но не читается
 * и резерва нет — исключение вместо тишины. Мёртвый бот заметен сразу,
 * молча обнулённая база — через неделю и уже безвозвратно.
 */
function load(): DB {
  const main = readAt(DB_PATH);
  if (main) {
    migrate(main);
    return main;
  }

  const brokenFile = fs.existsSync(DB_PATH);
  const backup = readAt(BAK_PATH);
  if (backup) {
    console.error(
      `БАЗА: ${brokenFile ? "основной файл не разбирается" : "основного файла нет"}, ` +
        `поднимаю резервную копию ${BAK_PATH}`
    );
    if (brokenFile) {
      // Битый файл сохраняем: перезапись затрёт единственную улику, по которой
      // потом можно понять, на чём оборвалась запись.
      try {
        fs.renameSync(DB_PATH, `${DB_PATH}.corrupt-${Date.now()}`);
      } catch {
        // Не вышло отложить — резерв всё равно важнее.
      }
    }
    migrate(backup);
    return backup;
  }

  if (brokenFile) {
    throw new Error(
      `БАЗА не разбирается, резервной копии нет: ${DB_PATH}. ` +
        `Файл на диске не тронут — разберись с ним до перезапуска.`
    );
  }

  // Ни основного файла, ни резервного — это действительно первый запуск.
  return emptyDb();
}

/** Старые записи без userId принадлежат первому зарегистрированному пользователю (владельцу). */
function migrate(db: DB) {
  const owner = db.users[0]?.chatId;
  if (owner === undefined) return;
  let changed = false;
  for (const w of db.workouts) if (w.userId === undefined) { w.userId = owner; changed = true; }
  for (const p of db.programs) if (p.userId === undefined) { p.userId = owner; changed = true; }
  for (const b of db.bodyweight) if (b.userId === undefined) { b.userId = owner; changed = true; }
  if (changed) save(db);
}

/**
 * Запись в обход живого файла.
 *
 * `writeFileSync` по существующему пути сначала обрезает файл, а потом наполняет:
 * процесс, убитый в этот промежуток — редеплой, перезапуск, нехватка памяти, —
 * оставлял на диске обрезанный JSON. Теперь наполняется временный файл, прежнее
 * состояние уходит в резервное, и лишь потом переименование ставит новое на место.
 * Переименование в пределах одного диска атомарно: на пути лежит либо старый файл
 * целиком, либо новый целиком, промежуточного состояния не бывает.
 *
 * Отступы убраны: они раздували файл почти вдвое, а перезаписывается он целиком
 * при каждом изменении. Читать базу глазами всё равно незачем.
 */
function save(db: DB) {
  const fd = fs.openSync(TMP_PATH, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(db), "utf-8");
    // Без сброса на диск переименование может опередить сами данные, и после
    // внезапной остановки под правильным именем окажется пустота.
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(DB_PATH)) fs.renameSync(DB_PATH, BAK_PATH);
  fs.renameSync(TMP_PATH, DB_PATH);
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Workouts ────────────────────────────────────────────────────────────────
export function addWorkout(entry: Omit<WorkoutEntry, "id">): WorkoutEntry {
  const db = load();
  const row: WorkoutEntry = { id: uid(), ...entry };
  db.workouts.push(row);
  save(db);
  return row;
}

export function getWorkouts(userId: number, exercise?: string, limit = 20): WorkoutEntry[] {
  const db = load();
  let rows = db.workouts.filter((w) => w.userId === userId);
  if (exercise) rows = rows.filter((w) => w.exercise.toLowerCase() === exercise.toLowerCase());
  return rows.slice(-limit);
}

export function getAllWorkouts(userId: number): WorkoutEntry[] {
  return load().workouts.filter((w) => w.userId === userId);
}

export function removeWorkouts(ids: string[]) {
  const db = load();
  const set = new Set(ids);
  db.workouts = db.workouts.filter((w) => !set.has(w.id));
  save(db);
}

export function getExercises(userId: number): string[] {
  const db = load();
  const set = new Set(db.workouts.filter((w) => w.userId === userId).map((w) => w.exercise));
  return [...set].sort();
}

/** Даты тренировок пользователя (уникальные, YYYY-MM-DD). */
export function getWorkoutDates(userId: number): string[] {
  const db = load();
  return [...new Set(db.workouts.filter((w) => w.userId === userId).map((w) => w.date))].sort();
}

/** Оценка 1RM по формуле Эпли для PR-детекта. */
function est1rm(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

export interface PrCheck {
  isWeightPr: boolean;
  isE1rmPr: boolean;
  prevBestWeight: number;
  prevBestE1rm: number;
  e1rm: number;
}

/** Проверка рекорда ДО добавления новой записи. */
export function checkPr(userId: number, exercise: string, weightKg: number, reps: number): PrCheck {
  const db = load();
  const prior = db.workouts.filter(
    (w) => w.userId === userId && w.exercise.toLowerCase() === exercise.toLowerCase()
  );
  const prevBestWeight = prior.reduce((m, w) => Math.max(m, w.weightKg), 0);
  const prevBestE1rm = prior.reduce((m, w) => Math.max(m, est1rm(w.weightKg, w.reps)), 0);
  const e1rm = est1rm(weightKg, reps);
  return {
    isWeightPr: prior.length > 0 && weightKg > prevBestWeight,
    isE1rmPr: prior.length > 0 && e1rm > prevBestE1rm + 0.01,
    prevBestWeight,
    prevBestE1rm: Math.round(prevBestE1rm * 10) / 10,
    e1rm: Math.round(e1rm * 10) / 10,
  };
}

// ── Programs ────────────────────────────────────────────────────────────────
export function saveProgram(p: Omit<Program, "id" | "createdAt">): Program {
  const db = load();
  db.programs = db.programs.map((pr) =>
    pr.userId === p.userId ? { ...pr, active: false } : pr
  );
  const row: Program = { id: uid(), createdAt: new Date().toISOString(), ...p };
  db.programs.push(row);
  save(db);
  return row;
}

export function getActiveProgram(userId: number): Program | null {
  const db = load();
  return db.programs.find((p) => p.userId === userId && p.active) ?? null;
}

export function deactivatePrograms(userId: number) {
  const db = load();
  db.programs = db.programs.map((p) =>
    p.userId === userId ? { ...p, active: false } : p
  );
  save(db);
}

export function advanceProgramDay(userId: number): Program | null {
  const db = load();
  const idx = db.programs.findIndex((p) => p.userId === userId && p.active);
  if (idx === -1) return null;
  const prog = db.programs[idx];
  const week = prog.weeksData.find((w) => w.week === prog.currentWeek);
  if (!week) return prog;
  const lastDay = week.sessions[week.sessions.length - 1]?.day ?? prog.daysPerWeek;
  if (prog.currentDay >= lastDay) {
    if (prog.currentWeek < prog.weeks) {
      prog.currentWeek += 1;
      prog.currentDay = 1;
    } else {
      prog.active = false;
    }
  } else {
    prog.currentDay += 1;
  }
  db.programs[idx] = prog;
  save(db);
  return prog;
}

// ── Bodyweight ────────────────────────────────────────────────────────────────
/** Дата необязательна: в чате пишется «сегодня», из приложения можно указать день. */
export function addBodyweight(
  userId: number,
  weightKg: number,
  date?: string,
  source: "profile" | "user" = "user"
): BodyweightEntry {
  const db = load();
  const day = date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  // одна запись в день — перезаписываем
  db.bodyweight = db.bodyweight.filter((b) => !(b.userId === userId && b.date === day));
  const row: BodyweightEntry = { userId, date: day, weightKg, source };
  db.bodyweight.push(row);
  db.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
  save(db);
  return row;
}

export function getBodyweight(userId: number, limit = 30): BodyweightEntry[] {
  return load().bodyweight.filter((b) => b.userId === userId).slice(-limit);
}

export function removeBodyweight(userId: number, date: string): boolean {
  const db = load();
  const before = db.bodyweight.length;
  db.bodyweight = db.bodyweight.filter((b) => !(b.userId === userId && b.date === date));
  if (db.bodyweight.length === before) return false;
  save(db);
  return true;
}

// ── Вода ──────────────────────────────────────────────────────────────────────
// Хранится днями, а не отдельными глотками: для нормы важен итог за сутки,
// а история отдельных стаканов никому ничего не даёт.

function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/** Прибавить объём к дню. Отрицательное значение убирает лишнее, минимум — ноль. */
export function addWater(userId: number, ml: number, date?: string): number {
  const db = load();
  const day = date ?? bangkokToday();
  db.water = db.water ?? [];
  const row = db.water.find((w) => w.userId === userId && w.date === day);
  const next = Math.max(0, Math.min(15000, Math.round((row?.ml ?? 0) + ml)));
  if (row) row.ml = next;
  else db.water.push({ userId, date: day, ml: next });
  db.water.sort((a, b) => a.date.localeCompare(b.date));
  save(db);
  return next;
}

export function getWater(userId: number, date?: string): number {
  const day = date ?? bangkokToday();
  const rows = load().water ?? [];
  return rows.find((w) => w.userId === userId && w.date === day)?.ml ?? 0;
}

export function getWaterHistory(userId: number, limit = 14): WaterEntry[] {
  return (load().water ?? []).filter((w) => w.userId === userId).slice(-limit);
}

/**
 * Ориентир по воде: 35 мл на кг массы, округление до 100 мл.
 * Это средняя рекомендация для тренирующегося человека, а не медицинская норма:
 * жара и объём тренировки добавляют сверху, поэтому цифра в приложении подписана
 * как ориентир, а не как обязательство.
 */
export function waterTargetMl(weightKg: number): number {
  const w = weightKg > 0 ? weightKg : 80;
  return Math.round((w * 35) / 100) * 100;
}

// ── Users (для рассылки сводок) ───────────────────────────────────────────────
export function registerUser(chatId: number, firstName: string) {
  const db = load();
  if (!db.users.some((u) => u.chatId === chatId)) {
    db.users.push({ chatId, firstName, registeredAt: new Date().toISOString() });
    save(db);
  }
}

export function getUsers(): UserRecord[] {
  return load().users;
}

export function getUser(chatId: number): UserRecord | undefined {
  return load().users.find((u) => u.chatId === chatId);
}

export function setNutrition(chatId: number, profile: NutritionProfile) {
  const db = load();
  const u = db.users.find((x) => x.chatId === chatId);
  if (!u) return;
  u.nutrition = profile;
  save(db);
  // Вес в анкете и вес в дневнике жили в разных таблицах: человек писал 80 кг
  // в норме, а карточка «Вес» смотрела дневник и писала «нет».
  if (getBodyweight(chatId, 1).length === 0 && profile.weightKg >= 30) {
    addBodyweight(chatId, profile.weightKg, undefined, "profile");
  }
}

export function updateUser(chatId: number, patch: Partial<UserRecord>) {
  const db = load();
  const u = db.users.find((x) => x.chatId === chatId);
  if (!u) return;
  Object.assign(u, patch);
  save(db);
}

// ── Challenges (недельный челлендж с другом) ─────────────────────────────────
/** Возвращает ожидающий (без соперника) челлендж пользователя или создаёт новый. */
export function createChallenge(fromId: number): Challenge {
  const db = load();
  const pending = db.challenges.find((c) => c.fromId === fromId && !c.toId && !c.finished);
  if (pending) return pending;
  const row: Challenge = { id: uid(), fromId, startDate: "", endDate: "" };
  db.challenges.push(row);
  save(db);
  return row;
}

export function getChallengeById(id: string): Challenge | undefined {
  return load().challenges.find((c) => c.id === id);
}

/** Активный (принятый и не истёкший) челлендж пользователя. */
export function getActiveChallenge(userId: number, todayStr: string): Challenge | undefined {
  return load().challenges.find(
    (c) => !c.finished && c.toId !== undefined &&
      (c.fromId === userId || c.toId === userId) && c.endDate >= todayStr
  );
}

export function joinChallenge(id: string, toId: number, startDate: string, endDate: string): Challenge | null {
  const db = load();
  const c = db.challenges.find((x) => x.id === id);
  if (!c || c.finished || c.toId !== undefined || c.fromId === toId) return null;
  c.toId = toId;
  c.startDate = startDate;
  c.endDate = endDate;
  save(db);
  return c;
}

export function setChallengePing(id: string, fromUserId: number, date: string) {
  const db = load();
  const c = db.challenges.find((x) => x.id === id);
  if (!c) return;
  c.lastPingFrom = fromUserId;
  c.lastPingDate = date;
  save(db);
}

/** Принятые челленджи, срок которых истёк. */
export function getExpiredChallenges(todayStr: string): Challenge[] {
  return load().challenges.filter(
    (c) => !c.finished && c.toId !== undefined && c.endDate < todayStr
  );
}

export function finishChallenge(id: string) {
  const db = load();
  const c = db.challenges.find((x) => x.id === id);
  if (!c) return;
  c.finished = true;
  save(db);
}

// ── Meals (дневник питания) ───────────────────────────────────────────────────
export function addMeal(entry: Omit<MealEntry, "id">): MealEntry {
  const db = load();
  const row: MealEntry = { id: uid(), ...entry };
  db.meals.push(row);
  save(db);
  return row;
}

export function removeMeal(userId: number, mealId: string): boolean {
  const db = load();
  const idx = db.meals.findIndex((m) => m.id === mealId && m.userId === userId);
  if (idx < 0) return false;
  db.meals.splice(idx, 1);
  save(db);
  return true;
}

/**
 * Пересчёт записи под другую порцию. Оценка по фото всегда приблизительна, и
 * ошибается она чаще всего в размере порции, а не в составе блюда: состав модель
 * видит, вес — нет. Поэтому правится множитель, а КБЖУ пересчитываются
 * пропорционально: так соотношение белка, жира и углеводов остаётся тем, что
 * определено по блюду, и человеку не нужно вводить четыре числа заново.
 */
export function scaleMeal(userId: number, mealId: string, factor: number): MealEntry | null {
  const db = load();
  const row = db.meals.find((m) => m.id === mealId && m.userId === userId);
  if (!row) return null;
  const k = Math.max(0.2, Math.min(5, factor));
  row.kcal = Math.round(row.kcal * k);
  row.proteinG = Math.round(row.proteinG * k);
  row.fatG = Math.round(row.fatG * k);
  row.carbsG = Math.round(row.carbsG * k);
  save(db);
  return row;
}

export function getMeals(userId: number, date?: string): MealEntry[] {
  const db = load();
  let rows = db.meals.filter((m) => m.userId === userId);
  if (date) rows = rows.filter((m) => m.date === date);
  return rows;
}

export function getMealsForDays(userId: number, days = 7): MealEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const from = cutoff.toISOString().slice(0, 10);
  return load()
    .meals.filter((m) => m.userId === userId && m.date >= from)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/**
 * Серия: сколько дней подряд, считая назад от переданного дня, есть хотя бы одна
 * запись еды. Текущий день не обрывает серию, пока он не закончился: пустое утро
 * не должно обнулять двадцать дней работы, поэтому отсчёт начинается со вчера,
 * а сегодня только продлевает результат.
 */
export function mealStreak(userId: number, todayStr: string): { days: number; last7: boolean[] } {
  const filled = new Set(load().meals.filter((m) => m.userId === userId).map((m) => m.date));
  const shift = (base: string, back: number): string => {
    const d = new Date(base + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
  };

  let days = filled.has(todayStr) ? 1 : 0;
  for (let back = 1; back <= 400; back++) {
    if (!filled.has(shift(todayStr, back))) break;
    days++;
  }

  const last7: boolean[] = [];
  for (let back = 6; back >= 0; back--) last7.push(filled.has(shift(todayStr, back)));
  return { days, last7 };
}

/**
 * Частые блюда: то, что человек уже вносил, чтобы повтор занимал одно касание,
 * а не новое распознавание. КБЖУ берём из самой свежей записи с этим названием:
 * порции у одного и того же блюда меняются, и последняя оценка ближе к правде,
 * чем средняя по месяцу.
 */
export function frequentMeals(
  userId: number,
  todayStr: string,
  daysBack = 30,
  limit = 6
): { name: string; kcal: number; proteinG: number; fatG: number; carbsG: number; count: number }[] {
  const from = new Date(todayStr + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - (daysBack - 1));
  const since = from.toISOString().slice(0, 10);

  const rows = load()
    .meals.filter((m) => m.userId === userId && m.date >= since)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const byName = new Map<string, { name: string; kcal: number; proteinG: number; fatG: number; carbsG: number; count: number }>();
  for (const m of rows) {
    const key = m.name.trim().toLowerCase();
    const seen = byName.get(key);
    if (seen) {
      seen.count++;
      seen.name = m.name;
      seen.kcal = m.kcal;
      seen.proteinG = m.proteinG;
      seen.fatG = m.fatG;
      seen.carbsG = m.carbsG;
    } else {
      byName.set(key, {
        name: m.name,
        kcal: m.kcal,
        proteinG: m.proteinG,
        fatG: m.fatG,
        carbsG: m.carbsG,
        count: 1,
      });
    }
  }

  return [...byName.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function mealTotals(userId: number, date: string) {
  const rows = getMeals(userId, date);
  return rows.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal,
      proteinG: t.proteinG + m.proteinG,
      fatG: t.fatG + m.fatG,
      carbsG: t.carbsG + m.carbsG,
      count: t.count + 1,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, count: 0 }
  );
}

// ── Доступ: пробный период / лимиты ─────────────────────────────────────────
// Пробная версия включена по умолчанию: недельного лимита фото нет ни у кого.
// Счётчики при этом продолжают писаться — на них будет опираться платный вход.
// Дневная планка остаётся в любом режиме, и она не про деньги: ключи Gemini имеют
// суточную квоту, один пользователь в цикле выжигает её для всех остальных.
const TRIAL_MODE = process.env.TRIAL_MODE !== "0" && process.env.TRIAL_MODE !== "false";
const FREE_PHOTO_WEEK = Number(process.env.MEAL_PHOTO_WEEK_LIMIT ?? 5);
const PHOTO_DAY_CAP = Number(process.env.MEAL_PHOTO_DAY_CAP ?? 40);
const MEAL_PHOTO_UNLIMITED =
  TRIAL_MODE ||
  process.env.MEAL_PHOTO_UNLIMITED === "1" ||
  process.env.MEAL_PHOTO_UNLIMITED === "true" ||
  FREE_PHOTO_WEEK <= 0;

export function trialMode(): boolean {
  return TRIAL_MODE;
}

export function mealPhotoUnlimited(): boolean {
  return MEAL_PHOTO_UNLIMITED;
}

export function freePhotoWeek(): number {
  return FREE_PHOTO_WEEK;
}

export function photoDayCap(): number {
  return PHOTO_DAY_CAP;
}

function ownerIds(): number[] {
  const raw = process.env.ADMIN_ID ?? process.env.OWNER_ID ?? "";
  return raw
    .split(/[,\s;]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Владелец бота — безлимит фото без Premium. */
export function isOwner(chatId: number): boolean {
  if (ownerIds().includes(chatId)) return true;
  const users = load().users;
  return users.length > 0 && users[0].chatId === chatId;
}

export function isPremium(chatId: number): boolean {
  if (isOwner(chatId)) return true;
  const u = getUser(chatId);
  if (!u?.premiumUntil) return false;
  return u.premiumUntil >= new Date().toISOString().slice(0, 10);
}

export type PhotoGate = { ok: true } | { ok: false; reason: "week" | "day"; limit: number };

/**
 * Можно ли сделать фото-анализ еды.
 * В пробном режиме недельного лимита нет; дневная планка защищает квоту ключей.
 */
export function photoGate(chatId: number, weekKey: string, dayKey: string): PhotoGate {
  const u = getUser(chatId);
  const owner = isOwner(chatId);

  const usedDay = u?.photoDayKey === dayKey ? u?.photoDayCount ?? 0 : 0;
  if (PHOTO_DAY_CAP > 0 && !owner && usedDay >= PHOTO_DAY_CAP) {
    return { ok: false, reason: "day", limit: PHOTO_DAY_CAP };
  }

  if (MEAL_PHOTO_UNLIMITED || owner || isPremium(chatId)) return { ok: true };
  if (!u || u.photoWeekKey !== weekKey) return { ok: true };
  if ((u.photoCount ?? 0) < FREE_PHOTO_WEEK) return { ok: true };
  return { ok: false, reason: "week", limit: FREE_PHOTO_WEEK };
}

/** Счётчики пишутся всем, включая владельца: это учёт расхода квоты, а не лимит. */
export function bumpPhotoCount(chatId: number, weekKey: string, dayKey: string) {
  const db = load();
  const u = db.users.find((x) => x.chatId === chatId);
  if (!u) return;
  if (u.photoWeekKey !== weekKey) {
    u.photoWeekKey = weekKey;
    u.photoCount = 1;
  } else {
    u.photoCount = (u.photoCount ?? 0) + 1;
  }
  if (u.photoDayKey !== dayKey) {
    u.photoDayKey = dayKey;
    u.photoDayCount = 1;
  } else {
    u.photoDayCount = (u.photoDayCount ?? 0) + 1;
  }
  save(db);
}

export function grantPremium(chatId: number, days: number) {
  const db = load();
  const u = db.users.find((x) => x.chatId === chatId);
  if (!u) return;
  const base = u.premiumUntil && u.premiumUntil >= new Date().toISOString().slice(0, 10)
    ? new Date(u.premiumUntil + "T00:00:00Z")
    : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  u.premiumUntil = base.toISOString().slice(0, 10);
  save(db);
}

export function setReminder(chatId: number, days: number[] | null, hour: number | null) {
  const db = load();
  const u = db.users.find((x) => x.chatId === chatId);
  if (!u) return;
  if (days === null) {
    delete u.reminderDays;
    delete u.reminderHour;
  } else {
    u.reminderDays = days;
    if (hour !== null) u.reminderHour = hour;
  }
  u.remindersMissed = 0;
  u.remindersPaused = false;
  delete u.lastReminderDate;
  save(db);
}

// ── Канал: автовыкладка постов ─────────────────────────────────────────────

export function getChannelState(): { posted: { postId: string; date: string }[] } {
  const db = load();
  return { posted: db.channelPosted ?? [] };
}

export function markChannelPosted(postId: string, date: string) {
  const db = load();
  if (!db.channelPosted) db.channelPosted = [];
  if (db.channelPosted.some((p) => p.postId === postId && p.date === date)) return;
  db.channelPosted.push({ postId, date });
  save(db);
}

export function saveChannelLastPublish(postId: string, messageIds: number[], date: string) {
  const db = load();
  db.channelLastPublish = { postId, messageIds, date };
  save(db);
}

export function getChannelLastPublish(): { postId: string; messageIds: number[]; date: string } | undefined {
  return load().channelLastPublish;
}
