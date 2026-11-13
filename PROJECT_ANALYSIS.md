# Полный анализ репозитория Tur-Project


---

## 1. Файловая структура

```
Tur-Project/
├── .dockerignore              # Исключения из Docker-образа
├── .gitignore                 # Исключения из Git
├── DATA_CONTRACT.md           # Контракт данных для будущей БД (users, tours, bookings)
├── docker-compose.yml         # Production-конфиг Docker Compose
├── docker-compose.dev.yml     # Оверрайд для режима разработки
├── Dockerfile                 # Инструкция сборки Docker-образа
├── package.json               # Метаданные проекта и скрипты
├── package-lock.json          # Lock-файл (фиксированные версии зависимостей)
├── PROJECT_ANALYSIS.md        # Этот файл — отчёт по репозиторию
├── README.md                  # Краткое описание для GitHub
│
├── server.js                  # Точка входа: инициализация Express-сервера
│
├── routes/
│   ├── index.js               # Маршруты: /, /healthz, /about
│   └── tours.js               # Маршруты: /tours, /tours/:id
│
├── data/
│   └── tours.js               # Данные туров (массив в памяти + findTourById)
│
├── views/
│   ├── index.ejs              # Главная страница
│   ├── tours.ejs              # Список всех туров
│   ├── tour.ejs               # Детальная страница одного тура
│   ├── about.ejs              # Страница «О нас»
│   ├── 404.ejs                # Страница «Не найдено»
│   ├── error.ejs              # Страница «Внутренняя ошибка»
│   │
│   └── partials/
│       ├── header.ejs         # Общий <head> + шапка + навигация
│       └── footer.ejs         # Подвал + подключение main.js
│
├── public/
│   ├── css/
│   │   └── style.css          # Все стили (~520 строк, CSS-переменные, адаптив)
│   │
│   ├── js/
│   │   └── main.js            # Клиентский JS (бургер-меню, подсветка ссылок,
│   │                            заглушка бронирования)
│   │
│   └── images/
│       ├── .gitkeep
│       ├── 1.webp
│       ├── 2.jpg
│       ├── 4.jpg
│       ├── 5.jpg
│       ├── 6.webp
│       ├── 7.webp
│       ├── 8.jpg
│       ├── 9.jpg
│       └── luchshie_oteli_Karelii.jpg
│       (10 файлов: 9 изображений + .gitkeep)
```

**Итого:** 33 файла (без `.git` и без этого отчёта), из них 14 файлов кода (JS / EJS / CSS) — 953 строки, 10 файлов в `images/` (9 изображений + .gitkeep).

---

## 2. Подробное описание каждого файла

### 2.1 `server.js` — Точка входа

**Назначение:** Создаёт Express-приложение, подключает маршруты, статику, шаблонизатор, настраивает обработчики ошибок и корректного завершения.

**Детали:**
- **Зависимости:** `path` (стандартная), `express`, `./routes/index`, `./routes/tours`.
- **Конфигурация:**
  - `PORT` — из переменной `process.env.PORT` или `3000`.
  - `HOST` — из `process.env.HOST` или `'0.0.0.0'` (обязательно внутри контейнера).
  - Шаблонизатор EJS: файлы лежат в `views/`, расширение `.ejs` подставляется автоматически.
- **Middleware:**
  - `express.urlencoded({ extended: false })` — разбор POST-форм.
  - `express.json()` — разбор JSON-тел запросов.
  - `express.static()` — раздача статических файлов из `public/`.
- **Маршруты:**
  - `app.use('/', indexRouter)` — подключает `routes/index.js`.
  - `app.use('/tours', toursRouter)` — подключает `routes/tours.js` (все пути начинаются с `/tours`).
- **404-хендлер:** `app.use((req, res) => ...)` — срабатывает, если ни один маршрут не подошёл (должен быть после всех `app.use()`).
- **Error-хендлер:** `app.use((err, req, res, next) => ...)` — Express узнаёт его по 4 аргументам. Выводит стек ошибки в консоль и рендерит `error.ejs`.
- **Запуск:** `app.listen(PORT, HOST, callback)` — выводит адрес в консоль.
- **Graceful shutdown:** Слушает `SIGTERM` и `SIGINT`, вызывает `server.close()` для завершения активных соединений. Через 10 секунд — принудительный выход (страховка).

**Связи:** Подключает `routes/index.js` и `routes/tours.js`. Рендерит шаблоны из `views/`. Раздаёт статику из `public/`.

---

### 2.2 `routes/index.js`

**Назначение:** Маршруты для главной страницы, healthcheck и страницы «О нас».

**Маршруты:**
| Метод | Путь | Действие |
|-------|------|----------|
| GET | `/` | Рендер `index.ejs` с заголовком «Главная — Туристический сайт» |
| GET | `/healthz` | Возвращает JSON: `{ status: 'ok', uptime: Math.round(process.uptime()) }`. Используется Docker healthcheck. |
| GET | `/about` | Рендер `about.ejs` с заголовком «О нас — Туристический сайт» |

