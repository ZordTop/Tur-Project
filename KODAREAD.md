# KODAREAD.md — Картотека репозитория Tur-Project

> **Назначение:** Моя рабочая памятка. В новом чате достаточно написать «прочитай KODAREAD.md» — и я знаю структуру проекта, историю исправлений и что осталось на будущее.
>
> **Статус:** Все известные баги исправлены, проверены интеграционным прогоном (71/71) и **закоммичены командой** (`57bd0c5 fix`, HEAD ветки work). PROJECT_ANALYSIS.md переписан под текущее состояние (2026-11-17).
>
> **Свежие изменения команды после моих правок:** в `public/images` добавлены реальные фото туров (`tour-sochi.jpg` и т.д., коммит `a144a29`), хотя seed.js указывает на мои SVG-заглушки — переключение seed на jpg остаётся на решение команды.

---

## 1. Что это за проект

Туристический сайт (учебный). Каталог пакетных туров (перелёт + отель + трансфер), самостоятельное бронирование клиентом, оформление клиента менеджером, админ-панель.

**Стек:** Node.js 20, Express 4, EJS, PostgreSQL (pg), bcryptjs, express-session, Docker Compose.

---

## 2. Структура файлов

```
Tur-Project/
├── server.js              ← точка входа: сессии, flash, csrf, attachCurrentUser,
│                            маршруты /profile, /manager, /manager/book, /admin/* CRUD,
│                            404/500, graceful shutdown
├── package.json           ← express, ejs, pg, bcryptjs, express-session (без новых зависимостей!)
├── Dockerfile / docker-compose.yml / docker-compose.dev.yml
├── .gitignore / .dockerignore
├── DATA_CONTRACT.md       ← контракт таблиц и переменных шаблонов
├── PROJECT_ANALYSIS.md    ← переписан 2026-11-17 под текущее состояние
│
├── routes/
│   ├── index.js           ← GET /, /healthz, /about
│   ├── tours.js           ← GET /tours (фильтры), GET /tours/:id, POST /tours/:id/book
│   └── auth.js            ← login/register (+валидация email/телефона), logout, /me
├── middlewares/
│   ├── auth.js            ← attachCurrentUser, requireAuth, requireRole, dropSession
│   ├── csrf.js            ← ⭐ новое: CSRF-токен в сессии, сверка на POST/PUT/PATCH/DELETE
│   └── flash.js           ← ⭐ новое: req.flash() + res.locals.flash (одноразовые сообщения)
├── utils/
│   └── tourFilters.js     ← ⭐ новое: parseFilters/buildConditions — единые фильтры
│                            для /tours и /manager (ключи = name-атрибуты форм)
├── db/
│   ├── pool.js            ← singleton Pool (DATABASE_URL)
│   ├── init.js            ← CREATE TABLE (users/tours/bookings) + индексы; теперь pool.end()
│   └── seed.js            ← 3 юзера + 5 туров; картинки .svg; теперь pool.end()
├── views/                 ← index, tours, tour, about, login, register,
│                            profile, manager, admin, 404, error + partials/(header,footer)
└── public/
    ├── css/style.css      ← есть .alert--success/--error/--info
    ├── js/main.js         ← бургер, табы, сайдбар менеджера, restoreFiltersFromUrl
    └── images/            ← реальные фото туров (.jpg/.webp — добавлены командой
                             в a144a29) + мои 5 SVG-заглушек; seed.js ссылается на .svg
```

**Удалено:** `data/tours.js` (мёртвое in-memory хранилище, бэкенд его не импортировал).

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

---

## 4. Что было сломано и как исправлено (история)

