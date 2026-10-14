-- Облачное хранилище каталога «Ля Букет».
-- Выполните в Supabase → SQL Editor, затем впишите url и anonKey в js/config.js.

create table if not exists public.flowers (
  id          text primary key,
  name        text not null,
  kind        text default '',
  price       integer not null default 0,
  category    text not null default 'author',
  description text default '',
  image       text not null,
  hit         boolean not null default false,
  visible     boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.shop_settings (
  id   integer primary key default 1,
  data jsonb not null default '{}'::jsonb
);

alter table public.flowers enable row level security;
alter table public.shop_settings enable row level security;

-- Читать могут все посетители, менять — только вошедший администратор.
create policy "flowers_read"  on public.flowers for select using (true);
create policy "flowers_write" on public.flowers for all to authenticated using (true) with check (true);
create policy "shop_read"     on public.shop_settings for select using (true);
create policy "shop_write"    on public.shop_settings for all to authenticated using (true) with check (true);

-- Хранилище фотографий
insert into storage.buckets (id, name, public) values ('flowers', 'flowers', true)
on conflict (id) do nothing;

create policy "flower_photos_read"   on storage.objects for select using (bucket_id = 'flowers');
create policy "flower_photos_upload" on storage.objects for insert to authenticated with check (bucket_id = 'flowers');
create policy "flower_photos_delete" on storage.objects for delete to authenticated using (bucket_id = 'flowers');

-- Администратора создайте вручную: Authentication → Users → Add user (email + пароль),
-- а в Authentication → Providers → Email отключите самостоятельную регистрацию (Allow new users to sign up).
