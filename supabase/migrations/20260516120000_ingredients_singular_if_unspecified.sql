-- Replace plural_by_default with singular_if_unspecified (inverted semantics).
-- Old true  = prefer plural when quantity is non-numeric
-- New false = same behavior

alter table catalog.ingredients
  add column singular_if_unspecified boolean;

update catalog.ingredients
set singular_if_unspecified = not coalesce(plural_by_default, false);

alter table catalog.ingredients
  alter column singular_if_unspecified set not null,
  alter column singular_if_unspecified set default true;

alter table catalog.ingredients
  drop column plural_by_default;

comment on column catalog.ingredients.singular_if_unspecified is
  'When true, use singular noun when quantity is non-numeric; when false, plural.';