**Зависимости:** `express` (стандартная), `express.Router()`.

**Связи:** Рендерит `views/index.ejs`, `views/about.ejs`.

---

### 2.3 `routes/tours.js`

**Назначение:** Маршруты для списка туров и детальной страницы тура.

**Маршруты:**
| Метод | Путь | Действие |
|-------|------|----------|
| GET | `/` | Рендер `tours.ejs` с массивом всех туров (`tours`) и заголовком |
| GET | `/:id` | Ищет тур по ID через `findTourById()`. Если найден — рендерит `tour.ejs`. Если нет — передаёт управление дальше (`next()`), что приводит к 404. |

**Зависимости:** `express`, `../data/tours` (импортирует `tours` и `findTourById`).

**Связи:** Читает данные из `data/tours.js`. Рендерит `views/tours.ejs` и `views/tour.ejs`.

---

### 2.4 `data/tours.js`

**Назначение:** «Базы данных» — массив объектов туров и функция поиска.

**Структура объекта тура:**
```javascript
{
  id: Number,           // уникальный идентификатор
  title: String,        // название тура
  country: String,      // страна
  city: String,         // город
  price: Number,        // цена в рублях
  nights: Number,       // количество ночей
  rating: Number,       // рейтинг из 5
  image: String,        // путь к изображению (относительный)
  description: String,  // краткое описание
  flight: String,       // информация о перелёте
  hotel: String,        // информация об отеле
  transfer: String      // информация о трансфере
}
```

**Тур 1 — Сочи:**
- `id: 1`, страна: Россия, город: Сочи, цена: 45000 ₽, 7 ночей, рейтинг: 4.7
- Описание: пляжи, Канатная дорога на Красную Поляну, Олимпийский парк.
- Перелёт: Москва → Сочи, 2ч 40мин. Отель 4★, 300м до моря. Групповой трансфер.

**Тур 2 — Стамбул:**
- `id: 2`, страна: Турция, город: Стамбул, цена: 62000 ₽, 5 ночей, рейтинг: 4.8
- Описание: Айя-София, Голубая мечеть, Гранд-базар, Босфор.
- Перелёт: Москва → Стамбул, 3ч 30мин. Отель 4★, Султанахмет. Индивидуальный трансфер.

**Тур 3 — Прага:**
- `id: 3`, страна: Чехия, город: Прага, цена: 58000 ₽, 6 ночей, рейтинг: 4.6
- Описание: Карлов мост, Пражский град, Староместская площадь.
- Перелёт: Москва → Прага, 3ч 10мин. Отель 3★, центр. Трансфер с табличкой.

**Функция `findTourById(id)`:**
- Принимает `id`, приводит к `Number`, ищет через `Array.find()`.
- Возвращает объект тура или `undefined`.

**Связи:** Экспортируется в `routes/tours.js`. Данные используются в `views/tours.ejs` и `views/tour.ejs`.

---

### 2.5 `views/partials/header.ejs`

**Назначение:** Общий HTML-каркас для всех страниц.

**Содержимое:**
- `<!DOCTYPE html>`, `<html lang="ru">`.
- `<head>`: charset UTF-8, viewport для мобильных, `<title>` с подстановкой `title` из маршрута, подключение `/css/style.css`.
- `<body>`:
  - `<header class="header">` — sticky-шапка.
    - Логотип: символ «Т» в квадрате + текст «ТурПроект», ссылка на `/`.
    - Бургер-кнопка (`.burger`): три `<span>` для анимации, атрибуты `aria-label` и `aria-expanded` для доступности.
    - Навигация (`.nav#nav`): ссылки на `/`, `/tours`, `/about`.
  - `<main class="main">` — контейнер для содержимого страницы (закрывается в `footer.ejs`).

**Связи:** Подключает `public/css/style.css`. Рендерится в каждой странице через `<%- include('partials/header') %>`.

---

### 2.6 `views/partials/footer.ejs`

**Назначение:** Завершающая часть шаблона.

**Содержимое:**
- Закрывает `</main>`.
- `<footer class="footer">`:
  - Копирайт: «© 2026 ТурПроект. Учебный проект.» (год берётся из `new Date().getFullYear()`).
  - Навигация: ссылки на `/tours` и `/about`.
- `<script src="/js/main.js"></script>` — подключение клиентского JS.
- Закрывает `</body></html>`.

**Связи:** Подключает `public/js/main.js`. Рендерится через `<%- include('partials/footer') %>`.

---

### 2.7 `views/index.ejs` — Главная страница

**Структура:**
1. Hero-секция (`.hero`):
   - Заголовок: «Туры, в которых всё уже включено».
   - Подзаголовок: про рейсы, проживание и трансферы.
   - Кнопки: «Смотреть туры» (ведёт на `/tours`) и «О нас» (ведёт на `/about`).
