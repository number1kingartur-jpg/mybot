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

const WEBAPP = "C:/Users/admin/OneDrive/Desktop/BABKI/mybot/webapp/video/ex";
const ARCH = "C:/Users/admin/OneDrive/Desktop/CONTENT/brand/media-archive";
const STILL = "assets/rewrite-photos";
const GEN = "C:/Users/admin/OneDrive/Desktop/CONTENT/brand/media-archive/generated/akf-2026-08";

export const MEDIA = {
  9: { type: "clip", src: `${WEBAPP}/vis-na-turnike.mp4`, out: "r09-dip.mp4", note: "брусья/турник" },

  46: { type: "loc", src: `${ARCH}/master/videos/IMG_2092.MOV`, out: "r46-predawn-bay.mp4", ss: 4, dur: 8, note: "залив до рассвета" },
  51: { type: "clip", src: `${WEBAPP}/razgibanie-ruk-s-kanatom.mp4`, out: "r51-band-shoulders.mp4", note: "резина, плечи" },
  52: { type: "clip", src: `${WEBAPP}/prisedaniya-s-gantelyu-u-grudi.mp4`, out: "r52-back-squat.mp4", note: "присед" },
  53: { type: "clip", src: `${WEBAPP}/podtyagivaniya.mp4`, out: "r53-negative-pullup.mp4", note: "подтягивания" },
  61: { type: "loc", src: `${ARCH}/master/videos/IMG_1385.MOV`, out: "r61-beach.mp4", ss: 1.5, dur: 8, note: "пляж днем" },
  62: { type: "clip", src: `${WEBAPP}/tyaga-ganteli-v-naklone.mp4`, out: "r62-farmers-carry.mp4", note: "тяга/носиль" },
  64: { type: "clip", src: `${WEBAPP}/zhim-giri-stoya.mp4`, out: "r64-outdoor-field.mp4", note: "работа с гирей" },

  71: { type: "clip", src: `${WEBAPP}/zhim-ganteley-lezha.mp4`, out: "r71-bench-press.mp4", note: "жим лежа" },

  79: { type: "clip", src: `${WEBAPP}/planka.mp4`, out: "r79-mobility.mp4", note: "кор/планка" },
  80: { type: "shot", src: `${ARCH}/master/videos/IMG_2104.MOV`, out: "r80-viewpoint.jpg", ss: 1, note: "смотровая" },

  81: { type: "photo", src: `${GEN}/akf-lowback-blocks.png`, out: "r81-joint-care.png", note: "суставы, обход" },

  82: { type: "clip", src: `${WEBAPP}/zhim-ganteley-na-naklonnoy.mp4`, out: "r82-incline-db-press.mp4", note: "наклонный жим" },

  83: { type: "clip", src: `${WEBAPP}/stanovaya-tyaga.mp4`, out: "r83-deadlift.mp4", note: "становая, Артур" },

  84: { type: "clip", src: `${WEBAPP}/mahi-girey.mp4`, out: "r84-kettlebell-swing.mp4", note: "мах гири" },

  85: { type: "loc", src: `${ARCH}/master/videos/IMG_3098.MP4`, out: "r85-rope-sunset.mp4", ss: 42, dur: 8, note: "скакалка, стадион" },

  86: { type: "photo", src: `${GEN}/prog-bg-8-notebook.png`, out: "r86-periodization.png", note: "план, блокнот" },

  87: { type: "loc", src: `${ARCH}/master/videos/IMG_8244.MP4`, out: "r87-night-track.mp4", ss: 3, dur: 8, note: "стадион" },
  88: { type: "shot", src: `${ARCH}/master/videos/IMG_2663.MOV`, out: "r88-cafe-plate.jpg", ss: 1.4, note: "тарелка в кафе" },

  89: { type: "clip", src: `${WEBAPP}/planka.mp4`, out: "r89-plank.mp4", note: "пресс/кор, планка" },

  90: { type: "photo", src: `${STILL}/r90-knee-pain.png`, out: "r90-knee-pain.png", note: "колено, боль" },

  91: { type: "photo", src: `${GEN}/sleep-bg-2-clock.png`, out: "r91-recovery.png", note: "восстановление после болезни" },

  92: { type: "photo", src: `${ARCH}/frames/gym-squat.jpg`, out: "r92-after-40.jpg", note: "Артур в зале, 40+" },
};
