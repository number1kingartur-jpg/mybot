/**
 * Норма от факта: расход по балансу энергии и сдвиг цели.
 * Цифры подобраны так, чтобы формула и факт расходились явно.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join("webapp", "js", "engine.js"), "utf8"), sandbox);
const KM = sandbox.KM;

let failed = 0;
function check(title, cond, detail) {
  if (cond) return;
  failed++;
  console.error(`FAIL: ${title}${detail ? ": " + detail : ""}`);
}

const profile = {
  sex: "m",
  age: 34,
  heightCm: 178,
  weightKg: 83,
  activity: "mid",
  goal: "cut",
};
const formula = KM.calcMacros(profile);

const meals = [];
const weights = [];
for (let i = 20; i >= 0; i--) {
  const d = new Date("2026-08-20T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - i);
  const date = d.toISOString().slice(0, 10);
  if (i <= 16) meals.push({ date, kcal: 2200 });
  if (i === 16 || i === 12 || i === 8 || i === 4 || i === 0) {
    weights.push({ date, weightKg: 84 - (16 - i) * 0.05 });
  }
}

const exp = KM.estimateExpenditure(meals, weights, formula.tdee);
check("расход посчитан", Boolean(exp));
if (exp) {
  check("расход выше приёма при снижении веса", exp.tdee > exp.intakeAvg, String(exp.tdee));
  check(
    "сдвиг от формулы не больше 400",
    Math.abs(exp.tdee - formula.tdee) <= 400,
    String(exp.tdee - formula.tdee)
  );
}

const target = KM.adaptiveTarget(profile, meals, weights);
check("цель от факта", target.source === "intake", target.source);
check("на сушке цель ниже расхода", target.kcal < target.tdee, String(target.kcal));

const empty = KM.adaptiveTarget(profile, [], []);
check("без факта остаётся формула", empty.source === "formula", empty.source);
check("формула совпадает с calcMacros", empty.kcal === formula.kcal, String(empty.kcal));

const fewMeals = KM.estimateExpenditure([{ date: "2026-08-19", kcal: 2000 }], weights, formula.tdee);
check("мало дней еды: расхода нет", fewMeals === null);

if (failed) {
  console.error(`FAIL: ${failed}`);
  process.exit(1);
}
console.log("OK: adaptive target");
