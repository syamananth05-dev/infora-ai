-- ============================================================
-- Synapse — Phase 1 schema
-- Run in Supabase SQL editor (or `supabase db push`).
-- Idempotent: safe to re-run.
-- ============================================================

-- ---------- Helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Profiles (1:1 with auth.users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Projects ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  instructions text,
  color text not null default '#3375ff',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id);

-- ---------- Conversations ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null default 'New conversation',
  mode text not null default 'chat' check (mode in ('chat', 'research', 'agent')),
  model_hint text,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);
create index if not exists conversations_project_idx on public.conversations (project_id);

-- ---------- Messages (tree-structured for branching) ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_message_id uuid references public.messages (id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  model text,
  tokens_in integer default 0,
  tokens_out integer default 0,
  cost_usd numeric(12, 6) default 0,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_parent_idx on public.messages (parent_message_id);

-- ---------- API usage (billing/observability) ----------
create table if not exists public.api_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  model text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms integer not null default 0,
  status text not null default 'ok' check (status in ('ok', 'error', 'rate_limited')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists api_usage_user_idx on public.api_usage (user_id, created_at desc);
create index if not exists api_usage_created_idx on public.api_usage (created_at desc);

-- ---------- updated_at triggers ----------
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.api_usage enable row level security;

-- profiles: owner full access; admin read-only
drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles
  for select using (id = auth.uid());
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- projects: owner full access
drop policy if exists projects_owner on public.projects;
create policy projects_owner on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- conversations: owner full access
drop policy if exists conversations_owner on public.conversations;
create policy conversations_owner on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- messages: owner full access (conversation ownership is implied by user_id)
drop policy if exists messages_owner on public.messages;
create policy messages_owner on public.messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- api_usage: owner read; server writes via service role (bypasses RLS)
drop policy if exists api_usage_owner_select on public.api_usage;
create policy api_usage_owner_select on public.api_usage
  for select using (user_id = auth.uid());
drop policy if exists api_usage_admin_select on public.api_usage;
create policy api_usage_admin_select on public.api_usage
  for select using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- ============================================================
-- Storage: private per-user file bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do nothing;

drop policy if exists "user files read own" on storage.objects;
create policy "user files read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user files insert own" on storage.objects;
create policy "user files insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user files update own" on storage.objects;
create policy "user files update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user files delete own" on storage.objects;
create policy "user files delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- RPCs
-- ============================================================

-- Aggregated usage for the current user, grouped by model
create or replace function public.get_my_usage()
returns table (
  model text,
  requests bigint,
  tokens_in bigint,
  tokens_out bigint,
  cost_usd numeric,
  first_used timestamptz,
  last_used timestamptz
)
language sql stable security definer set search_path = public as $$
  select model,
         count(*)::bigint,
         coalesce(sum(tokens_in), 0)::bigint,
          coalesce(sum(tokens_out), 0)::bigint,
          coalesce(sum(cost_use), 0),
         min(created_at)
          max(created_at)
         from public.api_usage
         where user_id = auth.uid()
          group by model
         order by max(created_at) desc;
$$;

-- Totals for the current user (all time + last 30 days)
create or replace function public.get_my_usage_totals()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total_requests', (select count(*) from public.api_usage where user_id = auth.uid()),
    'total_cost', (select coalesce(sum(cost_usd), 0) from public.api_usage where user_id = auth.uid()),
    'total_tokens_in', (select coalesce(sum(tokens_in), 0) from public.api_usage where user_id = auth.uid()),
    'total_tokens_out', (select coalesce(sum(tokens_out), 0) from public.api_usage where user_id = auth.uid()),
    'requests_30d', (select count(*) from public.api_usage where user_id = auth.uid() and created_at > now() - interval '30 days'),
    'cost_30d', (select coalesce(sum(cost_usd), 0) from public.api_usage where user_id = auth.uid() and created_at > now() - interval '30 days'),
    'requests_24h', (select count(*) from public.api_usage where user_id = auth.uid() and created_at > now() - interval '24 hours')
  );
$$;

-- Admin: usage aggregated per user (aggregates only — never message content)
create or replace function public.admin_usage_by_user()
returns table (
  user_id uuid,
  email text,
  display_name text,
  requests bigint,
  tokens_in bigint,
  tokens_out bigint,
  cost_usd numeric,
  last_active timestampt

 
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'not_authorized';
  end if;
  return query
    select p.id,
           p.email,
           p.display_name,
           coalesce(u.cnt, 0)::bigint,
           coalesce(u.tin, 0)::bigint,
           coalesce(u.tout, 0)::bigint,
           coalesce(u.cost, 0),
           u.last_at
         from public.profiles p
          left join (
          select user_id, count(*) cnt, sum(tokens_in) tin, sum(tokens_out) tout,
                 sum(cost_use) cost, max(created_at) last_at
             from public.api_usage group by user_id
          ) u on u.user_id = p.id
         order by coalesce(u.last_at, p.created_at) desc;
end;
$$;

-- Admin: usage by model across all users
create or replace function public.admin_usage_by_model()
returns table (
  model text,
  requests bigint,
  tokens_in bigint,
  tokens_out bigint,
  cost_use numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'not_authorized';
  end if;
  return query
    select model, count(*)::bigint, coalesce(sum(tokens_in),0)::bigint,
               coalesce(sum(tokens_out),0)::bigint, coalesce(sum(cost_use),0)
    from public.api_usage group by model order by count(*) desc;
end;
$$;

grant execute on function public.get_my_usage() to authenticated;
grant execute on function public.get_my_usage_totals() to authenticated;
grant execute on function public.admin_usage_by_user() to authenticated;
grant execute on function public.admin_usage_by_model() to authenticated;

-- ============================================================
-- Realtime (for future live job/streaming updates)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
