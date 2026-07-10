-- My Notion 앱 DB 스키마
-- Supabase SQL Editor에서 실행하세요

create table if not exists mynotion_folders (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table mynotion_folders add column if not exists sort_order integer default 0;

insert into mynotion_folders (name)
select '미분류'
where not exists (
  select 1 from mynotion_folders where name = '미분류'
);

create table if not exists mynotion_notes (
  id uuid default gen_random_uuid() primary key,
  folder_id uuid references mynotion_folders(id) on delete cascade,
  title text,
  content text not null,
  link text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- 기존 테이블에 컬럼 추가 (이미 테이블이 있는 경우)
alter table mynotion_notes add column if not exists title text;
alter table mynotion_notes add column if not exists sort_order integer default 0;

-- RLS (Row Level Security) 활성화
alter table mynotion_folders enable row level security;
alter table mynotion_notes enable row level security;

-- 모든 사용자 읽기/쓰기 허용 (필요에 따라 수정)
create policy "Allow all on mynotion_folders" on mynotion_folders for all using (true) with check (true);
create policy "Allow all on mynotion_notes" on mynotion_notes for all using (true) with check (true);

-- 노트 이미지 Storage 버킷 (공개 읽기)
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read note images" on storage.objects;
drop policy if exists "Public upload note images" on storage.objects;
drop policy if exists "Public update note images" on storage.objects;
drop policy if exists "Public delete note images" on storage.objects;

create policy "Public read note images"
  on storage.objects for select
  using (bucket_id = 'note-images');

create policy "Public upload note images"
  on storage.objects for insert
  with check (bucket_id = 'note-images');

create policy "Public update note images"
  on storage.objects for update
  using (bucket_id = 'note-images');

create policy "Public delete note images"
  on storage.objects for delete
  using (bucket_id = 'note-images');
