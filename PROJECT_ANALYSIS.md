# Полный анализ репозитория Tur-Project

> Последнее обновление: 2026-11-18, **финальная свёрка** (все 5 этапов + 16 дефектов
> исправлены, правовые страницы, seed 18 заявок + demo-passport, фикс конструктора A-14).
> HEAD `9385c5f`.
>
> Документ описывает ТЕКУЩЕЕ состояние проекта. История исправлений —
> раздел 9 и KODAREAD.md (§0–§12 — полная таблица «было → стало»).

---

## 1. Файловая структура

```
Tur-Project/
├── .dockerignore              # Исключения из образа (+ uploads/*, кроме .gitkeep)
├── .gitignore                 # node_modules, .env.*, логи, редакторы (+ uploads/*)
├── DATA_CONTRACT.md           # Контракт данных (bookings расширена блоком 4)
├── docker-compose.yml         # Production: app + PostgreSQL + volume uploads_data
├── docker-compose.dev.yml     # Оверрайд для разработки (+порт БД, +uploads_data)
├── Dockerfile                 # Сборка образа (node:20-alpine) + mkdir/chown uploads
├── KODAREAD.md                # Служебная памятка AI-ассистента
├── package.json               # 6 production-зависимостей
├── package-lock.json          # Фиксация версий
├── PROJECT_ANALYSIS.md        # Этот отчёт
├── README.md                  # Описание для GitHub
│
├── server.js                  # Точка входа (~526 строк)
│
├── uploads/                   # Загрузки клиентов (в Git/образ не попадают)
│   ├── photos/.gitkeep        # Фото туриста
│   └── passports/.gitkeep     # Скан паспорта
│
├── db/                        # Работа с PostgreSQL
│   ├── pool.js                # Пул соединений pg (DATABASE_URL) — 30 строк
│   ├── init.js                # CREATE TABLE + 6 колонок через ALTER + индексы — 201 строка
│   └── seed.js                # 6 пользователей + 14 туров + 18 заявок (с passport_scan) — 966 строк
│
├── middlewares/               # Middleware-функции
│   ├── auth.js                # attachCurrentUser, requireAuth, requireRole, dropSession
│   ├── csrf.js                # CSRF-токен (без внешних зависимостей) — 53 строки
│   ├── flash.js               # Одноразовые сообщения req.flash() — 31 строка
│   └── upload.js              # Multer (этап 3): приём фото/скана, лимиты, чистка файлов
│
├── utils/
│   ├── tourFilters.js         # parseFilters/buildConditions — единые фильтры
│   │                            для каталога и панели менеджера — 106 строк
│   └── validators.js          # validateEmail/Phone/Passport/BirthDate/PassportExpiry — 184 строки
│
├── routes/
│   ├── index.js               # /, /healthz, /about, /privacy, /terms
│   ├── tours.js               # /tours (фильтры), /tours/:id, POST /tours/:id/book
│   ├── auth.js                # /auth/login, /auth/register, /auth/logout, /auth/me
│   ├── profile.js             # GET /profile — брони клиента с деталями тура
│   └── clients.js             # CRM (этап 4): список, досье, отмена брони, файлы
│
├── views/
│   ├── index.ejs              # Главная
│   ├── tours.ejs              # Список туров + 10 фильтров
│   ├── tour.ejs               # Детальная страница тура + бронирование
│   ├── about.ejs              # О нас
│   ├── privacy.ejs            # Политика конфиденциальности (legal-doc)
│   ├── terms.ejs              # Правила использования сайта (legal-doc)
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
    ├── css/style.css          # ~3040 строк (alert, role-темы, терминал, CRM, конструктор, legal-doc)
    ├── js/main.js             # 540 строк (бургер, табы, модалки, сайдбар, bookPanel, копи
    └── images/                # 14 реальных фото туров (.jpg/.webp) + 5 SVG-заглушек
```

**Удалено:** `data/tours.js` (мёртвое хранилище в памяти — при ревизии),
`services/tourService.js` (дубль фильтров с расходящейся логикой, 0 импортов —
этап 1), `tmp_test.js` (тест под удалённый сервис — этап 1).


---

## 2. Подробное описание каждого файла

### 2.1 `server.js` — Точка входа (~526 строк)

