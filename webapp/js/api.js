/* Связь с ботом: дневник питания и анализ фото.
   Фото нельзя посчитать на устройстве — распознавание идёт через ключ Gemini,
   который живёт только на сервере бота. Всё остальное приложение считает само. */

window.KM_API = (function () {
  "use strict";

  // Подпись читается лениво, а не один раз при загрузке: SDK telegram.org —
  // внешний файл, и если он не пришёл (сеть, блокировка, медленный старт), то
  // при чтении «на старте» приложение навсегда считало себя открытым вне
  // Telegram и прятало всё серверное — фото, справочник, общий дневник.
  // Запасной путь без SDK: Telegram кладёт подпись в адрес страницы, читаем сами.
  var cached = "";
  var source = "нет";

  function fromLocation() {
    var keys = ["tgWebAppData"];
    var places = [location.hash ? location.hash.replace(/^#/, "") : "", location.search.replace(/^\?/, "")];
    for (var p = 0; p < places.length; p++) {
      if (!places[p]) continue;
      try {
        var params = new URLSearchParams(places[p]);
        for (var k = 0; k < keys.length; k++) {
          var v = params.get(keys[k]);
          if (v) return v;
        }
      } catch (e) {
        /* старый браузер — просто нет запасного пути */
      }
    }
    return "";
  }

  function readInitData() {
    if (cached) return cached;
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg && tg.initData) {
      cached = tg.initData;
      source = "sdk";
      return cached;
    }
    var raw = fromLocation();
    if (raw) {
      cached = raw;
      source = "адрес страницы";
      return cached;
    }
    // Третий источник: SDK складывает параметры запуска в sessionStorage и
    // восстанавливает их, когда страницу перезагрузили без адреса. Если сам SDK
    // ещё не успел это сделать, читаем хранилище напрямую.
    try {
      var stored = sessionStorage.getItem("__telegram__initParams");
      if (stored) {
        var obj = JSON.parse(stored);
        if (obj && obj.tgWebAppData) {
          cached = obj.tgWebAppData;
          source = "память сеанса";
        }
      }
    } catch (e) {
      /* хранилище недоступно — остаётся локальный режим */
    }
    return cached;
  }

  // Приложение раздаётся самим ботом, поэтому база — свой же origin.
  // Если статика лежит отдельно (например, на GitHub Pages), адрес API можно
  // передать в ссылке: ?api=https://бот.up.railway.app
  var base = "";
  try {
    var q = new URLSearchParams(location.search).get("api");
    if (q) base = q.replace(/\/+$/, "");
  } catch (e) {
    /* старый браузер — работаем с тем же origin */
  }

  /** Есть ли смысл дёргать сервер: подпись Telegram обязательна. */
  function available() {
    return Boolean(readInitData());
  }

  /** Версия открытого кода: сервер подставляет её в адрес файла (?v=…). */
  function build() {
    try {
      var s = document.querySelector('script[src*="js/app.js"]');
      var m = s ? /[?&]v=([^&]+)/.exec(s.getAttribute("src") || "") : null;
      return m ? m[1] : "";
    } catch (e) {
      return "";
    }
  }

  /** Какие поля Telegram положил в адрес страницы. Только имена, без значений:
      подпись в значениях, её нельзя показывать на экране. */
  function launchKeys() {
    var out = [];
    try {
      var places = [location.hash.replace(/^#/, ""), location.search.replace(/^\?/, "")];
      for (var i = 0; i < places.length; i++) {
        if (!places[i]) continue;
        var p = new URLSearchParams(places[i]);
        p.forEach(function (_v, k) {
          if (out.indexOf(k) === -1) out.push(k.replace(/^tgWebApp/, ""));
        });
      }
    } catch (e) {
      /* старый браузер */
    }
    return out;
  }

  /** Запасник самого SDK: он складывает параметры запуска в sessionStorage и
      восстанавливает их при перезагрузке страницы без адреса. */
  function storedInit() {
    try {
      var raw = sessionStorage.getItem("__telegram__initParams");
      if (!raw) return "нет";
      var obj = JSON.parse(raw);
      return obj && obj.tgWebAppData ? "есть с подписью" : "есть без подписи";
    } catch (e) {
      return "недоступно";
    }
  }

  /** Факты для экрана «нет связи»: без них причина ищется наугад. */
  function diag() {
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    return {
      sdk: Boolean(tg),
      platform: tg && tg.platform ? tg.platform : "—",
      version: tg && tg.version ? tg.version : "—",
      initLen: readInitData().length,
      source: source,
      keys: launchKeys(),
      stored: storedInit(),
    };
  }

  function request(method, path, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, base + path, true);
      xhr.setRequestHeader("X-Telegram-Init-Data", readInitData());
      if (body) xhr.setRequestHeader("Content-Type", "application/json");
      xhr.timeout = 60000; // распознавание фото занимает секунды, иногда десятки
      xhr.onload = function () {
        var data = {};
        try {
          data = JSON.parse(xhr.responseText || "{}");
        } catch (e) {
          data = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject({ status: xhr.status, code: data.error, message: data.message, data: data });
      };
      xhr.onerror = function () {
        reject({ status: 0, code: "network", message: "Нет связи с сервером бота." });
      };
      xhr.ontimeout = function () {
        reject({ status: 0, code: "timeout", message: "Сервер не ответил. Попробуй ещё раз." });
      };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  /**
   * Сжатие перед отправкой: фото с телефона — 3–6 МБ, для распознавания блюда
   * этого не нужно, а трафик в Telegram-браузере часто мобильный.
   */
  function compress(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        var dataUrl;
        try {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        } catch (e) {
          reject({ code: "compress", message: "Не удалось обработать снимок." });
          return;
        }
        resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject({ code: "compress", message: "Это не похоже на изображение." });
      };
      img.src = url;
    });
  }

  /**
   * Оригинал файла без сжатия — запасной путь. Нужен, когда снимок не декодируется
   * в <img>: так ведут себя HEIC с iPhone в части WebView. Gemini такие форматы
   * принимает, поэтому терять кадр из-за неудачного сжатия незачем.
   */
  function raw(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > 6 * 1024 * 1024) {
        reject({ code: "too_big", message: "Снимок больше 6 МБ — сними ещё раз или добавь текстом." });
        return;
      }
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result || "");
        var comma = s.indexOf(",");
        if (comma < 0) {
          reject({ code: "compress", message: "Не удалось прочитать снимок." });
          return;
        }
        resolve({ b64: s.slice(comma + 1), mime: file.type || "image/jpeg" });
      };
      fr.onerror = function () {
        reject({ code: "compress", message: "Не удалось прочитать снимок." });
      };
      fr.readAsDataURL(file);
    });
  }

  return {
    available: available,
    diag: diag,
    build: build,
    state: function (date) {
      return request("GET", "/api/state" + (date ? "?date=" + encodeURIComponent(date) : ""));
    },
    foods: function () {
      return request("GET", "/api/foods");
    },
    photo: function (file) {
      return compress(file, 1024, 0.72)
        .then(function (b64) {
          return { b64: b64, mime: "image/jpeg" };
        })
        .catch(function () {
          return raw(file);
        })
        .then(function (img) {
          return request("POST", "/api/meal/photo", { imageBase64: img.b64, mime: img.mime });
        });
    },
    text: function (text) {
      return request("POST", "/api/meal/text", { text: text });
    },
    food: function (name, grams) {
      return request("POST", "/api/meal/food", { name: name, grams: grams });
    },
    manual: function (meal) {
      return request("POST", "/api/meal/manual", meal);
    },
    remove: function (id) {
      return request("DELETE", "/api/meal?id=" + encodeURIComponent(id));
    },
    saveProfile: function (profile) {
      return request("POST", "/api/nutrition", profile);
    },
    saveWeight: function (weightKg, date) {
      return request("POST", "/api/bodyweight", { weightKg: weightKg, date: date });
    },
    removeWeight: function (date) {
      return request("DELETE", "/api/bodyweight?date=" + encodeURIComponent(date));
    },
    /* Уходит объём порции, а не итог: сумму за день считает сервер. */
    addWater: function (ml, date) {
      return request("POST", "/api/water", { ml: ml, date: date });
    },
    saveProgram: function (payload) {
      return request("POST", "/api/program", payload);
    },
    programDone: function () {
      return request("POST", "/api/program/done", {});
    },
    workoutDone: function (place) {
      return request("POST", "/api/workout/simple", { place: place });
    },
    savePlace: function (place) {
      return request("POST", "/api/settings", { place: place });
    }
  };
})();
