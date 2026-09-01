# Отчёт: медиа @kingmode_fit — утро 21.08.2026

Для проверки Артуром. Всё ниже подтверждено командами, не «на словах».

---

## 0. Исправление 21.08 — стройка убрана

**Проблема:** пост «Пхукет до восьми утра» (#103) показывал `akf-site-dawn.png` — AI-кадр стройплощадки. Тема закрыта в фактуре.

**Замены:**
| пост | было | стало |
|------|------|-------|
| w8_dawn_phuket | akf-site-dawn.png | full-9403-t128s.jpg (рассвет у стадиона, архив) |
| w5_case_start | akf-basement-gym.png | prog-bg-6-gym.png (зал, ещё не выходил) |

**Живой канал:** `#103` перефотоен (`fix-channel-photos.mjs 103` → OK).

**Блокировка повтора:** `scripts/banned-channel-sources.mjs` + проверка в `check-channel-media.mjs` (в `npm run build`).

---

## 1. Что сделано за ночь

### Канал (уже опубликованное)
- **36 photo-постов** проверены, **9 фото** обновлены на канале (#54–56, #63, #65, #69, #72, #77, #102)
- **17 video-постов** переприменены (#9, #46, #51–53, #61–62, #64, #71, #79, #81–85, #87, #89)
- Логи: `.tmp-e2e/fix-photos-apply.log`, `.tmp-e2e/replace-media-apply.log`

### Репозиторий (чтобы не возвращаться к проблеме)
| Файл | Зачем |
|------|--------|
| `scripts/channel-photo-assignments.mjs` | 1 message_id / queue_id → 1 файл |
| `scripts/check-channel-media.mjs` | жёсткая проверка при `npm run build` |
| `scripts/check-photo-map-unique.mjs` | у очереди каждый пост — свой исходник в архиве |
| `scripts/sync-queue-photos.mjs` | копирует фото очереди, **не** сносит legacy-файлы |
| `scripts/fix-duplicate-assets.mjs` | пересборка дублей в assets/channel |
| `src/channel/posts-wave7.ts` | **+6 постов** в автопост (35 в очереди) |

### Повторная проверка (финал)
```
npm run build
→ OK: 35 posts, 35 unique photos
→ OK: queue 35 unique archive sources
→ OK: media — 0 dupes in assets/channel
node scripts/audit-channel-photos.mjs → 0 групп дублей
```

---

## 2. Три правила (теперь в коде)

1. **Смысл** — кадр по теме поста (`PHOTO_ASSIGNMENTS`, `media-r.mjs`, `WAVE*_PHOTOS`)
2. **Уникальность** — один hash = один пост; build падает при дубле
3. **Без противоречия** — видео для движения, generated/food для питания, не штанга под «белок»

---

## 3. Очередь автопоста (45 постов)

Чередование: **w5 → w8 → w6 → w7**. При 3 постах в день:
1. тренировка / фактура (w5)
2. **жизнь в Таиланде (w8)**
3. питание (w6)

**Wave8 (10 постов, новые):**
| id | тема |
|----|------|
| w8_dawn_phuket | Пхукет до 8 утра |
| w8_beach_walk | пляжная дорожка |
| w8_street_food | уличная еда |
| w8_view_hill | смотровая |
| w8_monsoon | сезон дождей |
| w8_night_food | вечерний рынок |
| w8_outdoor_gym | турник у моря |
| w8_coast_road | дорога вдоль coast |
| w8_market_morning | утренний рынок |
| w8_bay_evening | залив вечером |

Файл: `src/channel/posts-wave8.ts`

---

## 4. Чеклист проверки утром (5–10 мин)

### Критичные посты (раньше были ошибки)
- [ ] **#54** Питание — meal prep, не «та же еда что дефicit»
- [ ] **#55** Белок — шейк/протеин (не дубль #99)
- [ ] **#56** Дефицит — весы, не тарелка
- [ ] **#63** Что мерить — дневник/запись
- [ ] **#72** Частота — frequency (не скотч, не блокнот)
- [ ] **#77** Креатин — совок порошка
- [ ] **#85** Скакалка — прыжки на дорожке
- [ ] **#79** Мобильность — присед, не планка
- [ ] **#89** Пресс — планка (видео)
- [ ] **#94** Жара — рассвет/дорожка
- [ ] **#97** Полтора часа — разминка с резиной (не AI-пальмы)

### Формат
- [ ] Вертикаль 1024×1536, чёрные края (#100 «Без алкоголя» как эталон)

---

## 5. Как добавлять посты дальше (без регресса)

```
1. Текст + уникальный archiveImage в posts-waveN.ts
2. node scripts/sync-queue-photos.mjs
3. npm run build   ← упадёт, если дубль или нет файла
4. Опубликованный rewrite: PHOTO_ASSIGNMENTS или media-r.mjs
5. node scripts/fix-channel-photos.mjs ID  или  replace-media --apply ID
```

**Не запускать** `assign-channel-photos.mjs` — он удаляет legacy-обложки (nutrition.jpeg и др.).

---

## 6. Если что-то не зайдёт

| Пост | Быстрый fix |
|------|-------------|
| #72 Частота | сгенерировать схему upper/lower 2× |
| Любой queue | другой generated из `CONTENT/.../generated/` |
| Видео | правка `media-r.mjs` + `prep-media` + `replace-media --apply` |

---

## 7. Артефакты

- Карта назначений: `scripts/channel-photo-assignments.mjs`
- Аудит: `node scripts/audit-channel-photos.mjs`
- Штаб: `главный/REPORTS/KINGMODE.md` (запись 20.08.2026)
