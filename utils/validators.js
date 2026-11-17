// ============================================================================
// utils/validators.js — чистые функции валидации и нормализации данных
// ============================================================================
//
// НАЗНАЧЕНИЕ
// Бэкенд-функции, которые принимают "сырые" строки из HTML-форм и возвращают
// либо валидное значение, либо null. Это позволяет роутерам (auth, tours,
// admin) не дублировать regex и логику нормализации, а также единообразно
// проверять данные при регистрации, бронировании и создании туров.
//
// ВСЕ ФУНКЦИИ БЕЗОПАСНЫ:
//   - Принимают любое значение (undefined, null, number, string) —
//     преобразуют в строку и обрабатывают.
//   - Не выбрасывают исключения, а возвращают null при ошибке.
//   - Не обращаются к файловой системе, БД или сети — чистый JS.

// ─── 1. validateEmail ────────────────────────────────────────────────────────
// Проверка формата email и возврат trim().toLowerCase().
// Формат: «символы@символы.символы» без пробелов.
// Примеры:
//   validateEmail('  User@Example.COM  ') → 'user@example.com'
//   validateEmail('  неemail  ')          → null

function validateEmail(raw) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return EMAIL_RE.test(normalized) ? normalized : null;
}

// ─── 2. validatePhone ───────────────────────────────────────────────────────
// Очистка от пробелов, скобок, дефисов и '+'; проверка, что осталось
// ровно 11 цифр (начинается с 7 или 8 — российский формат).
// Примеры:
//   validatePhone('+7 (900) 123-45-67') → '79001234567'
//   validatePhone('+79001234567')       → '79001234567'
//   validatePhone('89001234567')        → '89001234567'
//   validatePhone('abc')                → null

function validatePhone(raw) {
  if (typeof raw !== 'string') return null;
  // Убираем всё, кроме цифр
  const digits = raw.replace(/\D/g, '');
  // Ровно 11 цифр (79001234567 или 89001234567)
  if (digits.length !== 11) return null;
  // Допускаем только 7 или 8 в начале — российский формат
  if (!/^[78]/.test(digits)) return null;
  return digits;
}

// ─── 3. validatePassport ────────────────────────────────────────────────────
// Очистка от пробелов; проверка, что осталось ровно 10 цифр:
// 4 цифры серии + 6 цифр номера.
// Примеры:
//   validatePassport('1234 567890') → '1234567890'
//   validatePassport('1234567890')  → '1234567890'
//   validatePassport('123 4567890') → null (9 символов)

function validatePassport(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s/g, '');
  if (!/^\d{10}$/.test(cleaned)) return null;
  return cleaned;
}

// ─── 4. validateBirthDate ──────────────────────────────────────────────────
// Корректная дата в прошлом (возраст от 0 до 120 лет, не в будущем).
// Принимает строку в формате YYYY-MM-DD (как <input type="date">).
// Примеры:
//   validateBirthDate('1990-05-15') → '1990-05-15'
//   validateBirthDate('2030-01-01') → null (будущее)
//   validateBirthDate('1890-01-01') → null (старше 120)

function validateBirthDate(dateStr) {
  if (typeof dateStr !== 'string') return null;

  // Формат YYYY-MM-DD
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Базовая валидация диапазона
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Проверяем, что дата реальная (например, 2027-02-31 не существует)
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  // Не в будущем
  const now = new Date();
  const today = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
  ));
  if (parsed >= today) return null;

  // Возраст не старше 120 лет
  const maxAgeDate = new Date(today.getTime() - 120 * 365.25 * 24 * 60 * 60 * 1000);
  if (parsed < maxAgeDate) return null;

  return dateStr;
}

// ─── 5. validatePassportExpiry ─────────────────────────────────────────────
// Корректная дата, паспорт НЕ просрочен (дата >= сегодня).
// Формат YYYY-MM-DD.
// Примеры:
//   validatePassportExpiry('2030-06-15') → '2030-06-15'
//   validatePassportExpiry('2020-01-01') → null (просрочен)

function validatePassportExpiry(dateStr) {
  if (typeof dateStr !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  // Должна быть >= сегодня
  const today = new Date();
  const todayUTC = new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()
  ));
  if (parsed < todayUTC) return null;

  return dateStr;
}

// ─── 6. validateBookingData — анкета туриста при бронировании (Этап 3) ──────
// Вызывается в обоих роутах бронирования: клиент (tours.js) и менеджер (server.js).
// Принимает «сырой» req.body и необязательные опции по умолчанию.
// Возвращает { ok: true, values: {...} } или { ok: false, errors: ['...'] }.
//
// Примеры:
//   validateBookingData(req.body)                    → ошибки: все поля обязательны
//   validateBookingData(req.body, { defaultName: 'Олег' }) → defaultName используется как fallback

function validateBookingData(raw, options) {
  const opts = options || {};
  const errors = [];
  const source = raw && typeof raw === 'object' ? raw : {};

  // client_name: если не передано — используем defaultName (из профиля)
  const client_name = String(source.client_name || opts.defaultName || '').trim().slice(0, 150);
  if (!client_name) errors.push('Заполните ФИО туриста.');

  // client_phone: строго 11 цифр
  const rawPhone = String(source.client_phone || opts.defaultPhone || '');
  const client_phone = validatePhone(rawPhone);
  if (!client_phone) errors.push('Телефон должен содержать ровно 11 цифр (например: 79001234567).');

  // birth_date: дата в прошлом, возраст 0–120 лет
  const birth_date = validateBirthDate(String(source.birth_date || '').trim());
  if (!birth_date) errors.push('Укажите корректную дату рождения (ГГГГ-ММ-ДД).');

  // passport_series_number: ровно 10 цифр
  const passport_series_number = validatePassport(String(source.passport_series_number || ''));
  if (!passport_series_number) errors.push('Серия и номер паспорта — ровно 10 цифр (например: 4510123456).');

  // passport_issued_by: непустая строка
  const passport_issued_by = String(source.passport_issued_by || '').trim().slice(0, 255);
  if (!passport_issued_by) errors.push('Заполните поле «Кем выдан паспорт».');

  // passport_expires_at: дата >= сегодня
  const passport_expires_at = validatePassportExpiry(String(source.passport_expires_at || '').trim());
  if (!passport_expires_at) errors.push('Укажите корректную дату окончания срока действия паспорта (ГГГГ-ММ-ДД).');

  // comment: необязательное, до 1000 символов
  const comment = String(source.comment || '').trim().slice(0, 1000);

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    values: {
      client_name,
      client_phone,
      birth_date,
      passport_series_number,
      passport_issued_by,
      passport_expires_at,
      comment: comment || null,
    },
  };
}

module.exports = {
  validateEmail,
  validatePhone,
  validatePassport,
  validateBirthDate,
  validatePassportExpiry,
  validateBookingData,
};
