// ============================================================================
// middlewares/upload.js — приём фото туриста и скана паспорта (multer)
// ============================================================================
//
// НАЗНАЧЕНИЕ
// Разбор multipart/form-data у двух форм: самостоятельное бронирование
// (POST /tours/:id/book) и оформление клиента менеджером (POST /manager/book).
// Файлы физически лежат в uploads/photos и uploads/passports (в Docker — volume
// uploads_data), а в bookings пишется только имя файла (client_photo /
// passport_scan) — см. DATA_CONTRACT.md, блок 4.
//
// БЕЗОПАСНОСТЬ
//   - Расширение берётся ТОЛЬКО из разрешённого MIME-типа, а не из имени файла
//     клиента: image/jpeg → .jpg, image/png → .png, image/webp → .webp.
//   - Имя собирается как Date.now() + '-' + случайное число: коллизий нет,
//     исходное имя (возможный path traversal) не используется.
//   - fileFilter отбивает всё, кроме трёх разрешённых типов изображений.
//   - Лимит 5 МБ на файл.
//
// ОШИБКИ
// Ошибка размера/формата НЕ должна ронять запрос в 500: обёртка
// uploadBookingDocs пишет понятное сообщение в req.flash('error', ...),
// удаляет уже сохранённые файлы и возвращает пользователя назад.

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Корень загрузок и подпапки по полям формы.
const UPLOADS_ROOT = path.resolve(__dirname, '../uploads');
const DESTINATIONS = {
  client_photo: path.join(UPLOADS_ROOT, 'photos'),
  passport_scan: path.join(UPLOADS_ROOT, 'passports'),
};

// Папки создаются в образе (Dockerfile), но при локальном запуске их может не
// быть — создаём на старте, чтобы первая же загрузка не упала с ENOENT.
Object.values(DESTINATIONS).forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

// Разрешённые MIME-типы → расширение файла на диске.
const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Максимальный размер одного файла: 5 МБ.
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = DESTINATIONS[file.fieldname];
    if (!dir) {
      return cb(new Error('Недопустимое поле для загрузки файла.'));
    }
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Расширение только из MIME-типа: fileFilter уже отбросил всё лишнее.
    const ext = MIME_EXTENSIONS[file.mimetype] || '';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + ext);
  },
});

// Пропускаем только изображения JPEG/PNG/WebP.
function fileFilter(req, file, cb) {
  if (MIME_EXTENSIONS[file.mimetype]) {
    return cb(null, true);
  }
  const err = new Error('Можно загружать только изображения JPEG, PNG или WebP.');
  err.code = 'INVALID_FILE_TYPE';
  cb(err);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── Удаление уже сохранённых в этом запросе файлов ─────────────────────────
// Нужно, если после успешной загрузки не прошла валидация полей: иначе в
// uploads/ останутся «осиротевшие» файлы, не привязанные к заявке.
// Ошибки unlink игнорируем: файла может уже не быть (multer чистит сам).
function removeUploadedFiles(req) {
  if (!req.files || typeof req.files !== 'object') return Promise.resolve();

  const tasks = [];
  Object.values(req.files).forEach((files) => {
    if (!Array.isArray(files)) return;
    files.forEach((file) => {
      if (!file || !file.path) return;
      tasks.push(fs.promises.unlink(file.path).catch(() => {}));
    });
  });

  // После удаления очищаем ссылки, чтобы ниже по коду они не использовались.
  req.files = {};
  return Promise.all(tasks);
}

// Куда вернуть пользователя после ошибки загрузки: на страницу тура, если
// id есть в URL, иначе на рабочее место менеджера.
function backUrl(req) {
  const rawId = req.params && req.params.id;
  if (rawId !== undefined && req.baseUrl) {
    return `${req.baseUrl}/${encodeURIComponent(rawId)}`;
  }
  return '/manager';
}

// ─── uploadBookingDocs ──────────────────────────────────────────────────────
// Ровно два необязательных файла: одно фото туриста и один скан паспорта.
const fieldsMiddleware = upload.fields([
  { name: 'client_photo', maxCount: 1 },
  { name: 'passport_scan', maxCount: 1 },
]);

function uploadBookingDocs(req, res, next) {
  fieldsMiddleware(req, res, (err) => {
    if (!err) return next();

    // Часть файлов могла успеть записаться на диск до ошибки.
    removeUploadedFiles(req).catch(() => {});

    let message = 'Не удалось загрузить файл. Попробуйте ещё раз.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Файл слишком большой: максимум 5 МБ.';
    } else if (err.code === 'INVALID_FILE_TYPE') {
      message = err.message;
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Недопустимое поле файла или больше одного файла в одном поле.';
    } else if (err.message) {
      message = err.message;
    }

    req.flash('error', message);
    return res.redirect(backUrl(req));
  });
}

module.exports = {
  uploadBookingDocs,
  removeUploadedFiles,
};
