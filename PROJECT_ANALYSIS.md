# Полный анализ репозитория Tur-Project

> Последнее обновление: 2026-11-16

---

## 1. Файловая структура

```
Tur-Project/
├── .dockerignore              # Исключения из Docker-образа
├── .gitignore                 # Исключения из Git
├── DATA_CONTRACT.md           # Контракт данных (реализован в БД)
├── docker-compose.yml         # Production: приложение + PostgreSQL
├── docker-compose.dev.yml     # Оверрайд для разработки
├── Dockerfile                 # Сборка образа (node:20-alpine)
├── package.json               # 5 production-зависимостей
├── package-lock.json          # Фиксация версий
├── PROJECT_ANALYSIS.md        # Этот отчёт
├── README.md                  # Описание для GitHub
│
├── server.js                  # Точка входа (сессии, auth, /admin, /manager)
│
├── db/                        # Работа с PostgreSQL
│   ├── pool.js                # Пул соединений pg (DATABASE_URL)
│   ├── init.js                # CREATE TABLE users/tours/bookings + индексы
│   └── seed.js                # 3 тестовых пользователя + 5 туров
│
├── middlewares/               # Middleware-функции
│   └── auth.js                # attachCurrentUser, requireAuth, requireRole, dropSession
│
├── routes/
│   ├── index.js               # /, /healthz, /about
│   ├── tours.js               # /tours (POSTGRESQL + фильтры), /tours/:id
│   └── auth.js                # /auth/login, /auth/register, /auth/logout, /auth/me
│
├── data/
│   └── tours.js               # Массив в памяти (НЕ используется — legacy)
│
├── views/
│   ├── index.ejs              # Главная
│   ├── tours.ejs              # Список туров + фильтры
│   ├── tour.ejs               # Детальная страница тура
│   ├── about.ejs              # О нас
│   ├── login.ejs              # Форма входа (+ hidden next)
│   ├── register.ejs           # Форма регистрации
│   ├── admin.ejs              # Панель админа
│   ├── manager.ejs            # Панель менеджера
│   ├── 404.ejs                # Не найдено
│   ├── error.ejs              # Ошибка сервера
│   └── partials/
│       ├── header.ejs         # Шапка + навигация (вкл. авторизация)
│       └── footer.ejs         # Подвал + подключение JS
│
├── public/
│   ├── css/
│   │   └── style.css          # ~800 строк (базовые + формы, фильтры, auth, таблицы)
│   ├── js/
│   │   └── main.js            # 44 строки (бургер, подсветка, заглушка бронирования)
│   └── images/                # Файлы изображений (пути в данных не совпадают)
│
└── PROJECT_ANALYSIS_OLD.md    # Резервная копия предыдущего анализа
```

**Итого:** ~33 файла кода (JS / EJS / CSS), 10 файлов в images/, 2 Docker-файла, 3 файла БД.

---

## 2. Подробное описание каждого файла

### 2.1 `server.js` — Точка входа

**Назначение:** Создаёт Express-приложение, подключает маршруты, статику, шаблонизатор, сессии, middleware авторизации, панели администратора/менеджера, обработчики ошибок и корректного завершения.

**Зависимости:** `path`, `express`, `express-session`, маршруты (`index`, `tours`, `auth`), middleware (`auth`), `db/pool`.

**Middleware-слои (в порядке выполнения):**
1. `express.urlencoded({ extended: false })` — разбор POST-форм.
2. `express.json()` — разбор JSON-тел запросов.
3. `express.static('public')` — раздача статики.
4. `app.set('trust proxy', 1)` — корректная `cookie.secure` за nginx.
5. `express-session` — сессии на cookie `connect.sid`, secret из `SESSION_SECRET`, maxAge 24ч, `sameSite: 'lax'`.
6. `attachCurrentUser` — глобальный middleware: при каждом запросе читает пользователя из БД по `req.session.userId`, кладёт в `res.locals.currentUser` (шаблоны) и `req.user` (защита). При `is_blocked = true` или удалённом пользователе — принудительный разлогин.
7. Подключение маршрутов: `index`, `tours`, `auth` (дважды — по `/auth/*` и алиасам `/login`, `/register`, `/logout`).
8. Панель админа `GET /admin` — `requireAuth` + `requireRole('admin')`. Загружает все туры, заявки, пользователей.
9. Панель менеджера `GET /manager` — `requireAuth` + `requireRole('admin','manager')`. Загружает активные туры + последние 20 заявок менеджера.
10. 404-хендлер — рендер `404.ejs`.
11. Error-хендлер — рендер `error.ejs`.

