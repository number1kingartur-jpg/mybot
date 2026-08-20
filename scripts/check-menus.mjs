/**
 * Проверка готовых меню: бот и приложение обязаны считать одинаково.
 *
 * Состав меню лежит в двух местах — `src/meals.ts` для бота и
 * `webapp/js/menus.js` для приложения. Это ручной порт, значит он разъезжается.
 * Скрипт сравнивает не только состав, но и посчитанные цифры: вес позиции, вес
 * каждой замены, КБЖУ приёма и итог дня. Плюс следит за тем, ради чего всё это
 * затевалось: у каждого продукта меню должна быть картинка в папке.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { FOODS, foodSlug } from "../dist/foods.js";
import { MENUS, MEAL_KEYS, GOAL_KCAL, dayMenu, measureG } from "../dist/meals.js";
import { calcMacros } from "../dist/nutrition.js";

let failed = 0;

function check(title, cond, detail) {
  if (cond) return;
  failed++;
  console.error(`FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
}

/* ── Приложение: модуль пишется под браузер, здесь ему подставляется window ── */

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join("webapp", "js", "menus.js"), "utf8"), sandbox);
const APP = sandbox.window.KM_MENUS;

check("приложение отдаёт меню", Boolean(APP && APP.day && APP.menus && APP.foods));
if (!APP) process.exit(1);

const GOALS = ["cut", "maint", "bulk"];
const MENU_IDS = Object.keys(MENUS);

/* ── Состав: один в один с ботом ───────────────────────────────────────────── */

check("наборы меню совпадают", MENU_IDS.join() === Object.keys(APP.menus).join(), Object.keys(APP.menus).join());

const used = new Set();

for (const menuId of MENU_IDS) {
  for (const key of MEAL_KEYS) {
    const bot = MENUS[menuId].meals[key];
    const app = APP.menus[menuId].meals[key];
    check(`${menuId}/${key}: столько же позиций`, bot.length === app.length, `бот ${bot.length}, приложение ${app.length}`);

    bot.forEach((def, i) => {
      const mine = app[i] || {};
      check(`${menuId}/${key}/${i}: продукт`, def.food === mine.food, `бот ${def.food}, приложение ${mine.food}`);
      check(`${menuId}/${key}/${i}: вес порции`, def.g === mine.g, `бот ${def.g}, приложение ${mine.g}`);
      check(`${menuId}/${key}/${i}: замены`, def.alt.join() === (mine.alt || []).join(), `бот ${def.alt.join()}, приложение ${(mine.alt || []).join()}`);

      check(`${menuId}/${key}/${i}: три замены`, def.alt.length === 3, String(def.alt.length));
      check(`${menuId}/${key}/${i}: замены не повторяются`, new Set(def.alt).size === 3, def.alt.join());
      check(`${menuId}/${key}/${i}: замена не равна позиции`, !def.alt.includes(def.food), def.food);

      used.add(def.food);
      for (const name of def.alt) used.add(name);
    });
  }
}

/* ── Цифры продуктов: только из справочника ────────────────────────────────── */

const UNIT_FIELD = { "шт": "pieceG", "ч.л.": "tspG", "ст.л.": "tbspG", "порция": "scoopG" };

for (const name of used) {
  const food = FOODS.find((f) => f.name === name);
  check(`${name}: есть в справочнике`, Boolean(food));
  if (!food) continue;

  const mine = APP.foods[name];
  check(`${name}: есть в таблице приложения`, Boolean(mine));
  if (!mine) continue;

  const want = [food.kcal100, food.p100, food.f100, food.c100];
  check(`${name}: КБЖУ на 100 г`, want.join() === mine.n.join(), `справочник ${want.join()}, приложение ${mine.n.join()}`);
  check(`${name}: обычная порция`, food.defaultG === mine.def, `справочник ${food.defaultG}, приложение ${mine.def}`);

  const piece = measureG(name);
  check(`${name}: вес меры`, (piece || null) === (mine.piece || null), `бот ${piece}, приложение ${mine.piece}`);
  if (mine.piece) {
    const field = UNIT_FIELD[mine.unit || "шт"];
    check(`${name}: мера «${mine.unit || "шт"}» есть в справочнике`, food[field] === mine.piece, `${field}=${food[field]}, в меню ${mine.piece}`);
  }

  check(`${name}: слаг картинки`, foodSlug(name) === APP.slugOf(name), `бот ${foodSlug(name)}, приложение ${APP.slugOf(name)}`);
}

