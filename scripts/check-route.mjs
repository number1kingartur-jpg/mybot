/**
 * Маршрут дня: четыре пункта закрываются по одним правилам.
 * Логика в engine.js, этот скрипт держит пороги, чтобы «день закрыт»
 * не начал считаться от кофе или от веса из анкеты.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join("webapp", "js", "engine.js"), "utf8"), sandbox);
const route = sandbox.KM.dayRoute;
if (typeof route !== "function") {
  console.error("FAIL: KM.dayRoute нет в engine.js");
  process.exit(1);
}

let failed = 0;
function check(title, cond, detail) {
  if (cond) return;
  failed++;
  console.error(`FAIL: ${title}${detail ? ": " + detail : ""}`);
}

const empty = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: { weightKg: 83, fromDiary: false },
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 0,
});
check("пустой день: ничего не закрыто", empty.done === 0, String(empty.done));
check("пустой день не закрыт", empty.closed === false);

const coffee = route({
  eatenKcal: 80,
  eatenCount: 1,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: null,
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 0,
});
check("кофе не закрывает еду", coffee.foodOn === false);

const breakfast = route({
  eatenKcal: 867,
  eatenCount: 1,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: null,
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 0,
});
check("завтрак 28% ещё открыт", breakfast.foodOn === false);

const half = route({
  eatenKcal: 1300,
  eatenCount: 2,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: null,
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 0,
});
check("40% нормы закрывает еду", half.foodOn === true);

const water = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 2900,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: null,
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 0,
});
check("вода на норме закрыта", water.waterOn === true);
check("вода ниже нормы не считается", water.foodOn === false);

const rest = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: true,
  lastWeight: null,
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 0,
});
check("отдых закрывает движение", rest.moveOn === true);

const trained = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: true,
  restToday: true,
  lastWeight: null,
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 0,
});
check("тренировка тоже закрывает движение", trained.moveOn === true);

const anketa = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: { weightKg: 83, date: "2026-08-19", fromDiary: true, source: "profile" },
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 1,
});
check("вес из анкеты не закрывает пункт", anketa.weightOn === false);

const legacySeed = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: { weightKg: 83, date: "2026-08-19", fromDiary: true, source: "user" },
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 1,
});
check("единственная запись = вес анкеты: ещё не взвешивался", legacySeed.weightOn === false);

const weighed = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: { weightKg: 83.2, date: "2026-08-19", fromDiary: true, source: "user" },
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 2,
});
check("настоящее взвешивание закрывает вес", weighed.weightOn === true);

const stale = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: { weightKg: 83.2, date: "2026-08-16", fromDiary: true, source: "user" },
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 2,
});
check("вес старше двух дней снова открыт", stale.weightOn === false);

const recent = route({
  eatenKcal: 0,
  eatenCount: 0,
  targetKcal: 3034,
  waterMl: 0,
  waterTargetMl: 2900,
  trainedToday: false,
  restToday: false,
  lastWeight: { weightKg: 83.2, date: "2026-08-17", fromDiary: true, source: "user" },
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 2,
});
check("вес два дня назад ещё закрыт", recent.weightOn === true);

const done = route({
  eatenKcal: 2391,
  eatenCount: 5,
  targetKcal: 3034,
  waterMl: 2900,
  waterTargetMl: 2900,
  trainedToday: true,
  restToday: false,
  lastWeight: { weightKg: 83.2, date: "2026-08-19", fromDiary: true, source: "user" },
  today: "2026-08-19",
  profileKg: 83,
  weightCount: 2,
});
check("полный день: 4 из 4", done.closed === true && done.done === 4, String(done.done));

if (failed) {
  console.error(`check-route: провалов ${failed}`);
  process.exit(1);
}
console.log("check-route: маршрут дня сходится (14 проверок)");