**Запуск:** `app.listen(PORT, HOST, callback)`.
**Graceful shutdown:** Слушает `SIGTERM` и `SIGINT`, вызывает `server.close()`, через 10 секунд — принудительный выход.

**Связи:** Подключает все маршруты, все шаблоны из `views/`, раздает статику из `public/`.

---

### 2.2 `routes/index.js`

**Назначение:** Маршруты для главной страницы, healthcheck и страницы «О нас».

| Метод | Путь | Действие |
|-------|------|----------|
| GET | `/` | Рендер `index.ejs` |
| GET | `/healthz` | JSON: `{ status: 'ok', uptime: Math.round(process.uptime()) }`. Используется Docker healthcheck. |
| GET | `/about` | Рендер `about.ejs` |

---

### 2.3 `routes/tours.js` — Каталог туров (PostgreSQL + фильтры)

**Назначение:** Список активных туров с фильтрами и страница одного тура. Источник данных — таблица `tours` в PostgreSQL.

**Словари кодов:** `FLIGHT_CLASS_LABELS` (`economy`→«Эконом» и т.д.), `HOTEL_MEAL_LABELS` (`RO`→«Без питания» и т.д.), `TRANSFER_TYPE_LABELS` (`bus`→«Групповой автобус» и т.д.). Функция `label(dict, code)` разворачивает БД-код в текст.

**`parseFilters(query)`:** читает query-строку, возвращает объект `{ country, city, maxPrice, nights, hotelStars }`. Пустые значения → `null`.

| Метод | Путь | Защита | Действие |
|-------|------|--------|----------|
| GET | `/` | — | Фильтрация по `country`, `city` (ILIKE), `maxPrice` (<=), `nights` (>=), `hotelStars` (>=), `is_active = TRUE`. Сортировка `total_price ASC, id ASC`. В шаблон: `tours`, `countries` (DISTINCT для select), `filters` (для подсветки формы). |
| GET | `/:id` | — | По `id` + `is_active = TRUE`. Скрытый тур → 404. В шаблон: `tour`, `flightClassLabel`, `mealLabel`, `transferLabel`. |

**Защита от инъекций:** Все фильтры передаются отдельным массивом параметров (`$1`, `$2`...), SQL-текст из query не собирается.

**Валидация `/:id`:** `!Number.isInteger(id) || id <= 0` → сразу 404, до базы не доходит.

---

### 2.4 `routes/auth.js` — Авторизация

| Метод | Путь | Действие |
|-------|------|----------|
| GET | `/auth/register` | Форма регистрации (если залогинен — редирект по роли) |
| POST | `/auth/register` | Валидация (все поля + пароль ≥ 8), bcrypt.hash, INSERT (role='user'), сессия, редирект по роли |
| GET | `/auth/login` | Форма входа с `nextUrl` (скрытое поле) |
| POST | `/auth/login` | SELECT по email, is_blocked, bcrypt.compare, `req.session.userId`, редирект: `next` → туда, иначе по роли, 401/403 при ошибке |
| POST | `/auth/logout` | `dropSession` |
| GET | `/auth/logout` | `dropSession` |
| GET | `/auth/me` | JSON `{ user: currentUser }` (без password_hash) |

**`safeNext(raw)`:** разрешает только внутренние пути (`/...`), отбрасывает `//host` (SSRF-редирект).
**`loginRenderData(req, error)`:** объединяет `error` и `nextUrl` для формы входа.

---

