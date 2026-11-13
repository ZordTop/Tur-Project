// Middleware-функции для авторизации и ролевого разделения.
// Все функции читают пользователя из БД — сессия хранит только userId.
// Это гарантирует, что изменения в БД (is_blocked, роль) применяются мгновенно.

const pool = require('../db/pool');

// ---------- Глобальный middleware (подключается в server.js) ----------

// При каждом запросе:
//   1. Если нет req.session.userId → res.locals.currentUser = null; next().
//   2. Иначе читаем пользователя из БД по id из сессии.
//   3. Пользователя нет или is_blocked = true → принудительно разлогиниваем
//      (сессия уничтожается) и запрос продолжается как гостя.
//   4. Иначе кладём пользователя в res.locals.currentUser строго по п. 4
//      контракта: id, email, full_name, phone, role (без password_hash).
//
// Редирект на /login здесь не делается: форму входа тоже обрабатывает этот
// middleware, поэтому редирект дал бы бесконечный цикл 302.
// Направлять неавторизованных к форме входа должен requireAuth.
async function attachCurrentUser(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.locals.currentUser = null;
    return next();
  }

  let user;
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, phone, role, is_blocked
       FROM users
       WHERE id = $1`,
      [req.session.userId]
    );
    user = result.rows[0];
  } catch (err) {
    // БД недоступна — не выдаём доступ и не притворяемся гостем:
    // отдаём ошибку глобальному обработчику (500).
    return next(err);
  }

  // Пользователь удалён или заблокирован — принудительно разлогиниваем.
  if (!user || user.is_blocked) {
    return logoutQuietly(req, res, next);
  }

  // res.locals — для шаблонов EJS, req.user — для requireAuth / requireRole.
  const currentUser = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
  };
  res.locals.currentUser = currentUser;
  req.user = currentUser;
  next();
}

// Разлогин без редиректа: сессия уничтожена, запрос идёт дальше как гостя.
function logoutQuietly(req, res, next) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Не удалось уничтожить сессию:', err.message);
    }
    res.clearCookie('connect.sid');
    req.user = undefined;
    res.locals.currentUser = null;
    next();
  });
}

// ---------- Проверка авторизации ----------

// requireAuth: блокирует неавторизованных, редирект на /login
function requireAuth(req, res, next) {
  if (req.user) {
    return next();
  }
  const returnTo = encodeURIComponent(req.originalUrl);
  res.redirect(`/login?next=${returnTo}`);
}

// ---------- Проверка роли ----------

// requireRole('admin', 'manager') — требует одну из ролей
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      const returnTo = encodeURIComponent(req.originalUrl);
      return res.redirect(`/login?next=${returnTo}`);
    }
    if (!roles.includes(req.user.role)) {
      return res.redirect('/tours?error=access_denied');
    }
    next();
  };
}

// Уничтожает сессию, чистит cookie и редиректит на указанный путь.
// Применяется, когда пользователь выходит сам (POST /auth/logout).
function dropSession(req, res, redirectTo) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Не удалось уничтожить сессию:', err.message);
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect(redirectTo);
  });
}

module.exports = { attachCurrentUser, requireAuth, requireRole, dropSession };
