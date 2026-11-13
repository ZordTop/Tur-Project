// ============================================================================
// db/seed.js — наполняет пустую базу тестовыми данными
// ============================================================================
//
// Что делает: добавляет 3 пользователей (админ, менеджер, обычный клиент)
// и 5 туров, чтобы сайт было на чём посмотреть сразу после создания таблиц.
//
// Как запускать:  node db/seed.js   (или npm run db:seed)
// Порядок важен: сначала db/init.js (появятся таблицы) → потом этот файл
// (в них появятся строки). Сервер его не вызывает — запуск руками.
//
// Пароль у всех трёх тестовых аккаунтов один: TestPass123!
//
// «Seed» — устоявшееся название стартовых данных (от английского «сеять»).

const pool = require('./pool');       // общее соединение с базой (см. pool.js)
const bcrypt = require('bcryptjs');   // библиотека для хэширования паролей

async function seed() {
  // ─── Шаг 1. Защита от повторного запуска ───
  // Считаем, сколько строк уже лежит в tours. Если больше нуля — база
  // заполнена, и мы выходим, чтобы не создавать дубликаты.
  // Запись { rows: toursCount } берёт из ответа поле rows и называет его toursCount.
  const { rows: toursCount } = await pool.query('SELECT count(*) FROM tours');
  // count(*) возвращается строкой ('5'), поэтому parseInt делает из неё число.
  if (parseInt(toursCount[0].count) > 0) {
    console.log('⚠️  В таблице tours уже есть данные. Пропускаем seed.');
    return;
  }

  // ─── Шаг 2. Готовим хэш пароля ───
  // Сам пароль в базу не попадает — только его хэш (строка вида
  // $2a$10$N9qo8uLO...). bcrypt работает в одну сторону: по хэшу пароль
  // не восстановить. При входе сверяем через bcrypt.compare(ввод, хэш).
  // Число 10 — «сложность»: больше = медленнее и безопаснее.
  const password = 'TestPass123!';
  const hashedPassword = bcrypt.hashSync(password, 10);

  // ─── Шаг 3. Тестовые пользователи ───
  // Три роли нужны, чтобы проверить доступ: /admin, /manager и обычный каталог.
  const users = [
    {
      email: 'admin@turist.ru',
      full_name: 'Администратор Системы',
      phone: '+7-900-000-00-01',
      role: 'admin',
    },
    {
      email: 'manager@turist.ru',
      full_name: 'Иван Менеджеров',
      phone: '+7-900-000-00-02',
      role: 'manager',
    },
    {
      email: 'user@turist.ru',
      full_name: 'Алексей Туристов',
      phone: '+7-900-000-00-03',
      role: 'user',
    },
  ];

  // Текст запроса с $1, $2... — это «места» под значения, а сами значения
  // передаём отдельно вторым аргументом (см. pool.query ниже). База считает
  // их данными, а не кодом — это защита от SQL-инъекций.
  // ON CONFLICT (email) DO NOTHING: если такой email уже есть, строка
  // пропускается без ошибки (помогает при частичном повторном запуске).
  const insertUserSQL = `
    INSERT INTO users (email, password_hash, full_name, phone, role)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (email) DO NOTHING
  `;

  // for...of перебирает массив по элементу. await внутри заставляет вставки
  // идти по очереди: первая завершилась — только тогда началась вторая.
  for (const u of users) {
    // Массив подставляется в $1..$5 по порядку
    await pool.query(insertUserSQL, [u.email, hashedPassword, u.full_name, u.phone, u.role]);
    console.log(`✅ Создан пользователь: ${u.email} [${u.role}]`);
  }

  // ─── Шаг 4. Пять тестовых туров ───
  // Набор полей повторяет таблицу tours из db/init.js.
  // total_price нигде не «магическая цифра» — она складывается из трёх цен,
  // поэтому в тестовых данных итог всегда сходится с составными частями.
  const tours = [
    {
      title: 'Солнечный Сочи: всё включено',
      country: 'Россия',
      city: 'Сочи',
      nights: 7,
      rating: 4.7,
      image: '/images/tour-sochi.jpg',
      description: 'Неделя на черноморском побережье: пляжи, канатная дорога на Красную Поляну и прогулки по Олимпийскому парку.',
      flight_info: 'Москва → Сочи, 2ч 40мин, прямой',
      flight_price: 8500,
      hotel_name: 'Жемчужина моря',
      hotel_stars: 4,
      hotel_info: '300 м до моря, завтраки включены',
      hotel_price: 32000,
      transfer_info: 'Индивидуальный трансфер аэропорт–отель',
      transfer_price: 2500,
      total_price: 8500 + 32000 + 2500,
      is_active: true,
    },
    {
      title: 'Стамбул: две части света',
      country: 'Турция',
      city: 'Стамбул',
      nights: 5,
      rating: 4.8,
      image: '/images/tour-istanbul.jpg',
      description: 'Айя-София, Голубая мечеть, Гранд-базар и прогулка по Босфору на закате.',
      flight_info: 'Москва → Стамбул, 3ч 30мин, прямой',
      flight_price: 15000,
      hotel_name: 'Golden Horn Palace',
      hotel_stars: 4,
      hotel_info: 'Район Султанахмет, завтраки шведский стол',
      hotel_price: 28000,
      transfer_info: 'Групповой трансфер аэропорт–отель',
      transfer_price: 3000,
      total_price: 15000 + 28000 + 3000,
      is_active: true,
    },
    {
      title: 'Прага: сказка на Влтаве',
      country: 'Чехия',
      city: 'Прага',
      nights: 6,
      rating: 4.6,
      image: '/images/tour-prague.jpg',
      description: 'Карлов мост на рассвете, Пражский град, Староместская площадь и дегустация чешского пива.',
      flight_info: 'Москва → Прага, 3ч 10мин, прямой',
      flight_price: 18000,
      hotel_name: 'Prague Castle View',
      hotel_stars: 3,
      hotel_info: '10 мин пешком до Староместской площади',
      hotel_price: 22000,
      transfer_info: 'Трансфер аэропорт–отель с табличкой',
      transfer_price: 4000,
      total_price: 18000 + 22000 + 4000,
      is_active: true,
    },
    {
      title: 'Стамбул: экзотика и роскошь',
      country: 'Турция',
      city: 'Анталья',
      nights: 10,
      rating: 4.9,
      image: '/images/tour-antalya.jpg',
      description: 'Пляжный отдых пятизвёздочного уровня: собственный пляж, аквапарк и SPA-центр.',
      flight_info: 'Москва → Анталья, 4ч 10мин, прямой',
      flight_price: 12000,
      hotel_name: 'Rixos Premium',
      hotel_stars: 5,
      hotel_info: 'Первая линия, Ultra All Inclusive',
      hotel_price: 65000,
      transfer_info: 'VIP-трансфер аэропорт–отель',
      transfer_price: 5000,
      total_price: 12000 + 65000 + 5000,
      is_active: true,
    },
    {
      title: 'Санкт-Петербург: белые ночи',
      country: 'Россия',
      city: 'Санкт-Петербург',
      nights: 4,
      rating: 4.5,
      image: '/images/tour-spb.jpg',
      description: 'Эрмитаж, Петергоф, прогулка по Невскому проспекту и разводные мосты.',
      flight_info: 'Москва → Санкт-Петербург, 1ч 25мин, прямой',
      flight_price: 5500,
      hotel_name: 'Националь',
      hotel_stars: 4,
      hotel_info: 'Центр, 5 мин до Невского проспекта',
      hotel_price: 24000,
      transfer_info: 'Трансфер ж/д вокзал–отель',
      transfer_price: 2000,
      total_price: 5500 + 24000 + 2000,
      is_active: true,
    },
  ];

  // Тот же принцип, что и с пользователями: 17 колонок = 17 мест $1..$17
  const insertTourSQL = `
    INSERT INTO tours (
      title, country, city, nights, rating, image, description,
      flight_info, flight_price, hotel_name, hotel_stars, hotel_info,
      hotel_price, transfer_info, transfer_price, total_price, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
  `;

  for (const t of tours) {
    // Порядок значений в массиве обязан совпадать с порядком $1..$17 выше,
    // иначе данные встанут не в те колонки.
    await pool.query(insertTourSQL, [
      t.title, t.country, t.city, t.nights, t.rating, t.image, t.description,
      t.flight_info, t.flight_price, t.hotel_name, t.hotel_stars, t.hotel_info,
      t.hotel_price, t.transfer_info, t.transfer_price, t.total_price, t.is_active,
    ]);
    console.log(`✅ Создан тур: ${t.title}`);
  }

  console.log('🎉 Seed завершён!');
}

// seed() — async-функция, поэтому ошибка приходит не в try/catch, а в промис.
// .catch перехватывает её, печатает текст и завершает процесс с кодом 1,
// чтобы Docker или CI увидели: что-то пошло не так.
seed().catch((err) => {
  console.error('❌ Ошибка seed:', err.message);
  process.exit(1);
});
