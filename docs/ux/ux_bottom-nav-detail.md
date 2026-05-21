# Favorite Eats — New Top-Level Pages & Nav

## Feature goals (super terse)

- Add 3 new top-level modes alongside Recipes: Shopping, Units, Stores.
- Use a bottom nav (list pages only) to switch between modes.
- Provide minimal but working list pages for Shopping, Units, and Stores.
- Provide placeholder editor pages for Shopping items and Stores (title-only).
- Keep everything aligned with existing Recipes / RecipeEditor patterns.

---

## Global / Pages / Routing

### Files to create

- [ ] shopping.html (Shopping list)
- [ ] shoppingEditor.html (Shopping item editor, placeholder)
- [ ] units.html (Units list, inline edit)
- [ ] stores.html (Stores list)
- [ ] storeEditor.html (Store editor, placeholder)

### Body classes per page

- [ ] recipes.html → body.recipes-page (verify existing)
- [ ] recipeEditor.html → body.recipe-editor-page (verify existing)
- [ ] shopping.html → body.shopping-page
- [ ] shoppingEditor.html → body.shopping-editor-page
- [ ] units.html → body.units-page
- [ ] stores.html → body.stores-page
- [ ] storeEditor.html → body.store-editor-page

### Loader wiring in main.js

Detect page type and call loader:

- [ ] If body has .shopping-page → loadShoppingPage()
- [ ] If body has .shopping-editor-page → loadShoppingItemEditorPage()
- [ ] If body has .units-page → loadUnitsPage()
- [ ] If body has .stores-page → loadStoresPage()
- [ ] If body has .store-editor-page → loadStoreEditorPage()

Implement loaders (mirroring loadRecipesPage / loadRecipeEditorPage):

- [ ] loadShoppingPage()

  - [x] Set `window.dataService.useSupabase = true`; load rows via `dataService.listShoppingItems`.
  - [x] Hydrate plan/list from Supabase when remote shopping state is enabled.
  - [ ] Render Shopping list into the page container.

- [ ] loadShoppingItemEditorPage()

  - [x] Load catalog item via `dataService` (no local DB file).
  - [ ] Read selectedShoppingItemId / selectedShoppingItemIsNew from sessionStorage.
  - [ ] Load existing item if not new.
  - [ ] Populate placeholder editor UI (title field only).

- [ ] loadUnitsPage()

  - [x] Load units via `dataService.listUnits`.
  - [ ] Render inline-editable list, including “Add unit…” row.

- [ ] loadStoresPage()

  - [x] Load stores via `dataService.listStores`.
  - [ ] Render list (name-only rows).

- [ ] loadStoreEditorPage()
  - [x] Load store layout via `dataService` (no local DB file).
  - [ ] Read selectedStoreId / selectedStoreIsNew from sessionStorage.
  - [ ] Load existing store if not new.
  - [ ] Populate placeholder editor UI (title field only).

---

## Bottom Nav (list pages only)

### Scope

Show bottom nav on:

- [ ] recipes.html
- [ ] shopping.html
- [ ] units.html
- [ ] stores.html

Hide bottom nav on:

- [ ] recipeEditor.html
- [ ] shoppingEditor.html
- [ ] storeEditor.html

### Tabs and labels

Tabs (in order):

- [ ] Recipes
- [ ] Shopping
- [ ] Units
- [ ] Stores

### Behavior (navigation)

- [ ] Recipes tab → window.location.href = 'recipes.html'
- [ ] Shopping tab → window.location.href = 'shopping.html'
- [ ] Units tab → window.location.href = 'units.html'
- [ ] Stores tab → window.location.href = 'stores.html'

### Visual spec (summary)

Implement according to existing bottom-nav spec:

- [ ] Full-width bar at bottom, solid purple background.
- [ ] Centered cluster of pill tabs (equal width based on longest label).
- [ ] Respect shared CSS vars (min-width, padding, colors).
- [ ] Single-line pills; text truncates with ellipsis; no wrapping or horizontal scroll.
- [ ] Height and typography match Add button visuals.
- [ ] Inactive pill matches disabled Cancel/Save style.
- [ ] Active pill visually matches search bar styling.
- [ ] Hover on inactive pill: slight tint only, no animation.
- [ ] All colors/spacings driven by existing CSS variables.

---

## Shopping

### Data model (v0)

(Exact DB shape TBD; conceptual model:)

- ShoppingItem:
  - id: number
  - name: string (e.g., "Monkey seeds")
  - variants: string[] (e.g., ["pickled", "spicy", "extra spicy", "rabid", "glum"])

Variants are subfields inside a single item (not separate items).

### shopping.html — layout and behavior

App bar:

- [ ] Title: "Shopping"
- [ ] Right side: Add button (same look and position as Recipes list)

Search:

- [ ] Search input below title (mirrors Recipes behavior).
- [ ] Filters by name and variant text (case-insensitive partial match).

List rows:

- [ ] Each row shows a single line in the format:
      Name (var1, var2, var3, ...)
