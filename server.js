const path = require('path');
const express = require('express');
const session = require('express-session');
const ejs = require('ejs');
const bcrypt = require('bcryptjs');

const indexRouter = require('./routes/index');
const toursRouter = require('./routes/tours');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const clientsRouter = require('./routes/clients');
const { attachCurrentUser, requireAuth, requireRole } = require('./middlewares/auth');
const csrf = require('./middlewares/csrf');
const flash = require('./middlewares/flash');
const pool = require('./db/pool');
const { parseFilters, buildConditions } = require('./utils/tourFilters');
const { validateBookingData, validateEmail } = require('./utils/validators');
const { uploadBookingDocs, removeUploadedFiles, getUploadedFileName } = require('./middlewares/upload');

const app = express();
const PORT = process.env.PORT || 3000;
// 0.0.0.0 обязателен внутри контейнера: иначе порт не будет доступен снаружи
const HOST = process.env.HOST || '0.0.0.0';

// Шаблонизатор EJS: файлы лежат в views/, расширение можно не указывать
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Стандартный ejs.__express передаёт локальные переменные шаблона как опции
// самого EJS. Из-за этого локаль `client` (досье туриста, routes/clients.js)
// воспринимается как опция client:true — EJS переключается в режим компиляции
// для браузера, и include('partials/header') падает с «include is not a function».
// Оборачиваем движок и жёстко фиксируем серверный режим.
app.engine('ejs', (filePath, options, callback) => {
  ejs.renderFile(filePath, options, { client: false }, callback);
});

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
// Личный кабинет клиента (п. 3 раздела 4 контракта): его брони с деталями тура.
// requireAuth внутри роутера — гость уходит на /login?next=/profile.
app.use('/profile', profileRouter);

