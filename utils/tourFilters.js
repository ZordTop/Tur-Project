// ============================================================================
// utils/tourFilters.js — единая обработка фильтров каталога туров
// ============================================================================
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ
// Фильтры нужны и публичному каталогу (GET /tours, routes/tours.js), и рабочему
// месту менеджера (GET /manager, server.js). Раньше имена параметров в формах
// (name="destination_country") и в бэкенде (req.query.country) не совпадали —
// фильтры молча игнорировались. Теперь обе страницы используют ОДИН модуль,
// и ключи объекта фильтров совпадают с name-атрибутами форм.
//
// ЧТО ВОЗВРАЩАЕТ parseFilters
// Объект с ключами, равными name-атрибутам форм tours.ejs и manager.ejs:
//   departure_city, destination_country, destination_city, departure_date,
//   nights, flight_class, hotel_stars, hotel_meal, transfer_type, maxPrice.
// Пустые и мусорные значения превращаются в null и не попадают в SQL.
//
// БЕЗОПАСНОСТЬ
// buildConditions возвращает массив SQL-условий с плейсхолдерами $1, $2...
// и отдельный массив значений — пользовательские данные никогда не становятся
// частью текста запроса (защита от SQL-инъекций).

// Словари допустимых значений колонок с CHECK-ограничениями (db/init.js).
// Значение вне списка → null (фильтр просто не применится).
const FLIGHT_CLASSES = ['economy', 'comfort', 'business'];
const HOTEL_MEALS = ['RO', 'BB', 'HB', 'AI'];
const TRANSFER_TYPES = ['bus', 'private'];

function parseFilters(query) {
  const toText = (value) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  const toPositiveNumber = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };

  // Даты принимаем только в формате YYYY-MM-DD (такой отдаёт <input type="date">).
  const toDate = (value) => {
    const text = toText(value);
    return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  };

  // Значение из фиксированного списка (для колонок с CHECK).
  const toEnum = (value, allowed) => {
    const text = toText(value);
    return text && allowed.includes(text) ? text : null;
  };

  return {
    departure_city: toText(query.departure_city),
    destination_country: toText(query.destination_country),
    destination_city: toText(query.destination_city),
    departure_date: toDate(query.departure_date),
    nights: toPositiveNumber(query.nights),
    flight_class: toEnum(query.flight_class, FLIGHT_CLASSES),
    hotel_stars: toPositiveNumber(query.hotel_stars),
    hotel_meal: toEnum(query.hotel_meal, HOTEL_MEALS),
    transfer_type: toEnum(query.transfer_type, TRANSFER_TYPES),
    maxPrice: toPositiveNumber(query.maxPrice),
  };
}

// Собирает из фильтров пару [where, values] для подстановки в SQL.
// where всегда начинается с условия is_active — скрытые туры не отдаются
// ни каталогу, ни менеджеру (архив менеджеру не нужен).
function buildConditions(filters) {
  const where = ['t.is_active = TRUE'];
  const values = [];

  const add = (condition, value) => {
    values.push(value);
    where.push(condition.replace('?', `$${values.length}`));
  };

  // Текстовые поля ищем по подстроке (ILIKE) — так «сочи» находит «Сочи».
  if (filters.departure_city) {
    add('t.departure_city ILIKE ?', `%${filters.departure_city}%`);
  }
  if (filters.destination_country) {
    add('t.destination_country ILIKE ?', `%${filters.destination_country}%`);
  }
  if (filters.destination_city) {
    add('t.destination_city ILIKE ?', `%${filters.destination_city}%`);
  }

  // «Дата вылета» = не раньше выбранного дня.
  if (filters.departure_date) {
    add('t.departure_at >= ?::date', filters.departure_date);
  }

  // Числовые фильтры — «не меньше»: гость ищет подлиннее, позвёзднее и т.д.
  if (filters.nights !== null) {
    add('t.nights >= ?', filters.nights);
  }
  if (filters.hotel_stars !== null) {
    add('t.hotel_stars >= ?', filters.hotel_stars);
  }
  if (filters.maxPrice !== null) {
    add('t.total_price <= ?', filters.maxPrice);
  }

  // Коды из CHECK-списков — точное совпадение.
  if (filters.flight_class) {
    add('t.flight_class = ?', filters.flight_class);
  }
  if (filters.hotel_meal) {
    add('t.hotel_meal = ?', filters.hotel_meal);
  }
  if (filters.transfer_type) {
    add('t.transfer_type = ?', filters.transfer_type);
  }

  return { where, values };
}

module.exports = { parseFilters, buildConditions };