- [ ] If there are no variants, display just the name with no parentheses.
- [ ] Use standard CSS text overflow (ellipsize as needed).

Sorting:

- [ ] Sort items alphabetically by name only (variants ignored).

Row interactions:

- [ ] Clicking a row:

  - [ ] Save the selected item id in sessionStorage (e.g., 'selectedShoppingItemId').
  - [ ] Clear 'selectedShoppingItemIsNew'.
  - [ ] Navigate to 'shoppingEditor.html'.

- [ ] Clicking Add:
  - [ ] Clear 'selectedShoppingItemId'.
  - [ ] Set 'selectedShoppingItemIsNew' = '1'.
  - [ ] Navigate to 'shoppingEditor.html'.

Bottom nav:

- [ ] Visible and functional as defined in the nav section.

### shoppingEditor.html — editor placeholder

App bar:

- [ ] Left: back arrow ("<-") that returns to shopping.html without saving.
- [ ] Right: Save and Cancel affordances.

Body:

- [ ] Display a single title-only input or editable field, visually matching recipe title style.
- [ ] Example:
      Monkey seeds
- [ ] No other fields yet (no variants, locations, etc.).

Behavior (v0):

- [ ] On load:

  - [ ] If 'selectedShoppingItemIsNew' === '1', start with empty title.
  - [ ] Else, load existing item title from DB by 'selectedShoppingItemId'.

- [ ] Save:

  - [ ] If new and title non-empty → insert new item row into DB.
  - [ ] If existing → update item name.
  - [ ] Clear 'selectedShoppingItemIsNew'.
  - [ ] Navigate back to shopping.html.

- [ ] Cancel or back arrow:
  - [ ] Do not persist changes.
  - [ ] Navigate back to shopping.html.

Bottom nav:

- [ ] Not shown on this page.

---

## Units

### Data model (v0)

- Unit:
  - id: number
  - name: string (e.g., "tsp", "tbsp", "cup", "gram")

Units are managed entirely on the top-level page (no child editor).

### units.html — layout and behavior

App bar:

- [ ] Title: "Units"
- [ ] No Add button (creation is inline).

Search:

- [ ] Search input below title.
- [ ] Filters unit rows by name.

List rows:

- [ ] Top row is a special inline "Add unit…" row.
- [ ] Beneath, each row shows a single unit.name string.

Inline add:

- [ ] Clicking or focusing "Add unit…" turns it into a text input.
- [ ] Enter or blur with non-empty text:
  - [ ] Insert new unit into DB.
  - [ ] Re-render list with new unit row.
  - [ ] Restore a fresh "Add unit…" row at the top.
- [ ] Blur with empty text or Escape:
  - [ ] Restore "Add unit…" placeholder without creating a row.

Inline edit:

- [ ] Clicking an existing unit row makes that row an inline text input prefilled with existing text.
- [ ] Enter or blur:
  - [ ] Update unit name in DB.
  - [ ] Restore read-only row.
- [ ] Escape:
  - [ ] Revert to original text without saving.

(Deletion can be added later; v0 can omit or provide a simple delete icon.)

Bottom nav:

- [ ] Visible and functional as defined in nav section.

---

## Stores

### Data model (v0)

Store is just a single string; no variants, no chain/branch split for now.

- Store:
  - id: number
  - name: string (e.g., "Safeway (Monkey Square)", "Mollie Stone — your mom's house")

### stores.html — layout and behavior

App bar:

- [ ] Title: "Stores"
- [ ] Right side: Add button (same style as Recipes / Shopping).

Search:

- [ ] Search input below title.
- [ ] Filters stores by name.

List rows:

- [ ] Each row displays store.name verbatim on one line.
- [ ] No normalization/parsing; string is treated as display-ready.

Row interactions:

- [ ] Clicking a row:

  - [ ] Save selectedStoreId in sessionStorage.
  - [ ] Clear selectedStoreIsNew.
  - [ ] Navigate to 'storeEditor.html'.

- [ ] Clicking Add:
  - [ ] Clear selectedStoreId.
  - [ ] Set selectedStoreIsNew = '1'.
  - [ ] Navigate to 'storeEditor.html'.

Bottom nav:

- [ ] Visible and functional as defined in nav section.

### storeEditor.html — editor placeholder

App bar:

- [ ] Left: back arrow ("<-") that returns to stores.html without saving.
- [ ] Right: Save and Cancel affordances.

Body:

- [ ] Single title field for store name, e.g.:
      Safeway (Monkey Square)
- [ ] No additional fields in v0.

Behavior (v0):

- [ ] On load:

  - [ ] If selectedStoreIsNew === '1', start with empty title.
  - [ ] Else, load store.name by selectedStoreId from DB.

- [ ] Save:

  - [ ] If new and title non-empty → insert new store row into DB.
  - [ ] If existing → update store name.
  - [ ] Clear selectedStoreIsNew.
  - [ ] Navigate back to stores.html.

- [ ] Cancel or back arrow:
  - [ ] Discard unsaved changes.
  - [ ] Navigate back to stores.html.

Bottom nav:

- [ ] Not shown on this page.

---
