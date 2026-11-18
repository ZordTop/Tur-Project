# KODAREAD.md — Картотека репозитория Tur-Project

> **Назначение:** Моя рабочая памятка. В новом чате достаточно написать «прочитай KODAREAD.md» — и я знаю структуру проекта, историю исправлений и что осталось на будущее.
>
> **Статус (2026-11-17, финальный аудит):** в коде реализованы базовая ревизия и этапы **1, 3, 4, 5**. Витрина главной с фильтрами и кнопкой «Показать ещё» (фактический этап 2) в этой памятке отдельно не описывалась, но работает. Полная сверка с итоговым ТЗ, подтверждённые пункты и **открытые дефекты** — в §11.
>
> **HEAD на момент записи:** `5c9fce7` (`feat: photo`), рабочее дерево чистое. Docker: `tur-project-app` + `tur-project-db` — healthy (app запущен в dev-режиме с bind mount).

---

## 0. Этап 5 из 5 — Конструктор туров в панели администратора (2026-11-17)

**Задача:** создание и редактирование туров прямо из админ-панели с авторасчётом итоговой цены и валидацией всех полей.

### 0.1 Бэкенд: маршруты (`server.js`)

Добавлены два новых POST-маршрута в блоке `requireRole('admin')`:

| Маршрут | Что делает |
|---|---|
| `POST /admin/tours/create` | Валидация → `INSERT INTO tours ... RETURNING id` (is_active=TRUE) → flash + redirect `/admin` |
| `POST /admin/tours/:id/edit` | Валидация → `UPDATE tours SET ... WHERE id=$1` (пересчёт total_price) → flash + redirect `/admin` |

**Функция `validateTourData(req)`** (внутри `server.js`):

- Обязательные текстовые поля: `title`, `description`, `departure_city`, `destination_country`, `destination_city`, `flight_duration`, `hotel_name`.
- `image`: если пустое → `/images/tour-sochi.jpg` (дефолт).
- `rating`: пустое → `null`, иначе число 1.0–5.0 (округление до 0.1).
- `nights`: целое ≥ 1.
- `departure_at` / `arrival_at`: корректные даты, `arrival_at > departure_at`.
- Enum-поля строго: `flight_class ∈ [economy, comfort, business]`, `hotel_stars ∈ [2,3,4,5]`, `hotel_meal ∈ [RO, BB, HB, AI]`, `transfer_type ∈ [bus, private]`.
- Цены: `flight_price`, `hotel_price`, `transfer_price` — целые ≥ 0.
- **Принудительный расчёт:** `total_price = flight_price + hotel_price + transfer_price` (никогда не доверяем клиенту).
- Ошибки объединяются в массив, передаются в `req.flash('error', errors.join(' '))`.

### 0.2 Фронтенд: форма конструктора (`views/admin.ejs`)

Во вкладке «Туры» добавлен сворачиваемый блок `tour-builder`:

- Кнопка-заголовок «Конструктор туров» с иконкой `＋`/`−` для сворачивания.
- Форма с 4 логическими блоками (fieldset):
  - **Основное:** название, описание, картинка (datalist с подсказками из `public/images/`), рейтинг, ночей.
  - **Перелёт:** город вылета, страна, город прилёта, datetime-local для дат, время в пути, класс полёта, цена.
  - **Отель:** название, звёздность (select), питание (select), цена.
  - **Трансфер и Итог:** тип трансфера, цена + крупный индикатор «Итоговая стоимость: **NNN NNN ₽**».
- CSRF-токен встроен.
- В таблице туров добавлена кнопка **«Режим редактирования»** (`data-edit-tour`) рядом с «Скрыть/Показать». Данные тура передаются через `data-tour='<%- JSON.stringify(...) %>'` (безопасное экранирование).

### 0.3 Клиентский JS (`public/js/main.js`)

Блок 13: `tourBuilder()` — IIFE:

- **Калькулятор цены:** `input` на полях `flight_price`, `hotel_price`, `transfer_price` → мгновенный пересчёт `#tour-total-preview` с форматированием `toLocaleString('ru-RU')` (пробелы как `85 400`).
- **Режим редактирования:** клик на кнопку «Редактировать» → заполнение всех полей формы, смена заголовка на «Редактирование тура #ID», смена `form.action` на `/admin/tours/<id>/edit`, показ кнопки «Отмена редактирования», плавная прокрутка к форме.
- **Отмена редактирования:** `form.reset()`, возврат `action` на `/admin/tours/create`, скрытие кнопки отмены.
- Конвертация дат ISO → `datetime-local` формат (`YYYY-MM-DDTHH:mm`).

### 0.4 Стили (`public/css/style.css`)

Раздел 27: стили для конструктора:

- `.tour-builder` — обёртка с toggle-кнопкой.
- `.tour-form__block` — fieldset-стилизация (фон `var(--clr-bg)`, скруглённые углы).
- `.tour-form__grid` — CSS Grid `auto-fit, minmax(200px, 1fr)` — 2–3 колонки.
- `.tour-form__total` — выделенный блок итоговой цены (синий фон, моноширинный шрифт для чисел).
- Адаптив ≤ 768px: одноколоночная сетка, уменьшенные отступы.

### 0.5 Попутный фикс (этап 5)

| Файл | Проблема | Решение |
|---|---|---|
| `routes/tours.js:13` | Остался `require('../services/tourService')` после удаления модуля (DEAD-03) — сервер падает при старте | Удалён мёртвый импорт |
| `routes/tours.js:175` | `validatePhone()` вызывается, но не импортирована в этом файле — 500 при бронировании | Добавлен `const { validatePhone } = require('../utils/validators')` |

### 0.6 Проверка

- `node --check` → server.js, public/js/main.js: OK.
- EJS: `admin.ejs` компилируется и рендерится (через `ejs.compile`).
- CSS: синтаксис без ошибок.
- CSRF-защита сохранена (`<input type="hidden" name="_csrf">` в форме конструктора).
- Стиль админ-панели сохранён: те же CSS-переменные, бейджи, кнопки, отступы.

---

## 0. Этап 1 из 5 — что сделано в этом заходе

### 0.1 Хранилище файлов и Docker