**Назначение:** Express-приложение: сессии, flash, CSRF, авторизация, панели
менеджера/админа с CRUD-действиями, обработчики ошибок. Личный кабинет вынесен
в `routes/profile.js` (этап 1).

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
| `GET /manager` | admin+manager | туры через `parseFilters/buildConditions` + 20 последних заявок менеджера; `filters` в шаблон |
| `POST /manager/book` | admin+manager | INSERT заявки `manager_id = req.user.id, user_id = NULL`; `validatePhone` для телефона (нероссийский — как есть); flash + redirect |
| `GET /admin` | admin | все туры (включая скрытые), все заявки, все юзеры без password_hash |
| `POST /admin/tours/create` | admin | Создание нового тура (конструктор): валидация → INSERT |
| `POST /admin/tours/:id/edit` | admin | Редактирование существующего тура: валидация → UPDATE |
| `POST /admin/tours/:id/active` | admin | toggle `is_active` |
| `POST /admin/bookings/:id/status` | admin | статус из `['new','confirmed','cancelled']`, иначе отклонение |
| `POST /admin/users/:id/role` | admin | роль из `['user','manager','admin']`; запрет снимать роль с себя |
| `POST /admin/users/:id/block` | admin | toggle `is_blocked`; запрет блокировать себя |

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
| GET | `/privacy` | Политика конфиденциальности — `privacy.ejs` |
| GET | `/terms` | Правила использования сайта — `terms.ejs` |

---

### 2.3 `routes/tours.js` (~185 строк)

| Метод | Путь | Защита | Действие |
|-------|------|--------|----------|
| GET | `/tours` | — | `parseFilters(req.query)` + `buildConditions(filters)` из `utils/tourFilters.js`; туры по цене ASC + `DISTINCT destination_country` для datalist (в шаблон — массив строк `countries`) |
| GET | `/tours/:id` | — | Только активный тур; кривой/скрытый id → `next()` → 404. Валидация id инлайн (этап 1 убрал несуществующий импорт) |
| POST | `/tours/:id/book` | requireAuth | Проверка `is_active`, INSERT в bookings: `user_id`, `client_name`/`client_phone` из профиля (телефон через `validatePhone`), `comment` (≤1000), `status='new'`; flash + redirect `/profile` |

**Важно:** раньше фильтры читали `country/city/hotelStars`, а формы отправляли
`destination_country/destination_city/hotel_stars` — из-за этого фильтры молча
не работали. Сейчас имена совпадают (см. 2.9).

---

### 2.4 `routes/auth.js` (~180 строк)

| Метод | Путь | Действие |
|-------|------|----------|
| GET/POST | `/auth/register` | Валидация через `utils/validators.js`: `validateEmail` (нормализация), `validatePhone` (строго 11 цифр), пароль ≥ 8; bcrypt hash 10; INSERT role='user'; сессия; flash «Добро пожаловать»; next → safeNext |
| GET/POST | `/auth/login` | `validateEmail` для нормализации; `is_blocked` → 403; bcrypt.compare; в POST next проверяется через `safeNext()` (закрыт open redirect `//evil.com`) |
| GET/POST | `/auth/logout` | `dropSession` → `/` |
| GET | `/auth/me` | JSON `{ user: currentUser }` |

**Вспомогательные функции:** `homeFor(role)`, `safeNext(raw)` (только `/...`,
без `//`), `loginRenderData`/`registerRenderData` (отдают `nextUrl`).
Локальные `EMAIL_RE`/`PHONE_RE`/`normalizeEmail` удалены на этапе 1.

---

### 2.5 `routes/profile.js` — личный кабинет (~48 строк)

`GET /profile` (requireAuth): брони текущего пользователя с деталями тура —
`tour_title`, `total_price`, `departure_at`, `destination_country/city`,
`is_active` + `client_name`/`client_phone` самой заявки. `LEFT JOIN` — если тур
удалён, заявка остаётся. В шаблон также уходит `justBooked` (`?booked=1`).


---

### 2.6 `middlewares/auth.js` (99 строк)

| Функция | Назначение |
|---------|------------|
| `attachCurrentUser` | Каждый запрос: SELECT юзера по session.userId. Нет/заблокирован → logoutQuietly (сессия уничтожена, запрос идёт как гость). Ошибка БД → next(err), не притворяемся гостем |
| `requireAuth` | Нет req.user → 302 `/login?next=<url>` |
| `requireRole(...)` | Не та роль → 302 `/tours?error=access_denied` |
| `dropSession` | destroy + clearCookie + redirect |