2. Секция преимуществ (`.features`):
   - Три карточки: «Перелёт», «Проживание», «Трансфер» — каждая с заголовком и описанием.

**Связи:** Включает `header.ejs` и `footer.ejs`. Использует CSS-классы из `style.css` (hero, features, btn).

---

### 2.8 `views/tours.ejs` — Список туров

**Структура:**
1. Заголовок: «Наши туры» + подзаголовок.
2. Сетка карточек (`.cards`): цикл `<% tours.forEach(...) %>`.
3. Каждая карточка (`.card`):
   - `.card__image`: `<img>` с `loading="lazy"`, `alt` из названия тура.
   - `.card__body`:
     - Мета: страна · город · ночи.
     - Заголовок с ссылкой на `/tours/<%= tour.id %>`.
     - Описание.
     - Футер: цена (`price.toLocaleString('ru-RU')`) и рейтинг.
     - Кнопка «Подробнее» (ведёт на `/tours/<%= tour.id %>`).

**Связи:** Получает переменную `tours` из `routes/tours.js`. Использует CSS-классы (cards, card).

---

### 2.9 `views/tour.ejs` — Детальная страница тура

**Структура:**
1. Ссылка «← Все туры» на `/tours`.
2. Статья (`.tour`):
   - `.tour__image`: изображение тура с `alt`.
   - `.tour__content`:
     - Мета: страна · город.
     - Заголовок (`<h1>`) с названием тура.
     - Описание.
     - `.tour__details` — таблица деталей:
       - Перелёт, Проживание, Трансфер, Длительность, Рейтинг.
     - `.tour__footer`: цена + кнопка «Забронировать» (`data-book="<%= tour.id %>"`).

**Связи:** Получает переменную `tour` из `routes/tours.js`. Использует CSS-классы (tour, tour__image, tour__details, tour__row, tour__footer).

---

### 2.10 `views/about.ejs` — Страница «О нас»

**Структура:**
1. Заголовок: «О нас» + подзаголовок с описанием проекта.
2. Блок преимуществ (`.features`):
   - «Прозрачная цена» — без скрытых доплат.
   - «Проверенные отели» — понятные условия.
   - «Поддержка» — вопросы до и во время поездки.

**Связи:** Аналогична `index.ejs` — включает header/footer, использует тот же CSS-класс features.

---

### 2.11 `views/404.ejs` — Страница не найдено

**Структура:**
- Код ошибки: «404» (`.error__code`).
- Заголовок: «Такой страницы нет».
- Подзаголовок: про устаревшую ссылку или опечатку.
- Кнопка: «На главную» (ссылка на `/`).

**Связи:** Рендерится из `server.js` в 404-хендлере.

---

### 2.12 `views/error.ejs` — Страница ошибки

**Структура:**
- Код ошибки: `<%= status || 500 %>`.
- Заголовок: «Что-то пошло не так».
- Сообщение: `<%= message || 'Внутренняя ошибка сервера.' %>`.
- Кнопка: «На главную» (ссылка на `/`).

**Связи:** Рендерится из `server.js` в error-хендлере. Получает переменные `status` и `message` из объекта ошибки.

---

### 2.13 `public/css/style.css` — Все стили

**Назначение:** Полная стилизация всего сайта (~520 строк).

**CSS-переменные (`:root`):**
| Переменная | Значение | Назначение |
|------------|----------|------------|
| `--color-bg` | `#f7f8fa` | Фон страницы |
| `--color-surface` | `#ffffff` | Фон карточек |
| `--color-text` | `#1b1f26` | Основной текст |
| `--color-muted` | `#6b7280` | Второстепенный текст |
| `--color-primary` | `#1565c0` | Основной цвет (синий) |
| `--color-primary-dark` | `#0d47a1` | Тёмный синий (hover) |
| `--color-border` | `#e3e7ee` | Цвет рамок |
| `--radius` | `14px` | Скругление |
| `--shadow` | `0 6px 24px rgba(...)` | Тень карточек |
| `--container` | `1120px` | Максимальная ширина контента |

**Блоки стилей:**
1. **Сброс и база:** `box-sizing: border-box`, `body` (flex, min-height: 100vh), изображения, ссылки.
2. **Контейнер:** `max-width: var(--container)`, центрирование, отступы 20px.
3. **Шапка (`.header`):** sticky-позиционирование, полупрозрачный фон с `backdrop-filter: blur(8px)`, высота 68px.
4. **Логотип (`.logo`):** flex с иконкой «Т» в квадрате (34×34px, синий фон).
5. **Навигация (`.nav`):** flex-ряд, активные ссылки с подчёркиванием.
6. **Бургер (`.burger`):** скрыт на десктопе, отображается при `max-width: 720px`. Анимация трёх полосок в крестик.
7. **Кнопки (`.btn`):**
   - `--primary`: синий фон, белый текст, тёмнеет при hover.
   - `--ghost`: прозрачный фон, белая рамка (для hero-секции).
   - `--block`: ширина 100%, для мобильных.
