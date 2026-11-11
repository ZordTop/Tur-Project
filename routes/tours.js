const express = require('express');
const { tours, findTourById } = require('../data/tours');

const router = express.Router();

// Список всех туров
router.get('/', (req, res) => {
  res.render('tours', {
    title: 'Все туры — Туристический сайт',
    tours,
  });
});

// Один тур по id: /tours/1
router.get('/:id', (req, res, next) => {
  const tour = findTourById(req.params.id);

  // Если тур не найден — отдаём 404 через общий обработчик
  if (!tour) {
    return next();
  }

  res.render('tour', {
    title: `${tour.title} — Туристический сайт`,
    tour,
  });
});

module.exports = router;
