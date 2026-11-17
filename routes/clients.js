// ============================================================================
// routes/clients.js — CRM-база туристов (этап 4)
// ============================================================================
//
// Доступ только менеджеру и админу: router.use(requireRole(...)) отбивает
// гостя на /login, а клиента — на /tours?error=access_denied.
//
// Что внутри:
//   GET  /clients/files/:type/:filename — защищённая раздача фото и сканов
//                                        паспорта из uploads/ (path traversal
//                                        закрыт проверкой basename);
//   GET  /clients                      — список заявок с поиском по клиенту
//                                        и фильтрами по забронированному туру;
//   GET  /clients/:id                  — досье туриста (бронь + тур + менеджер);
//   POST /clients/:id/cancel           — отмена брони менеджером/админом.
//
// Важно: в списке и досье фильтры по туру НЕ требуют t.is_active = TRUE —
// менеджер должен видеть заявки и по архивным (скрытым) турам. Поэтому здесь
// используется только parseFilters(), а условия собираются локально, а не
// через buildConditions() (та всегда добавляет is_active).

const path = require('path');
const fs = require('fs');
const express = require('express');

const pool = require('../db/pool');
const { requireRole } = require('../middlewares/auth');
const { parseFilters } = require('../utils/tourFilters');

const router = express.Router();

// Все маршруты роутера — только для сотрудников.
router.use(requireRole('manager', 'admin'));

// Разрешённые подпапки uploads/: фото туристов и сканы паспортов.
const FILE_TYPES = ['photos', 'passports'];
const UPLOADS_ROOT = path.resolve(__dirname, '../uploads');

// Статусы заявок в тексте (CHECK: new | confirmed | cancelled).
const BOOKING_STATUS_LABELS = {
  new: 'Новая',
  confirmed: 'Подтверждена',
  cancelled: 'Отменена',
};

// ---------------------------------------------------------------------------
// GET /clients/files/:type/:filename — защищённая раздача файлов
// ---------------------------------------------------------------------------
// Express декодирует %2e%2e и %2f в параметрах, поэтому одной проверки
// basename недостаточно — дополнительно запрещаем '..' и любые слеши.
router.get('/files/:type/:filename', async (req, res, next) => {
  try {
    const { type, filename } = req.params;

    if (!FILE_TYPES.includes(type)) {
      return res.status(400).type('text/plain').send('Недопустимый тип файла');
    }

    const isUnsafeName =
      !filename ||
      filename !== path.basename(filename) ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\');

    if (isUnsafeName) {
      return res.status(400).type('text/plain').send('Недопустимое имя файла');
    }

    const filePath = path.resolve(UPLOADS_ROOT, type, filename);

    // Дополнительный барьер: итоговый путь обязан остаться внутри uploads/<type>.
    if (path.dirname(filePath) !== path.resolve(UPLOADS_ROOT, type)) {
      return res.status(400).type('text/plain').send('Недопустимое имя файла');
    }

    // Проверяем, что это именно файл (а не каталог), иначе sendFile отдаст 500.
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (err) {
      return res.status(404).type('text/plain').send('Файл не найден');
    }
    if (!stat.isFile()) {
      return res.status(404).type('text/plain').send('Файл не найден');
    }

    res.sendFile(filePath, (err) => {
      if (!err) return;
      // sendFile игнорирует dotfiles и может не найти файл между stat и чтением.
      if (err.code === 'ENOENT' || err.status === 404) {
        return res.status(404).type('text/plain').send('Файл не найден');
      }
      if (res.headersSent) return next(err);
      next(err);
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Локальный сборщик условий по параметрам забронированного тура
// ---------------------------------------------------------------------------
// Ключи совпадают с name-атрибутами формы clients.ejs и с parseFilters().
// Значения всегда идут отдельным массивом ($1, $2...) — инъекции невозможны.
function buildClientConditions(filters) {
  const where = [];
  const values = [];

  const add = (condition, value) => {
    values.push(value);
    where.push(condition.replace('?', `$${values.length}`));
  };

  if (filters.destination_country) {
    add('t.destination_country ILIKE ?', `%${filters.destination_country}%`);
  }
  if (filters.destination_city) {
    add('t.destination_city ILIKE ?', `%${filters.destination_city}%`);
  }
  if (filters.nights !== null) {
    add('t.nights >= ?', filters.nights);
  }
  if (filters.hotel_stars !== null) {
    add('t.hotel_stars >= ?', filters.hotel_stars);
  }
  if (filters.maxPrice !== null) {
    add('t.total_price <= ?', filters.maxPrice);
  }
  if (filters.transfer_type) {
    add('t.transfer_type = ?', filters.transfer_type);
  }

  return { where, values };
}

// ---------------------------------------------------------------------------
// GET /clients — список туристов (заявок) с поиском и фильтрами
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filters = parseFilters(req.query);
    const { where, values } = buildClientConditions(filters);

    // Поиск по ФИО или телефону. Один и тот же плейсхолдер используется дважды.
    if (search) {
      values.push(`%${search}%`);
      const idx = values.length;
      where.push(`(b.client_name ILIKE $${idx} OR b.client_phone ILIKE $${idx})`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT b.id, b.tour_id, b.user_id, b.manager_id,
              b.client_name, b.client_phone, b.birth_date,
              b.client_photo, b.passport_scan,
              b.comment, b.status, b.created_at,
              t.title, t.destination_country, t.destination_city,
              t.departure_at, t.total_price, t.hotel_stars, t.nights,
              t.transfer_type, t.is_active AS tour_is_active,
              u.full_name AS manager_name
       FROM bookings b
       JOIN tours t ON b.tour_id = t.id
       LEFT JOIN users u ON b.manager_id = u.id
       ${whereSQL}
       ORDER BY b.created_at DESC`,
      values
    );

    res.render('clients', {
      title: 'База туристов — Туристический сайт',
      clients: result.rows,
      search,
      filters,
      statusLabels: BOOKING_STATUS_LABELS,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /clients/:id — детальное досье туриста
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next();
    }

    // b.* + t.* — полная бронь и полный тур. booking_id вынесен отдельно:
    // у bookings и tours есть одноимённая колонка id, и в объекте строки
    // остаётся последнее значение — без алиаса потеряли бы id заявки.
    const result = await pool.query(
      `SELECT b.*, t.*, b.id AS booking_id,
              u.full_name AS manager_name, u.email AS manager_email
       FROM bookings b
       JOIN tours t ON b.tour_id = t.id
       LEFT JOIN users u ON b.manager_id = u.id
       WHERE b.id = $1`,
      [id]
    );

    const client = result.rows[0];
    if (!client) {
      return next();
    }

    res.render('client-detail', {
      title: `Досье туриста — ${client.client_name}`,
      client,
      statusLabels: BOOKING_STATUS_LABELS,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /clients/:id/cancel — отмена брони сотрудником
// ---------------------------------------------------------------------------
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next();
    }

    const result = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND status != 'cancelled'
       RETURNING id`,
      [id]
    );

    if (!result.rows[0]) {
      // Либо заявки нет, либо она уже отменена — сообщаем без падения.
      req.flash('info', 'Заявка не найдена или уже отменена.');
      return res.redirect(`/clients/${id}`);
    }

    req.flash('success', 'Бронирование отменено');
    res.redirect(`/clients/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
