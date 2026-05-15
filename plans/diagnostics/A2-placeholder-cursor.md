# Diagnostic — Tiptap placeholder + cursor

**Date:** 2026-05-14
**Status:** hypothesis-only

## Problem statement

> Tiptap blocks with placeholder text don't lose placeholder text (optional)
> nor show active cursor (required)

## Investigation

Read `blocks-tiptap/extensions.ts` (Placeholder config),
`@tiptap/extensions/dist/placeholder/index.js` (the actual extension —
`@tiptap/extension-placeholder` v3 just re-exports from `@tiptap/extensions`),
`src/index.css` (placeholder + caret + data-frame rules), and
`blocks-tiptap/nodes/blockFramesExtension.ts`.

Ran a Playwright inspection harness against a live backend that focuses an
empty paragraph and an empty heading and reads computed styles + geometry,
plus screenshots.

### Findings

1. **Placeholder mechanism.** The extension applies a ProseMirror node
   `Decoration` adding class `is-empty` and a `data-placeholder` attribute.
   The visible text is drawn entirely by project CSS (`index.css:101-113`):
   ```css
   .ProseMirror p.is-empty::before, h1/h2/h3/li.is-empty::before {
     content: attr(data-placeholder);
     float: left;
     color: var(--foreground-subtle);
     pointer-events: none;
     height: 0;
   }
   ```

2. **Caret color is NOT the problem.** On a focused empty paragraph,
   computed `caret-color` is `rgb(31, 27, 22)` (a visible near-black) and
   `color` matches. The element has normal height (`offsetHeight` 26px for
   paragraph, 38px for heading).

3. **The existing caret fix is a no-op.** `index.css:91-99` sets
   `caret-color: currentColor` on `.ProseMirror h1..h6` "to ensure cursor is
   visible in heading blocks." But `currentColor` is already the *default*
   value of `caret-color` — this rule changes nothing and did not address
   the real mechanism. It is evidence the bug was noticed before and the
   prior fix missed.

4. **`float: left` on the `::before` is the prime suspect.** With
   `float: left; height: 0`, the placeholder text is laid out starting at
   x=0 of the block's first line. The empty textblock's caret is also at
   x=0. The native caret is a ~1px vertical line painted at the same x as
   the first placeholder glyph ("T" of "Type / for commands..."), so it is
   visually obscured / indistinguishable. This is a long-standing
   Tiptap/Chrome interaction with the float-based placeholder recipe.

5. **Screenshots inconclusive on caret blink.** float-mode and a patched
   `position: absolute` mode rendered identically in still screenshots —
   expected, since a still frame cannot reliably capture the blinking
   caret. `getSelection().getRangeAt(0).getBoundingClientRect()` returns an
   all-zero rect for a collapsed selection in an empty block (a known Chrome
   quirk), so geometry probing was not conclusive either.

6. **"Placeholder doesn't disappear" — partly by design.** For headings the
   placeholder callback (`extensions.ts:37-39`) *always* returns text
   regardless of `hasAnchor`, with `showOnlyCurrent: false` — intentional
   ("lay out structure first, fill in later"). The decoration is still
   removed once the heading is non-empty, so it disappears when you *type*,
   just not on mere focus. For paragraphs/listItems the placeholder only
   shows when `hasAnchor`. This half of the report is the "(optional)" one
   and largely reflects intended behavior.

## Root cause / hypothesis

The caret is rendered but visually obscured because the placeholder
`::before` uses `float: left`, painting the placeholder text starting at the
exact x-position of the caret in an empty block. Needs visual confirmation
in a real browser (a still screenshot cannot prove caret blink state).

## Reproduction

Not definitively reproduced (caret blink not capturable in screenshots).
The setup: open any experiment, click into the empty trailing paragraph —
the placeholder shows; the caret is hard/impossible to see.

## Proposed fix

Draft prompt for the morning (requires the user to eyeball the result in a
browser, since automated caret-visibility checks are unreliable):

> In `frontend/src/index.css`, the Tiptap placeholder `::before` rule
> (~lines 101-113) uses `float: left` which obscures the text caret in empty
> blocks. Replace the `float: left; height: 0` approach with an
> absolutely-positioned placeholder so the caret renders unobscured:
> - add `position: relative` to the `.is-empty` block selectors
> - change the `::before` to `position: absolute; left: 0; top: 0;`
>   (drop `float` and `height: 0`), keep `pointer-events: none`
> Then manually verify in a browser that (a) the blinking caret is clearly
> visible at the start of a focused empty paragraph/heading/list item, and
> (b) the placeholder text still renders in the right place and does not
> shift the block. Also delete the now-confirmed no-op `caret-color:
> currentColor` rule at index.css:91-99 (or replace it with whatever the
> real fix turns out to need).
> The "placeholder stays on headings" behavior is intentional (see
> extensions.ts:37-39) — leave it unless the user wants headings to behave
> like paragraphs (only show placeholder when focused).

## Priority

**Medium** — caret invisibility hurts editing UX (users can't tell where
they are), but the editor is still functional (typing works, confirmed in
the A1c harness). Not data-affecting. The fix is small but needs a human to
visually confirm.

## Resolution

**Fixed in commit `<pending>` (Fast-Wins #5).**

`frontend/src/index.css` now positions the placeholder `::before` with
`position: absolute; left: 0; top: 0` instead of `float: left; height: 0`.
The parent `.is-empty` selectors gained `position: relative` so the
absolute placeholder anchors to the block. The placeholder no longer
shares horizontal flow with the native text caret, so the caret renders
unobscured at the start of empty paragraphs, headings, and list items.

The no-op `caret-color: currentColor` rule on `.ProseMirror h1..h6` was
deleted in the same commit — `currentColor` was already the default value
of `caret-color`, so the rule was misleading future readers without doing
anything.

Manual browser verification required (caret blink cannot be reliably
captured by automated tools).
