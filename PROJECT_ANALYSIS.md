# Полный анализ репозитория Tur-Project

> Последнее обновление: 2026-11-17 (актуально для коммита `57bd0c5 fix` + рабочих документов)
>
> Документ описывает ТЕКУЩЕЕ состояние проекта: после ревизии и исправления всех
> найденных багов (см. раздел 9 и KODAREAD.md с историей исправлений).

---

## 1. Файловая структура

```
Tur-Project/
├── .dockerignore              # Исключения из Docker-образа
├── .gitignore                 # node_modules, .env.*, логи, редакторы
├── DATA_CONTRACT.md           # Контракт данных (реализован в БД)
├── docker-compose.yml         # Production: приложение + PostgreSQL
├── docker-compose.dev.yml     # Оверрайд для разработки (+проброс порта БД)
├── Dockerfile                 # Сборка образа (node:20-alpine)
├── KODAREAD.md                # Служебная памятка AI-ассистента
├── package.json               # 5 production-зависимостей
├── package-lock.json          # Фиксация версий
├── PROJECT_ANALYSIS.md        # Этот отчёт
├── README.md                  # Описание для GitHub
│
├── server.js                  # Точка входа (364 строки)
│
├── db/                        # Работа с PostgreSQL
│   ├── pool.js                # Пул соединений pg (DATABASE_URL) — 30 строк
│   ├── init.js                # CREATE TABLE users/tours/bookings + индексы — 163 строки
│   └── seed.js                # 3 тестовых пользователя + 5 туров — 256 строк
│
├── middlewares/               # Middleware-функции
│   ├── auth.js                # attachCurrentUser, requireAuth, requireRole, dropSession
│   ├── csrf.js                # CSRF-токен (без внешних зависимостей) — 64 строки
│   └── flash.js               # Одноразовые сообщения req.flash() — 36 строк
│
├── utils/
│   └── tourFilters.js         # parseFilters/buildConditions — единые фильтры
│                                для каталога и панели менеджера — 120 строк
│
├── routes/
│   ├── index.js               # /, /healthz, /about
│   ├── tours.js               # /tours (фильтры), /tours/:id, POST /tours/:id/book
│   └── auth.js                # /auth/login, /auth/register (+валидация), /auth/logout, /auth/me
│
├── views/
│   ├── index.ejs              # Главная
│   ├── tours.ejs              # Список туров + 10 фильтров
│   ├── tour.ejs               # Детальная страница тура + бронирование
│   ├── about.ejs              # О нас
│   ├── login.ejs              # Форма входа (nextUrl + _csrf)
│   ├── register.ejs           # Форма регистрации (nextUrl + _csrf)
│   ├── profile.ejs            # Личный кабинет: данные + мои брони
│   ├── manager.ejs            # Рабочее место менеджера + сайдбар оформления
│   ├── admin.ejs              # Панель админа: просмотр + CRUD-действия
│   ├── 404.ejs                # Не найдено
│   ├── error.ejs              # Ошибка сервера / 403 CSRF
│   └── partials/
│       ├── header.ejs         # Шапка, ролевая навигация, flash-блоки, _csrf в формах
│       └── footer.ejs         # Подвал + подключение JS
│
└── public/
    ├── css/style.css          # ~2900 строк (включая alert, role-темы, терминал)
    ├── js/main.js             # 221 строка (бургер, табы, модалки, сайдбар, bookPanel)
    └── images/                # Реальные фото туров (.jpg/.webp) + SVG-заглушки туров
```

**Удалено при ревизии:** `data/tours.js` — устаревшее хранилище в памяти; бэкенд
перешёл на PostgreSQL раньше, файл никем не импортировался.

---

## 2. Подробное описание каждого файла

### 2.1 `server.js` — Точка входа (364 строки)

**Назначение:** Express-приложение: сессии, flash, CSRF, авторизация, личный
кабинет, панели менеджера/админа с CRUD-действиями, обработчики ошибок.

**Middleware-слои (порядок важен, строки 19-69):**
1. `express.urlencoded` + `express.json` — разбор форм и JSON.
2. `express.static('public')` — статика.
3. `app.set('trust proxy', 1)` — корректный `cookie.secure` за nginx.
4. `express-session` — cookie `connect.sid`, secret из `SESSION_SECRET`; при
   production со значением по умолчанию — предупреждение в консоль (строки 35-45).
