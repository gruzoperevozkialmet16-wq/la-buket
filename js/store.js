// Слой данных: каталог и настройки магазина.
// Два режима: локальный (localStorage, по умолчанию) и облачный (Supabase, если заполнен config.SUPABASE).
import { SEED_FLOWERS } from './seed.js';
import { SHOP, SUPABASE, ADMIN_PASSWORD_SHA256 } from './config.js';

const LS_FLOWERS = 'labuket:flowers:v1';
const LS_SHOP = 'labuket:shop:v1';
const SS_AUTH = 'labuket:admin';

export const isCloud = Boolean(SUPABASE.url && SUPABASE.anonKey);

let clientPromise = null;
function cloud() {
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm')
      .then(({ createClient }) => createClient(SUPABASE.url, SUPABASE.anonKey));
  }
  return clientPromise;
}

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error('Не хватает места в браузере. Уменьшите фото или подключите облако (Supabase).');
  }
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);

function withSort(list) {
  return list.map((f, i) => ({ visible: true, hit: false, kind: '', ...f, sort: f.sort ?? i }));
}

/* ---------- Каталог ---------- */

export async function getFlowers({ includeHidden = false } = {}) {
  let list;
  if (isCloud) {
    const sb = await cloud();
    const { data, error } = await sb.from('flowers').select('*').order('sort');
    if (error) throw error;
    list = data && data.length ? data : withSort(clone(SEED_FLOWERS));
  } else {
    list = withSort(readLS(LS_FLOWERS, null) || clone(SEED_FLOWERS));
  }
  list.sort(bySort);
  return includeHidden ? list : list.filter((f) => f.visible !== false);
}

export async function saveFlower(flower) {
  if (isCloud) {
    const sb = await cloud();
    const { error } = await sb.from('flowers').upsert(flower);
    if (error) throw error;
    return;
  }
  const list = await getFlowers({ includeHidden: true });
  const i = list.findIndex((f) => f.id === flower.id);
  if (i >= 0) list[i] = flower;
  else list.unshift({ ...flower, sort: Math.min(0, ...list.map((f) => f.sort ?? 0)) - 1 });
  writeLS(LS_FLOWERS, list);
}

export async function deleteFlower(id) {
  if (isCloud) {
    const sb = await cloud();
    const { error } = await sb.from('flowers').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const list = await getFlowers({ includeHidden: true });
  writeLS(LS_FLOWERS, list.filter((f) => f.id !== id));
}

export async function replaceAll(list) {
  const normalized = list.map((f, i) => ({ ...f, sort: i }));
  if (isCloud) {
    const sb = await cloud();
    const { error: delErr } = await sb.from('flowers').delete().neq('id', '');
    if (delErr) throw delErr;
    if (normalized.length) {
      const { error } = await sb.from('flowers').insert(normalized);
      if (error) throw error;
    }
    return;
  }
  writeLS(LS_FLOWERS, normalized);
}

// В облачном режиме при первом входе администратора заливаем стартовый каталог в пустую таблицу.
export async function ensureCloudSeeded() {
  if (!isCloud) return;
  const sb = await cloud();
  const { count, error } = await sb.from('flowers').select('id', { count: 'exact', head: true });
  if (error) throw error;
  if (!count) await replaceAll(clone(SEED_FLOWERS));
}

export function resetToSeed() {
  return replaceAll(clone(SEED_FLOWERS));
}

/* ---------- Настройки магазина ---------- */

export async function getShop() {
  if (isCloud) {
    try {
      const sb = await cloud();
      const { data } = await sb.from('shop_settings').select('data').eq('id', 1).maybeSingle();
      return { ...SHOP, ...(data?.data || {}) };
    } catch {
      return { ...SHOP };
    }
  }
  return { ...SHOP, ...readLS(LS_SHOP, {}) };
}

export async function saveShop(patch) {
  if (isCloud) {
    const sb = await cloud();
    const { error } = await sb.from('shop_settings').upsert({ id: 1, data: patch });
    if (error) throw error;
    return;
  }
  writeLS(LS_SHOP, patch);
}

/* ---------- Фото ---------- */

// Принимает уже сжатый Blob (см. admin.js), возвращает адрес картинки.
export async function uploadImage(blob) {
  if (isCloud) {
    const sb = await cloud();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from(SUPABASE.bucket).upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    return sb.storage.from(SUPABASE.bucket).getPublicUrl(path).data.publicUrl;
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/* ---------- Вход администратора ---------- */

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function login(email, password) {
  if (isCloud) {
    const sb = await cloud();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Неверный email или пароль');
    return;
  }
  if ((await sha256(password)) !== ADMIN_PASSWORD_SHA256) throw new Error('Неверный пароль');
  sessionStorage.setItem(SS_AUTH, '1');
}

export async function isAuthed() {
  if (isCloud) {
    const sb = await cloud();
    const { data } = await sb.auth.getSession();
    return Boolean(data.session);
  }
  return sessionStorage.getItem(SS_AUTH) === '1';
}

export async function logout() {
  if (isCloud) {
    const sb = await cloud();
    await sb.auth.signOut();
  }
  sessionStorage.removeItem(SS_AUTH);
}
