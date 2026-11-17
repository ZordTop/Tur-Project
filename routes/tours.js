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
// Единые валидаторы анкеты туриста (см. utils/validators.js)
const {
  validatePhone,
  validatePassport,
  validateBirthDate,
  validatePassportExpiry,
} = require('../utils/validators');
// Приём фото туриста и скана паспорта (multer, см. middlewares/upload.js)
const { uploadBookingDocs, removeUploadedFiles } = require('../middlewares/upload');

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
// Форма страницы тура (multipart/form-data) отправляет анкету туриста, файлы
// client_photo / passport_scan и комментарий; id тура берётся из URL.
// uploadBookingDocs идёт после requireAuth: гостя не пускаем ещё до записи
// файлов на диск.
router.post('/:id/book', requireAuth, uploadBookingDocs, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      // Файлы могли успеть сохраниться до проверки id — убираем их.
      await removeUploadedFiles(req);
      return next();
    }

    // Бронировать можно только активный тур: скрытый/несуществующий → 404.
    const tourResult = await pool.query(
      'SELECT id, title FROM tours WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    const tour = tourResult.rows[0];
    if (!tour) {
      await removeUploadedFiles(req);
      return next();
    }

    // ── Анкета туриста (все поля обязательные, кроме комментария и файлов) ──
    const comment =
      typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 1000) : '';

    // client_name: если поле пустое — подставляем ФИО из профиля.
    const client_name =
      String(req.body.client_name || '').trim().slice(0, 150) ||
      String(req.user.full_name || '').trim().slice(0, 150);

    const client_phone = validatePhone(String(req.body.client_phone || ''));
    const birth_date = validateBirthDate(String(req.body.birth_date || ''));
    const passport_series_number = validatePassport(
      String(req.body.passport_series_number || '')
    );
    const passport_issued_by = String(req.body.passport_issued_by || '')
      .trim()
      .slice(0, 255);
    const passport_expires_at = validatePassportExpiry(
      String(req.body.passport_expires_at || '')
    );

    const errors = [];
    if (!client_name) errors.push('Укажите ФИО туриста.');
    if (!client_phone) errors.push('Телефон должен содержать ровно 11 цифр.');
    if (!birth_date) errors.push('Укажите корректную дату рождения (не в будущем).');
    if (!passport_series_number) {
      errors.push('Серия и номер паспорта — ровно 10 цифр.');
    }
    if (!passport_issued_by) errors.push('Укажите, кем выдан паспорт.');
    if (!passport_expires_at) {
      errors.push('Укажите корректный срок действия паспорта (не просрочен).');
    }

    if (errors.length > 0) {
      // Загруженные в этом запросе файлы не должны оставаться на диске.
      await removeUploadedFiles(req);
      req.flash('error', errors.join(' '));
      return res.redirect(`/tours/${id}`);
    }

    // В БД пишем только имена файлов (DATA_CONTRACT.md, блок 4).
    const client_photo = req.files && req.files.client_photo
      ? req.files.client_photo[0].filename
      : null;
    const passport_scan = req.files && req.files.passport_scan
      ? req.files.passport_scan[0].filename
      : null;

    await pool.query(
      `INSERT INTO bookings (
         tour_id, user_id, client_name, client_phone, comment, status,
         birth_date, passport_series_number, passport_issued_by,
         passport_expires_at, client_photo, passport_scan
       )
       VALUES ($1, $2, $3, $4, $5, 'new', $6, $7, $8, $9, $10, $11)`,
      [
        id,
        req.user.id,
        client_name,
        client_phone,
        comment || null,
        birth_date,
        passport_series_number,
        passport_issued_by,
        passport_expires_at,
        client_photo,
        passport_scan,
      ]
    );

    req.flash('success', `Заявка на тур «${tour.title}» создана. Менеджер свяжется с вами для подтверждения.`);
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
