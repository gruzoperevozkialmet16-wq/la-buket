import {
  isCloud, getFlowers, saveFlower, deleteFlower, replaceAll, resetToSeed,
  getShop, saveShop, uploadImage, login, isAuthed, logout, ensureCloudSeeded,
} from './store.js';
import { CATEGORIES } from './config.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;
const CATS = CATEGORIES.filter((c) => c.id !== 'all');

let flowers = [];
let editing = null;

/* ---------- Вход ---------- */

$('#loginEmail').hidden = !isCloud;
$('#loginEmail').required = isCloud;

(async () => {
  if (await isAuthed()) showApp();
  else $('#login').hidden = false;
})();

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    await login(fd.get('email'), fd.get('password'));
    $('#login').hidden = true;
    showApp();
  } catch (err) {
    $('#loginError').textContent = err.message;
    const card = $('.login__card');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  } finally {
    btn.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await logout();
  location.reload();
});

async function showApp() {
  $('#app').hidden = false;
  const banner = $('#modeBanner');
  if (isCloud) {
    banner.classList.add('is-cloud');
    banner.innerHTML = '<b>Облачный режим.</b> Изменения сохраняются в базе и сразу видны всем посетителям сайта.';
  } else {
    banner.innerHTML = '<b>Локальный режим.</b> Изменения сохраняются в этом браузере — откройте сайт здесь же, чтобы увидеть их. Чтобы правки видели все покупатели, подключите облако (см. README, раздел «Supabase»). Делайте резервные копии через меню «Ещё».';
  }
  $('#catFilter').innerHTML = '<option value="all">Все категории</option>' + CATS.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
  $('#catSelect').innerHTML = CATS.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
  try {
    await ensureCloudSeeded();
  } catch (err) {
    toast('Облако недоступно: ' + err.message, true);
  }
  await reload();
  fillSettings();
}

async function reload() {
  try {
    flowers = await getFlowers({ includeHidden: true });
  } catch (err) {
    toast('Не удалось загрузить каталог: ' + err.message, true);
    flowers = [];
  }
  render();
}

/* ---------- Вкладки ---------- */

$$('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('is-active', x === t));
    $('#tab-catalog').hidden = t.dataset.tab !== 'catalog';
    $('#tab-settings').hidden = t.dataset.tab !== 'settings';
  })
);

/* ---------- Список ---------- */

