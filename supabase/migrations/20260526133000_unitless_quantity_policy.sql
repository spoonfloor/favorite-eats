-- Settings row for recipe ingredients with no explicit unit.
-- This is not a catalog unit; it only controls the scalar rounding fallback.

create table if not exists catalog.unitless_quantity_policy (
  id boolean primary key default true,
  use_system_default boolean not null default true,
  quantity_rounding_step_denominator integer not null default 2,
  updated_at timestamptz not null default now(),
  constraint unitless_quantity_policy_singleton_check check (id),
  constraint unitless_quantity_policy_step_check
    check (quantity_rounding_step_denominator in (1, 2, 3, 4, 8, 12))
);

alter table catalog.unitless_quantity_policy enable row level security;

drop policy if exists catalog_allow_all_unitless_quantity_policy
  on catalog.unitless_quantity_policy;

create policy catalog_allow_all_unitless_quantity_policy
  on catalog.unitless_quantity_policy
  for all
  to anon, authenticated
  using (true)
  with check (true);

insert into catalog.unitless_quantity_policy (
  id,
  use_system_default,
  quantity_rounding_step_denominator
)
values (true, true, 2)
on conflict (id) do nothing;

create or replace function catalog.load_unitless_quantity_policy()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'useSystemDefault', coalesce(use_system_default, true),
    'quantityRoundingStepDenominator',
      coalesce(quantity_rounding_step_denominator, 8)
  )
  from catalog.unitless_quantity_policy
  where id is true
$$;

create or replace function catalog.save_unitless_quantity_policy(request jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_use_system_default boolean;
  v_step integer;
begin
  v_use_system_default :=
    coalesce((request->>'useSystemDefault')::boolean, true);
  v_step :=
    coalesce((request->>'quantityRoundingStepDenominator')::integer, 8);

  if v_step not in (1, 2, 3, 4, 8, 12) then
    raise exception
      'save_unitless_quantity_policy: step denominator must be one of 1,2,3,4,8,12';
  end if;

  insert into catalog.unitless_quantity_policy (
    id,
    use_system_default,
    quantity_rounding_step_denominator,
    updated_at
  )
  values (true, v_use_system_default, v_step, now())
  on conflict (id) do update
    set use_system_default = excluded.use_system_default,
        quantity_rounding_step_denominator =
          excluded.quantity_rounding_step_denominator,
        updated_at = excluded.updated_at;

  return catalog.load_unitless_quantity_policy();
end;
$$;

grant usage on schema catalog to anon, authenticated;
grant select, insert, update on table catalog.unitless_quantity_policy
  to anon, authenticated;
grant execute on function catalog.load_unitless_quantity_policy()
  to anon, authenticated;
grant execute on function catalog.save_unitless_quantity_policy(jsonb)
  to anon, authenticated;

comment on table catalog.unitless_quantity_policy is
  'Singleton settings row for blank-unit ingredient quantity display.';
comment on column catalog.unitless_quantity_policy.use_system_default is
  'When true, unitless ingredient quantities use the app default 1/2 grid.';
comment on column catalog.unitless_quantity_policy.quantity_rounding_step_denominator is
  'Custom grid step 1/n: 1 whole, 2 half, 3 third, 4 quarter, 8 eighth, 12 (¼ & ⅓).';
