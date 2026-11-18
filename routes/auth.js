// Маршруты авторизации: форма входа/регистрации, обработчики POST, выход.
// Поля и названия таблиц строго из DATA_CONTRACT.md (users, tours, bookings).
// После входа редирект по ролям: admin → /admin, manager → /manager, user → /tours.
// Валидация email/телефона делегирована в utils/validators.js.

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { dropSession } = require('../middlewares/auth');
const { validateEmail, validatePhone } = require('../utils/validators');

const router = express.Router();

// Вспомогательная функция: куда вести пользователя после входа
function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'manager') return '/manager';
  return '/tours';
}

// Простая проверка формата email и нормализация делегированы в utils/validators.js.
// Здесь остаются только ролевые редиректы, безопасный next и формы для рендера.

// Куда хотел попасть гость, прежде чем requireAuth отправил его на /login?next=...
// Берём только внутренние пути: '/' и '//host' (протокол-опускающий редирект) отсекаем,
// иначе форма входа превратилась бы в открытую дверь для редиректа на чужой сайт.
function safeNext(raw) {
  if (typeof raw !== 'string') return '';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '';
  return raw;
}

// Один и тот же набор переменных для рендера формы входа — чтобы next
// не терялся и при ошибке (неверный пароль, блокировка).
// При POST значение приходит из скрытого поля формы, при GET — из query-строки.
function loginRenderData(req, error) {
  const raw = (req.body && req.body.next) || req.query.next;
  return {
    title: 'Вход — Туристический сайт',
    error,
    nextUrl: safeNext(raw),
  };
}

// То же для формы регистрации: next поддерживается и здесь, чтобы путь,
// данный requireAuth, не терялся, если гость решил сначала зарегистрироваться.
function registerRenderData(req, error) {
  const raw = (req.body && req.body.next) || req.query.next;
  return {
    title: 'Регистрация — Туристический сайт',
    error,
    nextUrl: safeNext(raw),
  };
}

// GET /auth/register — форма регистрации
router.get('/register', (req, res) => {
  if (res.locals.currentUser) {
    return res.redirect(homeFor(res.locals.currentUser.role));
  }
  res.render('register', registerRenderData(req, null));
});

// POST /auth/register — создание нового пользователя (role=user по умолчанию)
router.post('/register', async (req, res, next) => {
  try {
    if (res.locals.currentUser) {
      return res.redirect(homeFor(res.locals.currentUser.role));
    }

    // Валидация делегирована в utils/validators.js (email + телефон).
    // Это гарантирует единую логику на всём бэкенде: регистрация,
    // бронирование, создание туров — все используют одни и те же правила.
    const { password, full_name } = req.body;
    const email = validateEmail(req.body.email);
    const phone = validatePhone(req.body.phone);
    const full_name_clean = typeof full_name === 'string' ? full_name.trim() : '';

    if (!email || !password || !full_name_clean || !phone) {
      const errors = [];
      if (!email) errors.push('email');
      if (!password) errors.push('пароль');
      if (!full_name_clean) errors.push('имя');
      if (!phone) errors.push('телефон');
      return res
        .status(400)
        .render('register', registerRenderData(req, `Заполните все поля: ${errors.join(', ')}`));
    }

    if (password.length < 8) {
      return res
        .status(400)
        .render('register', registerRenderData(req, 'Пароль должен быть не короче 8 символов'));
    }

    const password_hash = await bcrypt.hash(password, 10);

    // Роль всегда 'user' — менеджер и админ выдаются только через админку
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, 'user')
       RETURNING id, email, full_name, phone, role`,
      [email, password_hash, full_name_clean, phone]
    );

    const user = result.rows[0];
    req.session.userId = user.id;

    req.flash('success', `Добро пожаловать, ${user.full_name}! Аккаунт создан.`);

    // Если гость пришёл по защищённой ссылке (next) — ведём его туда.
    const nextUrl = safeNext(req.body.next || req.query.next);
    if (nextUrl) {
      return res.redirect(nextUrl);
    }

    res.redirect(homeFor(user.role));
  } catch (err) {
    if (err.code === '23505') {
      return res
        .status(409)
        .render('register', registerRenderData(req, 'Пользователь с таким email уже существует'));
    }
    next(err);
  }
});

// GET /auth/login — форма входа
router.get('/login', (req, res) => {
  if (res.locals.currentUser) {
    return res.redirect(homeFor(res.locals.currentUser.role));
  }
  res.render('login', loginRenderData(req, null));
});

// POST /auth/login — проверка email/password_hash и is_blocked
router.post('/login', async (req, res, next) => {
  try {
    // Тот же валидатор, что и на регистрации: email нормализуется к нижнему
    // регистру и обрезается, поэтому 'Admin@Turist.RU' находит аккаунт.
    const email = validateEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .render('login', loginRenderData(req, 'Введите email и пароль'));
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, full_name, phone, role, is_blocked
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res
        .status(401)
        .render('login', loginRenderData(req, 'Неверный email или пароль'));
    }

    const user = result.rows[0];

    // is_blocked = true → не пускать, даже если пароль верный
    if (user.is_blocked) {
      return res
        .status(403)
        .render('login', loginRenderData(req, 'Аккаунт заблокирован. Обратитесь к администратору'));
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res
        .status(401)
        .render('login', loginRenderData(req, 'Неверный email или пароль'));
    }

    // В сессии хранится только id: данные и статус блокировки всегда актуальны из БД
    req.session.userId = user.id;

    // Если был next (редирект с requireAuth) — ведём туда.
    // safeNext принимает только внутренние пути: скрытое поле формы мог
    // подменить клиент, а наивная проверка startsWith('/') пропускала
    // протокол-опускающий редирект вида //evil.com (open redirect).
    const nextUrl = safeNext(req.body.next || req.query.next);
    if (nextUrl) {
      return res.redirect(nextUrl);
    }

    res.redirect(homeFor(user.role));
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — завершение сессии (форма выхода).
// Выход меняет состояние, поэтому выполняется только POST-ом с CSRF-токеном:
// GET-вариант позволял разлогинить пользователя чужой страницей (logout-CSRF).
router.post('/logout', (req, res) => {
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
