const express = require('express');
const pool = require('../db/pool');
// Единая обработка фильтров (utils/tourFilters.js) — те же правила, что в
// каталоге GET /tours и панели менеджера GET /manager.
const { parseFilters, buildConditions } = require('../utils/tourFilters');

const router = express.Router();

// Размер первой порции карточек на витрине: 3 колонки × 2 ряда = 6.
// Остальное подгружает кнопка «Показать ещё» через GET /tours?format=json.
const HOME_PAGE_SIZE = 6;

// Главная страница — витрина: компактная шапка, фильтр и порционная сетка туров.
router.get('/', async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    // where всегда начинается с t.is_active = TRUE — скрытые туры не показываем.
    const { where, values } = buildConditions(filters);

    // LIMIT тоже передаём параметром: пользовательские значения остаются
    // в values, а номер плейсхолдера считаем от их количества.
    const limitPlaceholder = `$${values.length + 1}`;

    const [toursResult, countResult, countriesResult] = await Promise.all([
      // Первая порция карточек
      pool.query(
        `SELECT t.*
         FROM tours t
         WHERE ${where.join(' AND ')}
         ORDER BY t.total_price ASC, t.id ASC
         LIMIT ${limitPlaceholder}`,
        [...values, HOME_PAGE_SIZE]
      ),
      // Сколько всего туров подходит под фильтр — по этому числу шаблон
      // решает, показывать ли кнопку «Показать ещё».
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM tours t
         WHERE ${where.join(' AND ')}`,
        values
      ),
      // Страны для подсказок в фильтре (не зависят от выбранных фильтров)
      pool.query(
        `SELECT DISTINCT destination_country
         FROM tours
         WHERE is_active = TRUE
         ORDER BY destination_country`
      ),
    ]);

    res.render('index', {
      title: 'Главная — Туристический сайт',
      tours: toursResult.rows,
      // filters — ключи совпадают с name-атрибутами формы, поэтому поля
      // фильтра после поиска остаются заполненными
      filters,
      countries: countriesResult.rows.map((row) => row.destination_country),
      totalCount: countResult.rows[0].total,
      pageSize: HOME_PAGE_SIZE,
    });
  } catch (err) {
    next(err);
  }
});

// Проверка живости приложения для Docker healthcheck
router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

// Страница «О нас» — пример простой страницы
router.get('/about', (req, res) => {
  res.render('about', { title: 'О нас — Туристический сайт' });
});

module.exports = router;
