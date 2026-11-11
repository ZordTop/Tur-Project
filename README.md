# Tur-Project
Учебный проект по веб-разработке. Сайт посвящён туристической теме: пользователи получают список туров, в которые уже включены рейсы, проживание и трансферы.

**Стек:** Node.js 20, Express 4, EJS, Docker / Docker Compose.


# Структура файлов проекта
Tur-Project/
├── public/                   # Всё, что видит браузер (стили, картинки, клиентский JS)
│   ├── css/                  # Стили (style.css)
│   ├── js/                   # Скрипты для анимаций и кнопок на странице
│   └── images/               # Картинки сайта (логотип, баннеры, фото туров)
├── views/                    # HTML-шаблоны страниц (например, index.ejs, tour.ejs)
├── routes/                   # Маршруты сайта (какой код запускать при переходе по ссылкам)
├── data/                     # Данные туров (пока массив в памяти)
├── server.js                 # Главный файл, который запускает сервер
├── package.json              # Список JS-библиотек (Express и т.д.)
├── package-lock.json         # Точные версии зависимостей (нужен для npm ci)
├── .gitignore                # Игнорируемые файлы (сюда обязательно пишем node_modules)
├── .dockerignore             # Что не копировать в образ Docker
├── Dockerfile                # Инструкция упаковки Node.js сайта в контейнер
├── docker-compose.yml        # Запуск сайта в production-режиме
├── docker-compose.dev.yml    # Дополнительные настройки для разработки
└── README.md                 # Описание проекта для GitHub

# Запуск через Docker

## Production

```powershell
docker compose up -d --build
```

Сайт: http://localhost:3000

В этом режиме исходники не монтируются в контейнер: внутрь образа попадает
только то, что описано в `Dockerfile`, зависимости ставятся через `npm ci`.

## Разработка

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Здесь папка проекта монтируется в контейнер, а сервер запускается через
`npm run dev` (`node --watch`). Шаблоны EJS и CSS читаются с диска при каждом
запросе, поэтому их правки видны сразу, без пересборки.

Важно: в Docker Desktop на Windows события файловой системы из bind mount
могут не доходить до `node --watch`. Если после правки `server.js`, `routes/`
или `data/` ничего не изменилось — перезапусти контейнер:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart app
```

## Полезные команды

```powershell
docker compose ps                  # статус контейнера и healthcheck
docker compose logs -f app         # логи приложения
docker compose down                # остановить и удалить контейнер
docker compose up -d --build       # пересобрать и запустить
```

Порт на хосте можно изменить, не трогая файлы:

```powershell
$env:APP_PORT=8080; docker compose up -d
```

# Запуск без Docker

```powershell
npm install
npm start        # или npm run dev для автоперезапуска
```

# Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `3000` | порт, который слушает приложение внутри контейнера |
| `HOST` | `0.0.0.0` | адрес прослушивания (0.0.0.0 нужен в контейнере) |
| `NODE_ENV` | `production` | режим работы Express |
| `APP_PORT` | `3000` | порт на хосте (только для docker compose) |

# Проверка состояния

Приложение отдаёт `GET /healthz` → `{"status":"ok","uptime":...}`.
Этот адрес использует `HEALTHCHECK` из `Dockerfile`, поэтому
`docker compose ps` показывает `healthy`, когда сайт действительно отвечает.