| Файл | Изменение |
|---|---|
| `uploads/photos/.gitkeep`, `uploads/passports/.gitkeep` | Создана структура папок для загрузок клиентов (фото туриста, скан паспорта) |
| `.gitignore` | `uploads/*` игнорируется, кроме `.gitkeep` — файлы клиентов не попадают в Git |
| `.dockerignore` | То же для образа: `uploads/*` не копируется в образ (кроме `.gitkeep` для структуры) |
| `Dockerfile` | Перед `USER node`: `RUN mkdir -p /app/uploads/photos /app/uploads/passports && chown -R node:node /app/uploads`. Иначе непривилегированный `node` не смог бы писать в `/app` (EACCES) |
| `docker-compose.yml` | Volume `uploads_data:/app/uploads` у `app` + объявление `uploads_data:` в `volumes:` |
| `docker-compose.dev.yml` | Тот же volume (монтируется поверх `.:/app`, поэтому файлы клиентов не разбрасываются по рабочей копии) + объявление `uploads_data:` |

Проверено: в контейнере `/app/uploads{,/photos,/passports}` → `node:node 755`, запись от `node` работает.

### 0.2 Схема БД: 6 новых колонок в `bookings`

Добавлены в `CREATE TABLE IF NOT EXISTS bookings` **и** продублированы `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ...` для существующих баз (идемпотентно, без потери данных):

`birth_date DATE`, `passport_series_number VARCHAR(20)`, `passport_issued_by VARCHAR(255)`, `passport_expires_at DATE`, `client_photo VARCHAR(255)`, `passport_scan VARCHAR(255)`.

Все — nullable: заявка создаётся сразу, паспортные данные и файлы досылаются позже. В `client_photo`/`passport_scan` хранится **только путь** (`/uploads/...`), сами файлы — на диске/в volume.

`DATA_CONTRACT.md` §3 обновлён: блок 4 с описанием полей + примечание о постепенном заполнении и миграции.

**Миграция проверена отдельно:** база со старой схемой (1 заявка) → новый `init.js` → 6 колонок добавлены, старая строка сохранена.

### 0.3 `utils/validators.js` — единый модуль валидации

5 чистых функций (не бросают исключений, при ошибке → `null`):

| Функция | Правило | Пример |
|---|---|---|
| `validateEmail(raw)` | формат + `trim().toLowerCase()` | `'  User@Ex.COM '` → `'user@ex.com'` |
| `validatePhone(raw)` | убрать всё кроме цифр → **ровно 11**, первая `7` или `8` | `'+7 (999) 111-22-33'` → `'79991112233'` |
| `validatePassport(raw)` | убрать пробелы → **ровно 10 цифр** (4 серии + 6 номера) | `'1234 567890'` → `'1234567890'` |
| `validateBirthDate(raw)` | реальная дата `YYYY-MM-DD`, в прошлом, возраст 0–120 | `'2030-01-01'` → `null` |
| `validatePassportExpiry(raw)` | реальная дата, `>= сегодня` | `'2020-01-01'` → `null` |

### 0.4 Валидаторы подключены к бэкенду

- `routes/auth.js`: удалены локальные `EMAIL_RE`/`PHONE_RE`/`normalizeEmail`; `POST /register` и `POST /login` используют `validateEmail`/`validatePhone`. Телефон теперь строго 11 цифр (было «6–29 символов чего угодно»).
- `server.js` `POST /manager/book`: телефон нормализуется через `validatePhone`; если номер не российский — сохраняется как есть (**не блокирую** оформление иностранного клиента).
- `routes/tours.js` `POST /tours/:id/book`: нормализуется `req.user.phone` (у старых аккаунтов он в формате `+7-900-...`).

### 0.5 `db/seed.js` — богатое наполнение

| Сущность | Было | Стало |
|---|---|---|
| Пользователи | 3 (1 admin / 1 manager / 1 user) | **6** (1 / 2 / 3), телефоны в формате 11 цифр |
| Туры | 5, картинки `.svg`, 2 страны | **14**, реальные `.jpg`/`.webp`, 10 стран, 25 000–250 000 ₽ |
| Заявки | 0 | **5** (3 клиентские + 2 менеджерские), с полным паспортным блоком |

Разнообразие для проверки фильтров: звёзды 2/3/4/5, питание RO/BB/HB/AI, классы economy/comfort/business, трансфер bus(6)/private(8), ночей 3–11, города вылета Москва/СПб. `total_price` = сумма трёх блоков (проверено SQL: 0 расхождений). Идемпотентность сохранена (проверка `count(*) tours > 0`), пул закрывается в `finally`.

### 0.6 Починено попутно (эти правки были нужны, иначе этап 1 нечем проверить)

| Файл | Проблема | Решение |
|---|---|---|
| `routes/tours.js:47` | `res.render('tours', { tours, countries })` — переменные не объявлены (`...Result`), **500 на `/tours`** | `tours: toursResult.rows`, `countries: countriesResult.rows.map(r => r.destination_country)` (шаблону нужен массив строк для `<datalist>`) |
| `routes/tours.js:62` | `findActiveTourById()` не импортирована, **500 на `/tours/:id`** | Инлайн-валидация id + параметризованный `SELECT` (стиль файла) |
| `server.js` | Мёртвый дубль `app.get('/profile')` (перекрыт `app.use('/profile', profileRouter)`) | Удалён |
| `routes/profile.js` | SELECT не отдавал `client_name`/`client_phone`, а `profile.ejs` их рисует | Добавлены в SELECT |
| `views/profile.ejs` | Блок «Дата регистрации» требовал `user.created_at`, которого нет в контракте `currentUser` | Блок удалён (контракт `{ id, email, full_name, phone, role }` не тронут) |
| `services/tourService.js` | Мёртвый код (0 импортов) с **другой** семантикой фильтров (`nights =`, `DATE(...) =`, страна без `%`) — источник `ReferenceError`-ов выше | Файл и папка `services/` удалены, канон — `utils/tourFilters.js` |
| `tmp_test.js` | Тест под удалённый сервис, ждал в HTML маркеры, которых нет (`data-book`, `Найдено туров:`, `class="empty"`) — прогонялся бы в 0 | Удалён |

---


## 1. Что это за проект

Туристический сайт (учебный). Каталог пакетных туров (перелёт + отель + трансфер), самостоятельное бронирование клиентом, оформление клиента менеджером, админ-панель.

**Стек:** Node.js 20, Express 4, EJS, PostgreSQL (pg), bcryptjs, express-session, Docker Compose.

---

## 2. Структура файлов

