# SQLite cleanup — complete removal plan

> **Purpose:** Finish removing browser SQL.js / local-blob persistence and all
> dead code paths that assume a local SQLite database. Postgres via
> `window.dataService` is the only runtime data path.
>
> **Related:** `docs/migration-sweep.md` (broader Supabase sweep),
> `docs/supabase-architecture.md` (intended end state). When this plan is done,
> update both and mark the SQLite tail complete.

## Risk context (read first)

| Fact | Implication for this work |
|------|---------------------------|
| No `assets/favorite_eats.db` in repo or web build | New deploys do not ship a seed DB. |
| `favoriteEatsShouldUseSupabaseDataDoor()` returns `true` | `!favoriteEatsShouldUseSupabaseDataDoor()` branches never run in production. |
| List loaders set `const db = null` | `window.dbInstance` is usually `null`; SQLite open/persist calls are no-ops or unreachable. |
| No `bridge.js` in the tree | `window.bridge` is undefined in the app; `bridge.loadRecipeFromDB` paths only run in tests that inject a mock. |

**Risk profile:** Low chance of **data loss** or **users falling back to a local file** (there is no file). Residual risk is **ordinary regression** while editing `js/main.js` next to live Supabase shopping/recipe logic, and **test breakage** where suites still mock the SQLite door.

Work **top to bottom** by phase. After Phase 1 (and again after Phase 6), run `npm test` and the manual smoke checklist.

---

## Current state (discovery baseline)

Re-run before starting and after each phase:

```bash
rg -i 'sqlite|sql\.js|initSqlJs|dbInstance|favoriteEatsDb|setSqliteDb|openFavoriteEatsDb' \
  --glob '!perf-artifacts/**' --glob '!package-lock.json'
```

**Runtime (`js/main.js`):**

- SQL.js CDN load: `SQL_JS_CDN_BASE`, `ensureSqlJsReady()`, dynamic `sql-wasm.js` injection.
- Blob I/O: `openFavoriteEatsDbForCurrentRuntime`, `loadFavoriteEatsDbBytesForCurrentRuntime`, `ensureFavoriteEatsDbBytesForWeb`, `fetchBundledFavoriteEatsDbBytes`, `getStoredFavoriteEatsDbBytesForWeb`, `persistFavoriteEatsDbBytesForWeb`, `clearStoredFavoriteEatsDbBytesForWeb`, `persistBinaryArrayInMain`, `persistLoadedDbInMain`, `persistDbForCurrentRuntime`.
- Storage keys: `localStorage['favoriteEatsDb']`, IndexedDB via `window.favoriteEatsSqliteBlobCache` (`js/sqliteBlobCache.js`).
- Global: `window.dbInstance` (assigned in several loaders; often `null`).
- Door: `favoriteEatsShouldUseSupabaseDataDoor()` → `true` (~44 call sites in `main.js`).
- Shopping: `isSqliteCatalogIngredientExcludedFromShoppingList`, `getRecipeDerivedShoppingPlanRows`, SQLite branches in `getShoppingPlanSelectionRows`, `patchShoppingListDocForRewrittenSelectionKeysAsync`, etc.
- Recipe editor: `openFavoriteEatsDbForCurrentRuntime` when `!shouldUseSupabaseAdapter`; save path `window.dbInstance.export()` / `bridge.loadRecipeFromDB` when `!savedThroughSupabase`.
- Dead stubs: `ensureRecipeTagsSchemaInMain`, `ensureIngredientVariantTagsSchemaInMain`, `ensureSizesSchemaInMain`, `ensureUnitsSchemaInMain`, `ensureIngredientBaseVariantsInMain`, `pruneOrphanedIngredientSynonymsInMain` (no-op `void db`).
- Misleading names: `shouldDeferSqlBootForCurrentPage`, `bootFavoriteEatsApp` (no longer boot SQL).

**Other JS:**

- `js/sqliteBlobCache.js` — IndexedDB mirror for blob.
- `js/typeahead.js`, `js/recipePresence.js` — guard on `favoriteEatsShouldUseSupabaseDataDoor()`.
- `js/data/index.js` — already Supabase-only; no second adapter file to delete.
- `js/data/adapters/supabaseAdapter.js` — comments referencing SQLite parity (not runtime).