function render() {
  const visible = flowers.filter((f) => f.visible !== false).length;
  $('#stats').innerHTML = [
    [flowers.length, 'всего букетов'],
    [visible, 'на витрине'],
    [flowers.length - visible, 'скрыто'],
    [flowers.filter((f) => f.hit).length, 'хитов в карусели'],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');

  const q = $('#q').value.trim().toLowerCase();
  const cat = $('#catFilter').value;
  const filtering = Boolean(q) || cat !== 'all';
  const list = flowers.filter((f) =>
    (cat === 'all' || f.category === cat) &&
    (!q || `${f.name} ${f.kind} ${f.description}`.toLowerCase().includes(q))
  );
  $('#empty').hidden = list.length > 0;
  $('#list').innerHTML = list.map((f) => {
    const i = flowers.indexOf(f);
    return `
    <article class="item${f.visible === false ? ' is-hidden' : ''}" data-id="${esc(f.id)}">
      <div class="item__img" data-act="edit">
        <img src="${esc(f.image)}" alt="" loading="lazy" onerror="this.style.opacity=0">
        <div class="badges">
          ${f.hit ? '<span class="badge badge--hit">Хит</span>' : ''}
          ${f.visible === false ? '<span class="badge badge--off">Скрыт</span>' : ''}
          <span class="badge">${esc(catLabel(f.category))}</span>
        </div>
      </div>
      <div class="item__body">
        <small>${esc(f.kind)}</small>
        <h3>${esc(f.name)}</h3>
        <span class="item__price">${fmt(f.price)}</span>
      </div>
      <div class="item__bar">
        <button class="icon-btn${f.visible !== false ? ' is-on' : ''}" data-act="visible" title="${f.visible !== false ? 'Скрыть с сайта' : 'Показать на сайте'}">${f.visible !== false ? '◉' : '○'}</button>
        <button class="icon-btn${f.hit ? ' is-on' : ''}" data-act="hit" title="Хит (3D-карусель)">★</button>
        <button class="icon-btn" data-act="up" title="Выше" ${filtering || i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn" data-act="down" title="Ниже" ${filtering || i === flowers.length - 1 ? 'disabled' : ''}>↓</button>
        <span class="sp"></span>
        <button class="icon-btn" data-act="edit" title="Редактировать">✎</button>
        <button class="icon-btn del" data-act="delete" title="Удалить">🗑</button>
      </div>
    </article>`;
  }).join('');
}

$('#q').addEventListener('input', render);
$('#catFilter').addEventListener('change', render);

$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.item').dataset.id;
  const f = flowers.find((x) => x.id === id);
  const act = btn.dataset.act;
  try {
    if (act === 'edit') return openEditor(f);
    if (act === 'delete') return askDelete(f);
    if (act === 'visible') {
      await saveFlower({ ...f, visible: f.visible === false });
      toast(f.visible === false ? 'Букет снова на витрине' : 'Букет скрыт с сайта');
    }
    if (act === 'hit') {
      await saveFlower({ ...f, hit: !f.hit });
      toast(f.hit ? 'Убран из хитов' : 'Добавлен в 3D-карусель хитов');
    }
    if (act === 'up' || act === 'down') {
      const i = flowers.indexOf(f);
      const j = act === 'up' ? i - 1 : i + 1;
      const other = flowers[j];
      if (!other) return;
      const a = f.sort ?? i;
      const b = other.sort ?? j;
      await saveFlower({ ...f, sort: b === a ? b + (act === 'up' ? -1 : 1) : b });
      await saveFlower({ ...other, sort: a });
    }
    await reload();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------- Редактор ---------- */

const form = $('#editForm');
let pendingImage = '';

function openEditor(f = null) {
  editing = f;
  form.reset();
  $('#editTitle').textContent = f ? 'Редактирование' : 'Новый букет';
  $('#delBtn').hidden = !f;
  const data = f || { name: '', kind: '', price: '', category: 'author', description: '', image: '', visible: true, hit: false };
  form.name.value = data.name;
  form.kind.value = data.kind || '';
  form.price.value = data.price;
  form.category.value = data.category;
  form.description.value = data.description || '';
  form.visible.checked = data.visible !== false;
  form.hit.checked = Boolean(data.hit);
  pendingImage = data.image || '';
  form.image.value = pendingImage.startsWith('data:') ? '' : pendingImage;
  setPreview(pendingImage);
  $('#editor').classList.add('is-open');
  $('#editor').setAttribute('aria-hidden', 'false');
  setTimeout(() => form.name.focus(), 300);
}

function closeEditor() {
  $('#editor').classList.remove('is-open');
  $('#editor').setAttribute('aria-hidden', 'true');
  editing = null;
}

function setPreview(src) {
  $('#preview').hidden = !src;
  $('#dropHint').hidden = Boolean(src);
  if (src) $('#preview').src = src;
}

$('#addBtn').addEventListener('click', () => openEditor());
$('#editor').addEventListener('click', (e) => e.target.closest('[data-close]') && closeEditor());
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeEditor();
  closeConfirm(false);
  $('#menuList').hidden = true;
});

form.image.addEventListener('input', () => {
  pendingImage = form.image.value.trim();
  setPreview(pendingImage);
});

// Сжимаем фото до 1000px по длинной стороне, JPEG ~80% — экономим место и ускоряем сайт.
function compress(file, max = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось обработать фото'))), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Файл не похож на изображение'));
    img.src = URL.createObjectURL(file);
  });
}

async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return toast('Выберите файл изображения', true);
  $('#dropBusy').hidden = false;
  try {
    const blob = await compress(file);
    pendingImage = await uploadImage(blob);
    form.image.value = pendingImage.startsWith('data:') ? '' : pendingImage;
    setPreview(pendingImage);
  } catch (err) {
    toast(err.message, true);
  } finally {
    $('#dropBusy').hidden = true;
  }
}

