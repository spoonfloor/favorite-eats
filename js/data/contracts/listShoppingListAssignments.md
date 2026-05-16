# What `listShoppingListAssignments` does

This is a written agreement about assigning shopping-list rows to store aisles.
Both the old local database and Supabase must give back the same store and aisle assignment information.
This doc is the rulebook.

## Summary

**You ask:** "given these shopping-list rows and these selected stores, where should each row go?"

**You get back:** store labels and aisle candidates for each shopping-list row.

Each answer says:

- which selected stores still exist
- how those stores should be labeled
- which store aisles match each shopping-list row

This only reads data.
It never creates, edits, removes, deletes, or saves stores, aisles, items, variants, or shopping-list rows.

## What you ask for

You give it:

- **storeOrder** — the saved order of stores in the shopping plan
- **selectedStoreIds** — the stores selected for this shopping trip
- **items** — the generated shopping-list item rows that need aisle assignments

Each item row has:

- **key** — the shopping-list row key
- **name** — the item name
- **variantName** — the item variant, or an empty string

The key should be unique within this request.
If the same key is sent more than once, only one answer can be returned for that key.

Example:

```json
{
  "storeOrder": [2, 1],
  "selectedStoreIds": [1, 2],
  "items": [
    {
      "key": "flour",
      "name": "flour",
      "variantName": ""
    }
  ]
}
```

## What you get back

You get an object with two parts:

- **selectedStores** — the selected stores that still exist, in the order the app should use
- **assignmentsByKey** — aisle candidates for each item row key

Example:

```json
{
  "selectedStores": [
    {
      "id": 2,
      "label": "Trader Joe's (East Side)"
    },
    {
      "id": 1,
      "label": "Safeway"
    }
  ],
  "assignmentsByKey": {
    "flour": [
      {
        "storeId": 2,
        "aisleId": 20,
        "aisleLabel": "Baking",
        "aisleSortOrder": 3,
        "variantRank": 0
      }
    ]
  }
}
```

## Store Order

Only stores listed in `selectedStoreIds` are considered.

The returned `selectedStores` list is ordered like this:

1. Stores that appear in `storeOrder` come first, in that saved order.
2. Any selected stores missing from `storeOrder` come after that, in the order they appeared in `selectedStoreIds`.

Bad store ids are ignored.
Duplicate store ids are returned once.
Selected stores that no longer exist are skipped.

## Store Labels

Each selected store has:

- **id** — the saved store id
- **label** — the text shown for the store

The label is:

1. `chain (location)` when both chain and location exist
2. just `chain` when location is missing
3. `Store N` when both chain and location are missing

Spaces at the beginning and end are trimmed for the label.

## Which Item Rows Are Considered

An item row is considered only when it has:

- a non-empty key
- a non-empty item name

Rows with no key or no item name get no assignments.

If no item rows are passed in, `assignmentsByKey` is empty.

## Base Item Aisle Links

An item can be linked directly to an aisle.

Those links are candidates for rows with that item name.

For example, if `"flour"` is linked to the Baking aisle at Store 2, then the row for `"flour"` gets that aisle candidate.

Item-name matching ignores upper/lower case and extra spaces.

## Variant Aisle Links

An item variant can also be linked to an aisle.

For example, `"flour (whole wheat)"` may be linked to Freezer while plain `"flour"` is linked to Baking.

Variant-name matching ignores upper/lower case and extra spaces.

The base variant named `"default"` does not count as a normal variant.

## Candidate Rules For Variant Rows

If the shopping-list row has a variant:

1. Exact variant aisle links are used first.
2. If exact variant links exist, base item links are not used.
3. If exact variant links do not exist for a selected store, that store gets one **unknown** candidate (`aisleId: -1`, label `unknown`, `aisleSortOrder: -1`).
4. Base item links and sibling variant links are never borrowed for named variant rows.

For example, `basil (fresh)` does not use the `basil (dried)` aisle.

## Candidate Rules For Rows Without A Variant

If the shopping-list row does not have a variant, or uses a reserved base variant name (`default`, `base`, or `any` — including planner “any” rows):

1. Base item aisle links are used first.
2. If base item links exist, variant links are not used.
3. If base item links do not exist for a selected store, that store gets one **unknown** candidate (`aisleId: -1`, label `unknown`, `aisleSortOrder: -1`).
4. Variant aisle links are never borrowed for plain/base rows.

Sibling variants with aisle links do not place the base row in those aisles.

## Candidate Fields

Each aisle candidate has:

- **storeId** — the saved store id
- **aisleId** — the saved aisle id
- **aisleLabel** — the aisle name
- **aisleSortOrder** — the saved aisle order number
- **variantRank** — where the variant sits in saved variant order, when that matters

If an aisle has no name, the label is `Aisle N`.

If an aisle has no saved order, `aisleSortOrder` is `999999`.

If `variantRank` does not matter, it is omitted.

## Duplicate Candidates

Duplicate candidates for the same store and aisle are returned only once.

If two candidates point to the same store and aisle, the one with the better ordering wins.

## Candidate Order

Candidates are ordered like this:

1. Lower `variantRank` first, when present.
2. Lower `aisleSortOrder` first.
3. Lower aisle id first.
4. Aisle label alphabetically, ignoring upper/lower case.

## When There Are No Assignments

You still get the selected stores that exist.

Rows with no aisle match get an empty candidate list.

If there are matching item rows but no matching stores or no matching aisles, each considered item row gets an empty candidate list.

## When Something Goes Wrong

If the store or aisle data cannot be read, this function **fails loudly**.
It does NOT quietly return empty assignments and pretend everything is fine.

Bad input entries are not considered data failures.
They are skipped.

## What This Function Does NOT Do

- It doesn't create shopping-list rows.
- It doesn't decide the final grouped shopping-list display.
- It doesn't mark anything checked or unchecked.
- It doesn't save selected stores.
- It doesn't save store order.
- It doesn't create stores.
- It doesn't create aisles.
- It doesn't edit item-to-aisle links.
- It doesn't choose one final aisle when multiple selected stores match. The caller does that later.

## Test Scenarios

The test data will live in `js/data/fixtures/listShoppingListAssignments.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. **No selected stores** — no selected stores and no assignments return.
2. **Bad store ids are skipped** — bad and duplicate store ids do not break the result.
3. **Store order is preserved** — saved store order decides the selected store order.
4. **Store labels** — chain and location produce the right label.
5. **Missing stores are skipped** — selected store ids that no longer exist are skipped.
6. **Base item aisle link** — a plain item gets its direct aisle candidate.
7. **Variant exact match** — a variant row uses its exact variant aisle candidate.
8. **Variant exact beats base** — base aisle links are ignored when exact variant links exist.
9. **Variant row uses unknown** — a variant row with no exact aisle link uses unknown instead of base or sibling variant links.
10. **No-variant row uses base first** — base links beat variant links for plain rows.
11. **No-variant row uses unknown aisle** — when base links do not exist, each selected store gets an unknown-aisle candidate instead of variant-derived aisles.
12. **Duplicate candidates combine** — duplicate store/aisle candidates return once.
13. **Aisle order** — aisle sort order and aisle id decide candidate order.
14. **Missing aisle name** — missing aisle names become `Aisle N`.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether final grouping should move behind the data door too.
- Decide whether variant fallback rules should be simpler.
- Decide whether item-to-aisle links should be cleaned up when stores or variants are removed.

These do NOT happen during migration.
They are separate jobs for later.