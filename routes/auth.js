// Маршруты авторизации: форма входа/регистрации, обработчики POST, выход.
// Поля и названия таблиц строго из DATA_CONTRACT.md (users, tours, bookings).
// После входа редирект по ролям: admin → /admin, manager → /manager, user → /tours.

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { dropSession } = require('../middlewares/auth');

const router = express.Router();

// Вспомогательная функция: куда вести пользователя после входа
function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'manager') return '/manager';
  return '/tours';
}

// GET /auth/register — форма регистрации
router.get('/register', (req, res) => {
  if (res.locals.currentUser) {
    return res.redirect(homeFor(res.locals.currentUser.role));
  }
  res.render('register', { title: 'Регистрация — Туристический сайт', error: null });
});

// POST /auth/register — создание нового пользователя (role=user по умолчанию)
router.post('/register', async (req, res, next) => {
  try {
    if (res.locals.currentUser) {
      return res.redirect(homeFor(res.locals.currentUser.role));
    }

    const { email, password, full_name, phone } = req.body;

    if (!email || !password || !full_name || !phone) {
      return res
        .status(400)
        .render('register', {
          title: 'Регистрация — Туристический сайт',
          error: 'Заполните все поля: email, пароль, имя, телефон',
        });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .render('register', {
          title: 'Регистрация — Туристический сайт',
          error: 'Пароль должен быть не короче 8 символов',
        });
    }

    const password_hash = await bcrypt.hash(password, 10);

    // Роль всегда 'user' — менеджер и админ выдаются только через админку
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, 'user')
       RETURNING id, email, full_name, phone, role`,
      [email, password_hash, full_name, phone]
    );

    const user = result.rows[0];
    req.session.userId = user.id;

    res.redirect(homeFor(user.role));
  } catch (err) {
    if (err.code === '23505') {
      return res
        .status(409)
        .render('register', {
          title: 'Регистрация — Туристический сайт',
          error: 'Пользователь с таким email уже существует',
        });
    }
    next(err);
  }
});

// GET /auth/login — форма входа
router.get('/login', (req, res) => {
  if (res.locals.currentUser) {
    return res.redirect(homeFor(res.locals.currentUser.role));
  }
  res.render('login', { title: 'Вход — Туристический сайт', error: null });
});

// POST /auth/login — проверка email/password_hash и is_blocked
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .render('login', {
          title: 'Вход — Туристический сайт',
          error: 'Введите email и пароль',
        });
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, full_name, phone, role, is_blocked
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res
        .status(401)
        .render('login', {
          title: 'Вход — Туристический сайт',
          error: 'Неверный email или пароль',
        });
    }

    const user = result.rows[0];

    // is_blocked = true → не пускать, даже если пароль верный
    if (user.is_blocked) {
      return res
        .status(403)
        .render('login', {
          title: 'Вход — Туристический сайт',
          error: 'Аккаунт заблокирован. Обратитесь к администратору',
        });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res
        .status(401)
        .render('login', {
          title: 'Вход — Туристический сайт',
          error: 'Неверный email или пароль',
        });
    }

    // В сессии хранится только id: данные и статус блокировки всегда актуальны из БД
    req.session.userId = user.id;

    // Если был next (редирект с requireAuth) — ведём туда
    const redirectTo = req.body.next || req.query.next;
    if (redirectTo && redirectTo.startsWith('/')) {
      return res.redirect(redirectTo);
    }

    res.redirect(homeFor(user.role));
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — завершение сессии (форма выхода)
router.post('/logout', (req, res) => {
  dropSession(req, res, '/');
});

// GET /auth/logout — выход по ссылке (для шапки сайта)
router.get('/logout', (req, res) => {
  dropSession(req, res, '/');
});

// GET /auth/me — JSON для отладки и AJAX-запросов.
// Отдаём res.locals.currentUser, чтобы было видно: password_hash не попадает наружу.
router.get('/me', (req, res) => {
  if (!res.locals.currentUser) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  res.json({ user: res.locals.currentUser });
});

module.exports = router;
