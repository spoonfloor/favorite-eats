-- catalog.units: plural override (parity with shopping ingredients pattern)

alter table catalog.units
  add column use_plural_override boolean not null default false,
  add column plural_override text;

comment on column catalog.units.use_plural_override is
  'When true, plural_override is authoritative; when false, plural forms derive from name_singular.';
comment on column catalog.units.plural_override is
  'Custom plural text when use_plural_override is true; cleared when false.';