**HTML (14 pages):** each loads `js/sqliteBlobCache.js` before `js/main.js`:

`recipeEditor.html`, `recipes.html`, `shopping.html`, `shoppingEditor.html`, `shoppingList.html`, `stores.html`, `storeEditor.html`, `tags.html`, `tagEditor.html`, `units.html`, `unitEditor.html`, `sizes.html`, `sizeEditor.html`.

`index.html` does **not** load `main.js` or sqlite scripts.

**NPM:** `sql.js` in `devDependencies` (`package.json`).

**Tests:** `tests/runWebBuildTests.js` (no bundled DB); `tests/runShoppingPlanLinkedRecipeTests.js`, `tests/runShoppingIdentityMigrationTests.js` mock `favoriteEatsShouldUseSupabaseDataDoor: () => false`.

**Separate product:** `recipe-lan-server/` (Python `sqlite3`, not browser sql.js).

**Docs / rules:** see Phase 8 list.

**Optional legacy artifact:** `docs/favorite_eats.db.sql` (schema dump only; not shipped).

---

## Phase 1 — Runtime (`js/main.js`) — highest risk, do first

**Goal:** Nothing can load, query, or save a local database file. All reads/writes go through `window.dataService` only.

Recommended **internal order** (same phase; commit or smoke between steps):

1. Blob + sql.js engine (1.1)
2. Recipe editor open/save (1.3)
3. `dbInstance` + dead persists (1.2, 1.4, 1.5)
4. Collapse Supabase-only branches (1.6, 1.8)
5. Delete stub schema helpers + bridge references (1.6 continued)
6. Rename boot helpers (1.7)

### 1.1 Remove sql.js engine and blob I/O

**Delete or gut:**

| Symbol / constant | Notes |
|-------------------|--------|
| `SQL`, `sqlJsInitPromise` | Module-level sql.js state |
| `SQL_JS_CDN_BASE` | jsDelivr base URL |
| `ensureSqlJsReady()` | Script injection + `initSqlJs` |
| `openFavoriteEatsDbForCurrentRuntime()` | Opens `SQL.Database` |
| `loadFavoriteEatsDbBytesForCurrentRuntime()` | |
| `ensureFavoriteEatsDbBytesForWeb()` | |
| `fetchBundledFavoriteEatsDbBytes()` | |
| `getStoredFavoriteEatsDbBytesForWeb()` | |
| `persistFavoriteEatsDbBytesForWeb()` | |
| `clearStoredFavoriteEatsDbBytesForWeb()` | |
| `BUNDLED_FAVORITE_EATS_DB_PATH`, `bundledFavoriteEatsDbUrl()` | `assets/favorite_eats.db` (absent) |
| `persistBinaryArrayInMain()` | |
| `persistLoadedDbInMain()` | |
| `persistDbForCurrentRuntime()` | Early-return when `!db` today |

**Storage:** Remove all reads/writes of `localStorage` key `favoriteEatsDb` and calls to `window.favoriteEatsSqliteBlobCache` (read/write/remove).

**Optional (not required for correctness):** One-time client cleanup note in changelog — old users may still have orphan blobs in localStorage/IndexedDB; harmless after code removal.

### 1.2 Remove `window.dbInstance` lifecycle

**Stop assigning** `window.dbInstance` in:

| Loader | Current pattern |
|--------|-----------------|
| `loadRecipesPage` | `const db = null`; assigns `window.dbInstance` |
| `loadShoppingPage` (Items) | same |
| `loadShoppingListPage` | same |
| `loadStoresPage` | same |
| `loadRecipeEditorPage` | `db \|\| null` after optional open |

Units / tags / sizes list loaders do not set `dbInstance` today — no change unless grep finds new assignments.

**Remove:**

- Default params `db = window.dbInstance` where they only existed for local DB (grep `window.dbInstance` in `main.js`).
- Dead calls `window.dataService.setSqliteDb` (method does not exist on the data door).

