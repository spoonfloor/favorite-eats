-- Clear substance/mass-noun flag for all catalog ingredients; new rows default to false.

update catalog.ingredients
set is_mass_noun = false;

alter table catalog.ingredients
  alter column is_mass_noun set default false;
