GOAL (ULTRA TERSE)
Create a bottom-only, solid-purple navigation bar containing a centered group of equal-width pill tabs. Pills express top-level page navigation (not filters), use variable-driven sizing, visually match existing UI elements (active = search bar style; inactive = disabled Cancel/Save style), and shrink/truncate responsibly to always fit without scrolling.

CHECKLIST
[ ] Bar is full-width, touches bottom edge, solid purple
[ ] Pill cluster is horizontally centered as a unified group
[ ] Pills share identical width, based on longest label
[ ] Width respects --pill-min-width and --pill-padding-horizontal
[ ] If layout is tight: pills shrink down to --pill-min-width, then truncate with “...”
[ ] Pills never wrap, never scroll, cluster remains centered
[ ] Pill height + type size exactly match the Add button
[ ] Inactive pills visually match disabled Cancel/Save buttons
[ ] Inactive hover: minimal tint only (no animation, no shift toward active state)
[ ] Active pill visually matches search-bar styling exactly
[ ] Visual states use theme variables (color, opacity, etc.)
[ ] Nav actions trigger immediate mode switch (no animation)
[ ] Navigation reads clearly as global, page-level mode switching
