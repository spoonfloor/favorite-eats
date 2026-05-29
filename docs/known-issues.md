# Supabase Architecture

- Scrolling sucks on mobile
- Remove item must not change scroll position
- We should build a universal text prettifier
- We should have shared infrastructure for redrawing pages when relevant data changes (aka Document Sessions)
  - Use it to fix this: Variant deletion does not trigger refresh of recipe and store pages, allowing stale data to persist until hard refresh
