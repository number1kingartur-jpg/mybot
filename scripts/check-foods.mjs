/**
 * Проверка разбора текста еды: бытовые меры вместо весов.
 *
 * Живая запись выглядит не как «120 г банана», а как «3 банана, 8 ложек
 * овсянки, 2 скупа протеина». Каждая ошибка здесь стоит человеку сотен
 * килокалорий в дневнике, поэтому разбор проверяется на сборке.
 */
import { FOODS, macrosFromText, macrosFromItems, matchFood, foodSlug, STAPLE_ROLE } from "../dist/foods.js";
import { mealFromIdentify, mealPartLines } from "../dist/meal.js";
import { dropPending, putPending, takePending } from "../dist/pending.js";
import { factsFromOffJson, isOffImage, validGtin } from "../dist/product-db.js";
import { shelfByCode, STORE_SHELF } from "../dist/store-shelf.js";

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
  ["витаминный напиток c-vitt", "c-vitt"],
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
  { name: "напиток zyntra", grams: 100, kcal100: 65, p100: 1.2, f100: 0.1, c100: 15 },
]);
check("незнакомый продукт принят по этикетке", label !== null);
check("этикетка: калории взяты", (label?.kcal ?? 0) === 65, String(label?.kcal));
check("этикетка: сказано, откуда цифры", /упаковк/i.test(label?.note ?? ""), label?.note);

const noNumbers = macrosFromItems([{ name: "напиток zyntra", grams: 100 }]);
check("без цифр на этикетке продукт не выдумывается", noNumbers === null);

// ── Штрихкод: точный ключ вместо похожего по смыслу ──────────────────────────
// Контрольная цифра — единственная защита от кривого чтения цифр под полосами:
// одна перевранная цифра дала бы существующий, но чужой продукт.
check("штрихкод колы проходит проверку", validGtin("5449000000996") === "5449000000996");
check("перевранная цифра отсекается", validGtin("5449000000997") === null);
check("пробелы и дефисы в коде не мешают", validGtin("5449-0000 00996") === "5449000000996");
check("обрывок кода не проходит", validGtin("54490009") === null, String(validGtin("54490009")));

// Ответ базы разбирается без сети, поэтому проверяется на сборке.
const off = factsFromOffJson(
  '{"status":1,"product":{"product_name":"coca-cola","brands":"Coca-Cola","nutriments":{"energy-kcal_100g":42,"proteins_100g":0,"fat_100g":0,"carbohydrates_100g":10.6}}}'
);
check("ответ базы разобран", off !== null);
check("имя продукта берёт написание марки", off?.name === "Coca-Cola", off?.name);
check("калории из базы", off?.kcal100 === 42, String(off?.kcal100));
check("продукт не найден — не запись", factsFromOffJson('{"status":0}') === null);
check(
  "пустая карточка без углеводов отвергается",
  factsFromOffJson('{"status":1,"product":{"product_name":"x","nutriments":{"energy-kcal_100g":42}}}') === null
);
// Ноль калорий — настоящая цифра диетического напитка, а не пустое поле.
const zero = factsFromOffJson(
  '{"status":1,"product":{"product_name":"cola zero","brands":"Coca-Cola","nutriments":{"energy-kcal_100g":0,"proteins_100g":0,"fat_100g":0,"carbohydrates_100g":0}}}'
);
check("ноль калорий из базы принимается", zero !== null && zero.kcal100 === 0, String(zero?.kcal100));

const offPhoto = factsFromOffJson(
  '{"status":1,"product":{"product_name":"C-vitt Lemon","brands":"C-vitt","nutriments":{"energy-kcal_100g":28.6,"proteins_100g":0,"fat_100g":0,"carbohydrates_100g":7.1},"image_front_small_url":"https://images.openfoodfacts.org/images/products/885/112/323/7000/front_th.4.200.jpg","quantity":"140 ml"}}'
);
check("фото упаковки из базы принято", offPhoto?.imageUrl?.includes("openfoodfacts.org"), offPhoto?.imageUrl);
check("объём с этикетки разобран", offPhoto?.servingG === 140, String(offPhoto?.servingG));
check(
  "чужой хост фото отвергается",
  factsFromOffJson(
    '{"status":1,"product":{"product_name":"x","nutriments":{"energy-kcal_100g":42,"carbohydrates_100g":10},"image_url":"https://evil.example/x.jpg"}}'
  )?.imageUrl === undefined
);
check("хост Open Food Facts разрешён", isOffImage("https://images.openfoodfacts.org/images/products/1.jpg"));
check("http фото отвергается", !isOffImage("http://images.openfoodfacts.org/images/products/1.jpg"));