8. **Hero (`.hero`):** градиент `#0d47a1 → #1565c0 → #26a69a`, padding 84px, белый текст.
9. **Секции (`.section`):** padding 64px.
10. **Преимущества (`.features`):** CSS Grid `auto-fit, minmax(240px, 1fr)`, карточки с рамкой и скруглением.
11. **Карточки туров (`.cards`):** Grid `auto-fill, minmax(300px, 1fr)`. Hover: подъём + усиление тени.
12. **Страница тура (`.tour`):** Grid 2 колонки (1.1fr 1fr), изображение с aspect-ratio 4:3.
13. **Таблица деталей (`.tour__row`):** Grid 150px 1fr, разделители.
14. **Футер тура (`.tour__footer`):** flex, рамка, скругление, цена крупным шрифтом.
15. **Ошибки (`.error__code`):** 4rem, полупрозрачный.
16. **Подвал (`.footer`):** тёмный фон `#101826`, padding 28px.
17. **Адаптив:**
    - `max-width: 860px`: тур в одну колонку.
    - `max-width: 720px`: бургер-меню, nav абсолютное позиционирование, уменьшенные padding.

**Связи:** Подключается в `header.ejs` через `<link href="/css/style.css">`. Раздаётся через `express.static('public')`.

---

### 2.14 `public/js/main.js` — Клиентский JavaScript

**Назначение:** Интерактивность без перезагрузки страницы (~44 строки).

**Функционал:**
1. **Мобильное меню:**
   - Слушает клик по `.burger`.
   - Переключает класс `is-open` у `.nav` и у `.burger`.
   - Устанавливает `aria-expanded` для доступности.
2. **Подсветка активного пункта меню:**
   - Сравнивает `window.location.pathname` с `href` каждой ссылки.
   - Для `/` — точное совпадение. Для других — `path.startsWith(href)`.
   - Добавляет класс `is-active`.
3. **Обработка ошибок картинок:**
   - Слушает событие `error` на всех `.card__image img` и `.tour__image img`.
   - При ошибке загрузки — скрывает изображение (`display: none`), остаётся CSS-градиент.
4. **Кнопка бронирования:**
   - Слушает клик по `[data-book]`.
   - Меняет текст на «Заявка отправлена», делает кнопку неактивной.
   - Выводит `id` тура в консоль. (Серверной части нет.)

**Связи:** Подключается в `footer.ejs`. Использует CSS-классы из `style.css`.

---

### 2.15 `public/images/` — Изображения

**Содержимое (10 файлов, из них 9 изображений):**
| Файл | Формат | Вероятное назначение |
|------|--------|---------------------|
| `.gitkeep` | — | Заполнитель, чтобы папка сохранялась в git |
| `1.webp` | WebP | Общее изображение |
| `2.jpg` | JPEG | Общее изображение |
| `4.jpg` | JPEG | Общее изображение |
| `5.jpg` | JPEG | Общее изображение |
| `6.webp` | WebP | Общее изображение |
| `7.webp` | WebP | Общее изображение |
| `8.jpg` | JPEG | Общее изображение |
| `9.jpg` | JPEG | Общее изображение |
| `luchshie_oteli_Karelii.jpg` | JPEG | Баннер/фото (Каре́лия) |

**Замечание:** Пути в `data/tours.js` (`/images/tour-sochi.jpg`, `/images/tour-istanbul.jpg`, `/images/tour-prague.jpg`) **не совпадают** с реальными файлами в `public/images/`. Из-за этого изображения туров не отображаются, и JavaScript-код в `main.js` скрывает битые `<img>`, показывая CSS-градиент подложки.

---

### 2.16 `package.json` — Метаданные и скрипты

**Поля:**
| Поле | Значение |
|------|----------|
| `name` | `tur-project` |
| `version` | `1.0.0` |
| `description` | «Туристический сайт — список туров, рейсы, проживание и трансферы» |
| `main` | `server.js` |
| `license` | `ISC` |
| `keywords` | `tourism`, `travel`, `express`, `ejs` |

