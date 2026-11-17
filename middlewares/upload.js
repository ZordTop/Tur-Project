// ============================================================================
// middlewares/upload.js — приём фото туриста и скана паспорта (Этап 3)
// ============================================================================
//
// НАЗНАЧЕНИЕ
// Единственная точка приёма файлов в заявке. Используют два маршрута:
//   POST /tours/:id/book  (routes/tours.js)   — клиент бронирует сам;
//   POST /manager/book    (server.js)         — заявку оформляет менеджер.
// Обе формы отправляют данные как multipart/form-data, поэтому поля анкеты
// (client_name, client_phone, ...) после работы этого middleware лежат в
// req.body, а файлы — в req.files.
//
// ПОРЯДОК ПОДКЛЮЧЕНИЯ ВАЖЕН
//   app.use(csrf) → requireAuth/requireRole → uploadBookingDocs → хендлер.
//   CSRF читает токен ДО разбора multipart (req.body ещё пуст), поэтому
//   формы передают токен в query-строке action="?_csrf=...". См. middlewares/csrf.js.
//
// Что гарантирует этот файл:
//   1. Раскладка по назначению: client_photo → uploads/photos/,
//      passport_scan → uploads/passports/.
//   2. Безопасные имена: Date.now() + случайное число + расширение, взятое
//      СТРОГО из MIME-типа. Имя, присланное браузером (originalname), в расчёт
//      не берётся — в нём легко принести «shell.php.jpg» или «..\\..\\x.js».
//   3. Только растровые картинки: image/jpeg, image/png, image/webp.
//   4. Не больше 5 МБ на файл (limits.fileSize).
//   5. Ни одна ошибка загрузки (размер, формат, лишнее поле, обрыв соединения)
//      не уходит в 500: она переводится в понятное req.flash('error', ...) и
//      редирект обратно на страницу формы.
//
// Где лежат файлы и что хранится в БД
// Файлы пишутся на диск в uploads/<photos|passports>, в колонках bookings
// (client_photo / passport_scan) остаётся только ИМЯ файла. Раздачу делает
// GET /clients/files/:type/:filename (routes/clients.js) — прямой отдачи
// статики из uploads/ нет, доступ только у manager/admin.

const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Поле формы → подпапка uploads/
const FIELD_DIRS = {
  client_photo: 'photos',
  passport_scan: 'passports',
};

// Разрешённые MIME-типы и расширение, которое даём файлу. Ключ — то, что
// браузер заявил в multipart, расширение — единственный источник для имени.
const ALLOWED_MIME_EXT = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

// 5 МБ на каждый файл
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const UPLOADS_ROOT = path.resolve(__dirname, '../uploads');

// Ошибка, понятная пользователю. От «системных» ошибок (EACCES, ENOSPC)
// отличается флагом isUploadError: первые показываем в flash как есть,
// вторые — общей фразой без технических деталей.
function uploadUserError(message) {
  const err = new Error(message);
  err.isUploadError = true;
  return err;
}

// ─── diskStorage: куда писать и как назвать ─────────────────────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dirName = FIELD_DIRS[file.fieldname];
    if (!dirName) {
      return cb(uploadUserError('Неизвестное поле загрузки файла.'));
    }

    const dir = path.join(UPLOADS_ROOT, dirName);

    // recursive: в Docker каталоги создаются на сборке образа (и принадлежат
    // пользователю node), но при локальном запуске пустых папок может не быть —
    // без mkdir multer упал бы с ENOENT.
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },

  filename(req, file, cb) {
    // Расширение берём только из проверенного MIME-типа (файл уже прошёл
    // fileFilter), поэтому оно всегда одно из .jpg / .png / .webp.
    const ext = ALLOWED_MIME_EXT.get(file.mimetype) || '';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

// ─── fileFilter: пропускаем только JPG / PNG / WEBP ─────────────────────────
function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_EXT.has(file.mimetype)) {
    return cb(null, true);
  }

  const originalName = file.originalname || 'без имени';
  const detectedType = file.mimetype || 'неизвестный тип';

  return cb(uploadUserError(
    `Файл «${originalName}» имеет недопустимый формат (${detectedType}). ` +
    'Прикрепите изображение JPG, PNG или WEBP.'
  ));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── Чистка файлов ──────────────────────────────────────────────────────────