// CRM-база туристов (этап 4): доступ только manager/admin — проверка роли
// внутри роутера. Раздаёт фото/сканы из uploads/, поиск, досье, отмену брони.
app.use('/clients', clientsRouter);

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
// Форма в manager.ejs отправляет анкету туриста и файлы в multipart/form-data.
// middleware uploadBookingDocs обрабатывает файлы, затем хендлер валидирует паспортные данные.
// В рамках одной транзакции создаётся (или привязывается) аккаунт клиента и заявка.
app.post('/manager/book', requireAuth, requireRole('admin', 'manager'), uploadBookingDocs, async (req, res, next) => {
  let client = null;
  try {
    const tourId = Number(req.body.tour_id);

    // Email клиента — обязателен для создания/привязки аккаунта.
    const clientEmail = validateEmail(req.body.client_email);
    if (!clientEmail) {
      removeUploadedFiles(req);
      req.flash('error', 'Укажите корректный email клиента (например: client@example.ru).');
      return res.redirect('/manager');
    }

    const clientPassword = String(req.body.client_password || '');

    // Валидация анкеты туриста (без дефолтов — менеджер заполняет все поля).
    const validation = validateBookingData(req.body);

    if (!validation.ok) {
      removeUploadedFiles(req);
      req.flash('error', validation.errors.join(' '));
      return res.redirect('/manager');
    }

    // Сохраняем имена загруженных файлов (или null).
    const client_photo = getUploadedFileName(req, 'client_photo');
    const passport_scan = getUploadedFileName(req, 'passport_scan');

    const v = validation.values;

    // ── Транзакция: аккаунт клиента + заявка одним атомарным блоком ──
    // Либо создаются оба записи, либо ни одной — при любой ошибке ROLLBACK
    // откатывает и INSERT в users, и INSERT в bookings.
    client = await pool.connect();
    await client.query('BEGIN');

    // Проверяем тур внутри транзакции (снимок актуален на момент записи).
    const tourResult = await client.query(
      'SELECT id, title FROM tours WHERE id = $1',
      [tourId]
    );
    if (!tourResult.rows[0]) {
      await client.query('ROLLBACK');
      client.release();
      client = null;
      removeUploadedFiles(req);
      req.flash('error', 'Выбранный тур не найден.');
      return res.redirect('/manager');
    }
    const tourTitle = tourResult.rows[0].title;

    // Ищем существующий аккаунт по email.
    const existingUser = await client.query(
      'SELECT id, is_blocked FROM users WHERE email = $1',
      [clientEmail]
    );

    let targetUserId;
    let accountCreated = false;

    if (existingUser.rows[0]) {
      // Аккаунт есть: заблокированного не привязываем, пароль НЕ перезаписываем.
      if (existingUser.rows[0].is_blocked === true) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        removeUploadedFiles(req);
        req.flash('error', `Аккаунт клиента заблокирован: ${clientEmail}`);
        return res.redirect('/manager');
      }
      targetUserId = existingUser.rows[0].id;
    } else {
      // Email новый: пароль обязателен (минимум 8 символов).
      if (clientPassword.length < 8) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        removeUploadedFiles(req);
        req.flash('error', 'Пароль для нового аккаунта клиента должен быть не короче 8 символов.');
        return res.redirect('/manager');
      }
      const passwordHash = await bcrypt.hash(clientPassword, 10);
      const insertedUser = await client.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role)
         VALUES ($1, $2, $3, $4, 'user') RETURNING id`,
        [clientEmail, passwordHash, v.client_name, v.client_phone]
      );
      targetUserId = insertedUser.rows[0].id;
      accountCreated = true;
    }

    // Заявка: одновременно user_id (аккаунт клиента) и manager_id (кто оформил).
    await client.query(
      `INSERT INTO bookings (tour_id, user_id, manager_id, client_name, client_phone,
       birth_date, passport_series_number, passport_issued_by, passport_expires_at,
       client_photo, passport_scan, comment, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed')`,
      [tourId, targetUserId, req.user.id, v.client_name, v.client_phone, v.birth_date,
       v.passport_series_number, v.passport_issued_by, v.passport_expires_at,
       client_photo, passport_scan, v.comment]
    );

    await client.query('COMMIT');
    client.release();
    client = null;

    // Flash с указанием email — клиент дома войдёт на /login и увидит бронь в /profile.
    if (accountCreated) {
      req.flash('success',
        `Заявка на «${tourTitle}» оформлена. Создан аккаунт клиента ${clientEmail} — ` +
        'он сможет войти на /login и увидеть бронь в /profile.');
    } else {
      req.flash('success',
        `Заявка на «${tourTitle}» оформлена и привязана к существующему аккаунту ${clientEmail} — ` +
        'клиент увидит бронь в /profile.');
    }
    res.redirect('/manager');
  } catch (err) {
    // Откатываем транзакцию, если она ещё открыта, и освобождаем соединение.
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* соединение уже могло закрыться */ }
      client.release();
    }
    removeUploadedFiles(req);
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

// ─── Конструктор туров (Этап 5) ────────────────────────────────────────────────
// Валидация и подготовка данных тура (общая функция для create/edit).
// Возвращает { ok: true, data: {...} } или { ok: false, errors: [...] }.
//
// Даты прилёта и строка «время в пути» НЕ берутся из формы: arrival_at и
// flight_duration вычисляются строго на сервере из departure_at +
// flight_duration_minutes, поэтому ручной ввод противоречивого прилёта
// исключён полностью.

