-- Presence moniker deck: shared shoe for splash-assigned editing names.
-- Separate from catalog / plan / list (see docs/catalog-plan-list-supabase.md).

create schema if not exists presence;

comment on schema presence is
  'Ephemeral product flavor (moniker deck). Not shopping data.';

create table presence.moniker_decks (
  scope_key text primary key,
  remaining text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

comment on table presence.moniker_decks is
  'Remaining moniker strings from the last shuffle; popped on front-door login.';

alter table presence.moniker_decks enable row level security;

create or replace function presence.draw_moniker(
  p_scope text default 'default',
  p_fresh_deck text[] default null
) returns text
  language plpgsql
  security definer
  set search_path = presence, pg_temp
as $$
declare
  v_scope text := nullif(btrim(coalesce(p_scope, '')), '');
  v_remaining text[];
  v_moniker text;
  v_len integer;
begin
  if v_scope is null then
    v_scope := 'default';
  end if;

  insert into presence.moniker_decks (scope_key, remaining)
  values (v_scope, '{}'::text[])
  on conflict (scope_key) do nothing;

  select remaining
    into v_remaining
    from presence.moniker_decks
   where scope_key = v_scope
     for update;

  v_len := coalesce(array_length(v_remaining, 1), 0);
  if v_len > 0 then
    v_moniker := v_remaining[1];
    if v_len > 1 then
      v_remaining := v_remaining[2:v_len];
    else
      v_remaining := '{}'::text[];
    end if;
    update presence.moniker_decks
       set remaining = v_remaining,
           updated_at = now()
     where scope_key = v_scope;
    return v_moniker;
  end if;

  v_len := coalesce(array_length(p_fresh_deck, 1), 0);
  if v_len > 0 then
    v_moniker := p_fresh_deck[1];
    if v_len > 1 then
      v_remaining := p_fresh_deck[2:v_len];
    else
      v_remaining := '{}'::text[];
    end if;
    update presence.moniker_decks
       set remaining = v_remaining,
           updated_at = now()
     where scope_key = v_scope;
    return v_moniker;
  end if;

  return null;
end;
$$;

grant usage on schema presence to anon, authenticated;

revoke all on table presence.moniker_decks from anon, authenticated;

grant execute on function presence.draw_moniker(text, text[]) to anon, authenticated;
