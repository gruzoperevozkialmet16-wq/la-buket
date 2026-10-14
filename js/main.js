import { getFlowers, getShop } from './store.js';
import { CATEGORIES } from './config.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hasGsap = typeof window.gsap !== 'undefined';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let flowers = [];
let shop = {};
const state = { cat: 'all', q: '', sort: 'default', shown: 12 };
let introDone = false;
const PAGE = 12;

/* ---------- Запуск ---------- */

document.documentElement.classList.toggle('no-gsap', !hasGsap);
$('#year').textContent = new Date().getFullYear();

const heroModule = import('./hero3d.js');

let lenis = null;
if (window.Lenis && !reduceMotion) {
  lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
  if (hasGsap) {
    lenis.on('scroll', window.ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}

init();

async function init() {
  [flowers, shop] = await Promise.all([getFlowers().catch(() => []), getShop()]);
  applyShop();
  renderChips();
  renderGrid();
  buildRing();
  renderCart();
  const heroReady = heroModule
    .then(({ initHero }) => initHero($('#heroCanvas'), heroItems(), openProduct))
    .catch(() => $('.hero').classList.add('no-webgl'));
  await Promise.race([heroReady, new Promise((r) => setTimeout(r, 2500))]);
  setTimeout(() => {
    $('#preloader').classList.add('is-done');
    introAnimations();
  }, 900);
}

// Если администратор изменил каталог в соседней вкладке — обновляем витрину сразу.
window.addEventListener('storage', async (e) => {
  if (!e.key || !e.key.startsWith('labuket:') || e.key === 'labuket:cart') return;
  [flowers, shop] = await Promise.all([getFlowers(), getShop()]);
  applyShop();
  renderChips();
  renderGrid();
  buildRing();
});

// Фото для 3D-галереи на первом экране: сначала хиты, затем самые дорогие композиции.
function heroItems() {
  const hits = flowers.filter((f) => f.hit);
  const rest = flowers.filter((f) => !f.hit).sort((a, b) => b.price - a.price);
  return hits.concat(rest).slice(0, 9).map((f) => ({ id: f.id, image: f.image }));
}

/* ---------- Данные магазина ---------- */

function applyShop() {
  const tel = 'tel:+' + shop.phoneRaw;
  $$('[data-shop-phone]').forEach((a) => {
    a.href = tel;
    const b = a.querySelector('b');
    (b || a).textContent = shop.phone;
  });
  $$('[data-shop-wa]').forEach((a) => (a.href = `https://wa.me/${shop.phoneRaw}`));
  $$('[data-shop-tg]').forEach((a) => (a.href = `https://t.me/${shop.telegram}`));
  $$('[data-shop-address]').forEach((el) => (el.textContent = shop.address));
  $$('[data-shop-region]').forEach((el) => (el.textContent = shop.region));
  $$('[data-shop-hours]').forEach((el) => (el.textContent = shop.hours));
  $$('[data-shop-rating]').forEach((el) => (el.textContent = shop.rating));
  const m = String(shop.hours).match(/(с\s*\d{1,2}[:.]\d{2}(\s*до\s*\d{1,2}[:.]\d{2})?)/i);
  $$('[data-shop-hours-short]').forEach((el) => (el.textContent = m ? m[1] : shop.hours));
  const ann = $('#announce');
  ann.hidden = !shop.announcement;
  ann.textContent = shop.announcement || '';
}

/* ---------- Каталог ---------- */

function filtered() {
  const q = state.q.trim().toLowerCase();
  let list = flowers.filter((f) => state.cat === 'all' || f.category === state.cat);
  if (q) list = list.filter((f) => `${f.name} ${f.kind} ${f.description}`.toLowerCase().includes(q));
  if (state.sort === 'asc') list = [...list].sort((a, b) => a.price - b.price);
  if (state.sort === 'desc') list = [...list].sort((a, b) => b.price - a.price);
  return list;
}

function renderChips() {
  const counts = flowers.reduce((acc, f) => ((acc[f.category] = (acc[f.category] || 0) + 1), acc), {});
  const cats = CATEGORIES.filter((c) => c.id === 'all' || counts[c.id]);
  if (!cats.some((c) => c.id === state.cat)) state.cat = 'all';
  $('#chips').innerHTML = cats
    .map((c) => `<button class="chip${c.id === state.cat ? ' is-active' : ''}" data-cat="${c.id}" role="tab">${c.label}<sup>${c.id === 'all' ? flowers.length : counts[c.id]}</sup></button>`)
    .join('');
}

$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  state.cat = b.dataset.cat;
  state.shown = PAGE;
  $$('.chip').forEach((c) => c.classList.toggle('is-active', c === b));
  renderGrid(true);
});

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value;
    state.shown = PAGE;
    renderGrid(true);
  }, 180);
});
$('#sort').addEventListener('change', (e) => {
  state.sort = e.target.value;
  renderGrid(true);
});
$('#more').addEventListener('click', () => {
  state.shown += PAGE;
  renderGrid(false, true);
});

