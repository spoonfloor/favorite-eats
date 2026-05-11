# App Performance Optimization

## Purpose

This document **tracks what we know** about perceived performance (**latency**, **general sluggishness**, **UI snap-back**) and **guides systematic fixes** so we avoid fixing the same class of bug repeatedly (“whack-a-mole”). Update it as we measure new hotspots or ship architectural guardrails.

**Related:** list/session semantics live in `docs/catalog-plan-list-supabase.md`; broader migration context in `docs/multi-device-roadmap.md`.

---

## Two overlapping problems

### 1. High latency

Work that crosses the network (Supabase PostgREST, RPCs, Realtime, Edge Functions) is subject to **round-trip time**, **regional distance**, **cold paths**, and **chatty clients** (many small requests). Latency shows up as slow first paint, sluggish toggles, and crowded Network timelines—not always “the database is slow.”

### 2. Operation snap-back

The UI updates optimistically (or briefly shows the intended state), then **reverts** to an older value. With Supabase this is rarely mysticism: it is usually **ordering and merging** of asynchronous results, not magic.

---

## Snap-back: three causes (diagnosis lens)

Use these to classify an incident before rewriting feature code.

| Cause | One-line check |
|--------|----------------|
| **Failed write** | The mutation returns non-success (4xx/5xx) or the client error path runs; revert matches “server never accepted this.” |
| **Stale Realtime / ordering** | A broadcast or subscription delivers row/doc state that is **older** than the last successful write or arrives **out of order**; merge reapplies old truth. |
| **Race with refetch / full reload** | A `select`, RPC like `load_*`, or **full document reload** completes **after** a newer interaction and **replaces** in-memory state with an older snapshot. |

**Important:** Snap-back can happen even when **every HTTP status is 200**—the bug is **which payload applied last**, not whether one request “failed.”

---

## Working hypothesis: what usually causes snap-back (and why)

**Primary hypothesis:** Snap-backs are **most often** caused by **overlapping asynchronous updates**—multiple **full-state reloads** (`load_*` RPCs), **Realtime-driven hydrates**, and **optimistic UI**—where **whichever response or merge runs last wins**, even when that payload is **older** than the user’s latest intent. This is the **race-with-refetch / merge-order** class above, generalized beyond a single screen.

**Why we lean here (evidence, not proof):**

1. **Writes often succeed:** Shopping-list captures show **`set_*` RPCs returning 200** with OK bodies; failed mutations alone would not explain those timelines.  
2. **Server truth at rest matches intent:** In HAR analysis, the **last** `load_shopping_state` for a row aligned with the **last** mutation—the database narrative was consistent **when read after everything settled**. That argues against “RPC is persistently wrong” as the main story.  
3. **Many reloads, many origins:** The same session showed **`load_shopping_state`** fired close together from **different code paths** (post-toggle hydrate vs **Realtime** `onConnMessage`). Each returns a **full document**. Without strict versioning or “ignore stale snapshot” rules, applying those payloads **in completion order** can briefly (or stickily) paint an **out-of-date** doc over a **newer** local state.  
4. **Rapid interaction matches the failure mode:** Fast toggles increase **in-flight overlap**; “locks in” until refresh matches a **backlog of completions** reapplying stale snapshots, not a single bad request.  
5. **What would falsify this:** Reproducible snap-back where the **authoritative** `load_*` response (or a cheap follow-up read) **already** shows the wrong value for the row **while** the UI reverts—then we’d weight **server read-after-write**, **RPC semantics**, or **mapping bugs** more heavily. We have not seen that as the leading pattern in the captures so far.

**Secondary contributor (still common):** **Realtime** and **HTTP refetch** both updating the same aggregate **without a single merge policy**—functionally a special case of the same ordering problem, not a separate root cause.

---

## How to diagnose with Chrome DevTools (Network)

1. Use **Fetch/XHR** to hide static assets.  
2. Filter by host (e.g. `supabase.co`) or by RPC path fragment (`set_`, `load_`).  
3. Sort by **Waterfall** (timeline order), **not** by the **Time** column alone—that column is **duration**, not chronological order.  
4. For one reproduction: find the **write** (`POST`…`/rpc/…`), then trace **what runs immediately after** (especially **`load_*`** RPCs or large `GET`s).  
5. Compare **Payload** (intent) vs **Response** (server truth). If both agree but the UI still flips, suspect **client merge** or **another request finishing later**.

**HAR exports:** Useful for offline timelines; **redact** API keys and auth headers before sharing. Prefer filenames like `shopping-list-snapback-YYYY-MM-DD.har`, not generic `127.0.0.1.har`.

---

## What we learned: Shopping List checkbox snap-back (HAR-backed)

Concrete capture (local shopping list, checkbox toggles):

- **`set_shopping_list_row_checked`** returns **200** with a small `{ ok, kind }` body—writes often succeed.  
- **`load_shopping_state`** runs **right after** toggles (full shopping doc reload).  
- **Multiple `load_shopping_state` calls** appeared close together from **different initiators**: scheduled hydrate paths (`setTimeout` / `hydrateShoppingStateFromDataService`) **and** Supabase **Realtime** (`onConnMessage` → shopping plan hydrate).  
- **Last** `load_shopping_state` in the sequence matched the **last** mutation for the row—the server snapshot was **consistent** with the final intent. That pattern points to **merge / ordering / overlapping reloads**, not “RPC permanently wrong.”  
- Rapid back-and-forth toggling correlates with **more overlapping work**; once desync appears, the UI can feel “locked” until the queue drains or the page reloads—classic **request backlog**, not necessarily permanent DB corruption.

