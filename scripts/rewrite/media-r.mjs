/**
 * Живой материал под посты канала: id сообщения → реальный кадр или клип.
 *
 * Карта пересобрана 19.08.2026 после разбора по кадрам. Первый отбор шел по
 * именам файлов и одному кадру на клип, и это дало прямые несовпадения:
 * под «Гирей» стоял человек у стойки со штангой, под «Коленями» проход к
 * зеркалу, под «Становой» тот же кадр у стойки, что и под «Базой».
 * Плюс два поста получили один и тот же клип: box-jump и back-squat это одна
 * съемка.
 *
 * Что выяснилось про имена файлов на сайте (проверено полосой из пяти кадров,
 * скрипт scripts/clip-strips.ps1):
 *
 *   deadlift, barbell-row, romanian-deadlift, barbell-curl   человек стоит у
 *       стойки и держит гриф, самого подъема в кадре нет; последние два это
 *       вообще один файл побайтно
 *   kettlebell-swing   стоит в зале с мелким предметом, маха нет
 *   jump-rope          стоит на дорожке со скакалкой в руках, прыжка нет
 *   walking-lunge      идет к зеркалу и опускается на колено, выпадов нет
 *   glute-bridge, overhead-press   надевает кистевые бинты на лавке
 *   assault-bike       пустое поле на закате, человека в кадре нет
 *   bulgarian-split-squat, lateral-raise   наклонный жим гантелей, один файл
 *   pallof-press       движение на поле, не пресс
 *   russian-twist, diamond-push-up, pike-push-up   отжимания на упорах
 *   band-pull-apart, band-row, face-pull, rear-delt-fly   один файл на четверых
 *   air-squat, burpee, shadow-boxing   берпи на поле у ворот
 *
 * Три источника:
 *   clip   съемка упражнения, уже 720x1280 и без звука, копируется как есть
 *   loc    кусок видео обрезается по времени (виды Пхукета либо нужный
 *          фрагмент съемки, когда в клипе полезна только часть)
 *   photo  предметный кадр из assets/rewrite-photos, когда живого материала
 *          под тему в архиве нет
 *
 * Чего в архиве нет совсем, поэтому темы остаются на предметном кадре:
 * мах гири, становая с пола, присед крупно на стопу и колено, прыжки на
 * скакалке. Список ушел в Desktop/ВИДЕО-В-ШТАБ/ЧТО СНЯТЬ.md.
 */

const CLIPS = "C:/Users/admin/OneDrive/Desktop/CURSOR/public/video/artur/exercises";
const ARCH = "C:/Users/admin/OneDrive/Desktop/CONTENT/brand/media-archive/master/videos";
const STILL = "assets/rewrite-photos";

export const MEDIA = {
  // Простые базовые движения под текст о том, что усложнять нечего.
  // Раньше тут стоял box-jump, а это тот же файл, что у поста 52.
  9: { type: "clip", src: `${CLIPS}/dip.mp4`, out: "r09-dip.mp4", note: "брусья" },

  46: { type: "loc", src: `${ARCH}/IMG_2092.MOV`, out: "r46-predawn-bay.mp4", ss: 4, dur: 8, note: "залив до рассвета" },
  51: { type: "clip", src: `${CLIPS}/band-shoulder-dislocate.mp4`, out: "r51-band-shoulders.mp4", note: "резина на плечи" },
  52: { type: "clip", src: `${CLIPS}/back-squat.mp4`, out: "r52-back-squat.mp4", note: "присед в глубину" },
  53: { type: "clip", src: `${CLIPS}/negative-pull-up.mp4`, out: "r53-negative-pullup.mp4", note: "выход на перекладину" },
  61: { type: "loc", src: `${ARCH}/IMG_1385.MOV`, out: "r61-beach.mp4", ss: 1.5, dur: 8, note: "пляж днем" },
  62: { type: "clip", src: `${CLIPS}/farmers-carry.mp4`, out: "r62-farmers-carry.mp4", note: "переноска гантелей" },
  64: { type: "clip", src: `${CLIPS}/shadow-boxing.mp4`, out: "r64-outdoor-field.mp4", note: "работа на поле, а не в кондиционере" },

  // Текст перечисляет жим как базу, которая идет первой. Раньше стоял barbell-row,
  // где Артур просто стоит у стойки и держит гриф.
  71: { type: "clip", src: `${CLIPS}/incline-bench-press.mp4`, out: "r71-bench-press.mp4", note: "жим лежа, база" },

  79: { type: "clip", src: `${CLIPS}/hip-90-90-stretch.mp4`, out: "r79-mobility.mp4", note: "мобильность на полу" },
  80: { type: "shot", src: `${ARCH}/IMG_2104.MOV`, out: "r80-viewpoint.jpg", ss: 1, note: "смотровая над заливом" },

  // Пост прямо про угол жима, поэтому наклонный жим гантелей, а не горизонтальный.
  82: { type: "clip", src: `${CLIPS}/bulgarian-split-squat.mp4`, out: "r82-incline-db-press.mp4", note: "наклонный жим гантелей" },

  // Становой в архиве нет. Пробовал подставить работу на наклонной скамье,
  // но в кадр попадают только ноги, и без подписи это читается как что угодно.
  // Предметный кадр честнее подмены.
  83: { type: "photo", src: `${STILL}/deadlift-floor.png`, out: "r83-deadlift-floor.png", note: "становой в архиве нет" },

  84: { type: "photo", src: `${STILL}/kettlebells.png`, out: "r84-kettlebells.png", note: "маха гири в архиве нет" },

  // Прыжков на скакалке в архиве нет: вся сессия IMG_309x это разминка,
  // растяжка с верёвкой и бой с тенью. Взят другой кадр той же сессии,
  // стадион на закате, скакалка в руках.
  85: { type: "loc", src: `${ARCH}/IMG_3098.MP4`, out: "r85-rope-sunset.mp4", ss: 42, dur: 8, note: "стадион на закате, скакалка" },

  87: { type: "loc", src: `${ARCH}/IMG_8244.MP4`, out: "r87-night-track.mp4", ss: 3, dur: 8, note: "стадион в сумерках" },
  88: { type: "shot", src: `${ARCH}/IMG_2663.MOV`, out: "r88-cafe-plate.jpg", ss: 1.4, note: "тарелка в тайском кафе" },

  // Текст называет планку первой. Раньше стоял russian-twist, где на самом
  // деле отжимания на упорах.
  89: { type: "clip", src: `${CLIPS}/plank.mp4`, out: "r89-plank.mp4", note: "планка" },

  90: { type: "photo", src: `${STILL}/stairs-down.png`, out: "r90-stairs.png", note: "приседа крупно на стопу нет, текст про лестницу" },
};
