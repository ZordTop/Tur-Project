// Seed-данные: создаёт 3 тестовых пользователя и 5 туров.
// Пароли хэшируются через bcryptjs.
//
// Запуск:
//   docker compose exec app node db/seed.js
//   # или локально:
//   DATABASE_URL=postgres://tur:tur_pass@localhost:5432/tur_project npm run db:seed

const pool = require('./pool');
const bcrypt = require('bcryptjs');

async function seed() {
  // 1. Проверяем, не засеедана ли база уже (seed идемпотентен)
  const { rows: toursCount } = await pool.query('SELECT count(*) FROM tours');
  if (parseInt(toursCount[0].count) > 0) {
    console.log('⚠️  В таблице tours уже есть данные. Пропускаем seed.');
    return;
  }

  // 2. Пароли (один и тот же для всех тестовых пользователей)
  const password = 'TestPass123!';
  const hashedPassword = bcrypt.hashSync(password, 10);

  // 3. Вставляем пользователей (ON CONFLICT — на случай повторного запуска)
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

  const insertUserSQL = `
    INSERT INTO users (email, password_hash, full_name, phone, role)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (email) DO NOTHING
  `;

  for (const u of users) {
    await pool.query(insertUserSQL, [u.email, hashedPassword, u.full_name, u.phone, u.role]);
    console.log(`✅ Создан пользователь: ${u.email} [${u.role}]`);
  }

  // 4. Вставляем 5 туров
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

  const insertTourSQL = `
    INSERT INTO tours (
      title, country, city, nights, rating, image, description,
      flight_info, flight_price, hotel_name, hotel_stars, hotel_info,
      hotel_price, transfer_info, transfer_price, total_price, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
  `;

  for (const t of tours) {
    await pool.query(insertTourSQL, [
      t.title, t.country, t.city, t.nights, t.rating, t.image, t.description,
      t.flight_info, t.flight_price, t.hotel_name, t.hotel_stars, t.hotel_info,
      t.hotel_price, t.transfer_info, t.transfer_price, t.total_price, t.is_active,
    ]);
    console.log(`✅ Создан тур: ${t.title}`);
  }

  console.log('🎉 Seed завершён!');
}

seed().catch((err) => {
  console.error('❌ Ошибка seed:', err.message);
  process.exit(1);
});