// req.files у .fields() — объект { client_photo: [File], passport_scan: [File] }.
function collectUploadedFiles(req) {
  const files = [];
  const buckets = req && req.files ? Object.values(req.files) : [];

  for (const bucket of buckets) {
    if (Array.isArray(bucket)) files.push(...bucket);
    else if (bucket) files.push(bucket);
  }

  return files.filter((file) => file && file.path);
}

// Удаляет файлы, сохранённые в текущем запросе. Нужен, когда файлы приняли,
// а анкету заполнить не удалось: заявка в БД не попадёт, значит и снимки
// паспорта должны уйти с диска. Ошибки удаления молча пропускаем — на ответ
// пользователю они влиять не должны.
function removeUploadedFiles(req) {
  for (const file of collectUploadedFiles(req)) {
    fs.unlink(file.path, () => {});
  }
}

// Имя сохранённого файла по имени поля (или null, если файл не прикрепляли).
function getUploadedFileName(req, fieldName) {
  const file = req.files && req.files[fieldName] && req.files[fieldName][0];
  return file && file.filename ? file.filename : null;
}

// ─── Куда возвращать пользователя после ошибки загрузки ─────────────────────
// Страницу вычисляем по адресу запроса, а не по заголовку Referer: Referer
// может вести на внешний сайт (open redirect).
function redirectBackTo(req) {
  const pathname = String(req.originalUrl || '').split('?')[0];

  const tourBook = /^\/tours\/(\d+)\/book$/.exec(pathname);
  if (tourBook) return `/tours/${tourBook[1]}`;

  if (/\/manager\/book$/.test(pathname)) return '/manager';

  return '/tours';
}

// ─── Перевод системных ошибок multer в человеческий текст ───────────────────
function describeUploadError(err) {
  const maxMb = Math.round(MAX_FILE_SIZE / 1024 / 1024);

  if (err && err.isUploadError) return err.message;

  if (err instanceof multer.MulterError) {
    const fileName = err.filename || err.field || 'файл';

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return `Файл «${fileName}» больше ${maxMb} МБ. Прикрепите изображение меньшего размера.`;
      case 'LIMIT_UNEXPECTED_FILE':
        return `Поле «${err.field || 'неизвестное'}» не предназначено для загрузки документов.`;
      case 'LIMIT_FILE_COUNT':
      case 'LIMIT_PART_COUNT':
        return `Можно прикрепить не больше двух файлов: фотографию туриста и скан паспорта (каждый до ${maxMb} МБ).`;
      default:
        return `Не удалось загрузить файл «${fileName}». Попробуйте ещё раз.`;
    }
  }

  // Ошибки файловой системы и обрыв соединения: детали наружу не показываем.
  return `Не удалось загрузить файлы (размер до ${maxMb} МБ, форматы JPG, PNG или WEBP). Попробуйте ещё раз.`;
}

// ─── Готовый middleware для маршрутов бронирования ──────────────────────────
const uploadBookingDocsBase = upload.fields([
  { name: 'client_photo', maxCount: 1 },
  { name: 'passport_scan', maxCount: 1 },
]);

// Обёртка: любая ошибка загрузки превращается в flash + редирект обратно,
// сервер отвечает 302 вместо 500. Если запрос не multipart (например, форма
// отправилась без enctype), multer пропускает его дальше без изменений —
// разберёт обычный urlencoded-парсер.
function uploadBookingDocs(req, res, next) {
  uploadBookingDocsBase(req, res, (err) => {
    if (!err) return next();

    // multer 2.x удаляет файлы, записанные до момента ошибки, но удаляет не
    // всё, что могло пережить прерывание, — подстраховываемся своей чисткой.
    removeUploadedFiles(req);

    const message = describeUploadError(err);
    console.error('[upload] ошибка загрузки файлов:', err.code || err.name, err.message);

    if (typeof req.flash === 'function') {
      req.flash('error', message);
    }

    return res.redirect(redirectBackTo(req));
  });
}

module.exports = {
  uploadBookingDocs,
  removeUploadedFiles,
  collectUploadedFiles,
  getUploadedFileName,
  FIELD_DIRS,
  ALLOWED_MIME_EXT,
  MAX_FILE_SIZE,
};
