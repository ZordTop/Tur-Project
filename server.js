const path = require('path');
const express = require('express');
const session = require('express-session');

const indexRouter = require('./routes/index');
const toursRouter = require('./routes/tours');
const authRouter = require('./routes/auth');
const { attachCurrentUser, requireAuth, requireRole } = require('./middlewares/auth');
const pool = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 3000;
// 0.0.0.0 обязателен внутри контейнера: иначе порт не будет доступен снаружи
const HOST = process.env.HOST || '0.0.0.0';

// Шаблонизатор EJS: файлы лежат в views/, расширение можно не указывать
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Разбор данных из HTML-форм (POST-запросы)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Статика: css, js, картинки отдаются напрямую из public/
app.use(express.static(path.join(__dirname, 'public')));

// Доверяем заголовку X-Forwarded-Proto от reverse-proxy (nginx)
// Это нужно, чтобы cookie.secure работал корректно при HTTPS
app.set('trust proxy', 1);

// Сессии: хранятся в памяти сервера (для продакшена — connect-pg-simple)
app.use(session({
  secret: process.env.SESSION_SECRET || 'tur-project-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // 'auto': secure=true при HTTPS (продакшен), secure=false при HTTP (разработка)
    secure: 'auto',
    maxAge: 24 * 60 * 60 * 1000, // 24 часа
    sameSite: 'lax',
  },
}));

// Достаём пользователя из БД при каждом запросе: кладём в res.locals.currentUser
// (п. 4 контракта) и принудительно разлогиниваем при is_blocked = true.
app.use(attachCurrentUser);

// Маршруты
app.use('/', indexRouter);
app.use('/tours', toursRouter);
app.use('/auth', authRouter);
// Алиасы /login, /register, /logout: на них редиректит requireAuth,
// а формы работают и по основному префиксу /auth/*
app.use('/', authRouter);

// Панель админа (п. 5 контракта): все туры (включая скрытые), все заявки,
// все пользователи (без password_hash).
app.get('/admin', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [tours, bookings, users] = await Promise.all([
      pool.query('SELECT * FROM tours ORDER BY id'),
      pool.query(
        `SELECT b.*, t.title AS tour_title
         FROM bookings b
         LEFT JOIN tours t ON t.id = b.tour_id
         ORDER BY b.created_at DESC`
      ),
      pool.query(
        `SELECT id, email, full_name, phone, role, is_blocked, created_at
         FROM users ORDER BY id`
      ),
    ]);
    res.render('admin', {
      title: 'Панель админа — Туристический сайт',
      tours: tours.rows,
      bookings: bookings.rows,
      users: users.rows,
    });
  } catch (err) {
    next(err);
  }
});

// Панель менеджера (п. 4 контракта): туры и последние заявки этого менеджера.
app.get('/manager', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const [tours, recentBookings] = await Promise.all([
      pool.query('SELECT * FROM tours WHERE is_active = TRUE ORDER BY id'),
      pool.query(
        `SELECT b.*, t.title AS tour_title
         FROM bookings b
         LEFT JOIN tours t ON t.id = b.tour_id
         WHERE b.manager_id = $1
         ORDER BY b.created_at DESC
         LIMIT 20`,
        [req.user.id]
      ),
    ]);
    res.render('manager', {
      title: 'Панель менеджера — Туристический сайт',
      tours: tours.rows,
      recentBookings: recentBookings.rows,
    });
  } catch (err) {
    next(err);
  }
});

// 404 — страница не найдена (должна идти после всех маршрутов)
app.use((req, res) => {
  res.status(404).render('404', { title: 'Страница не найдена' });
});

// Обработчик ошибок: Express узнаёт его по четырём аргументам
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Ошибка сервера',
    message: err.message,
    status: 500,
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Сервер запущен: http://${HOST}:${PORT}`);
});

// Docker при docker stop / compose down присылает SIGTERM.
// Закрываем сервер штатно, чтобы не обрывать активные запросы.
let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Получен ${signal}, останавливаем сервер...`);

  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });

  // Страховка: если соединения не закрылись за 10 секунд — выходим принудительно
  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});