**Скрипты:**
| Скрипт | Команда | Назначение |
|--------|---------|------------|
| `start` | `node server.js` | Запуск сервера |
| `dev` | `node --watch server.js` | Автоперезапуск при изменении |
| `docker:build` | `docker compose build` | Сборка образа |
| `docker:up` | `docker compose up -d` | Запуск контейнера |
| `docker:down` | `docker compose down` | Остановка |
| `docker:logs` | `docker compose logs -f app` | Просмотр логов |
| `docker:dev` | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` | Dev-режим |

**Зависимости (production):**
| Пакет | Диапазон в `package.json` | Установлено (lock) | Назначение |
|-------|---------------------------|--------------------|-----------|
| `express` | `^4.19.2` | `4.22.3` | Веб-фреймворк |
| `ejs` | `^3.1.10` | `3.1.10` | Шаблонизатор |

**Зависимости:** devDependencies отсутствуют. Все пакеты — production.

**Связи:** `package-lock.json` фиксирует точные версии всех транзитивных зависимостей (~70 пакетов, включая `body-parser`, `cookie`, `debug`, `ms`, `accepts`, `content-type`, `send`, `serve-static`, `mime-types` и др.).

---

### 2.17 `package-lock.json` — Lock-файл

**Назначение:** Фиксирует точные версии всех зависимостей (прямых и транзитивных) для воспроизводимой сборки через `npm ci`.

**Всего зафиксировано пакетов: 76** (2 прямых + 74 транзитивных).

**Прямые зависимости:**
- `express@4.22.3`
- `ejs@3.1.10`

**Транзитивные зависимости Express (основные):**
`accepts@1.3.8`, `array-flatten@1.1.1`, `body-parser@1.20.9`, `bytes@3.1.2`, `content-disposition@0.5.4`, `content-type@1.0.5`, `cookie@0.7.2`, `cookie-signature@1.0.7`, `debug@2.6.9`, `depd@2.0.0`, `destroy@1.2.0`, `encodeurl@2.0.1`, `escape-html@1.0.3`, `etag@1.8.1`, `finalhandler@1.3.2`, `forwarded@0.2.0`, `fresh@0.5.2`, `http-errors@2.0.1`, `iconv-lite@0.4.24`, `inherits@2.0.4`, `ipaddr.js@1.9.1`, `media-typer@0.3.0`, `merge-descriptors@1.0.3`, `methods@1.1.2`, `mime@1.6.0`, `mime-db@1.52.0`, `mime-types@2.1.35`, `ms@2.0.0`, `negotiator@0.6.3`, `on-finished@2.4.2`, `parseurl@1.3.3`, `path-to-regexp@0.1.13`, `proxy-addr@2.0.8`, `qs@6.16.2`, `range-parser@1.2.1`, `raw-body@2.5.3`, `safe-buffer@5.2.1`, `safer-buffer@2.1.2`, `send@0.19.2`, `serve-static@1.16.3`, `setprototypeof@1.2.0`, `statuses@2.0.2`, `toidentifier@1.0.1`, `type-is@1.6.18`, `unpipe@1.0.0`, `utils-merge@1.0.1`, `vary@1.1.2`.

**Транзитивные зависимости EJS:**
`jake@10.9.4` (движок сборки файлов для EJS), `async@3.2.6`, `filelist@1.0.6`, `minimatch@5.1.9`, `brace-expansion@2.1.7`, `balanced-match@1.0.2`, `picocolors@1.1.1`.

**Служебные пакеты системы объектов/прототипов** (тянутся через `qs`, `side-channel`, `call-bound` и др.):
`call-bind-apply-helpers@1.0.2`, `call-bound@1.0.4`, `dunder-proto@1.0.1`, `es-define-property@1.0.1`, `es-errors@1.3.0`, `es-object-atoms@1.1.2`, `function-bind@1.1.2`, `get-intrinsic@1.3.0`, `get-proto@1.0.1`, `gopd@1.2.0`, `has-symbols@1.1.0`, `hasown@2.0.4`, `math-intrinsics@1.1.0`, `object-inspect@1.13.4`, `side-channel@1.1.1`, `side-channel-list@1.0.1`, `side-channel-map@1.0.1`, `side-channel-weakmap@1.0.2`.

**Примечание:** у `send@0.19.2` своя вложенная копия `ms@2.1.3` (в то время как корневая — `ms@2.0.0`) — это нормальное поведение npm при конфликте версий.

---

### 2.18 `DATA_CONTRACT.md` — Контракт данных для будущей БД

**Назначение:** Проектный документ, описывающий единую схему данных для перехода от текущего массива в памяти к полноценной базе данных. Согласовывает структуру между фронтендом, бэкендом и админкой.

**Содержит 4 раздела:**

1. **Таблица `users`** (пользователи и права) — 9 полей: `id`, `email`, `password_hash`, `full_name`, `phone`, `role` (`'user'`/`'manager'`/`'admin'`), `is_blocked`, `created_at`.

2. **Таблица `tours`** (пакетные туры) — 18 полей. По сравнению с текущим `data/tours.js` появляются:
   - Раздельные цены: `flight_price`, `hotel_price`, `transfer_price`, `total_price`.
   - Расширенная информация: `hotel_name`, `hotel_stars` (для фильтрации).
   - Флаг `is_active` для скрытия архивных туров.
   - Поля адаптированы под фильтры поиска (страна, город, цена, ночи, звёзды).

3. **Таблица `bookings`** (заявки на бронирование) — 9 полей: `id`, `tour_id` (FK), `user_id` (FK, nullable), `manager_id` (FK, nullable), `client_name`, `client_phone`, `comment`, `status` (`'new'`/`'confirmed'`/`'cancelled'`), `created_at`.

4. **Контракт маршрутов и переменных для фронтенда (EJS)** — описывает, какие объекты сервер обязуется передавать в `res.render(...)`:
   - Глобально через `res.locals`: `currentUser`.
   - `GET /tours` → `tours`, `filters`.
   - `GET /profile` → `bookings` (новый маршрут).
   - `GET /manager` → `tours`, `recentBookings` (новый маршрут).
   - `GET /admin` → `tours`, `bookings`, `users` (новый маршрут).

**Связи:** Пока не реализован в коде — это план на будущее. Текущий `data/tours.js` не соответствует контракту (нет отдельных цен, нет `hotel_name`/`hotel_stars`/`is_active`).

---

### 2.19 `README.md` — Описание проекта

**Назначение:** Описание для GitHub, содержит краткий обзор, структуру файлов, команды Docker и без-Docker запуска, таблицу переменных окружения.

**Содержимое (92 строки):**
- Стек: Node.js 20, Express 4, EJS, Docker / Docker Compose.
- Структура проекта (базовая, упрощённая).
- Запуск через Docker (production + dev).
- Примечание о проблемах с файловой системой Windows в Docker Desktop.
- Запуск без Docker (`npm install` + `npm start`).
- Таблица переменных окружения.
- Проверка состояния через `/healthz`.

---

## 3. Docker-инфраструктура

### 3.1 `Dockerfile` — Инструкция сборки

**Пошаговый разбор:**

```dockerfile
FROM node:20-alpine          # 1. Базовый образ: Node.js 20 на Alpine (~50MB)
WORKDIR /app                 # 2. Рабочая папка внутри контейнера
ENV NODE_ENV=production \    # 3. Переменные по умолчанию
    PORT=3000
