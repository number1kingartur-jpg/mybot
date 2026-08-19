/**
 * Паритет готовых тренировок: бот и приложение обязаны считать одинаково.
 *
 * Планы лежат в двух местах: `src/simple.ts` и `webapp/js/plans.js`. Это ручной
 * порт, значит он разъезжается. Скрипт сравнивает имена, технику, облегчение,
 * усложнение и посчитанную дозировку по всем комбинациям место × план × цель.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  SIMPLE_PLANS,
  TRAIN_PLANS,
  plansFor,
  schemeFor,
  restFor,
  doseLabel,
  progressionRule,
  enduranceNote,
  SEX_NOTE,
  exerciseHarder,
  exerciseSlug,
} from "../dist/simple.js";

let failed = 0;

function check(title, cond, detail) {
  if (cond) return;
  failed++;
  console.error(`FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join("webapp", "js", "plans.js"), "utf8") + "\nthis.KM_PLANS = KM_PLANS;",
  sandbox
);
const APP = sandbox.KM_PLANS;
check("приложение отдаёт планы", Boolean(APP && APP.plans && APP.scheme && APP.rule));
if (!APP) process.exit(1);

const PLACES = ["home", "gym"];
const LEVELS = ["start", "train"];
const GOALS = ["cut", "maint", "bulk"];

check("SEX_NOTE совпадает", SEX_NOTE === APP.sexNote, `бот «${SEX_NOTE}»`);
check("приложение отдаёт forPlace", typeof APP.forPlace === "function");

for (const place of PLACES) {
  const botPlans = SIMPLE_PLANS[place];
  const appPlans = APP.plans[place];
  check(`${place}: столько же планов`, botPlans.length === appPlans.length, `${botPlans.length} vs ${appPlans.length}`);

  botPlans.forEach((plan, pi) => {
    const mine = appPlans[pi] || { label: "", items: [] };
    check(`${place}/${plan.label}: метка`, plan.label === mine.label, mine.label);
    check(`${place}/${plan.label}: упражнений`, plan.items.length === mine.items.length, String(mine.items.length));

    plan.items.forEach((e, i) => {
      const a = mine.items[i] || {};
      const tag = `${place}/${plan.label}/${i} ${e.name}`;
      check(`${tag}: имя`, e.name === a.name, a.name);
      check(`${tag}: коротко`, e.short === a.short, a.short);
      check(`${tag}: облегчение`, e.easier === a.easier);
      check(`${tag}: шаги`, e.steps.join("\n") === (a.steps || []).join("\n"));
      check(`${tag}: ошибки`, e.mistakes.join("\n") === (a.mistakes || []).join("\n"));

      const harder = exerciseHarder(e);
      check(`${tag}: есть усложнение`, harder.length > 0);
      check(`${tag}: усложнение`, harder === APP.harder(a), APP.harder(a));

      for (const goal of GOALS) {
        const want = schemeFor(e, goal);
        const got = APP.scheme(a, goal);
        check(`${tag}/${goal}: схема`, want === got, `бот «${want}», приложение «${got}»`);
      }
    });
  });

  for (const goal of GOALS) {
    check(
      `${place}/${goal}: правило`,
      progressionRule(place, goal) === APP.rule(place, goal),
      APP.rule(place, goal)
    );
    check(`${place}/${goal}: отдых`, restFor(goal) === APP.rest(goal), APP.rest(goal));
    check(`${place}/${goal}: выносливость`, enduranceNote(goal) === APP.endurance(goal));
    check(`${place}/${goal}: подпись цели`, doseLabel(goal) === APP.doseLabel(goal));
  }
}

for (const level of LEVELS) {
  for (const place of PLACES) {
    const bot = plansFor(place, level);
    const app = APP.forPlace(place, level);
    check(`${level}/${place}: столько же планов`, bot.length === app.length);
    bot.forEach((plan, pi) => {
      plan.items.forEach((e, i) => {
        const a = app[pi].items[i];
        const tag = `${level}/${place}/${plan.label}/${e.name}`;
        check(`${tag}: имя`, e.name === a.name, a.name);
        check(`${tag}: есть усложнение`, exerciseHarder(e).length > 0);
        check(`${tag}: усложнение`, exerciseHarder(e) === APP.harder(a));
        for (const goal of GOALS) {
          check(`${tag}/${goal}: схема`, schemeFor(e, goal) === APP.scheme(a, goal));
        }
      });
    });
  }
}

check(
  "высокая ступень дома без стула",
  TRAIN_PLANS.home[0].items[0].name === "Приседания до параллели",
  TRAIN_PLANS.home[0].items[0].name
);
check(
  "зал: ступени разные",
  plansFor("gym", "start")[0].items[0].name !== plansFor("gym", "train")[0].items[0].name,
  plansFor("gym", "train")[0].items[0].name
);
check(
  "дом: ступени разные",
  plansFor("home", "start")[0].items[0].name !== plansFor("home", "train")[0].items[0].name,
  plansFor("home", "train")[0].items[0].name
);

const squat = SIMPLE_PLANS.home[0].items[0];
check("набор: 4 подхода", schemeFor(squat, "bulk").startsWith("4 подхода"), schemeFor(squat, "bulk"));
check("снижение: 3 подхода", schemeFor(squat, "cut").startsWith("3 подхода"), schemeFor(squat, "cut"));
check("набор: отдых 90–120", restFor("bulk") === "90–120 секунд");
check("снижение: отдых 60–90", restFor("cut") === "60–90 секунд");
check(
  "снижение в зале: вес держим",
  progressionRule("gym", "cut").includes("вес на снаряде держи"),
  progressionRule("gym", "cut")
);

const EX_DIR = path.join("webapp", "img", "ex");
const seenSlug = new Set();
for (const level of LEVELS) {
  for (const place of PLACES) {
    for (const plan of plansFor(place, level)) {
      for (const e of plan.items) {
        const slug = exerciseSlug(e);
        check(`${e.name}: слаг`, slug === APP.slug(e), `бот ${slug}, приложение ${APP.slug(e)}`);
        if (seenSlug.has(slug)) continue;
        seenSlug.add(slug);
        check(`${e.name}: картинка`, fs.existsSync(path.join(EX_DIR, `${slug}.webp`)), slug);
      }
    }
  }
}

if (failed) {
  console.error(`check-plans: ${failed} расхождений`);
  process.exit(1);
}
console.log("check-plans: бот и приложение считают одинаково, цель меняет дозировку.");
