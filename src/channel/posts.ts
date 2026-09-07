/** Посты @kingmode_fit, фото: assets/channel/{id}.ext через photo-map.json */

import { POST_CLOSINGS } from "./post-closings";
import { finalizeChannelPosts } from "./validate-posts";
import { CHANNEL_POSTS_WAVE5 } from "./posts-wave5";
import { CHANNEL_POSTS_WAVE6 } from "./posts-wave6";
import { CHANNEL_POSTS_WAVE7 } from "./posts-wave7";
import { CHANNEL_POSTS_WAVE8 } from "./posts-wave8";
import { CHANNEL_POSTS_WAVE9 } from "./posts-wave9";

export interface ChannelPost {
  id: string;
  title: string;
  body: string;
  /** Явные части, две или три, приоритетнее автоматического разбиения body */
  parts?: string[];
  /** Локальная копия для Railway: assets/channel/{id}.ext */
  image?: string;
  /** Твое фото: путь от media-archive/ */
  archiveImage?: string;
  /** Запас: generated/ в media-archive (только если нет своего) */
  generatedImage?: string;
  /** Кнопка «Забрать гайд» ведет на t.me/bot?start=guide_7day и подобные */
  guideStart?: string;
}

/**
 * Автопост: только то, чего в канале еще не было.
 *
 * Базовые 13 постов выведены из очереди сознательно. Они уже опубликованы летом,
 * а их тексты переписаны прямо в существующих сообщениях канала, старые даты сохранены
 * (scripts/rewrite-published.mjs). Вернуть их в очередь значит выдать дубли:
 * отметки об опубликованном в data.json на томе Railway однажды уже терялись,
 * и защита «не повторять» на пустом состоянии не срабатывает.
 *
 * Волны extra / more / wave4 / bank написаны по старому шаблону и в очередь не входят:
 * стандарт текста сменился (Marketing/research/КОНТЕНТ-СИСТЕМА.md).
 * Разборы лежат в posts-analysis.ts, тоже не в очереди.
 */
/**
 * Волны чередуются, а не идут подряд. При трех постах в день подряд идущая волна
 * означает три поста про питание в один день, читателю это выглядит как рассылка.
 * Чередование дает в дне тренировку, питание и восстановление.
 */
function interleave(...waves: ChannelPost[][]): ChannelPost[] {
  const out: ChannelPost[] = [];
  const depth = Math.max(...waves.map((w) => w.length));
  for (let i = 0; i < depth; i++) {
    for (const wave of waves) if (wave[i]) out.push(wave[i]);
  }
  return out;
}

/**
 * Проверено вручную 01.09.2026: у этих постов фото не подходит совсем,
 * либо фейковый ИИ-человек (не Артур), либо не по теме (зеркальное селфи
 * в зале вместо еды, рынка, вида или дороги). Держим id вне очереди,
 * пока не найдется или не снимется настоящее подходящее фото.
 */
const PHOTO_MISMATCH_HOLD = new Set([
  "w7_jumprope",
  "w7_sleep_deep",
  "w8_beach_walk",
  "w8_street_food",
  "w8_view_hill",
  "w8_night_food",
  "w8_coast_road",
  "w8_market_morning",
]);

/**
 * Волна 9 (07.09.2026): решено публиковать без фото, а не подбирать случайное
 * архивное фото под абстрактную психологическую тему. Подобранное "лишь бы было"
 * фото несет тот же риск несоответствия, что и PHOTO_MISMATCH_HOLD выше, только
 * на входе, а не после ручной проверки. check-channel-posts.mjs пропускает для
 * этих id требование archiveImage/photo-map. Если найдутся подходящие настоящие
 * кадры, нужно добавить archiveImage и убрать id отсюда.
 */
export const TEXT_ONLY_POSTS = new Set(
  CHANNEL_POSTS_WAVE9.map((p) => p.id)
);

const CHANNEL_POSTS_RAW: ChannelPost[] = interleave(
  CHANNEL_POSTS_WAVE5,
  CHANNEL_POSTS_WAVE6,
  CHANNEL_POSTS_WAVE7,
  CHANNEL_POSTS_WAVE8,
  CHANNEL_POSTS_WAVE9
).filter((p) => !PHOTO_MISMATCH_HOLD.has(p.id));

/** Уникальная концовка по id, а не общий шаблон на все посты. */
function withClosing(post: ChannelPost): ChannelPost {
  if (post.parts?.length) return post;
  const closing = POST_CLOSINGS[post.id];
  if (!closing) return post;
  const head = closing.slice(0, 40);
  if (post.body.includes(head)) return post;
  const body = `${post.body}\n\n${closing}`;
  return { ...post, body };
}

export const CHANNEL_POSTS: ChannelPost[] = finalizeChannelPosts(
  CHANNEL_POSTS_RAW.map(withClosing)
);