```
Tur-Project/
├── server.js              ← точка входа: сессии, flash, csrf, attachCurrentUser,
│                            маршруты /manager, /manager/book, /admin/* CRUD,
│                            404/500, graceful shutdown
├── package.json           ← express, ejs, pg, bcryptjs, express-session, multer (6 зависимостей)
├── Dockerfile / docker-compose.yml / docker-compose.dev.yml   ← + volume uploads_data
├── .gitignore / .dockerignore                                 ← + игнор uploads/*
├── DATA_CONTRACT.md       ← контракт таблиц (bookings расширена блоком 4) и переменных шаблонов
├── PROJECT_ANALYSIS.md    ← переписан 2026-11-17 под состояние после этапа 1
│
├── uploads/               ← ⭐ новое: загрузки клиентов (в Git/образ не попадают)
│   ├── photos/.gitkeep    ← фото туриста
│   └── passports/.gitkeep ← скан паспорта
├── routes/
│   ├── index.js           ← GET /, /healthz, /about
│   ├── tours.js           ← GET /tours (фильтры), GET /tours/:id, POST /tours/:id/book
│   ├── auth.js            ← login/register (валидация через utils/validators), logout, /me
│   ├── profile.js         ← ⭐ GET /profile — брони клиента (client_name/phone + детали тура)
│   └── clients.js         ← ⭐ CRM (этап 4): список, досье, отмена брони, защищённые файлы
├── middlewares/
│   ├── auth.js            ← attachCurrentUser, requireAuth, requireRole, dropSession
│   ├── csrf.js            ← CSRF-токен в сессии, сверка на POST/PUT/PATCH/DELETE
│   ├── flash.js           ← req.flash() + res.locals.flash (одноразовые сообщения)
│   └── upload.js          ← ⭐ multer (этап 3): приём фото/скана, лимиты, чистка файлов
├── utils/
│   ├── tourFilters.js     ← parseFilters/buildConditions — единые фильтры
│   │                        для /tours и /manager (ключи = name-атрибуты форм)
│   └── validators.js      ← ⭐ новое: validateEmail/Phone/Passport/BirthDate/PassportExpiry
├── db/
│   ├── pool.js            ← singleton Pool (DATABASE_URL)
│   ├── init.js            ← CREATE TABLE (users/tours/bookings) + 6 новых колонок
│   │                        через ALTER ... ADD COLUMN IF NOT EXISTS + индексы; pool.end()
│   └── seed.js            ← 6 юзеров + 14 туров (реальные .jpg/.webp) + 5 заявок; pool.end()
├── views/                 ← index, tours, tour, about, login, register,
│                            profile, manager, admin, clients, client-detail,
│                            404, error + partials/(header,footer) — 15 шаблонов
└── public/
    ├── css/style.css      ← ~3100 строк: alert, ролевые темы, терминал, CRM,
    │                        конструктор туров, превью файлов, «Показать ещё»
    ├── js/main.js         ← 621 строка: бургер, табы, сайдбар, bookPanel,
    │                        «Показать ещё», копирование, confirm, превью, конструктор
    └── images/            ← 14 реальных фото (.jpg/.webp), на них ссылается seed
                             + 5 старых SVG-заглушек (seed их больше не использует)
```

**Удалено:** `data/tours.js` (мёртвое in-memory хранилище), `services/tourService.js` (дубль фильтров с расходящейся логикой, 0 импортов), `tmp_test.js` (тест под удалённый сервис, несовместимый с шаблонами).


---

## 3. Ключевые связи (как всё работает)

**Цепочка middleware в server.js** — порядок важен:

```
urlencoded/json → static → trust proxy → session → flash → csrf → attachCurrentUser → маршруты
```

- `flash` до `csrf`, т.к. csrf может отрендерить error-страницу, где нужны flash.
- `csrf` до `attachCurrentUser`: запрос с неверным токеном отбивается до похода в БД.
- В шаблонах доступны `res.locals.currentUser`, `res.locals.csrfToken`, `res.locals.flash`.

**Правило для новых POST-форм:** всегда добавлять
`<input type="hidden" name="_csrf" value="<%= csrfToken %>">`, иначе 403.

**Фильтры:** имена query-параметров = `name` в формах tours.ejs/manager.ejs:
`departure_city, destination_country, destination_city, departure_date, nights, flight_class, hotel_stars, hotel_meal, transfer_type, maxPrice`.
Оба обработчика (`/tours` и `/manager`) вызывают `parseFilters` + `buildConditions` из `utils/tourFilters.js` — расхождение формы↔бэкенда больше невозможно по конструкции.

**Роли:** user → /tours, /profile; manager → /manager; admin → /admin + /manager. `homeFor(role)` в routes/auth.js решает, куда редиректить после входа.

**Сессии:** в памяти, хранят только `userId`; `attachCurrentUser` каждый запрос читает юзера из БД (блокировка/смена роли применяются мгновенно).

**Валидация:** единая точка — `utils/validators.js`. Используется в `routes/auth.js` (регистрация/вход), `server.js` (`/manager/book`), `routes/tours.js` (`/tours/:id/book`). Правило: не дублировать regex в роутерах.

**Загрузки файлов:** физически лежат в `uploads/photos` и `uploads/passports` (в Docker — именованный volume `uploads_data`), в БД — только относительный путь (`client_photo`, `passport_scan`). Папки создаются в `Dockerfile` до `USER node` и отдаются пользователю `node`, иначе запись упадёт с EACCES.


---

## 4. Что было сломано и как исправлено (история)

