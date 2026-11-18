// ============================================================================
// db/seed.js — наполняет пустую базу тестовыми данными
// ============================================================================
//
// Что делает: добавляет 6 пользователей (1 admin, 2 manager, 3 user),
// 14 пакетных туров по разным странам и 18 тестовых заявок в CRM-базу
// туристов, чтобы сайт было на чём посмотреть сразу после создания таблиц.
//
// У всех тестовых заявок заполнен паспортный блок и проставлен единый
// образец скана — uploads/passports/demo-passport.jpg (см. ниже).

//
// Как запускать:  node db/seed.js   (или npm run db:seed)
// Порядок важен: сначала db/init.js (появятся таблицы) → потом этот файл
// (в них появятся строки). Сервер его не вызывает — запуск руками.
//
// Пароль у всех шести тестовых аккаунтов один: TestPass123!
//
// «Seed» — устоявшееся название стартовых данных (от английского «сеять»).

const fs = require('fs');             // копия образца паспорта в uploads/
const path = require('path');
const pool = require('./pool');       // общее соединение с базой (см. pool.js)
const bcrypt = require('bcryptjs');   // библиотека для хэширования паролей

// ============================================================================
// Образец паспорта для тестовых заявок
// ============================================================================
// Картинка-оригинал лежит в public/images, копия кладётся в uploads/passports —
// именно оттуда сканы раздаёт GET /clients/files/passports/:filename
// (routes/clients.js:70). В колонке passport_scan хранится только ИМЯ файла,
// поэтому в БД уходит 'demo-passport.jpg'.
//
// Колонка в db/init.js остаётся без DEFAULT (NULL): образец приклеивается
// ТОЛЬКО к строкам этого seed. Реальные заявки, созданные через формы
// бронирования, получают passport_scan из загруженного пользователем файла
// (middlewares/upload.js) либо NULL, если файл не прикреплён.
//
// DEMO_PASSPORT_CANDIDATES: в репозитории файл пока лежит как
// «demo-passport.jpg.jpg» (двойное расширение — артефакт загрузки).
// Первый существующий вариант считается актуальным, поэтому переименование
// файла в «demo-passport.jpg» seed не сломает.
const DEMO_PASSPORT_CANDIDATES = ['demo-passport.jpg.jpg', 'demo-passport.jpg'];
const DEMO_PASSPORT_NAME = 'demo-passport.jpg';
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const PASSPORTS_DIR = path.join(__dirname, '..', 'uploads', 'passports');

// Кладёт образец в uploads/passports. Возвращает имя файла для колонки
// passport_scan либо null — если картинки нет или папку не подготовить
// (тогда seed не пишет в БД ссылку на несуществующий файл).
function prepareDemoPassportScan() {
  const source = DEMO_PASSPORT_CANDIDATES
    .map((name) => path.join(IMAGES_DIR, name))
    .find((p) => fs.existsSync(p));

  if (!source) {
    console.warn(
      '⚠️  Образец паспорта не найден в public/images — ' +
      'тестовые заявки будут созданы без passport_scan.'
    );
    return null;
  }

  const target = path.join(PASSPORTS_DIR, DEMO_PASSPORT_NAME);

  try {
    fs.mkdirSync(PASSPORTS_DIR, { recursive: true });
    // Копируем только если файла нет или он отличается по размеру: повторный
    // запуск seed не перетирает содержимое без необходимости.
    if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) {
      fs.copyFileSync(source, target);
      console.log(`✅ Образец паспорта скопирован в uploads/passports/${DEMO_PASSPORT_NAME}`);
    } else {
      console.log(`ℹ️  uploads/passports/${DEMO_PASSPORT_NAME} уже на месте — пропускаем копирование.`);
    }
  } catch (err) {
    // Том uploads/ может быть только для чтения — не роняем весь seed.
    console.error(`⚠️  Не удалось подготовить uploads/passports: ${err.message}`);
    return null;
  }

  return DEMO_PASSPORT_NAME;
}


// ============================================================================
// Шаблоны изображений туров
// ============================================================================
// В public/images есть 14 реальных фото (.jpg/.webp) — используем их.
// 5 SVG-заглушек остаются в папке, но seed их не трогает.