5. `flash` — одноразовые сообщения (должен быть до csrf: csrf рендерит
   error-страницу, где flash уже нужен).
6. `csrf` — проверка токена на POST/PUT/PATCH/DELETE (до БД-запросов).
7. `attachCurrentUser` — пользователь из БД в `res.locals.currentUser` / `req.user`.

**Маршруты в server.js:**

| Маршрут | Защита | Действие |
|---|---|---|
| `GET /profile` (стр. 82) | requireAuth | брони клиента: `b.*, t.title AS tour_title, t.total_price, t.departure_at WHERE b.user_id = $1` |
| `GET /manager` (стр. 107) | admin+manager | туры через `parseFilters/buildConditions` + 20 последних заявок менеджера; `filters` в шаблон |
| `POST /manager/book` (стр. 140) | admin+manager | INSERT заявки `manager_id = req.user.id, user_id = NULL`; валидация client_name/phone; flash + redirect |
| `GET /admin` (стр. 177) | admin | все туры (включая скрытые), все заявки, все юзеры без password_hash |
| `POST /admin/tours/:id/active` (стр. 210) | admin | toggle `is_active` |
| `POST /admin/bookings/:id/status` (стр. 234) | admin | статус из `['new','confirmed','cancelled']`, иначе отклонение |
| `POST /admin/users/:id/role` (стр. 262) | admin | роль из `['user','manager','admin']`; запрет снимать роль с себя |
| `POST /admin/users/:id/block` (стр. 296) | admin | toggle `is_blocked`; запрет блокировать себя |

Затем: 404-хендлер (`404.ejs`), error-хендлер (`error.ejs`, 4 аргумента),
`app.listen(PORT, HOST)`, graceful shutdown по SIGTERM/SIGINT (10 сек страховка).

**Ключевой принцип CRUD-действий:** id — только число из URL, значения — из
фиксированных списков, SQL собирается без пользовательских строк.

---

### 2.2 `routes/index.js`

| Метод | Путь | Действие |
|-------|------|----------|
| GET | `/` | Рендер `index.ejs` |
| GET | `/healthz` | JSON `{ status, uptime }` — Docker HEALTHCHECK |
| GET | `/about` | Рендер `about.ejs` |

---

### 2.3 `routes/tours.js` (124 строки)

| Метод | Путь | Защита | Действие |
|-------|------|--------|----------|
| GET | `/tours` | — | `parseFilters(req.query)` + `buildConditions(filters)` из `utils/tourFilters.js`; туры по цене ASC + `DISTINCT destination_country` для datalist формы |
| GET | `/tours/:id` | — | Только активный тур; кривой/скрытый id → `next()` → 404. В шаблон уходят `tour` и `title` (подписи кодов делает EJS) |
| POST | `/tours/:id/book` | requireAuth | Проверка `is_active`, INSERT в bookings: `user_id`, `client_name`/`client_phone` из профиля, `comment` (≤1000), `status='new'`; flash + redirect `/profile` |

**Важно:** раньше фильтры читали `country/city/hotelStars`, а формы отправляли
`destination_country/destination_city/hotel_stars` — из-за этого фильтры молча
не работали. Сейчас имена совпадают (см. 2.8).

---

### 2.4 `routes/auth.js` (229 строк)

| Метод | Путь | Действие |
|-------|------|----------|
| GET/POST | `/auth/register` | Валидация: все поля, EMAIL_RE, PHONE_RE, пароль ≥ 8; `normalizeEmail` (trim+lowercase); bcrypt hash 10; INSERT role='user'; сессия; flash «Добро пожаловать»; next → safeNext |
| GET/POST | `/auth/login` | SELECT по нормализованному email; `is_blocked` → 403; bcrypt.compare; в POST next проверяется через `safeNext()` (закрыт open redirect `//evil.com`) |
| GET/POST | `/auth/logout` | `dropSession` → `/` |
| GET | `/auth/me` | JSON `{ user: currentUser }` |

