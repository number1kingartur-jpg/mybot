import fs from "fs";
import path from "path";

// Railway Volume mounts at /data; locally falls back to project root
const DB_PATH = process.env.DATA_PATH ?? path.join(__dirname, "..", "data.json");

export interface WorkoutEntry {
  id: string;
  date: string;        // YYYY-MM-DD
  exercise: string;
  sets: number;
  reps: number;
  weightKg: number;
  notes?: string;
}

export interface BodyweightEntry {
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

export interface Program {
  id: string;
  createdAt: string;
  model: string;
  goal: string;
  oneRmKg: number;
  weeks: number;
  daysPerWeek: number;
  weeksData: WeekPlan[];
  peakWeek: number;
  deloadWeek: number;
  currentWeek: number;
  currentDay: number;
  active: boolean;
}

export interface UserRecord {
  chatId: number;
  firstName: string;
  registeredAt: string;
}

interface DB {
  workouts: WorkoutEntry[];
  programs: Program[];
  bodyweight: BodyweightEntry[];
  users: UserRecord[];
}

function load(): DB {
  const empty: DB = { workouts: [], programs: [], bodyweight: [], users: [] };
  if (!fs.existsSync(DB_PATH)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as Partial<DB>;
    return {
      workouts: parsed.workouts ?? [],
      programs: parsed.programs ?? [],
      bodyweight: parsed.bodyweight ?? [],
      users: parsed.users ?? [],
    };
  } catch {
    return empty;
  }
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

export function getWorkouts(exercise?: string, limit = 20): WorkoutEntry[] {
  const db = load();
  let rows = db.workouts;
  if (exercise) rows = rows.filter((w) => w.exercise.toLowerCase() === exercise.toLowerCase());
  return rows.slice(-limit);
}

export function getAllWorkouts(): WorkoutEntry[] {
  return load().workouts;
}

export function getExercises(): string[] {
  const db = load();
  const set = new Set(db.workouts.map((w) => w.exercise));
  return [...set].sort();
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
export function checkPr(exercise: string, weightKg: number, reps: number): PrCheck {
  const db = load();
  const prior = db.workouts.filter(
    (w) => w.exercise.toLowerCase() === exercise.toLowerCase()
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
  db.programs = db.programs.map((pr) => ({ ...pr, active: false }));
  const row: Program = { id: uid(), createdAt: new Date().toISOString(), ...p };
  db.programs.push(row);
  save(db);
  return row;
}

export function getActiveProgram(): Program | null {
  const db = load();
  return db.programs.find((p) => p.active) ?? null;
}

export function deactivatePrograms() {
  const db = load();
  db.programs = db.programs.map((p) => ({ ...p, active: false }));
  save(db);
}

export function advanceProgramDay(): Program | null {
  const db = load();
  const idx = db.programs.findIndex((p) => p.active);
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
export function addBodyweight(weightKg: number): BodyweightEntry {
  const db = load();
  const date = new Date().toISOString().slice(0, 10);
  // одна запись в день — перезаписываем
  db.bodyweight = db.bodyweight.filter((b) => b.date !== date);
  const row: BodyweightEntry = { date, weightKg };
  db.bodyweight.push(row);
  db.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
  save(db);
  return row;
}

export function getBodyweight(limit = 30): BodyweightEntry[] {
  return load().bodyweight.slice(-limit);
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
