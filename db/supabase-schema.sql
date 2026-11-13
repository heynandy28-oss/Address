-- Durable processing history for the Address Intelligence system.
-- Apply this once in the connected Supabase project (SQL editor or migration).
--
-- Same invariants as the SQLite schema:
--   * address_line1 is the ONLY address-line column;
--   * row_index preserves the original input order;
--   * raw_row is stored verbatim so exports can reproduce the input exactly.
--
-- The server writes with the service role key, so RLS stays enabled with no
-- public policies: anon/authenticated clients cannot read or write these rows.

create table if not exists public.processing_runs (
  id               uuid primary key default gen_random_uuid(),
  label            text,
  source_filename  text,
  source_format    text not null default 'single'
                     check (source_format in ('single', 'csv', 'xlsx')),
  -- Original header row, in original column order, so exports reproduce it.
  source_headers   jsonb,
  row_count        integer not null default 0,
  processed_count  integer not null default 0,
  status           text not null default 'pending'
                     check (status in ('pending', 'processing', 'completed', 'failed')),
  engine_version   text not null,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create table if not exists public.address_rows (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references public.processing_runs(id) on delete cascade,
  -- 0-based position in the original input; never reordered.
  row_index           integer not null,
  source_row_number   integer,
  -- Exact original row, keys in original order, values untouched.
  raw_row             jsonb not null,
  raw_address_text    text,
  -- The ONLY address-line field in the system.
  address_line1       text,
  postcode            text,
  city                text,
  region              text,
  country             text,
  country_code        text,
  confidence          integer check (confidence is null or (confidence between 0 and 100)),
  verification_status text check (
                        verification_status is null or verification_status in
                          ('verified', 'partially_verified', 'conflicting', 'unverified', 'not_checkable')
                      ),
  diagnostics         jsonb,
  evidence            jsonb,
  created_at          timestamptz not null default now(),
  unique (run_id, row_index)
);

-- Projects created before the header column existed pick it up here.
alter table public.processing_runs add column if not exists source_headers jsonb;

create index if not exists idx_address_rows_run_order
  on public.address_rows (run_id, row_index);

create index if not exists idx_address_rows_status
  on public.address_rows (verification_status);

create table if not exists public.verification_cache (
  cache_key    text primary key,
  source       text not null,
  query        jsonb not null,
  result       jsonb not null,
  evidence_url text,
  fetched_at   timestamptz not null default now(),
  expires_at   timestamptz
);

create index if not exists idx_verification_cache_source
  on public.verification_cache (source, fetched_at);

alter table public.processing_runs      enable row level security;
alter table public.address_rows         enable row level security;
alter table public.verification_cache   enable row level security;
