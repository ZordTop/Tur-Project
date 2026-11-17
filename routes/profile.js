// Личный кабинет клиента: список броней с деталями тура.
// По п. 3 раздела 4 контракта: в шаблон передаётся bookings — массив броней
// с подтянутым названием тура, страной, городом, датой вылета и ценой.
//
// Все запросы защищены requireAuth: неавторизованный попадёт на /login.

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

// Статусы заявок в тексте (CHECK: new | confirmed | cancelled).
// Держимся здесь, а не в сервисе: статусы относятся к броням, а не к турам.
const BOOKING_STATUS_LABELS = {
  new: 'Новая',
  confirmed: 'Подтверждена',
  cancelled: 'Отменена',
};

// GET /profile — брони текущего пользователя с деталями тура.
// LEFT JOIN: если тур был удалён из каталога, заявка остаётся,
// а названия тура просто не будет.
//
// Наряду с полями из контракта берём b.tour_id (ссылка на страницу тура)
// и t.is_active (нужен, чтобы не давать ссылку на снятый с продажи тур).
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.tour_id, b.status, b.comment, b.created_at,
              t.title AS tour_title, t.destination_country, t.destination_city,
              t.departure_at, t.total_price, t.is_active AS tour_is_active
       FROM bookings b
       LEFT JOIN tours t ON t.id = b.tour_id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    res.render('profile', {
      title: 'Личный кабинет — Туристический сайт',
      bookings: result.rows,
      statusLabels: BOOKING_STATUS_LABELS,
      // booked=1 — флаг, что бронь только что оформлена (после POST /tours/:id/book).
      // Показываем баннер подтверждения, а потом при следующем GET флаг исчезает.
      justBooked: req.query.booked === '1',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