**Вспомогательные функции:** `homeFor(role)`, `safeNext(raw)` (только `/...`,
без `//`), `normalizeEmail(raw)`, `loginRenderData`/`registerRenderData`
(отдают `nextUrl` — шаблоны читают именно это имя).

---

### 2.5 `middlewares/auth.js` (112 строк)

| Функция | Назначение |
|---------|------------|
| `attachCurrentUser` | Каждый запрос: SELECT юзера по session.userId. Нет/заблокирован → logoutQuietly (сессия уничтожена, запрос идёт как гость). Ошибка БД → next(err), не притворяемся гостем |
| `requireAuth` | Нет req.user → 302 `/login?next=<url>` |
| `requireRole(...)` | Не та роль → 302 `/tours?error=access_denied` |
| `dropSession` | destroy + clearCookie + redirect |

В сессии хранится только `userId` — блокировка и смена роли применяются мгновенно.

---

### 2.6 `middlewares/csrf.js` — НОВОЕ (64 строки)

Без внешних библиотек, только встроенный `crypto`:
1. При отсутствии — генерируется `session.csrfToken = randomBytes(32).hex`.
2. Токен кладётся в `res.locals.csrfToken` — шаблоны вставляют `<input name="_csrf">`.
3. POST/PUT/PATCH/DELETE: сверка `body._csrf` / заголовок `X-CSRF-Token` / query
   через `crypto.timingSafeEqual`. Не совпало → 403 со страницей `error.ejs`
   («обновите страницу»).
4. GET не проверяется (не должен менять состояние).

**Правило:** любая новая POST-форма обязана включить скрытое поле `_csrf`.

---

### 2.7 `middlewares/flash.js` — НОВОЕ (36 строк)

Паттерн Post/Redirect/Get:
- `req.flash('success'|'error'|'info', текст)` — положить сообщение в `session.flash`.
- На следующем запросе middleware забирает массив, очищает сессию, кладёт в
  `res.locals.flash` → header.ejs рисует `.alert--success/--error/--info`.
- Одноразовость гарантирована: после чтения сообщения удаляются.

---

### 2.8 `utils/tourFilters.js` — НОВОЕ (120 строк)

Единая точка правды для фильтров (используют `routes/tours.js` и `GET /manager`):

- **`parseFilters(query)`** возвращает объект, чьи ключи = `name`-атрибуты форм:
  `departure_city, destination_country, destination_city, departure_date,
  nights, flight_class, hotel_stars, hotel_meal, transfer_type, maxPrice`.
  Пустое/мусор → null. Даты — только `YYYY-MM-DD`. Enum-поля — только значения
  из CHECK-списков (`economy|comfort|business`, `RO|BB|HB|AI`, `bus|private`).
- **`buildConditions(filters)`** → `{ where, values }`: база `t.is_active = TRUE`;
  текстовые — ILIKE по подстроке; `departure_at >= ?::date`; `nights`/`hotel_stars`
  — `>=`; `maxPrice` — `<=`; enums — точное `=`. Значения всегда отдельным
  массивом `$1, $2...` (инъекции невозможны конструктивно).

---

### 2.9 `db/pool.js` (30 строк)

Единственный `Pool` на проект из `process.env.DATABASE_URL`. `pool.on('error')`
логирует «протухшие» idle-соединения, не роняя процесс.

### 2.10 `db/init.js` (163 строки)

Идемпотентный `CREATE TABLE IF NOT EXISTS` (users/tours/bookings + 5 индексов)
строго по DATA_CONTRACT.md. Исправлено при ревизии: `pool.end()` в `finally`
(раньше процесс висел с открытыми сокетами), `process.exit(1)` → `process.exitCode = 1`,
`.catch` у `init()` для понятного вывода при недоступной БД.

### 2.11 `db/seed.js` (256 строк)

Идемпотентный (проверка `count(*) tours > 0` + `ON CONFLICT (email)`).
3 пользователя (`admin@/manager@/user@turist.ru`, пароль `TestPass123!`) и
5 туров по детальной схеме (total_price = flight+hotel+transfer).
Картинки: `/images/tour-*.svg` — SVG-заглушки, добавленные при ревизии
(тогда папка public/images была пуста). **Позже команда закоммитила реальные
фото `tour-*.jpg`** — переключение seed на них остаётся на решение команды.
Также исправлено: `pool.end()` после seed.