function cardHTML(f) {
  return `
    <article class="card" data-id="${esc(f.id)}">
      <div class="card__media">
        ${f.hit ? '<span class="card__tag">Хит</span>' : ''}
        <img src="${esc(f.image)}" alt="${esc(f.name)}" loading="lazy">
        <span class="card__glare"></span>
      </div>
      <div class="card__body">
        <p class="card__kind">${esc(f.kind || CATEGORIES.find((c) => c.id === f.category)?.label || '')}</p>
        <h3 class="card__name">${esc(f.name)}</h3>
        <p class="card__desc">${esc(f.description)}</p>
        <div class="card__foot">
          <span class="card__price">${fmt(f.price)}</span>
          <button class="card__add" data-add="${esc(f.id)}" aria-label="Добавить в корзину">+</button>
        </div>
      </div>
    </article>`;
}

function renderGrid(animate = false, appendOnly = false) {
  const list = filtered();
  const grid = $('#grid');
  const prevCount = appendOnly ? grid.children.length : 0;
  const slice = list.slice(0, state.shown);
  if (appendOnly) grid.insertAdjacentHTML('beforeend', slice.slice(prevCount).map(cardHTML).join(''));
  else grid.innerHTML = slice.map(cardHTML).join('');
  $('#empty').hidden = list.length > 0;
  $('#more').parentElement.hidden = list.length <= state.shown;
  const fresh = [...grid.children].slice(prevCount);
  fresh.forEach(bindTilt);
  if (hasGsap && (animate || appendOnly || !introDone)) {
    gsap.fromTo(fresh, { opacity: 0, y: 60, rotateX: -18 }, {
      opacity: 1, y: 0, rotateX: 0, duration: 1, ease: 'expo.out', stagger: 0.06,
      scrollTrigger: animate || appendOnly ? undefined : { trigger: grid, start: 'top 85%' },
    });
  }
  if (hasGsap) window.ScrollTrigger.refresh();
}

$('#grid').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) {
    e.stopPropagation();
    addToCart(add.dataset.add, 1, add);
    return;
  }
  const card = e.target.closest('.card');
  if (card) openProduct(card.dataset.id);
});

// 3D-наклон карточки за курсором + блик
function bindTilt(el) {
  if (!finePointer || reduceMotion) return;
  const max = el.classList.contains('service') ? 8 : 10;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `rotateY(${(px - 0.5) * max}deg) rotateX(${(0.5 - py) * max}deg) translateZ(10px)`;
    el.style.transition = 'transform 0.15s ease-out, border-color .4s, box-shadow .6s';
    el.style.setProperty('--gx', px * 100 + '%');
    el.style.setProperty('--gy', py * 100 + '%');
  });
  el.addEventListener('pointerleave', () => {
    el.style.transition = '';
    el.style.transform = '';
  });
}
$$('.tilt').forEach(bindTilt);

/* ---------- 3D-карусель хитов ---------- */

const ring = { el: $('#ring'), stage: $('#ringStage'), items: [], rot: 0, target: 0, step: 0, radius: 0, dragging: false, idleAt: 0 };

function buildRing() {
  let hits = flowers.filter((f) => f.hit);
  if (hits.length < 6) {
    const extra = [...flowers].filter((f) => !f.hit).sort((a, b) => b.price - a.price);
    hits = hits.concat(extra.slice(0, 8 - hits.length));
  }
  hits = hits.slice(0, 12);
  ring.items = hits;
  ring.step = hits.length ? 360 / hits.length : 0;
  ring.el.innerHTML = hits
    .map((f, i) => `
      <div class="ring-card" data-i="${i}" data-id="${esc(f.id)}">
        <img src="${esc(f.image)}" alt="${esc(f.name)}" loading="lazy">
        <div class="ring-card__label"><b>${esc(f.name)}</b><span>${fmt(f.price)}</span></div>
      </div>`)
    .join('');
  layoutRing();
}

function layoutRing() {
  const card = ring.el.firstElementChild;
  if (!card) return;
  const w = card.offsetWidth;
  const n = ring.items.length;
  ring.radius = Math.round(w / 2 / Math.tan(Math.PI / n) + Math.max(30, w * 0.18));
  [...ring.el.children].forEach((c, i) => {
    c.dataset.angle = i * ring.step;
  });
}
window.addEventListener('resize', layoutRing);