В сессии хранится только `userId` — блокировка и смена роли применяются мгновенно.

---

### 2.7 `middlewares/csrf.js` (53 строки)

Без внешних библиотек, только встроенный `crypto`:
1. При отсутствии — генерируется `session.csrfToken = randomBytes(32).hex`.
2. Токен кладётся в `res.locals.csrfToken` — шаблоны вставляют `<input name="_csrf">`.
3. POST/PUT/PATCH/DELETE: сверка `body._csrf` / заголовок `X-CSRF-Token` / query
   через `crypto.timingSafeEqual`. Не совпало → 403 со страницей `error.ejs`
   («обновите страницу»).
4. GET не проверяется (не должен менять состояние).

**Правило:** любая новая POST-форма обязана включить скрытое поле `_csrf`.

---

### 2.8 `middlewares/flash.js` (31 строка)

Паттерн Post/Redirect/Get:
- `req.flash('success'|'error'|'info', текст)` — положить сообщение в `session.flash`.
- На следующем запросе middleware забирает массив, очищает сессию, кладёт в
  `res.locals.flash` → header.ejs рисует `.alert--success/--error/--info`.
- Одноразовость гарантирована: после чтения сообщения удаляются.

---

### 2.9 `utils/tourFilters.js` (106 строк)

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

### 2.10 `utils/validators.js` — единый модуль валидации (184 строки)

Единый модуль проверки и нормализации данных (этап 1 + этап 3). Шесть функций:
первые пять чистые (не бросают исключений, при ошибке → `null`).

| Функция | Правило |
|---|---|
| `validateEmail(raw)` | формат `x@y.z` + `trim().toLowerCase()` |
| `validatePhone(raw)` | убрать всё кроме цифр → ровно 11, первая `7` или `8` |
| `validatePassport(raw)` | убрать пробелы → ровно 10 цифр (4 серии + 6 номера) |
| `validateBirthDate(raw)` | реальная дата `YYYY-MM-DD`, в прошлом, возраст 0–120 лет |
| `validatePassportExpiry(raw)` | реальная дата, `>= сегодня` (паспорт не просрочен) |
| `validateBookingData(raw, opts)` | **этап 3**: полная анкета (ФИО, телефон, ДР, паспорт, кем выдан, срок) + `{ defaultName, defaultPhone }`; возвращает `{ ok, values }` или `{ ok, errors }` |

Используется в `routes/auth.js` (регистрация/вход), `server.js`
(`POST /manager/book`) и `routes/tours.js` (`POST /tours/:id/book`).

---

### 2.11 `db/pool.js` (30 строк)

Единственный `Pool` на проект из `process.env.DATABASE_URL`. `pool.on('error')`
логирует «протухшие» idle-соединения, не роняя процесс.

### 2.12 `db/init.js` (201 строка)