check("3 яйца: кадр трёх", APP.slugOf("Яйца", 165) === "yayca-3", APP.slugOf("Яйца", 165));
check("2 яйца: кадр двух", APP.slugOf("Яйца", 110) === "yayca-2", APP.slugOf("Яйца", 110));
check("банан 1 шт: один в кадре", APP.slugOf("Банан", 120) === "banan-1", APP.slugOf("Банан", 120));
check("хлеб 30 г: один ломоть", APP.slugOf("Хлеб", 30) === "hleb-1");
check("сырники 120 г: два в кадре", APP.slugOf("Сырники жареные", 120) === "syrniki-zharenye-2");

/* ── Картинки: они и есть смысл затеи ──────────────────────────────────────── */

const dir = path.join("webapp", "img", "food");
const have = new Set(fs.readdirSync(dir).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)));
for (const name of used) {
  check(`${name}: картинка на месте`, have.has(foodSlug(name)), `нет файла ${foodSlug(name)}.webp`);
}

/* ── Посчитанное: вес, КБЖУ, итоги ─────────────────────────────────────────── */

for (const menuId of MENU_IDS) {
  for (const goal of GOALS) {
    const bot = dayMenu(menuId, goal);
    const app = APP.day(menuId, goal, 0, {});

    check(`${menuId}/${goal}: итог дня`, bot.total[0] === app.total.kcal, `бот ${bot.total[0]}, приложение ${app.total.kcal}`);
    /* После подгонки крупами разрыв должен быть в пределах шага 10 г, не 5%. */
    check(
      `${menuId}/${goal}: итог дня близко к цели`,
      Math.abs(app.total.kcal - GOAL_KCAL[goal]) <= 25,
      `${app.total.kcal} против ${GOAL_KCAL[goal]}`
    );

    bot.meals.forEach((meal, mi) => {
      const mine = app.meals[mi];
      check(`${menuId}/${goal}/${meal.key}: ккал приёма`, meal.kcal === mine.kcal, `бот ${meal.kcal}, приложение ${mine.kcal}`);
      check(`${menuId}/${goal}/${meal.key}: белок`, meal.proteinG === mine.proteinG, `бот ${meal.proteinG}, приложение ${mine.proteinG}`);
      check(`${menuId}/${goal}/${meal.key}: жиры`, meal.fatG === mine.fatG, `бот ${meal.fatG}, приложение ${mine.fatG}`);
      check(`${menuId}/${goal}/${meal.key}: углеводы`, meal.carbsG === mine.carbsG, `бот ${meal.carbsG}, приложение ${mine.carbsG}`);

      /* Сумма позиций и есть цифра приёма: иначе состав снова разойдётся с числом. */
      const sumKcal = mine.items.reduce((s, i) => s + i.kcal, 0);
      check(`${menuId}/${goal}/${meal.key}: приём равен сумме позиций`, sumKcal === mine.kcal, `${sumKcal} против ${mine.kcal}`);

      meal.items.forEach((item, ii) => {
        const my = mine.items[ii];
        check(`${menuId}/${goal}/${meal.key}/${ii}: вес позиции`, item.g === my.g, `бот ${item.g}, приложение ${my.g}`);
        check(`${menuId}/${goal}/${meal.key}/${ii}: мера позиции`, item.amount === my.amount, `бот ${item.amount}, приложение ${my.amount}`);
        check(`${menuId}/${goal}/${meal.key}/${ii}: ккал позиции`, item.kcal === my.kcal, `бот ${item.kcal}, приложение ${my.kcal}`);
        check(`${menuId}/${goal}/${meal.key}/${ii}: четыре варианта`, my.options.length === 4, String(my.options.length));

        item.options.forEach((opt, oi) => {
          const myOpt = my.options[oi];
          check(
            `${menuId}/${goal}/${meal.key}/${ii}/${oi}: замена ${opt.food}`,
            opt.food === myOpt.food && opt.amount === myOpt.amount && opt.kcal === myOpt.kcal,
            `бот ${opt.food} ${opt.amount} ${opt.kcal}, приложение ${myOpt.food} ${myOpt.amount} ${myOpt.kcal}`
          );
        });

        /* Ровно один вариант отмечен выбранным — по нему рисуется строка. */
        check(
          `${menuId}/${goal}/${meal.key}/${ii}: выбран один вариант`,
          my.options.filter((o) => o.current).length === 1,
          String(my.options.filter((o) => o.current).length)
        );
      });
    });
  }
}