**Grep targets after edit:** `window.dbInstance`, `sqliteDb`, `typeof db.exec`.

### 1.3 Recipe editor — last screen that could open local DB

In `loadRecipeEditorPage`:

- Remove `if (!shouldUseSupabaseAdapter) { db = await openFavoriteEatsDbForCurrentRuntime(); … }` and redirect-to-welcome on failure.
- Remove `if (db) { … schema … bridge.ensureRecipeIngredientMapParentheticalNoteSchema … }` branches tied to local file.
- Remove `setSqliteDb` wiring.

On save (app bar / editor save handler):

- Remove block when `!savedThroughSupabase`: `window.dbInstance.export()`, `persistBinaryArrayInMain`, `bridge.loadRecipeFromDB` refresh.
- Keep only `dataService.saveRecipe` + Supabase refresh path (`loadRecipeDetail` / returned payload).

### 1.4 Recipes list — dead persist after create/delete

Remove:

```js
if (!window.dataService.useSupabase) {
  await persistDbForCurrentRuntime(db, …);
}
```

in create/delete recipe handlers (`db` is already `null`).

### 1.5 Items page — dead persist after create/remove item

Remove **unconditional** `await persistDbForCurrentRuntime(db, …)` after `findOrCreateShoppingItem` / `deleteShoppingItem` (no-op when `db` is null; misleading and can surface error toasts if `db` were ever non-null).

### 1.6 Shopping / plan helpers — collapse to Supabase-only

**Delete or simplify** when `favoriteEatsShouldUseSupabaseDataDoor()` is always true (prefer deleting the function in 1.8 once branches are gone):

| Symbol | Action |
|--------|--------|
| `isSqliteCatalogIngredientExcludedFromShoppingList` | Uses `db.exec`; delete |
| `getShoppingPlanSelectionRows` | Remove `visibleNameKeys` from `getVisibleIngredientNamePool(db)`, SQLite exclusion, `bridge.loadRecipeFromDB` walk |
| `patchShoppingListDocForRewrittenSelectionKeysAsync` | Remove `!useDataDoor && sqliteDb.exec` branch; always `getShoppingPlanSelectionRowsViaDataService` |
| `getRecipeDerivedShoppingPlanRows` | Delete if only used as SQLite fallback when `listShoppingPlanRecipeItems` fails and door is false; with door always true, failures should throw, not fall back |
| `loadShoppingPlanRecipeFromDB` | Keep **materialize cache** path (`peekShoppingPlanRecipeMaterializeCache`); remove `bridge.loadRecipeFromDB` branch |

**Bridge (no production script):** Remove all `window.bridge` / `bridge.loadRecipeFromDB` / `bridge.ensureRecipeIngredientMapParentheticalNoteSchema` / `bridge.regenerateAllIngredientLemmas` references in `main.js`. There is no `bridge.js` in the repo; only tests inject `window.bridge`.

**Stub schema helpers — delete if unused after loader edits:**

- `ensureRecipeTagsSchemaInMain`
- `ensureIngredientVariantTagsSchemaInMain`
- `ensureSizesSchemaInMain`
- `ensureUnitsSchemaInMain`
- `ensureIngredientBaseVariantsInMain`
- `pruneOrphanedIngredientSynonymsInMain`

**Keep:** `ensureIngredientLemmaMaintenanceInMain` — already Supabase-first; remove inner `else if (db)` / SQLite fallback catches.

**Keep:** `loadShoppingPlanRecipeFromDB` only as cache peek + planner helpers that depend on prefetched recipe payloads (Supabase materialization cache).

### 1.7 Rename misleading boot (optional, same phase)

| Old | Suggested |
|-----|-----------|
| `shouldDeferSqlBootForCurrentPage` | e.g. `shouldDeferAppBootForCurrentPage` |
| `bootFavoriteEatsApp` | e.g. `bootFavoriteEatsPage` |

`bootFavoriteEatsApp` already routes page loaders and sets `dataService.useSupabase`; it does not load SQL.

### 1.8 `favoriteEatsShouldUseSupabaseDataDoor`

