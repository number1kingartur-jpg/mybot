/**
 * Проверка разбора текста еды: бытовые меры вместо весов.
 *
 * Живая запись выглядит не как «120 г банана», а как «3 банана, 8 ложек
 * овсянки, 2 скупа протеина». Каждая ошибка здесь стоит человеку сотен
 * килокалорий в дневнике, поэтому разбор проверяется на сборке.
 */
import { FOODS, macrosFromText, macrosFromItems, matchFood, foodSlug } from "../dist/foods.js";
import { mealFromIdentify } from "../dist/meal.js";

let failed = 0;

function check(title, cond, detail) {
  if (cond) return;
  failed++;
  console.error(`FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
}

function near(title, actual, expected, tolerance = 0.12) {
  const ok = Math.abs(actual - expected) <= expected * tolerance;
  check(title, ok, `получено ${actual}, ожидалось ~${expected}`);
}

// ── Коктейль Артура: миллилитры, штуки, ложки, скупы, половина ложки ─────────
const shake = macrosFromText(
  "250мл жидкого белка,100 молока 3 банана 8 сталовых ложек овсянки 1 ложка арахисовой пасты 2 скупа протеина и пол ложки креатина"
);
check("коктейль разобран", shake !== null);
if (shake) {
  near("коктейль: ккал", shake.kcal, 1215, 0.1);
  near("коктейль: белок", shake.proteinG, 100, 0.12);
  near("коктейль: жиры", shake.fatG, 21, 0.2);
  near("коктейль: углеводы", shake.carbsG, 155, 0.12);
  check(
    "коктейль: в названии видно, что позиций больше четырёх",
    /и ещё \d/.test(shake.name),
    shake.name
  );
  check(
    "коктейль: честная приписка про меры",
    shake.note.includes("среднему весу"),
    shake.note
  );
}

// ── Единицы по отдельности ───────────────────────────────────────────────────
function grams(text, expected, tolerance = 0.05) {
  const res = macrosFromText(text);
  check(`«${text}» разобрано`, res !== null);
  if (!res) return;
  const m = res.name.match(/~(\d+) г/);
  check(`«${text}»: граммы в названии`, m !== null, res.name);
  if (m) near(`«${text}»: граммы`, Number(m[1]), expected, tolerance);
}

grams("3 банана", 360);
grams("2 яйца", 110);
grams("500 мл молока", 515);
grams("1 кг картошки", 1000);
grams("2 ст.л. меда", 42);
grams("1 чайная ложка сахара", 5);
grams("2 скупа протеина", 60);
grams("пол ложки креатина", 3, 0.1); // 2,5 г, в подписи округляется до целого
grams("1/2 ложки арахисовой пасты", 8);
grams("рис 250 г", 250);
grams("10 пельменей", 120);

// ── Ложками меряют сухое, а не готовую кашу ──────────────────────────────────
const oats = macrosFromText("8 ложек овсянки");
check("ложки овсянки — это хлопья", /хлопья/i.test(oats?.name ?? ""), oats?.name);
near("8 ложек хлопьев ≈ 365 ккал", oats?.kcal ?? 0, 365, 0.1);
const porridge = macrosFromText("овсянка 300 г");
check("вес в граммах оставляет готовую кашу", /овсянка на воде/i.test(porridge?.name ?? ""), porridge?.name);

// ── Малое число без единицы — не граммы ──────────────────────────────────────
const soup = macrosFromText("1 борщ");
near("«1 борщ» — порция, а не 1 г", soup?.kcal ?? 0, 263, 0.1);

// ── Добавки не теряются на минимальном весе ──────────────────────────────────
const creatine = macrosFromItems([{ name: "креатин", grams: 5 }]);
check("креатин 5 г принят", creatine !== null);
check("креатин без калорий", (creatine?.kcal ?? -1) === 0, String(creatine?.kcal));

// ── Количество не уезжает к соседнему продукту ───────────────────────────────
function items(text) {
  const res = macrosFromText(text);
  check(`«${text}» разобрано`, res !== null);
  return res ? res.name.toLowerCase() : "";
}

check(
  "вес курицы не достаётся рису",
  items("курица жареная 200 г, рис 150 г").includes("рис отварной ~150 г")
);
check(
  "банан без веса не забирает ложки пасты",
  items("банан, 2 ст.л. арахисовой пасты").includes("банан ~120 г")
);
check(
  "мера рядом с продуктом без числа — одна мера",
  items("стакан кефира").includes("кефир ~258 г")
);
check(
  "«на 400 мл молока» — вес молока, а не гейнера",
  items("гейнер 2 скупа на 400 мл молока").includes("гейнер ~150 г")
);

// ── Падежи: продукты не теряются ─────────────────────────────────────────────
for (const [text, expect] of [
  ["2 ложки сметаны", "сметана"],
  ["2 котлеты", "котлета мясная жареная"],
  ["10 г масла сливочного", "масло сливочное"],
  ["10 пельменей", "пельмени"],
  ["200 г творога", "творог"],
  ["300 мл молока", "молоко"],
]) {
  check(`«${text}» → ${expect}`, items(text).includes(expect), items(text));
}

// ── Напитки: бутылка — это тоже приём ────────────────────────────────────────
for (const [text, expect] of [
  ["витаминный напиток c-vitt", "витаминный напиток"],
  ["500 мл колы", "кола"],
  ["банка энергетика", "энергетик"],
  ["латте 300 мл", "латте"],
  ["бутылка пива", "пиво"],
  ["протеиновый батончик", "протеиновый батончик"],
]) {
  check(`«${text}» → ${expect}`, items(text).includes(expect), items(text));
}

const cvitt = macrosFromText("витаминный напиток c-vitt");
near("бутылка C-vitt ≈ 45 ккал", cvitt?.kcal ?? 0, 45, 0.15);

// «Песок» не должен приносить стакан сока
const sugar = macrosFromText("2 ложки сахарного песка");
check("сахарный песок — это сахар, а не сок", !/сок/.test(sugar?.name ?? "x"), sugar?.name);
check("чайная ложка не приносит чай", !/чай/.test(items("1 чайная ложка сахара")), items("1 чайная ложка сахара"));
check("коктейль из молока не приносит молочный коктейль", !/молочный коктейль/.test(items("коктейль: 300 мл молока, 2 скупа протеина")));

// ── Продукт не из справочника: цифры с этикетки, а не отказ ──────────────────
const label = macrosFromItems([
  { name: "напиток yakult", grams: 100, kcal100: 65, p100: 1.2, f100: 0.1, c100: 15 },
]);
check("незнакомый продукт принят по этикетке", label !== null);
check("этикетка: калории взяты", (label?.kcal ?? 0) === 65, String(label?.kcal));
check("этикетка: сказано, откуда цифры", /упаковк/i.test(label?.note ?? ""), label?.note);

const noNumbers = macrosFromItems([{ name: "напиток yakult", grams: 100 }]);
check("без цифр на этикетке продукт не выдумывается", noNumbers === null);

const mixed = macrosFromItems([
  { name: "курица отварная", grams: 150 },
  { name: "соус шрирача особый", grams: 20, kcal100: 100, p100: 2, f100: 1, c100: 20 },
]);
check("справочник и этикетка считаются вместе", (mixed?.kcal ?? 0) > 240, String(mixed?.kcal));

// ── Картинка блюда ───────────────────────────────────────────────────────────
check("слаг из названия", foodSlug("Котлета куриная жареная") === "kotleta-kurinaya-zharenaya", foodSlug("Котлета куриная жареная"));
check("слаги не повторяются", new Set(FOODS.map((f) => foodSlug(f.name))).size === FOODS.length);
const plate = macrosFromText("курица жареная 200 г, рис 150 г");
check("картинка приёма — по главному продукту", plate?.slug === "kurica-zharenaya", plate?.slug);

// ── Ответ модели по фото упаковки: раньше это был отказ ──────────────────────
function fromModel(json) {
  try {
    return { meal: mealFromIdentify(json) };
  } catch (e) {
    return { error: e };
  }
}

const bottle = fromModel('{"items":[{"name":"витаминный напиток C-vitt","grams":140}],"note":"тара пустая, посчитан полный объём"}');
check("фото бутылки записывается", bottle.meal !== undefined, String(bottle.error?.message));
near("бутылка C-vitt по фото ≈ 45 ккал", bottle.meal?.kcal ?? 0, 45, 0.15);
check("замечание модели сохранено", /тара пустая/.test(bottle.meal?.note ?? ""), bottle.meal?.note);

const unknownJar = fromModel('{"items":[{"name":"напиток yakult","grams":80,"kcal100":65,"p100":1.2,"f100":0.1,"c100":15}],"note":"по этикетке"}');
check("незнакомая упаковка с этикеткой записывается", unknownJar.meal !== undefined, String(unknownJar.error?.message));
near("этикетка: 80 мл × 65 ккал", unknownJar.meal?.kcal ?? 0, 52, 0.1);

const unknownNoNumbers = fromModel('{"items":[{"name":"напиток yakult","grams":80}]}');
check("без цифр отказ остаётся отказом", unknownNoNumbers.error !== undefined);
check(
  "в отказе видно, что модель разглядела",
  /yakult/i.test(unknownNoNumbers.error?.seen ?? ""),
  unknownNoNumbers.error?.seen
);

const notFood = fromModel('{"items":[],"note":"не еда: ноутбук"}');
check("не еда остаётся не едой", notFood.error !== undefined);
check("причина «не еда» доходит до человека", /ноутбук/.test(notFood.error?.saw ?? ""), notFood.error?.saw);
check("«не еда» помечена причиной", notFood.error?.reason === "not_food", notFood.error?.reason);
// В поле ввода уходит только состав. Иначе человек правит «не еда: ноутбук»
// вместо того, чтобы написать блюдо, — это дольше, чем набрать с нуля.
check("описание кадра не подставляется в ввод", !notFood.error?.seen, notFood.error?.seen);

const emptyWithNote = fromModel('{"items":[],"note":"снято слишком близко, тарелка не видна"}');
check("пустой список без «не еда» — другая причина", emptyWithNote.error?.reason === "no_foods", emptyWithNote.error?.reason);
check("заметка модели не идёт в ввод", !emptyWithNote.error?.seen, emptyWithNote.error?.seen);

// ── Справочник цел ───────────────────────────────────────────────────────────
check("арахисовая паста не путается с пастой отварной", matchFood("арахисовая паста")?.name === "Арахисовая паста");
check("жидкий белок опознан", matchFood("жидкий белок")?.name === "Белок яичный жидкий");
check("скуп протеина опознан", matchFood("протеин")?.name === "Протеин");

if (failed) {
  console.error(`\ncheck-foods: ${failed} провал(ов)`);
  process.exit(1);
}
console.log("check-foods: разбор бытовых мер в порядке");