function validateTourData(req) {
  const errors = [];

  // Обязательные текстовые поля
  // flight_duration исключён из списка: его генерирует сервер из минут.
  const requiredText = [
    'title', 'description', 'departure_city',
    'destination_country', 'destination_city',
    'hotel_name'
  ];
  for (const field of requiredText) {
    const val = String(req.body[field] || '').trim();
    if (!val) errors.push(`Заполните поле «${field}».`);
  }

  // image: если передано и не пустое — используем, иначе дефолт
  let image = String(req.body.image || '').trim();
  if (!image) {
    image = '/images/tour-sochi.jpg';
  }

  // rating: null если пустое, иначе число 1.0–5.0
  // String() обязателен: при дублирующем параметре (?rating=1&rating=2)
  // querystring отдаёт массив, а у массива нет .trim() — было бы 500.
  let rating = null;
  if (String(req.body.rating ?? '').trim() !== '') {
    const r = Number(req.body.rating);
    if (!Number.isFinite(r) || r < 1.0 || r > 5.0) {
      errors.push('Рейтинг должен быть числом от 1.0 до 5.0.');
    } else {
      rating = Math.round(r * 10) / 10; // округляем до 0.1
    }
  }

  // nights: целое >= 1
  const nights = Number(req.body.nights);
  if (!Number.isInteger(nights) || nights < 1) {
    errors.push('Количество ночей — целое число ≥ 1.');
  }

  // departure_at: корректная дата и НЕ в прошлом (не раньше начала сегодня)
  let departureAt = null;
  const rawDeparture = String(req.body.departure_at ?? '').trim();
  if (!rawDeparture) {
    errors.push('Укажите дату и время вылета.');
  } else {
    departureAt = new Date(rawDeparture);
    if (isNaN(departureAt.getTime())) {
      errors.push('Укажите корректную дату и время вылета.');
      departureAt = null;
    } else {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (departureAt < startOfToday) {
        errors.push('Дата вылета не может быть в прошлом');
      }
    }
  }

  // flight_duration_minutes: целое число минут > 0
  let durationMinutes = null;
  const rawMinutes = String(req.body.flight_duration_minutes ?? '').trim();
  if (!rawMinutes) {
    errors.push('Укажите время в пути в минутах.');
  } else {
    const m = Number(rawMinutes);
    if (!Number.isInteger(m) || m <= 0) {
      errors.push('Время в пути — целое число минут больше 0.');
    } else {
      durationMinutes = m;
    }
  }

  // arrival_at и flight_duration — только серверный расчёт.
  let arrivalAt = null;
  let flightDuration = null;
  if (departureAt && durationMinutes != null) {
    arrivalAt = new Date(departureAt.getTime() + durationMinutes * 60 * 1000);
    flightDuration = `${Math.floor(durationMinutes / 60)}ч ${durationMinutes % 60}мин`;
  }

  // Enum-поля — строго по списку
  const flightClass = String(req.body.flight_class || '').trim();
  if (!['economy', 'comfort', 'business'].includes(flightClass)) {
    errors.push('Класс полёта должен быть economy, comfort или business.');
  }

  const hotelStars = Number(req.body.hotel_stars);
  if (![2, 3, 4, 5].includes(hotelStars)) {
    errors.push('Звёздность отеля: 2, 3, 4 или 5.');
  }

  const hotelMeal = String(req.body.hotel_meal || '').trim();
  if (!['RO', 'BB', 'HB', 'AI'].includes(hotelMeal)) {
    errors.push('Тип питания: RO, BB, HB или AI.');
  }

  const transferType = String(req.body.transfer_type || '').trim();
  if (!['bus', 'private'].includes(transferType)) {
    errors.push('Тип трансфера: bus или private.');
  }

  // Цены: целые неотрицательные
  const flightPrice  = Number(req.body.flight_price);
  const hotelPrice   = Number(req.body.hotel_price);
  const transferPrice = Number(req.body.transfer_price);
  if (!Number.isInteger(flightPrice) || flightPrice < 0) {
    errors.push('Цена перелёта — целое неотрицательное число.');
  }
  if (!Number.isInteger(hotelPrice) || hotelPrice < 0) {
    errors.push('Цена отеля — целое неотрицательное число.');
  }
  if (!Number.isInteger(transferPrice) || transferPrice < 0) {
    errors.push('Цена трансфера — целое неотрицательное число.');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Принудительный серверный расчёт total_price (никогда не доверяем клиенту)
  const totalPrice = flightPrice + hotelPrice + transferPrice;

  return {
    ok: true,
    data: {
      title: String(req.body.title).trim(),
      description: String(req.body.description).trim(),
      image,
      rating,
      nights,
      departure_city: String(req.body.departure_city).trim(),
      destination_country: String(req.body.destination_country).trim(),
      destination_city: String(req.body.destination_city).trim(),
      // departure_at — из формы (после проверки «не в прошлом»),
      // arrival_at и flight_duration — только серверный расчёт из минут.
      departure_at: departureAt,
      arrival_at: arrivalAt,
      flight_duration: flightDuration,
      flight_class: flightClass,
      flight_price: flightPrice,
      hotel_name: String(req.body.hotel_name).trim(),
      hotel_stars: hotelStars,
      hotel_meal: hotelMeal,
      hotel_price: hotelPrice,
      transfer_type: transferType,
      transfer_price: transferPrice,
      total_price: totalPrice,
    },
  };
}

// Создание тура: POST /admin/tours/create
app.post('/admin/tours/create', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const validation = validateTourData(req);
    if (!validation.ok) {
      req.flash('error', validation.errors.join(' '));
      return res.redirect('/admin');
    }

    const d = validation.data;
    await pool.query(
      `INSERT INTO tours (
        title, description, image, rating, nights,
        departure_city, destination_country, destination_city,
        departure_at, arrival_at, flight_duration, flight_class, flight_price,
        hotel_name, hotel_stars, hotel_meal, hotel_price,
        transfer_type, transfer_price, total_price, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        d.title, d.description, d.image, d.rating, d.nights,
        d.departure_city, d.destination_country, d.destination_city,
        d.departure_at, d.arrival_at, d.flight_duration, d.flight_class, d.flight_price,
        d.hotel_name, d.hotel_stars, d.hotel_meal, d.hotel_price,
        d.transfer_type, d.transfer_price, d.total_price,
        true, // is_active
      ]
    );

    req.flash('success', 'Новый тур успешно создан и добавлен в каталог');
    res.redirect('/admin');
  } catch (err) {
    // Ошибка БД или неожиданное исключение: пишем настоящий текст в лог,
    // пользователю — понятное сообщение и возврат в админку вместо «500».
    console.error('POST /admin/tours/create:', err);
    req.flash('error', 'Не удалось создать тур. Попробуйте ещё раз.');
    res.redirect('/admin');
  }
});

// Редактирование тура: POST /admin/tours/:id/edit
app.post('/admin/tours/:id/edit', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      req.flash('error', 'Недопустимый ID тура.');
      return res.redirect('/admin');
    }

    // Проверяем существование тура
    const existing = await pool.query('SELECT id FROM tours WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      req.flash('error', 'Тур не найден.');
      return res.redirect('/admin');
    }

    const validation = validateTourData(req);
    if (!validation.ok) {
      req.flash('error', validation.errors.join(' '));
      return res.redirect('/admin');
    }

    const d = validation.data;
    await pool.query(
      `UPDATE tours SET
        title = $1, description = $2, image = $3, rating = $4, nights = $5,
        departure_city = $6, destination_country = $7, destination_city = $8,
        departure_at = $9, arrival_at = $10, flight_duration = $11, flight_class = $12, flight_price = $13,
        hotel_name = $14, hotel_stars = $15, hotel_meal = $16, hotel_price = $17,
        transfer_type = $18, transfer_price = $19, total_price = $20
      WHERE id = $21`,
      [
        d.title, d.description, d.image, d.rating, d.nights,
        d.departure_city, d.destination_country, d.destination_city,
        d.departure_at, d.arrival_at, d.flight_duration, d.flight_class, d.flight_price,
        d.hotel_name, d.hotel_stars, d.hotel_meal, d.hotel_price,
        d.transfer_type, d.transfer_price, d.total_price,
        id,
      ]
    );

    req.flash('success', 'Изменения в туре сохранены');
    res.redirect('/admin');
  } catch (err) {
    // Ошибка БД или неожиданное исключение: пишем настоящий текст в лог,
    // пользователю — понятное сообщение и возврат в админку вместо «500».
    console.error('POST /admin/tours/:id/edit:', err);
    req.flash('error', 'Не удалось сохранить изменения тура.');
    res.redirect('/admin');
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

// Обработчик ошибок: Express узнаёт его по четырём аргументам.
// Наружу отдаём подробности только в development: в production текст ошибки
// БД/файловой системы может раскрыть внутреннее устройство приложения.
app.use((err, req, res, next) => {
  console.error(err.stack);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).render('error', {
    title: 'Ошибка сервера',
    message: isDev ? err.message : 'Внутренняя ошибка сервера. Попробуйте позже.',
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