COPY package.json            # 4. Копируем package.json + lock (слой 1)
     package-lock.json ./
RUN npm ci --omit=dev \      # 5. Устанавливаем только prod-зависимости
     && npm cache clean --force  # (слой 2, переиспользуется при изменении package.json)
COPY --chown=node:node . .   # 6. Копируем весь код (слой 3)
USER node                    # 7. Переключаемся на непривилегированного пользователя
EXPOSE 3000                  # 8. Порт приложения
HEALTHCHECK ... CMD node ... # 9. Проверка живости через /healthz
CMD ["node", "server.js"]    # 10. Запуск сервера
```

**Особенности:**
- Многослойная сборка: `npm ci` выполняется до копирования кода, поэтому слои с зависимостями кэшируются.
- `--omit=dev` не устанавливает devDependencies.
- `npm cache clean --force` уменьшает размер образа.
- `--chown=node:node` меняет владельца файлов.
- `USER node` — контейнер не работает от root.
- `HEALTHCHECK` каждые 30 секунд проверяет `/healthz` через `fetch`.

---

### 3.2 `docker-compose.yml` — Production

```yaml
services:
  app:
    build:
      context: .             # Собираем из текущей папки
    image: tur-project:latest # Имя образа
    container_name: tur-project-app
    ports:
      - "${APP_PORT:-3000}:3000"  # Порт на хосте (через APP_PORT, default 3000)
    environment:
      - NODE_ENV=production     # Production-режим
      - PORT=3000               # Порт внутри контейнера
    restart: unless-stopped     # Автоперезапуск
    # healthcheck наследуется из Dockerfile
```

---

### 3.3 `docker-compose.dev.yml` — Режим разработки

```yaml
services:
  app:
    environment:
      - NODE_ENV=development    # Dev-режим
      - PORT=3000
    volumes:
      - .:/app                  # Монтируем весь проект в контейнер
      - /app/node_modules       # Перекрываем node_modules (не затираем)
    command: npm run dev        # node --watch server.js
```

**Отличия от production:**
- Исходники монтируются (bind mount), поэтому правки видны сразу.
- `NODE_ENV=development`.
- `npm run dev` с `node --watch` — автоперезапуск при изменении `server.js`.
- Том `/app/node_modules` сохраняет установленные зависимости.

**Запуск dev:**
```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

**Запуск production:**
```powershell
docker compose up -d --build
```

---

### 3.4 `.dockerignore` — Исключения из образа

**Исключённые файлы/папки:**
- `node_modules` — зависимости устанавливаются внутри образа.
- `npm-debug.log*`, `*.log` — логи.
- `.git`, `.gitignore`, `.vscode`, `.idea` — инструменты разработки.
- `.env`, `.env.*` — секреты.
- `Dockerfile`, `Dockerfile.*`, `docker-compose*.yml`, `.dockerignore` — файлы Docker.
- `*.md` — документация.
- `tmp`, `temp` — временные файлы.

