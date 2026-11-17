const path = require('path');
const express = require('express');
const session = require('express-session');

const indexRouter = require('./routes/index');
const toursRouter = require('./routes/tours');
const authRouter = require('./routes/auth');
const { attachCurrentUser, requireAuth, requireRole } = require('./middlewares/auth');
const csrf = require('./middlewares/csrf');
const flash = require('./middlewares/flash');
const pool = require('./db/pool');
const { parseFilters, buildConditions } = require('./utils/tourFilters');

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
const DEFAULT_SESSION_SECRET = 'tur-project-secret-change-in-production';
const sessionSecret = process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET;

// В production дефолтный секрет делает подпись cookie предсказуемой для
// любого, кто прочитал этот репозиторий. Напоминаем об этом в логах.
if (process.env.NODE_ENV === 'production' && sessionSecret === DEFAULT_SESSION_SECRET) {
  console.warn(
    'ВНИМАНИЕ: SESSION_SECRET не задан — используется значение из репозитория. ' +
    'Задайте SESSION_SECRET в окружении, иначе cookie сессий можно подделать.'
  );
}

app.use(session({
  secret: sessionSecret,
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

// Flash-сообщения: одноразовые уведомления между запросами (лежат в сессии).
app.use(flash);

// CSRF: проверка токена на всех POST/PUT/PATCH/DELETE. Идёт после session()
// (токен хранится в сессии) и после разбора тела (токен читается из req.body).
app.use(csrf);

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

// ─── Личный кабинет: GET /profile ────────────────────────────────────────────
// По контракту DATA_CONTRACT.md п.4: в шаблон попадают брони пользователя
// с подтянутым tour_title и total_price.
app.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const [bookings] = await Promise.all([
      pool.query(
        `SELECT b.*, t.title AS tour_title, t.total_price, t.departure_at
         FROM bookings b
         LEFT JOIN tours t ON t.id = b.tour_id
         WHERE b.user_id = $1
         ORDER BY b.created_at DESC`,
        [req.user.id]
      ),
    ]);

    res.render('profile', {
      title: 'Личный кабинет — Туристический сайт',
      bookings: bookings.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Панель менеджера: GET /manager (с фильтрами) ────────────────────────────
// Фильтры совпадают с формой в manager.ejs: destination_country, destination_city,
// departure_date, flight_class, hotel_stars, hotel_meal, transfer_type, maxPrice.
app.get('/manager', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    const { where, values } = buildConditions(filters);

    const [tours, recentBookings] = await Promise.all([
      pool.query(
        `SELECT t.* FROM tours t WHERE ${where.join(' AND ')} ORDER BY t.total_price ASC, t.id ASC`,
        values
      ),
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
      filters,
    });
  } catch (err) {
    next(err);
  }
});

// POST /manager/book — заявка, оформленная менеджером.
// Форма в manager.ejs отправляет tour_id, client_name, client_phone, comment.
app.post('/manager/book', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const tourId = Number(req.body.tour_id);
    const client_name = String(req.body.client_name || '').trim().slice(0, 150);
    const client_phone = String(req.body.client_phone || '').trim().slice(0, 30);
    const comment = String(req.body.comment || '').trim().slice(0, 1000);

    if (!client_name || !client_phone) {
      req.flash('error', 'Заполните ФИО и телефон клиента.');
      return res.redirect('/manager');
    }

    // Проверяем, что тур существует.
    const tourResult = await pool.query(
      'SELECT id, title FROM tours WHERE id = $1',
      [tourId]
    );
    if (!tourResult.rows[0]) {
      req.flash('error', 'Выбранный тур не найден.');
      return res.redirect('/manager');
    }

    await pool.query(
      `INSERT INTO bookings (tour_id, user_id, manager_id, client_name, client_phone, comment, status)
       VALUES ($1, NULL, $2, $3, $4, $5, 'new')`,
      [tourId, req.user.id, client_name, client_phone, comment || null]
    );

    req.flash('success', `Заявка на «${tourResult.rows[0].title}» оформлена.`);
    res.redirect('/manager');
  } catch (err) {
    next(err);
  }
});

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

// ─── CRUD-действия админа (GAP-01) ───────────────────────────────────────────
// Все четыре маршрута закрыты requireRole('admin'); каждое действие делает
// UPDATE по числовому id из URL и значения из фиксированного списка, поэтому
// пользовательские строки в SQL-текст не попадают. После действия — flash и
// возврат на /admin.

// Скрыть / показать тур: POST /admin/tours/:id/active
app.post('/admin/tours/:id/active', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next();
    }

    const result = await pool.query(
      'UPDATE tours SET is_active = NOT is_active WHERE id = $1 RETURNING title, is_active',
      [id]
    );
    const tour = result.rows[0];
    if (!tour) {
      req.flash('error', 'Тур не найден.');
    } else {
      req.flash('success', `Тур «${tour.title}» ${tour.is_active ? 'опубликован' : 'скрыт из каталога'}.`);
    }
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

// Смена статуса заявки: POST /admin/bookings/:id/status (body: status)
app.post('/admin/bookings/:id/status', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || '');
    const allowed = ['new', 'confirmed', 'cancelled'];

    if (!Number.isInteger(id) || id <= 0 || !allowed.includes(status)) {
      req.flash('error', 'Недопустимый статус заявки.');
      return res.redirect('/admin');
    }

    const result = await pool.query(
      'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING id',
      [status, id]
    );
    if (!result.rows[0]) {
      req.flash('error', 'Заявка не найдена.');
    } else {
      const labels = { new: 'возвращена в «новые»', confirmed: 'подтверждена', cancelled: 'отменена' };
      req.flash('success', `Заявка №${id} ${labels[status]}.`);
    }
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

// Смена роли пользователя: POST /admin/users/:id/role (body: role)
app.post('/admin/users/:id/role', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const role = String(req.body.role || '');
    const allowed = ['user', 'manager', 'admin'];

    if (!Number.isInteger(id) || id <= 0 || !allowed.includes(role)) {
      req.flash('error', 'Недопустимая роль пользователя.');
      return res.redirect('/admin');
    }

    // Защита от самовыдачи: админ не может понизить собственную роль —
    // иначе легко потерять доступ к админке без другого админа.
    if (id === req.user.id && role !== 'admin') {
      req.flash('error', 'Нельзя снять роль администратора с самого себя.');
      return res.redirect('/admin');
    }

    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING email',
      [role, id]
    );
    if (!result.rows[0]) {
      req.flash('error', 'Пользователь не найден.');
    } else {
      req.flash('success', `Роль ${result.rows[0].email} → ${role}.`);
    }
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

// Заблокировать / разблокировать пользователя: POST /admin/users/:id/block
app.post('/admin/users/:id/block', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next();
    }

    // Блокировка самого себя мгновенно разлогинит через attachCurrentUser.
    if (id === req.user.id) {
      req.flash('error', 'Нельзя заблокировать самого себя.');
      return res.redirect('/admin');
    }

    const result = await pool.query(
      'UPDATE users SET is_blocked = NOT is_blocked WHERE id = $1 RETURNING email, is_blocked',
      [id]
    );
    const user = result.rows[0];
    if (!user) {
      req.flash('error', 'Пользователь не найден.');
    } else {
      req.flash('success', `Пользователь ${user.email} ${user.is_blocked ? 'заблокирован' : 'разблокирован'}.`);
    }
    res.redirect('/admin');
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
