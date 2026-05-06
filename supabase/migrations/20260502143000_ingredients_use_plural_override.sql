-- Explicit flag: whether plural_override is engaged for catalog pluralization.
-- App reads/writes come later; this migration is schema + backfill only.

alter table catalog.ingredients
  add column use_plural_override boolean not null default false;

comment on column catalog.ingredients.use_plural_override is
  'When true, plural_override is applied; when false, plural forms are derived from lemma/name.';

update catalog.ingredients
set use_plural_override = true
where plural_override is not null
  and length(trim(plural_override)) > 0;
