Home location rules

1. The old single home location field goes away.

2. Every item gets a "Base item" row.

3. Home location lives on rows:
   - Base item can have a home location.
   - Each named variant can have its own home location.

4. "Base item" is always present.
   - It is not a normal user variant.
   - It should be shown as "Base item" in the editor.

5. Existing home locations migrate to the "Base item" row.

6. Search / home-location filtering:
   - If the match comes from Base item, show just the item name.
     Example: foo
   - If the match comes from one named variant, show the item with that variant.
     Example: foo (qux)

7. First version of paste/import:
   - Paste is supported for the Variant column only.
   - Users can paste a list of variant names, one per line.
   - Home location is filled in separately in the Home location column.

8. Migration cleanup:
   - Trim messy whitespace from variant names.
   - Treat obvious case-only duplicates as the same variant.
   - Prevent collisions with the reserved internal Base item key.
