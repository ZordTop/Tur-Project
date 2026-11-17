// ============================================================================
// middlewares/flash.js — одноразовые сообщения между запросами (redirect)
// ============================================================================
//
// ЗАЧЕМ
// После POST мы делаем redirect (паттерн Post/Redirect/Get). Обычная переменная
// при редиректе теряется, поэтому сообщение кладём в сессию и читаем ОДИН раз
// на следующем запросе — ровно на той странице, куда редиректнули.
//
// КАК ПОЛЬЗОВАТЬСЯ
//   req.flash('success', 'Заявка создана');   // поставить сообщение
//   res.locals.flash                          // прочитать в шаблоне (массив)
//
// Реализация без внешних библиотек: массив сообщений лежит в req.session.flash,
// middleware достаёт его в начало запроса, очищает сессию и кладёт в res.locals,
// чтобы шаблон отрисовал сообщения. Следующий запрос их уже не увидит.

function flash(req, res, next) {
  // Забираем накопленные сообщения из сессии и сразу очищаем её.
  const messages = Array.isArray(req.session.flash) ? req.session.flash : [];
  delete req.session.flash;

  // res.locals.flash доступен во всех шаблонах (в т.ч. через include partials).
  res.locals.flash = messages;

  // Помощник для контроллеров: добавить сообщение (тип: success|error|info).
  req.flash = (type, message) => {
    if (!message) return;
    if (!Array.isArray(req.session.flash)) req.session.flash = [];
    req.session.flash.push({ type: type || 'info', message });
  };

  next();
}

module.exports = flash;