### 2.5 `middlewares/auth.js` — Ролевая защита

| Функция | Назначение |
|---------|------------|
| `attachCurrentUser` | Глобальный middleware: читает из БД при каждом запросе. Кладёт в `res.locals.currentUser` и `req.user`. При `is_blocked = true` → разлогин. |
| `requireAuth` | Если `req.user` нет → 302 на `/login?next=<current_url>`. |
| `requireRole(...roles)` | Если роль не входит в список → 302 на `/tours?error=access_denied`. |
| `dropSession` | Уничтожает сессию, чистит cookie, редиректит. |

**Принцип:** в сессии хранится только `userId`. Данные и статус блокировки всегда актуальны из БД.

---

### 2.6 `db/pool.js`

Единственный `Pool` из `pg` на основе `process.env.DATABASE_URL`. Обработчик `pool.on('error')` для логов обрыва соединений.

---

### 2.7 `db/init.js` — Создание таблиц

Идемпотентный скрипт (`CREATE TABLE IF NOT EXISTS`). Три таблицы строго по `DATA_CONTRACT.md`:

- **`users`**: `id`, `email` (UNIQUE), `password_hash`, `full_name`, `phone`, `role` (CHECK: user/manager/admin), `is_blocked`, `created_at`.
- **`tours`**: `id`, `title`, `description`, `image`, `rating` (CHECK 1.0–5.0), `nights`, `departure_city`, `destination_country`, `destination_city`, `departure_at`, `arrival_at`, `flight_duration`, `flight_class` (CHECK: economy/comfort/business), `flight_price`, `hotel_name`, `hotel_stars` (CHECK: 2/3/4/5), `hotel_meal` (CHECK: RO/BB/HB/AI), `hotel_price`, `transfer_type` (CHECK: bus/private), `transfer_price`, `total_price`, `is_active`.
- **`bookings`**: `id`, `tour_id` (FK→tours), `user_id` (FK→users, nullable), `manager_id` (FK→users, nullable), `client_name`, `client_phone`, `comment`, `status` (CHECK: new/confirmed/cancelled), `created_at`.

Индексы: `idx_tours_dest_country`, `idx_tours_dest_city`, `idx_tours_total`, `idx_bookings_user`, `idx_bookings_manager`.

---

### 2.8 `db/seed.js` — Тестовые данные

Идемпотентный (проверка `count(*) > 0`). Пароль `TestPass123!`.

**3 пользователя:** `admin@turist.ru` (admin), `manager@turist.ru` (manager), `user@turist.ru` (user).
**5 туров:** Сочи (7 ночей, 43 000 ₽), Стамбул (5 ночей, 46 000 ₽), Прага (6 ночей, 44 000 ₽), Анталья (10 ночей, 82 000 ₽, бизнес/AI), Санкт-Петербург (4 ночи, 31 500 ₽).

---

### 2.9 `views/partials/header.ejs` — Шапка + навигация

```
Логотип (Т ТурПроект) | Бургер | Главная · Туры · О нас
```

**Блок `.nav__auth`** (справа, `margin-left: auto`):
- **Гость:** «Вход» + «Регистрация» (кнопка).
- **User:** имя + (admin → «Админка») + (admin/manager → «Кабинет») + «Выход» (POST-форма).

Защита: `typeof currentUser !== 'undefined'` — не падает, если БД недоступна и `attachCurrentUser` вызвал `next(err)`.

---

### 2.10 `views/tours.ejs` — Каталог + фильтры

**Форма `.filters`** (`method="get"`):
- `Страна` — `<select>` с `DISTINCT destination_country` из БД.
- `Город или курорт` — `<input text>` (ILIKE).
- `Цена до, ₽` — `<input number>` (<=).
- `Ночей не меньше` — `<input number>` (>=).
- `Отель от` — `<select>` звёзд (>=).
- Кнопки: «Найти» / «Сбросить».

**Карточки:** мета (`destination_country · destination_city · nights ночей`), название, описание, `hotel_stars★ hotel_name`, цена (`total_price`), рейтинг.

