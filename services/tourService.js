// ============================================================================
// services/tourService.js — поиск туров по фильтрам (общий для /tours и /manager)
// ============================================================================
//
// ЗАЧЕМ НУЖЕН СЕРВИС
// Список туров с фильтрами нужен в нескольких местах: каталог GET /tours,
// позже панель менеджера GET /manager. Если собирать WHERE в каждом роутере
// отдельно, правила начнут расходиться. Поэтому SQL здесь, а роутеры только
// вызывают searchTours(req.query).
//
// БЕЗОПАСНОСТЬ
// Значения фильтров никогда не подставляются в текст запроса: для каждого
// создаётся placeholder $1, $2..., а само значение уходит вторым аргументом
// pool.query(sql, values). PostgreSQL трактует их как данные, а не как код,
// поэтому SQL-инъекция через query-строку невозможна.
//
// ПУСТЫЕ И НЕВАЛИДНЫЕ ЗНАЧЕНИЯ
// Пустая строка, ?nights=abc или ?departure_date=01.02.2027 превращаются в null
// и просто не добавляют условие. Так битый параметр в URL даёт «все туры»,
// а не страницу ошибки 500.

const pool = require('../db/pool');

// ---------------------------------------------------------------------------
// Белые списки. Совпадают с CHECK-ограничениями таблицы tours (см. db/init.js).
// Значение вне списка игнорируем: запрос с ним всё равно ничего бы не нашёл,
// но пользователю полезнее увидеть полный список, чем пустую страницу.
// ---------------------------------------------------------------------------
const FLIGHT_CLASSES = ['economy', 'comfort', 'business'];
const HOTEL_MEALS = ['RO', 'BB', 'HB', 'AI'];
const TRANSFER_TYPES = ['bus', 'private'];

// Словари кодов в человекочитаемый текст (п. 2 DATA_CONTRACT.md).
// Держимся рядом со списками выше: новый код нужно добавить в оба места сразу.
const FLIGHT_CLASS_LABELS = {
  economy: 'Эконом',
  comfort: 'Комфорт',
  business: 'Бизнес',
};

const HOTEL_MEAL_LABELS = {
  RO: 'Без питания',
  BB: 'Завтраки',
  HB: 'Полупансион',
  AI: 'Всё включено',
};

const TRANSFER_TYPE_LABELS = {
  bus: 'Групповой автобус',
  private: 'Индивидуальный автомобиль',
};

// Разворачивает БД-код в подпись для шаблона. Неизвестный код отдаём как есть,
// чтобы страница тура не падала из-за кода, которого ещё нет в словаре.
function label(dict, code) {
  return dict[code] || code;
}

// ---------------------------------------------------------------------------
// Приводилки query-строки к значениям, которые можно отдать PostgreSQL
// ---------------------------------------------------------------------------