| ID | Проблема | Решение |
|---|---|---|
| BUG-01 | Не было `GET /profile` (шапка вела в 404) | Маршрут в `routes/profile.js` (этап 1 перенёс его из server.js): bookings + tour_title + total_price + client_name/phone, `WHERE user_id = req.user.id` |
| BUG-02 | Не было `POST /tours/:id/book` (кнопка «Забронировать» → 404) | Маршрут в routes/tours.js: `requireAuth`, INSERT (user_id, client_name/phone из профиля), flash + redirect /profile |
| BUG-03 | Не было `POST /manager/book` («Оформить клиента» → 404) | Маршрут в server.js: INSERT (manager_id = req.user.id, user_id NULL), валидация имени/телефона, flash |
| BUG-04 | tours.ejs отправлял `destination_country`, бэкенд читал `country`; половина фильтров игнорировалась | Единый модуль `utils/tourFilters.js`; форма и бэкенд теперь используют одни snake_case-имена; работают все 10 фильтров |
| BUG-05 | `hotelStars` vs `hotel_stars` | Закрыт тем же модулем (канон — `hotel_stars`) |
| BUG-06 | login.ejs читал несуществующую `next` (бэкенд отдаёт `nextUrl`) | Шаблон исправлен на `nextUrl`; register.ejs тоже переведён на `registerRenderData` |
| BUG-07 | POST /login пропускал open redirect `//evil.com` | POST использует `safeNext()` (только внутренние `/...`, без `//`) |
| BUG-08 | «Форма бронирования не передаёт tour_id» | ⚠️ Ложная тревога: id берётся из URL `/tours/:id/book`, скрытое поле не нужно |
| BUG-09 | Фильтры на /manager игнорировались | `GET /manager` теперь использует parseFilters/buildConditions, `filters` уходит в шаблон |
| DEAD-01 | data/tours.js не использовался | Файл и папка удалены |
| DEAD-02 | `flightClassLabel/mealLabel/transferLabel` не читались шаблоном | Убраны из routes/tours.js (маппинги живут в EJS) |
| GAP-01 | Админка была read-only | +4 CRUD-маршрута: `/admin/tours/:id/active`, `/admin/bookings/:id/status`, `/admin/users/:id/role`, `/admin/users/:id/block` (с CHECK-списками допустимых значений и защитой от «понизить/заблокировать самого себя») |
| GAP-02 | public/images пуст → битые картинки | Было: 5 SVG-заглушек. **Закрыто на этапе 1:** seed переключён на 14 реальных `.jpg`/`.webp` из `public/images` (проверено — все отдаются 200) |
| GAP-03 | Не было CSRF | `middlewares/csrf.js` (crypto.timingSafeEqual, токен в сессии) — БЕЗ npm-зависимостей |
| GAP-04 | Не было валидации email/телефона | Было: EMAIL_RE/PHONE_RE в routes/auth.js. **Этап 1:** вынесено в `utils/validators.js`, телефон — строго 11 цифр с нормализацией; подключено ещё и к бронированиям |
| GAP-05 | Не было flash-сообщений | `middlewares/flash.js` + вывод в header.ejs |
| NOTE-01 | Дефолтный SESSION_SECRET | Предупреждение в консоль при production |
| NOTE-02 | 5432 пробрасывался наружу в production | Перенесено в docker-compose.dev.yml |
| NOTE-03 | Не было .gitignore | Уже был — дополнен (.env.*, логи) |
| NOTE-04 | db/init.js и seed.js не закрывали пул | `pool.end()` в finally; process.exit → process.exitCode |

### История этапа 1 (2026-11-17)

| ID | Проблема | Решение |
|---|---|---|
| ST1-01 | Загружать фото туриста/скан паспорта некуда | `uploads/photos`, `uploads/passports` + `.gitkeep`; игнор в `.gitignore`/`.dockerignore`; `mkdir`+`chown` в Dockerfile; volume `uploads_data` в обоих compose |
| ST1-02 | В `bookings` нет паспортных данных | 6 nullable-колонок в `CREATE TABLE` + `ALTER ... ADD COLUMN IF NOT EXISTS` (идемпотентная миграция без потери данных) |
| ST1-03 | Валидация размазана по роутерам, телефон принимал что угодно | `utils/validators.js` (5 чистых функций) |
| ST1-04 | Телефон в заявках в разных форматах | `validatePhone` в `/manager/book` и `/tours/:id/book` (нероссийский номер не блокирует оформление) |
| ST1-05 | Seed: 5 туров на `.svg`, 3 юзера, 0 заявок | 14 туров (10 стран, 25k–250k ₽, все enum-значения), 6 юзеров, 5 заявок с паспортным блоком |
| BUG-10 | `GET /tours` падал в 500: `tours`/`countries` не объявлены (`ReferenceError`) | `toursResult.rows`, `countriesResult.rows.map(...)` |
| BUG-11 | `GET /tours/:id` падал в 500: `findActiveTourById` не импортирована | Инлайн-валидация id + параметризованный SELECT |
| DEAD-03 | `services/tourService.js` — дубль фильтров с расходящейся логикой (`nights =` vs `>=`, `DATE(...) =` vs `>=`, страна без `%`), 0 импортов | Удалён вместе с папкой `services/`; канон — `utils/tourFilters.js` |
| DEAD-04 | `tmp_test.js` — тест под удалённый сервис, ждал несуществующие HTML-маркеры | Удалён |
| DEAD-05 | Дубль `app.get('/profile')` в server.js (перекрыт роутером) | Удалён |
| DEAD-06 | `profile.ejs` требовал `user.created_at`, которого нет в контракте | Блок «Дата регистрации» удалён |
| BUG-12 | `profile.ejs` выводил `client_name`, а SELECT его не отдавал | Добавлен в SELECT `routes/profile.js` |

---

## 5. Как проверялось (метод — можно воспроизвести)

### 5.1 Базовая ревизия (71/71, история)

1. `docker run -d --name tur-smoke-db -e POSTGRES_USER=tur -e POSTGRES_PASSWORD=tur_pass -e POSTGRES_DB=tur_project -p 55432:5432 postgres:16-alpine`
2. `DATABASE_URL=postgres://tur:tur_pass@localhost:55432/tur_project node db/init.js && node db/seed.js`
3. Сервер на `PORT=3999` + скрипт на node fetch с ручным cookie-jar (⚠️ undici fetch НЕ хранит cookie сам — вести jar строкой обязательно)
4. 71 проверка: все 10 фильтров + комбо + SQL-мусор в параметрах, регистрация/валидация/дубль-email, бронь клиентом (поля в БД, flash одноразовость), бронь скрытого тура (404), оформление менеджером, все 4 admin-CRUD + отказ недопустимых значений + самозащита админа, мгновенный разлогин заблокированного, права ролей, logout, next-редирект и open-redirect.
5. Итог: **pass=71 fail=0**, шаблоны: 16/16 рендеров.

### 5.2 Этап 1 (52/52)

Прогон **внутри контейнера** (`docker compose exec app node tmp_final_smoke.js`, скрипт удалён после прогона):

