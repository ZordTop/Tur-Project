# KODAREAD.md — Картотека репозитория Tur-Project

> **Назначение:** Моя рабочая памятка. В новом чате достаточно написать «прочитай KODAREAD.md» — и я знаю структуру проекта, историю исправлений и что осталось на будущее.
>
> **Статус (2026-11-17, этап 1 из 5):** Базовая ревизия закоммичена командой (`57bd0c5 fix`), затем поверх неё выполнены **мои правки этапа 1** (см. §0): хранилище `uploads/` + Docker-volume, 6 новых колонок в `bookings` (с миграцией), модуль `utils/validators.js`, валидация телефона/email на регистрации и в бронированиях, seed на 14 туров / 6 юзеров / 5 заявок. Проверено финальным интеграционным прогоном **52/52**. Плюс починены падения каталога (`ReferenceError`) и удалён мёртвый код (`services/tourService.js`, `tmp_test.js`).
>
> **HEAD на момент записи:** `027c79b` (merge PR #24). Мои правки этапа 1 — в рабочем дереве, не закоммичены (git-мутации без явной команды не делаю).

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
├── package.json           ← express, ejs, pg, bcryptjs, express-session (без новых зависимостей!)
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
│   └── profile.js         ← ⭐ GET /profile — брони клиента (client_name/phone + детали тура)
├── middlewares/
│   ├── auth.js            ← attachCurrentUser, requireAuth, requireRole, dropSession
│   ├── csrf.js            ← CSRF-токен в сессии, сверка на POST/PUT/PATCH/DELETE
│   └── flash.js           ← req.flash() + res.locals.flash (одноразовые сообщения)
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
│                            profile, manager, admin, 404, error + partials/(header,footer)
└── public/
    ├── css/style.css      ← есть .alert--success/--error/--info
    ├── js/main.js         ← бургер, табы, сайдбар менеджера, restoreFiltersFromUrl
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
- **Загрузка файлов ещё не реализована:** папки, volume и колонки `client_photo`/`passport_scan` готовы, но маршрутов приёма файлов (multer и т.п.) и полей `enctype="multipart/form-data"` пока нет — это следующий этап. Зависимостей не добавляли.
- **`uploads/` в dev не виден на хосте:** в `docker-compose.dev.yml` том монтируется поверх bind-mount, поэтому файлы лежат в volume, а не в рабочей копии. Посмотреть: `docker compose exec app ls uploads/photos`.
- **Телефон реального аккаунта** (`zubairzord@gmail.com`, `8 989 497-09-94`) остался в старом формате — реальные данные не переписывал. Его новые заявки уже сохраняются нормализованными.


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
| POST /admin/tours/:id/active | admin | toggle is_active |
| POST /admin/bookings/:id/status | admin | new/confirmed/cancelled (иное → отклонено) |
| POST /admin/users/:id/role | admin | user/manager/admin; нельзя снять роль с себя |
| POST /admin/users/:id/block | admin | toggle is_blocked; нельзя заблокировать себя |
