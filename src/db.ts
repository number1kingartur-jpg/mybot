import fs from "fs";
import path from "path";

// Railway Volume mounts at /data; locally falls back to project root
const DB_PATH = process.env.DATA_PATH ?? path.join(__dirname, "..", "data.json");

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
  simpleDiff?: number;      // накопленная сложность по фидбэку: >0 легко, <0 тяжело
  lastReminderDate?: string;   // когда отправлено последнее напоминание (YYYY-MM-DD)
  remindersMissed?: number;    // сколько напоминаний подряд проигнорировано
  remindersPaused?: boolean;   // авто-пауза после 3 игноров
  premiumUntil?: string;       // ISO-дата окончания подписки
  photoWeekKey?: string;       // неделя для лимита бесплатных фото-анализов
  photoCount?: number;         // сколько фото-анализов за текущую неделю
  ref?: string;                // источник: kingmode, channel, …
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

interface DB {
  workouts: WorkoutEntry[];
  programs: Program[];
  bodyweight: BodyweightEntry[];
  users: UserRecord[];
  challenges: Challenge[];
  meals: MealEntry[];
  channelPosted?: { postId: string; date: string }[];
}

function load(): DB {
  const empty: DB = { workouts: [], programs: [], bodyweight: [], users: [], challenges: [], meals: [], channelPosted: [] };
  if (!fs.existsSync(DB_PATH)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as Partial<DB>;
    const db: DB = {
      workouts: parsed.workouts ?? [],
      programs: parsed.programs ?? [],
      bodyweight: parsed.bodyweight ?? [],
      users: parsed.users ?? [],
      challenges: parsed.challenges ?? [],
      meals: parsed.meals ?? [],
      channelPosted: parsed.channelPosted ?? [],
    };
    migrate(db);
    return db;
  } catch {
    return empty;
  }
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

function save(db: DB) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
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
export function addBodyweight(userId: number, weightKg: number): BodyweightEntry {
  const db = load();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  // одна запись в день — перезаписываем
  db.bodyweight = db.bodyweight.filter((b) => !(b.userId === userId && b.date === date));
  const row: BodyweightEntry = { userId, date, weightKg };
  db.bodyweight.push(row);
  db.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
  save(db);
  return row;
}

export function getBodyweight(userId: number, limit = 30): BodyweightEntry[] {
  return load().bodyweight.filter((b) => b.userId === userId).slice(-limit);
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

// ── Premium / лимиты ────────────────────────────────────────────────────────
const FREE_PHOTO_WEEK = Number(process.env.MEAL_PHOTO_WEEK_LIMIT ?? 5);
const MEAL_PHOTO_UNLIMITED =
  process.env.MEAL_PHOTO_UNLIMITED === "1" ||
  process.env.MEAL_PHOTO_UNLIMITED === "true" ||
  FREE_PHOTO_WEEK <= 0;

export function mealPhotoUnlimited(): boolean {
  return MEAL_PHOTO_UNLIMITED;
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

/** Можно ли сделать фото-анализ еды (5/нед бесплатно, безлимит владельцу и Premium). */
export function canAnalyzePhoto(chatId: number, weekKey: string): boolean {
  if (MEAL_PHOTO_UNLIMITED || isOwner(chatId) || isPremium(chatId)) return true;
  const u = getUser(chatId);
  if (!u) return true;
  if (u.photoWeekKey !== weekKey) return true;
  return (u.photoCount ?? 0) < FREE_PHOTO_WEEK;
}

export function bumpPhotoCount(chatId: number, weekKey: string) {
  if (isOwner(chatId)) return;
  const db = load();
  const u = db.users.find((x) => x.chatId === chatId);
  if (!u) return;
  if (u.photoWeekKey !== weekKey) {
    u.photoWeekKey = weekKey;
    u.photoCount = 1;
  } else {
    u.photoCount = (u.photoCount ?? 0) + 1;
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
  db.channelPosted.push({ postId, date });
  save(db);
}
