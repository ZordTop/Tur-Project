const express = require('express');

const router = express.Router();

// Главная страница
router.get('/', (req, res) => {
  res.render('index', { title: 'Главная — Туристический сайт' });
});

// Страница «О нас» — пример простой страницы
router.get('/about', (req, res) => {
  res.render('about', { title: 'О нас — Туристический сайт' });
});

module.exports = router;
