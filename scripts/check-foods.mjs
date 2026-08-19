/**
 * Проверка разбора текста еды: бытовые меры вместо весов.
 *
 * Живая запись выглядит не как «120 г банана», а как «3 банана, 8 ложек
 * овсянки, 2 скупа протеина». Каждая ошибка здесь стоит человеку сотен
 * килокалорий в дневнике, поэтому разбор проверяется на сборке.
 */
import { macrosFromText, macrosFromItems, matchFood } from "../dist/foods.js";

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

// ── Справочник цел ───────────────────────────────────────────────────────────
check("арахисовая паста не путается с пастой отварной", matchFood("арахисовая паста")?.name === "Арахисовая паста");
check("жидкий белок опознан", matchFood("жидкий белок")?.name === "Белок яичный жидкий");
check("скуп протеина опознан", matchFood("протеин")?.name === "Протеин");

if (failed) {
  console.error(`\ncheck-foods: ${failed} провал(ов)`);
  process.exit(1);
}
console.log("check-foods: разбор бытовых мер в порядке");
