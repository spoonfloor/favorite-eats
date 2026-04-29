# Supabase Migration — The Short Version

## Ground rule: plain English only

Any document in this repo that asks for human sign-off (contracts, plans, design docs, anything that needs "yes/no this is correct") **must be written in plain English**. No jargon, no buzzwords, no dense technical prose. If a regular person can't follow it, it doesn't count as a sign-off doc.

This rule applies to: this plan, every contract under `js/data/contracts/`, and any future doc that asks for review or approval.

## Living handoff

The current migration checkpoint lives in `docs/supabase-migration-status.md`.

Read that file before continuing migration work. Update it at each natural checkpoint, especially after a commit or push that the user explicitly requested.

## What we're doing

We're moving where the app gets its recipe data from. Right now it lives in a local database file on your computer (SQLite). We're moving it to Supabase, which is a database that lives in the cloud. The end goal: no more local database file. Everything in the cloud.

We tried this once already. It went badly because we did it in a sloppy way. This time we're doing it slowly and carefully so it doesn't blow up again.

## Why the last attempt failed

A few specific reasons, in plain terms:

- **Data calls were scattered all over the place.** Hundreds of spots in the code reach into the database directly. When we changed where the data came from, every one of those spots could break in a slightly different way. We were playing whack-a-mole forever.
- **Nobody wrote down what the answers were supposed to look like.** So when the cloud version returned data in a slightly different shape than the local version, the app silently broke in weird ways.
- **We turned cloud-mode on before it was actually working.** Users got pushed into broken paths.
- **We mixed in bug fixes and tweaks while migrating.** When something broke, we couldn't tell if it was the migration's fault or the tweak's fault.

## The rules this time

### Rule 1: Only one door to the data

Right now the code is full of "open the database, ask it for stuff" calls everywhere. We're going to make ONE door (a single folder of code) where all data requests go through. Every other part of the app asks that one door, and the door figures out where to get the data from.

That way, when we move from local to cloud, we only change what's behind the door. The rest of the app doesn't notice.

### Rule 2: Write down the answer before you ask

Before we change any code to use Supabase, we write down: "When the app asks for the list of recipes, it should get back THIS shape of data, in THIS order, with THIS handling of empty fields."

Then we check that both the old (local) way and the new (cloud) way give us exactly that. If they don't match, we don't flip the switch.

### Rule 3: One thing at a time

We don't migrate "everything related to recipes" in one shot. We migrate:

1. Just the recipe list (showing the list of recipes)
2. Then the recipe detail (opening one recipe)
3. Then the autocomplete dropdowns
4. Then creating a new recipe
5. Then saving changes

Each one is a separate, small change. Each one is fully working before we start the next one.

### Rule 4: Easy stuff first, scary stuff last

**Reading** data is safer than **writing** data. So we migrate all the reads first, get comfortable, then tackle the writes.

### Rule 5: A switch to flip back

Each thing we migrate gets its own on/off switch. If we move "recipe list" to cloud and something breaks, we can flip that one switch back without affecting anything else.

### Rule 6: No "while we're at it"

Migration changes ONLY change where the data comes from. They do NOT also fix bugs, change how things look, or improve unrelated code. Those are separate jobs done in separate commits. Mixing them up is what got us in trouble before.

### Rule 7: Easy rollback until everything works

We do not remove the local database path until every piece is migrated and proven. Until then you can still run against SQLite: on the web build, add **`?adapter=sqlite`** to use the local database for migrated reads (Supabase is the default there for testing). On Electron, the local file stays the default unless you add **`?adapter=supabase`** to exercise the cloud path.

## How we know each step is done

For each thing we migrate, ALL of these have to be true:

- We wrote down what the answer should look like.
- Both the old way and the new way give the same answer for our test recipes.
- The app still works end-to-end with the new way.
- The on/off switch works in both directions (we can flip back).
- We didn't add any new direct-database calls in the UI code.
- A real human clicked through the app and confirmed it works.

If even one of those is false, that step isn't done. We don't move on.

## The order we're going in

**Phase 1: Reading data (safe)**

- Recipe list
- Opening a recipe
- Autocomplete suggestions (ingredients, units, sizes, variants)
- Recipe title lookup

**Phase 2: Saving data (riskier)**

- Creating a new recipe
- Saving changes to a recipe

**Phase 3: Cleanup**

- Delete the local database code entirely
- Delete the on/off switches (no longer needed)
- Delete this doc, replaced by a normal architecture doc

## What we're NOT doing during this migration

- Adding new features
- Changing how anything looks or behaves
- Cleaning up unrelated code
- Removing Electron (different decision, different work)
- Changing the database structure (locked while we migrate)

If any of those temptations come up, they go in a different commit, not this one.

## Where we are right now

- The app works on the pre-migration code (rolled back).
- Browser file-picker works for testing.
- The previous botched migration is preserved on a branch called `migration-attempt-1` in case we want to look at any code from it later.
- Nothing has been migrated yet. We start fresh, the right way.

## What happens next

The very next step is the smallest possible thing: write down what "the recipe list" should look like (the contract for that one specific feature) and a few example recipes to test against. That's it. No code changes to the app itself yet. Just a written agreement on what the data should look like.

Then, and only then, do we start the actual migration work.

---

## TL;DR for when you forget

- One door for all data calls.
- Write down what the answer should be before you ask.
- One thing at a time, reads before writes.
- Each thing has an on/off switch.
- No mixing in unrelated changes.
- Cloud-only stays off until everything's proven.
- The local database goes in the trash at the very end, not before.

