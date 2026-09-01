# Воронка «Старт 3 дня»

Бесплатный вход для аудитории «снова начинаю». Модель как у mass-market коучей, голос KINGMODE.

## Уровни

| Уровень | Что | Ссылка |
|---------|-----|--------|
| Канал | 3 прогрев-поста (`restart_*`) | @kingmode_fit |
| Бесплатно | 3 дня в боте | `t.me/Raschettbot?start=restart_3d` |
| Платно | 30 дней шаг за шагом | `RESTART_PAID_URL` или личка «СТАРТ30» |

Полная программа закрытого канала: `docs/closed-channel-30days.md`, код `src/closed-program.ts`, экспорт `node scripts/export-closed-channel.mjs`.

## Бот

- `/restart` — текущий день
- Кнопка «Сделал сегодня» — закрыть день (1 раз в сутки)
- 08:00 Bangkok — напоминание, если вчера отметил, сегодня еще нет
- После 3 дней — оффер платного цикла

## Env

```
RESTART_PAID_URL=https://t.me/+xxxx   # закрытый канал / бот оплаты
RESTART_PAID_LABEL=30 дней шаг за шагом
RESTART_PAID_PRICE=990 ₽/мес          # текст в оффере, необязательно
```

## Код

- `src/restart-program.ts` — контент дней
- `src/restart-bot.ts` — handlers
- `src/channel/posts-restart.ts` — посты в начале очереди

## Проверка

```
npm run build
node -e "import('./dist/restart-program.js').then(m=>console.log(m.RESTART_DAYS.length))"
```

Диплинк в Telegram: `?start=restart_3d`