**Prefer:** Delete function and all `if (!favoriteEatsShouldUseSupabaseDataDoor())` / `if (favoriteEatsShouldUseSupabaseDataDoor())` branches once logic is unconditionally Supabase.

**Also update:**

- `js/typeahead.js` — use `window.dataService.useSupabase` or assume remote pools.
- `js/recipePresence.js` — same for remote presence subscription.

### Phase 1 — Manual smoke

Sign in → run in order:

1. **Recipes** — list, create recipe, open editor, save, delete (one recipe).
2. **Recipe editor** — edit ingredient line, save, cancel baseline.
3. **Items** (`shopping.html`) — list, add item, remove/hide item.
4. **Shopping list** — generated rows, check/uncheck, edit row text if applicable.
5. **Plan selections** — add recipe to plan, adjust servings if planner mode.
6. **One catalog editor** — unit, tag, or store save.

Then: `npm test`.

---

## Phase 2 — Delete dedicated JS file

| Action | Path |
|--------|------|
| Delete file | `js/sqliteBlobCache.js` |

No other runtime file should reference `favoriteEatsSqliteBlobCache` after Phase 1.

---

## Phase 3 — HTML script tags (14 pages)

Remove from each file:

```html
<script src="js/sqliteBlobCache.js"></script>
```