Идемпотентный `CREATE TABLE IF NOT EXISTS` (users/tours/bookings + 5 индексов)
строго по DATA_CONTRACT.md. **Этап 1:** таблица `bookings` расширена шестью
nullable-колонками (`birth_date`, `passport_series_number`, `passport_issued_by`,
`passport_expires_at`, `client_photo`, `passport_scan`) — и в `CREATE TABLE`,
и отдельными `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, чтобы существующая база
обновилась без потери данных (миграция проверена отдельно). `pool.end()` в
`finally`, `process.exitCode = 1` вместо `process.exit`, `.catch` у `init()`.

### 2.13 `db/seed.js` (~966 строк)

Идемпотентный (проверка `MIN_SEED_BOOKINGS = 15`, дедупликация по `client_phone|tour_id`).
**Этап 1:** 6 пользователей (1 admin / 2 manager / 3 user, пароль `TestPass123!`,
телефоны в формате 11 цифр), **14 туров**.
**Расширение 2026-11-18:** **18 заявок** с `passport_scan`.

- Туры: 10 стран (Россия, Турция, Чехия, ОАЭ, Египет, Таиланд, Мальдивы, Абхазия,
  Армения, Азербайджан), бюджеты 25 000–250 000 ₽, звёзды 2–5, все типы питания
  (RO/BB/HB/AI), все классы перелёта, оба типа трансфера. Картинки — 14 реальных
  `.jpg`/`.webp` из `public/images` (SVG-заглушки больше не используются).
- Заявки: 8 самостоятельных + 10 через менеджеров, покрытие всех 14 туров;
  статусы 7 new / 7 confirmed / 4 cancelled; уникальные телефоны (11 цифр `79…`),
  паспорта (10 цифр), ДР в прошлом, сроки действия в будущем.
- `prepareDemoPassportScan()` — копирует `public/images/demo-passport.jpg.jpg`
  → `uploads/passports/demo-passport.jpg` (mkdirSync, copyFileSync при несовпадении
  размера, ошибка → `null`, не роняет seed). Все seed-заявки получают `passport_scan`.
- Backfill: `UPDATE bookings SET passport_scan=$1 WHERE passport_scan IS NULL AND
  client_phone = ANY($2::text[])` — реальные заявки не трогаются.

`total_price` = flight + hotel + transfer (проверено SQL: 0 расхождений).
`pool.end()` после seed.

---

### 2.14 `views/partials/header.ejs`

- `<body class="role-<%= currentUser.role %>">` — ролевые темы оформления.
- Навигация по состояниям: гость (Войти/Регистрация), user (Мои брони →
  `/profile` — маршрут теперь существует), manager (Кабинет), admin (Админ-панель
  + Кабинет).
- **Flash-блок** после `<main>`: рендер `res.locals.flash` в `.alert--*`.
- Все POST-формы выхода содержат hidden `_csrf`.

### 2.15 `views/tours.ejs`

Форма фильтров (GET /tours) с 10 полями, имена = ключи parseFilters:
город вылета, страна (текст + datalist из `countries`), город прилёта, дата,
ночей от, класс, звёзды от, питание, трансфер, макс. бюджет. Подсветка выбранных
значений через `filters`. Карточки: маршрут, даты, отель, питание, трансфер,
разбивка цен (✈+🏨+🚐), итог, рейтинг. Пустое состояние. `onerror` на `<img>` →
CSS-градиент.

### 2.16 `views/tour.ejs`

Детализация пакета (перелёт/проживание/трансфер с ценами блоков), итоговая
формула цены, блок бронирования: авторизованным — форма POST `/tours/<id>/book`
(multipart, CSRF в query; поля: `client_name`/`client_phone` prefill из профиля,
`birth_date`, `passport_series_number`, `passport_issued_by`, `passport_expires_at`,
`client_photo`/`passport_scan` file-input'ы, `comment`);
гостям — ссылки вход/регистрация с `?next=`.

### 2.17 `views/profile.ejs`

Карточка пользователя (инициалы, роль, email, телефон) + список бронь
(`tour_title` со ссылкой на тур, дата вылета, `client_name`, статус-бейдж,
`total_price`). Пустое состояние — кнопка в каталог. Блок «Дата регистрации»
удалён на этапе 1: `created_at` не входит в контракт `currentUser`
(`{ id, email, full_name, phone, role }`).

### 2.18 `views/manager.ejs`

Терминал продаж: форма фильтров (GET /manager, работает — см. 2.9), таблица
туров с кнопками `data-book-client`, боковая панель (сайдбар) с формой
POST `/manager/book` (multipart, CSRF в query; `tour_id` подставляется JS-ом
из main.js, полная анкета: ФИО/телефон/ДР/паспорт/кем выдан/срок действия +
file-input'ы фото/скана + заметка), история «Мои оформления» (20 последних).

### 2.19 `views/admin.ejs`

Три раздела с реальными действиями + конструктор туров (все формы содержат `_csrf`):
1. **Конструктор** — сворачиваемый блок «Конструктор туров» с live-калькулятором
   цены (создание и редактирование тура, `data-tour` через `JSON.stringify`).
2. **Туры** — таблица + кнопка «Скрыть/Показать» (`POST /admin/tours/:id/active`).
3. **Заявки** — таблица + select статуса «new/confirmed/cancelled» + OK
   (`POST /admin/bookings/:id/status`).
4. **Пользователи** — select роли + OK (`POST /admin/users/:id/role`), кнопка
   «Заблокировать/Разблокировать» (`POST /admin/users/:id/block`).

### 2.20 `views/login.ejs`, `views/register.ejs`

Скрытые поля: `_csrf` + `next` (из `nextUrl` — раньше шаблон читал несуществующую
переменную `next`). Вывод `error`/`errors` (строка/массив/объект). Toggle пароля,
html-валидация (`minlength=8`, `type=email`).

### 2.21 `public/css/style.css` (~3040 строк)

CSS-переменные, компоненты (карточки, package-блоки, терминал менеджера,
админ-таблицы, auth-карточки), **`.alert--success/--error/--info`** (flash),
ролевые темы `.role-*`, CRM (раздел 26), конструктор туров (раздел 27),
превью файлов (раздел 28), правовые документы `.legal-doc` + футер + согласие
(раздел 29), адаптив, reduced-motion.

### 2.22 `public/js/main.js` (540 строк)

1. Toggle пароля; 2. бургер; 3. подсветка активного пункта; 4. скрытие битых
картинок; 5. табы; 6. модалки; 7. сайдбары; 8. `restoreFiltersFromUrl` (fallback,
основная подсветка теперь серверная через `filters`); 9. `bookPanel` — клик
«Оформить клиента» подставляет данные тура в hidden `tour_id` и сводку сайдбара;
10. «Показать ещё»; 11. копирование `[data-copy]`; 12. `form[data-confirm]`;
13. `filePreviews()`; 14. `tourBuilder()` — калькулятор цены и режим редактирования.

### 2.23 `middlewares/upload.js` — приём файлов (этап 3)

Multer 2.x, diskStorage. Экспортирует: `uploadBookingDocs` (middleware для
маршрутов бронирования, поля `client_photo`/`passport_scan`, maxCount 1),
`removeUploadedFiles(req)` (удаление при ошибке валидации), `getUploadedFileName(req, field)`.
MIME: jpeg/png/webp; лимит 5 МБ; расширение берётся из MIME, не из `originalname`.
Ни одна ошибка загрузки не даёт 500 — flash + redirect.

### 2.24 `routes/clients.js` — CRM (этап 4)

`router.use(requireRole('manager','admin'))`. Маршруты: `/files/:type/:filename`
(path traversal закрыт: `basename`, запрет `..`/слешей, сверка пути), `/`
(список с поиском `ILIKE` и фильтрами `parseFilters`, **без** `is_active` — видны
архивные брони), `/:id` (досье, алиас `booking_id` обязателен), `/:id/cancel`
(`UPDATE ... WHERE status != 'cancelled'`).

### 2.25 `views/privacy.ejs`, `views/terms.ejs` — правовые документы

Обёртка `partials/header`/`footer`, `<article class="legal-doc">` (max-width 820px),
5 нумерованных разделов с подзаголовками, врезки `.legal-doc__note`, контакты
`<dl class="legal-doc__contacts">`, перекрёстные ссылки. Ссылки на обе страницы —
в `partials/footer.ejs` (`.footer__legal`) и в `register.ejs` (`.auth-card__consent`).

---

## 3. Docker-инфраструктура

### 3.1 `Dockerfile`

`node:20-alpine` → `npm ci --omit=dev` → COPY с `--chown=node:node` →
`RUN mkdir -p /app/uploads/photos /app/uploads/passports && chown -R node:node /app/uploads`
→ `USER node` → HEALTHCHECK через `fetch('/healthz')` → `CMD node server.js`.

Папки загрузок создаются **от root до `USER node`**: иначе непривилегированный
`node` не смог бы создать их в `/app` (EACCES). Права отдаются `node`.

### 3.2 `docker-compose.yml` (production)

- `app`: порты `${APP_PORT:-3000}:3000`, env DATABASE_URL/SESSION_SECRET/NODE_ENV,
  `depends_on: db: service_healthy`, **volume `uploads_data:/app/uploads`**.
- `db`: postgres:16-alpine, том `pgdata`. **Порт БД наружу НЕ пробрасывается**
  (исправлено при ревизии — раньше 5432 был открыт на хосте в production).
- `volumes:` — `pgdata` + **`uploads_data`** (загрузки клиентов переживают
  пересоздание контейнера; `docker compose down -v` удаляет и их).

### 3.3 `docker-compose.dev.yml`

Монтирование `.:/app` + отдельный том `node_modules`, `NODE_ENV=development`,
`npm run dev`. **Добавлен проброс `${DB_PORT:-5432}:5432`** для отладки с хоста —
только в dev. **Плюс `uploads_data:/app/uploads`**: том монтируется поверх
bind-mount, поэтому реальные файлы клиентов не разбрасываются по рабочей копии.

### 3.4 Порядок инициализации

```powershell
docker compose up -d --build
docker compose exec app node db/init.js
docker compose exec app node db/seed.js
```

`init.js` идемпотентен: на существующей базе он только добавляет недостающие
колонки через `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

