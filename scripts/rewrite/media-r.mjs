/**
 * Живой материал под посты канала: id сообщения → реальный кадр или клип.
 *
 * Три источника:
 *   clip  это съемка упражнения из CURSOR/public/video/artur/exercises,
 *   loc   это кусок видео из мастер-архива (виды Пхукета),
 *   shot  это один кадр из архивного видео, когда исходник слишком короткий
 *         для нормального клипа (два-три секунды в ленте смотрятся обрывком).
 *
 * Имена файлов на сайте местами врут: assault-bike это план поля на закате без
 * упражнения, bulgarian-split-squat и lateral-raise это наклонный жим гантелей.
 * Подбор сделан по тому, что реально в кадре.
 *
 * Посты, которых тут нет, остаются с предметными кадрами из assets/rewrite-photos:
 * под белок, воду, креатин и сон живого материала в архиве не нашлось.
 */

const CLIPS = "C:/Users/admin/OneDrive/Desktop/CURSOR/public/video/artur/exercises";
const ARCH = "C:/Users/admin/OneDrive/Desktop/CONTENT/brand/media-archive/master/videos";

export const MEDIA = {
  9: { type: "clip", src: `${CLIPS}/box-jump.mp4`, out: "r09-box-jump.mp4", note: "прыжок на тумбу" },
  46: { type: "loc", src: `${ARCH}/IMG_2092.MOV`, out: "r46-predawn-bay.mp4", ss: 4, dur: 8, note: "залив до рассвета" },
  51: { type: "clip", src: `${CLIPS}/band-shoulder-dislocate.mp4`, out: "r51-band-shoulders.mp4", note: "резина на плечи" },
  52: { type: "clip", src: `${CLIPS}/back-squat.mp4`, out: "r52-back-squat.mp4", note: "присед" },
  53: { type: "clip", src: `${CLIPS}/negative-pull-up.mp4`, out: "r53-negative-pullup.mp4", note: "негативы на турнике" },
  61: { type: "loc", src: `${ARCH}/IMG_1385.MOV`, out: "r61-beach.mp4", ss: 1.5, dur: 8, note: "пляж днем" },
  62: { type: "clip", src: `${CLIPS}/farmers-carry.mp4`, out: "r62-farmers-carry.mp4", note: "переноска, плотная работа" },
  64: { type: "clip", src: `${CLIPS}/shadow-boxing.mp4`, out: "r64-shadow-boxing.mp4", note: "работа на поле, а не в кондиционере" },
  71: { type: "clip", src: `${CLIPS}/barbell-row.mp4`, out: "r71-barbell-row.mp4", note: "штанга, база" },
  79: { type: "clip", src: `${CLIPS}/hip-90-90-stretch.mp4`, out: "r79-mobility.mp4", note: "мобильность на полу" },
  80: { type: "shot", src: `${ARCH}/IMG_2104.MOV`, out: "r80-viewpoint.jpg", ss: 1, note: "смотровая над заливом, длинный горизонт" },
  82: { type: "clip", src: `${CLIPS}/incline-bench-press.mp4`, out: "r82-incline-press.mp4", note: "наклонный жим" },
  83: { type: "clip", src: `${CLIPS}/deadlift.mp4`, out: "r83-deadlift.mp4", note: "штанга с пола" },
  84: { type: "clip", src: `${CLIPS}/kettlebell-swing.mp4`, out: "r84-kettlebell.mp4", note: "гиря" },
  85: { type: "clip", src: `${CLIPS}/jump-rope.mp4`, out: "r85-jump-rope.mp4", note: "скакалка на стадионе" },
  87: { type: "loc", src: `${ARCH}/IMG_8244.MP4`, out: "r87-night-track.mp4", ss: 3, dur: 8, note: "стадион в сумерках" },
  88: { type: "shot", src: `${ARCH}/IMG_2663.MOV`, out: "r88-cafe-plate.jpg", ss: 1.4, note: "тарелка в тайском кафе" },
  89: { type: "clip", src: `${CLIPS}/russian-twist.mp4`, out: "r89-core.mp4", note: "работа корпуса" },
  90: { type: "clip", src: `${CLIPS}/walking-lunge.mp4`, out: "r90-lunges.mp4", note: "выпады" },
};
