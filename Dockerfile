# Базовый образ: Node.js 20 на Alpine — маленький и быстрый
FROM node:20-alpine

# Рабочая папка внутри контейнера
WORKDIR /app

# Значения по умолчанию: production-режим и порт приложения
ENV NODE_ENV=production \
    PORT=3000

# Сначала копируем только файлы зависимостей:
# слой с npm ci переиспользуется, пока не изменятся package.json/package-lock.json
COPY package.json package-lock.json ./

# npm ci ставит версии строго из package-lock.json и падает,
# если lock-файл рассинхронизирован с package.json.
# --omit=dev не тянет devDependencies в production-образ.
RUN npm ci --omit=dev && npm cache clean --force

# Копируем остальной код проекта и сразу отдаём его пользователю node
COPY --chown=node:node . .

# Запуск от непривилегированного пользователя
USER node

# Приложение слушает этот порт
EXPOSE 3000

# Проверка живости: контейнер считается healthy, когда /healthz отвечает 200.
# Работает и при обычном docker run, и под docker compose.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