---

## 4. Маршруты и их обработчики (полный список)

| URL | Метод | Файл | Защита | Шаблон/ответ |
|-----|-------|------|--------|--------------|
| `/` | GET | routes/index.js | — | index.ejs |
| `/healthz` | GET | routes/index.js | — | JSON |
| `/about` | GET | routes/index.js | — | about.ejs |
| `/privacy` | GET | routes/index.js | — | privacy.ejs (legal-doc) |
| `/terms` | GET | routes/index.js | — | terms.ejs (legal-doc) |
| `/tours` | GET | routes/tours.js | — | tours.ejs + filters/countries |
| `/tours/:id` | GET | routes/tours.js | — | tour.ejs (активные) |
| `/tours/:id/book` | POST | routes/tours.js | auth+csrf | 302 /profile |
| `/login`, `/register` | GET/POST | routes/auth.js | csrf(POST) | login/register.ejs |
| `/logout` | GET/POST | routes/auth.js | csrf(POST) | 302 / |
| `/auth/me` | GET | routes/auth.js | — | JSON user |
| `/profile` | GET | routes/profile.js | auth | profile.ejs + bookings |
| `/manager` | GET | server.js | admin/manager | manager.ejs + tours/recentBookings/filters |
| `/manager/book` | POST | server.js | admin/manager+csrf | 302 /manager |
| `/admin` | GET | server.js | admin | admin.ejs |
| `/admin/tours/:id/active` | POST | server.js | admin+csrf | 302 /admin |
| `/admin/bookings/:id/status` | POST | server.js | admin+csrf | 302 /admin |
| `/admin/users/:id/role` | POST | server.js | admin+csrf | 302 /admin |
| `/admin/users/:id/block` | POST | server.js | admin+csrf | 302 /admin |
| `/admin/tours/create` | POST | server.js | admin+csrf | 302 /admin (конструктор) |
| `/admin/tours/:id/edit` | POST | server.js | admin+csrf | 302 /admin (конструктор) |
| `/clients` | GET | routes/clients.js | manager+admin | clients.ejs (CRM-список) |
| `/clients/:id` | GET | routes/clients.js | manager+admin | client-detail.ejs (досье) |
| `/clients/:id/cancel` | POST | routes/clients.js | manager+admin+csrf | 302 /clients/:id |
| `/clients/files/:type/:filename` | GET | routes/clients.js | manager+admin | res.sendFile (защищённые файлы) |
| прочее | — | server.js | — | 404.ejs |
| ошибки | — | server.js | — | error.ejs |