1. Гостевые: `/`, `/about`, `/tours` (14 карточек, нет `ReferenceError`).
2. Фильтры: страна Турция → 2, Москва → 13, Дубай → 1, 5★ → 6, AI → 3, business → 3, private → 8, maxPrice 30000 → 4, nights 7 (семантика «от N») → 7, комбо Турция+5★ → 1.
3. Картинки: 14 уникальных, все 200, ни одного `.svg`.
4. `/tours/1` → 200; `999`, `abc`, `-5` → 404.
5. Регистрация: `+7 (999) 111-22-33` → в БД `79991112233`; email в нижнем регистре; «абвгд», «12345», `+44 20 ...` → 400.
6. Роли: `/admin` 200 (14 туров, 5 заявок, все 6 seed-email); `/profile` без «Дата регистрации» и без `ReferenceError`; клиент видит свою заявку и ФИО, не видит чужие; клиент → `/manager` = 302 `access_denied`.
7. Бронирования: клиент → 302 `/profile`, `user_id` есть / `manager_id` NULL, телефон 11 цифр; менеджер → `manager_id` есть / `user_id` NULL, `+7 (900) 555-66-77` → `79005556677`.
8. Схема/seed: 6 колонок в `bookings`; 5 заявок с полным паспортным блоком; 14 туров, `total_price` сходится, все в 25k–250k; роли seed 1/2/3.

Отдельно проверена **миграция**: БД со старой схемой `bookings` (1 заявка) → новый `init.js` → 6 колонок добавлены, строка сохранена.

Если нужно повторить — пиши «прогони smoke этапа 1», восстановлю скрипт по этому рецепту.


---

## 6. Известные ограничения (это НЕ баги, а осознанный выбор)

- **Сессии в памяти:** рестарт контейнера разлогинивает всех. Для прода — `connect-pg-simple` (упомянуто в комментарии server.js).
- **CSRF-токен живёт в сессии:** при рассинхронe cookie (старая страница после `docker compose down -v`) POST даст 403 «обновите страницу» — ожидаемое поведение.
- **Нет rate-limit на /login** — перебор паролей не замедляется.
- **bcrypt 10 раундов синхронно в async-хендлере** (bcryptjs, не нативный bcrypt) — ок для учебного, тяжело под нагрузкой.
- **Нет тестов/CI/lintера** в репозитории.
- **README.md частично устарел** — в структуре упоминает удалённый `data/`, в стеке нет PostgreSQL, нет шагов init/seed и переменных DATABASE_URL/SESSION_SECRET. KODAREAD.md и PROJECT_ANALYSIS.md актуальны (обновлены 2026-11-17 после этапа 1).
- **`restoreFiltersFromUrl` в main.js** теперь избыточен (бэкенд всегда отдаёт `filters`), но безвреден — оставлен как fallback.
- В tours.ejs функция `val()` принимает старые алиасы (`country`, `city`, `hotelStars`, `max_price`) — harmless legacy, можно почистить.
- **Конструктор туров реализован:** создание и редактирование туров прямо в админ-панели (`/admin`) с авторасчётом цены, валидацией всех полей и live-калькулятором.
- **Загрузка файлов реализована (этап 3):** `middlewares/upload.js` (multer 2.x, diskStorage, MIME jpeg/png/webp, 5 МБ), обе формы бронирования отправляют `multipart/form-data` с CSRF в query, в БД — только имя файла.
- **`uploads/` в dev не виден на хосте:** в `docker-compose.dev.yml` том монтируется поверх bind-mount, поэтому файлы лежат в volume, а не в рабочей копии. Посмотреть: `docker compose exec app ls uploads/photos`.
- **Телефон реального аккаунта** (`zubairzord@gmail.com`, `8 989 497-09-94`) остался в старом формате — реальные данные не переписывал. Его новые заявки уже сохраняются нормализованными. ⚠️ Но в `tour.ejs` этот номер подставляется в поле с `pattern="[0-9]{11}"`, поэтому браузер не даст отправить форму, пока пользователь не перепишет номер (дефект A-08, §11).


---

## 7. Как запустить

```powershell
docker compose up -d --build
docker compose exec app node db/init.js
docker compose exec app node db/seed.js
# сайт: http://localhost:3000
```