function frontIndex() {
  const n = ring.items.length;
  return ((Math.round(-ring.rot / ring.step) % n) + n) % n;
}

function tickRing() {
  requestAnimationFrame(tickRing);
  if (!ring.items.length) return;
  if (!ring.dragging && !reduceMotion && performance.now() - ring.idleAt > 3500) ring.target -= 0.06;
  ring.rot += (ring.target - ring.rot) * 0.08;
  ring.el.style.transform = `translateZ(${-ring.radius}px) rotateX(-4deg) rotateY(${ring.rot}deg)`;
  const fi = frontIndex();
  [...ring.el.children].forEach((c, i) => {
    const a = ((i * ring.step + ring.rot) * Math.PI) / 180;
    const facing = (Math.cos(a) + 1) / 2;
    c.style.transform = `rotateY(${i * ring.step}deg) translateZ(${ring.radius}px)`;
    c.style.opacity = (0.18 + facing * facing * 0.82).toFixed(3);
    c.style.zIndex = Math.round(facing * 100);
    c.style.filter = `saturate(${0.55 + facing * 0.45})`;
    c.classList.toggle('is-front', i === fi);
  });
  const f = ring.items[fi];
  const cap = $('#ringCaption');
  if (f && cap.dataset.id !== f.id) {
    cap.dataset.id = f.id;
    cap.innerHTML = `${esc(f.name)}<small>${fmt(f.price)}</small>`;
  }
}
tickRing();

function snapTo(delta) {
  ring.idleAt = performance.now();
  ring.target = Math.round(ring.target / ring.step) * ring.step + delta * ring.step;
}
$('#ringPrev').addEventListener('click', () => snapTo(1));
$('#ringNext').addEventListener('click', () => snapTo(-1));

(() => {
  let startX = 0, startT = 0, moved = 0;
  ring.stage.addEventListener('pointerdown', (e) => {
    ring.dragging = true;
    startX = e.clientX;
    startT = ring.target;
    moved = 0;
    ring.stage.setPointerCapture(e.pointerId);
  });
  ring.stage.addEventListener('pointermove', (e) => {
    if (!ring.dragging) return;
    moved = e.clientX - startX;
    ring.target = startT + moved * 0.25;
  });
  const end = (e) => {
    if (!ring.dragging) return;
    ring.dragging = false;
    ring.idleAt = performance.now();
    if (Math.abs(moved) < 6) {
      const card = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ring-card');
      if (card) {
        const i = +card.dataset.i;
        if (i === frontIndex()) openProduct(card.dataset.id);
        else {
          // кратчайший поворот к выбранной карточке
          const n = ring.items.length;
          let d = (i - frontIndex() + n) % n;
          if (d > n / 2) d -= n;
          snapTo(-d);
        }
      }
    } else snapTo(0);
  };
  ring.stage.addEventListener('pointerup', end);
  ring.stage.addEventListener('pointercancel', end);
})();

/* ---------- Карточка товара ---------- */

let current = null;
let qty = 1;

function openProduct(id) {
  const f = flowers.find((x) => x.id === id);
  if (!f) return;
  current = f;
  qty = 1;
  $('#pmImg').src = f.image;
  $('#pmImg').alt = f.name;
  $('#pmKind').textContent = f.kind || CATEGORIES.find((c) => c.id === f.category)?.label || '';
  $('#pmName').textContent = f.name;
  $('#pmPrice').textContent = fmt(f.price);
  $('#pmDesc').textContent = f.description;
  $('#pmQty').textContent = qty;
  $('#pmQuick').href = `https://wa.me/${shop.phoneRaw}?text=${encodeURIComponent(`Здравствуйте! Хочу заказать букет «${f.name}» за ${fmt(f.price)}.`)}`;
  openLayer($('#productModal'));
}

$('#productModal').addEventListener('click', (e) => {
  const q = e.target.closest('[data-q]');
  if (q) {
    qty = Math.max(1, qty + Number(q.dataset.q));
    $('#pmQty').textContent = qty;
  }
});
$('#pmAdd').addEventListener('click', () => {
  if (!current) return;
  addToCart(current.id, qty);
  closeLayer($('#productModal'));
});