Алиасы: authRouter подключён и как `/auth/*`, и как `/login` и т.д. — обе формы
работают с любого префикса.

---

## 5. Зависимости между файлами

```
server.js
├── routes/index.js ────────────────→ index.ejs, about.ejs, privacy.ejs, terms.ejs
├── routes/tours.js
│   ├── utils/tourFilters.js (parseFilters, buildConditions)
│   ├── utils/validators.js (validatePhone)
│   ├── middlewares/auth.js (requireAuth)
│   └───────────────────────→ tours.ejs, tour.ejs
├── routes/auth.js
│   ├── utils/validators.js (validateEmail, validatePhone)
│   └───────────────────────────────→ login.ejs, register.ejs
├── routes/profile.js ──────────────→ profile.ejs
├── routes/clients.js ──────────────→ clients.ejs, client-detail.ejs (CRM, этап 4)
├── middlewares/upload.js ────────── multer (этап 3) ← POST /tours/:id/book, /manager/book
├── middlewares/csrf.js   ← все POST-формы шлют _csrf
├── middlewares/flash.js  ← header.ejs рисует res.locals.flash
├── GET/POST /manager(+book)
│   ├── utils/tourFilters.js
│   ├── utils/validators.js (validatePhone)
│   └───────────────────────────────→ manager.ejs
├── GET /admin + 4 POST-действия ───→ admin.ejs
└── public/* (style.css, main.js, images/*)

middlewares/auth.js, routes/*, server.js → db/pool.js → pg
db/init.js, db/seed.js → db/pool.js (ручной запуск, сервер их не вызывает)
main.js: bookPanel читает data-* из manager.ejs → hidden tour_id
uploads/photos, uploads/passports ← volume uploads_data (Docker)
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
  → validatePhone(req.user.phone) → INSERT bookings (tour_id, user_id,
    client_name/phone из req.user, status new)
  → req.flash('success', ...) → 302 /profile
  → GET /profile: flash нарисован в header.ejs и стёрт; SELECT брони c tour_title

Менеджер → «Оформить клиента» (main.js подставляет tour_id) → POST /manager/book
  → валидация ФИО → validatePhone (нероссийский номер сохраняется как есть)
  → INSERT (manager_id=req.user.id, user_id=NULL) → flash → /manager

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

**Закрыто на этапе 1 (2026-11-17):**
- падения каталога `GET /tours` и `GET /tours/:id` (`ReferenceError` из-за
  необъявленных `tours`/`countries` и неимпортированной `findActiveTourById`);
- мёртвый `services/tourService.js` (дубль фильтров с расходящейся логикой) и
  нерабочий `tmp_test.js` — удалены;
- дубль `app.get('/profile')` в server.js — удалён (кабинет в `routes/profile.js`);
- `profile.ejs` больше не требует `user.created_at`, которого нет в контракте;
- `profile.ejs` получает `client_name`/`client_phone` (раньше SELECT их не отдавал);
- seed переключён с SVG-заглушек на 14 реальных фото;
- единая валидация (`utils/validators.js`), телефон строго 11 цифр;
- хранилище `uploads/` + volume, 6 новых колонок в `bookings`.

**Осталось (осознанные ограничения, не баги):**
1. **Сессии в памяти** — рестарт разлогинивает всех; прода-решение: connect-pg-simple.
2. **Нет rate-limit на /login** — перебор паролей не замедлен.
3. **bcryptjs синхронный** (10 раундов) — тяжело под большой нагрузкой; вариант: нативный bcrypt/argon2.
4. **Нет автотестов/CI/линтера** — интеграционные прогоны (71/71 и 52/52) выполнялись вручную, скрипты не закоммичены.
5. **README.md частично устарел** — в структуре всё ещё упоминается удалённый `data/`, нет PostgreSQL в стеке и шагов init/seed. Не трогали: правили только аналитические документы.
6. ~~**Загрузка файлов ещё не реализована**~~ → **Закрыто на этапе 3:** `middlewares/upload.js` (multer 2.x, diskStorage), обе формы бронирования — `multipart/form-data` с CSRF в query, seed проставляет `passport_scan` (демо-скан, §2.13).
7. **`restoreFiltersFromUrl` в main.js** — резервный путь, серверная подсветка через `filters` основная.
8. **В `tours.ejs` функция `val()`** принимает старые алиасы (`country`, `city`, `hotelStars`, `max_price`) — безвредный legacy.
9. Сжатие (gzip/brotli) не подключено.

---

## 10. Итоговая сводка

| Параметр | Значение |
|----------|----------|
| Фреймворк | Express 4 |
| Шаблонизатор | EJS 3.1.10 |
| Node.js | 20 (Alpine) |
| База данных | PostgreSQL 16 (pg 8.13) |
| Таблицы | `users`, `tours`, `bookings` (+6 колонок паспортного блока в `bookings`) |
| Авторизация | Сессии + bcrypt + роли (user/manager/admin) |
| Middleware | attachCurrentUser, csrf (свой), flash (свой), upload (multer) |
| Валидация | utils/validators.js (email, телефон 11 цифр, паспорт 10 цифр, даты) |
| Общая логика фильтров | utils/tourFilters.js (10 параметров, каталог + менеджер) |
| Маршрутов | 22 (вкл. 3 бронировательных, 4 admin-CRUD, 2 конструктора, 4 CRM, 2 правовых) |
| Страниц (шаблонов) | 15 + 2 partials |
| Production-зависимостей | 6 (express, ejs, pg, bcryptjs, express-session, multer) |
| Docker-сервисы | app + db (порт БД — только в dev) + volume `uploads_data` |
| Seed | 6 пользователей + 14 туров + 18 заявок (с `passport_scan`) |
| CSS / клиентский JS | ~3040 / 540 строк |
| Проверка | smoke 71/71 (ревизия) + 52/52 (этап 1), миграция БД проверена |
| Healthcheck | GET /healthz каждые 30 сек |

---

*Этот файл — внутренний отчёт. Краткая рабочая память ассистента — в KODAREAD.md.*