**Пустое состояние:** `<p class="empty">` + ссылка на весь каталог.
**Счётчик:** `<p class="results-count">Найдено туров: N</p>`.

---

### 2.11 `views/tour.ejs` — Детальная страница тура

**Блоки из колонок БД:**
- Перелёт: `departure_city → destination_city, flightClassLabel, в пути flight_duration`.
- Вылет / Прилёт — отформатированные даты.
- Проживание: `hotel_name, hotel_stars★, destination_city — mealLabel`.
- Трансфер: `transferLabel`.
- Длительность: `nights ночей`.
- Рейтинг.

**Футер:** `total_price` + разбивка (`flight_price`, `hotel_price`, `transfer_price`). Кнопка «Забронировать» (`data-book`).

---

### 2.12 `views/admin.ejs` — Панель админа

Три таблицы:
1. **Туры:** ID, название, `destination_country`, `destination_city`, `total_price`, `is_active`.
2. **Заявки:** ID, тур, клиент, телефон, статус, `created_at` (форматирование `toLocaleString`).
3. **Пользователи:** ID, email, ФИО, роль, `is_blocked`.

---

### 2.13 `views/manager.ejs` — Панель менеджера

Приветствие `<%= currentUser.full_name %>`.
1. **Активные туры:** ID, название, `destination_country`, `destination_city`, ночи, цена.
2. **Мои заявки:** последние 20, ID, тур, клиент, телефон, статус, `created_at` (форматирование).

---

### 2.14 `views/login.ejs` — Форма входа

Поля: email, пароль. **Скрытое поле `<input type="hidden" name="next" value="...">`** — сохраняет `next` при редиректе через `requireAuth`. Выводит `error` при неудаче.

---

### 2.15 `views/register.ejs` — Форма регистрации

Поля: email, пароль, ФИО, телефон. Выводит `error` при неудаче.

---

### 2.16 `views/404.ejs` и `views/error.ejs`

Страницы ошибок. Рендерятся из `server.js`.

---

### 2.17 `public/css/style.css` — Стили (~800 строк)

**Базовые (521 строка):** CSS-переменные, сброс, контейнер, шапка, логотип, навигация, бургер, кнопки, hero, секции, преимущества, карточки туров, страница тура, подвал, адаптив.

**Добавлены:**
- `.nav__auth` — блок авторизации в навигации (`flex`, `margin-left: auto`).
- `.form` — стилизация форм логина/регистрации (padding, border, shadow, focus).
- `.form__group`, `.form__label`, `.form__input` — поля формы.
- `.alert`, `.alert--error` — ошибки регистрации/входа.
- `.admin-table` — стилизация таблиц админки/менеджера.
- `.btn--secondary`, `.btn--sm` — вторичные кнопки.
- `.filters`, `.filters__field`, `.filters__label`, `.filters__input`, `.filters__actions` — форма фильтров каталога.
- `.empty`, `.results-count` — пустое состояние и счётчик.
- `.card__hotel`, `.tour__price-note` — доп. блоки в карточках.
- Мобильные правила для `.nav__auth` (flex-direction: column), `.filters` (grid: 1fr).

---

### 2.18 `public/js/main.js` — Клиентский JavaScript (44 строки)

1. **Бургер-меню** — переключает `is-open` у `.nav` и `.burger`.
2. **Подсветка активного пункта** — `path.startsWith(href)`.
3. **Обработка ошибок картинок** — скрывает `<img>` при `error`.
4. **Кнопка бронирования** — заглушка: меняет текст, блокирует кнопку, `console.log`.

---

## 3. Docker-инфраструктура

### 3.1 `Dockerfile`

```
FROM node:20-alpine → WORKDIR /app → COPY package*.json → npm ci --omit=dev → COPY . → USER node → EXPOSE 3000 → HEALTHCHECK /healthz → CMD node server.js
```

### 3.2 `docker-compose.yml`

