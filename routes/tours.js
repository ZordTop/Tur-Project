// Маршруты каталога: список туров с фильтрами, страница одного тура и
// самостоятельное бронирование. Источник данных — таблица tours в PostgreSQL
// (схема из DATA_CONTRACT.md). В шаблон уходят колонки БД как есть, поэтому в
// views/tours.ejs и views/tour.ejs имена полей совпадают с именами колонок
// (destination_country, total_price...).

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middlewares/auth');
const { uploadBookingDocs, removeUploadedFiles, getUploadedFileName } = require('../middlewares/upload');
const { validateBookingData } = require('../utils/validators');
// Единая обработка фильтров для каталога и панели менеджера (см. utils/tourFilters.js)
const { parseFilters, buildConditions } = require('../utils/tourFilters');

const router = express.Router();

// Размер порции по умолчанию для JSON-подгрузки «Показать ещё» — совпадает
// с первой порцией на главной (routes/index.js, HOME_PAGE_SIZE).
const DEFAULT_PAGE_SIZE = 6;
// Верхняя граница limit: защита от запроса вида ?limit=100000.
const MAX_PAGE_SIZE = 60;

// Разбирает offset/limit из query-строки.
// Мусор и отрицательные числа → значения по умолчанию, limit зажимается
// в диапазон 1..MAX_PAGE_SIZE. В SQL эти числа уходят параметрами.
function parsePaging(query) {
  const toInt = (value, fallback) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : fallback;
  };

  const offset = toInt(query.offset, 0);
  const limit = Math.min(Math.max(toInt(query.limit, DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);

  return { offset, limit };
}

// GET /tours — активные туры с фильтрами из query-строки.
// Имена параметров совпадают с name-атрибутами форм в tours.ejs и index.ejs:
// departure_city, destination_country, destination_city, departure_date,
// nights, flight_class, hotel_stars, hotel_meal, transfer_type, maxPrice.
//
// Два режима одного маршрута:
//   1. HTML (по умолчанию) — страница каталога views/tours.ejs.
//   2. JSON (?format=json&offset=6&limit=6) — порция карточек для кнопки
//      «Показать ещё» на главной: { tours, hasMore, totalCount }.
router.get('/', async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    // Условие и значения считает единый модуль — значения всегда передаются
    // отдельным массивом ($1, $2...), query-параметры не попадают в SQL-текст.
    const { where, values } = buildConditions(filters);

    // ── Режим API для подгрузки карточек ──
    if (req.query.format === 'json') {
      const { offset, limit } = parsePaging(req.query);

      const limitPlaceholder = `$${values.length + 1}`;
      const offsetPlaceholder = `$${values.length + 2}`;

      const [toursResult, countResult] = await Promise.all([
        pool.query(
          `SELECT t.*
           FROM tours t
           WHERE ${where.join(' AND ')}
           ORDER BY t.total_price ASC, t.id ASC
           LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
          [...values, limit, offset]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total
           FROM tours t
           WHERE ${where.join(' AND ')}`,
          values
        ),
      ]);

      const totalCount = countResult.rows[0].total;
      return res.json({
        tours: toursResult.rows,
        // hasMore — есть ли ещё карточки после этой порции
        hasMore: offset + toursResult.rows.length < totalCount,
        totalCount,
      });
    }

    // ── Обычная HTML-страница каталога ──
    const [toursResult, countriesResult] = await Promise.all([
      pool.query(
        `SELECT t.*
         FROM tours t
         WHERE ${where.join(' AND ')}
         ORDER BY t.total_price ASC, t.id ASC`,
        values
      ),
      // Список стран для выпадающего списка в форме фильтров.
      // Шаблон ждёт массив строк, поэтому достаём колонку из строк результата.
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
// Форма страницы тура отправляет анкету туриста и файлы в multipart/form-data.
// middleware uploadBookingDocs обрабатывает файлы и перекладывает их в req.files,
// а текстовые поля — в req.body. Затем хендлер валидирует паспортные данные.
router.post('/:id/book', requireAuth, uploadBookingDocs, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      // Файлы уже приняты multer — на диске они не нужны, раз заявки не будет.
      removeUploadedFiles(req);
      return next();
    }

    // Бронировать можно только активный тур: скрытый/несуществующий → 404.
    const tourResult = await pool.query(
      'SELECT id, title FROM tours WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    const tour = tourResult.rows[0];
    if (!tour) {
      removeUploadedFiles(req);
      return next();
    }

    // 1. Валидация анкеты. Для клиента подставляем данные из профиля как fallback.
    const validation = validateBookingData(req.body, {
      defaultName: req.user.full_name,
      defaultPhone: req.user.phone,
    });

    if (!validation.ok) {
      removeUploadedFiles(req);
      req.flash('error', validation.errors.join(' '));
      return res.redirect(`/tours/${id}`);
    }

    // 2. Сохраняем имена загруженных файлов (или null, если не прикрепляли).
    const client_photo = getUploadedFileName(req, 'client_photo');
    const passport_scan = getUploadedFileName(req, 'passport_scan');

    const v = validation.values;

    await pool.query(
      `INSERT INTO bookings (tour_id, user_id, client_name, client_phone,
       birth_date, passport_series_number, passport_issued_by, passport_expires_at,
       client_photo, passport_scan, comment, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new')`,
      [id, req.user.id, v.client_name, v.client_phone, v.birth_date,
       v.passport_series_number, v.passport_issued_by, v.passport_expires_at,
       client_photo, passport_scan, v.comment]
    );

    req.flash('success', `Заявка на тур «${tour.title}» создана. Менеджер свяжется с вами для подтверждения.`);
    res.redirect('/profile');
  } catch (err) {
    // На случай ошибки сохранения: подчищаем файлы
    removeUploadedFiles(req);
    next(err);
  }
});

module.exports = router;
