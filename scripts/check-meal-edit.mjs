/**
 * Правка разбора до записи: убрать позицию, поправить вес.
 *
 * Зачем в сборке: это единственная защита от выдуманной позиции. Модель на фото
 * одного яблока в руке прислала «яблоко 180 г, салат 180 г», и человеку нужно
 * снять именно салат, а не отказываться от всего разбора. Пересчёт идёт по
 * позициям, поэтому легко разойтись: итог приёма обязан равняться сумме строк
 * после любой правки, иначе в дневник уедет цифра, которой на экране не было.
 *
 * Запуск: node scripts/check-meal-edit.mjs
 */
import { macrosFromItems } from "../dist/foods.js";
import { editMeal, isCompleteShake, mealFromHistory, mergeShakeFromUsual } from "../dist/meal.js";

let fails = 0;
function ok(cond, what) {
  if (!cond) {
    console.error(`НЕ ПРОШЛО: ${what}`);
    fails++;
  }
}
function eq(actual, expected, what) {
  ok(actual === expected, `${what}: ждали ${expected}, получили ${actual}`);
}

/** Итог обязан быть суммой позиций: расхождение здесь и есть цена ошибки. */
function sumMatches(meal, what) {
  const s = (pick) => meal.parts.reduce((a, p) => a + pick(p), 0);
  ok(Math.abs(meal.kcal - s((p) => p.kcal)) <= 1, `${what}: ккал не сумма позиций`);
  ok(Math.abs(meal.proteinG - s((p) => p.proteinG)) <= 1, `${what}: белок не сумма позиций`);
  ok(Math.abs(meal.fatG - s((p) => p.fatG)) <= 1, `${what}: жиры не сумма позиций`);
  ok(Math.abs(meal.carbsG - s((p) => p.carbsG)) <= 1, `${what}: углеводы не сумма позиций`);
}

// Тот самый случай Артура: снимок одного яблока, в разборе появился салат.
const phantom = macrosFromItems([
  { name: "яблоко", grams: 180 },
  { name: "салат", grams: 180 },
]);
eq(phantom.kcal, 157, "исходный приём с выдуманным салатом");
eq(phantom.parts.length, 2, "позиций в исходном приёме");
sumMatches(phantom, "исходный приём");

const dropped = editMeal(phantom, { drop: 1 });
eq(dropped.parts.length, 1, "после снятия салата позиций");
eq(dropped.parts[0].name, "яблоко", "осталась не та позиция");
eq(dropped.kcal, 94, "ккал после снятия салата");
eq(dropped.name, "Яблоко ~180 г", "заголовок после снятия салата");
eq(dropped.slug, "yabloko", "картинка приёма после снятия салата");
sumMatches(dropped, "после снятия салата");

// Вес: яблоко в ладони это ~120 г, а не «типичные» 180.
const lighter = editMeal(dropped, { grams: { index: 0, value: 120 } });
eq(lighter.parts[0].grams, 120, "вес после правки");
ok(Math.abs(lighter.kcal - 62) <= 2, `ккал после правки веса: получили ${lighter.kcal}`);
eq(lighter.name, "Яблоко ~120 г", "заголовок после правки веса");
sumMatches(lighter, "после правки веса");

// Правка веса и снятие позиции в любом порядке дают одно и то же.
const otherOrder = editMeal(editMeal(phantom, { grams: { index: 0, value: 120 } }), { drop: 1 });
eq(otherOrder.kcal, lighter.kcal, "порядок правок меняет итог");

// Последнюю позицию снять нельзя: пустой приём записывать нечего, для этого есть отказ.
eq(editMeal(dropped, { drop: 0 }), null, "снятие последней позиции");
eq(editMeal(phantom, { drop: 5 }), null, "снятие позиции с чужим номером");
eq(editMeal(phantom, { drop: -1 }), null, "снятие позиции с отрицательным номером");
eq(editMeal(phantom, { grams: { index: 0, value: 0 } }), null, "нулевой вес");
eq(editMeal(phantom, { grams: { index: 0, value: 5000 } }), null, "вес больше 3 кг");
eq(editMeal(phantom, {}), null, "правка без действия");

