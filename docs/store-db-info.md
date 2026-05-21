# Store & Aisle Editor — Developer Documentation

> **Note:** This doc describes a **legacy SQLite-era shape** (`store_aisles`, etc.).
> Production store/aisle editing uses **Supabase Postgres** via `window.dataService`.
> For the canonical model, see `docs/store-aisle-editor.md`.

Overview
This editor allows you to view, add, update, and delete stores, aisles, and ingredient ordering in the database.
The main entities:

1. store_locations — Represents a physical store location.
2. store_aisles — Represents departments or aisles within a store.
3. ingredient_store_location — Maps ingredients to stores/aisles and optionally tracks sort_order.
   Relationships:
   store_locations.ID → store_aisles.store_id
   (one store → many aisles)
   store_aisles.ID → ingredient_store_location.aisle_id (or store_id/aisle combination)
   (one aisle → many ingredient mappings)

Tables

1. store_locations
   Column Type Notes
   ID INTEGER Primary key
   chain_name TEXT Name of the store chain (required)
   location_name TEXT Name or street of the location (required)
   Example row:
   ID | chain_name | location_name
   1 | Whole Foods | Ocean Avenue

2. store_aisles
   Column Type Notes
   ID INTEGER Primary key
   store_id INTEGER Foreign key → store_locations.ID
   name TEXT Name of the aisle (required)
   aisle_number INTEGER Optional; order or identifier in the store
   sort_order INTEGER Optional; for UI display ordering
   Example rows for store_id = 1:
   ID | store_id | name | aisle_number | sort_order
   1 | 1 | Produce | | 1
   2 | 1 | Health & Beauty | | 2
   3 | 1 | Frozen Foods | | 3

3. ingredient_store_location
   Column Type Notes
   ID INTEGER Primary key
   store_id INTEGER Foreign key → store_locations.ID
   aisle_id INTEGER Foreign key → store_aisles.ID
   ingredient_id INTEGER Foreign key → ingredients.ID
   sort_order INTEGER Nullable; optional numeric order within the aisle
   Example rows:
   ID | store_id | aisle_id | ingredient_id | sort_order
   1 | 1 | 1 | 101 | 5
   2 | 1 | 1 | 102 | NULL
   3 | 2 | 3 | 101 | 15

Notes:

- sort_order is nullable; the app handles fallback when it is NULL.
- Fallback can be alphabetical or insertion order.

Development Guidelines

1. Cursor Usage
   Always open the cursor in read/write mode if making changes.
   Fetch rows using a primary key, store_id, or aisle_id to avoid scanning unnecessary rows.
   Use parameterized queries to prevent SQL injection.
   Example:
   cursor.execute("SELECT \* FROM store_aisles WHERE store_id = ?", (store_id,))
   rows = cursor.fetchall()

2. Adding a New Store
   cursor.execute(
   "INSERT INTO store_locations (chain_name, location_name) VALUES (?, ?)",
   (chain_name, location_name)
   )
   new_store_id = cursor.lastrowid
   Use lastrowid to link aisles to the new store.

3. Adding a New Aisle
   cursor.execute(
   "INSERT INTO store_aisles (store_id, name, aisle_number, sort_order) VALUES (?, ?, ?, ?)",
   (store_id, aisle_name, aisle_number, sort_order)
   )
   Ensure store_id exists to maintain relational integrity.
   Optional: compute sort_order dynamically if UI requires ordering.

4. Updating Store, Aisle, or Ingredient Mapping
   cursor.execute(
   "UPDATE store_aisles SET name = ?, aisle_number = ?, sort_order = ? WHERE ID = ?",
   (new_name, new_aisle_number, new_sort_order, aisle_id)
   )
   cursor.execute(
   "UPDATE ingredient_store_location SET sort_order = ? WHERE ID = ?",
   (new_sort_order, mapping_id)
   )
   Always target rows by primary key (ID) to avoid accidental mass updates.

5. Deleting a Store, Aisle, or Ingredient Mapping
   Aisle:
   cursor.execute("DELETE FROM store_aisles WHERE ID = ?", (aisle_id,))
   Store:
   Optionally delete all associated aisles and mappings first:
   cursor.execute("DELETE FROM ingredient_store_location WHERE store_id = ?", (store_id,))
   cursor.execute("DELETE FROM store_aisles WHERE store_id = ?", (store_id,))
   cursor.execute("DELETE FROM store_locations WHERE ID = ?", (store_id,))
   Ingredient mapping:
   cursor.execute("DELETE FROM ingredient_store_location WHERE ID = ?", (mapping_id,))

6. Best Practices
   Always back up the database before destructive operations.
   Keep store_id and aisle_id relationships intact — don’t manually change IDs.
   Use transactions for batch updates:
   conn.execute("BEGIN")

# multiple INSERT/UPDATE/DELETE

conn.commit()
Sort aisles for display using sort_order.
For ingredients, allow null sort_order; let the app handle fallback.
Validate input in the editor UI — names cannot be empty.

7. Suggested Queries for the Editor
   List all stores with aisles:
   SELECT sl.ID AS store_id, sl.chain_name, sl.location_name,
   sa.ID AS aisle_id, sa.name AS aisle_name, sa.sort_order
   FROM store_locations sl
   LEFT JOIN store_aisles sa ON sa.store_id = sl.ID
   ORDER BY sl.ID, sa.sort_order;

Count aisles per store:
SELECT store_id, COUNT(\*) AS aisle_count
FROM store_aisles
GROUP BY store_id;

Find a specific aisle by name:
SELECT \* FROM store_aisles WHERE name = ?;

List ingredients in an aisle (app handles NULL sort_order):
SELECT isl.\*, i.name
FROM ingredient_store_location isl
JOIN ingredients i ON i.ID = isl.ingredient_id
WHERE isl.aisle_id = ?
ORDER BY
CASE WHEN isl.sort_order IS NULL THEN 1 ELSE 0 END,
isl.sort_order,
i.name;

8. Optional Extensions
   Support drag-and-drop reordering by updating sort_order.
   Add aisle metadata (e.g., category type) if needed.
   Integrate ingredient items in each aisle for full grocery store mapping.

Relationships Summary
store_locations → store_aisles (one-to-many)
store_aisles → ingredient_store_location → ingredients (one-to-many)
store_locations → ingredient_store_location → ingredients (many-to-many)

Notes

- A store can have any number of aisles.
- Each aisle can have any number of grocery items.
- Ingredient sort_order is nullable; the app handles fallback.
- Foreign key enforcement depends on Postgres constraints; data integrity is maintained by design and adapter logic.
- Always use parameterized queries when inserting or updating rows to prevent SQL injection.
- Use sort_order for UI display consistency where set; handle NULLs gracefully in the app.