const shelf = shelfByCode("8851123237000");
check("полка C-vitt без сети", shelf?.name === "C-vitt Lemon", shelf?.name);
check(
  "все коды полки валидны",
  STORE_SHELF.every((p) => validGtin(p.code) === p.code),
  STORE_SHELF.filter((p) => validGtin(p.code) !== p.code)
    .map((p) => p.code)
    .join(",")
);
check("oishi в справочнике", matchFood("oishi")?.name === "Oishi", matchFood("oishi")?.name);
check("простоквашино в справочнике", matchFood("простоквашино")?.name === "Простоквашино", matchFood("простоквашино")?.name);
check("yakult теперь марка", matchFood("yakult")?.name === "Yakult", matchFood("yakult")?.name);

const packShot = macrosFromItems([
  {
    name: "C-vitt Lemon",
    grams: 140,
    kcal100: 28.6,
    p100: 0,
    f100: 0,
    c100: 7.1,
    fromDb: true,
    photoUrl: "https://images.openfoodfacts.org/images/products/885/112/323/7000/front_th.4.200.jpg",
  },
]);
check("фото упаковки доходит до записи", /openfoodfacts/.test(packShot?.photoUrl ?? ""), packShot?.photoUrl);
check("фото упаковки у позиции", /openfoodfacts/.test(packShot?.parts?.[0]?.photoUrl ?? ""), packShot?.parts?.[0]?.photoUrl);

// Цифры из базы сильнее проверенной позиции справочника: у неё они средние, а
// по коду известен конкретный рецепт этой упаковки.
const byCode = macrosFromItems([
  { name: "Fanta Orange Thailand", grams: 330, kcal100: 52, p100: 0, f100: 0, c100: 13, fromDb: true },
]);
check("цифры из базы помечены штрихкодом", byCode?.parts?.[0]?.source === "barcode", byCode?.parts?.[0]?.source);
near("цифры из базы применены", byCode?.kcal ?? 0, 172, 0.05);
check("человеку сказано про штрихкод", /штрихкод/.test(byCode?.note ?? ""), byCode?.note);

// ── Марка вместо категории ───────────────────────────────────────────────────
// Главный разбор: раньше «витаминный напиток C-vitt» уходил в общую позицию
// «Витаминный напиток», потому что её алиас длиннее короткого «c vitt». В записи
// оставалась полка магазина, а цифры и объём брались от другого продукта.
const brand = macrosFromItems([{ name: "витаминный напиток C-vitt", grams: 140 }]);
check("марка не подменяется категорией", /c-vitt/i.test(brand?.name ?? ""), brand?.name);
near("C-vitt считается по своей позиции", brand?.kcal ?? 0, 45, 0.15);

// Своя позиция важнее цифр модели: она проверена, и одно фото даёт одно число.
const brandVsModel = macrosFromItems([
  { name: "энергетик Red Bull", grams: 250, kcal100: 200, p100: 0, f100: 0, c100: 50 },
]);
check("марка из справочника не берёт выдуманные цифры", (brandVsModel?.kcal ?? 0) < 150, String(brandVsModel?.kcal));
check("марка в названии записи", /red bull/i.test(brandVsModel?.name ?? ""), brandVsModel?.name);

// Марка рядом с категорией — один продукт, а не два.
const oneDrink = macrosFromText("энергетик red bull 250 мл");
near("категория рядом с маркой не удваивает приём", oneDrink?.kcal ?? 0, 113, 0.15);

// Порция берётся от упаковки марки, а не от категории: в бутылочке Actimel
// 100 мл, а у питьевого йогурта порция по умолчанию 290 г — это тройной приём.
const actimel = macrosFromItems([{ name: "йогурт Actimel", grams: 100 }]);
near("Actimel считается своей бутылочкой", actimel?.kcal ?? 0, 71, 0.15);