| ID | Проблема | Решение |
|---|---|---|
| BUG-01 | Не было `GET /profile` (шапка вела в 404) | Маршрут в server.js: bookings + tour_title + total_price, `WHERE user_id = req.user.id` |
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
| GAP-02 | public/images пуст → битые картинки | 5 SVG-заглушек; seed.js переведён на `.svg`. **Open item:** команда позже добавила реальные `tour-*.jpg` — seed можно переключить на них |
| GAP-03 | Не было CSRF | `middlewares/csrf.js` (crypto.timingSafeEqual, токен в сессии) — БЕЗ npm-зависимостей |
| GAP-04 | Не было валидации email/телефона | EMAIL_RE/PHONE_RE в routes/auth.js + `normalizeEmail` (trim+lowercase, иначе UNIQUE обходится регистром) |
| GAP-05 | Не было flash-сообщений | `middlewares/flash.js` + вывод в header.ejs |
| NOTE-01 | Дефолтный SESSION_SECRET | Предупреждение в консоль при production |
| NOTE-02 | 5432 пробрасывался наружу в production | Перенесено в docker-compose.dev.yml |
| NOTE-03 | Не было .gitignore | Уже был — дополнен (.env.*, логи) |
| NOTE-04 | db/init.js и seed.js не закрывали пул | `pool.end()` в finally; process.exit → process.exitCode |

---

## 5. Как проверялось (метод — можно воспроизвести)

Интеграционный прогон делался так (временные скрипты удалены из репо):

1. `docker run -d --name tur-smoke-db -e POSTGRES_USER=tur -e POSTGRES_PASSWORD=tur_pass -e POSTGRES_DB=tur_project -p 55432:5432 postgres:16-alpine`
2. `DATABASE_URL=postgres://tur:tur_pass@localhost:55432/tur_project node db/init.js && node db/seed.js`
3. Сервер на `PORT=3999` + скрипт на node fetch с ручным cookie-jar (⚠️ undici fetch НЕ хранит cookie сам — вести jar строкой обязательно)
4. 71 проверка: все 10 фильтров + комбо + SQL-мусор в параметрах, регистрация/валидация/дубль-email, бронь клиентом (поля в БД, flash одноразовость), бронь скрытого тура (404), оформление менеджером, все 4 admin-CRUD + отказ недопустимых значений + самозащита админа, мгновенный разлогин заблокированного, права ролей, logout, next-редирект и open-redirect.
5. Итог: **pass=71 fail=0**, шаблоны: 16/16 рендеров (включая гостевые и пустые состояния).

Если нужно повторить — пиши «прогони интеграционный smoke», восстановлю скрипт по этому рецепту.

---

## 6. Известные ограничения (это НЕ баги, а осознанный выбор)

- **Сессии в памяти:** рестарт контейнера разлогинивает всех. Для прода — `connect-pg-simple` (упомянуто в комментарии server.js).
- **CSRF-токен живёт в сессии:** при рассинхронe cookie (старая страница после `docker compose down -v`) POST даст 403 «обновите страницу» — ожидаемое поведение.
- **Нет rate-limit на /login** — перебор паролей не замедляется.
- **bcrypt 10 раундов синхронно в async-хендлере** (bcryptjs, не нативный bcrypt) — ок для учебного, тяжело под нагрузкой.
- **Нет тестов/CI/lintера** в репозитории.
- **README.md частично устарел** — в структуре упоминает удалённый `data/`, в стеке нет PostgreSQL, нет шагов init/seed и переменных DATABASE_URL/SESSION_SECRET. PROJECT_ANALYSIS.md актуален (переписан 2026-11-17).
- **`restoreFiltersFromUrl` в main.js** теперь избыточен (бэкенд всегда отдаёт `filters`), но безвреден — оставлен как fallback.
- В tours.ejs функция `val()` принимает старые алиасы (`country`, `city`, `hotelStars`, `max_price`) — harmless legacy, можно почистить.

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

**Тестовые аккаунты** (пароль у всех `TestPass123!`): admin@turist.ru / manager@turist.ru / user@turist.ru.

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
| GET /profile | requireAuth | брони клиента (+tour_title, total_price) |
| GET /manager | admin+manager | каталог с фильтрами + 20 своих заявок |
| POST /manager/book | admin+manager | заявка от менеджера |
| GET /admin | admin | все туры/заявки/юзеры |
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

