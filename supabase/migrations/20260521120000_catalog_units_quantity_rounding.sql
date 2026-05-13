-- catalog.units: per-unit quantity rounding (preset + custom step/mode)

alter table catalog.units
  add column quantity_rounding_preset text not null default 'nearest_eighth',
  add column quantity_rounding_step_denominator integer,
  add column quantity_rounding_mode text;

alter table catalog.units
  add constraint units_quantity_rounding_preset_check
    check (quantity_rounding_preset in ('nearest_eighth', 'custom'));

alter table catalog.units
  add constraint units_quantity_rounding_step_denominator_check
    check (
      quantity_rounding_step_denominator is null
      or quantity_rounding_step_denominator in (1, 2, 3, 4, 8)
    );

alter table catalog.units
  add constraint units_quantity_rounding_mode_check
    check (
      quantity_rounding_mode is null
      or quantity_rounding_mode in ('nearest', 'up', 'down')
    );

alter table catalog.units
  add constraint units_quantity_rounding_custom_consistency_check
    check (
      (
        quantity_rounding_preset = 'nearest_eighth'
        and quantity_rounding_step_denominator is null
        and quantity_rounding_mode is null
      )
      or (
        quantity_rounding_preset = 'custom'
        and quantity_rounding_step_denominator is not null
        and quantity_rounding_mode is not null
      )
    );

comment on column catalog.units.quantity_rounding_preset is
  'nearest_eighth: implied 1/8 grid, nearest. custom: use step_denominator and mode.';
comment on column catalog.units.quantity_rounding_step_denominator is
  'Grid step 1/n for custom preset: 1 whole, 2 half, 3 third, 4 quarter, 8 eighth. Null when nearest_eighth.';
comment on column catalog.units.quantity_rounding_mode is
  'nearest | up | down. Null when preset is nearest_eighth.';
