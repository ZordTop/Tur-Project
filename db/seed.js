// ============================================================================
// db/seed.js — наполняет пустую базу тестовыми данными
// ============================================================================
//
// Что делает: добавляет 6 пользователей (1 admin, 2 manager, 3 user)
// и 14 пакетных туров по разным странам, чтобы сайт было на чём посмотреть
// сразу после создания таблиц.
//
// Как запускать:  node db/seed.js   (или npm run db:seed)
// Порядок важен: сначала db/init.js (появятся таблицы) → потом этот файл
// (в них появятся строки). Сервер его не вызывает — запуск руками.
//
// Пароль у всех шести тестовых аккаунтов один: TestPass123!
//
// «Seed» — устоявшееся название стартовых данных (от английского «сеять»).

const pool = require('./pool');       // общее соединение с базой (см. pool.js)
const bcrypt = require('bcryptjs');   // библиотека для хэширования паролей

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
    // Массив подставляется в $1..$5 по порядку
    await pool.query(insertUserSQL, [u.email, hashedPassword, u.full_name, u.phone, u.role]);
    console.log(`✅ Создан пользователь: ${u.email} [${u.role}]`);
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
    console.log(`✅ Создан тур: ${t.title} (${t.total_price.toLocaleString('ru-RU')} ₽)`);
  }

  // ─── Шаг 5. Пять тестовых заявок ──────────────────────────────────────────
  // Часть заведена клиентами самостоятельно (user_id заполнен, manager_id = NULL),
  // часть оформлена менеджерами (manager_id заполнен, user_id = NULL) — ровно
  // как описано в п. 3 DATA_CONTRACT.md.
  //
  // Паспортные данные соответствуют новым колонкам bookings:
  //   birth_date            — дата в прошлом (валидный возраст);
  //   passport_series_number — 10 цифр (4 серии + 6 номера);
  //   passport_expires_at    — дата в будущем (паспорт не просрочен).
  // client_photo / passport_scan оставлены NULL: это пути к файлам, а самих
  // файлов в uploads/ при seed нет — ссылаться было бы не на что.

  // Не завязываемся на порядок автоинкремента: берём id из БД по email/title.
  const { rows: savedUsers } = await pool.query(
    'SELECT id, email FROM users WHERE email = ANY($1)',
    [users.map((u) => u.email)]
  );
  const userIdBy = new Map(savedUsers.map((u) => [u.email, Number(u.id)]));

  const { rows: savedTours } = await pool.query('SELECT id, title FROM tours');
  const tourIdBy = new Map(savedTours.map((t) => [t.title, Number(t.id)]));

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
  ];

  const insertBookingSQL = `
    INSERT INTO bookings (
      tour_id, user_id, manager_id,
      client_name, client_phone, comment, status,
      birth_date, passport_series_number, passport_issued_by, passport_expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `;

  for (const b of bookings) {
    const tourId = tourIdBy.get(b.tour_title);
    const userId = b.user_email ? userIdBy.get(b.user_email) : null;
    const managerId = b.manager_email ? userIdBy.get(b.manager_email) : null;

    await pool.query(insertBookingSQL, [
      tourId, userId, managerId,
      b.client_name, b.client_phone, b.comment || null, b.status,
      b.birth_date, b.passport_series_number, b.passport_issued_by, b.passport_expires_at,
    ]);
    console.log(`✅ Заявка [${b.status}]: ${b.client_name} → ${b.tour_title}`);
  }

  console.log(
    `🎉 Seed завершён! ${users.length} пользователей, ${tours.length} туров, ${bookings.length} заявок.`
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