// Незнакомая марка с цифрами на упаковке: цифры важнее похожего продукта.
const unknownWithLabel = macrosFromItems([
  { name: "энергетик Sting", grams: 250, kcal100: 60, p100: 0, f100: 0, c100: 15 },
]);
near("незнакомая марка считается по этикетке", unknownWithLabel?.kcal ?? 0, 150, 0.05);
check("этикетка помечена в составе", unknownWithLabel?.parts?.[0]?.source === "label", unknownWithLabel?.parts?.[0]?.source);

// Незнакомая марка без цифр: считаем по категории, но говорим об этом прямо.
const unknownNoLabel = macrosFromItems([{ name: "энергетик Sting", grams: 250 }]);
check("похожий продукт помечен", unknownNoLabel?.parts?.[0]?.source === "similar", unknownNoLabel?.parts?.[0]?.source);
check("марка сохранена в названии", /sting/i.test(unknownNoLabel?.name ?? ""), unknownNoLabel?.name);
check("человеку сказано про похожий продукт", /похожему продукту/.test(unknownNoLabel?.note ?? ""), unknownNoLabel?.note);
check("догадка не выдана за справочник", !/RASCHET/.test(unknownNoLabel?.note ?? ""), unknownNoLabel?.note);
check(
  "в строке состава видно, что счёт по похожему",
  mealPartLines(unknownNoLabel).some((l) => /по похожему продукту/.test(l)),
  mealPartLines(unknownNoLabel).join(" | ")
);

// Упаковка есть, а марку модель не назвала. Цифры категории тут — догадка, и
// подавать её как знание справочника нельзя: на кадре был конкретный продукт.
const packagedNoBrand = macrosFromItems([{ name: "витаминный напиток", grams: 140, packaged: true }]);
check("неопознанная упаковка помечена", packagedNoBrand?.parts?.[0]?.source === "similar", packagedNoBrand?.parts?.[0]?.source);
near("неопознанная упаковка всё же посчитана", packagedNoBrand?.kcal ?? 0, 45, 0.15);

// Способ приготовления — не марка: домашняя еда обязана считаться справочником,
// иначе модель начнёт присылать свои калории на каждую котлету.
const homeCooked = macrosFromItems([
  { name: "котлета куриная жареная", grams: 150, kcal100: 90, p100: 20, f100: 1, c100: 0 },
]);
near("домашнее блюдо считается справочником", homeCooked?.kcal ?? 0, 330, 0.15);
check("домашнее блюдо не помечается упаковкой", homeCooked?.parts?.[0]?.source === "catalog", homeCooked?.parts?.[0]?.source);

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
check("зелёное яблоко не красное", matchFood("яблоко зелёное")?.name === "Яблоко зелёное", matchFood("яблоко зелёное")?.name);
check("зелёное яблоко: слаг", foodSlug("Яблоко зелёное") === "yabloko-zelenoe", foodSlug("Яблоко зелёное"));
const greenShot = macrosFromItems([{ name: "яблоко зелёное", grams: 120 }]);
check("картинка зелёного яблока не красная", greenShot?.slug === "yabloko-zelenoe", greenShot?.slug);
check("просто яблоко остаётся красным", matchFood("яблоко")?.name === "Яблоко", matchFood("яблоко")?.name);
check("груша не яблоко", matchFood("груша")?.name === "Груша", matchFood("груша")?.name);

check("куриная грудка не просто курица", matchFood("куриная грудка")?.name === "Куриная грудка", matchFood("куриная грудка")?.name);
check("греческий йогурт не обычный", matchFood("греческий йогурт")?.name === "Греческий йогурт", matchFood("греческий йогурт")?.name);
check("обычный йогурт остаётся", matchFood("йогурт")?.name === "Йогурт", matchFood("йогурт")?.name);
check("творог обезжиренный находится", matchFood("творог обезжиренный")?.name === "Творог обезжиренный", matchFood("творог обезжиренный")?.name);
check("просто творог не уезжает в 0%", matchFood("творог")?.name === "Творог", matchFood("творог")?.name);
check("киноа в справочнике", matchFood("киноа")?.name === "Киноа", matchFood("киноа")?.name);
check("чечевица в справочнике", matchFood("чечевица")?.name === "Чечевица", matchFood("чечевица")?.name);
check("батат не картофель", matchFood("батат")?.name === "Батат", matchFood("батат")?.name);
check("хлебцы не хлеб", matchFood("хлебцы")?.name === "Хлебцы", matchFood("хлебцы")?.name);
check("цельнозерновой хлеб находится", matchFood("хлеб цельнозерновой")?.name === "Хлеб цельнозерновой", matchFood("хлеб цельнозерновой")?.name);
check("папайя не сом там", matchFood("папайя")?.name === "Папайя", matchFood("папайя")?.name);
check("хумус в справочнике", matchFood("хумус")?.name === "Хумус", matchFood("хумус")?.name);
check("тёмный шоколад не молочный", matchFood("тёмный шоколад")?.name === "Шоколад тёмный", matchFood("тёмный шоколад")?.name);
const saladCarrot = macrosFromItems([{ name: "салат из зелени и моркови", grams: 180 }]);
check("салат с морковью остаётся салатом", /салат/i.test(saladCarrot?.name ?? ""), saladCarrot?.name);
near("куриная грудка 150 г ≈ 248 ккал", macrosFromItems([{ name: "куриная грудка", grams: 150 }])?.kcal ?? 0, 248, 0.05);

