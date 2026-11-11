const path = require('path');
const express = require('express');

const indexRouter = require('./routes/index');
const toursRouter = require('./routes/tours');

const app = express();
const PORT = process.env.PORT || 3000;
// 0.0.0.0 обязателен внутри контейнера: иначе порт не будет доступен снаружи
const HOST = process.env.HOST || '0.0.0.0';

// Шаблонизатор EJS: файлы лежат в views/, расширение можно не указывать
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Разбор данных из HTML-форм (POST-запросы)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Статика: css, js, картинки отдаются напрямую из public/
app.use(express.static(path.join(__dirname, 'public')));

// Маршруты
app.use('/', indexRouter);
app.use('/tours', toursRouter);

// 404 — страница не найдена (должна идти после всех маршрутов)
app.use((req, res) => {
  res.status(404).render('404', { title: 'Страница не найдена' });
});

// Обработчик ошибок: Express узнаёт его по четырём аргументам
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Ошибка сервера',
    message: err.message,
    status: 500,
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Сервер запущен: http://${HOST}:${PORT}`);
});

// Docker при docker stop / compose down присылает SIGTERM.
// Закрываем сервер штатно, чтобы не обрывать активные запросы.
let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Получен ${signal}, останавливаем сервер...`);

  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });

  // Страховка: если соединения не закрылись за 10 секунд — выходим принудительно
  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});