$('#file').addEventListener('change', (e) => handleFile(e.target.files[0]));
const drop = $('#drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingImage) return toast('Добавьте фото букета', true);
  const flower = {
    ...(editing || {}),
    id: editing?.id || 'f' + Date.now().toString(36),
    name: form.name.value.trim(),
    kind: form.kind.value.trim(),
    price: Math.max(0, Math.round(Number(form.price.value))),
    category: form.category.value,
    description: form.description.value.trim(),
    image: pendingImage,
    visible: form.visible.checked,
    hit: form.hit.checked,
    sort: editing ? editing.sort : Math.min(0, ...flowers.map((f) => f.sort ?? 0)) - 1,
  };
  const btn = $('#saveBtn');
  btn.disabled = true;
  try {
    await saveFlower(flower);
    toast(editing ? 'Изменения сохранены' : 'Букет добавлен в каталог');
    closeEditor();
    await reload();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$('#delBtn').addEventListener('click', () => editing && askDelete(editing));

/* ---------- Удаление с подтверждением ---------- */

let confirmResolve = null;
function confirmDialog(text, sub, yesLabel = 'Удалить') {
  $('#confirmText').textContent = text;
  $('#confirmSub').textContent = sub;
  $('#confirm [data-yes]').textContent = yesLabel;
  $('#confirm').classList.add('is-open');
  return new Promise((r) => (confirmResolve = r));
}
function closeConfirm(result) {
  $('#confirm').classList.remove('is-open');
  confirmResolve?.(result);
  confirmResolve = null;
}
$('#confirm').addEventListener('click', (e) => {
  if (e.target.closest('[data-yes]')) closeConfirm(true);
  else if (e.target.closest('[data-no]')) closeConfirm(false);
});

async function askDelete(f) {
  if (!(await confirmDialog(`Удалить «${f.name}»?`, 'Букет исчезнет с сайта. Если хотите убрать его временно — лучше нажмите «Скрыть» (◉).'))) return;
  try {
    await deleteFlower(f.id);
    closeEditor();
    toast('Букет удалён');
    await reload();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------- Резервные копии ---------- */

$('#menuBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#menuList').hidden = !$('#menuList').hidden;
});
document.addEventListener('click', () => ($('#menuList').hidden = true));

$('#menuList').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'export') {
    const blob = new Blob([JSON.stringify({ flowers, shop: await getShop() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `labuket-catalog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Резервная копия скачана');
  }
  if (act === 'import') $('#importFile').click();
  if (act === 'reset') {
    if (!(await confirmDialog('Вернуть исходный каталог?', 'Все добавленные и изменённые букеты будут заменены стартовым списком из 56 позиций.', 'Вернуть'))) return;
    try {
      await resetToSeed();
      toast('Исходный каталог восстановлен');
      await reload();
    } catch (err) {
      toast(err.message, true);
    }
  }
});

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.flowers;
    if (!Array.isArray(list) || !list.every((f) => f.id && f.name)) throw new Error('Файл не похож на копию каталога');
    if (!(await confirmDialog('Загрузить каталог из файла?', `Текущий каталог будет заменён (${list.length} позиций).`, 'Загрузить'))) return;
    await replaceAll(list);
    if (data.shop) await saveShop(data.shop);
    toast('Каталог загружен из копии');
    await reload();
    fillSettings();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------- Настройки магазина ---------- */

async function fillSettings() {
  const shop = await getShop();
  const f = $('#settingsForm');
  ['phone', 'telegram', 'address', 'region', 'hours', 'rating', 'announcement'].forEach((k) => (f[k].value = shop[k] || ''));
}

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const digits = fd.phone.replace(/\D/g, '');
  const patch = {
    ...fd,
    telegram: fd.telegram.replace(/^@/, '').trim(),
    phoneRaw: digits.length === 11 && digits.startsWith('8') ? '7' + digits.slice(1) : digits,
  };
  try {
    await saveShop(patch);
    toast('Настройки сохранены');
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------- Тост ---------- */

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('is-error', isError);
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 2800);
}
