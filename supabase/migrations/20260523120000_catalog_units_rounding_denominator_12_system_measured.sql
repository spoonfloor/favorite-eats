-- Align catalog.units checks with the unit editor + supabaseAdapter:
-- - custom step denominator 12 (¼ & ⅓ grid)
-- - quantity_rounding_preset = system_measured (null step/mode)

alter table catalog.units
  drop constraint if exists units_quantity_rounding_step_denominator_check;

alter table catalog.units
  add constraint units_quantity_rounding_step_denominator_check
    check (
      quantity_rounding_step_denominator is null
      or quantity_rounding_step_denominator in (1, 2, 3, 4, 8, 12)
    );

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
        'system_measured',
        'custom'
      )
    );

alter table catalog.units
  drop constraint if exists units_quantity_rounding_custom_consistency_check;

alter table catalog.units
  add constraint units_quantity_rounding_custom_consistency_check
    check (
      (
        quantity_rounding_preset in (
          'nearest_eighth',
          'nearest_quarter',
          'nearest_half',
          'nearest_whole',
          'system_measured'
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

comment on column catalog.units.quantity_rounding_step_denominator is
  'Grid step 1/n for custom preset: 1 whole, 2 half, 3 third, 4 quarter, 8 eighth, 12 (¼ & ⅓). Null for fixed nearest_* and system_measured.';