```yaml
services:
  app:
    build: .
    ports: ${APP_PORT:-3000}:3000
    environment:
      - DATABASE_URL=postgres://tur:${POSTGRES_PASSWORD:-tur_pass}@db:5432/tur_project
      - SESSION_SECRET=${SESSION_SECRET:-tur-project-secret-change-in-production}
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tur
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-tur_pass}
      POSTGRES_DB: tur_project
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports: ${DB_PORT:-5432}:5432
    healthcheck: pg_isready -U tur -d tur_project

volumes:
  pgdata:
```

### 3.3 `docker-compose.dev.yml`

Bind mount `./` → `/app`, `NODE_ENV=development`, `npm run dev` (`node --watch`).

### 3.4 Порядок инициализации

```powershell
docker compose up -d --build
docker compose exec app node db/init.js
docker compose exec app node db/seed.js
```

---

## 4. Маршруты и их обработчики

| URL | Метод | Файл | Защита | Шаблон | Переменные |
|-----|-------|------|--------|--------|------------|
| `/` | GET | `routes/index.js` | — | `index.ejs` | `title` |
| `/healthz` | GET | `routes/index.js` | — | — (JSON) | `status`, `uptime` |
| `/about` | GET | `routes/index.js` | — | `about.ejs` | `title` |
| `/tours` | GET | `routes/tours.js` | — | `tours.ejs` | `tours`, `countries`, `filters` |
| `/tours/:id` | GET | `routes/tours.js` | — | `tour.ejs` | `tour`, `flightClassLabel`, `mealLabel`, `transferLabel` |
| `/login` | GET/POST | `routes/auth.js` | — | `login.ejs` | `error`, `nextUrl` |
| `/register` | GET/POST | `routes/auth.js` | — | `register.ejs` | `error` |
| `/logout` | GET/POST | `routes/auth.js` | — | (редирект) | — |
| `/me` | GET | `routes/auth.js` | — | (JSON) | `{ user: currentUser }` |
| `/admin` | GET | `server.js` | `requireAuth` + `requireRole('admin')` | `admin.ejs` | `tours`, `bookings`, `users` |
| `/manager` | GET | `server.js` | `requireAuth` + `requireRole('admin','manager')` | `manager.ejs` | `tours`, `recentBookings` |
| любой другой | — | `server.js` | — | `404.ejs` | `title` |
| при ошибке | — | `server.js` | — | `error.ejs` | `title`, `message`, `status` |

---

## 5. Зависимости между файлами

```
server.js
├── routes/index.js → views/index.ejs, views/about.ejs
│   └── partials/header.ejs → partials/footer.ejs → public/css/style.css, public/js/main.js
├── routes/tours.js → views/tours.ejs, views/tour.ejs
│   └── partials/header.ejs → partials/footer.ejs
├── routes/auth.js → views/login.ejs, views/register.ejs
├── middlewares/auth.js → db/pool.js
├── /admin → views/admin.ejs
├── /manager → views/manager.ejs
└── public/css/style.css, public/js/main.js, public/images/*

db/
├── init.js → pool.js
├── seed.js → pool.js, bcrypt
└── pool.js → pg
```

---

## 6. Поток данных

```
Гость → GET /tours
    → routes/tours.js: parseFilters(req.query)
    → pool.query: SELECT * FROM tours WHERE is_active = TRUE AND filters... ORDER BY total_price ASC
    → pool.query: SELECT DISTINCT destination_country FROM tours WHERE is_active
    → tours.ejs: форма фильтров + карточки (destination_country, destination_city, total_price...)

Авторизованный user → GET /admin
    → attachCurrentUser: SELECT users WHERE id = session.userId
    → requireAuth: req.user ✓
    → requireRole('admin'): role === 'admin' ✓
    → pool.query: SELECT * FROM tours/bookings/users
    → admin.ejs

POST /auth/login
    → pool.query: SELECT * FROM users WHERE email = $1
    → is_blocked? → 403
    → bcrypt.compare(password, password_hash)
    → req.session.userId = user.id
    → next (req.body.next || req.query.next) → туда
    → homeFor(role) → /admin | /manager | /tours
```

