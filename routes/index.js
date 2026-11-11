const express = require('express');

const router = express.Router();

// Главная страница
router.get('/', (req, res) => {
  res.render('index', { title: 'Главная — Туристический сайт' });
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