**Takeaway:** Feature-level checkbox hacks are insufficient if **global patterns** (duplicate full reloads + Realtime + optimistic UI) fight each other.

---

## Global directions (avoid whack-a-mole)

Implement once in shared plumbing; apply everywhere interactions can overlap.

1. **Versioned or monotonic snapshots**  
   Apply server payloads **only if** they are **newer** than what the client last applied (`version`, `updated_at`, or a client-side monotonic token per aggregate). Drop stale responses instead of blindly replacing state.

2. **Serialize or cancel per logical key**  
   For the **same row / same aggregate**, avoid overlapping contradictory mutations: queue, replace-with-latest, or **AbortController** for superseded fetches.

3. **Coalesce full reloads**  
   If both “after mutation” and “Realtime said something changed” call **`load_shopping_state`** (or equivalent), **dedupe**: one in-flight reload per session/key, collapse bursts to the latest request.

4. **Single reducer / merge path**  
   Route Realtime events and REST/RPC reloads through **one** code path that understands priority and staleness—avoid parallel full-document applies without ordering rules.

5. **Optional data-layer wrapper**  
   Whether TanStack Query, Rx, or a thin internal cache: centralize **dedupe, abort stale GETs, mutation lifecycle** so screens do not each reinvent races.

---

## General sluggishness

Beyond snap-back, the app can feel slow because of **network chatter**, **main-thread work**, or **cold RPCs**. Treat diagnosis as **top-down**: confirm *where* time goes before tuning Postgres or adding caches.

### 1. Diagnosing chief causes

| Approach | What it surfaces |
|----------|------------------|
| **Chrome Performance** recording | Long tasks on the **main thread** (big JS, sync layout, huge JSON parse) vs gaps waiting on **network**. |
| **Network** (Fetch/XHR, waterfall order) | **How many** `supabase.co` calls per navigation or gesture—**chatty clients** (many small `GET`s, N+1 patterns) often dominate over “slow database.” |
| **Lighthouse** (optional) | Structured lab metrics (e.g. blocking time) when tuning first interactions. |
| **Supabase dashboard** | Query/API logs—use **after** identifying **which** endpoints fire most often locally. |

Rough **symptom → layer** mapping:

| Symptom | Likely layer |
|---------|----------------|
| Many similar REST rows in Network | **Chatty client** (per-key lookups, missing batching)—not necessarily slow Postgres |
| One or two slow RPCs | **Specific RPC/query** or cold path |
| UI freezes while Network looks quiet | **Main-thread** cost (render, merge, parse) |
| Degrades after heavy use | Duplicate listeners, leaks, or **request backlog** |

### 2. Caching and splash-screen warmup

For a **hobby-scale, fairly small** database, the biggest wins are usually **fewer round-trips** and **session reuse**, not “download every table up front.”

**Practical options (increasing commitment):**

- **In-memory cache in the adapter** for **reference data** that changes rarely (stores, aisles, units, stable slices of catalog): reuse within the session; invalidate on explicit writes or a simple TTL.  
- **Batch or consolidate reads** where the client today fires **many parallel similar queries** (e.g. repeated `ingredients?select=...` patterns)—prefer **one batched query or RPC** when the product allows.  
- **Splash / gate (`index.html`, `splashGate.js`):** before auth, only **public** prefetch is safe. **After** password verify and a valid session, use the transition to **warm** the client: instantiate Supabase, optionally run a **small bootstrap** set (session + commonly needed slices) so the **next** navigation pays less cold-start tax. Prefetch **predictable next routes** (critical JS + first RPCs for the page users usually open next)—not necessarily the whole DB.  
- **Service Worker / HTTP cache** for authenticated Supabase REST: easy to get **wrong** (stale data, wrong user); treat as **advanced** unless requirements are clear.  
- **IndexedDB / persistent local cache:** good for **instant repeat visits**; adds **invalidation** complexity—reasonable **phase two** after in-memory + fewer requests prove out.

### 3. Optimistic actions

**Optimistic UI** (update the screen before the server confirms) improves **perceived** speed for actions that are safe to retry or reconcile (toggles, minor edits).

**Guardrails** (see **Working hypothesis** and **Global directions** above): optimism **amplifies** races if every action also triggers a **full `load_*`** or unconstrained **Realtime** hydrate—overlapping snapshots can still apply **last completion wins**. Prefer **staleness rules** (version / monotonic token), **coalesced reloads**, and **per-row serialization** before widening optimistic patterns across the app.

For a hobby project: use optimism where rollback is obvious (toast + revert); keep heavy or ambiguous flows **pessimistic** until merge logic is solid.

---

## Measurement backlog (fill in as we profile)

| Area | Symptom | Next measurement | Owner / note |
|------|---------|------------------|--------------|
| Shopping list | Checkbox snap-back under rapid toggle | Network waterfall + optional HAR | See section above |
| App-wide | Sluggish navigation / interactions | Performance recording + count of Supabase requests per screen | See **General sluggishness** |
| *Add rows as identified* | | | |

---

## Changelog

- **2026-05-11:** Added **General sluggishness** (diagnosis workflow, caching/splash warmup, optimistic actions + guardrails); expanded Purpose blurb; measurement backlog row.
- **2026-05-11:** Added explicit **working hypothesis** (overlapping full reloads + merge order; evidence and falsification); initial doc (Supabase latency vs snap-back; Shopping List HAR; global mitigation directions).
