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
  "приём после замены равен сумме позиций",
  swapped.meals[0].items.reduce((s, i) => s + i.kcal, 0) === swapped.meals[0].kcal
);
check(
  "итог дня после замены пересчитан",
  swapped.total.kcal === plain.total.kcal - plain.meals[0].items[0].kcal + first.kcal,
  `${swapped.total.kcal} против ${plain.total.kcal}`
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

/* ── Замена соразмерна позиции ─────────────────────────────────────────────── */

for (const menuId of MENU_IDS) {
  const app = APP.day(menuId, "maint", 0, {});
  for (const meal of app.meals) {
    for (const item of meal.items) {
      for (const opt of item.options.slice(1)) {
        const food = APP.foods[opt.food];
        const atEdge = opt.g <= food.def * 0.4 * 1.05 || opt.g >= food.def * 2.5 * 0.95;
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
