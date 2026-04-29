# What `listStores` does

This is a written agreement about the Stores page.
Both the old local database and Supabase must give back the same store list.
This doc is the rulebook.

## Summary

**You ask:** "give me the stores for the Stores page."

**You get back:** a list of stores.

Each store says:

- its saved id
- its chain name
- its location name

This only reads data.
It never creates, edits, removes, deletes, or saves a store.

## What you ask for

Nothing.
The Stores page asks for the whole store list every time.

## What you get back

You get a list.
Each store in the list has:

- **id** — the saved id for the store
- **chain** — the chain name, like `"Safeway"` or `"Trader Joe's"`
- **location** — the location name, like `"Downtown"` or `"East Side"`

Example:

```json
[
  {
    "id": 1,
    "chain": "Safeway",
    "location": "Downtown"
  }
]
```

## Which Stores Are Included

Include all stores.

There is no hidden or removed flag for this list.
If a store exists in the saved store table, it comes back.

## Text Fields

The text fields come back as saved:

- `chain`
- `location`

If either saved value is missing, it comes back as an empty string.

Spaces are preserved.
For example, `" Safeway "` stays `" Safeway "`.

A store with an empty location still comes back.

## Order Of The Returned List

The list is ordered like this:

1. Stores are ordered alphabetically by chain name, ignoring upper/lower case.
2. If two stores have the same chain name, they are ordered alphabetically by location name, ignoring upper/lower case.

## When There Are No Stores

You get an empty list: `[]`.

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't filter by the search box. The page does that.
- It doesn't group stores.
- It doesn't count how many shopping items use a store.
- It doesn't create stores.
- It doesn't rename stores.
- It doesn't remove stores.
- It doesn't delete stores.
- It doesn't decide what happens when the user clicks a store.

## Test Scenarios

The test data lives in `js/data/fixtures/listStores.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios are:

1. **Empty database** — returns an empty list.
2. **One simple store** — basic check.
3. **Chain and location return** — both text fields come back.
4. **Missing text becomes empty** — missing chain and location come back as empty strings.
5. **Order by chain name** — chain names are sorted alphabetically.
6. **Order by location name** — matching chain names are sorted by location.
7. **Case does not change sort order** — upper/lower case is ignored while sorting.
8. **Location can be empty** — a store with no location still comes back.
9. **Spaces are preserved** — extra spaces in saved text are not trimmed.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether store text should be trimmed when shown.
- Decide whether stores should have hidden or removed flags.
- Decide whether stores should have a saved order number instead of alphabetical order.

These do NOT happen during migration.
They are separate jobs for later.
