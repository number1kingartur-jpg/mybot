/**
 * Кадр под каждый переписанный пост канала: id сообщения → файл в assets/rewrite-photos.
 *
 * Посты 8..93 были опубликованы со старыми фото, а тексты им заменили на другие темы.
 * Из-за этого под «Скакалкой» стояла лавка для жима, а четыре поста про еду шли
 * с одним и тем же снимком. Здесь каждому посту сопоставлен свой кадр по его теме.
 *
 * 67 и 68 — текстовые сообщения, фото им добавить нельзя, их тут нет.
 */
export const PHOTOS = {
  8: "shoes-door.png",
  9: "dumbbell-rack.png",
  45: "notebook-log.png",
  46: "bed-predawn.png",
  48: "plateau-bar.png",
  51: "band-rack.png",
  52: "squat-rack-low.png",
  53: "pullup-bar.png",
  54: "three-plates.png",
  55: "protein-board.png",
  56: "kitchen-scale.png",
  57: "gym-mirror.png",
  58: "carbs-bag.png",
  59: "one-dumbbell.png",
  60: "after-session.png",
  61: "beach-walk.png",
  62: "stopwatch.png",
  63: "tape-notebook.png",
  64: "outdoor-noon.png",
  65: "blank-page.png",
  66: "calendar-three.png",
  69: "full-plate.png",
  70: "whiteboard-grid.png",
  71: "bar-and-dumbbell.png",
  72: "gym-doorway.png",
  73: "plates-row.png",
  74: "watch-bar.png",
  75: "water-bottle.png",
  76: "fridge-night.png",
  77: "creatine-scoop.png",
  78: "extra-plate.png",
  79: "mobility-mat.png",
  80: "bathroom-scale.png",
  81: "bandage-bench.png",
  82: "incline-bench.png",
  83: "deadlift-floor.png",
  84: "kettlebells.png",
  85: "rope.png",
  86: "three-notebooks.png",
  87: "track-empty.png",
  88: "cafe-table.png",
  89: "ab-wheel.png",
  90: "stairs-down.png",
  91: "empty-bar-rack.png",
  92: "light-tools.png",
  93: "unused-machine.png",
};