for (const name of Object.keys(STAPLE_ROLE)) {
  check(`основной продукт «${name}» есть в справочнике`, FOODS.some((f) => f.name === name && f.role === STAPLE_ROLE[name]));
}
check("печенье не в основных", !FOODS.find((f) => f.name === "Печенье")?.role);
check("кола не в основных", !FOODS.find((f) => f.name === "Кола")?.role);
check("наггетсы не в основных", !FOODS.find((f) => f.name === "Наггетсы")?.role);
check("отруби в клетчатке", matchFood("отруби")?.name === "Отруби" && matchFood("отруби")?.role === "fiber");
check("лён отдельно от чиа", matchFood("льняное семя")?.name === "Льняное семя", matchFood("льняное семя")?.name);
check("фото печенья по-прежнему находится", matchFood("печенье")?.name === "Печенье", matchFood("печенье")?.name);

const saladShot = macrosFromItems([
  {
    name: "салат из зелени, помидоров черри, кукурузы, моркови, перепелиных яиц, сухариков и соуса",
    grams: 350,
  },
]);
check("салат не чипсы", !/чипс/i.test(saladShot?.name ?? ""), saladShot?.name);
check("салат не сухарики пакетом", !/^Сухарик/i.test(saladShot?.name ?? ""), saladShot?.name);
check("салат не 1800 ккал", (saladShot?.kcal ?? 9999) < 600, String(saladShot?.kcal));

const colaZero = macrosFromItems([{ name: "кола", grams: 330, kcal100: 0.3, p100: 0, f100: 0, c100: 0 }]);
check("0 ккал на этикетке это кола без сахара", /без сахара/i.test(colaZero?.name ?? ""), colaZero?.name);
near("кола без сахара почти 0 ккал", colaZero?.kcal ?? 99, 1, 3);

const colaSugar = macrosFromItems([{ name: "кола", grams: 325 }]);
check("обычная кола остаётся с сахаром", colaSugar?.name?.toLowerCase().includes("кола") && !/без сахара/i.test(colaSugar?.name ?? ""), colaSugar?.name);
near("обычная кола 325 мл ≈ 136 ккал", colaSugar?.kcal ?? 0, 136, 0.1);

const colaNamed = macrosFromItems([{ name: "coca cola zero", grams: 330 }]);
check("zero в названии это кола без сахара", /без сахара/i.test(colaNamed?.name ?? ""), colaNamed?.name);

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
// Слова модели и наша строка про точность — разные поля: в объяснении человек
// может оспорить первое и не может второе. Склеенные, они обрезались по 120
// символов, и способ приготовления часто отрезало на середине слова.
check("замечание модели сохранено отдельно", /тара пустая/.test(bottle.meal?.said ?? ""), bottle.meal?.said);
check("наша строка про точность не затёрта", /RASCHET/.test(bottle.meal?.note ?? ""), bottle.meal?.note);

// ── Состав расчёта: объяснение перед записью ─────────────────────────────────
// Одна цифра непроверяема: по «240 ккал» нельзя понять, что принято за курицу и
// сколько насчитано масла. Поэтому у приёма есть позиции, и они должны сходиться
// с итогом — иначе объяснение будет расходиться с записью в дневнике.
const explained = macrosFromText("курица жареная 200 г, рис 150 г");
check("у приёма есть состав", (explained?.parts ?? []).length === 2, String(explained?.parts?.length));
if (explained?.parts?.length === 2) {
  const sum = explained.parts.reduce((a, p) => a + p.kcal, 0);
  near("состав сходится с итогом", sum, explained.kcal, 0.03);
  check(
    "в составе указан вес каждой позиции",
    explained.parts.every((p) => p.grams > 0),
    JSON.stringify(explained.parts)
  );
  check(
    "цифры из справочника помечены источником",
    explained.parts.every((p) => p.source === "catalog"),
    JSON.stringify(explained.parts.map((p) => p.source))
  );
}

