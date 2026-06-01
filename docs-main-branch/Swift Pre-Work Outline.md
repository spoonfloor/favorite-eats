We are preparing this app for a companion Swift/iOS app that shares the **Supabase Postgres catalog** as its durable contract (not a browser-local SQLite file).

The goal is to make the database a clear, reliable contract between the web app and Swift, so the mobile app can read what it needs directly from the DB without depending on shared JavaScript, hidden undocumented web-client behavior, or ad hoc manual coordination.

This pre-work is about deciding what should live in the database as structured data, what should be precomputed and stored as display-ready output, what the Swift app will need to calculate live from DB rows, and how to keep those boundaries stable as the web app continues to evolve.

It is also about creating a fast feedback loop, through a dumb consumer mockup and shared fixtures/tests, so we can catch missing fields, stale precomputed outputs, and drift-risk logic before substantial Swift development begins.

The key adjustment is that the dumb consumer mockup should move much closer to the beginning. Instead of waiting until most of the contract work is “done,” we should use the mockup early as a discovery and validation tool. The mockup should help reveal what the Swift app actually needs, what the DB already supports cleanly, what still depends on hidden undocumented web-client behavior, and what needs to become explicit contract or precomputed output.

## Working principle

Do not wait for the full DB contract, full schema cleanup, or full precompute design before building the dumb HTML prototype.

The prototype should come early and act as a contract-discovery tool:

- what can already be rendered cleanly from DB reads
- what still depends on hidden undocumented web-client behavior
- what needs to become explicit contract
- what should be precomputed later

## What must happen before the first proto view renders anything

Only this:

1. Pick the first slice.
   Recommended first slice:
   - Recipe detail view with servings scaling

2. Write a tiny proto-only rule set.
   Enough to say:
   - which tables/columns the proto is allowed to read
   - what assumptions are temporary
   - what web-only JS helpers are off-limits

3. Choose a few representative recipes.
   At least:
   - one simple recipe
   - one recipe with You Will Need
   - one recipe with tricky ingredient behavior like optional, variant, or OR alternate

4. Define what the first rendered screen must show.
   For v0 recipe detail:
   - title
   - servings
   - You Will Need
   - ingredients
   - steps

5. Commit to DB-only consumption.
   The proto may have its own small adapter/query layer, but it should not depend on shared web rendering logic.

## What does NOT need to be finished first

These can wait until after the first proto screen exists:

- full DB contract doc
- moving all hardcoded rules into DB tables
- designing all precomputed tables
- recomputation ownership/triggers
- complete edge-case policy writeup
- full shopping-list architecture

## Suggested fast order of work

### Phase 0

- Define first proto slice
- Define proto-only assumptions
- Pick sample recipes

### Phase 1

- Build Proto View 1:
  - recipe detail
  - servings scaling
  - You Will Need
  - ingredient list
  - steps

Use this view to discover:

- missing fields
- ambiguous quantity behavior
- hidden JS assumptions
- places where DB rows are not enough on their own

### Phase 2

- Build Proto View 2:
  - recipe list
  - basic search
  - filter chips matching the web app closely enough

### Phase 3

- Build Proto View 3:
  - ephemeral menu plan
  - selected recipe + servings pairs
  - one selected store
  - shopping list grouped by aisle

### Phase 4

- Build Proto View 4:
  - multiple stores with priority order
  - optional item marking
  - OR alternate display
  - unassigned section

## To-Do

1. Build the consumer mockup early

- Create a very small HTML page that reads only the Swift-facing DB shape.
- Start with the smallest meaningful user journey, not a full app.
- Use it immediately to verify what the Swift app can and cannot consume from DB rows alone.
- Treat it as a contract tester, not as another full product UI surface.

2. Define the DB contract

- Decide exactly which tables and columns the mobile app is allowed to rely on.
- Define what each important field means, especially tricky ones like quantity, unit, variant, optional, alternate, store, aisle, and sort order.
- Write down what is guaranteed versus incidental, so Swift is not built on accidental web-app behavior.
- Let prototype friction drive this work: define only what is needed for the next meaningful screen, then refine.

3. Move settings-like rules into the DB

- Identify rules that are really just facts, mappings, labels, flags, or ordering choices.
- Store those as data instead of leaving them hardcoded in web app constants or helper functions.
- Make sure both the web app and Swift can read the same values and therefore change behavior without requiring two code changes.

4. Define precomputed outputs

- Pick the outputs that are stable for a given recipe and do not depend on live user interaction.
- Have the web app compute those outputs and save them into dedicated DB tables.
- Treat those tables as display-ready consumables for Swift, so Swift can just read and render them.
- Do this after the early prototype reveals which outputs are awkward or fragile to compute live from raw rows.

5. Define recomputation ownership and triggers

- Decide which parts of the web app are responsible for refreshing each precomputed table.
- List exactly which edits require per-recipe recompute versus all-recipe recompute.
- Make sure recomputation happens automatically during save flows so precomputed data does not go stale.

6. Clearly separate live calculations from stored outputs

- Decide which features must be computed at runtime because they depend on user choices.
- Make sure the DB contains enough structured input data for those calculations to happen cleanly in Swift.
- Avoid pretending everything can be precomputed if some features are inherently interactive.

7. Document edge-case behavior

- List the cases where output can change based on interpretation, such as optional items, OR alternates, rounding, merging, pluralization, and aisle sorting.
- Decide the intended behavior for those cases instead of leaving them implied by current JS code.
- Write the rules down so future Swift work is based on decisions, not code archaeology.
- Use cases discovered while building the proto as the highest-priority edge cases to document first.

8. Create fixtures and tests for alignment

- Build a small set of representative recipes and shopping scenarios that cover normal and tricky cases.
- Define the expected outputs those inputs should produce, both for static display and live calculations.
- Use those fixtures as the shared truth set so web app changes and Swift development can be checked against the same expectations.
- Seed the earliest fixtures from the exact recipes and shopping cases used by the first prototype views.

## Practical rule for the pre-work

Before proto:

- decide only what is necessary to render the next screen

After proto:

- use friction in the proto to decide
  - what becomes contract
  - what moves into DB
  - what gets precomputed
  - what remains live calculation

## Bottom line

Before creating the first proto view that renders something, the only real prerequisites are:

- a narrow first user-journey slice
- a few sample recipes
- a tiny list of allowed DB inputs
- agreement that the proto reads the DB directly without hidden undocumented web-client behavior