// Цифры с упаковки: пересчёт по весу не должен уводить их в справочник.
const packaged = macrosFromItems([
  { name: "яблоко", grams: 180 },
  { name: "напиток Fizzy Zero", grams: 330, kcal100: 20, p100: 0, f100: 0, c100: 5, packaged: true },
]);
ok(packaged.parts.length === 2, "магазинная позиция не попала в разбор");
const label = packaged.parts.findIndex((p) => p.source === "label");
ok(label >= 0, "цифры с упаковки не отмечены источником label");
const halfDrink = editMeal(packaged, { grams: { index: label, value: 165 } });
eq(halfDrink.parts[label].kcal, 33, "половина бутылки по цифрам с упаковки");
ok(/упаковки/.test(halfDrink.note ?? ""), "пометка про упаковку исчезла при правке веса");
sumMatches(halfDrink, "магазинная позиция после правки веса");

// Убрали магазинную позицию — пометка про упаковку больше не верна.
const withoutDrink = editMeal(packaged, { drop: label });
ok(!/упаковки/.test(withoutDrink.note ?? ""), "пометка про упаковку осталась без магазинной позиции");
ok(/Справочник/.test(withoutDrink.note ?? ""), "примечание не вернулось к справочнику");

// Каждая позиция несёт свои БЖУ: без них правка состава считалась бы заново
// через справочник, а у цифр с упаковки второго источника нет.
for (const p of phantom.parts) {
  ok(typeof p.proteinG === "number" && typeof p.fatG === "number" && typeof p.carbsG === "number",
    `позиция «${p.name}» без БЖУ`);
  ok(typeof p.slug === "string" && p.slug.length > 0, `позиция «${p.name}» без картинки`);
}

const shake = macrosFromItems([
  { name: "белок яичный жидкий", grams: 200 },
  { name: "банан", grams: 120 },
  { name: "арахисовая паста", grams: 16 },
]);
ok(shake && shake.parts.length === 3, "коктейль из трёх позиций");
const noPaste = editMeal(shake, { drop: 2 });
ok(noPaste && noPaste.parts.every((p) => !/арахис/i.test(p.name)), "паста снята из напитка");
ok(noPaste.kcal < shake.kcal, "без пасты калорий меньше");
sumMatches(noPaste, "коктейль без пасты");
const plusOats = editMeal(noPaste, { add: { name: "овсяные хлопья сухие", grams: 40 } });
ok(plusOats && plusOats.parts.some((p) => /овсян/i.test(p.name)), "в напиток добавили хлопья");
sumMatches(plusOats, "коктейль плюс хлопья");

const stored = mealFromHistory({
  name: shake.name,
  kcal: shake.kcal,
  proteinG: shake.proteinG,
  fatG: shake.fatG,
  carbsG: shake.carbsG,
  parts: shake.parts,
});
eq(stored.parts.length, 3, "сохранённый состав коктейля не потерялся");

const usual = macrosFromItems([
  { name: "белок яичный жидкий", grams: 250 },
  { name: "молоко таиландское", grams: 100 },
  { name: "банан", grams: 360 },
  { name: "овсяные хлопья сухие", grams: 96 },
  { name: "арахисовая паста", grams: 16 },
  { name: "протеин", grams: 60 },
  { name: "креатин", grams: 3 },
]);
ok(isCompleteShake(usual.parts), "полный коктейль: овсянка и протеин на месте");
const stub = macrosFromItems([
  { name: "белок яичный жидкий", grams: 258 },
  { name: "молоко таиландское", grams: 103 },
  { name: "банан", grams: 360 },
  { name: "арахисовая паста", grams: 16 },
]);
ok(!isCompleteShake(stub.parts), "четыре позиции — не полный коктейль");
const filled = mergeShakeFromUsual(stub, usual.parts);
ok(isCompleteShake(filled.parts), "овсянка и протеин вернулись из вчерашнего");
ok(filled.kcal > 1000, "после дописи это ~1200, не 600");
ok(/овсян/i.test(filled.note + filled.parts.map((p) => p.name).join(" ")), "овсянка в составе");
ok(/протеин/i.test(filled.parts.map((p) => p.name).join(" ")), "протеин в составе");
ok(filled.name === "Коктейль", "полный коктейль пишется одним словом, не хвостом «и ещё»");
sumMatches(filled, "коктейль после дописи");

if (fails) {
  console.error(`check-meal-edit: ${fails} провал(ов)`);
  process.exit(1);
}
console.log("check-meal-edit: правка состава считается верно");