---

## 7. Переменные окружения

| Переменная | По умолчанию | Где используется | Назначение |
|------------|-------------|------------------|------------|
| `PORT` | `3000` | `server.js`, `Dockerfile` | Порт приложения внутри контейнера |
| `HOST` | `0.0.0.0` | `server.js` | Адрес прослушивания |
| `NODE_ENV` | `production` | `docker-compose.yml`, `docker-compose.dev.yml` | Режим |
| `APP_PORT` | `3000` | `docker-compose.yml` | Порт на хосте |
| `DATABASE_URL` | (compose) | `db/pool.js` | Строка подключения к PostgreSQL |
| `SESSION_SECRET` | `tur-project-secret-...` | `server.js` | Подпись cookie сессии |
| `POSTGRES_PASSWORD` | `tur_pass` | `docker-compose.yml` | Пароль БД |
| `DB_PORT` | `5432` | `docker-compose.yml` | Порт Postgres на хосте |

---

## 8. Жизненный цикл запуска

### Production (`docker compose up -d --build`)

1. Сборка образа `tur-project:latest` из `Dockerfile` (Alpine, `npm ci --omit=dev`).
2. `docker-compose.yml` создаёт контейнеры: `app` + `db` (ждёт `service_healthy`).
3. Инициализация БД: `docker compose exec app node db/init.js`.
4. Seed: `docker compose exec app node db/seed.js`.
5. `HEALTHCHECK` каждые 30 сек проверяет `/healthz`.
6. Сайт: `http://localhost:<APP_PORT>`.

### Development (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`)

1. Bind mount `./` → `/app`, `NODE_ENV=development`.
2. `npm run dev` → `node --watch server.js`.
3. EJS и CSS читаются с диска при каждом запросе.

---

## 9. Замечания и потенциальные улучшения

1. **`data/tours.js`** — устаревший файл, больше не импортируется никем. Можно удалить.
2. **Изображения:** пути в seed (`/images/tour-sochi.jpg` и т.д.) не совпадают с реальными файлами в `public/images/` (`1.webp`, `2.jpg` и т.д.). JS скрывает битые `<img>`, остаётся CSS-градиент.
3. **Кнопка «Забронировать»** — заглушка в `main.js`. Нет POST-маршрута для создания записи в `bookings`.
4. **Маршрут `/profile`** — описан в `DATA_CONTRACT.md`, но не реализован.
5. **Сессии в памяти** — при рестарте контейнера все пользователи разлогинены. Для продакшена нужен `connect-pg-simple`.
6. **Сжатие** — не подключены middleware для gzip/brotli.
7. **Тесты** — отсутствуют.
8. **DevDependencies** — отсутствуют (можно добавить `nodemon`, `jest`).

---

## 10. Итоговая сводка

| Параметр | Значение |
|----------|----------|
| Фреймворк | Express 4 |
| Шаблонизатор | EJS 3.1.10 |
| Node.js | 20 (Alpine) |
| База данных | PostgreSQL 16 (pg 8.13) |
| Таблицы | `users`, `tours`, `bookings` |
| Авторизация | Сессии + bcrypt + роли (user/manager/admin) |
| Middleware | `attachCurrentUser`, `requireAuth`, `requireRole` |
| Фильтры каталога | Страна, город, цена, ночи, звёзды (ILIKE, <=, >=) |
| Страниц (шаблонов) | 10 (index, tours, tour, about, login, register, admin, manager, 404, error) |
| Маршрутов | 12+ |
| Production-зависимостей | 5 (express, ejs, bcryptjs, express-session, pg) |
| Docker-сервисы | app + db (postgres:16-alpine) |
| Seed-пользователей | 3 (admin, manager, user) |
| Seed-туров | 5 |
| CSS | ~800 строк |
| Порт | 3000 (внутренний), APP_PORT (внешний) |
| Healthcheck | GET /healthz каждые 30 сек |
| Режимы запуска | production, development |

---

*Этот файл является внутренним отчётом и не предназначен для коммита в GitHub.*
