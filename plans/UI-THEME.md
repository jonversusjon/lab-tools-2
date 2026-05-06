# UI Theme Migration Plan

## Goal

Replace raw Tailwind `gray-*` and hard-coded `bg-white`/`bg-gray-900`
pairs with a CSS-variable-based design token system. Light mode adopts
warm cream tones (Claude.ai-inspired). Dark mode adopts Linear-style
slightly blue-tinted near-blacks. Petrol (`#0F766E` / `#5EEAD4`) is
the accent.

## Phases

### Phase A — Foundation (this phase)
- Define CSS variables in `:root` and `.dark` (`frontend/src/index.css`)
- Expose tokens via `frontend/tailwind.config.js` `extend.colors`
- Update `body` to use `bg-background text-foreground`
- Convert Tiptap-specific hardcoded `rgb()` values to CSS vars
- No `.tsx` files modified

### Phase B — Codemod for predictable replacements ✅ complete (commit ae56900)
A scripted find-and-replace handles the regular patterns across all
`.tsx` files. Mapping table:

| Old | New |
|---|---|
| `bg-white dark:bg-gray-900` | `bg-background` |
| `bg-gray-50 dark:bg-gray-800` | `bg-surface` |
| `bg-white dark:bg-gray-800` | `bg-elevated` |
| `text-gray-900 dark:text-gray-100` | `text-foreground` |
| `text-gray-500 dark:text-gray-400` | `text-foreground-muted` |
| `text-gray-400 dark:text-gray-500` | `text-foreground-subtle` |
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `border-gray-300 dark:border-gray-600` | `border-border-strong` |
| `bg-blue-600 hover:bg-blue-700 text-white` | `bg-accent hover:bg-accent-hover text-accent-foreground` |

Agent runs codemod, builds, screenshots key pages, reports diffs and
any non-matching gray-* leftovers per directory.

Lessons learned (Phase B):
- Codemod scanned 107 .tsx files, modified 62 (609 individual replacements across 9 patterns).
- `bg-accent` reordering (inserting at position of first matched class) produces slightly
  different class-string order than the original but is functionally identical — expected.
- Template-literal classNames (`className={\`...\`}`) and `cn()`/`clsx()` calls were
  deliberately skipped; 61 files still have raw grays (see Phase C+ scope below).
- `bg-white dark:bg-gray-800` → `bg-elevated` had 38 hits — the largest 2-class pattern.
- `border-border-strong` and `border-border` together had 222 hits — bulk of the work.
- Intermediate grays not in migration table (`text-gray-600`, `bg-gray-100`, etc.) are
  the dominant leftover; these are Phase C+ hand-work.
- Idempotency verified: second codemod run modified 0 files.

### Phase C — Top-3 heaviest leftover files ✅ complete (commits 976dc95, 2db9ca7, f7f2760)
Manual migration of the three files with the most remaining raw-gray substrings.

Files migrated and final substrate counts (before → after):
- `SecondaryList.tsx`: 37 → 0
- `IFPanelDesignerView.tsx`: 31 → 3 (justified holdouts)
- `FluorophoreBrowser.tsx`: 47 → 0

Lessons learned (Phase C):
- `cn()`/`clsx()` calls: each conditional branch processed independently; no structural changes needed.
- Intermediate grays (`text-gray-600`, `text-gray-700`, etc.) all mapped cleanly via heuristic table.
- The view mode toggle in IFPanelDesignerView uses an intentionally inverted palette (`bg-gray-800 dark:bg-gray-200`) — no token covers this; kept with `// theme-exempt` comment.
- `bg-red-600 text-white` on the danger Delete button is a justified holdout — `text-white` on colored danger bg has no token equivalent.
- `bg-gray-50 dark:bg-gray-808/50` and `bg-gray-50 dark:bg-gray-800/60` alpha variants mapped to `bg-surface` (alpha lost, semantic intent preserved).
- `file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-400` → `file:bg-accent-soft file:text-accent-soft-foreground` — CSS file-selector-button pseudo-variant works with semantic tokens.
- `placeholder-gray-300 dark:placeholder-gray-600` → `placeholder-foreground-subtle` — placeholder Tailwind utilities work with hyphenated token names.
- `focus:bg-white dark:focus:bg-gray-700` → `focus:bg-elevated` — focus-state bg maps cleanly.

### Phase D — Manual cleanup by domain ✅ complete (commits ce75bf0, 481436a, d295962)

Migrated `PanelDesignerView.tsx`, `AntibodyTable.tsx`, and `GenericImportDiffModal.tsx`.

**Lessons learned:**
- **Table migration pattern** (AntibodyTable): `text-gray-600 dark:text-gray-400` → `text-foreground-muted` (canonical for secondary cell text); `border-gray-100 dark:border-gray-700` → `border-border`; `hover:bg-gray-50 dark:hover:bg-gray-800` → `hover:bg-hover`. This template applies to all future `*List.tsx` / `*Table.tsx` migrations.
- **Diff-modal migration pattern** (GenericImportDiffModal): Resolution-button active state `bg-blue-600 text-white` → `bg-accent text-accent-foreground`; inactive state `border-gray-300 ... hover:bg-gray-100 dark:hover:bg-gray-700` → `border-border-strong ... hover:bg-hover`. Apply button (`bg-green-600 text-white`) kept raw — semantic success action with no `success-foreground` token.
- **Token gap surfaced**: `success-soft`, `danger-soft`, `warning-soft` tokens would eliminate holdouts in diff modals and other semantic-color areas (informs Phase E).
- **Toggle inactive track** (`bg-gray-300 dark:bg-gray-600`) has no token between `surface` and `border-strong`; kept raw in two places.
- **Ring-offset colors** (`dark:ring-offset-gray-800/900`) have no token; kept raw in tag-filter and highlight-ring patterns.

Anything the codemod missed: custom inline hex, unusual class combos,
specialized components (spillover heatmap, chart annotations, etc.).
- D: remaining domain components (antibodies / panels / experiments /
  plate-maps / other shared components)
- E: convention enforcement + CONVENTIONS.md / FRONTEND-CONVENTIONS.md
  patches forbidding raw gray-* in new code

## Token reference

See `frontend/src/index.css` for the canonical values. Token names
(usage):

- `background` — page bg
- `surface` — sidebar, subtle surfaces
- `elevated` — cards, modals, popovers
- `hover` — hover state on `surface`
- `border`, `border-strong` — lines, dividers
- `foreground`, `foreground-muted`, `foreground-subtle` — text tiers
- `accent`, `accent-foreground`, `accent-hover`, `accent-soft`,
  `accent-soft-foreground` — primary action color (petrol)
- `success`, `warning`, `danger`, `info` — semantic colors
