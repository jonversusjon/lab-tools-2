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

### Phase B — Codemod for predictable replacements
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

### Phase C+ — Manual cleanup by domain
Anything the codemod missed: custom inline hex, unusual class combos,
specialized components (spillover heatmap, chart annotations, etc.).
Likely 2–3 phases split by directory:
- C: layout + shared components
- D: domain components (antibodies / fluorophores / panels / IF panels /
  experiments / plate-maps)
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
