MAGIC PASTE — UX SPEC

TRIGGER

- User CTRL-clicks an ingredient row OR instruction step.
- Opens “Magic Paste” modal.

MODAL

- Multiline textarea (blank or prefilled with clipboard if desired).
- Two buttons: Cancel / Insert.
- Toggle: Insert ABOVE / BELOW target row.
- Default: ABOVE if click near row start; BELOW otherwise.
- EXCEPTION: If target row is a placeholder → force BELOW only.

INGREDIENTS BEHAVIOR

- Paste box text split on hard line breaks.
- Empty lines ignored.
- Each line parsed into {qty, unit, name, notes} with best-guess rules.
- Failure → treat entire line as name.
- Inserted rows appear as committed (no edit mode).
- No auto-merge with clicked row; pure insertion.

INSTRUCTIONS BEHAVIOR

- Same trigger + modal.
- Each nonblank line becomes its own step.
- Steps inserted above/below relative to clicked step.
- Inserted steps become normal committed steps.

MULTILINE PASTE INTERCEPT (INSTRUCTIONS ONLY)

- If user pastes multiline text directly into a step:
  - Prevent default.
  - Open Magic Paste modal prefilled with clipboard.
  - Default target = BELOW the active step.

RESTRICTIONS

- Magic paste NEVER fires on normal paste except multiline-instructions case.
- Plain paste in any non-placeholder field behaves normally.

PLACEHOLDER LOGIC

- Placeholder rows/steps serve as “empty state”.
- Magic paste into placeholder = replacement → forced BELOW insertion.

RESULT

- Controlled, explicit bulk-paste workflow.
- Zero accidental transformations.

---

DEV CHECKLIST

1. DETECTION & WIRES
   [ ] Add global CTRL-click listener on ingredient rows + step rows.
   [ ] Identify target row/step + whether it's a placeholder.
   [ ] Compute default insert position (above/below); override to BELOW if placeholder.

2. MODAL
   [ ] Implement lightweight modal (textarea, Above/Below toggle, Cancel, Insert).
   [ ] Expose openModal(targetRow, mode, prefillText?).
   [ ] Ensure modal traps focus + ESC closes it.
   [ ] Return structured result: {lines[], position: 'above'|'below'}.

3. INGREDIENT PASTE PIPELINE
   [ ] Build line splitter (trim, skip empty, preserve order).
   [ ] Build ingredient line parser (qty/unit/name/notes) with fallback.
   [ ] Build insertIngredientsAt(row, lines[], pos).
   [ ] Ensure commit to model + DOM rebuild.
   [ ] Ensure placeholder row is removed/replaced correctly.

4. INSTRUCTION PASTE PIPELINE
   [ ] Build line splitter (simple newline split, normalize whitespace).
   [ ] Build insertStepsAt(stepNode, lines[], pos).
   [ ] Wire into StepNode model + DOM creation.
   [ ] Ensure renumbering + dirty-state updates.

5. MULTILINE CLIPBOARD INTERCEPT (INSTRUCTIONS)
   [ ] On paste into inline step editor: detect `\n`.
   [ ] preventDefault + open modal prefilled.
   [ ] Insert BELOW active step (default), but allow toggle.

6. DOM + MODEL INTEGRATION
   [ ] Ensure added items are written to both:
   — recipeData.sections[*].ingredients
   — recipeData.sections[*].steps OR stepNodes
   [ ] Ensure new rows/steps get temp IDs.
   [ ] Ensure Save writes new rows to DB (bridge flow unchanged).

7. PLACEHOLDER LOGIC
   [ ] Placeholder ingredient row: force BELOW insertion.
   [ ] Placeholder step: same rule.
   [ ] After paste, placeholders replaced/removed as needed.

8. EDIT-MODE SAFETY
   [ ] Abort active inline editors before paste operations.
   [ ] Prevent blur commits from running during modal open/close.
   [ ] Restore caret safely after any non-destructive operation.

9. UI POLISH
   [ ] Optional: prefill textarea with clipboard if available.
   [ ] Optional: toast “Imported N items”.

10. TEST CASES
    [ ] Ingredient placeholder → CTRL-click → paste 1 line.
    [ ] Ingredient placeholder → paste 10 lines → correct parsing.
    [ ] Real ingredient row → paste above/below.
    [ ] Instruction placeholder → paste.
    [ ] Normal paste (no CTRL) behaves unchanged.
    [ ] Multiline paste into step → modal intercept.
    [ ] Undo/Cancel in modal restores no changes.
