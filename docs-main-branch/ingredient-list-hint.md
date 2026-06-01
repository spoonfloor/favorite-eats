Feature: Contextual Hint Behavior in Recipe Editor

Entities:

- The editor contains a list of entities:
  - Ingredient
  - Section subheading

Global Rules:

- Only one hint may be visible at any time.
- Hints are rendered directly below the relevant element.
- Hint visibility is controlled by hover and edit (focus) state.

Empty State:

- If the entity list is empty:
  - Show a persistent hint below the main section title ("INGREDIENTS").

Non-Empty State:

Hover Behavior:

- Hovering any entity shows a hint below that entity.
- Hint disappears on hover end, unless overridden by edit mode.
- If (and only if) empty state is false, the "INGREDIENTS" title behaves like an entity:
  - Hovering it shows a hint below it.
  - It can override ("steal") the hint from any other element, including one in edit mode.

Edit Mode Behavior:

- Clicking an entity:
  - Enters edit mode (focus).
  - Shows a hint below that entity.
- While in edit mode:
  - The hint persists regardless of hover state.
  - The hint disappears only on blur (exit edit mode).

Hover vs Edit Mode Interaction:

- If an entity is in edit mode and another element is hovered:
  - The hovered element takes precedence:
    - Show hint below hovered element.
    - Hide hint for the entity in edit mode.
- When hover ends:
  - If an entity is still in edit mode, restore its hint.

Blur Behavior:

- Clicking outside (blur):
  - Exit edit mode.
  - Remove all hints.

Example Flow:
Given entities:

- apple
- banana
- cream puff

1. Click "banana":
   - banana enters edit mode
   - show hint below banana

2. Move cursor away (no hover):
   - hint remains below banana

3. Hover "apple":
   - show hint below apple
   - hide hint below banana

4. Move hover down list:
   - hint follows hovered entity (apple → banana → cream puff)

5. Click outside:
   - exit edit mode
   - remove all hints

Priority Rules:

1. Hover > Edit Mode
2. Edit Mode > Default (no hover)
3. Empty State applies only when list is empty

Add an ingredient, title, or paste content.
