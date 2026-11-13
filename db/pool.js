// Общий пул подключений к PostgreSQL.
// Используется и в db/init.js, и в db/seed.js, и в маршрутах приложения.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Пул может лежать в ожидании запроса и получить разрыв от БД (например,
// при рестарте контейнера). Логируем такие ошибки, но не роняем процесс.
pool.on('error', (err) => {
  console.error('Неожиданная ошибка простаивающего соединения pg:', err.message);
});

module.exports = pool;
