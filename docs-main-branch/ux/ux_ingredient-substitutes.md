OR-Substitute System — UX + Implementation Checklist

GOAL
Allow each ingredient line to have zero or more OR-subs, each fully editable, visually stacked with an OR pill, and persisted as child rows in the unified recipe_ingredient_line model.

CREATE / EDIT
[ ] 1/ Parent row shows “Add sub” button in edit mode
[ ] 2/ Clicking Add sub → append blank sub row (OR pill, full fields)
[ ] 3/ Sub row becomes real when name non-empty on blur
[ ] 4/ Empty subs on blur → auto-remove
[ ] 5/ Editing parent enters edit mode for all subs simultaneously
[ ] 6/ Click-out commits parent + all subs

TYPEAHEAD + FUZZY MATCH
[ ] 7/ Sub name supports typeahead (ingredients + recipes)
[ ] 8/ Picking a recipe sets links_recipe_id; picking ingredient sets ingredient fields
[ ] 9/ Blur fuzzy-match:
— strong match → reuse existing
— no/ambiguous match → create new ingredient

DELETION / DEDUPE
[ ] 10/ Clearing parent → delete parent and all subs
[ ] 11/ Clearing sub name → delete that sub
[ ] 12/ On blur, if sub A == sub B → silent dedupe

READ MODE
[ ] 13/ Parent renders normally
[ ] 14/ Subs render beneath with OR pill (non-interactive)
[ ] 15/ Recipe-linked subs show link styling
[ ] 16/ Limbo ingredients use standard red/problem styling

YWN / SHOPPING LIST
[ ] 17/ Subs included like normal ingredients, sorted by location, badged “(sub)”
[ ] 18/ Subs shown only if parent is shown

DATA MODEL
[ ] 19/ Unified recipe_ingredient_line:
is_substitute, parent_line_id, links_recipe_id
[ ] 20/ Sort order per line; subs always follow parent in memory

EXPORT / PRINT
[ ] 21/ Render as:
qty unit name
OR qty unit name
OR qty unit name
