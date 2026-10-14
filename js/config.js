// Базовые данные магазина. Часы работы, телефон и т.п. можно менять в админ-панели.
export const SHOP = {
  name: 'Ля Букет',
  tagline: 'Цветочный салон · Альметьевск',
  phone: '+7 917 285 61 68',
  phoneRaw: '79172856168',
  telegram: 'SvetlanaFlowW',
  address: 'Альметьевск, улица Мусы Джалиля, 22',
  region: 'Республика Татарстан',
  hours: 'Ежедневно с 09:00',
  lat: 54.901957,
  lon: 52.292535,
  yandexOrg: 'https://yandex.ru/maps/org/12457909803',
  rating: '4,4',
  announcement: '',
};

// SHA-256 от пароля администратора. По умолчанию пароль: buket2026
// Новый хэш: в консоли браузера выполните
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('новый-пароль')).then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
export const ADMIN_PASSWORD_SHA256 = 'f3a59c0205a3186de4f793c8ef08333d6c257bf5996aff9b89e449ab8c3fa8f3';

// Облачное хранилище каталога (Supabase). Пока поля пустые, каталог хранится в браузере
// администратора. Когда заполните — изменения из админки увидят все посетители сайта.
// Схема таблиц: supabase/schema.sql
export const SUPABASE = {
  url: '',
  anonKey: '',
  bucket: 'flowers',
};

export const CATEGORIES = [
  { id: 'all', label: 'Все' },
  { id: 'author', label: 'Авторские' },
  { id: 'roses', label: 'Розы' },
  { id: 'box', label: 'В коробке' },
  { id: 'basket', label: 'Корзины' },
  { id: 'wedding', label: 'Свадебные' },
  { id: 'season', label: 'Сезонные' },
];