const labelParts = macrosFromItems([
  { name: "курица отварная", grams: 150 },
  { name: "напиток zyntra", grams: 80, kcal100: 65, p100: 1.2, f100: 0.1, c100: 15 },
]);
check(
  "цифры с упаковки честно помечены",
  (labelParts?.parts ?? []).some((p) => p.source === "label"),
  JSON.stringify(labelParts?.parts?.map((p) => p.source))
);
check(
  "справочник и этикетка в одном составе не смешиваются по источнику",
  (labelParts?.parts ?? []).filter((p) => p.source === "catalog").length === 1,
  JSON.stringify(labelParts?.parts?.map((p) => p.source))
);

const unknownJar = fromModel('{"items":[{"name":"напиток zyntra","grams":80,"kcal100":65,"p100":1.2,"f100":0.1,"c100":15}],"note":"по этикетке"}');
check("незнакомая упаковка с этикеткой записывается", unknownJar.meal !== undefined, String(unknownJar.error?.message));
near("этикетка: 80 мл × 65 ккал", unknownJar.meal?.kcal ?? 0, 52, 0.1);

const unknownNoNumbers = fromModel('{"items":[{"name":"напиток zyntra","grams":80}]}');
check("без цифр отказ остаётся отказом", unknownNoNumbers.error !== undefined);
check(
  "в отказе видно, что модель разглядела",
  /zyntra/i.test(unknownNoNumbers.error?.seen ?? ""),
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

// ── Подтверждение разбора ────────────────────────────────────────────────────
// Токен одноразовый: двойной тап по «Да, записать» или повтор запроса не должны
// давать две записи об одной тарелке. Это дешёвая ошибка по коду и дорогая по
// последствиям — день выходит вдвое калорийнее, чем был.
const sample = macrosFromText("курица жареная 200 г");
const tok = putPending(1001, sample, "2026-08-19", "photo");
const first = takePending(1001, tok);
const second = takePending(1001, tok);
check("подтверждение возвращает разбор", first?.meal?.kcal === sample.kcal, String(first?.meal?.kcal));
check("день подтверждения сохранён", first?.date === "2026-08-19", first?.date);
check("повторное подтверждение ничего не пишет", second === null, JSON.stringify(second));

const tok2 = putPending(1002, sample, "2026-08-19", "text");
check("чужой токен не принимается", takePending(1003, tok2) === null);
check("свой токен после этого цел", takePending(1002, tok2) !== null);

const tok3 = putPending(1004, sample, "2026-08-19", "text");
dropPending(1004, tok3);
check("отказ выбрасывает разбор", takePending(1004, tok3) === null);

// ── Состав строками: один текст в боте и приложении ──────────────────────────
const lines = mealPartLines(explained);
check("строки состава по позиции", lines.length === 2, JSON.stringify(lines));
check("в строке есть граммы и калории", /\d+ г, \d+ ккал/.test(lines[0] ?? ""), lines[0]);
check(
  "источник с упаковки виден в строке",
  mealPartLines(labelParts).some((l) => /с упаковки/.test(l)),
  JSON.stringify(mealPartLines(labelParts))
);
// Пометка только у исключения: если подписывать и справочник, пометка перестаёт
// что-либо значить — она будет у каждой строки.
check(
  "справочник не подписывается в каждой строке",
  lines.every((l) => !/справочник/.test(l)),
  JSON.stringify(lines)
);

// ── Справочник цел ───────────────────────────────────────────────────────────
check("арахисовая паста не путается с пастой отварной", matchFood("арахисовая паста")?.name === "Арахисовая паста");
check("жидкий белок опознан", matchFood("жидкий белок")?.name === "Белок яичный жидкий");
check("скуп протеина опознан", matchFood("протеин")?.name === "Протеин");

if (failed) {
  console.error(`\ncheck-foods: ${failed} провал(ов)`);
  process.exit(1);
}
console.log("check-foods: разбор бытовых мер в порядке");