const TOUR_IMAGES = [
  '/images/tour-sochi.jpg',
  '/images/tour-istanbul.jpg',
  '/images/tour-prague.jpg',
  '/images/tour-antalya.jpg',
  '/images/tour-spb.jpg',
  '/images/1.webp',
  '/images/2.jpg',
  '/images/4.jpg',
  '/images/5.jpg',
  '/images/6.webp',
  '/images/7.webp',
  '/images/8.jpg',
  '/images/9.jpg',
  '/images/luchshie_oteli_Karelii.jpg',
];

async function seed() {
  // ─── Шаг 1. Защита от повторного запуска ───
  // Пользователи вставляются с ON CONFLICT (email) и безопасны при повторе,
  // а туры и заявки проверяем ОТДЕЛЬНО: если прошлый запуск прервался после
  // вставки туров, заявки всё равно должны создаться.
  const { rows: toursCount } = await pool.query('SELECT count(*) FROM tours');
  // count(*) возвращается строкой ('5'), поэтому parseInt делает из неё число.
  const hasTours = parseInt(toursCount[0].count) > 0;
  if (hasTours) {
    console.log('⚠️  В таблице tours уже есть данные — туры пропускаем.');
  }

  // ─── Шаг 2. Готовим хэш пароля ───
  // Сам пароль в базу не попадает — только его хэш (строка вида
  // $2a$10$N9qo8uLO...). bcrypt работает в одну сторону: по хэшу пароль
  // не восстановить. При входе сверяем через bcrypt.compare(ввод, хэш).
  // Число 10 — «сложность»: больше = медленнее и безопаснее.
  const password = 'TestPass123!';
  const hashedPassword = bcrypt.hashSync(password, 10);

  // ─── Шаг 3. Тестовые пользователи ─────────────────────────────────────────
  // 1 admin, 2 manager, 3 user — чтобы проверить все роли и доступы.
  // Телефон в нормализованном виде (11 цифр), как требует validatePhone.
  const users = [
    {
      email: 'admin@turist.ru',
      full_name: 'Администратор Системы',
      phone: '79000000001',
      role: 'admin',
    },
    {
      email: 'manager@turist.ru',
      full_name: 'Иван Менеджеров',
      phone: '79000000002',
      role: 'manager',
    },
    {
      email: 'manager2@turist.ru',
      full_name: 'Мария Продажева',
      phone: '79000000003',
      role: 'manager',
    },
    {
      email: 'user@turist.ru',
      full_name: 'Алексей Туристов',
      phone: '79000000004',
      role: 'user',
    },
    {
      email: 'user2@turist.ru',
      full_name: 'Ольга Отдыхаева',
      phone: '79000000005',
      role: 'user',
    },
    {
      email: 'user3@turist.ru',
      full_name: 'Пётр Путешественников',
      phone: '79000000006',
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
    // Массив подставляется в $1..$5 по порядку.
    // rowCount = 0, если email уже был (ON CONFLICT DO NOTHING) — так лог
    // не выдаёт существующего пользователя за только что созданного.
    const result = await pool.query(insertUserSQL, [u.email, hashedPassword, u.full_name, u.phone, u.role]);
    console.log(
      result.rowCount
        ? `✅ Создан пользователь: ${u.email} [${u.role}]`
        : `ℹ️  Пользователь уже существует: ${u.email}`
    );
  }

  // ─── Шаг 4. Четырнадцать тестовых туров ───────────────────────────────────
  // Набор полей повторяет таблицу tours из db/init.js (детализированная схема).
  // total_price = flight_price + hotel_price + transfer_price.
  // Разные страны, бюджеты (25 000 — 250 000 ₽), звёздность 2–5*, все типы
  // питания (RO/BB/HB/AI), все классы перелёта и оба типа трансфера — чтобы
  // была возможность проверить каждый фильтр каталога и кнопку «Показать ещё».
  // departure_at / arrival_at — будущие даты, чтобы туры были видны в поиске.
  const tours = [
    {
      title: 'Солнечный Сочи: всё включено',
      description: 'Неделя на черноморском побережье: пляжи, канатная дорога на Красную Поляну и прогулки по Олимпийскому парку.',
      image: TOUR_IMAGES[0],
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
      image: TOUR_IMAGES[1],
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
      image: TOUR_IMAGES[2],
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
      image: TOUR_IMAGES[3],
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
      image: TOUR_IMAGES[4],
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
    {
      title: 'Дубай: город будущего',
      description: 'Бурдж-Халифа, Дубай-Молл, сафари в пустыне и вечернее шоу у фонтанов.',
      image: TOUR_IMAGES[5],
      rating: 4.9,
      nights: 7,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'ОАЭ',
      destination_city: 'Дубай',
      departure_at: '2027-08-01 02:00',
      arrival_at: '2027-08-01 09:30',
      flight_duration: '5ч 30мин',
      flight_class: 'business',
      flight_price: 45000,
      // Отель
      hotel_name: 'Atlantis The Palm',
      hotel_stars: 5,
      hotel_meal: 'BB',
      hotel_price: 95000,
      // Трансфер
      transfer_type: 'private',
      transfer_price: 8000,
      total_price: 45000 + 95000 + 8000,
      is_active: true,
    },
    {
      title: 'Хургада: дары Красного моря',
      description: 'Дайвинг к коралловым рифам, виндсёрфинг и экскурсия в Луксор.',
      image: TOUR_IMAGES[6],
      rating: 4.3,
      nights: 10,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Египет',
      destination_city: 'Хургада',
      departure_at: '2027-08-15 06:00',
      arrival_at: '2027-08-15 12:00',
      flight_duration: '6ч',
      flight_class: 'economy',
      flight_price: 28000,
      // Отель
      hotel_name: 'Marriott Beach Resort',
      hotel_stars: 5,
      hotel_meal: 'AI',
      hotel_price: 34000,
      // Трансфер
      transfer_type: 'bus',
      transfer_price: 3000,
      total_price: 28000 + 34000 + 3000,
      is_active: true,
    },
    {
      title: 'Пхукет: жемчужина Сиам',
      description: 'Пляжи Пхукет-Таун, храм Ват Чалонг, острова Пхи-Пхи и тайская кухня.',
      image: TOUR_IMAGES[7],
      rating: 4.7,
      nights: 11,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Таиланд',
      destination_city: 'Пхукет',
      departure_at: '2027-11-01 00:30',
      arrival_at: '2027-11-01 17:00',
      flight_duration: '10ч 30мин',
      flight_class: 'comfort',
      flight_price: 52000,
      // Отель
      hotel_name: 'Banyan Tree Phuket',
      hotel_stars: 5,
      hotel_meal: 'HB',
      hotel_price: 78000,
      // Трансфер
      transfer_type: 'private',
      transfer_price: 6000,
      total_price: 52000 + 78000 + 6000,
      is_active: true,
    },
    {
      title: 'Мальдивы: атолл мечты',
      description: 'Виллы на воде, снорклинг с мантами и уединённый отдых на океане.',
      image: TOUR_IMAGES[12],
      rating: 5.0,
      nights: 7,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Мальдивы',
      destination_city: 'Мале',
      departure_at: '2027-09-01 01:00',
      arrival_at: '2027-09-01 14:00',
      flight_duration: '9ч',
      flight_class: 'business',
      flight_price: 70000,
      // Отель
      hotel_name: 'Conrad Maldives Rangali',
      hotel_stars: 5,
      hotel_meal: 'AI',
      hotel_price: 165000,
      // Трансфер
      transfer_type: 'private',
      transfer_price: 15000,
      total_price: 70000 + 165000 + 15000,
      is_active: true,
    },
    {
      title: 'Сухум: гостеприимная Абхазия',
      description: 'Галерный пляж, Новый Афон, озеро Рица и абхазское гостеприимство.',
      image: TOUR_IMAGES[8],
      rating: 4.1,
      nights: 7,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Абхазия',
      destination_city: 'Сухум',
      departure_at: '2027-07-20 07:00',
      arrival_at: '2027-07-20 10:30',
      flight_duration: '3ч 30мин',
      flight_class: 'economy',
      flight_price: 9000,
      // Отель
      hotel_name: 'Айтар',
      hotel_stars: 3,
      hotel_meal: 'BB',
      hotel_price: 16000,
      // Трансфер
      transfer_type: 'bus',
      transfer_price: 1500,
      total_price: 9000 + 16000 + 1500,
      is_active: true,
    },
    {
      title: 'Ереван: колыбель вина',
      description: 'Каскад, Коньячный завод, храм Гарни и озеро Севан.',
      image: TOUR_IMAGES[9],
      rating: 4.4,
      nights: 5,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Армения',
      destination_city: 'Ереван',
      departure_at: '2027-06-25 09:00',
      arrival_at: '2027-06-25 11:30',
      flight_duration: '3ч',
      flight_class: 'economy',
      flight_price: 14000,
      // Отель
      hotel_name: 'Alexander Hotels',
      hotel_stars: 4,
      hotel_meal: 'RO',
      hotel_price: 13000,
      // Трансфер
      transfer_type: 'private',
      transfer_price: 2000,
      total_price: 14000 + 13000 + 2000,
      is_active: true,
    },
    {
      title: 'Карелия: суровый север',
      description: 'Кижи, Валаам, водопады Кивач и настоящие северные леса.',
      image: TOUR_IMAGES[13],
      rating: 4.2,
      nights: 4,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Россия',
      destination_city: 'Петрозаводск',
      departure_at: '2027-08-10 06:00',
      arrival_at: '2027-08-10 07:40',
      flight_duration: '1ч 40мин',
      flight_class: 'economy',
      flight_price: 7000,
      // Отель
      hotel_name: 'Точма Тур Парк',
      hotel_stars: 2,
      hotel_meal: 'RO',
      hotel_price: 17000,
      // Трансфер
      transfer_type: 'bus',
      transfer_price: 3000,
      total_price: 7000 + 17000 + 3000,
      is_active: true,
    },
    {
      title: 'Казань: третья столица',
      description: 'Кремль, мечеть Кул-Шариф, улица Баумана и татарская гастрономия.',
      image: TOUR_IMAGES[10],
      rating: 4.6,
      nights: 3,
      // Перелёт
      departure_city: 'Санкт-Петербург',
      destination_country: 'Россия',
      destination_city: 'Казань',
      departure_at: '2027-06-15 10:00',
      arrival_at: '2027-06-15 12:00',
      flight_duration: '2ч',
      flight_class: 'economy',
      flight_price: 6500,
      // Отель
      hotel_name: 'Ramada Kazan',
      hotel_stars: 4,
      hotel_meal: 'BB',
      hotel_price: 17000,
      // Трансфер
      transfer_type: 'bus',
      transfer_price: 1500,
      total_price: 6500 + 17000 + 1500,
      is_active: true,
    },
    {
      title: 'Баку: восточный колорит',
      description: 'Старый город Ичери-шехер, Пламенные башни и каспийское побережье.',
      image: TOUR_IMAGES[11],
      rating: 4.3,
      nights: 6,
      // Перелёт
      departure_city: 'Москва',
      destination_country: 'Азербайджан',
      destination_city: 'Баку',
      departure_at: '2027-07-25 08:00',
      arrival_at: '2027-07-25 12:00',
      flight_duration: '4ч',
      flight_class: 'comfort',
      flight_price: 16000,
      // Отель
      hotel_name: 'Fairmont Baku',
      hotel_stars: 5,
      hotel_meal: 'HB',
      hotel_price: 27000,
      // Трансфер
      transfer_type: 'private',
      transfer_price: 5000,
      total_price: 16000 + 27000 + 5000,
      is_active: true,
    },
  ];

  // Текст запроса с $1, $2... — это «места» под значения, а сами значения
  // передаём отдельно вторым аргументом (см. pool.query ниже). База считает
  // их данными, а не кодом — это защита от SQL-инъекций.
  // 21 колонка = 21 место $1..$21
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

  for (const t of (hasTours ? [] : tours)) {
    // Порядок значений в массиве обязан совпадать с порядком $1..$21 выше
    await pool.query(insertTourSQL, [
      t.title, t.description, t.image, t.rating, t.nights,
      t.departure_city, t.destination_country, t.destination_city,
      t.departure_at, t.arrival_at, t.flight_duration, t.flight_class, t.flight_price,
      t.hotel_name, t.hotel_stars, t.hotel_meal, t.hotel_price,
      t.transfer_type, t.transfer_price,
      t.total_price, t.is_active,
    ]);
    console.log(`✅ Создан тур: ${t.title} (${t.total_price.toLocaleString('ru-RU')} ₽)`);
  }

  // ─── Шаг 5. Восемнадцать тестовых заявок ──────────────────────────────────
  // Часть заведена клиентами самостоятельно (user_id заполнен, manager_id = NULL),
  // часть оформлена менеджерами (manager_id заполнен, user_id = NULL) — ровно
  // как описано в п. 3 DATA_CONTRACT.md.
  //
  // Паспортные данные соответствуют колонкам bookings:
  //   birth_date             — дата в прошлом (валидный возраст);
  //   passport_series_number — 10 цифр (4 серии + 6 номера);
  //   passport_issued_by     — кем выдан;
  //   passport_expires_at    — дата в будущем (паспорт не просрочен).
  //
  // client_photo остаётся NULL (фото турист не присылал), а passport_scan у
  // ВСЕХ тестовых заявок получает имя demo-passport.jpg — тогда в CRM видно
  // и зелёный бейдж «Паспорт прикреплён», и сам скан в досье.


  // Не завязываемся на порядок автоинкремента: берём id из БД по email/title.
  const { rows: savedUsers } = await pool.query(
    'SELECT id, email FROM users WHERE email = ANY($1)',
    [users.map((u) => u.email)]
  );
  const userIdBy = new Map(savedUsers.map((u) => [u.email, Number(u.id)]));

  const { rows: savedTours } = await pool.query('SELECT id, title FROM tours');
  const tourIdBy = new Map(savedTours.map((t) => [t.title, Number(t.id)]));

  // ─── Дозаполнение тестовых заявок ─────────────────────────────────────────
  // Старый подход: «если bookings не пуста — пропустить целиком».
  // Новый:
  //   1) Помечаем уже существующие заявки по ключу «телефон|тур_id» — так
  //      повторный запуск не заводит дубли уже созданных клиентов.
  //   2) Если заявок меньше MIN_SEED_BOOKINGS (или база пустая) — дозаполняем
  //      ВСЕ недостающие строки набора (итого 18), иначе в CRM осталось бы
  //      ровно 15 карточек из 18 заготовленных.
  //   3) Если заявок уже 15+ — ничего не добавляем, только чиним passport_scan.
  //   4) После вставок проставляем demo-passport.jpg у тестовых заявок,
  //      у которых passport_scan = NULL.
  //
  // Ограничиваем backfill только телефонами из нашего набора (client_phone
  // = ANY($2::text[])) — так мы не затронем реальные заявки, если они есть.

  const MIN_SEED_BOOKINGS = 15;
  const { rows: bookingsCountRaw } = await pool.query('SELECT count(*)::int AS cnt FROM bookings');
  const existingCount = Number(bookingsCountRaw[0].cnt);
  const needTopUp = existingCount < MIN_SEED_BOOKINGS;

  const { rows: existingRows } = await pool.query(
    'SELECT client_phone, tour_id FROM bookings'
  );
  const existingKeys = new Set(
    existingRows.map((r) => `${r.client_phone}|${r.tour_id}`)
  );
  let total = existingCount;
  let skippedExisting = 0;
  let skippedFull = 0;
  let insertedNew = 0;

  if (needTopUp) {
    console.log(
      `ℹ️  Заявок в базе: ${existingCount} (меньше ${MIN_SEED_BOOKINGS}) — ` +
      'дозаполняем недостающие тестовые заявки.'
    );
  } else {
    console.log(
      `ℹ️  Заявок в базе: ${existingCount} (достаточно) — новые не добавляем, ` +
      'проверяем только passport_scan.'
    );
  }

  // Заполняем образец паспорта: копируем в uploads/passports.
  // Если копия не удалась — passport_scan = null (не роняем seed).
  const demoScan = prepareDemoPassportScan();



  // Набор: 18 заявок, покрывающие все 14 туров каталога.
  //   статусы    — 7 new / 7 confirmed / 4 cancelled;
  //   оформление — 9 самостоятельных броней (user_id) и 9 через менеджеров;
  //   телефоны и паспорта уникальны, сроки действия паспортов — в будущем.
  const bookings = [
    {
      // Клиент бронировал сам
      tour_title: 'Солнечный Сочи: всё включено',
      user_email: 'user@turist.ru',
      manager_email: null,
      client_name: 'Алексей Туристов',
      client_phone: '79000000004',
      birth_date: '1990-05-15',
      passport_series_number: '4510123456',
      passport_issued_by: 'ОВД района Хамовники г. Москвы',
      passport_expires_at: '2030-06-20',
      comment: 'Хочу номер с видом на море, повыше этаж.',
      status: 'confirmed',
    },
    {
      // Клиент бронировал сам
      tour_title: 'Анталья: экзотика и роскошь',
      user_email: 'user2@turist.ru',
      manager_email: null,
      client_name: 'Ольга Отдыхаева',
      client_phone: '79000000005',
      birth_date: '1985-11-22',
      passport_series_number: '4215678901',
      passport_issued_by: 'УМВД по Краснодарскому краю',
      passport_expires_at: '2029-12-31',
      comment: 'Нужна детская кроватка, питание «всё включено».',
      status: 'new',
    },
    {
      // Оформил менеджер — клиента в системе нет
      tour_title: 'Дубай: город будущего',
      user_email: null,
      manager_email: 'manager@turist.ru',
      client_name: 'Игорь Смирнов',
      client_phone: '79001234567',
      birth_date: '1978-03-10',
      passport_series_number: '4020987654',
      passport_issued_by: 'УФМС по г. Санкт-Петербургу и Ленинградской области',
      passport_expires_at: '2031-01-15',
      comment: 'Бизнес-поездка, нужен ранний заезд и счёт на организацию.',
      status: 'new',
    },
    {
      // Оформил менеджер, затем клиент отменил
      tour_title: 'Стамбул: две части света',
      user_email: null,
      manager_email: 'manager2@turist.ru',
      client_name: 'Елена Кузнецова',
      client_phone: '79007654321',
      birth_date: '1995-08-03',
      passport_series_number: '4408765432',
      passport_issued_by: 'ОВД Нижегородского района г. Нижнего Новгорода',
      passport_expires_at: '2032-04-10',
      comment: 'Заявка отменена по инициативе клиента (изменились даты).',
      status: 'cancelled',
    },
    {
      // Клиент бронировал сам
      tour_title: 'Прага: сказка на Влтаве',
      user_email: 'user3@turist.ru',
      manager_email: null,
      client_name: 'Пётр Путешественников',
      client_phone: '79000000006',
      birth_date: '1992-12-25',
      passport_series_number: '4612345678',
      passport_issued_by: 'ОВД Центрального района г. Новосибирска',
      passport_expires_at: '2033-02-14',
      comment: '',
      status: 'new',
    },
    {
      tour_title: 'Хургада: дары Красного моря',
      user_email: 'user2@turist.ru',
      manager_email: null,
      client_name: 'Светлана Морозова',
      client_phone: '79161234578',
      birth_date: '1988-07-19',
      passport_series_number: '4509654321',
      passport_issued_by: 'ОВД района Басманный г. Москвы',
      passport_expires_at: '2030-09-05',
      comment: 'Интересует дайвинг-пакет, едем вдвоём с мужем.',
      status: 'confirmed',
    },
    {
      tour_title: 'Пхукет: жемчужина Сиам',
      user_email: null,
      manager_email: 'manager@turist.ru',
      client_name: 'Андрей Лебедев',
      client_phone: '79214567890',
      birth_date: '1981-02-14',
      passport_series_number: '6207112233',
      passport_issued_by: 'УФМС по Выборгскому району Ленинградской области',
      passport_expires_at: '2031-03-22',
      comment: 'Просил взять отель closer к аэропорту, прилёт ранний.',
      status: 'new',
    },
    {
      tour_title: 'Мальдивы: атолл мечты',
      user_email: null,
      manager_email: 'manager2@turist.ru',
      client_name: 'Наталья Соколова',
      client_phone: '79032345678',
      birth_date: '1979-06-30',
      passport_series_number: '4508554433',
      passport_issued_by: 'УВД по г. Москве',
      passport_expires_at: '2029-08-17',
      comment: 'Годовщина свадьбы, нужна вилла на воде с ужином на пляже.',
      status: 'confirmed',
    },
    {
      tour_title: 'Санкт-Петербург: белые ночи',
      user_email: null,
      manager_email: 'manager@turist.ru',
      client_name: 'Дмитрий Волков',
      client_phone: '79853456789',
      birth_date: '1998-10-05',
      passport_series_number: '4511876543',
      passport_issued_by: 'ОВД района Тропарёво-Никулино г. Москвы',
      passport_expires_at: '2034-11-20',
      comment: 'Нужны места в центре, заселение после 14:00.',
      status: 'new',
    },
    {
      tour_title: 'Казань: третья столица',
      user_email: 'user3@turist.ru',
      manager_email: null,
      client_name: 'Екатерина Титова',
      client_phone: '79175566778',
      birth_date: '1993-04-27',
      passport_series_number: '4513223344',
      passport_issued_by: 'УФМС по Республике Татарстан',
      passport_expires_at: '2032-05-09',
      comment: 'Отменила: не совпали даты сессии.',
      status: 'cancelled',
    },
    {
      tour_title: 'Ереван: колыбель вина',
      user_email: null,
      manager_email: 'manager@turist.ru',
      client_name: 'Сергей Панкратов',
      client_phone: '79266789012',
      birth_date: '1966-12-08',
      passport_series_number: '4514998877',
      passport_issued_by: 'ОВД Приморского района г. Санкт-Петербурга',
      passport_expires_at: '2028-01-30',
      comment: 'Просил программу дегустаций и места у окна в самолёте.',
      status: 'confirmed',
    },
    {
      tour_title: 'Сухум: гостеприимная Абхазия',
      user_email: null,
      manager_email: 'manager2@turist.ru',
      client_name: 'Ирина Фёдорова',
      client_phone: '79517890123',
      birth_date: '1987-09-13',
      passport_series_number: '4515443322',
      passport_issued_by: 'УМВД России по Ростовской области',
      passport_expires_at: '2033-10-01',
      comment: 'Едем с ребёнком 6 лет, нужен второй билет на трансфер.',
      status: 'new',
    },
    {
      tour_title: 'Баку: восточный колорит',
      user_email: 'user@turist.ru',
      manager_email: null,
      client_name: 'Максим Новиков',
      client_phone: '79628901234',
      birth_date: '2001-01-21',
      passport_series_number: '4516556677',
      passport_issued_by: 'ОВД района Марьино г. Москвы',
      passport_expires_at: '2035-02-15',
      comment: '',
      status: 'confirmed',
    },
    {
      tour_title: 'Прага: сказка на Влтаве',
      user_email: null,
      manager_email: 'manager2@turist.ru',
      client_name: 'Вера Климова',
      client_phone: '79779012345',
      birth_date: '1972-03-17',
      passport_series_number: '4517667788',
      passport_issued_by: 'УФМС по Свердловской области',
      passport_expires_at: '2030-04-26',
      comment: 'Отмена: отказ в визе.',
      status: 'cancelled',
    },
    {
      tour_title: 'Карелия: суровый север',
      user_email: 'user2@turist.ru',
      manager_email: null,
      client_name: 'Артём Гусев',
      client_phone: '79050123456',
      birth_date: '1996-11-02',
      passport_series_number: '4518778899',
      passport_issued_by: 'ОВД района Химки Московской области',
      passport_expires_at: '2034-12-19',
      comment: 'Нужно место в автобусе у окна, укачивает.',
      status: 'new',
    },
    {
      tour_title: 'Санкт-Петербург: белые ночи',
      user_email: null,
      manager_email: 'manager@turist.ru',
      client_name: 'Юлия Захарова',
      client_phone: '79111234567',
      birth_date: '1990-08-25',
      passport_series_number: '4519889900',
      passport_issued_by: 'УМВД России по г. Казани',
      passport_expires_at: '2031-09-12',
      comment: 'Корпоративная поездка, счёт на ООО «Ромашка».',
      status: 'confirmed',
    },
    {
      tour_title: 'Дубай: город будущего',
      user_email: null,
      manager_email: 'manager2@turist.ru',
      client_name: 'Роман Белов',
      client_phone: '79992345678',
      birth_date: '1984-05-11',
      passport_series_number: '4520990011',
      passport_issued_by: 'ОВД района Академический г. Москвы',
      passport_expires_at: '2029-06-28',
      comment: 'Отменена клиентом за неделю до вылета.',
      status: 'cancelled',
    },
    {
      tour_title: 'Анталья: экзотика и роскошь',
      user_email: 'user3@turist.ru',
      manager_email: null,
      client_name: 'Татьяна Орлова',
      client_phone: '79143456789',
      birth_date: '1969-07-04',
      passport_series_number: '4521102938',
      passport_issued_by: 'УФМС по Калининградской области',
      passport_expires_at: '2032-08-23',
      comment: 'Прошу SPA-пакет и поздний выезд.',
      status: 'confirmed',
    },
  ];


  // 12 колонок = 12 мест $1..$12 (passport_scan — последним).
  const insertBookingSQL = `
    INSERT INTO bookings (
      tour_id, user_id, manager_id,
      client_name, client_phone, comment, status,
      birth_date, passport_series_number, passport_issued_by, passport_expires_at,
      passport_scan
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;

  for (const b of bookings) {
    const tourId = tourIdBy.get(b.tour_title);
    const userId = b.user_email ? userIdBy.get(b.user_email) : null;
    const managerId = b.manager_email ? userIdBy.get(b.manager_email) : null;

    // Тур с таким названием мог быть удалён/переименован — не роняем seed.
    if (!tourId) {
      console.log(`⚠️  Заявка ${b.client_name} пропущена: тур «${b.tour_title}» не найден.`);
      continue;
    }

    // Заявка этого клиента на этот тур уже есть — не дублируем.
    const key = `${b.client_phone}|${tourId}`;
    if (existingKeys.has(key)) {
      skippedExisting++;
      continue;
    }

    // Если база уже содержит достаточно заявок — ничего не добавляем,
    // только чиним passport_scan. Если нужно дозаполнить — вставляем
    // все недостающие из набора (до 18 в сумме).
    if (!needTopUp) {
      skippedFull++;
      continue;
    }

    await pool.query(insertBookingSQL, [
      tourId, userId, managerId,
      b.client_name, b.client_phone, b.comment || null, b.status,
      b.birth_date, b.passport_series_number, b.passport_issued_by, b.passport_expires_at,
      demoScan, // имя файла-образца или null, если копия не удалась
    ]);
    existingKeys.add(key);
    total++;
    insertedNew++;
    console.log(`✅ Заявка [${b.status}]: ${b.client_name} → ${b.tour_title}`);
  }

  // ─── Шаг 6. Проставляем образец скана старым тестовым заявкам ─────────────
  // Заявки, созданные предыдущими запусками seed, остались с passport_scan
  // IS NULL — бейдж в CRM показывает «Нет скана». Обновляем их только по
  // телефонам из нашего набора: реальные заявки пользователей не трогаем.
  let backfilled = 0;
  if (demoScan) {
    const result = await pool.query(
      `UPDATE bookings
          SET passport_scan = $1
        WHERE passport_scan IS NULL
          AND client_phone = ANY($2::text[])`,
      [demoScan, bookings.map((b) => b.client_phone)]
    );
    backfilled = result.rowCount;
    if (backfilled > 0) {
      console.log(`✅ Образец скана проставлен ${backfilled} ранее созданным заявкам.`);
    }
  }

  const insertedTours = hasTours ? 0 : tours.length;
  console.log(
    `🎉 Seed завершён! Пользователей: ${users.length}, ` +
    `добавлено туров: ${insertedTours}, ` +
    `заявок добавлено: ${insertedNew}, уже было: ${skippedExisting}, ` +
    `пропущено (база полна): ${skippedFull}, ` +
    `passport_scan обновлён у ${backfilled}, всего заявок в базе: ${total}.`
  );
}


// seed() — async-функция, поэтому ошибка приходит не в try/catch, а в промис.
// .catch перехватывает её, печатает текст и ставит код возврата 1,
// чтобы Docker или CI увидели: что-то пошло не так.
// pool.end() вызываем в finally: без него процесс остался бы висеть
// с открытыми сокетами к PostgreSQL (Node не завершается, пока пул жив).
seed()
  .catch((err) => {
    console.error('❌ Ошибка seed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
