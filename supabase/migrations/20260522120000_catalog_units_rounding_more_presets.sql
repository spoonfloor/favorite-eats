-- catalog.units: allow fixed nearest presets (⅛, ¼, ½, whole) in addition to custom

alter table catalog.units
  drop constraint if exists units_quantity_rounding_custom_consistency_check;

alter table catalog.units
  drop constraint if exists units_quantity_rounding_preset_check;

alter table catalog.units
  add constraint units_quantity_rounding_preset_check
    check (
      quantity_rounding_preset in (
        'nearest_eighth',
        'nearest_quarter',
        'nearest_half',
        'nearest_whole',
        'custom'
      )
    );

alter table catalog.units
  add constraint units_quantity_rounding_custom_consistency_check
    check (
      (
        quantity_rounding_preset in (
          'nearest_eighth',
          'nearest_quarter',
          'nearest_half',
          'nearest_whole'
        )
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
  'Fixed: nearest_eighth | nearest_quarter | nearest_half | nearest_whole (implied grid + nearest). custom: use step_denominator and mode.';
comment on column catalog.units.quantity_rounding_step_denominator is
  'Grid step 1/n for custom preset: 1 whole, 2 half, 3 third, 4 quarter, 8 eighth. Null for fixed nearest_* presets.';
comment on column catalog.units.quantity_rounding_mode is
  'nearest | up | down for custom preset. Null for fixed nearest_* presets.';
