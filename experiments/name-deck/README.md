# Name deck (quarantined experiment)

Self-contained shuffle + `localStorage` session for paired lists. **Nothing in the main app imports this folder.**

## Contents

| File | Purpose |
|------|---------|
| `nameDeck.js` | `dealRound`, shuffle, fingerprint lists, `createSession` with persistence |
| `lists.sample.js` | Example `NAME_DECK_LIST_A` / `NAME_DECK_LIST_B` (replace when integrating) |
| `uiToast.js` | Minimal `window.ui.toast` matching baby-eats (`utils.js` DOM + behavior), no full utils bundle |
| `name-deck-demo.css` | White page; **no** `--bottom-nav-height` override (uses `64px` from `styles.css` so toast gap matches app); `var(--main-font)` on toast; wrap long toast text |
| `presenceToastMessage.js` | Builds “&lt;pair&gt; is editing this recipe.” (optional recipe title) like intended presence copy |
| `demo.html` | Loads Google Fonts Red Hat Mono, then `overrides.css` → `styles.css` → `overlays.css` (same order as `recipeEditor.html`); toast message is full sentence |

## Plug-in later

1. Copy `nameDeck.js` (and your lists) into the target app, or keep as a sibling script.
2. Call `NameDeck.createSession({ listA, listB, storage: localStorage, storageKey?: string })`.
3. On each user action, `session.next()` → `{ text, progress }`.
4. If `LIST_A` / `LIST_B` change, the stored fingerprint no longer matches and the session resets (fresh deck on next interaction).

## Try the demo

**Serve from the repository root** (so `../../css/styles.css` resolves to `css/`):

```bash
cd /path/to/recipe-editor
npx --yes serve . -p 8765
```

Open `http://127.0.0.1:8765/experiments/name-deck/demo.html`. Using `file://` may block or isolate `localStorage`; a local server avoids that.

If you serve only `experiments/name-deck/` as the web root, the shared CSS links will 404 — use the repo-root flow above.

Toasts use the same classes as production (`ui-toast`, `ui-toast__msg`, host `typeaheadToastHost` + `ui-toast-host`) and the default **dark** `--toast-bg` from `styles.css`. The **page** background is white via `--surface-bg`.

## Incognito

Private windows typically discard `localStorage` when the session ends, so you get a fresh deck after closing all incognito windows.