**Pages:** listed in [Current state](#current-state-discovery-baseline).

**Build:** Confirm `scripts/buildWeb.js` does not copy or inject `sqliteBlobCache.js` into `dist/web/` (grep the script; today it copies HTML/JS as-is).

---

## Phase 4 — NPM dependency

| Action | Path |
|--------|------|
| Remove `"sql.js"` | `package.json` → `devDependencies` |
| Regenerate lockfile | `npm install` → `package-lock.json` |

---

## Phase 5 — Data layer (comments + dead references)

| Action | Where |
|--------|--------|
| Remove or reword “SQLite” / “SQL.js” parity comments | `js/data/adapters/supabaseAdapter.js` |
| Update contract docs that say “SQLite persistence still happens in the caller” | `js/data/contracts/*.md` — especially `createRecipe.md`, `saveRecipe.md`, `deleteRecipe.md`, `createTag.md`, `editTag.md`, `deleteTag.md`, `createSize.md`, `editSize.md`, `removeSize.md`, `removeUnit.md`, `lookupIngredientNameByLemma.md`, `isIngredientVariantDeprecated.md` |
| Rename fixture cases/descriptions | e.g. `js/data/fixtures/lookupIngredientNameByLemma.json`, `js/data/fixtures/isIngredientVariantDeprecated.json` |

**No adapter deletion:** `js/data/index.js` is already Supabase-only.

---

## Phase 6 — Tests

| File | Action |
|------|--------|
| `tests/runWebBuildTests.js` | **Keep** assertion that `dist/web/assets/favorite_eats.db` is absent |
| `tests/runShoppingIdentityMigrationTests.js` | Remove or update `favoriteEatsShouldUseSupabaseDataDoor: () => false`; verify extracted `main.js` snippet still valid |
| `tests/runShoppingPlanLinkedRecipeTests.js` | **Refactor** — today mocks door `false` + `window.bridge.loadRecipeFromDB`; align with Supabase materialization / `listShoppingPlanRecipeItems` or cache-only paths |
| Any test using `vm.runInContext` on `main.js` | Re-run after large deletions; snippet boundaries break easily |

Run `npm test` (or `node tests/runAllTests.js`) after Phases 1–4 and again after Phase 6.

---

## Phase 7 — `recipe-lan-server/` (separate product decision)

Not browser sql.js. Decide **delete whole folder** vs keep for LAN experiments.

| Path | SQLite tie-in |
|------|----------------|
| `recipe-lan-server/app/main.py` | `sqlite3` module |
| `recipe-lan-server/docker-compose.yml` | `SQLITE_PATH` |
| `recipe-lan-server/Dockerfile` | `SQLITE_PATH` |
| `.gitignore` | `recipe-lan-server/data/` comment |

If deleted: remove directory and gitignore lines in one commit. **Does not block** browser Phases 1–6.

---

## Phase 8 — Docs and rules

Update or trim SQLite/migration language (not blocking runtime):

| Path | Notes |
|------|--------|
| `docs/migration-sweep.md` | Mark SQLite tail done or shorten “remaining work” |
| `docs/supabase-architecture.md` | Remove “small tail in main.js” once true; fix “no db.exec in js/” claim |
| `docs/multi-device-roadmap.md` | |
| `docs/editing-planning-mode.md` | |
| `docs/store-db-info.md` | |
| `docs/store-aisle-editor.md` | References `favorite_eats.db.sql` |
| `docs/Swift Pre-Work Outline.md` | |
| `docs/Swift App Understanding.md` | |
| `.cursor/rules/shopping-variant-editor-known-issue.mdc` | SQLite migration sentence |
| `docs/ux/ux_bottom-nav-detail.md` | `window.dbInstance` checklist item |

**Optional archive/delete:** `docs/favorite_eats.db.sql` (legacy schema dump; not schema truth for Supabase).

**This plan:** Mark complete in header when Phase 10 passes.

---

## Phase 9 — Incidental / grep cleanup

| Item | Action |
|------|--------|
| `perf-artifacts/*.har` | Optional delete or regenerate (not shipped) |
| `.gitignore` | Remove SQLite LAN comment if `recipe-lan-server` deleted |
| Repo / build output | Confirm no `assets/favorite_eats.db` |

---

## Phase 10 — Final verification

From repo root:

```bash
rg -i 'sqlite|sql\.js|initSqlJs|dbInstance|favoriteEatsDb|setSqliteDb|openFavoriteEatsDb' \
  --glob '!perf-artifacts/**' --glob '!package-lock.json'
```

**Expect:** zero hits in `js/` and HTML, except:

- Historical mentions you intentionally keep in `docs/` (exclude with `--glob '!docs/**'` for a stricter runtime gate), or
- `recipe-lan-server/` if Phase 7 kept the folder.

**Stricter runtime-only gate:**

```bash
rg -i 'sqlite|sql\.js|initSqlJs|dbInstance|favoriteEatsDb|setSqliteDb|openFavoriteEatsDb' \
  js/ '*.html' tests/ scripts/ --glob '!perf-artifacts/**'
```

**Manual smoke:** Same as [Phase 1 smoke](#phase-1--manual-smoke).

**Automated:** `npm test` && `npm run test:web-build`.

---

## Out of scope

- **Shopping item editor variant row UI** (Shift+Enter, focus jitter) — see `docs/migration-sweep.md` and `.cursor/rules/shopping-variant-editor-known-issue.mdc`.
- **Shopping List free-text “add a line”** — product does not have this; see `.cursor/rules/shopping-list-no-adhoc-lines.mdc`.
- **`experiments/name-deck/*`**
- **Server-side Postgres `list.manual_rows`** — table name only; not browser SQLite.

---

## Completion checklist

- [ ] Phase 1 — `js/main.js` runtime scrub + smoke
- [ ] Phase 2 — `js/sqliteBlobCache.js` deleted
- [ ] Phase 3 — 14 HTML script tags removed; build checked
- [ ] Phase 4 — `sql.js` removed from `package.json`; lockfile updated
- [ ] Phase 5 — data layer comments/contracts/fixtures
- [ ] Phase 6 — tests updated; `npm test` green
- [ ] Phase 7 — `recipe-lan-server/` decision executed
- [ ] Phase 8 — docs and cursor rules updated
- [ ] Phase 9 — incidental cleanup
- [ ] Phase 10 — `rg` gate + smoke + `test:web-build`

---

## Agent handoff

When resuming work:

1. `git grep -i sqlite js/main.js | head` — see what remains.
2. Do **not** trust line numbers in this doc; trust symbol names and grep.
3. Prefer **deleting dead branches** over leaving `favoriteEatsShouldUseSupabaseDataDoor() { return true; }` indefinitely.
4. After substantive `main.js` edits, run shopping-state-sensitive flows (plan → list generation) per `docs/agent-handoff-shopping-state.md`.
