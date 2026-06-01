TL;DR
❌ Don’t insert spacer divs
✅ Use a spacing scale (--space-\*)
✅ Use margin-bottom for text flow
✅ Use gap for layout containers
✅ Add small utility classes for flexibility

:root {
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
}

.mb-1 { margin-bottom: var(--space-1); }
.mb-2 { margin-bottom: var(--space-2); }
.mb-3 { margin-bottom: var(--space-3); }

<p class="mb-3">Paragraph 1</p>
<p>Paragraph 2</p>

.stack {
display: flex;
flex-direction: column;
gap: var(--space-4);
}

<div class="stack">
  <p>Text</p>
  <p>More text</p>
</div>