**Размер образа:** Благодаря Alpine + exclusion — минимальный (~150-200MB).

---

### 3.5 `.gitignore` — Исключения из Git

**Исключённые файлы/папки:**
- `node_modules/` — зависимости (устанавливаются из lock-файла).
- `logs`, `*.log`, `npm-debug.log*` — логи.
- `.env`, `.env.local` — переменные окружения.
- `.npm`, `.cache/`, `.DS_Store`, `Thumbs.db` — кэш и мусор.
- `.vscode/`, `.idea/` — настройки редакторов.
- `tmp/`, `temp/` — временные файлы.

---

## 4. Функции и их связи

### 4.1 Серверные функции

| Файл | Функция/Экспорт | Описание |
|------|-----------------|----------|
| `server.js` | `app.listen()` | Запуск HTTP-сервера на порту 3000. |
| `server.js` | `shutdown(signal)` | Graceful shutdown по SIGTERM/SIGINT. |
| `routes/index.js` | `router.get('/', ...)` | Главная страница. |
| `routes/index.js` | `router.get('/healthz', ...)` | Healthcheck для Docker. |
| `routes/index.js` | `router.get('/about', ...)` | Страница «О нас». |
| `routes/tours.js` | `router.get('/', ...)` | Список всех туров. |
| `routes/tours.js` | `router.get('/:id', ...)` | Детальная страница тура. |
| `data/tours.js` | `findTourById(id)` | Поиск тура по числовому ID. |
| `data/tours.js` | `tours` (экспорт) | Массив из 3 объектов туров. |

### 4.2 Клиентские функции (JS)

| Функция | Описание |
|---------|----------|
| Бургер-меню | Переключает `is-open` у навигации и кнопки. |
| Активная ссылка | Подсвечивает пункт меню по текущему URL. |
| Обработка ошибок картинок | Скрывает `<img>` при ошибке загрузки. |
| Кнопка бронирования | Меняет текст, блокирует кнопку, выводит ID в консоль. |

---

## 5. Поток данных (Data Flow)

```
Пользователь
    │
    ▼
Браузер → GET /
    │
    ▼
Express (server.js) → routes/index.js → GET / → render('index.ejs')
    │                                      │
    │                     ┌────────────────┘
    │                     ▼
    │              header.ejs + index.ejs + footer.ejs
    │                     │
    │                     ▼
    │              Статика: /css/style.css, /js/main.js, /images/*
    │                     │
    ▼                     ▼
    │         Пользователь нажимает «Смотреть туры»
    │                     │
    ▼                     ▼
Express → routes/tours.js → GET /tours → render('tours.ejs')
    │                          │
    │                   data/tours.js (массив из 3 туров)
    │                          │
    │                          ▼
    │                   tours.ejs: цикл по туров → карточки
    │                          │
    ▼                          ▼
    │         Пользователь нажимает «Подробнее»
    │                          │
    ▼                          ▼
Express → routes/tours.js → GET /tours/:id → findTourById(id)
    │                          │
    │                          ▼
    │                   tour.ejs: отображение деталей тура
    │                          │
    ▼                          ▼
    │         Пользователь нажимает «Забронировать»
    │                          │
    ▼                          ▼
    │                  JS: меняет текст кнопки, console.log
    │                  (серверный вызов отсутствует)
```

---

## 6. Зависимости между файлами

```
server.js
├── routes/index.js
│   ├── views/index.ejs
│   │   ├── views/partials/header.ejs
│   │   │   └── public/css/style.css
│   │   └── views/partials/footer.ejs
│   │       └── public/js/main.js
│   ├── views/about.ejs
│   │   ├── views/partials/header.ejs
│   │   └── views/partials/footer.ejs
│   └── (healthz → JSON, без шаблонов)
│
├── routes/tours.js
│   ├── data/tours.js
│   ├── views/tours.ejs
│   │   ├── views/partials/header.ejs
│   │   └── views/partials/footer.ejs
│   └── views/tour.ejs
│       ├── views/partials/header.ejs
│       └── views/partials/footer.ejs
│
├── views/404.ejs (404-хендлер в server.js)
│   ├── views/partials/header.ejs
│   └── views/partials/footer.ejs
│
└── views/error.ejs (error-хендлер в server.js)
    ├── views/partials/header.ejs
    └── views/partials/footer.ejs

Статика (express.static):
├── public/css/style.css   ← header.ejs
├── public/js/main.js      ← footer.ejs
└── public/images/*        ← tours.ejs, tour.ejs (но пути не совпадают с data/tours.js)
```

---

## 7. Маршруты и их обработчики

