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

export interface SessionPlan {
  day: number;
  focus: string;
  intensity: number;
  sets: number;
  reps: number;
  weightKg: number;
  rpe: number;
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

interface DB {
  workouts: WorkoutEntry[];
  programs: Program[];
}

function load(): DB {
  if (!fs.existsSync(DB_PATH)) return { workouts: [], programs: [] };
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as DB;
  } catch {
    return { workouts: [], programs: [] };
  }
}

function save(db: DB) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

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

export function getExercises(): string[] {
  const db = load();
  const set = new Set(db.workouts.map((w) => w.exercise));
  return [...set].sort();
}

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
