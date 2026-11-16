// Маршруты каталога: список туров с фильтрами и страница одного тура.
// Источник данных — таблица tours в PostgreSQL (схема из DATA_CONTRACT.md).
// В шаблон уходят колонки БД как есть, поэтому в views/tours.ejs и views/tour.ejs
// имена полей совпадают с именами колонок (destination_country, total_price...).

const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// Словари кодов из CHECK-ограничений схемы в человекочитаемый текст (п. 2 контракта)
const FLIGHT_CLASS_LABELS = {
  economy: 'Эконом',
  comfort: 'Комфорт',
  business: 'Бизнес',
};

const HOTEL_MEAL_LABELS = {
  RO: 'Без питания',
  BB: 'Завтраки',
  HB: 'Полупансион',
  AI: 'Всё включено',
};

const TRANSFER_TYPE_LABELS = {
  bus: 'Групповой автобус',
  private: 'Индивидуальный автомобиль',
};

// Разворачивает строку БД-кода в подпись для шаблона.
// Неизвестный код отдаём как есть, чтобы страница не падала из-за новой роли/кода.
function label(dict, code) {
  return dict[code] || code;
}

// Читает фильтры из query-строки. Пустые значения и мусор превращает в null,
// чтобы они не попали в SQL и не сбивали подсветку полей формы после поиска.
function parseFilters(query) {
  const toText = (value) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  const toPositiveNumber = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };

  return {
    country: toText(query.country),
    city: toText(query.city),
    maxPrice: toPositiveNumber(query.maxPrice),
    nights: toPositiveNumber(query.nights),
    hotelStars: toPositiveNumber(query.hotelStars),
  };
}

// GET /tours — активные туры (+ ?country=&city=&maxPrice=&nights=&hotelStars=)
// В шаблон отдаём tours и filters: filters нужны, чтобы форма поиска
// не сбрасывала уже выбранные значения (п. 2 раздела 4 контракта).
router.get('/', async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);

    // Условие собираем по частям, значения всегда передаём отдельным массивом —
    // так query-параметры не становятся частью SQL-текста (защита от инъекций).
    const where = ['t.is_active = TRUE'];
    const values = [];

    const addCondition = (condition, value) => {
      values.push(value);
      where.push(condition.replace('?', `$${values.length}`));
    };

    if (filters.country) {
      addCondition('t.destination_country = ?', filters.country);
    }
    if (filters.city) {
      addCondition('t.destination_city ILIKE ?', `%${filters.city}%`);
    }
    if (filters.maxPrice !== null) {
      addCondition('t.total_price <= ?', filters.maxPrice);
    }
    // Ночи и звёзды фильтруем «не меньше»: гость обычно ищет подлиннее и дороже
    if (filters.nights !== null) {
      addCondition('t.nights >= ?', filters.nights);
    }
    if (filters.hotelStars !== null) {
      addCondition('t.hotel_stars >= ?', filters.hotelStars);
    }

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
      countries: countriesResult.rows.map((row) => row.destination_country),
      filters,
    });
  } catch (err) {
    next(err);
  }
});

// GET /tours/:id — один активный тур. Скрытый (is_active = false) и несуществующий
// дают одинаковый ответ: next() → общий 404-обработчик из server.js.
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    // /tours/abc и /tours/-5 не доходят до базы: сразу 404
    if (!Number.isInteger(id) || id <= 0) {
      return next();
    }

    const result = await pool.query(
      'SELECT * FROM tours WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    const tour = result.rows[0];

    if (!tour) {
      return next();
    }

    res.render('tour', {
      title: `${tour.title} — Туристический сайт`,
      tour,
      flightClassLabel: label(FLIGHT_CLASS_LABELS, tour.flight_class),
      mealLabel: label(HOTEL_MEAL_LABELS, tour.hotel_meal),
      transferLabel: label(TRANSFER_TYPE_LABELS, tour.transfer_type),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