/* ── Замена: цифры приёма пересчитываются, а не остаются прежними ──────────── */

const swapId = "ru:breakfast:0";
const swapTo = MENUS.ru.meals.breakfast[0].alt[0];
const plain = APP.day("ru", "maint", 0, {});
const swapped = APP.day("ru", "maint", 0, { [swapId]: swapTo });
const first = swapped.meals[0].items[0];

check("замена встаёт в позицию", first.food === swapTo, first.food);
check("замена отмечена", first.swapped === true);
check(
  "итог дня после замены к норме",
  Math.abs(swapped.total.kcal - plain.basedOn) <= 25,
  `${swapped.total.kcal} против ${plain.basedOn}`
);
check(
  "приём после замены равен сумме позиций",
  swapped.meals[0].items.reduce((s, i) => s + i.kcal, 0) === swapped.meals[0].kcal
);
const swapMacros = macrosFor(2400);
const swapPlain = APP.day("ru", "maint", 2400, {}, swapMacros);
const swapSwapped = APP.day("ru", "maint", 2400, { [swapId]: swapTo }, swapMacros);
check(
  "замена с БЖУ: день к норме",
  Math.abs(swapSwapped.total.kcal - 2400) <= 30,
  `${swapSwapped.total.kcal} против 2400`
);
check(
  "замена с БЖУ: паритет с базой до замены",
  Math.abs(swapSwapped.total.kcal - swapPlain.total.kcal) <= 80,
  `${swapSwapped.total.kcal} против ${swapPlain.total.kcal}`
);
check("незнакомая замена игнорируется", APP.day("ru", "maint", 0, { [swapId]: "Пельмени" }).meals[0].items[0].food === MENUS.ru.meals.breakfast[0].food);

/* ── Норма человека важнее цели ────────────────────────────────────────────── */

const personal = APP.day("ru", "maint", 2600, {});
check("личная норма поднимает порции", personal.total.kcal > plain.total.kcal, `${personal.total.kcal} против ${plain.total.kcal}`);
check("личная норма выводится в карточке", personal.basedOn === 2600 && personal.personal === true);
check(
  "личная норма выдержана",
  Math.abs(personal.total.kcal - 2600) <= 25,
  String(personal.total.kcal)
);

const cutLike = APP.day("ru", "bulk", 1800, {});
check("дефицит важнее цели набор", cutLike.basedOn === 1800, String(cutLike.basedOn));
check("дефицит выдержан", Math.abs(cutLike.total.kcal - 1800) <= 25, String(cutLike.total.kcal));
check("дефицит ниже шаблона набора", cutLike.total.kcal < APP.day("ru", "bulk", 0, {}).total.kcal);

