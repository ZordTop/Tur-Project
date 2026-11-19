// Клиентские скрипты: меню, активная ссылка, табы, модалки, сайдбар

document.addEventListener('DOMContentLoaded', () => {
  // ── 0. Переключатель темы (Светлая / Тёмная) ──
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const applyIcon = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeToggle.querySelectorAll('.theme-toggle__icon--sun').forEach(function(el) {
        el.style.display = isDark ? 'none' : '';
      });
      themeToggle.querySelectorAll('.theme-toggle__icon--moon').forEach(function(el) {
        el.style.display = isDark ? 'block' : 'none';
      });
    };
    applyIcon();
    themeToggle.addEventListener('click', function() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tur_theme', next);
      applyIcon();
    });
  }

  // ── 1. Показ / скрытие пароля ──
  // HTML: <button data-toggle-password="password-id"> с двумя SVG-иконками
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-toggle-password'));
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.classList.toggle('is-visible', isPassword);
      btn.setAttribute('aria-pressed', String(isPassword));
    });
  });

  // ── 1. Мобильное меню ──
  const burger = document.querySelector('.burger');
  const nav = document.getElementById('nav');

  if (burger && nav) {
    burger.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', isOpen);
      burger.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // ── 2. Подсветка активного пункта меню ──
  const path = window.location.pathname;
  document.querySelectorAll('.nav__link').forEach((link) => {
    const href = link.getAttribute('href');
    const isHome = href === '/' && path === '/';
    const isSection = href !== '/' && path.startsWith(href);
    if (isHome || isSection) {
      link.classList.add('is-active');
    }
  });

  // ── 3. Скрытие битых картинок туров ──
  document.querySelectorAll('.card__image img, .tour__image img').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
    });
  });

  // ── 4. Табы ──
  // HTML-разметка:
  //   <div class="tabs">
  //     <button class="tab is-active" data-tab="tab1">Вкладка 1</button>
  //     <button class="tab" data-tab="tab2">Вкладка 2</button>
  //   </div>
  //   <div id="tab1" class="tab-content is-active">...</div>
  //   <div id="tab2" class="tab-content">...</div>
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      // Убираем active со всех табов и контента в этом блоке
      const tabsContainer = tab.closest('.tabs');
      const section = tabsContainer ? tabsContainer.parentElement : document;

      if (tabsContainer) {
        tabsContainer.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      }
      section.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('is-active'));

      // Ставим active на кликнутый таб и соответствующий контент
      tab.classList.add('is-active');
      const targetId = tab.getAttribute('data-tab');
      if (targetId) {
        const target = document.getElementById(targetId);
        if (target) target.classList.add('is-active');
      }
    });
  });

  // ── 5. Модальные окна ──
  // HTML-разметка:
  //   <button data-modal="modal-id">Открыть</button>
  //   <div class="modal-overlay" id="modal-id">
  //     <div class="modal">
  //       <div class="modal__header">
  //         <h3 class="modal__title">Заголовок</h3>
  //         <button class="modal__close" data-modal-close>×</button>
  //       </div>
  //       <div class="modal__body">...</div>
  //     </div>
  //   </div>
  document.querySelectorAll('[data-modal]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const modal = document.getElementById(trigger.getAttribute('data-modal'));
      if (modal) modal.classList.add('is-open');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    // Закрытие по клику на затемнение
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('is-open');
    });
    // Закрытие по кнопке ×
    overlay.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => overlay.classList.remove('is-open'));
    });
  });

  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.is-open').forEach((m) => m.classList.remove('is-open'));
      document.querySelectorAll('.sidebar.is-open').forEach((s) => s.classList.remove('is-open'));
      const sidebarOverlay = document.querySelector('.sidebar-overlay');
      if (sidebarOverlay) sidebarOverlay.classList.remove('is-open');
    }
  });

  // ── 6. Боковая панель ──
  // HTML-разметка:
  //   <button data-sidebar="sidebar-id">Открыть</button>
  //   <div class="sidebar-overlay"></div>
  //   <aside class="sidebar" id="sidebar-id">
  //     <div class="sidebar__header">
  //       <h3>Заголовок</h3>
  //       <button class="modal__close" data-sidebar-close>×</button>
  //     </div>
  //     <div class="sidebar__body">...</div>
  //   </aside>
  document.querySelectorAll('[data-sidebar]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const sidebar = document.getElementById(trigger.getAttribute('data-sidebar'));
      const overlay = document.querySelector('.sidebar-overlay');
      if (sidebar) sidebar.classList.add('is-open');
      if (overlay) overlay.classList.add('is-open');
    });
  });

  document.querySelectorAll('.sidebar').forEach((sidebar) => {
    sidebar.querySelectorAll('[data-sidebar-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sidebar.classList.remove('is-open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('is-open');
      });
    });
  });

  // Закрытие по клику на оверлей
  const sidebarOverlay = document.querySelector('.sidebar-overlay');
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      sidebarOverlay.classList.remove('is-open');
      document.querySelectorAll('.sidebar.is-open').forEach((s) => s.classList.remove('is-open'));
    });
  }

  // ── 8. Сохранение значений фильтров после перезагрузки страницы ──
  // Форма фильтра отправляется методом GET, поэтому выбранные значения
  // всегда есть в URL (?key=value). Бэкенд по контракту может вернуть их
  // через объект filters — тогда поля уже заполнены сервером и мы их не
  // трогаем. Если же filters не пришёл, подставляем значения из URL:
  // так фильтр держит состояние при любом варианте бэкенда.
  (function restoreFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length === 0) return;

    document.querySelectorAll('form').forEach((form) => {
      if (String(form.method).toLowerCase() !== 'get') return;

      form.querySelectorAll('input[name], select[name]').forEach((field) => {
        const type = (field.type || '').toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'button') return;

        // Не перетираем то, что уже отрендерил сервер из filters
        if (field.value !== '' && field.value !== null) return;

        const urlValue = params.get(field.name);
        if (urlValue === null || urlValue === '') return;

        if (field.tagName === 'SELECT') {
          const hasOption = [...field.options].some((o) => o.value === urlValue);
          if (hasOption) field.value = urlValue;
        } else {
          field.value = urlValue;
        }
      });
    });
  })();

  // ── 9. Панель «Оформить клиента» (рабочее место менеджера) ──
  // Таблица туров содержит <button data-book-client data-tour-id="..."
  //   data-tour-title="..." data-route="..." data-date="..." data-hotel="..."
  //   data-price="...">. Клик подставляет эти значения в hidden-поле tour_id
  //   и сводку боковой панели, затем открывает её.
  const bookPanel = document.getElementById('bookPanel');
  if (bookPanel) {
    const tourIdInput = bookPanel.querySelector('input[name="tour_id"]');
    const setBp = (key, value) => {
      const el = bookPanel.querySelector('[data-bp="' + key + '"]');
      if (el) el.textContent = value || '—';
    };

    document.querySelectorAll('[data-book-client]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = btn.dataset;
        if (tourIdInput) tourIdInput.value = d.tourId || '';
        setBp('title', d.tourTitle);
        setBp('route', d.route);
        setBp('date', d.date);
        setBp('hotel', d.hotel);
        setBp('price', d.price ? d.price + ' ₽' : '—');

        bookPanel.classList.add('is-open');
        const ov = document.querySelector('.sidebar-overlay');
        if (ov) ov.classList.add('is-open');

        // Фокус на первое поле формы
        const firstInput = bookPanel.querySelector('input[name="client_name"]');
        if (firstInput) setTimeout(() => firstInput.focus(), 250);
      });
    });

    // Генерация читаемого пароля для аккаунта клиента ( Части 1 )
    // Формат: Tur2026!x9 — слово + год + спецсимвол + 2 случайных символа
    const generateBtn = document.getElementById('bp-generate-password');
    const passwordInput = document.getElementById('bp-client_password');
    if (generateBtn && passwordInput) {
      generateBtn.addEventListener('click', () => {
        const consonants = 'bcdfghjklmnpqrstvwxyz';
        const vowels = 'aeiou';
        const specials = '!@#$%&*';
        const random = (str) => str[Math.floor(Math.random() * str.length)];
        const year = new Date().getFullYear();

        // Читаемая часть: Tur + год
        let pwd = 'Tur' + year;
        // Спецсимвол
        pwd += random(specials);
        // 2 случайных буквы (согласная + гласная или наоборот)
        pwd += Math.random() > 0.5 ? random(consonants) + random(vowels) : random(vowels) + random(consonants);
        // Цифра
        pwd += String(Math.floor(Math.random() * 10));

        passwordInput.value = pwd;
        passwordInput.type = 'text';
        setTimeout(() => { passwordInput.type = 'password'; }, 3000);
      });
    }
  }

  // ── 10. Витрина главной: подгрузка туров «Показать ещё» ──
  // Кнопка #load-more-tours (views/index.ejs) хранит, сколько карточек уже
  // показано (data-offset) и размер порции (data-limit). Запрос идёт в тот же
  // GET /tours, но с format=json: фильтры берём из адресной строки, поэтому
  // подгрузка работает и после поиска через форму.
  const loadMoreBtn = document.getElementById('load-more-tours');
  if (loadMoreBtn) {
    const grid = document.getElementById('tours-grid');
    const wrap = document.getElementById('load-more-wrap') || loadMoreBtn.parentElement;

    // Подписи кодов — те же, что в EJS-шаблонах (DATA_CONTRACT.md, п. 2)
    const MEAL_LABELS = { RO: 'Без питания', BB: 'Только завтраки', HB: 'Полупансион', AI: 'Всё включено' };
    const TRANSFER_LABELS = { bus: 'Общий автобус', private: 'Личный автомобиль' };

    // Экранирование: строки из БД вставляются как HTML
    const esc = (value) =>
      String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const fmtPrice = (value) => {
      if (value == null || value === '') return '—';
      const number = Number(value);
      return Number.isNaN(number) ? String(value) : number.toLocaleString('ru-RU');
    };

    const plural = (n, forms) => {
      const abs = Math.abs(n) % 100;
      const last = abs % 10;
      if (abs > 10 && abs < 20) return forms[2];
      if (last > 1 && last < 5) return forms[1];
      if (last === 1) return forms[0];
      return forms[2];
    };

    const imgPath = (img) => {
      if (!img) return null;
      if (img.charAt(0) === '/' || /^https?:\/\//.test(img)) return img;
      return '/images/' + img;
    };

    const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0)));

    // Карточка повторяет разметку из views/index.ejs один в один
    function buildTourCard(tour) {
      const href = '/tours/' + Number(tour.id);
      const title = esc(tour.title);
      const src = imgPath(tour.image);

      const image = src
        ? `<img src="${esc(src)}" alt="${title}" loading="lazy" onerror="this.closest('.card__image').classList.add('card__image--empty'); this.remove();">`
        : '<div class="card__image--ph" style="position:absolute;inset:0;background:var(--grad-card);"></div>';

      const badges =
        (tour.destination_country
          ? `<span class="badge badge--country">${esc(tour.destination_country)}</span>`
          : '') +
        (Number(tour.hotel_stars)
          ? `<span class="badge badge--stars">${stars(tour.hotel_stars)}</span>`
          : '');

      const country =
        tour.destination_country && tour.destination_country !== tour.destination_city
          ? `<span class="card__route-country">· ${esc(tour.destination_country)}</span>`
          : '';

      const route =
        '<div class="card__route">' +
        esc(tour.departure_city || '') +
        '<span class="card__route-arrow">✈</span>' +
        esc(tour.destination_city || '') +
        country +
        '</div>';

      const hotel = tour.hotel_name
        ? `<li class="card__list-item"><span class="card__list-icon">🏨</span><span>${esc(tour.hotel_name)}</span></li>`
        : '';

      const meal = tour.hotel_meal
        ? `<li class="card__list-item"><span class="card__list-icon">🍽</span><span>Питание: <span class="badge badge--meal">${esc(MEAL_LABELS[tour.hotel_meal] || tour.hotel_meal)}</span></span></li>`
        : '';

      const durationParts = [];
      if (tour.nights) {
        durationParts.push(`${Number(tour.nights)} ${plural(Number(tour.nights), ['ночь', 'ночи', 'ночей'])}`);
      }
      if (tour.flight_duration) {
        durationParts.push(`⏱ ${esc(tour.flight_duration)}`);
      }
      const duration = durationParts.length
        ? `<li class="card__list-item"><span class="card__list-icon">🌙</span><span>${durationParts.join(' · ')}</span></li>`
        : '';

      const transfer = tour.transfer_type
        ? `<li class="card__list-item"><span class="card__list-icon">🚐</span><span>Трансфер: <span class="badge badge--transfer">${esc(TRANSFER_LABELS[tour.transfer_type] || tour.transfer_type)}</span></span></li>`
        : '';

      return `<article class="card">
  <a class="card__image" href="${href}" aria-label="${title}">
    ${image}
    <div class="card__badge">${badges}</div>
  </a>
  <div class="card__body">
    <h3 class="card__title"><a href="${href}">${title}</a></h3>
    ${route}
    <ul class="card__list">${hotel}${meal}${duration}${transfer}</ul>
    <div class="card__footer">
      <span class="card__price">${fmtPrice(tour.total_price)} ₽</span>
      <a class="btn btn--primary btn--sm" href="${href}">Подробнее</a>
    </div>
  </div>
</article>`;
    }

    loadMoreBtn.addEventListener('click', async () => {
      if (loadMoreBtn.disabled) return;

      const offset = Number(loadMoreBtn.dataset.offset) || 0;
      const limit = Number(loadMoreBtn.dataset.limit) || 6;
      const label = loadMoreBtn.textContent;

      // Текущие фильтры + параметры порции
      const params = new URLSearchParams(window.location.search);
      params.set('format', 'json');
      params.set('offset', String(offset));
      params.set('limit', String(limit));

      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Загрузка…';

      try {
        const response = await fetch('/tours?' + params.toString(), {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const data = await response.json();
        const tours = Array.isArray(data.tours) ? data.tours : [];

        if (grid && tours.length > 0) {
          grid.insertAdjacentHTML('beforeend', tours.map(buildTourCard).join(''));
        }

        loadMoreBtn.dataset.offset = String(offset + tours.length);

        if (!data.hasMore || tours.length === 0) {
          // Плавное скрытие: переход задан в .load-more (style.css)
          wrap.classList.add('is-hidden');
          setTimeout(() => wrap.remove(), 320);
        } else {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = label;
        }
      } catch (err) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = label;
        console.error('Не удалось подгрузить туры:', err);
        alert('Не удалось загрузить туры. Проверьте соединение и попробуйте ещё раз.');
      }
    });
  }

  // ── 11. Копирование в буфер обмена (CRM: серия и номер паспорта) ──
  // HTML: <button data-copy="1234 567890">Скопировать</button>
  // Отклик: кнопка на 1.5 сек показывает «Скопировано!».
  const copyText = async (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback для старых браузеров и небезопасного контекста (http)
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  };

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy') || '';
      if (!text) return;

      const label = btn.textContent;
      try {
        await copyText(text);
        btn.textContent = 'Скопировано!';
        btn.classList.add('is-copied');
      } catch (err) {
        console.error('Не удалось скопировать:', err);
        btn.textContent = 'Ошибка';
      }

      setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove('is-copied');
      }, 1500);
    });
  });

  // ── 12. Подтверждение опасных действий ──
  // HTML: <form method="POST" data-confirm="Отменить бронь?">...</form>
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      const message = form.getAttribute('data-confirm') || 'Подтвердить действие?';
      if (!window.confirm(message)) {
        e.preventDefault();
      }
    });
  });

  // ── 13. Мини-превью загружаемых файлов (Этап 3) ──────────────────────────
  // Поля: client_photo, passport_scan (tour.ejs и manager.ejs).
  // Контейнер превью: #preview_client_photo, #preview_passport_scan
  // и их аналоги с префиксом "bp-" в manager.ejs.
  (function filePreviews() {
    const MAX_SIZE = 5 * 1024 * 1024;
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

    const fileInputs = document.querySelectorAll('input[type="file"][name="client_photo"], input[type="file"][name="passport_scan"]');

    fileInputs.forEach((input) => {
      // Ищем контейнер превью: id="preview_<name>" или id="bp-preview_<name>"
      const name = input.name;
      const preview = document.getElementById('preview_' + name) || document.getElementById('bp-preview_' + name);
      if (!preview) return;

      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        preview.innerHTML = '';

        if (!file) return;

        // Проверка MIME-типа
        if (!ALLOWED.includes(file.type)) {
          preview.innerHTML = '<span class="file-preview__error">Недопустимый формат. Разрешены JPG, PNG, WEBP.</span>';
          input.value = '';
          return;
        }

        // Проверка размера
        if (file.size > MAX_SIZE) {
          const mb = (file.size / 1024 / 1024).toFixed(1);
          preview.innerHTML = `<span class="file-preview__error">Файл ${mb} МБ превышает 5 МБ.</span>`;
          input.value = '';
          return;
        }

        // Создаём превью
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.className = 'file-preview__thumb';
          img.alt = file.name;

          const info = document.createElement('span');
          info.className = 'file-preview__info';
          info.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} КБ)`;

          preview.appendChild(img);
          preview.appendChild(info);
        };
        reader.readAsDataURL(file);
      });
    });
  })();

  // ── 14. Конструктор туров (админ-панель, Этап 5) ──
  // Авторасчёт прилёта: departure_at + flight_duration_minutes = arrival_at
  // flight_duration (строка) — авто из минут. departure_at ≥ сегодня.
  (function tourBuilder() {
    const toggle = document.getElementById('tour-builder-toggle');
    const body = document.getElementById('tour-builder-body');
    const form = document.getElementById('tour-form');
    if (!form) return;

    const formTitle = document.getElementById('tour-form-title');
    const submitBtn = document.getElementById('tour-form-submit');
    const cancelBtn = document.getElementById('tour-form-cancel-edit');
    const totalPreview = document.getElementById('tour-total-preview');

    const priceFields = [
      form.querySelector('[name="flight_price"]'),
      form.querySelector('[name="hotel_price"]'),
      form.querySelector('[name="transfer_price"]'),
    ];

    // Ссылки на поля авторасчёта
    const departureInput = form.querySelector('[name="departure_at"]');
    const arrivalInput = form.querySelector('[name="arrival_at"]');
    const durationInput = form.querySelector('[name="flight_duration"]');
    const durationMinutesInput = form.querySelector('[name="flight_duration_minutes"]');
    const durationReadable = document.getElementById('tb-duration-readable');

    // ── Утилиты ──

    // «2ч 40мин» → 160; «6ч» → 360; «40мин» → 40; «160» → 160
    function parseDurationToMinutes(str) {
      if (str == null) return null;
      const s = String(str).trim();
      if (!s) return null;

      // Только число — трактуем как минуты (допустимо по DATA_CONTRACT.md, п. 2)
      if (/^\d+$/.test(s)) return Number(s);

      // Часы + необязательные минуты: «2ч 40мин», «3ч10мин», «6ч», «2h 40m»
      const hm = s.match(
        /^(\d+)\s*(?:ч|час|часов|hours?|hrs?|h)(?:\s*(\d+)\s*(?:м|мин|minutes?|mins?|m))?$/i
      );
      if (hm) return Number(hm[1]) * 60 + (Number(hm[2]) || 0);

      // Только минуты: «40мин», «40m»
      const mm = s.match(/^(\d+)\s*(?:м|мин|minutes?|mins?|m)$/i);
      if (mm) return Number(mm[1]);

      return null;
    }

    // минуты → «2ч 40мин»
    function formatReadable(mins) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}ч ${m}мин`;
    }

    // ISO-даты в datetime-local: YYYY-MM-DDTHH:mm
    function toDatetimeLocal(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
        + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    // ── Авторасчёт: прилёт + читаемая строка ──
    function recalcArrival() {
      const depVal = departureInput ? departureInput.value : '';
      const minsVal = durationMinutesInput ? durationMinutesInput.value : '';
      if (!depVal || !minsVal) {
        if (arrivalInput) arrivalInput.value = '';
        if (durationInput) durationInput.value = '';
        if (durationReadable) durationReadable.textContent = '—';
        return;
      }
      const depDate = new Date(depVal);
      if (isNaN(depDate.getTime())) {
        if (arrivalInput) arrivalInput.value = '';
        if (durationInput) durationInput.value = '';
        if (durationReadable) durationReadable.textContent = '—';
        return;
      }
      const mins = Number(minsVal);
      if (!Number.isFinite(mins) || mins <= 0) {
        if (arrivalInput) arrivalInput.value = '';
        if (durationInput) durationInput.value = '';
        if (durationReadable) durationReadable.textContent = '—';
        return;
      }
      const arrDate = new Date(depDate.getTime() + mins * 60 * 1000);
      if (arrivalInput) arrivalInput.value = toDatetimeLocal(arrDate);
      if (durationInput) durationInput.value = formatReadable(mins);
      if (durationReadable) durationReadable.textContent = formatReadable(mins);
    }

    // ── Счётчик итоговой цены ──
    function updateTotal() {
      let sum = 0;
      priceFields.forEach((f) => {
        const v = Number(f.value);
        if (Number.isFinite(v) && v >= 0) sum += v;
      });
      totalPreview.textContent = sum.toLocaleString('ru-RU');
    }

    priceFields.forEach((f) => {
      if (f) f.addEventListener('input', updateTotal);
    });

    // ── Минимальное значение departure_at = сейчас ──
    function setMinNow() {
      if (departureInput) {
        // datetime-local принимает формат YYYY-MM-DDTHH:mm;
        // ставим текущие часы и минуты (секунды = 00).
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        departureInput.setAttribute('min',
          now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
          + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes()));
      }
    }

    // Слушатели авторасчёта
    if (departureInput) departureInput.addEventListener('input', recalcArrival);
    if (durationMinutesInput) durationMinutesInput.addEventListener('input', recalcArrival);

    // ── Сворачивание/разворачивание конструктора ──
    if (toggle && body) {
      toggle.addEventListener('click', () => {
        const isVisible = body.style.display !== 'none';
        body.style.display = isVisible ? 'none' : 'block';
        toggle.querySelector('.tour-builder__toggle-icon').textContent = isVisible ? '＋' : '−';
      });
    }

    // ── Режим редактирования ──
    document.querySelectorAll('[data-edit-tour]').forEach((btn) => {
      btn.addEventListener('click', () => {
        let tour;
        try {
          tour = JSON.parse(btn.getAttribute('data-tour'));
        } catch (e) {
          console.error('Не удалось разобрать данные тура:', e);
          return;
        }

        if (body && body.style.display === 'none') {
          body.style.display = 'block';
          if (toggle) toggle.querySelector('.tour-builder__toggle-icon').textContent = '−';
        }

        const setVal = (name, value) => {
          const el = form.querySelector('[name="' + name + '"]');
          if (el) el.value = value != null ? String(value) : '';
        };

        setVal('title', tour.title);
        setVal('description', tour.description);
        setVal('image', tour.image);
        setVal('rating', tour.rating);
        setVal('nights', tour.nights);
        setVal('departure_city', tour.departure_city);
        setVal('destination_country', tour.destination_country);
        setVal('destination_city', tour.destination_city);
        setVal('departure_at', toDatetimeLocal(tour.departure_at));
        setVal('flight_class', tour.flight_class);
        setVal('flight_price', tour.flight_price);
        setVal('hotel_name', tour.hotel_name);
        setVal('hotel_stars', tour.hotel_stars);
        setVal('hotel_meal', tour.hotel_meal);
        setVal('hotel_price', tour.hotel_price);
        setVal('transfer_type', tour.transfer_type);
        setVal('transfer_price', tour.transfer_price);

        // Парсим flight_duration → минуты → заполняем flight_duration_minutes
        const parsedMins = parseDurationToMinutes(tour.flight_duration);
        if (durationMinutesInput && parsedMins != null) {
          durationMinutesInput.value = parsedMins;
        } else if (durationMinutesInput) {
          durationMinutesInput.value = '';
        }

        // Пересчитаем прилёт и строку
        recalcArrival();

        formTitle.textContent = 'Редактирование тура #' + tour.id;
        form.action = '/admin/tours/' + tour.id + '/edit';
        submitBtn.textContent = 'Сохранить изменения';
        cancelBtn.style.display = 'inline-flex';

        updateTotal();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // ── Отмена редактирования ──
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        form.reset();
        form.action = '/admin/tours/create';
        formTitle.textContent = 'Создание нового тура';
        submitBtn.textContent = 'Создать тур';
        cancelBtn.style.display = 'none';
        totalPreview.textContent = '0';
        recalcArrival();
      });
    }

    // Инициализация
    setMinNow();
    updateTotal();
  })();
});