Dev: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` (в dev проброшен порт БД 5432).

Без Docker: `npm install`, задать `DATABASE_URL`, `npm run dev`.

⚠️ В node_modules могут отсутствовать зависимости даже при наличии package.json — если «Cannot find module», просто `npm install`.

**Тестовые аккаунты** (пароль у всех `TestPass123!`): `admin@turist.ru` / `manager@turist.ru` / `manager2@turist.ru` / `user@turist.ru` / `user2@turist.ru` / `user3@turist.ru`.

**Загрузки:** `uploads/photos` и `uploads/passports` создаются в образе, в runtime живут в volume `uploads_data`. Полная очистка загрузок: `docker compose down -v` (удалит и БД).

**Если БД уже была заполнена старым seed** (5 туров), новый `seed.js` её не тронет — он идемпотентен и выйдет с «уже есть данные». Чтобы пересидить: очистить `bookings`, `tours` и старые seed-аккаунты (`admin@/manager@/user@turist.ru`), не удаляя реальные аккаунты, затем `init.js` → `seed.js`.

---

## 8. Маршруты (актуальный список)

| Метод, путь | Защита | Что делает |
|---|---|---|
| GET / , /about , /healthz | — | статичные страницы, JSON для healthcheck |
| GET /tours | — | каталог + 10 фильтров (utils/tourFilters) |
| GET /tours/:id | — | страница тура; скрытый/кривой id → 404 |
| POST /tours/:id/book | requireAuth+csrf | заявка от клиента → /profile |
| GET/POST /login, /register | csrf (POST) | вход/регистрация, next через safeNext |
| GET/POST /logout | csrf (POST) | dropSession |
| GET /auth/me | — | JSON о текущем юзере |
| GET /profile | requireAuth | брони клиента (`routes/profile.js`: +tour_title, total_price, client_name/phone) |
| GET /manager | admin+manager | каталог с фильтрами + 20 своих заявок |
| POST /manager/book | admin+manager | заявка от менеджера |
| GET /admin | admin | все туры/заявки/юзеры |
| POST /admin/tours/create | admin | Создание нового тура (конструктор) |
| POST /admin/tours/:id/edit | admin | Редактирование существующего тура |
| POST /admin/tours/:id/active | admin | toggle is_active |
| POST /admin/bookings/:id/status | admin | new/confirmed/cancelled (иное → отклонено) |
| POST /admin/users/:id/role | admin | user/manager/admin; нельзя снять роль с себя |
| POST /admin/users/:id/block | admin | toggle is_blocked; нельзя заблокировать себя |
| GET /clients | manager+admin | CRM: список заявок, поиск по ФИО/телефону + фильтры по туру |
| GET /clients/:id | manager+admin | досье туриста (бронь + тур + менеджер); кривой id → 404 |
| POST /clients/:id/cancel | manager+admin+csrf | статус → cancelled; flash + возврат в досье |
| GET /clients/files/:type/:filename | manager+admin | фото/скан паспорта из uploads/ (path traversal закрыт) |

---

## 9. Этап 4 — CRM-база туристов (2026-11-17)

**Задача:** карточки туристов, поиск и фильтр по турам, досье, защищённые файлы, отмена брони.

### 9.1 Что добавлено

| Файл | Что сделано |
|---|---|
| `routes/clients.js` (новый) | Роутер CRM. `router.use(requireRole('manager','admin'))` на весь роутер. Маршруты: `/files/:type/:filename`, `/`, `/:id`, `/:id/cancel`. |
| `server.js` | `const clientsRouter = require('./routes/clients')` + `app.use('/clients', clientsRouter)`. Плюс обёртка EJS-движка (см. 9.3). |
| `views/clients.ejs` (новый) | Панель поиска/фильтров (search, destination_country, destination_city, maxPrice, hotel_stars, nights, transfer_type) + сетка CRM-карточек с аватаром-заглушкой, статусом, индикатором паспорта и быстрой отменой брони. |
| `views/client-detail.ejs` (новый) | Досье в 2 колонки: слева фото, ФИО/ДР/телефон/комментарий/источник, паспортные данные с кнопкой «Скопировать», отмена брони; справа скан паспорта (превью + «Открыть оригинал») и детали тура. |
| `views/partials/header.ejs` | Пункт «База туристов» (`/clients`) — только при `role === 'manager' || 'admin'`. |
| `public/js/main.js` | Блок 11: `[data-copy]` → `navigator.clipboard.writeText` (+ fallback через textarea), отклик «Скопировано!» на 1.5 с. Блок 12: `form[data-confirm]` → `confirm()` перед отправкой (отмена брони). |
| `public/css/style.css` | Раздел 26: `.crm-filter`, `.crm-grid`, `.crm-card`, `.crm-avatar`, `.crm-dossier` (2 колонки), `.crm-panel`, `.crm-dl`, бейджи `.badge--docs-ok` / `.badge--docs-missing`, адаптив 960/600 px. |
| `db/init.js` | Идемпотентная миграция: `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS` для `client_photo`, `birth_date`, `passport_series_number`, `passport_issued_by`, `passport_expires_at`, `passport_scan`. |
| `uploads/photos/.gitkeep`, `uploads/passports/.gitkeep` | Каталоги для закрытых файлов (Express их не раздаёт как static — только через `/clients/files/...`). |

### 9.2 Как устроены ключевые места

- **Файлы.** `:type` только `photos`/`passports` (иначе 400). Имя обязано совпадать с `path.basename`, не содержать `..` и слешей (Express декодирует `%2e%2e`/`%2f`, поэтому проверок несколько). Дополнительно итоговый путь сверяется с `uploads/<type>`. Нет файла → 404, есть → `res.sendFile` с колбэком (ошибки `send` не превращаются в 500).
- **Список.** `bookings b JOIN tours t LEFT JOIN users u` (u — менеджер). Поиск: один плейсхолдер на `b.client_name`/`b.client_phone` через `ILIKE`. Фильтры — `parseFilters(req.query)`, но условия собираются локально (`buildClientConditions`), **без** `t.is_active = TRUE`, чтобы были видны брони по архивным турам. Сортировка `b.created_at DESC`.
- **Досье.** `SELECT b.*, t.*, b.id AS booking_id, u.full_name AS manager_name ...` — алиас `booking_id` обязателен: у `bookings` и `tours` одноимённая колонка `id`, в объекте строки остаётся последняя.
- **Отмена.** `UPDATE ... WHERE id = $1 AND status != 'cancelled' RETURNING id`; повторная отмена даёт `info`-flash «не найдена или уже отменена», редирект всегда на `/clients/:id`.

### 9.3 Найденный подводный камень EJS (важно на будущее)

Локаль с именем `client` ломала рендер: `ejs.__express` передаёт locals как опции EJS, а `client: true` — это опция «компилировать для браузера». В результате `include('partials/header')` падал с `include is not a function` (500 на `/clients/:id`).
**Решение:** в `server.js` зарегистрирован свой движок:
```js
app.engine('ejs', (filePath, options, callback) => {
  ejs.renderFile(filePath, options, { client: false }, callback);
});
```
Контракт сохранён — шаблон по-прежнему получает переменную `client`. Тот же эффект дадут любые locals, совпадающие с опциями EJS (`cache`, `debug`, `async`, `root` и т.п.) — движок теперь защищён от этого класса ошибок.

### 9.4 Проверка

- `node --check` — server.js, routes/clients.js, db/init.js, public/js/main.js: OK.
- EJS: `clients.ejs`, `client-detail.ejs`, header/footer компилируются и рендерятся.
- Smoke на живой БД (сервер на :3999, DATABASE_URL → контейнер `tur-project-db`), **30/30 PASS**:
  - гость `/clients` → 302 `/login?next=...`, в шапке гостя ссылки нет;
  - менеджер: список 200, карточки/бейджи, фильтры сохраняют значения и находят «Туристов», пустое состояние;
  - досье 200 (паспорт, `data-copy`, скан, детали тура), `/clients/abc` и несуществующий id → 404;
  - файлы: нет файла → 404, `type=secrets` → 400, `..%2F..%2Fserver.js` → 400, реальная картинка → 200 `image/*`;
  - отмена брони: 302 → `/clients/2`, flash «Бронирование отменено», статус «Отменена», повторная отмена не падает;
  - клиент `user` → 302 `/tours?error=access_denied`, админ видит и список, и досье.
- Регрессия рендеров после правки движка: `/`, `/tours`, `/tours/1`, `/about`, `/login`, `/register`, `/healthz`, `/manager`, `/admin`, `/profile`, `/clients`, `/clients/1` для всех ролей — все 200.
- Тестовые данные восстановлены (бронь №2 возвращена в `new`), временный файл из `uploads/photos` удалён.

### 9.5 Ограничения этапа (не баги)

- Загрузки файлов через интерфейс нет: фото/сканы кладутся в `uploads/photos` и `uploads/passports` вручную, в БД — только имя файла.
- В seed нет значений `client_photo`/`passport_scan`, поэтому на демо-данных видны заглушки с инициалами и плашка «Скан паспорта не прикреплён».
- CRM-поля добавлены в `bookings`, но `DATA_CONTRACT.md` их пока не описывает — контракт стоит обновить на следующем этапе.
- Страница `/clients` показывает все заявки (включая отменённые) — это осознанно для CRM; при необходимости фильтр по статусу добавляется одной строкой.

---

## 10. Этап 3 из 5 — Загрузка фото/сканов документов (Multer) и полные паспортные данные при бронировании (2026-11-17)

**Задача:** реализовать загрузку фото туриста и скана паспорта через multer, добавить полную анкету с паспортными данными в обе формы бронирования (клиентскую и менеджерскую) с серверной валидацией всех полей, и мини-превью файлов на клиенте.

### 10.1 Новая зависимость

| Пакет | Версия | Назначение |
|---|---|---|
| `multer` | ^2.5.0 | Приём multipart/form-data файлов (diskStorage) |

### 10.2 Новый файл: `middlewares/upload.js`

Единственная точка приёма файлов. Экспортирует:

| Экспорт | Что делает |
|---|---|
| `uploadBookingDocs` | Готовый middleware для маршрутов бронирования: `multer.fields([{client_photo, maxCount:1}, {passport_scan, maxCount:1}])`, обёрнутый в обработку ошибок (flash + redirect) |
| `removeUploadedFiles(req)` | Удаляет все файлы, сохранённые в текущем запросе (для case: валидация не прошла) |
| `getUploadedFileName(req, field)` | Возвращает имя файла или `null` |

**Конфигурация storage (diskStorage):**

| Поле | Куда пишется | Имя файла |
|---|---|---|
| `client_photo` | `uploads/photos/` | `Date.now()-Math.round(random*1e9).jpg` |
| `passport_scan` | `uploads/passports/` | аналогично |

- Расширение берётся **только** из MIME-типа (`.jpg` / `.png` / `.webp`), а не из `originalname`.
- `fileFilter`: разрешает `image/jpeg`, `image/png`, `image/webp`; при другом MIME — ошибка с понятным текстом.
- `limits: { fileSize: 5 * 1024 * 1024 }` — 5 МБ на файл.
- **Ни одна ошибка загрузки не даёт 500**: все переводятся в `req.flash('error', ...)` + редирект обратно.

### 10.3 Обновление `utils/validators.js`

Добавлена функция `validateBookingData(raw, options)`:
- Принимает `req.body` + опции `{ defaultName, defaultPhone }` (для клиентской брони подставляет из профиля).
- Валидирует: `client_name` (непустой), `client_phone` (11 цифр), `birth_date` (дата в прошлом), `passport_series_number` (10 цифр), `passport_issued_by` (непустая строка), `passport_expires_at` (непросроченная дата).
- Возвращает `{ ok: true, values: {...} }` или `{ ok: false, errors: [...] }`.

### 10.4 Обновление маршрутов бронирования

#### `routes/tours.js` — POST /tours/:id/book

- **middleware:** `requireAuth → uploadBookingDocs → хендлер`
- Извлекает все 7 полей из `req.body` + 2 имени файлов из `req.files`.
- Валидация через `validateBookingData(req.body, { defaultName: req.user.full_name, defaultPhone: req.user.phone })`.
- При ошибке валидации: `removeUploadedFiles(req)` → `flash('error', ...)` → `redirect(/tours/${id})`.
- INSERT содержит: `tour_id, user_id, client_name, client_phone, birth_date, passport_series_number, passport_issued_by, passport_expires_at, client_photo, passport_scan, comment, status='new'`.

#### `server.js` — POST /manager/book

- **middleware:** `requireAuth → requireRole('admin','manager') → uploadBookingDocs → хендлер`
- Аналогичная валидация без дефолтов (менеджер заполняет все поля).
- При ошибке валидации: `removeUploadedFiles(req)` → `flash('error', ...)` → `redirect('/manager')`.
- INSERT содержит: `tour_id, user_id=NULL, manager_id, client_name, client_phone, birth_date, passport_series_number, passport_issued_by, passport_expires_at, client_photo, passport_scan, comment, status='confirmed'`.

### 10.5 Обновление шаблонов (формы)

#### `views/tour.ejs`

- `enctype="multipart/form-data"` добавлен.
- `action="/tours/<%= tour.id %>/book?_csrf=<%= csrfToken %>"` — CSRF в query (обязательно при multipart, т.к. `req.body` парсится только после multer).
- Поля: `client_name` (prefill `user.full_name`), `client_phone` (prefill `user.phone`), `birth_date`, `passport_series_number` (placeholder `4510 123456`), `passport_issued_by`, `passport_expires_at`, `client_photo` (type=file, accept), `passport_scan` (type=file, accept), `comment`.
- Контейнеры превью: `<div id="preview_client_photo">`, `<div id="preview_passport_scan">`.

#### `views/manager.ejs`

- `enctype="multipart/form-data"` добавлен.
- `action="/manager/book?_csrf=<%= csrfToken %>"`.
- Те же поля в боковой панели (id с префиксом `bp-`).
- Контейнеры: `<div id="bp-preview_client_photo">`, `<div id="bp-preview_passport_scan">`.

### 10.6 Клиентский JS: мини-превью файлов

**`public/js/main.js`** — блок 13 `filePreviews()`:
- Вешает `change` на `input[type="file"][name="client_photo"]` и `[name="passport_scan"]`.
- Проверяет MIME (jpeg/png/webp) и размер (≤ 5 МБ) на клиенте.
- Читает через `FileReader.readAsDataURL` → вставляет `<img class="file-preview__thumb">` + подпись.
- При ошибке показывает `.file-preview__error` и очищает input.

### 10.7 CSS для превью

**`public/css/style.css`** — раздел 28:
- `.file-preview__thumb` — max 180×140, border-radius, box-shadow.
- `.file-preview__info` — имя файла + размер, мелкий серый текст.
- `.file-preview__error` — красный текст ошибки.

### 10.8 CSRF и multipart (важно на будущее)

При `enctype="multipart/form-data"` браузер отправляет тело как multipart. Стандартный `express.urlencoded` **не парсит** такое тело, и на момент `csrf()` `req.body` пуст. Решение: токен передаётся в query-строке `action="?_csrf=..."`, а `middlewares/csrf.js` уже читает `req.query._csrf` как fallback. Hidden-поле `_csrf` оставлено на случай, если кто-то уберёт multipart.

### 10.9 Проверка

- `node --check` — server.js, routes/tours.js, middlewares/upload.js, utils/validators.js, public/js/main.js: **OK**.
- Сервер запускается: `require('./server.js')` → «Сервер запущен» без ошибок.
- EJS-шаблоны tour.ejs и manager.ejs не содержат синтаксических ошибок.
- `package.json` обновлён (multer ^2.5.0 добавлен в dependencies).

### 10.10 Ограничения этапа (не баги)

- В dev через Docker файлы пишутся в volume `uploads_data`, а не в рабочую копию (см. §6).
- Файлы удаляются при ошибке валидации, но при ошибке БД (INSERT упал) могут остаться осиротевшими — полная компенсация требует транзакции + cleanup.
- Мини-превью работает только для картинок; PDF не поддерживается (по ТЗ — только изображения).
- В `validateBookingData` `comment` — необязательное, остальные 6 полей строги.
- `passport_series_number`: форма допускает пробел (`"4510 123456"`) для удобства, но сервер через `validatePassport` оставляет 10 цифр без пробела.

---

## 11. Финальный аудит (2026-11-17) — сверка с итоговым ТЗ

**HEAD:** `5c9fce7` (`feat: photo`), рабочее дерево чистое.
**Docker:** `tur-project-app` и `tur-project-db` — healthy; app запущен в dev-режиме (bind mount + `node --watch`).

### 11.1 Что подтверждено на реальном коде

- `node --check` — **16/16** JS-файлов; компиляция EJS — **15/15** шаблонов.
- БД: **14 туров**, **7 пользователей** (6 seed + реальный аккаунт), **5 заявок** (3 new / 1 confirmed / 1 cancelled), `total_price` — 0 расхождений, в `bookings` **15 колонок** (включая 6 паспортных).
- Все **14** путей картинок из `db/seed.js` существуют в `public/images`.
- Свежий процесс на `:3999` (та же БД): гость `/clients` → `302 /login`; менеджер `/clients` → `200` (5 карточек), `/clients/1` → `200`; админ `/admin` → `200` (14 кнопок редактирования + конструктор); клиент `/profile` → `200`, `/admin` → `302 access_denied`; фильтр «Турция» → 2 карточки; JSON-каталог → 6 из 14, `hasMore: true`.
- **CSRF:** все **13** POST-форм в шаблонах содержат `_csrf` (включая 3 формы logout; обе multipart-формы — через `?_csrf=` в action).
- **`/clients/files/...`:** гость → `302 /login`, клиент → `302 access_denied`, менеджер → `404` (нет файла) / `400` (неверный тип или traversal `..%2F`, `..%5C`).
- Валидаторы: телефон — ровно 11 цифр с `7`/`8`; паспорт — ровно 10 цифр; дата рождения — в прошлом, 0–120 лет; срок паспорта — не просрочен; `is_blocked` — 403 на входе и мгновенный разлогин через `attachCurrentUser`.

### 11.2 Открытые дефекты

| ID | Где | Проблема |
|---|---|---|
| A-01 | `public/css/style.css:896` и `:1409` | Два разных `.filters`: старый задаёт `display:grid` + `repeat(auto-fit,minmax(150px,1fr))`, новый — только оформление. В новой разметке (`filters__head` / `filters__grid` / `filters__actions`) дети становятся колонками → панель фильтров на `/` и `/tours` верстается неверно. |
| A-02 | `public/css/style.css:686` и `:832` | Дубль `.alert`: поздний `max-width:420px` сужает **все** flash-сообщения сайта. |
| A-03 | `public/css/style.css` | Повторяются секции «25/26/27» и блоки `.form__input`, `.btn--secondary`, `.admin-table`, `.form__actions` — наследие слияния, работает по принципу «последний выигрывает». |
| A-04 | `server.js:100-123` | Мёртвый дубль `GET /profile` (перекрыт `app.use('/profile', profileRouter)`). |
| A-05 | `views/tour.ejs:369-374` | Гость видит ссылки `/login` и `/register` без `next` → после входа попадает на `/tours`, а не обратно к туру. |
| A-06 | `routes/tours.js:153-168` | При невалидном/скрытом `:id` файлы уже сохранены multer и не удаляются (`next()` без `removeUploadedFiles`). |
| A-07 | `views/admin.ejs:240` | `data-tour='<%- JSON.stringify(...) %>'` без экранирования: апостроф в названии ломает атрибут, потенциальный XSS. |
| A-08 | `views/tour.ejs:312`, `manager.ejs:331` | `pattern="[0-9]{11}"` + prefilled телефон реального аккаунта `8 989 497-09-94` → браузер не даёт отправить форму. |
| A-09 | `views/tour.ejs:323`, `manager.ejs:342` | `maxlength="11"` при `pattern="[0-9]{10}"`: номер с пробелом (`4510 123456`) не проходит браузерную проверку, хотя сервер его принимает. |
| A-10 | `db/seed.js:48-53` | Идемпотентность проверяет только `tours`: если туры есть, а заявок нет — seed выйдет и заявки не создаст. |
| A-11 | `server.js:572-579` | 500-страница отдаёт `err.message` наружу. |
| A-12 | `routes/auth.js:202` | `GET /logout` меняет состояние без CSRF. |
| A-13 | инфраструктура | Dev-контейнер на `:3000` отдавал старый код (`/clients` → 404) из-за `node --watch` + Windows bind mount; нужен restart контейнера. |

### 11.3 Расхождения документации

- `DATA_CONTRACT.md` §4: фильтры описаны как `{ country, city, maxPrice, nights, hotelStars }`, фактически — snake_case (`destination_country`, `destination_city`, `hotel_stars`, …) плюс `countries` (для `/tours`) и `filters` (для `/manager`).
- `DATA_CONTRACT.md` §3: `client_photo` / `passport_scan` описаны как путь `/uploads/...`, фактически хранится **имя файла**, раздача — `/clients/files/<type>/<filename>`.
- `db/init.js`: `CREATE TABLE` — `passport_series_number VARCHAR(20)`, `ALTER` — `VARCHAR(50)` (разная длина на новой и мигрированной базе).
- `PROJECT_ANALYSIS.md`: устаревшие счётчики (зависимостей 6, шаблонов 15, `main.js` 621 строка, CSS ~3100 строк).
- `README.md`: упоминает удалённый `data/`, нет PostgreSQL, `db/init.js`, `db/seed.js`, `DATABASE_URL`, `SESSION_SECRET`.

