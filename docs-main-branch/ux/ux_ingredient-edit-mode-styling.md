# Ingredient Field Elastic Width System — Goal + Checklist

## Goal

Provide a clean, predictable edit-mode layout where **pills (labels) are rigid** and **fields (inputs) are elastic** with per-column min/max widths. Fields grow/shrink live with typing, scroll horizontally past max, never wrap, never change row height, and behave like words in a single-line text editor. Read-mode formatting remains unchanged.

## Checklist

- [ ] Pills remain rigid; width = intrinsic label text + padding only
- [ ] Fields use per-column min/max width vars (debug: 120px / 360px)
- [ ] Fields grow/shrink live with typing (content-driven)
- [ ] Fields scroll horizontally silently past max-width
- [ ] Fields never shrink below min-width
- [ ] Row never wraps or grows vertically
- [ ] Row may overflow horizontally (text-editor model)
- [ ] All fields align text left
- [ ] Field padding fixed via a CSS var
- [ ] Fields resize independently (no coordination)
- [ ] Cursor always visible via auto-scroll
- [ ] Pills unaffected by field resizing
- [ ] Edit-mode visuals (color, caret) remain unchanged
- [ ] Read-mode formatting untouched; relies on existing app logic