for (const kcal of [1700, 2000, 2400, 3100]) {
  for (const menuId of MENU_IDS) {
    const mine = APP.day(menuId, "maint", kcal, {});
    const bot = dayMenu(menuId, "maint", kcal);
    check(
      `${menuId}@${kcal}: паритет с ботом`,
      bot.total[0] === mine.total.kcal,
      `бот ${bot.total[0]}, приложение ${mine.total.kcal}`
    );
    check(`${menuId}@${kcal}: к норме`, Math.abs(mine.total.kcal - kcal) <= 25, `${mine.total.kcal} против ${kcal}`);
  }
}

const GRAIN_CAP = {
  "Рис отварной": 300,
  "Гречка отварная": 300,
  "Паста отварная": 300,
  "Овсянка на молоке": 400,
  "Картофель отварной": 300,
};

function macrosFor(kcal, proteinG = 144, fatG = 72) {
  return { proteinG, fatG, carbsG: Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4)) };
}

function portionCapsOk(day, label) {
  for (const meal of day.meals) {
    for (const item of meal.items) {
      const cap = GRAIN_CAP[item.food];
      if (cap) check(`${label}: ${item.food} не гора`, item.g <= cap, `${item.g} г > ${cap} г`);
      if (item.food === "Яйца") check(`${label}: яйца 2 шт`, item.g === 110, item.amount);
    }
  }
}

const high = macrosFor(3026);
const appHigh = APP.day("ru", "bulk", 3026, {}, high);
const botHigh = dayMenu("ru", "bulk", 3026, high);
check(
  "ru@3026 с БЖУ: паритет ккал",
  botHigh.total[0] === appHigh.total.kcal,
  `бот ${botHigh.total[0]}, приложение ${appHigh.total.kcal}`
);
check(
  "ru@3026 с БЖУ: паритет белка",
  botHigh.total[1] === appHigh.total.proteinG,
  `бот ${botHigh.total[1]}, приложение ${appHigh.total.proteinG}`
);
check(
  "ru@3026 с БЖУ: ккал к норме",
  Math.abs(appHigh.total.kcal - 3026) <= 30,
  String(appHigh.total.kcal)
);
check(
  "ru@3026 с БЖУ: белок к норме",
  Math.abs(appHigh.total.proteinG - high.proteinG) <= 20,
  `${appHigh.total.proteinG} против ${high.proteinG}`
);
check(
  "ru@3026 с БЖУ: жир к норме",
  Math.abs(appHigh.total.fatG - high.fatG) <= 12,
  `${appHigh.total.fatG} против ${high.fatG}`
);
check(
  "ru@3026 с БЖУ: углеводы к норме",
  Math.abs(appHigh.total.carbsG - high.carbsG) <= 30,
  `${appHigh.total.carbsG} против ${high.carbsG}`
);
check(
  "ru@3026 с БЖУ: яйца не растут от нормы",
  !appHigh.meals[0].items.some((i) => i.food === "Яйца" && i.g > 110),
  appHigh.meals[0].items.find((i) => i.food === "Яйца")?.amount
);
portionCapsOk(appHigh, "ru@3026");

for (const kcal of [1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200, 3400]) {
  const m = macrosFor(kcal);
  for (const menuId of MENU_IDS) {
    const mine = APP.day(menuId, "maint", kcal, {}, m);
    const bot = dayMenu(menuId, "maint", kcal, m);
    const tag = `${menuId}@${kcal} с БЖУ`;
    check(`${tag}: паритет ккал`, bot.total[0] === mine.total.kcal, `бот ${bot.total[0]}, приложение ${mine.total.kcal}`);
    check(`${tag}: паритет белка`, bot.total[1] === mine.total.proteinG, `бот ${bot.total[1]}, приложение ${mine.total.proteinG}`);
    const kTol = menuId === "th" && kcal >= 3200 ? 80 : 30;
    const cTol = menuId === "th" && kcal >= 3200 ? 50 : 30;
    check(`${tag}: ккал`, Math.abs(mine.total.kcal - kcal) <= kTol, `${mine.total.kcal} против ${kcal}`);
    check(`${tag}: белок`, Math.abs(mine.total.proteinG - m.proteinG) <= 25, `${mine.total.proteinG} против ${m.proteinG}`);
    check(`${tag}: жир`, Math.abs(mine.total.fatG - m.fatG) <= 12, `${mine.total.fatG} против ${m.fatG}`);
    check(`${tag}: углеводы`, Math.abs(mine.total.carbsG - m.carbsG) <= cTol, `${mine.total.carbsG} против ${m.carbsG}`);
    portionCapsOk(mine, tag);
  }
}