---

### 2.12 `views/partials/header.ejs`

- `<body class="role-<%= currentUser.role %>">` — ролевые темы оформления.
- Навигация по состояниям: гость (Войти/Регистрация), user (Мои брони →
  `/profile` — маршрут теперь существует), manager (Кабинет), admin (Админ-панель
  + Кабинет).
- **Flash-блок** после `<main>`: рендер `res.locals.flash` в `.alert--*`.
- Все POST-формы выхода содержат hidden `_csrf`.

### 2.13 `views/tours.ejs`

Форма фильтров (GET /tours) с 10 полями, имена = ключи parseFilters:
город вылета, страна (текст + datalist из `countries`), город прилёта, дата,
ночей от, класс, звёзды от, питание, трансфер, макс. бюджет. Подсветка выбранных
значений через `filters`. Карточки: маршрут, даты, отель, питание, трансфер,
разбивка цен (✈+🏨+🚐), итог, рейтинг. Пустое состояние. `onerror` на `<img>` →
CSS-градиент.

### 2.14 `views/tour.ejs`

Детализация пакета (перелёт/проживание/трансфер с ценами блоков), итоговая
формула цены, блок бронирования: авторизованным — форма POST `/tours/<id>/book`
(только `comment` + `_csrf`; id тура из URL, данные клиента — из профиля);
гостям — ссылки вход/регистрация.

### 2.15 `views/profile.ejs`

Карточка пользователя (инициалы, роль, email, телефон) + список бронь
(`tour_title` со ссылкой на тур, дата вылета, статус-бейдж, `total_price`).
Пустое состояние — кнопка в каталог.

### 2.16 `views/manager.ejs`

Терминал продаж: форма фильтров (GET /manager, работает — см. 2.8), таблица
туров с кнопками `data-book-client`, боковая панель (сайдбар) с формой
POST `/manager/book` (`tour_id` подставляется JS-ом из main.js, `_csrf`,
ФИО/телефон/заметка), история «Мои оформления» (20 последних).

### 2.17 `views/admin.ejs`

Три раздела с реальными действиями (все формы содержат `_csrf`):
1. **Туры** — таблица + кнопка «Скрыть/Показать» (`POST /admin/tours/:id/active`).
2. **Заявки** — таблица + select статуса «new/confirmed/cancelled» + OK
   (`POST /admin/bookings/:id/status`).
3. **Пользователи** — select роли + OK (`POST /admin/users/:id/role`), кнопка
   «Заблокировать/Разблокировать» (`POST /admin/users/:id/block`).

### 2.18 `views/login.ejs`, `views/register.ejs`

Скрытые поля: `_csrf` + `next` (из `nextUrl` — раньше шаблон читал несуществующую
переменную `next`). Вывод `error`/`errors` (строка/массив/объект). Toggle пароля,
html-валидация (`minlength=8`, `type=email`).

### 2.19 `public/css/style.css` (~2900 строк)

CSS-переменные, компоненты (карточки, package-блоки, терминал менеджера,
админ-таблицы, auth-карточки), **`.alert--success/--error/--info`** (flash),
ролевые темы `.role-*`, адаптив, reduced-motion.

### 2.20 `public/js/main.js` (221 строка)

1. Toggle пароля; 2. бургер; 3. подсветка активного пункта; 4. скрытие битых
картинок; 5. табы; 6. модалки; 7. сайдбары; 8. `restoreFiltersFromUrl` (fallback,
основная подсветка теперь серверная через `filters`); 9. `bookPanel` — клик
«Оформить клиента» подставляет данные тура в hidden `tour_id` и сводку сайдбара.

---

## 3. Docker-инфраструктура

### 3.1 `Dockerfile`

`node:20-alpine` → `npm ci --omit=dev` → COPY с `--chown=node:node` → `USER node`
→ HEALTHCHECK через `fetch('/healthz')` → `CMD node server.js`.

### 3.2 `docker-compose.yml` (production)

- `app`: порты `${APP_PORT:-3000}:3000`, env DATABASE_URL/SESSION_SECRET/NODE_ENV,
  `depends_on: db: service_healthy`.
