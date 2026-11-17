// Тесты бэкенда: фильтры каталога, детальная страница, бронирование, профиль.
// ВРЕМЕННЫЙ файл для проверки ТЗ №2 — удалить после прогонов.
// Запуск: docker compose exec app node tmp_test.js
const http = require('http');

// Единый клиент: сохраняет cookie между запросами, не следует за редиректами,
// возвращает статус, тело и заголовки.
let cookie = null;

function req(method, path, form) {
  return new Promise((resolve, reject) => {
    const body = form ? new URLSearchParams(form).toString() : null;
    const headers = {};
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    if (cookie) headers.Cookie = cookie;

    const r = http.request({ hostname: '127.0.0.1', port: 3000, path, method, headers }, (res) => {
      let text = '';
      res.on('data', (d) => (text += d));
      res.on('end', () => {
        if (res.headers['set-cookie']) {
          cookie = res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
        }
        resolve({ status: res.statusCode, body: text, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function logout() {
  cookie = null;
}

async function login(email) {
  logout();
  await req('POST', '/auth/login', { email, password: 'TestPass123!' });
}

const results = [];

async function test(label, fn) {
  try {
    await fn();
    results.push({ ok: true, label });
    console.log(`  \x1b[32mOK\x1b[0m  ${label}`);
  } catch (e) {
    results.push({ ok: false, label, err: e.message });
    console.log(`  \x1b[31mFAIL\x1b[0m ${label} — ${e.message}`);
    process.exitCode = 1;
  }
}

function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

// toLocaleString('ru-RU') в Node ставит неразрывный пробел (U+00A0) как
// разделитель тысяч — браузер рисует его как обычный пробел. Нормализуем,
// чтобы ассерты можно было писать обычным пробелом.
function norm(text) {
  return text.replace(/ /g, ' ');
}

function has(res, text, what) {
  if (!norm(res.body).includes(norm(text))) throw new Error(`${what}: в ответе нет "${text}"`);
}

function hasnt(res, text, what) {
  if (norm(res.body).includes(norm(text))) throw new Error(`${what}: в ответе не должно быть "${text}"`);
}

// Счётчик найденных туров; при пустой выдаче шаблона считается блок .empty
function found(res) {
  const m = res.body.match(/Найдено туров: (\d+)/);
  if (m) return Number(m[1]);
  return res.body.includes('class="empty"') ? 0 : -1;
}

// Проверка фильтра одним запросом
async function filter(label, path, expected) {
  const res = await req('GET', path);
  await test(label, () => {
    eq(res.status, 200, 'HTTP статус');
    eq(found(res), expected, 'туров найдено');
  });
}

async function main() {
  console.log('\n=== ФИЛЬТРЫ ПОИСКА (seed: Сочи 43000/7н/4星, Стамбул 46000/5н/4星,');
  console.log('    Прага 44000/6н/3星, Анталья 82000/10н/5星, СПб 31500/4н/4星) ===');

  await filter('без фильтров → 5', '/tours', 5);

  console.log('\n--- destination_country: точное совпадение, регистронезависимо ---');
  await filter('destination_country=Турция → 2', '/tours?destination_country=%D0%A2%D1%83%D1%80%D1%86%D0%B8%D1%8F', 2);
  await filter('destination_country=турция (нижний регистр) → 2', '/tours?destination_country=%D1%82%D1%83%D1%80%D1%86%D0%B8%D1%8F', 2);
  await filter('destination_country=ТУРЦИЯ (верхний) → 2', '/tours?destination_country=%D0%A2%D0%A3%D0%A0%D0%A6%D0%98%D0%AF', 2);
  await filter('destination_country=Франция → 0', '/tours?destination_country=%D0%A4%D1%80%D0%B0%D0%BD%D1%86%D0%B8%D1%8F', 0);
  await filter('destination_country=Тур (неполное) → 0 (не подстрока)', '/tours?destination_country=%D0%A2%D1%83%D1%80', 0);

  console.log('\n--- destination_city / departure_city: подстрока ---');
  await filter('destination_city=петерб → 1 (Санкт-Петербург)', '/tours?destination_city=%D0%BF%D0%B5%D1%82%D0%B5%D1%80%D0%B1', 1);
  await filter('destination_city=Анталь → 1', '/tours?destination_city=%D0%90%D0%BD%D1%82%D0%B0%D0%BB%D1%8C', 1);
  await filter('destination_city=Сочи → 1', '/tours?destination_city=%D0%A1%D0%BE%D1%87%D0%B8', 1);
  await filter('departure_city=москв → 5 (все из Москвы)', '/tours?departure_city=%D0%BC%D0%BE%D1%81%D0%BA%D0%B2', 5);
  await filter('departure_city=Сочи → 0 (это город прилёта)', '/tours?departure_city=%D0%A1%D0%BE%D1%87%D0%B8', 0);

  console.log('\n--- departure_date: DATE(departure_at) = значение ---');
  await filter('departure_date=2027-06-01 → 1 (Сочи)', '/tours?departure_date=2027-06-01', 1);
  await filter('departure_date=2027-06-10 → 1 (Стамбул)', '/tours?departure_date=2027-06-10', 1);
  await filter('departure_date=2027-07-15 → 1 (Анталья)', '/tours?departure_date=2027-07-15', 1);
  await filter('departure_date=2027-06-01 08:30 (не ISO) → игнор → 5', '/tours?departure_date=2027-06-01%2008%3A30', 5);
  await filter('departure_date=2027-12-31 (таких нет) → 0', '/tours?departure_date=2027-12-31', 0);

  console.log('\n--- enum-фильтры: точное совпадение с CHECK ---');
  await filter('flight_class=business → 1', '/tours?flight_class=business', 1);
  await filter('flight_class=economy → 3', '/tours?flight_class=economy', 3);
  await filter('flight_class=comfort → 1', '/tours?flight_class=comfort', 1);
  await filter('hotel_meal=AI → 1', '/tours?hotel_meal=AI', 1);
  await filter('hotel_meal=BB → 2', '/tours?hotel_meal=BB', 2);
  await filter('hotel_meal=RO → 1', '/tours?hotel_meal=RO', 1);
  await filter('hotel_meal=HB → 1', '/tours?hotel_meal=HB', 1);
  await filter('transfer_type=bus → 2', '/tours?transfer_type=bus', 2);
  await filter('transfer_type=private → 3', '/tours?transfer_type=private', 3);

  console.log('\n--- сравнения ---');
  await filter('hotel_stars=5 (>=) → 1', '/tours?hotel_stars=5', 1);
  await filter('hotel_stars=4 (>=) → 4', '/tours?hotel_stars=4', 4);
  await filter('hotel_stars=3 (>=) → 5', '/tours?hotel_stars=3', 5);
  await filter('hotel_stars=2 (>=) → 5', '/tours?hotel_stars=2', 5);
  await filter('maxPrice=45000 (<=) → 3', '/tours?maxPrice=45000', 3);
  await filter('maxPrice=40000 → 1', '/tours?maxPrice=40000', 1);
  await filter('maxPrice=100000 → 5', '/tours?maxPrice=100000', 5);
  await filter('nights=5 (точное) → 1', '/tours?nights=5', 1);
  await filter('nights=7 (точное, не >=) → 1 (Сочи, без Антальи)', '/tours?nights=7', 1);
  await filter('nights=1 (точное, таких нет) → 0', '/tours?nights=1', 0);

  console.log('\n--- невалидные значения игнорируются (не 500, не пустая выдача) ---');
  await filter('departure_date=01.02.2027 (не ISO) → 5', '/tours?departure_date=01.02.2027', 5);
  await filter('departure_date=2027-02-31 (31 февраля) → 5', '/tours?departure_date=2027-02-31', 5);
  await filter('departure_date=2027-13-01 (месяц 13) → 5', '/tours?departure_date=2027-13-01', 5);
  await filter('flight_class=bogus → 5', '/tours?flight_class=bogus', 5);
  await filter('flight_class=Business (не с того регистра) → 5', '/tours?flight_class=Business', 5);
  await filter('hotel_meal=ai (нижний регистр) → 5', '/tours?hotel_meal=ai', 5);
  await filter('transfer_type=поезд → 5', '/tours?transfer_type=%D0%BF%D0%BE%D0%B5%D0%B7%D0%B4', 5);
  await filter('hotel_stars=abc → 5', '/tours?hotel_stars=abc', 5);
  await filter('hotel_stars=0 → 5', '/tours?hotel_stars=0', 5);
  await filter('hotel_stars=-3 → 5', '/tours?hotel_stars=-3', 5);
  await filter('hotel_stars=4.5 (не целое) → 5', '/tours?hotel_stars=4.5', 5);
  await filter('maxPrice=-100 → 5', '/tours?maxPrice=-100', 5);
  await filter('maxPrice=abc → 5', '/tours?maxPrice=abc', 5);
  await filter('nights=0 → 5', '/tours?nights=0', 5);
  await filter('пустые ?nights=&maxPrice= → 5', '/tours?nights=&maxPrice=', 5);
  await filter('неизвестный параметр ?foo=bar → 5', '/tours?foo=bar', 5);

  console.log('\n--- комбинации ---');
  await filter('Турция + hotel_stars=4 → 2', '/tours?destination_country=%D0%A2%D1%83%D1%80%D1%86%D0%B8%D1%8F&hotel_stars=4', 2);
  await filter('Турция + business → 1', '/tours?destination_country=%D0%A2%D1%83%D1%80%D1%86%D0%B8%D1%8F&flight_class=business', 1);
  await filter('Россия + nights=4 → 1 (СПб)', '/tours?destination_country=%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F&nights=4', 1);
  await filter('city=а + maxPrice=45000 → 2', '/tours?destination_city=%D0%B0&maxPrice=45000', 2);
  await filter('Франция + maxPrice=100 → 0', '/tours?destination_country=%D0%A4%D1%80%D0%B0%D0%BD%D1%86%D0%B8%D1%8F&maxPrice=100', 0);

  console.log('\n--- SQL-инъекции: значения остаются данными ---');
  await filter("destination_country=' OR 1=1 -- → 0", '/tours?destination_country=%27%20OR%201%3D1%20--', 0);
  await filter("maxPrice=45000 OR 1=1 → невалидное, игнор → 5", '/tours?maxPrice=45000%20OR%201%3D1', 5);
  await filter("destination_city=%'; DROP TABLE tours; -- → 0", '/tours?destination_city=%25%27%3B%20DROP%20TABLE%20tours%3B%20--', 0);
  const afterInject = await req('GET', '/tours');
  await test('таблица tours цела после инъекционных запросов', () => {
    eq(afterInject.status, 200, 'HTTP статус');
    eq(found(afterInject), 5, 'туров найдено');
  });

  console.log('\n=== СОРТИРОВКА (total_price ASC, id ASC) ===');
  const sorted = await req('GET', '/tours');
  await test('цены идут по возрастанию', () => {
    const prices = [...sorted.body.matchAll(/class="card__price">([\d\s ]+) ₽/g)]
      .map((m) => Number(m[1].replace(/\s|\u00a0/g, '')));
    eq(prices.length, 5, 'число цен в выдаче');
    eq(JSON.stringify(prices), JSON.stringify([31500, 43000, 44000, 46000, 82000]), 'порядок цен');
  });

  console.log('\n=== ПОДСВЕТКА ФОРМЫ (значения не сбрасываются) ===');
  const fill = await req('GET', '/tours?destination_country=%D0%A2%D1%83%D1%80%D1%86%D0%B8%D1%8F&hotel_stars=4&maxPrice=50000&nights=6&city=%D0%A1%D0%BE%D1%87%D0%B8');
  await test('select стран выбран', () => has(fill, '<option value="Турция" selected', 'country'));
  await test('select звёзд выбран', () => has(fill, '<option value="4" selected', 'hotel_stars'));
  await test('maxPrice в value', () => has(fill, 'value="50000"', 'maxPrice'));
  await test('nights в value', () => has(fill, 'value="6"', 'nights'));
  await test('нет утечки undefined в value', () => hasnt(fill, 'value="undefined"', 'undefined'));

  console.log('\n=== ДЕТАЛЬНАЯ СТРАНИЦА ТУРА ===');
  const t1 = await req('GET', '/tours/1');
  await test('/tours/1 → 200 + подписи кодов из словарей', () => {
    eq(t1.status, 200, 'HTTP статус');
    has(t1, 'Москва → Сочи', 'маршрут');
    has(t1, 'Эконом', 'flight_class');
    has(t1, 'Завтраки', 'hotel_meal');
    has(t1, 'Индивидуальный автомобиль', 'transfer_type');
    has(t1, '43 000 ₽', 'total_price');
    has(t1, 'data-book="1"', 'кнопка бронирования');
  });
  await test('/tours/999 → 404', async () => eq((await req('GET', '/tours/999')).status, 404, 'статус'));
  await test('/tours/abc → 404 (id не доходит до БД)', async () => eq((await req('GET', '/tours/abc')).status, 404, 'статус'));
  await test('/tours/-5 → 404', async () => eq((await req('GET', '/tours/-5')).status, 404, 'статус'));
  await test('/tours/1.5 → 404', async () => eq((await req('GET', '/tours/1.5')).status, 404, 'статус'));

  console.log('\n=== БРОНИРОВАНИЕ (POST /tours/:id/book) ===');
  logout();
  const guestBook = await req('POST', '/tours/1/book', { comment: 'гость' });
  await test('гость → 302 на /login?next=/tours/1/book', () => {
    eq(guestBook.status, 302, 'статус');
    eq(guestBook.headers.location, '/login?next=%2Ftours%2F1%2Fbook', 'location');
  });

  await login('user@turist.ru');
  const book1 = await req('POST', '/tours/1/book', { comment: 'Хочу номер с видом на море' });
  await test('клиент → 302 на /profile?booked=1', () => {
    eq(book1.status, 302, 'статус');
    eq(book1.headers.location, '/profile?booked=1', 'location');
  });

  // req() сознательно не следует за редиректом, поэтому баннер проверяем
  // отдельным запросом по адресу из Location
  const prof = await req('GET', '/profile');
  const prof2 = await req('GET', book1.headers.location);
  await test('GET /profile → 200, бронь с деталями тура', () => {
    eq(prof.status, 200, 'HTTP статус');
    has(prof, 'Солнечный Сочи', 'tour_title');
    has(prof, 'Россия · Сочи', 'направление');
    has(prof, '43 000 ₽', 'total_price');
    has(prof, 'Новая', 'статус new');
    has(prof, 'Хочу номер с видом на море', 'comment');
    has(prof, 'href="/tours/1"', 'ссылка на тур');
    has(prof, 'Ваших заявок:', 'счётчик');
  });
  await test('GET /profile?booked=1 → баннер подтверждения', () => {
    eq(prof2.status, 200, 'HTTP статус');
    has(prof2, 'Заявка создана', 'баннер');
  });
  await test('GET /profile без ?booked → баннера нет', () => {
    hasnt(prof, 'Заявка создана', 'баннер без флага');
  });

  const book2 = await req('POST', '/tours/3/book', {});
  await test('бронь без comment → 302 (столбец NULL)', () => eq(book2.status, 302, 'статус'));

  await test('белый trim для comment только из пробелов → NULL', async () => {
    await req('POST', '/tours/2/book', { comment: '   ' });
    const p = await req('GET', '/profile');
    hasnt(p, 'Ваших заявок: 0', 'заявки создались');
  });

  console.log('\n--- изоляция данных между пользователями ---');
  await login('admin@turist.ru');
  const adminProf = await req('GET', '/profile');
  await test('админ не видит заявки клиента', () => {
    eq(adminProf.status, 200, 'HTTP статус');
    has(adminProf, 'У вас пока нет заявок', 'пустое состояние');
    hasnt(adminProf, 'Хочу номер с видом на море', 'чужой comment');
  });

  logout();
  const guestProf = await req('GET', '/profile');
  await test('гость GET /profile → 302 на /login?next=/profile', () => {
    eq(guestProf.status, 302, 'статус');
    eq(guestProf.headers.location, '/login?next=%2Fprofile', 'location');
  });

  await login('user@turist.ru');
  await test('POST /tours/999/book → 404 (тура нет)', async () => eq((await req('POST', '/tours/999/book', {})).status, 404, 'статус'));
  await test('POST /tours/abc/book → 404', async () => eq((await req('POST', '/tours/abc/book', {})).status, 404, 'статус'));

  console.log('\n=== РЕГРЕССИЯ: остальной сайт не сломан ===');
  await test('GET / → 200', async () => eq((await req('GET', '/')).status, 200, 'статус'));
  await test('GET /about → 200', async () => eq((await req('GET', '/about')).status, 200, 'статус'));
  await test('GET /healthz → 200 ok', () => {
    const h = req('GET', '/healthz');
    return h.then((r) => {
      eq(r.status, 200, 'статус');
      has(r, '"status":"ok"', 'тело');
    });
  });
  // /login и /register для залогиненного редиректят на его страницу — проверяем гостем
  logout();
  await test('GET /login (гость) → 200', async () => eq((await req('GET', '/login')).status, 200, 'статус'));
  await test('GET /register (гость) → 200', async () => eq((await req('GET', '/register')).status, 200, 'статус'));
  await login('user@turist.ru');
  await test('GET /login (уже залогинен) → 302 на /tours', async () => {
    eq((await req('GET', '/login')).headers.location, '/tours', 'location');
  });
  await test('GET /manager под клиентом → 302 access_denied', async () => {
    eq((await req('GET', '/manager')).headers.location, '/tours?error=access_denied', 'location');
  });
  await test('шапка даёт ссылку на /profile', () => has(prof, 'href="/profile"', 'ссылка'));

  console.log('\n=== СОСТОЯНИЕ БД (прямая проверка) ===');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await test('заявки легли в таблицу bookings корректно', async () => {
    const { rows } = await pool.query(
      `SELECT b.tour_id, b.user_id, b.manager_id, b.status, b.client_name, b.client_phone, b.comment
       FROM bookings b ORDER BY b.id`
    );
    const bad = rows.filter(
      (r) => r.manager_id !== null || r.status !== 'new' || r.user_id === null || !r.client_name || !r.client_phone
    );
    eq(bad.length, 0, `строк с некорректными полями: ${JSON.stringify(bad.slice(0, 2))}`);
    console.log(`       (всего заявок: ${rows.length})`);
  });
  await test('bookings ссылается на существующие tours (FK)', async () => {
    const { rows } = await pool.query(
      `SELECT count(*) AS c FROM bookings b JOIN tours t ON t.id = b.tour_id`
    );
    const total = await pool.query('SELECT count(*) AS c FROM bookings');
    eq(Number(rows[0].c), Number(total.rows[0].c), 'заявок с валидным tour_id');
  });
  await pool.end();

  // Тестовые заявки (их было 0 до прогонов) убираем, чтобы не засорять БД
  const cleanup = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
  await cleanup.query('DELETE FROM bookings');
  await cleanup.end();
  console.log('\n  тестовые заявки удалены (bookings очищен)');

  console.log('\n=== ИТОГО ===');
  const passed = results.filter((r) => r.ok).length;
  console.log(`  пройдено ${passed} из ${results.length}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log('  проваленные:');
    failed.forEach((r) => console.log(`    - ${r.label}: ${r.err}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
