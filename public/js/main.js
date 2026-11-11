// Клиентские скрипты: мобильное меню, активная ссылка, заглушки картинок

document.addEventListener('DOMContentLoaded', () => {
  // 1. Мобильное меню
  const burger = document.querySelector('.burger');
  const nav = document.getElementById('nav');

  if (burger && nav) {
    burger.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', isOpen);
      burger.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // 2. Подсветка активного пункта меню по текущему адресу
  const path = window.location.pathname;
  document.querySelectorAll('.nav__link').forEach((link) => {
    const href = link.getAttribute('href');
    const isHome = href === '/' && path === '/';
    const isSection = href !== '/' && path.startsWith(href);
    if (isHome || isSection) {
      link.classList.add('is-active');
    }
  });

  // 3. Если картинки тура ещё нет — скрываем её,
  //    остаётся градиентная подложка из CSS
  document.querySelectorAll('.card__image img, .tour__image img').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
    });
  });

  // 4. Кнопка бронирования (пока без серверной части)
  document.querySelectorAll('[data-book]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.book;
      button.textContent = 'Заявка отправлена';
      button.disabled = true;
      console.log('Бронирование тура id =', id);
    });
  });
});
