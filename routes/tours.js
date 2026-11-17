// Маршруты каталога: список туров с фильтрами, страница одного тура и
// самостоятельное бронирование. Источник данных — таблица tours в PostgreSQL
// (схема из DATA_CONTRACT.md). В шаблон уходят колонки БД как есть, поэтому в
// views/tours.ejs и views/tour.ejs имена полей совпадают с именами колонок
// (destination_country, total_price...).

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middlewares/auth');
// Единая обработка фильтров для каталога и панели менеджера (см. utils/tourFilters.js)
const { parseFilters, buildConditions } = require('../utils/tourFilters');
const { validatePhone } = require('../utils/validators');

const router = express.Router();

// GET /tours — активные туры с фильтрами из query-строки.
// Имена параметров совпадают с name-атрибутами формы в tours.ejs:
// departure_city, destination_country, destination_city, departure_date,
// nights, flight_class, hotel_stars, hotel_meal, transfer_type, maxPrice.
// В шаблон отдаём tours и filters: filters нужны, чтобы форма поиска
// не сбрасывала уже выбранные значения (п. 2 раздела 4 контракта).
router.get('/', async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    // Условие и значения считает единый модуль — значения всегда передаются
    // отдельным массивом ($1, $2...), query-параметры не попадают в SQL-текст.
    const { where, values } = buildConditions(filters);

    const [toursResult, countriesResult] = await Promise.all([
      pool.query(
        `SELECT t.*
         FROM tours t
         WHERE ${where.join(' AND ')}
         ORDER BY t.total_price ASC, t.id ASC`,
        values
      ),
      // Список стран для выпадающего списка в форме фильтров
      pool.query(
        `SELECT DISTINCT destination_country
         FROM tours
         WHERE is_active = TRUE
         ORDER BY destination_country`
      ),
    ]);

    res.render('tours', {
      title: 'Все туры — Туристический сайт',
      tours: toursResult.rows,
      // tours.ejs рисует <datalist> со стран: ему нужен массив строк,
      // а не строк таблицы (в строке одна колонка destination_country).
      countries: countriesResult.rows.map((row) => row.destination_country),
      // filters — те же имена, что и параметры query-строки и колонки БД,
      // поэтому форма поиска после фильтрации показывает выбранные значения
      filters,
    });
  } catch (err) {
    next(err);
  }
});

// GET /tours/:id — один активный тур. Скрытый (is_active = false) и
// несуществующий дают одинаковый ответ: next() → общий 404-обработчик.
router.get('/:id', async (req, res, next) => {
  try {
    // Валидация id: мусор не должен доходить до PostgreSQL
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next();
    }

    const tourResult = await pool.query(
      'SELECT * FROM tours WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    const tour = tourResult.rows[0];
    if (!tour) {
      return next();
    }

    // Подписи кодов (класс рейса, питание, трансфер) шаблоны делают сами
    // из колонок tour.flight_class / tour.hotel_meal / tour.transfer_type.
    res.render('tour', {
      title: `${tour.title} — Туристический сайт`,
      tour,
    });
  } catch (err) {
    next(err);
  }
});

// POST /tours/:id/book — самостоятельная заявка авторизованного клиента.
// Форма страницы тура отправляет только комментарий; id тура берётся из URL,
// данные клиента — из профиля (req.user), роль менеджера не заполняется.
router.post('/:id/book', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next();
    }

    // Бронировать можно только активный тур: скрытый/несуществующий → 404.
    const tourResult = await pool.query(
      'SELECT id, title FROM tours WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    const tour = tourResult.rows[0];
    if (!tour) {
      return next();
    }

    const comment =
      typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 1000) : '';

    // Телефон из профиля может быть в старом формате (пробелы, +7).
    // Нормализуем здесь, чтобы в bookings всегда попадал канонический формат.
    const rawPhone = String(req.user.phone || '');
    const client_phone = validatePhone(rawPhone) || rawPhone.slice(0, 30);

    await pool.query(
      `INSERT INTO bookings (tour_id, user_id, client_name, client_phone, comment, status)
       VALUES ($1, $2, $3, $4, $5, 'new')`,
      [id, req.user.id, req.user.full_name, client_phone, comment || null]
    );

    req.flash('success', `Заявка на тур «${tour.title}» создана. Менеджер свяжется с вами для подтверждения.`);
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