function openLayer(el) {
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  lenis?.stop();
  document.body.style.overflow = 'hidden';
}
function closeLayer(el) {
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  if (!$('.modal.is-open, .drawer.is-open')) {
    lenis?.start();
    document.body.style.overflow = '';
  }
}
$$('.modal, .drawer').forEach((el) => el.addEventListener('click', (e) => e.target.closest('[data-close]') && closeLayer(el)));
document.addEventListener('keydown', (e) => e.key === 'Escape' && $$('.is-open').forEach(closeLayer));

/* ---------- Корзина ---------- */

const CART_KEY = 'labuket:cart';
let cart = (() => {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
})();
const saveCart = () => {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* приватный режим */ }
};

function addToCart(id, n = 1, fromEl) {
  const line = cart.find((l) => l.id === id);
  if (line) line.qty += n;
  else cart.push({ id, qty: n });
  saveCart();
  renderCart();
  const btn = $('#cartOpen');
  btn.classList.remove('bump');
  void btn.offsetWidth;
  btn.classList.add('bump');
  if (fromEl) flyToCart(fromEl);
  const f = flowers.find((x) => x.id === id);
  toast(`«${f?.name}» в корзине`);
}

function flyToCart(fromEl) {
  const img = fromEl.closest('.card')?.querySelector('img');
  if (!img || !hasGsap) return;
  const a = img.getBoundingClientRect();
  const b = $('#cartOpen').getBoundingClientRect();
  const ghost = img.cloneNode();
  Object.assign(ghost.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', objectFit: 'cover', borderRadius: '20px', zIndex: 90, pointerEvents: 'none' });
  document.body.appendChild(ghost);
  gsap.to(ghost, {
    left: b.left + b.width / 2 - 10, top: b.top + b.height / 2 - 10, width: 20, height: 20, borderRadius: '50%', opacity: 0.4, rotate: 25,
    duration: 0.9, ease: 'power3.inOut', onComplete: () => ghost.remove(),
  });
}

function cartLines() {
  return cart.map((l) => ({ ...l, f: flowers.find((x) => x.id === l.id) })).filter((l) => l.f);
}

function renderCart() {
  const lines = cartLines();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.f.price, 0);
  const badge = $('#cartCount');
  badge.textContent = count;
  badge.classList.toggle('has', count > 0);
  $('#cartTotal').textContent = fmt(total);
  $('#cartItems').innerHTML = lines.length
    ? lines.map((l) => `
      <div class="cart-item" data-id="${esc(l.id)}">
        <img src="${esc(l.f.image)}" alt="">
        <div>
          <b>${esc(l.f.name)}</b><small>${fmt(l.f.price)}</small>
          <div class="qty"><button data-cq="-1">−</button><span>${l.qty}</span><button data-cq="1">+</button></div>
        </div>
        <button class="cart-item__rm" data-rm aria-label="Удалить">✕</button>
      </div>`).join('')
    : '<p class="cart-empty">Корзина пуста — выберите букет в каталоге</p>';
  $('#checkout').hidden = !lines.length;
}

$('#cartItems').addEventListener('click', (e) => {
  const row = e.target.closest('.cart-item');
  if (!row) return;
  const line = cart.find((l) => l.id === row.dataset.id);
  if (e.target.closest('[data-rm]')) cart = cart.filter((l) => l !== line);
  const q = e.target.closest('[data-cq]');
  if (q) {
    line.qty += Number(q.dataset.cq);
    if (line.qty < 1) cart = cart.filter((l) => l !== line);
  }
  saveCart();
  renderCart();
});

$('#cartOpen').addEventListener('click', () => openLayer($('#cart')));
$('#checkout').addEventListener('change', (e) => {
  if (e.target.name === 'delivery') $('#addrField').hidden = e.target.value !== 'Доставка';
});

