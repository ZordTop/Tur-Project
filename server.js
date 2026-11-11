const path = require('path');
const express = require('express');

const indexRouter = require('./routes/index');
const toursRouter = require('./routes/tours');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
