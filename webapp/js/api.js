/* Связь с ботом: дневник питания и анализ фото.
   Фото нельзя посчитать на устройстве — распознавание идёт через ключ Gemini,
   который живёт только на сервере бота. Всё остальное приложение считает само. */

window.KM_API = (function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var initData = tg && tg.initData ? tg.initData : "";

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
    return Boolean(initData);
  }

  function request(method, path, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, base + path, true);
      xhr.setRequestHeader("X-Telegram-Init-Data", initData);
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

  return {
    available: available,
    state: function (date) {
      return request("GET", "/api/state" + (date ? "?date=" + encodeURIComponent(date) : ""));
    },
    foods: function () {
      return request("GET", "/api/foods");
    },
    photo: function (file) {
      return compress(file, 1024, 0.72).then(function (b64) {
        return request("POST", "/api/meal/photo", { imageBase64: b64, mime: "image/jpeg" });
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
