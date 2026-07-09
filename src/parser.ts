// Парсер свободного текста тренировки.
// Понимает: «присед 100 5х5», «жим 3x8x60», «становая 140кг»,
// «жим 1 подход 20 кг и 4 подхода по 10 раз 30 кг», несколько упражнений с новой строки.

export interface SetGroup {
  sets: number;
  reps: number;
  weightKg: number;
}

export interface ParsedExercise {
  exercise: string;
  groups: SetGroup[];
}

const X = /[x×хХ]/; // латинская x, знак умножения, русская х

function normNum(s: string): number {
  return parseFloat(s.replace(",", "."));
}

function validated(sets: number, reps: number, weight: number): SetGroup | null {
  if (sets < 1 || sets > 30 || reps < 1 || reps > 100 || weight < 0 || weight > 600) return null;
  return { sets, reps, weightKg: weight };
}

/** Один сегмент = одна группа подходов («4 подхода по 10 раз 30 кг» или «5х5 100»). */
function parseSegment(segRaw: string): SetGroup | null {
  // «3 8 100» — легаси-формат: подходы повторения вес
  const bare3 = segRaw.trim().match(/^(\d+)\s+(\d+)\s+(\d+(?:[.,]\d+)?)$/);
  if (bare3) return validated(parseInt(bare3[1]), parseInt(bare3[2]), normNum(bare3[3]));

  // «100 5» — вес и повторения (если первое число большое), иначе подходы×повторения
  const bare2 = segRaw.trim().match(/^(\d+(?:[.,]\d+)?)\s+(\d+)$/);
  if (bare2) {
    const a = normNum(bare2[1]);
    const b = parseInt(bare2[2]);
    return a > 12 ? validated(1, b, a) : validated(Math.round(a), b, 0);
  }

  let seg = " " + segRaw.toLowerCase().trim() + " ";
  let sets: number | undefined;
  let reps: number | undefined;
  let weight: number | undefined;

  // «3x8x60» — подходы × повторения × вес
  const triple = seg.match(new RegExp(`(\\d+)\\s*${X.source}\\s*(\\d+)\\s*${X.source}\\s*(\\d+(?:[.,]\\d+)?)`));
  if (triple) {
    sets = parseInt(triple[1]);
    reps = parseInt(triple[2]);
    weight = normNum(triple[3]);
    seg = seg.replace(triple[0], " ");
  }

  // «30 кг» / «82.5кг» — явный вес
  if (weight === undefined) {
    const w = seg.match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)\b/);
    if (w) {
      weight = normNum(w[1]);
      seg = seg.replace(w[0], " ");
    }
  }

  // «4 подхода» / «1 подход»
  const st = seg.match(/(\d+)\s*подход\w*/);
  if (st) {
    sets = parseInt(st[1]);
    seg = seg.replace(st[0], " ");
  }

  // «по 10 раз» / «10 повторений» / «на 30 раз»
  const rp = seg.match(/(?:по|на)?\s*(\d+)\s*(?:раз\w*|повтор\w*|повт)\b/);
  if (rp) {
    reps = parseInt(rp[1]);
    seg = seg.replace(rp[0], " ");
  }

  // Пара «AхB»: если вес уже известен — это подходы×повторения;
  // если нет — эвристика: число >12 первым — это «вес×повторения» (100х5)
  const pair = seg.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${X.source}\\s*(\\d+)`));
  if (pair && (sets === undefined || reps === undefined)) {
    const a = normNum(pair[1]);
    const b = parseInt(pair[2]);
    if (weight === undefined && a > 12) {
      weight = a;
      reps = reps ?? b;
      sets = sets ?? 1;
    } else {
      sets = sets ?? Math.round(a);
      reps = reps ?? b;
    }
    seg = seg.replace(pair[0], " ");
  }

  // Оставшиеся одиночные числа — по недостающим слотам: вес → повторения → подходы
  const rest = [...seg.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => normNum(m[1]));
  for (const n of rest) {
    if (weight === undefined && (n > 12 || Number.isInteger(n) === false)) { weight = n; continue; }
    if (reps === undefined) { reps = Math.round(n); continue; }
    if (weight === undefined) { weight = n; continue; }
    if (sets === undefined) { sets = Math.round(n); continue; }
  }

  if (sets === undefined && reps === undefined && weight === undefined) return null;

  // «становая 140» → одиночка; без веса → собственный вес (подтягивания 4х10)
  return validated(sets ?? 1, reps ?? 1, weight ?? 0);
}

/** Разбор группы подходов без имени упражнения (для пошагового режима). */
export function parseGroups(text: string): SetGroup[] {
  // \b не работает с кириллицей — «и»/«потом» отделяем пробелами
  const segments = text.split(/\s*(?:,|\+|;)\s*|\s+(?:и|потом|затем)\s+/i).filter(Boolean);
  const out: SetGroup[] = [];
  for (const seg of segments) {
    const g = parseSegment(seg);
    if (g) out.push(g);
  }
  return out;
}

/** Полный разбор: строки → упражнения, сегменты → группы подходов. */
export function parseWorkout(text: string): ParsedExercise[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedExercise[] = [];

  for (const line of lines) {
    // имя = всё до первой цифры
    const m = line.match(/^([^\d]+?)[\s:—-]*(\d.*)$/s);
    if (!m) continue;
    let name = m[1].trim().replace(/[.,:;!—-]+$/, "").trim();
    if (!name || name.length > 40) continue;
    // нормализуем: первая буква заглавная
    name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

    const groups = parseGroups(m[2]);
    if (groups.length > 0) out.push({ exercise: name, groups });
  }

  return out;
}