const PEOPLE = [
  { sex: "m", age: 34, heightCm: 180, weightKg: 80, activity: "high", goal: "bulk" },
  { sex: "m", age: 34, heightCm: 180, weightKg: 80, activity: "high", goal: "cut" },
  { sex: "m", age: 34, heightCm: 180, weightKg: 80, activity: "mid", goal: "maint" },
  { sex: "f", age: 28, heightCm: 165, weightKg: 58, activity: "mid", goal: "cut" },
  { sex: "f", age: 28, heightCm: 165, weightKg: 58, activity: "mid", goal: "bulk" },
  { sex: "m", age: 42, heightCm: 178, weightKg: 100, activity: "low", goal: "cut" },
];

for (const p of PEOPLE) {
  const m = calcMacros(p);
  for (const menuId of MENU_IDS) {
    const mine = APP.day(menuId, p.goal, m.kcal, {}, m);
    const bot = dayMenu(menuId, p.goal, m.kcal, m);
    const tag = `${menuId} ${p.sex}/${p.weightKg}кг ${p.goal} ${m.kcal}`;
    check(`${tag}: паритет ккал`, bot.total[0] === mine.total.kcal, `бот ${bot.total[0]}, приложение ${mine.total.kcal}`);
    check(`${tag}: паритет белка`, bot.total[1] === mine.total.proteinG, `бот ${bot.total[1]}, приложение ${mine.total.proteinG}`);
    check(`${tag}: ккал`, Math.abs(mine.total.kcal - m.kcal) <= (menuId === "th" ? 200 : 50), `${mine.total.kcal} против ${m.kcal}`);
    check(`${tag}: белок`, Math.abs(mine.total.proteinG - m.proteinG) <= (menuId === "th" ? 60 : 40), `${mine.total.proteinG} против ${m.proteinG}`);
    check(`${tag}: жир`, Math.abs(mine.total.fatG - m.fatG) <= 16, `${mine.total.fatG} против ${m.fatG}`);
    check(`${tag}: углеводы`, Math.abs(mine.total.carbsG - m.carbsG) <= 50, `${mine.total.carbsG} против ${m.carbsG}`);
    portionCapsOk(mine, tag);
  }
}

/* ── Замена соразмерна позиции ─────────────────────────────────────────────── */

for (const menuId of MENU_IDS) {
  const app = APP.day(menuId, "maint", 0, {});
  for (const meal of app.meals) {
    for (const item of meal.items) {
      for (const opt of item.options.slice(1)) {
        const food = APP.foods[opt.food];
        const atEdge = opt.g <= (food.piece || food.def * 0.4) * 1.05 || opt.g >= food.def * 2.5 * 0.95;
        const close = Math.abs(opt.kcal - item.kcal) <= Math.max(item.kcal * 0.2, 12);
        check(
          `${menuId}/${meal.key}: замена «${item.food} → ${opt.food}» соразмерна`,
          close || atEdge,
          `${item.kcal} ккал против ${opt.kcal} ккал при ${opt.amount}`
        );
      }
    }
  }
}

const total = MENU_IDS.reduce(
  (n, id) => n + MEAL_KEYS.reduce((k, key) => k + MENUS[id].meals[key].length, 0),
  0
);

if (failed) {
  console.error(`\nМеню: ${failed} проверок не прошли.`);
  process.exit(1);
}
console.log(`Меню: позиций ${total}, продуктов ${used.size}, картинки на месте, бот и приложение считают одинаково.`);