| URL | Метод | Файл маршрута | Функция | Шаблон | Переменные |
|-----|-------|---------------|---------|--------|------------|
| `/` | GET | `routes/index.js` | `GET /` | `index.ejs` | `title` |
| `/healthz` | GET | `routes/index.js` | `GET /healthz` | — (JSON) | `status`, `uptime` |
| `/about` | GET | `routes/index.js` | `GET /about` | `about.ejs` | `title` |
| `/tours` | GET | `routes/tours.js` | `GET /` | `tours.ejs` | `title`, `tours` |
| `/tours/:id` | GET | `routes/tours.js` | `GET /:id` | `tour.ejs` | `title`, `tour` |
| любой другой | — | `server.js` | 404-хендлер | `404.ejs` | `title` |
| при ошибке | — | `server.js` | error-хендлер | `error.ejs` | `title`, `message`, `status` |

---

## 8. Переменные окружения

| Переменная | По умолчанию | Где используется | Назначение |
|------------|-------------|------------------|------------|
| `PORT` | `3000` | `server.js`, `Dockerfile`, `docker-compose.yml` | Порт приложения внутри контейнера |
| `HOST` | `0.0.0.0` | `server.js` | Адрес прослушивания (0.0.0.0 для Docker) |
| `NODE_ENV` | `production` | `docker-compose.yml`, `docker-compose.dev.yml` | Режим Express |
| `APP_PORT` | `3000` | `docker-compose.yml` | Порт на хост-машине (через шаблон `${APP_PORT:-3000}`) |

---

## 9. Жизненный цикл запуска

### Production (`docker compose up -d --build`)

1. Docker читает `Dockerfile` → собирает образ `tur-project:latest`.
2. Копирует `package.json` + `package-lock.json` → `npm ci --omit=dev`.
3. Копирует код → меняет владельца на `node`.
4. Запускает `node server.js` на порту 3000.
5. Docker Compose маппит `${APP_PORT:-3000}:3000`.
6. `HEALTHCHECK` каждые 30 секунд проверяет `GET /healthz`.
7. Сайт доступен по `http://localhost:<APP_PORT>`.

### Development (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`)

1. Собирается тот же образ.
2. Bind mount `./` → `/app` (исходники с хоста).
3. Том `/app/node_modules` (сохраняет зависимости).
4. Команда: `npm run dev` → `node --watch server.js`.
5. Любое изменение `server.js` → автоперезапуск.
6. EJS и CSS читаются с диска при каждом запросе.

---

## 10. Замечания и потенциальные улучшения

1. **Несовпадение путей изображений:** `data/tours.js` ссылается на `/images/tour-sochi.jpg`, `/images/tour-istanbul.jpg`, `/images/tour-prague.jpg`, но в `public/images/` лежат `1.webp`, `2.jpg`, `4.jpg` и т.д. Нужно либо обновить пути в данных, либо переименовать файлы.
2. **Расхождение DATA_CONTRACT.md и `data/tours.js`:** В `DATA_CONTRACT.md` описана полная схема БД с раздельными ценами (`flight_price`, `hotel_price`, `transfer_price`, `total_price`), полями `hotel_name`, `hotel_stars`, `is_active`. Текущий `data/tours.js` использует упрощённую структуру (`flight`, `hotel`, `transfer` как текстовые строки, `price` как единая сумма). При переходе на БД потребуется маппинг.
3. **Бронирование:** кнопка «Забронировать» — только фронтенд-заглушка. В `DATA_CONTRACT.md` описана таблица `bookings` и маршруты `/profile`, `/manager`, `/admin` — но ни один из них не реализован.
4. **Хранение данных:** массив в памяти — при перезапуске контейнера данные теряются (хотя это учебный проект). Рекомендуется переход на SQLite/PostgreSQL.
5. **Тесты:** в проекте отсутствуют тесты.
6. **DevDependencies:** в `package.json` нет `devDependencies` (например, `nodemon` или `jest`).
7. **Сжатие:** не подключены middleware для gzip/brotli сжатия.
8. **CORS:** не настроен (не требуется для SSR, но может понадобиться при разделении фронтенда).

---

## 11. Итоговая сводка

| Параметр | Значение |
|----------|----------|
| Фреймворк | Express 4.22.3 (диапазон `^4.19.2` в package.json) |
| Шаблонизатор | EJS 3.1.10 |
| Node.js | 20 (Alpine) |
| Страниц | 6 (index, tours, tour, about, 404, error) |
| Маршрутов | 5 (/, /healthz, /about, /tours, /tours/:id) |
| Туров в базе | 3 (Сочи, Стамбул, Прага) |
| Зависимостей | 2 прямых (express, ejs), 74 транзитивных |
| Файлов изображений | 10 (9 изображений + .gitkeep) |
| Строк CSS | 521 |
| Строк JS | 44 |
| Docker-образ | node:20-alpine |
| Healthcheck | GET /healthz каждые 30 сек |
| Режимы запуска | production, development |
| Порт | 3000 (внутренний), APP_PORT (внешний) |
| Коммитов | 7 |
| Репозиторий | Git |

---

*Этот файл является внутренним отчётом и не предназначен для коммита в GitHub.*