- `db`: postgres:16-alpine, том `pgdata`. **Порт БД наружу НЕ пробрасывается**
  (исправлено при ревизии — раньше 5432 был открыт на хосте в production).

### 3.3 `docker-compose.dev.yml`

Монтирование `.:/app` + отдельный том `node_modules`, `NODE_ENV=development`,
`npm run dev`. **Добавлен проброс `${DB_PORT:-5432}:5432`** для отладки с хоста —
только в dev.

### 3.4 Порядок инициализации

```powershell
docker compose up -d --build
docker compose exec app node db/init.js
docker compose exec app node db/seed.js
```

---

## 4. Маршруты и их обработчики (полный список)

| URL | Метод | Файл | Защита | Шаблон/ответ |
|-----|-------|------|--------|--------------|
| `/` | GET | routes/index.js | — | index.ejs |
| `/healthz` | GET | routes/index.js | — | JSON |
| `/about` | GET | routes/index.js | — | about.ejs |
| `/tours` | GET | routes/tours.js | — | tours.ejs + filters/countries |
| `/tours/:id` | GET | routes/tours.js | — | tour.ejs (активные) |
| `/tours/:id/book` | POST | routes/tours.js | auth+csrf | 302 /profile |
| `/login`, `/register` | GET/POST | routes/auth.js | csrf(POST) | login/register.ejs |
| `/logout` | GET/POST | routes/auth.js | csrf(POST) | 302 / |
| `/auth/me` | GET | routes/auth.js | — | JSON user |
| `/profile` | GET | server.js | auth | profile.ejs + bookings |
| `/manager` | GET | server.js | admin/manager | manager.ejs + tours/recentBookings/filters |
| `/manager/book` | POST | server.js | admin/manager+csrf | 302 /manager |
| `/admin` | GET | server.js | admin | admin.ejs |
| `/admin/tours/:id/active` | POST | server.js | admin+csrf | 302 /admin |
| `/admin/bookings/:id/status` | POST | server.js | admin+csrf | 302 /admin |
| `/admin/users/:id/role` | POST | server.js | admin+csrf | 302 /admin |
| `/admin/users/:id/block` | POST | server.js | admin+csrf | 302 /admin |
| прочее | — | server.js | — | 404.ejs |
| ошибки | — | server.js | — | error.ejs |

Алиасы: authRouter подключён и как `/auth/*`, и как `/login` и т.д. — обе формы
работают с любого префикса.

---

## 5. Зависимости между файлами

```
server.js
├── routes/index.js ────────────────→ index.ejs, about.ejs
├── routes/tours.js
│   ├── utils/tourFilters.js (parseFilters, buildConditions)
│   ├── middlewares/auth.js (requireAuth)
│   └───────────────────────→ tours.ejs, tour.ejs
├── routes/auth.js ─────────────────→ login.ejs, register.ejs
├── middlewares/csrf.js   ← все POST-формы шлют _csrf
├── middlewares/flash.js  ← header.ejs рисует res.locals.flash
├── GET /profile ───────────────────→ profile.ejs
├── GET/POST /manager(+book)
│   ├── utils/tourFilters.js
│   └───────────────────────────────→ manager.ejs
├── GET /admin + 4 POST-действия ───→ admin.ejs
└── public/* (style.css, main.js, images/*)

middlewares/auth.js, routes/*, server.js → db/pool.js → pg
db/init.js, db/seed.js → db/pool.js (ручной запуск, сервер их не вызывает)
main.js: bookPanel читает data-* из manager.ejs → hidden tour_id
```

---

## 6. Поток данных (типовые сценарии)

```
Гость → GET /tours?destination_country=Турция&maxPrice=50000
  → csrf/flash пропускают GET → parseFilters (snake_case из формы)
  → buildConditions → SELECT ... WHERE is_active AND ... ORDER BY total_price
  → tours.ejs (карточки + подсветка фильтров из filters)

Клиент → POST /tours/2/book
  → csrf сверяет _csrf → requireAuth → SELECT тур (только is_active)
  → INSERT bookings (tour_id, user_id, client_name/phone из req.user, status new)
  → req.flash('success', ...) → 302 /profile
  → GET /profile: flash нарисован в header.ejs и стёрт; SELECT брони c tour_title

Менеджер → «Оформить клиента» (main.js подставляет tour_id) → POST /manager/book
  → валидация → INSERT (manager_id=req.user.id, user_id=NULL) → flash → /manager

Админ → POST /admin/users/5/block
  → requireRole('admin') → UPDATE is_blocked=NOT is_blocked (нельзя себя)
  → flash → /admin; следующая сессия этого юзера разлогинится attachCurrentUser
```

