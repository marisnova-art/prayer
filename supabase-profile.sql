-- =====================================================================
--  Prayer 기도문 · 프로필 테이블 (이미지 · 이름 · 자기소개 · 이메일)
--  Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여 넣고 Run.
--  여러 번 실행해도 안전합니다. 기존 기도문·카테고리 데이터는 건드리지 않습니다.
-- =====================================================================

create table if not exists public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name       text not null default '' check (char_length(name)  <= 40),
  bio        text not null default '' check (char_length(bio)   <= 500),
  email      text not null default '' check (char_length(email) <= 120),
  avatar     text not null default '' check (char_length(avatar) <= 400000),  -- 256×256 JPEG data URL
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.profiles to authenticated;

-- 앱이 새 테이블을 바로 알아보도록 API 스키마 캐시를 새로 고칩니다.
notify pgrst, 'reload schema';