// Непустая строка или null
function toText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Целое положительное число или null (для maxPrice, nights, hotel_stars)
function toPositiveInt(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Значение из белого списка или null
function toEnum(value, allowed) {
  const text = toText(value);
  return text && allowed.includes(text) ? text : null;
}

// Дата в формате YYYY-MM-DD (его отдаёт <input type="date">) или null.
// Проверяем не только маску, но и существование даты: 2027-02-31 проходит
// регулярку, но PostgreSQL отвергнет её с ошибкой, и страница упала бы в 500.
function toDate(value) {
  const text = toText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  return isRealDate ? text : null;
}

// ---------------------------------------------------------------------------
// parseSearchFilters(query) — query-строка → нормализованные фильтры
// ---------------------------------------------------------------------------
// Имена ключей = имена query-параметров = имена колонок БД, чтобы по названию
// было видно, к какой колонке что уходит. Пропущенные фильтры = null.
function parseSearchFilters(query = {}) {
  return {
    destination_country: toText(query.destination_country),
    destination_city: toText(query.destination_city),
    departure_city: toText(query.departure_city),
    departure_date: toDate(query.departure_date),
    flight_class: toEnum(query.flight_class, FLIGHT_CLASSES),
    hotel_meal: toEnum(query.hotel_meal, HOTEL_MEALS),
    transfer_type: toEnum(query.transfer_type, TRANSFER_TYPES),
    hotel_stars: toPositiveInt(query.hotel_stars),
    maxPrice: toPositiveInt(query.maxPrice),
    nights: toPositiveInt(query.nights),
  };
}

// ---------------------------------------------------------------------------
// buildSearchWhere(filters) → { text, values }
// ---------------------------------------------------------------------------
// Собирает fragment WHERE из непустых фильтров. Возвращает готовый к вставке
// текст без слова WHERE и массив значений в том же порядке.
//
// Сравнения:
//   destination_country — ILIKE без %: сравнение точное, но независимое от
//         регистра (значение приходит из <select>, но URL правят и руками).
//   destination_city / departure_city — ILIKE с %: поиск по подстроке,
//         « сочи» находит «Сочи», «петерб» находит «Санкт-Петербург».
//   departure_date — DATE(departure_at): сравниваем только дату, время вылета
//         в условии не участвует.
//   hotel_stars — >=: фильтр читается как «от N звёзд», иначе выбор «4»
//         прятал бы пятизвёздочные отели.
//   nights — =: точное значение, туры обычно подбирают под длину отпуска.
function buildSearchWhere(filters) {
  const conditions = ['t.is_active = TRUE'];
  const values = [];

  // Добавляет условие, подставляя placeholder с правильным номером
  const add = (sql, value) => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };

  if (filters.destination_country) {
    add('t.destination_country ILIKE ?', filters.destination_country);
  }
  if (filters.destination_city) {
    add("t.destination_city ILIKE '%' || ? || '%'", filters.destination_city);
  }
  if (filters.departure_city) {
    add("t.departure_city ILIKE '%' || ? || '%'", filters.departure_city);
  }
  if (filters.departure_date) {
    add('DATE(t.departure_at) = ?', filters.departure_date);
  }
  if (filters.flight_class) {
    add('t.flight_class = ?', filters.flight_class);
  }
  if (filters.hotel_meal) {
    add('t.hotel_meal = ?', filters.hotel_meal);
  }
  if (filters.transfer_type) {
    add('t.transfer_type = ?', filters.transfer_type);
  }
  if (filters.hotel_stars !== null) {
    add('t.hotel_stars >= ?', filters.hotel_stars);
  }
  if (filters.maxPrice !== null) {
    add('t.total_price <= ?', filters.maxPrice);
  }
  if (filters.nights !== null) {
    add('t.nights = ?', filters.nights);
  }

  return { text: conditions.join(' AND '), values };
}

// ---------------------------------------------------------------------------
// searchTours(query) — активные туры по фильтрам из query-строки
// ---------------------------------------------------------------------------
// Сортировка по возрастанию цены: каталог читают сверху вниз и дешёвые варианты
// должны быть выше. id в конце убирает перестановки у туров с одинаковой ценой.
async function searchTours(query) {
  const filters = parseSearchFilters(query);
  const { text, values } = buildSearchWhere(filters);

  const result = await pool.query(
    `SELECT t.*
     FROM tours t
     WHERE ${text}
     ORDER BY t.total_price ASC, t.id ASC`,
    values
  );

  return result.rows;
}

// ---------------------------------------------------------------------------
// listActiveCountries() — страны для выпадающего списка в форме фильтров
// ---------------------------------------------------------------------------
// Отдельный запрос, а не DISTINCT в основном: список стран не зависит от
// выбранных фильтров, иначе выбор одной страны убрал бы остальные из select.
async function listActiveCountries() {
  const result = await pool.query(
    `SELECT DISTINCT destination_country
     FROM tours
     WHERE is_active = TRUE
     ORDER BY destination_country`
  );
  return result.rows.map((row) => row.destination_country);
}

// ---------------------------------------------------------------------------
// findActiveTourById(rawId) — один активный тур или null
// ---------------------------------------------------------------------------
// Валидацию id держим здесь, чтобы GET /tours/:id и POST /tours/:id/book
// проверяли id одинаково: мусор в URL не должен доходить до PostgreSQL.
async function findActiveTourById(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const result = await pool.query(
    'SELECT * FROM tours WHERE id = $1 AND is_active = TRUE',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  // Основной поиск
  searchTours,
  findActiveTourById,
  listActiveCountries,
  parseSearchFilters,
  buildSearchWhere,
  // Словари и подписи кодов
  FLIGHT_CLASSES,
  HOTEL_MEALS,
  TRANSFER_TYPES,
  FLIGHT_CLASS_LABELS,
  HOTEL_MEAL_LABELS,
  TRANSFER_TYPE_LABELS,
  label,
};
