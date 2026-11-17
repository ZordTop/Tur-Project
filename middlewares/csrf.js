// ============================================================================
// middlewares/csrf.js — защита от подделки межсайтовых запросов (CSRF)
// ============================================================================
//
// БЕЗ ВНЕШНИХ ЗАВИСИМОСТЕЙ: токен хранится в сессии, сверяется на каждом
// небезопасном запросе (POST/PUT/PATCH/DELETE). Для GET токен не проверяется —
// GET-запросы не должны менять состояние сервера (у нас меняют только POST).
//
// Как это работает:
//   1. На первом запросе в сессии создаётся случайный csrfToken.
//   2. Токен кладётся в res.locals.csrfToken → шаблоны вставляют его в
//      скрытое поле <input name="_csrf"> у всех POST-форм.
//   3. На POST/PUT/PATCH/DELETE сверяем поле _csrf (или заголовок
//      X-CSRF-Token) с токеном в сессии. Не совпало — 403.
//
// Подключение: app.use(csrf) сразу после session().

const crypto = require('crypto');

// Методы, которые могут изменить состояние сервера — их и проверяем.
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrf(req, res, next) {
  // 1. Гарантируем, что в сессии есть токен.
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  // 2. Отдаём токен во все шаблоны (res.locals виден в EJS).
  res.locals.csrfToken = req.session.csrfToken;

  // 3. Безопасные методы (GET/HEAD/OPTIONS) пропускаем без проверки.
  if (!UNSAFE_METHODS.has(req.method)) {
    return next();
  }

  // 4. На небезопасном запросе сравниваем присланный токен с токеном сессии.
  const sent =
    (req.body && req.body._csrf) ||
    req.get('X-CSRF-Token') ||
    req.query._csrf;

  const expected = req.session.csrfToken;

  // timingSafeEqual требует одинаковой длины строк — сравниваем аккуратно.
  const ok =
    typeof sent === 'string' &&
    sent.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));

  if (!ok) {
    return res
      .status(403)
      .render('error', {
        title: 'Запрос отклонён — Туристический сайт',
        message: 'Срок действия формы истёк или запрос подделан. Обновите страницу и попробуйте снова.',
        status: 403,
      });
  }

  next();
}

module.exports = csrf;
