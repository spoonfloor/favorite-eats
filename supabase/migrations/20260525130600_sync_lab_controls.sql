-- Blank-slate sync proving ground for spammable controls.
--
-- This is intentionally separate from product plan/list tables. It models the
-- architecture under test: narrow child-row writes plus a parent companion
-- update that produces its own Realtime event.

create schema if not exists sync_lab;

create table if not exists sync_lab.documents (
  id bigserial primary key,
  slug text not null unique,
  title text not null default '',
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists sync_lab.controls (
  document_id bigint not null references sync_lab.documents(id) on delete cascade,
  control_key text not null,
  kind text not null check (kind in ('stepper', 'checkbox')),
  numeric_value numeric not null default 0,
  checked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (document_id, control_key)
);

create index if not exists sync_lab_controls_document_kind_idx
  on sync_lab.controls (document_id, kind);

grant usage on schema sync_lab to anon, authenticated;
grant select, insert, update, delete on sync_lab.documents to anon, authenticated;
grant select, insert, update, delete on sync_lab.controls to anon, authenticated;
grant usage, select on sequence sync_lab.documents_id_seq to anon, authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'sync_lab'
       and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table sync_lab.documents;
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'sync_lab'
       and tablename = 'controls'
  ) then
    alter publication supabase_realtime add table sync_lab.controls;
  end if;
end;
$$;

create or replace function catalog.ensure_sync_lab_document()
returns bigint
language plpgsql
set search_path = catalog, sync_lab, public
as $$
declare
  v_doc_id bigint;
begin
  insert into sync_lab.documents (slug, title)
  values ('default', 'Sync Lab')
  on conflict (slug) do update
    set title = excluded.title
  returning id into v_doc_id;

  insert into sync_lab.controls (document_id, control_key, kind, numeric_value, checked)
  values
    (v_doc_id, 'stepper', 'stepper', 0, false),
    (v_doc_id, 'checkbox', 'checkbox', 0, false)
  on conflict (document_id, control_key) do nothing;

  return v_doc_id;
end;
$$;

create or replace function catalog.load_sync_lab_state()
returns jsonb
language plpgsql
set search_path = catalog, sync_lab, public
as $$
declare
  v_doc_id bigint;
  v_doc sync_lab.documents%rowtype;
  v_stepper sync_lab.controls%rowtype;
  v_checkbox sync_lab.controls%rowtype;
begin
  v_doc_id := catalog.ensure_sync_lab_document();

  select * into v_doc
    from sync_lab.documents
   where id = v_doc_id;

  select * into v_stepper
    from sync_lab.controls
   where document_id = v_doc_id
     and control_key = 'stepper';

  select * into v_checkbox
    from sync_lab.controls
   where document_id = v_doc_id
     and control_key = 'checkbox';

  return jsonb_build_object(
    'document',
      jsonb_build_object(
        'id', v_doc.id,
        'slug', v_doc.slug,
        'title', v_doc.title,
        'version', v_doc.version,
        'updated_at', v_doc.updated_at
      ),
    'controls',
      jsonb_build_object(
        'stepper',
          jsonb_build_object(
            'key', 'stepper',
            'kind', 'stepper',
            'value', v_stepper.numeric_value,
            'updated_at', v_stepper.updated_at
          ),
        'checkbox',
          jsonb_build_object(
            'key', 'checkbox',
            'kind', 'checkbox',
            'checked', v_checkbox.checked,
            'updated_at', v_checkbox.updated_at
          )
      )
  );
end;
$$;

create or replace function catalog.set_sync_lab_stepper_value(p_value numeric)
returns jsonb
language plpgsql
set search_path = catalog, sync_lab, public
as $$
declare
  v_doc_id bigint;
  v_updated_at timestamptz;
begin
  v_doc_id := catalog.ensure_sync_lab_document();

  update sync_lab.controls
     set numeric_value = greatest(0, coalesce(p_value, 0)),
         updated_at = now()
   where document_id = v_doc_id
     and control_key = 'stepper'
  returning updated_at into v_updated_at;

  update sync_lab.documents
     set version = version + 1,
         updated_at = now()
   where id = v_doc_id;

  return jsonb_build_object(
    'ok', true,
    'key', 'stepper',
    'value', greatest(0, coalesce(p_value, 0)),
    'updated_at', v_updated_at
  );
end;
$$;

create or replace function catalog.set_sync_lab_checkbox_checked(p_checked boolean)
returns jsonb
language plpgsql
set search_path = catalog, sync_lab, public
as $$
declare
  v_doc_id bigint;
  v_checked boolean := coalesce(p_checked, false);
  v_updated_at timestamptz;
begin
  v_doc_id := catalog.ensure_sync_lab_document();

  update sync_lab.controls
     set checked = v_checked,
         updated_at = now()
   where document_id = v_doc_id
     and control_key = 'checkbox'
  returning updated_at into v_updated_at;

  update sync_lab.documents
     set version = version + 1,
         updated_at = now()
   where id = v_doc_id;

  return jsonb_build_object(
    'ok', true,
    'key', 'checkbox',
    'checked', v_checked,
    'updated_at', v_updated_at
  );
end;
$$;

create or replace function catalog.reset_sync_lab_state()
returns jsonb
language plpgsql
set search_path = catalog, sync_lab, public
as $$
declare
  v_doc_id bigint;
begin
  v_doc_id := catalog.ensure_sync_lab_document();

  update sync_lab.controls
     set numeric_value = 0,
         checked = false,
         updated_at = now()
   where document_id = v_doc_id;

  update sync_lab.documents
     set version = version + 1,
         updated_at = now()
   where id = v_doc_id;

  return catalog.load_sync_lab_state();
end;
$$;

grant execute on function catalog.ensure_sync_lab_document() to anon, authenticated;
grant execute on function catalog.load_sync_lab_state() to anon, authenticated;
grant execute on function catalog.set_sync_lab_stepper_value(numeric) to anon, authenticated;
grant execute on function catalog.set_sync_lab_checkbox_checked(boolean) to anon, authenticated;
grant execute on function catalog.reset_sync_lab_state() to anon, authenticated;
