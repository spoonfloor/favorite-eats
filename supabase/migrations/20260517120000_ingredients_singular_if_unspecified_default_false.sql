-- Prefer plural when quantity is unspecified for all catalog items;
-- new rows inherit the same default.

update catalog.ingredients
set singular_if_unspecified = false;

alter table catalog.ingredients
  alter column singular_if_unspecified set default false;
