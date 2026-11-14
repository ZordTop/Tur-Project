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
  // Набор полей повторяет таблицу tours из db/init.js (детализированная схема).
  // total_price = flight_price + hotel_price + transfer_price.
  // departure_at / arrival_at — будущие даты, чтобы туры были видны в поиске.
  const tours = [
    {
      title: 'Солнечный Сочи: всё включено',
      description: 'Неделя на черноморском побережье: пляжи, канатная дорога на Красную Поляну и прогулки по Олимпийскому парку.',
      image: '/images/tour-sochi.jpg',
      rating: 4.7,
      nights: 7,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Россия',
      destination_city: 'Сочи',
      departure_at: '2027-06-01 08:30',
      arrival_at: '2027-06-01 11:10',
      flight_duration: '2ч 40мин',
      flight_class: 'economy',
      flight_price: 8500,
      // Отель
      hotel_name: 'Жемчужина моря',
      hotel_stars: 4,
      hotel_meal: 'BB',
      hotel_price: 32000,
      // Трансфер
      transfer_type: 'private',
      transfer_price: 2500,
      total_price: 8500 + 32000 + 2500,
      is_active: true,
    },
    {
      title: 'Стамбул: две части света',
      description: 'Айя-София, Голубая мечеть, Гранд-базар и прогулка по Босфору на закате.',
      image: '/images/tour-istanbul.jpg',
      rating: 4.8,
      nights: 5,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Турция',
      destination_city: 'Стамбул',
      departure_at: '2027-06-10 09:00',
      arrival_at: '2027-06-10 12:30',
      flight_duration: '3ч 30мин',
      flight_class: 'economy',
      flight_price: 15000,
      // Отель
      hotel_name: 'Golden Horn Palace',
      hotel_stars: 4,
      hotel_meal: 'BB',
      hotel_price: 28000,
      // Трансфер
      transfer_type: 'bus',
      transfer_price: 3000,
      total_price: 15000 + 28000 + 3000,
      is_active: true,
    },
    {
      title: 'Прага: сказка на Влтаве',
      description: 'Карлов мост на рассвете, Пражский град, Староместская площадь и дегустация чешского пива.',
      image: '/images/tour-prague.jpg',
      rating: 4.6,
      nights: 6,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Чехия',
      destination_city: 'Прага',
      departure_at: '2027-07-05 06:20',
      arrival_at: '2027-07-05 09:30',
      flight_duration: '3ч 10мин',
      flight_class: 'comfort',
      flight_price: 18000,
      // Отель
      hotel_name: 'Prague Castle View',
      hotel_stars: 3,
      hotel_meal: 'RO',
      hotel_price: 22000,
      // Трансфер
      transfer_type: 'private',
      transfer_price: 4000,
      total_price: 18000 + 22000 + 4000,
      is_active: true,
    },
    {
      title: 'Анталья: экзотика и роскошь',
      description: 'Пляжный отдых пятизвёздочного уровня: собственный пляж, аквапарк и SPA-центр.',
      image: '/images/tour-antalya.jpg',
      rating: 4.9,
      nights: 10,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Турция',
      destination_city: 'Анталья',
      departure_at: '2027-07-15 05:50',
      arrival_at: '2027-07-15 10:00',
      flight_duration: '4ч 10мин',
      flight_class: 'business',
      flight_price: 12000,
      // Отель
      hotel_name: 'Rixos Premium',
      hotel_stars: 5,
      hotel_meal: 'AI',
      hotel_price: 65000,
      // Трансфер
      transfer_type: 'private',
      transfer_price: 5000,
      total_price: 12000 + 65000 + 5000,
      is_active: true,
    },
    {
      title: 'Санкт-Петербург: белые ночи',
      description: 'Эрмитаж, Петергоф, прогулка по Невскому проспекту и разводные мосты.',
      image: '/images/tour-spb.jpg',
      rating: 4.5,
      nights: 4,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Россия',
      destination_city: 'Санкт-Петербург',
      departure_at: '2027-06-20 10:00',
      arrival_at: '2027-06-20 11:25',
      flight_duration: '1ч 25мин',
      flight_class: 'economy',
      flight_price: 5500,
      // Отель
      hotel_name: 'Националь',
      hotel_stars: 4,
      hotel_meal: 'HB',
      hotel_price: 24000,
      // Трансфер
      transfer_type: 'bus',
      transfer_price: 2000,
      total_price: 5500 + 24000 + 2000,
      is_active: true,
    },
  ];

  // Тот же принцип, что и с пользователями: 18 колонок = 18 мест $1..$18
  const insertTourSQL = `
    INSERT INTO tours (
      title, description, image, rating, nights,
      departure_city, destination_country, destination_city,
      departure_at, arrival_at, flight_duration, flight_class, flight_price,
      hotel_name, hotel_stars, hotel_meal, hotel_price,
      transfer_type, transfer_price,
      total_price, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
  `;

  for (const t of tours) {
    // Порядок значений в массиве обязан совпадать с порядком $1..$21 выше
    await pool.query(insertTourSQL, [
      t.title, t.description, t.image, t.rating, t.nights,
      t.departure_city, t.destination_country, t.destination_city,
      t.departure_at, t.arrival_at, t.flight_duration, t.flight_class, t.flight_price,
      t.hotel_name, t.hotel_stars, t.hotel_meal, t.hotel_price,
      t.transfer_type, t.transfer_price,
      t.total_price, t.is_active,
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
