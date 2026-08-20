/**
 * Полка магазинов: штрихкод → цифры и фото упаковки.
 *
 * «Все товары Tops и 7-Eleven» руками не внести: это тысячи SKU, которые
 * меняются каждую неделю. Здесь лежат частые позиции Таиланда (7-Eleven, Tops)
 * и России, которые уже проверены в открытой базе. Остальное находится по
 * штрихкоду в Open Food Facts в момент фото: там же живое фото с полки.
 *
 * Поиск по названию в общей базе не используем: один запрос даёт три разных
 * продукта. Код однозначен.
 */

import type { ProductFacts } from "./product-db";

export interface ShelfProduct extends ProductFacts {
  code: string;
  country: "th" | "ru";
}

export const STORE_SHELF: ShelfProduct[] = [
  {
    code: "8851123237000",
    country: "th",
    name: "C-vitt Lemon",
    kcal100: 28.6,
    p100: 0,
    f100: 0,
    c100: 7.1,
    servingG: 140,
    imageUrl: "https://images.openfoodfacts.org/images/products/885/112/323/7000/front_th.4.200.jpg",
  },
  {
    code: "8851959132012",
    country: "th",
    name: "Coca-Cola Thailand",
    kcal100: 30.8,
    p100: 0,
    f100: 0,
    c100: 7.4,
    servingG: 325,
    imageUrl: "https://images.openfoodfacts.org/images/products/885/195/913/2012/front_en.36.200.jpg",
  },
  {
    code: "8854698005050",
    country: "th",
    name: "Oishi Green Tea",
    kcal100: 14,
    p100: 0,
    f100: 0,
    c100: 3.6,
    servingG: 500,
    imageUrl: "https://images.openfoodfacts.org/images/products/885/469/800/5050/front_en.72.200.jpg",
  },
  {
    code: "8854698005043",
    country: "th",
    name: "Oishi Green Tea Honey Lemon",
    kcal100: 32,
    p100: 0,
    f100: 0,
    c100: 7.6,
    servingG: 500,
    imageUrl: "https://images.openfoodfacts.org/images/products/885/469/800/5043/front_en.106.200.jpg",
  },
  {
    code: "8854698018265",
    country: "th",
    name: "Oishi Green Tea 0%",
    kcal100: 0,
    p100: 0,
    f100: 0,
    c100: 0,
    servingG: 500,
    imageUrl: "https://images.openfoodfacts.org/images/products/885/469/801/8265/front_en.17.200.jpg",
  },
  {
    code: "8851717020117",
    country: "th",
    name: "Dutch Mill Strawberry",
    kcal100: 104,
    p100: 3.2,
    f100: 1.6,
    c100: 20,
    servingG: 135,
    imageUrl: "https://images.openfoodfacts.org/images/products/885/171/702/0117/front_th.4.200.jpg",
  },
  {
    code: "8851952101312",
    country: "th",
    name: "Est Cola",
    kcal100: 44,
    p100: 0,
    f100: 0,
    c100: 10.8,
    servingG: 250,
    imageUrl: "https://images.openfoodfacts.org/images/products/885/195/210/1312/front_en.8.200.jpg",
  },
  {
    code: "5449000000996",
    country: "ru",
    name: "Coca-Cola",
    kcal100: 42,
    p100: 0,
    f100: 0,
    c100: 10.6,
    servingG: 330,
    imageUrl: "https://images.openfoodfacts.org/images/products/544/900/000/0996/front_en.1107.200.jpg",
  },
  {
    code: "4607053473537",
    country: "ru",
    name: "Простоквашино молоко 3.2%",
    kcal100: 63,
    p100: 3.2,
    f100: 3.5,
    c100: 4.7,
    servingG: 200,
    imageUrl: "https://images.openfoodfacts.org/images/products/460/705/347/3537/front_ru.77.200.jpg",
  },
  {
    code: "4690502002303",
    country: "ru",
    name: "Простоквашино молоко 1.5%",
    kcal100: 45,
    p100: 2.9,
    f100: 1.5,
    c100: 4.9,
    servingG: 200,
    imageUrl: "https://images.openfoodfacts.org/images/products/469/050/200/2303/front_en.3.200.jpg",
  },
  {
    code: "4607042434877",
    country: "ru",
    name: "Добрый сок яблочный",
    kcal100: 42,
    p100: 0,
    f100: 0,
    c100: 10.5,
    servingG: 200,
    imageUrl: "https://images.openfoodfacts.org/images/products/460/704/243/4877/front_ru.5.200.jpg",
  },
];

const BY_CODE = new Map(STORE_SHELF.map((p) => [p.code, p]));

export function shelfByCode(code: string): ShelfProduct | null {
  return BY_CODE.get(code) ?? null;
}
