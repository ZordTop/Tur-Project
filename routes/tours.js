// Маршруты каталога: список туров с фильтрами, страница одного тура и
// самостоятельное бронирование.
// Источник данных — таблица tours в PostgreSQL (схема из DATA_CONTRACT.md).
// Сам SQL поиска живёт в services/tourService.js: тот же поиск понадобится
// панели менеджера, и правила фильтрации должны остаться одними и теми же.

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middlewares/auth');
const {
  searchTours,
  findActiveTourById,
  listActiveCountries,
  parseSearchFilters,
  FLIGHT_CLASS_LABELS,
  HOTEL_MEAL_LABELS,
  TRANSFER_TYPE_LABELS,
  label,
} = require('../services/tourService');

const router = express.Router();

// GET /tours — активные туры + фильтры из query-строки
// (?destination_country=&destination_city=&departure_city=&departure_date=
//  &flight_class=&hotel_meal=&transfer_type=&hotel_stars=&maxPrice=&nights=)
//
// В шаблон отдаём tours, countries и filters. countries нужен для выпадающего
// списка стран, filters — чтобы поля формы не сбрасывались после поиска
// (п. 2 раздела 4 контракта).
router.get('/', async (req, res, next) => {
  try {
    const filters = parseSearchFilters(req.query);

    // Поиск и список стран независимы, поэтому ждём оба одновременно
    const [tours, countries] = await Promise.all([
      searchTours(req.query),
      listActiveCountries(),
    ]);

    res.render('tours', {
      title: 'Все туры — Туристический сайт',
      tours,
      countries,
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
    const tour = await findActiveTourById(req.params.id);
    if (!tour) {
      return next();
    }

    res.render('tour', {
      title: `${tour.title} — Туристический сайт`,
      tour,
      // Подписи кодов из БД (economy / BB / bus) считает сервис —
      // шаблоны про словари кодов ничего не знают
      flightClassLabel: label(FLIGHT_CLASS_LABELS, tour.flight_class),
      mealLabel: label(HOTEL_MEAL_LABELS, tour.hotel_meal),
      transferLabel: label(TRANSFER_TYPE_LABELS, tour.transfer_type),
    });
  } catch (err) {
    next(err);
  }
});

// POST /tours/:id/book — самостоятельная бронировка тура клиентом.
// Защищён requireAuth: гость попадёт на /login?next=/tours/<id>/book, а после
// входа форма вернёт его сюда же (скрытое поле next в views/login.ejs).
//
// По п. 3 контракта заявка оформляется на себя: user_id = текущий клиент,
// manager_id = NULL (оформил не менеджер), status = 'new'.
router.post('/:id/book', requireAuth, async (req, res, next) => {
  try {
    const tour = await findActiveTourById(req.params.id);

    // Скрытый или несуществующий тур забронировать нельзя
    if (!tour) {
      return next();
    }

    // req.user кладёт attachCurrentUser: id, email, full_name, phone, role.
    // Контакты берём из профиля, а не из формы: клиенту не нужно вводить их
    // каждый раз, и он не может подставить чужие данные в свою заявку.
    const comment =
      typeof req.body.comment === 'string' && req.body.comment.trim()
        ? req.body.comment.trim()
        : null;

    await pool.query(
      `INSERT INTO bookings (tour_id, user_id, manager_id, client_name, client_phone, comment, status)
       VALUES ($1, $2, NULL, $3, $4, $5, 'new')`,
      [tour.id, req.user.id, req.user.full_name, req.user.phone, comment]
    );

    // booked=1 — сигнал для личного кабинета показать подтверждение
    res.redirect('/profile?booked=1');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
