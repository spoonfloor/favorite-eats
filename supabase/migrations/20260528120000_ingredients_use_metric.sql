-- Per catalog item: show measured mass/volume on metric display ladders (g/kg, ml/L).

alter table catalog.ingredients
  add column if not exists use_metric boolean not null default false;

comment on column catalog.ingredients.use_metric is
  'When true, measured amounts for this ingredient use metric display ladders (g/kg, ml/L).';