---

## 7. Переменные окружения

| Переменная | По умолчанию | Где используется | Назначение |
|------------|-------------|------------------|------------|
| `PORT` | `3000` | server.js, Dockerfile | порт приложения |
| `HOST` | `0.0.0.0` | server.js | адрес прослушивания |
| `NODE_ENV` | `production` | compose, server.js | режим; при production + дефолтный SECRET — warning |
| `APP_PORT` | `3000` | docker-compose.yml | порт на хосте |
| `DB_PORT` | `5432` | docker-compose.dev.yml | порт БД на хосте (только dev) |
| `DATABASE_URL` | (compose) | db/pool.js | подключение PostgreSQL |
| `SESSION_SECRET` | tur-project-secret-... | server.js | подпись cookie |
| `POSTGRES_PASSWORD` | `tur_pass` | docker-compose.yml | пароль БД |

---

## 8. Жизненный цикл запуска

Production: сборка образа → app+db (ждёт service_healthy) → init → seed →
healthcheck каждые 30 сек → сайт на `${APP_PORT}`. SIGTERM: `server.close()`,
страховочный exit через 10 сек.

Development: bind mount + `node --watch`; EJS/CSS читаются с диска каждый запрос;
на Windows события FS из bind mount могут не доходить — рестарт контейнера.

---

## 9. Замечания и потенциальные улучшения

**Закрыто при ревизии 2026-11-17** (полная таблица «было → стало» в KODAREAD.md):
маршруты /profile и бронирования (3 шт), фильтры каталога и менеджера (единый
модуль), nextUrl в формах, open redirect в POST /login, CSRF, flash, валидация
email/телефона + нормализация email, CRUD админ-панели, картинки, удалён
data/tours.js, pool.end в db-скриптах, порт БД убран из production, .gitignore
дополнен, warning о SESSION_SECRET.

**Осталось (осознанные ограничения, не баги):**
1. **Сессии в памяти** — рестарт разлогинивает всех; прода-решение: connect-pg-simple.
2. **Нет rate-limit на /login** — перебор паролей не замедлен.
3. **bcryptjs синхронный** (10 раундов) — тяжело под большой нагрузкой; вариант: нативный bcrypt/argon2.
4. **Нет автотестов/CI/линтера** — интеграционный прогон (71 проверка) выполнялся вручную, скрипт не закоммичен.
5. **README.md частично устарел** — в структуре всё ещё упоминается удалённый `data/`, нет PostgreSQL в стеке и шагов init/seed. Не трогали: правили только аналитические документы.
6. **Картинки:** seed ссылается на SVG-заглушки; реальные фото `tour-*.jpg` добавлены командой позже — переключение seed на них на решение команды.
7. **`restoreFiltersFromUrl` в main.js** — резервный путь, серверная подсветка через `filters` основная.
8. Сжатие (gzip/brotli) не подключено.

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
| Middleware | attachCurrentUser, csrf (свой), flash (свой) |
| Общая логика фильтров | utils/tourFilters.js (10 параметров, каталог + менеджер) |
| Маршрутов | 18 (вкл. 3 бронировательных и 4 admin-CRUD) |
| Страниц (шаблонов) | 11 + 2 partials |
| Production-зависимостей | 5 (новые middleware — без зависимостей) |
| Docker-сервисы | app + db (порт БД — только в dev) |
| Seed | 3 пользователя + 5 туров |
| CSS / клиентский JS | ~2900 / 221 строк |
| Проверка | интеграционный smoke 71/71, рендеры шаблонов 16/16 |
| Healthcheck | GET /healthz каждые 30 сек |

---

*Этот файл — внутренний отчёт. Краткая рабочая память ассистента — в KODAREAD.md.*