$('#checkout').addEventListener('submit', async (e) => {
  e.preventDefault();
  const via = e.submitter?.dataset.via || 'wa';
  const d = Object.fromEntries(new FormData(e.target));
  const lines = cartLines();
  const total = lines.reduce((s, l) => s + l.qty * l.f.price, 0);
  const text = [
    'Здравствуйте! Хочу оформить заказ на сайте «Ля Букет»:',
    ...lines.map((l) => `• ${l.f.name} × ${l.qty} — ${fmt(l.f.price * l.qty)}`),
    `Итого: ${fmt(total)}`,
    '',
    `Получение: ${d.delivery}`,
    d.delivery === 'Доставка' && d.address ? `Адрес: ${d.address}` : '',
    d.when ? `Когда: ${d.when}` : '',
    `Имя: ${d.name}`,
    `Телефон: ${d.phone}`,
    d.note ? `Пожелания / открытка: ${d.note}` : '',
  ].filter(Boolean).join('\n');

  if (via === 'tg') {
    try { await navigator.clipboard.writeText(text); } catch { /* нет доступа к буферу */ }
    window.open(`https://t.me/${shop.telegram}`, '_blank', 'noopener');
    toast('Текст заказа скопирован — вставьте его в чат Telegram');
  } else {
    window.open(`https://wa.me/${shop.phoneRaw}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    toast('Открываем WhatsApp…');
  }
});

/* ---------- Тост ---------- */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 2600);
}

/* ---------- Шапка, меню ---------- */

let lastY = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  const h = $('#header');
  h.classList.toggle('is-scrolled', y > 40);
  h.classList.toggle('is-hidden', y > lastY && y > 500 && !document.body.classList.contains('menu-open'));
  lastY = y;
}, { passive: true });

$('#burger').addEventListener('click', () => document.body.classList.toggle('menu-open'));
$$('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const target = id.length > 1 ? $(id) : null;
    document.body.classList.remove('menu-open');
    if (!target && id !== '#top') return;
    e.preventDefault();
    const top = target ? target.getBoundingClientRect().top + window.scrollY - 70 : 0;
    if (lenis) lenis.scrollTo(top);
    else window.scrollTo({ top, behavior: 'smooth' });
  })
);

/* ---------- Курсор и «магнитные» кнопки ---------- */

if (finePointer && !reduceMotion) {
  const cur = $('#cursor');
  let cx = 0, cy = 0, tx = 0, ty = 0;
  window.addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    cur.classList.add('is-on');
  });
  (function loop() {
    cx += (tx - cx) * 0.2;
    cy += (ty - cy) * 0.2;
    cur.style.transform = `translate(${cx}px, ${cy}px)`;
    requestAnimationFrame(loop);
  })();
  document.addEventListener('pointerover', (e) => {
    cur.classList.toggle('is-hover', Boolean(e.target.closest('a, button, .card, .ring-card, .chip, select, input')));
  });

  $$('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    });
    el.addEventListener('pointerleave', () => (el.style.transform = ''));
  });
}

/* ---------- Анимации GSAP ---------- */

function introAnimations() {
  introDone = true;
  if (!hasGsap) return;
  gsap.registerPlugin(window.ScrollTrigger);

  // заголовок первого экрана — строки «выезжают» снизу
  $$('.hero__title .split').forEach((line) => {
    line.innerHTML = `<span>${line.innerHTML}</span>`;
  });
  gsap.from('.hero__title .split > span', { yPercent: 115, rotate: 4, duration: 1.4, ease: 'expo.out', stagger: 0.12 });
  gsap.from('.reveal-hero', { opacity: 0, y: 30, duration: 1.2, ease: 'expo.out', stagger: 0.1, delay: 0.35 });

  $$('.reveal').forEach((el) => {
    gsap.from(el, { opacity: 0, y: 50, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
  });
  $$('.section .eyebrow').forEach((el) => {
    gsap.from(el, { opacity: 0, x: -20, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%' } });
  });

  // карусель «вплывает» из глубины
  gsap.from('#ring', { scale: 0.6, opacity: 0, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: '#ringStage', start: 'top 80%' } });

  // каскад фото в «О салоне» раскрывается веером при прокрутке
  const stack = $$('#stack img');
  gsap.timeline({ scrollTrigger: { trigger: '#stack', start: 'top 85%', end: 'bottom 40%', scrub: 1 } })
    .from(stack[0], { rotate: 0, x: 80, rotateY: 30 }, 0)
    .from(stack[1], { rotate: 0, x: -80, rotateY: -30 }, 0)
    .from(stack[2], { y: 80, scale: 0.9 }, 0);

  gsap.from('.service', { opacity: 0, y: 80, rotateX: -25, duration: 1.2, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.services', start: 'top 85%' } });
  gsap.from('.review', { opacity: 0, x: 80, duration: 1.2, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '#reviewsTrack', start: 'top 85%' } });
  gsap.from('.contacts__card, .map', { opacity: 0, y: 70, rotateX: -10, duration: 1.3, ease: 'expo.out', stagger: 0.15, scrollTrigger: { trigger: '.contacts__grid', start: 'top 85%' } });

  // счётчики
  $$('[data-count]').forEach((el) => {
    const end = parseFloat(el.dataset.count);
    const dec = Number(el.dataset.decimals || 0);
    const obj = { v: 0 };
    gsap.to(obj, {
      v: end, duration: 2.2, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%' },
      onUpdate: () => (el.textContent = obj.v.toFixed(dec).replace('.', ',') + (el.dataset.suffix || '')),
    });
  });

}
