# Supabase Migration — Plan

## What we're doing

Moving the recipe app off the local SQLite database file and onto Supabase (cloud Postgres). Done = the app works the way it did before, with no local database in the picture.

This is a solo project with one user. The plan is sized for that. We're not rebuilding NASA.

## Rules

These are the rules. Do not change them. Do not add new ones. Do not negotiate with them.

1. **Read the status doc first.** `docs/supabase-migration-status.md`. It tells you where we are and what to do next.
2. **One item per session.** Always work the lowest-numbered unfinished item from the backlog below. Do not pick a different one. Do not start a second one.
3. **No new ceremony for small writes.** Items A1–A* in the backlog are thin writes. They get: adapter code + UI wiring + one manual click-through. No new contracts, no new fixtures, no new parity entries, no live "smoke" rows.
4. **Full ceremony for recipe save only.** Item B is the only remaining slice that gets a written contract, fixtures, parity, and careful smoke. That's where the real risk lives.
5. **One door for data.** Any new UI read or write goes through `window.dataService`. Never add a direct `db.exec` from UI code.
6. **No "while I'm in here" changes.** Migration commits change where the data comes from. Nothing else. Bug fixes, refactors, UI tweaks go in separate commits on different days.
7. **Status doc stays short.** Use the template in the status doc. Do not append history. Git holds history.
8. **If blocked, stop and report.** Do not improvise. Do not invent a new slice.

## Backlog

Always work the lowest-numbered unfinished item.

- **A. Leftover small writes** (one pass, no ceremony each)
  - A1. Store create (Stores page Add dialog)
  - A2. Store delete
  - A3. Store edit (chain name, location name only — not aisles)
  - A4. Sweep: any other trivial admin write still going direct to SQLite. Add adapter method, wire UI, click through. Done.
- **B. Recipe save** (full ceremony — this is the slice that matters)
  - B1. Plain-English contract for the full save: metadata + tags + steps + ingredients as one bundled write. Do not split the Save button across adapters.
  - B2. Fixtures + parity coverage for the contract.
  - B3. Supabase adapter implementation.
  - B4. Wire the Save button through `window.dataService.saveRecipe`.
  - B5. Live smoke: create a throwaway recipe, edit each section, save, verify hosted row, clean up.
- **C. Aisle / store layout writes.** Same shape as B if it turns out to be bundled; same shape as A if individual. Decide at the time, not now.
- **D. Shopping list writes.** Whatever shopping-list writes are still SQLite-only. Scope at the time.
- **E. Electron default flip.** Change Electron's default adapter to Supabase. `?adapter=sqlite` becomes the escape hatch on Electron too.
- **F. Delete the bridge.** Remove the SQLite adapter, the SQLite bytes, the `?adapter` query param handling, the `SB` badge. Anything that exists only because both adapters had to coexist.
- **G. Delete these docs.** Replace with a one-page architecture note.

Do not start D before C is done. Do not start E before D is done. And so on. The order is the order.

## Definition of done for one item

All of:
- The change is made.
- The app still loads and the affected screen still works (one click-through in the browser is fine).
- The status doc is updated using the template.
- Commit + push.
- Stop. Do not start the next item.

## Evergreen chat-starter message

Paste this at the top of each new chat:

```text
Continue the Supabase migration for recipe-editor.

Before changing code, read:
- docs/supabase-migration-plan-plain.md (rules + numbered backlog)
- docs/supabase-migration-status.md (current state)

Work the lowest-numbered unfinished item in the backlog. One item per session. Do not pick a different item. Do not start a second item. Follow the rules in the plan doc exactly.

When the item is done: update the status doc using its template (do not append history), commit, push, stop.

If blocked, stop and report. Do not improvise.
```
