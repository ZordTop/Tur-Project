// Клиентские скрипты: меню, активная ссылка, табы, модалки, сайдбар

document.addEventListener('DOMContentLoaded', () => {
  // ── 0. Показ / скрытие пароля ──
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
  }
});
