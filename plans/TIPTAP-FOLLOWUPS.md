# Migration: Deferred Work

This file tracks work paused mid-migration due to external blockers
(upstream package issues, etc.) that are expected to resolve on their
own. Future agents and developers should read this before starting
new migration phases.

## Drag handle and block context menu (Phase 9b)

**Status:** DEFERRED — waiting on Tiptap upstream package coherence

**Original plan:** Phase 9b was to build a left-margin drag handle
that doubles as the entry point to a per-block context menu (Duplicate,
Delete, Convert-to, plus per-block-type items: Clear/Insert-left/
Insert-right for columns, etc.). Implementation planned via
`@tiptap/extension-drag-handle-react`.

### Why this is paused

`@tiptap/extension-drag-handle-react@3.22.5` (latest as of late
April 2026) declares a strict peer requirement on
`@tiptap/pm@3.22.5`. The rest of the Tiptap suite in this project
(and in `@tiptap/extension-drag-handle-react@3.22.5`'s peer
dependencies-of-dependencies) is pinned at `^3.22.4`. The Tiptap
suite's other extensions are not yet published at 3.22.5. The
package literally requires a peer version that hasn't been published
across the rest of the suite — `npm install` fails with `ERESOLVE`,
and `--legacy-peer-deps` would ship a tree with a missing peer that
might surface as runtime import errors.

This appears to be a recurring issue with Tiptap's monorepo release
process. Their own v3.22.4 release notes include:
> "Fix dependencies installation after packages updates producing
> peer dependency resolution conflicts"

### How to detect it's been fixed (auto-discovery for future agents)

Run this from `frontend/`:

```bash
npm install --save @tiptap/extension-drag-handle-react --dry-run 2>&1 | tail -20
```

If the output shows a clean install plan with no `ERESOLVE` errors,
the upstream issue is resolved and Phase 9b can proceed. If it still
shows `ERESOLVE` mentioning peer dependency conflicts on `@tiptap/pm`,
remain paused.

A more thorough check that confirms the entire Tiptap suite is coherent:

```bash
npm install --save \
  @tiptap/core@latest \
  @tiptap/pm@latest \
  @tiptap/react@latest \
  @tiptap/starter-kit@latest \
  @tiptap/extension-placeholder@latest \
  @tiptap/suggestion@latest \
  @tiptap/extension-table@latest \
  @tiptap/extension-drag-handle-react@latest \
  --dry-run 2>&1 | tail -20
```

If the dry-run succeeds, the entire suite can be coherently updated
and Phase 9b can proceed.

### What to do when ready to proceed with Phase 9b

1. Run the actual install (drop `--dry-run`).
2. Verify versions in `package.json` are coherent:
   ```bash
   grep -E '"@tiptap/' frontend/package.json | sort
   ```
   All Tiptap packages should be at the same patch version
   (e.g., all at `^3.22.5` or higher).
3. Run the full test suite — should still pass at 477+ tests.
4. Resume Phase 9b: build a `<DragHandle>` component using the
   package's `<DragHandle>` React component, with a hover-revealed
   menu. Per-block-type menu items defined in a registry
   (block_type → array of menu items).

### What lives in Phase 9c after 9b

Phase 9c is column drag-resize. It depends on Phase 9b's
infrastructure (drag handles between columns reuse the same
positioning library — `floating-ui/dom` per `@tiptap/extension-drag-handle-react`'s
docs). Phase 9c also depends on `frontend/src/blocks-tiptap/views/columnCommands.ts`'s
exported `COLUMN_MIN_WIDTH_PCT = 10` constant for clamping during drag.

### Alternative path if upstream stays broken

If `@tiptap/extension-drag-handle-react`'s peer-dep issue persists
for more than a few weeks, consider building a DIY drag handle as a
ProseMirror plugin. Tiptap's official examples include a worked DIY
drag-handle implementation. Cost: roughly +1 day of work compared to
the package-based approach. The work is well-trodden but adds code
volume.

The DIY approach was discussed but deferred to upstream resolution.
The trade-off is:
- DIY: more code now, no future dep risk
- Wait for upstream: less code now, accepts ongoing dep churn

Default is to wait. Switch to DIY only if:
- `npm install --save @tiptap/extension-drag-handle-react@latest`
  has been failing for >4 weeks past 2026-04-29
- A new migration milestone explicitly needs the drag handle to
  unblock something else

### What's still possible without 9b

Phase 9a (slash menu) is fully independent of the drag handle. It
uses `@tiptap/suggestion` (already installed in Phase 1) and proceeds
on schedule.

Phase 10 (backend persistence), Phase 11 (cut/paste), and Phase 12
(cleanup) are all independent of Phase 9b. They proceed without it.

The only user-facing capability missing if 9b stays deferred forever:
- No drag handle on blocks (so no drag-to-reorder via mouse — though
  the dnd-kit-based reorder inside panel target tables still works)
- No generic block context menu
- No column drag-resize

Each of these is a UX feature, not a correctness blocker. The migration
can complete (Phase 12 cleanup landing on `main`) without Phase 9b/c.
The deferred features ship as a follow-up release when upstream
stabilizes.

---

## Phase 13 — Configurable block frames feature

### 1. Status and prerequisites

**Status:** DEFERRED — planned for after Phase 12 cleanup lands on `main`.

Phase 13 must not start until both of the following are in place:

- **Phase 12 cleanup complete** — the hand-rolled engine (`BlockRenderer.tsx`,
  `TextBlockEditor.tsx`, inline `fetch()` calls in panel blocks) is deleted and
  the Tiptap-native editor is the only code path. Phase 12 is the migration
  endpoint; Phase 13 is an additive feature on top of the stable result.
- **Phase 10b save coordinator operational** — Phase 13's rendering logic
  consumes the same TanStack Query preference hook that Phase 10b establishes.
  Until the save coordinator is live, preferences have no reliable write path
  from within the editor lifecycle.

Phase 13 does NOT require Phase 9b (drag handle) or Phase 9c (column
drag-resize). Those remain independently deferred. Phase 13 can ship without
them.

### 2. User-facing description

Researchers who use the experiment page system often want to sketch the
structure of an experiment before any data exists — reserve a column for
replicate 1, another for replicate 2, drop in a divider before the methods
section, mark a heading for a figure that will arrive from the microscope
tomorrow. Today, the editor gives no visual affordance for that layout
skeleton: empty blocks are invisible. A user who drags in a two-column layout
and leaves one column empty has no way to see the boundary of the empty space.
This makes layout-first authoring feel broken rather than intentional.

Block frames solve this by rendering a subtle hairline border around editor
blocks, on a per-block-type basis. Each block type has its own frame
visibility setting. The four states are:

- **`always`** — the frame is always visible, whether or not the block has
  content. Useful for structural blocks (dividers, column layouts) that the
  user wants to see explicitly even in print-preview mode, or for users who
  prefer a structured, grid-like editing surface at all times.
- **`empty`** — the frame is visible when the block has no content and
  invisible once content lands. This is the default for v0. It matches the
  most common expectation: "show me the empty spaces, but get out of the way
  once I've typed." A blank paragraph shows a border; the same paragraph with
  text does not.
- **`never`** — no frame ever. Suitable for block types the user wants to
  treat as invisible infrastructure (e.g., `listItem` nodes, `tableRow` nodes,
  or any block type where a frame adds visual noise without benefit).
- **`clean`** — (greyed out in v0, available in a future version) frame
  visible only on blocks that were created but never edited; disappears the
  moment the user adds any content. Semantically stricter than `empty`: a
  paragraph that was typed, then cleared, is no longer "clean." This state
  requires per-block "touched" tracking that the current schema does not have.
  See Section 8 for the technical obstacle.

The difference between `empty` and `clean` matters in practice: `empty` shows
a frame whenever the block happens to be empty at render time (including after
a user clears content), while `clean` specifically means "this block has never
been touched." The `clean` state enables a UX pattern where the researcher
can see their created-but-untouched placeholders distinctly from
cleared-and-waiting blocks.

### 3. Settings UI

The Settings page (`frontend/src/components/settings/Settings.tsx`) currently
has two sections: spectral compatibility thresholds and conjugate chemistry
management. Phase 13 adds a third section titled **"Editor block frames"**.

The section contains one row per supported block type. Each row has:

- A label column showing the block type name in human-readable form
  (e.g., "Heading", "Paragraph", "Bulleted list").
- A 4-button toggle group: **Always | Empty | Clean | Never**.
  - The active option is highlighted (e.g., blue background).
  - The **Clean** button is visually disabled: greyed out, `cursor: not-allowed`,
    with a tooltip reading "Available in a future version." It is never
    selectable, regardless of the current setting.
- Changes are saved immediately on toggle (no explicit "Save" button for this
  section, to match the live-update UX pattern used by the existing spectral
  thresholds). If a save fails, a transient error message appears in the row.

The default value for every block type on first load (before any preference is
set) is **`empty`**. If the `editor.block_frames` preference key does not
exist in the database, the frontend behaves as though every block type is set
to `empty`.

The block types surfaced in the Settings UI (one row each):

| Label in UI | Internal key |
|---|---|
| Heading | `heading` |
| Paragraph | `paragraph` |
| Bulleted list | `bulletList` |
| Numbered list | `orderedList` |
| List item | `listItem` |
| Divider | `horizontalRule` |
| Callout | `callout` |
| Column layout | `column_list` |
| Column | `column` |
| Flow panel | `flow_panel` |
| IF panel | `if_panel` |
| Table | `table` |
| Table row | `tableRow` |

Open question for the implementer: `listItem` and `tableRow` are structural
children that users rarely think about directly. Consider hiding them from
the Settings UI and hardcoding their frame state to `never`, reducing visual
complexity. The project manager should decide before Phase 13b begins.

### 4. Storage architecture

Settings are persisted via the existing `UserPreference` infrastructure. The
model (`backend/models.py`, line 306) is a simple key-value store:

```python
class UserPreference(Base):
    __tablename__ = "user_preferences"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
```

The router (`backend/routers/preferences.py`) exposes:
- `GET /api/v1/preferences` → `dict[str, str]` of all preferences
- `PUT /api/v1/preferences/{key}` → upsert a single key

The schemas (`backend/schemas.py`, lines 278–289) use a plain `value: str`
field — the model makes no assumptions about value format.

**Recommended approach: single JSON-blob key.**

Use one preference key, `editor.block_frames`, whose value is a JSON string:

```json
{
  "heading": "empty",
  "paragraph": "empty",
  "bulletList": "empty",
  "orderedList": "empty",
  "listItem": "never",
  "horizontalRule": "always",
  "callout": "empty",
  "column_list": "never",
  "column": "empty",
  "flow_panel": "always",
  "if_panel": "always",
  "table": "never",
  "tableRow": "never"
}
```

Reasoning for the single-key approach over per-block-type keys:

1. **Atomic update.** A user clicking through several block types in the
   Settings UI triggers rapid sequential writes. A single key lets those
   writes batch into one `PUT` without partial-update ambiguity.
2. **Easier schema evolution.** Adding a new block type in a future phase
   means adding one entry to the JSON object; the storage layer requires no
   migration.
3. **Pattern match.** The `UserPreference.value` column is already a `Text`
   field that accepts arbitrary strings. The existing spectral thresholds
   (`min_excitation_pct`, `min_detection_pct`) use separate keys because they
   are scalar values with independent save UX. Block frames are a structured
   object that logically belong together.
4. **Frontend simplicity.** One `GET /api/v1/preferences` fetch on app mount
   (already happening in `Settings.tsx` lines 46–53), one `JSON.parse()` on
   the `editor.block_frames` key, and one context value — rather than 13
   separate key reads scattered across hook logic.

Frontend reads the preference once via the existing `getPreferences()` call in
`api/preferences.ts`. The parsed object is provided via a React context (or
optionally a TanStack Query entry) under a hook named `useBlockFramesConfig`.
The hook returns a typed object and a setter that calls `updatePreference()`
with the re-serialized JSON.

The frontend type:

```typescript
type FrameMode = 'always' | 'empty' | 'never' | 'clean'

interface BlockFramesConfig {
  heading: FrameMode
  paragraph: FrameMode
  bulletList: FrameMode
  orderedList: FrameMode
  listItem: FrameMode
  horizontalRule: FrameMode
  callout: FrameMode
  column_list: FrameMode
  column: FrameMode
  flow_panel: FrameMode
  if_panel: FrameMode
  table: FrameMode
  tableRow: FrameMode
}
```

Default value (returned when the preference key doesn't exist):

```typescript
const DEFAULT_BLOCK_FRAMES: BlockFramesConfig = {
  heading: 'empty',
  paragraph: 'empty',
  bulletList: 'empty',
  orderedList: 'empty',
  listItem: 'never',
  horizontalRule: 'always',
  callout: 'empty',
  column_list: 'never',
  column: 'empty',
  flow_panel: 'always',
  if_panel: 'always',
  table: 'never',
  tableRow: 'never',
}
```

The defaults for `flow_panel` and `if_panel` are `always` (not `empty`)
because those nodes are atomic — they can never be "empty" in the
`node.content.size === 0` sense. The `always` default ensures newly-inserted
panel blocks are immediately visible as discrete units. See Section 5 for the
atom/empty distinction.

### 5. Frontend rendering architecture

Two viable approaches:

**Approach A — CSS-driven, attribute-based.** Each rendered block node
receives a `data-frame` attribute set to one of `always`, `empty`, or `never`
(computed from the user's config and the block's atomic status). CSS rules
read that attribute plus, for the `empty` state, the node's emptiness (which
ProseMirror exposes via the `.is-empty` class that Tiptap already adds to
empty nodes via `Placeholder`). A second attribute, `data-block-empty`,
mirrors the same signal for CSS targeting outside of `.is-empty`.

Example CSS sketch:
```css
/* always */
[data-frame="always"] { border: 1px solid rgb(229 231 235); }

/* empty — frame only when block is empty */
[data-frame="empty"].is-empty { border: 1px solid rgb(229 231 235); }
[data-frame="empty"]:not(.is-empty) { border: 1px solid transparent; }

/* never */
[data-frame="never"] { border: none; }

/* dark mode */
.dark [data-frame="always"],
.dark [data-frame="empty"].is-empty { border-color: rgb(55 65 81); }

/* no frame in print */
@media print {
  [data-frame] { border: none !important; }
}
```

**Approach B — JavaScript-driven, ProseMirror plugin.** A plugin walks every
block node on each transaction, reads the user's config, computes emptiness
via `node.content.size === 0`, and applies ProseMirror decorations with
computed class names.

**Recommendation: Approach A.**

Reasoning:
- Approach A adds no per-transaction work. The `data-frame` attribute is set
  once on node render (or on user config change, which is rare). CSS handles
  the empty/non-empty state toggle reactively via the `.is-empty` class that
  Tiptap already manages.
- Approach B fires on every transaction — including every keystroke. With 50
  blocks on a page, that's 50 node walks per keystroke. At this scale it's
  probably unnoticeable, but it's unnecessary cost for a purely visual feature.
- Approach A is easier to test: frame state can be verified by asserting the
  attribute value on a DOM node in isolation.
- Approach A aligns with the global-attribute pattern from Phase 10a's
  `RowIdExtension` (`frontend/src/blocks-tiptap/nodes/rowIdExtension.ts`).
  Adding `data-frame` as a `rendered: true` global attribute (unlike `_rowId`
  which is `rendered: false`) follows the same extension pattern.

**Empty detection note:** ProseMirror's `node.content.size === 0` identifies
textual emptiness. Tiptap's `Placeholder` extension already adds `.is-empty`
to nodes it considers empty. However, `.is-empty` behavior in Tiptap is
not universal across all node types — verify against the installed version
before relying on it in the CSS rules.

**Atom node note:** Atom nodes (`callout`, `flow_panel`, `if_panel`) carry
their state in attrs, not in content. `node.content.size` is always 0 for
atoms even when they have meaningful data. For these types, the `empty` mode
behaves identically to `always` — the frame is always shown. The `data-frame`
attribute for atomic nodes should be set to `always` regardless of the
user's `empty`/`always` setting, so the CSS logic stays simple.

### 6. Per-block-type configuration

The following table covers all 13 block types currently registered in the
`RowIdExtension` (`frontend/src/blocks-tiptap/nodes/rowIdExtension.ts`,
lines 13–29), which is the authoritative list of block types in the Tiptap
schema. `tableHeader` and `tableCell` are omitted from the frame feature
because they are sub-cell structural types, not blocks — framing them would
create double-border artifacts with table's own cell borders.

| Block type | Tiptap `name` | Atomic? | Default frame | Notes |
|---|---|---|---|---|
| Heading | `heading` | no | `empty` | Levels h1–h4 share one node type. Frame applies to the heading's outer container. |
| Paragraph | `paragraph` | no | `empty` | The most common block. Default `empty` keeps reading mode clean. |
| Bulleted list | `bulletList` | no | `empty` | The list container, not individual items. |
| Ordered list | `orderedList` | no | `empty` | Same as bulletList. |
| List item | `listItem` | no | `never` | Framing list items inside an already-framed list adds visual noise with no benefit. Hardcoding `never` is worth considering; see open questions. |
| Divider | `horizontalRule` | yes | `always` | A divider is inherently structural; the frame IS the visual. Making it `empty` or `never` would hide it. `always` is the only sensible default. |
| Callout | `callout` | yes | `empty` | Atom node — `empty` behaves as `always` (see Section 5). Callouts already have their own background color; the frame is additive. |
| Column layout | `column_list` | no | `never` | Container node. Framing the outer flex wrapper adds a box around the entire multi-column section, which is visually heavy. Default `never`; user can enable if desired. |
| Column | `column` | no | `empty` | This is the primary beneficiary of the feature. Empty columns are invisible without a frame; `empty` makes the placeholder visible. The gap between columns already provides visual separation in most themes. |
| Flow panel | `flow_panel` | yes | `always` | Atom node — `empty` behaves as `always`. Panel blocks are discrete, card-like units; always framing them reinforces their structure. |
| IF panel | `if_panel` | yes | `always` | Same reasoning as `flow_panel`. |
| Table | `table` | no | `never` | Tables have their own cell borders; a frame around the outer table container creates a double-border. Default `never`. |
| Table row | `tableRow` | no | `never` | Same as table — visual noise inside an already-bordered structure. Default `never`. |

### 7. Frame styling

**Border style (light mode):**
- Width: 1px
- Style: solid
- Color: `rgb(229 231 235)` (Tailwind `gray-200`)
- Border-radius: 4px by default. For nodes that already carry a border-radius
  (e.g., callout's `rounded` class), the frame's radius should match the
  node's own rounding. This can be handled with `border-radius: inherit` on
  the frame rule if the node's container applies the radius.

**Border style (dark mode):**
- Color: `rgb(55 65 81)` (Tailwind `gray-700`)
- All other properties identical.

**Transitions:** Instantaneous (no CSS `transition` on `border-color` or
`border-width` in v0). A fade transition could be added later if user testing
shows it aids comprehension of the `empty`-to-filled transition, but it risks
making the editor feel sluggish at high block density.

**Print/export behavior:** Frames are suppressed in print output via a
`@media print` rule (`border: none !important` on `[data-frame]`). Exported
HTML (e.g., Notion export) should strip `data-frame` attributes entirely,
since Notion's block model doesn't have this concept.

**Interaction with existing block borders:** Some blocks already have visual
treatments (callout has a background color; table has cell dividers; panels
have a card shadow). The Phase 13 frame is additive — it sits outside the
block's own visual chrome. If this causes double-border issues for specific
block types, the simplest resolution is to hardcode those types to `never` or
to apply `box-shadow` instead of `border` for the frame (box-shadow doesn't
affect layout, which avoids reflow).

Open question for the implementer: for `column`, the 1px border may overlap
with the gap between columns. Test at the default `gap: 1rem` to confirm
columns don't appear to touch.

### 8. The "clean" state — why deferred

The "clean" state means a block was created but never edited — a true
placeholder as opposed to a cleared cell. This is semantically distinct from
`empty` and would enable a UX where the researcher's pristine scaffold looks
different from content that has been erased.

Implementing "clean" requires:

1. A new boolean attribute, `is_clean: boolean`, added to every block-level
   node type (default `true` on creation).
2. A ProseMirror plugin that watches for any user input within a block and
   dispatches a transaction setting `is_clean: false` for that node. Detecting
   "user input" reliably in ProseMirror requires distinguishing programmatic
   transactions from user-initiated ones — possible via the transaction's
   `getMeta()` for known mutation origins, but not trivial.
3. `is_clean` must round-trip through the adapter: stored in the database
   content JSON and rehydrated on load. If a block was pristine when the page
   was last saved, it should still appear pristine on reload.
4. The adapter changes touch the same layer as Phase 10a's `_rowId`
   infrastructure. Adding another universal attribute is straightforward
   mechanically but is a load-bearing schema change — every block in every
   existing experiment would acquire `is_clean: true` on their next save.

This is a focused, self-contained phase of work. It is not technically
difficult, but it must be its own phase (tentatively "Phase 13d") rather than
bundled with the visual frames feature (Phase 13a–c). Bundling risks blocking
the more immediately useful frame visibility changes on a schema change that
isn't yet designed in full.

In the Settings UI, the **Clean** button is rendered but disabled (greyed out,
`cursor: not-allowed`, tooltip: "Available in a future version"). This sets
user expectations correctly and avoids shipping a configuration option that
silently falls back to `empty` behavior.

### 9. Implementation phasing

Phase 13 breaks into four sub-phases. The first three are the v0 deliverable;
the fourth is future work.

**Phase 13a — Preference key and frontend reader**

Define the `editor.block_frames` preference key and its expected JSON shape
(Section 4). Implement `useBlockFramesConfig` hook:
- On mount, reads all preferences via `getPreferences()` (already called in
  `Settings.tsx`; Phase 13a can reuse the same fetch via TanStack Query).
- Parses the `editor.block_frames` value; falls back to `DEFAULT_BLOCK_FRAMES`
  if the key is absent or the JSON is malformed.
- Exposes a setter that serializes and writes via `updatePreference()`.

No UI changes in this sub-phase. Verification: the hook returns the default
config when no preference is set; returns the stored config after a manual
`PUT /api/v1/preferences/editor.block_frames` via curl.

Estimated cost: small. Sonnet default model. ~$10–15.

**Phase 13b — Settings UI section**

Add the "Editor block frames" section to `Settings.tsx`. Per-block-type rows
with 4-button toggle groups. Clean button disabled. Changes call the
`useBlockFramesConfig` setter immediately. Handle save errors with an inline
transient message.

No rendering changes in the editor in this sub-phase.

Estimated cost: small-medium. Sonnet default model. ~$15–25.

**Phase 13c — CSS and node attribute wiring**

Wire `data-frame` onto each block's rendered output:
- Add a global Tiptap extension (parallel to `RowIdExtension`) that injects a
  `data-frame` attribute onto each node based on the block type's configured
  frame mode. For atom nodes, clamp `empty` → `always` as described in
  Section 5.
- Add CSS rules for `[data-frame="always"]`, `[data-frame="empty"].is-empty`,
  `[data-frame="never"]`, dark mode variants, and the print suppression rule.
- Verify empty detection for each block type; patch any cases where Tiptap's
  `.is-empty` class is not applied as expected.

Estimated cost: medium. Sonnet default model. ~$20–35.

**Phase 13d (future) — `clean` state tracking**

Add `is_clean` universal attribute via a global extension. Implement the
ProseMirror plugin that sets `is_clean: false` on user input. Update the
adapter to round-trip the attribute. Activate the previously-greyed Clean
toggle in the Settings UI.

This sub-phase should not begin until Phase 13a–c are stable in production and
there is confirmed user demand for the clean/unclean distinction.

Estimated cost: medium. Sonnet default model. ~$25–40.

**Total Phase 13 estimate (13a–c only):** $45–75, excluding Phase 13d.

### 10. Open questions

The following questions should be resolved with the project manager before
Phase 13b begins. They are documented here rather than guessed.

1. **Settings page navigation flow.** The Settings page is currently reached
   via a sidebar link. Confirm this is still the intended entry point, and
   that a new "Editor block frames" section at the bottom of the existing
   page is the right placement (versus a dedicated "Editor settings" sub-page).

2. **`listItem` and `tableRow` in Settings UI.** These are structural
   sub-block types that most users don't think about directly. Should they
   appear as configurable rows in the Settings UI, or should their frame state
   be hardcoded to `never` and hidden from the user? Exposing them adds
   completeness but also cognitive load.

3. **Column child frame vs. column_list frame.** If `column_list` is `never`
   and `column` is `empty`, only the inner column boxes get frames — the
   outer wrapper does not. Is this the intended visual? Alternatively, should
   column children inherit their parent's frame state (no independent setting),
   and the `column_list` setting controls the entire multi-column unit?

4. **Frame behavior during drag operations (Phase 9b).** When a block is being
   dragged (Phase 9b, if/when it ships), should the frame be suppressed on the
   drag ghost to avoid a double-frame artifact? The drag handle extension
   applies its own visual treatment to dragged blocks; the frame CSS should
   probably be suppressed via a `.ProseMirror-selectednode` or
   `.is-dragging` selector rule. Deferred to Phase 9b, but worth noting as
   a coordination point.

5. **High-density frame fatigue.** If a user has `paragraph` set to `always`
   and creates 30 paragraphs in one section, every paragraph gets a 1px
   border. At that density the page may feel like a table. Consider whether
   the default for `paragraph` should be `empty` rather than a configurable
   `always`, and whether the Settings UI should surface a prominent note that
   `always` is intended for sparse structural blocks rather than text-heavy
   sections.

### 11. Related architecture references

The following pointers are for the implementing agent. Each points to a
specific, verified location in the codebase (confirmed by reading these files
during the design phase).

- **`UserPreference` model:** `backend/models.py` line 306 — key/value table,
  `key` is `String` PK, `value` is `String` (not `Text`, but effectively
  unbounded in SQLite). Accepts arbitrary string values, including JSON blobs.

- **`PreferenceRead` / `PreferenceUpdate` schemas:** `backend/schemas.py`
  lines 278–289. Both have a single `value: str` field. No shape constraints
  on the value — the JSON blob approach requires no schema change.

- **Preferences router:** `backend/routers/preferences.py`. `GET /` returns
  `dict[str, str]` of all preferences. `PUT /{key}` upserts a key. No new
  endpoints needed for Phase 13.

- **Frontend API layer:** `frontend/src/api/preferences.ts` — `getPreferences()`
  and `updatePreference(key, value)`. These are the two functions `useBlockFramesConfig`
  will call. No new API functions needed.

- **Settings component:** `frontend/src/components/settings/Settings.tsx`. The
  "Editor block frames" section goes at the bottom of this file, after the
  existing "Conjugate chemistry management" section. The `getPreferences()`
  call on mount (lines 46–53) may be refactored to share data with the new
  hook, or the new hook can issue its own fetch with TanStack Query caching.

- **Tiptap node specs:** `frontend/src/blocks-tiptap/nodes/` — one file per
  custom node type. Starter-kit nodes (`paragraph`, `heading`, `bulletList`,
  etc.) are configured via `StarterKit` in the editor setup, not via files in
  this directory. The `data-frame` global attribute extension goes in a new
  file here, analogous to `rowIdExtension.ts`.

- **`RowIdExtension` (reference implementation):**
  `frontend/src/blocks-tiptap/nodes/rowIdExtension.ts` — the canonical example
  of a global Tiptap attribute extension. Phase 13c's frame attribute extension
  follows the same `addGlobalAttributes()` pattern, with two differences: the
  attribute is `rendered: true` (it must appear in the DOM as `data-frame`)
  and its default value is derived from the user's config rather than being a
  static null.

- **Block content JSON schema:** `ARCHITECTURE.md (§ Experiment Pages)`, "Block
  Content JSON — Notion API Alignment" section. This is the source of truth
  for what's stored in each block's `content` column. Phase 13 adds no new
  fields to block content — frame config lives in `UserPreference`, not in
  individual block rows.

---

## Other deferred items

## Empty column visibility (UX gap)

**Status:** DEFERRED — addressed by Phase 13 (block frames feature)

When a user deletes a panel (or any other content) from inside a column,
the column itself is preserved with a default empty paragraph (per
ProseMirror's `block+` content rule). This is intentional design
choice (b) from the migration discussion — the column structure is
preserved so the user can put new content there. However, in current
rendering, the empty column is visually invisible (no border, no
placeholder, no width collapse), which can feel like a bug to users
who expected the surviving column(s) to reflow and fill the space.

The Phase 13 block-frames feature (configurable `always | empty | never`
frames per block type) is the right fix: with empty-column frames
enabled, the empty space becomes visually obvious as a placeholder ready
for new content. Until then, this is a known visual gap.

To work around manually: select the empty column and use undo (Ctrl+Z)
if the deletion was recent, or use the (eventual) column drag-handle
context menu (Phase 9b) to delete the column explicitly.

## Hand-rolled engine save mechanisms (Phase 12 cleanup target)

The hand-rolled engine has two parallel save patterns that the new
save coordinator (Phase 10b) replaces:

- **Structural ops** in `BlockRenderer.tsx`: direct `await` calls to
  `@/api/experiments.ts` functions (createBlock, updateBlock,
  deleteBlock, reorderBlocks, snapshotPanel) followed by manual
  `qc.invalidateQueries(['experiments', experimentId])`.
- **Content edits** in 4+ child components (`TextBlockEditor`,
  `CalloutBlock`, `TableBlock`, `FlowPanelBlock`, `IFPanelBlock`):
  inline `fetch('/api/v1/experiments/...')` calls with 1500ms
  debounce, `keepalive: true` on unmount, errors silently swallowed.

Phase 12 cleanup deletes both patterns when removing the hand-rolled
engine. The TanStack Query mutation hooks in
`useExperimentBlocks.ts` (currently dead code) become the canonical
API surface, used internally by Phase 10b's save coordinator.

The `_rowId` attribute added in Phase 10a is what enables this
replacement: Phase 10b's transaction inspector identifies which
database rows to save by reading `_rowId` from each Tiptap node.

## Phase 10b-redo — items deferred from this commit

Phase 10b-redo lands the save coordinator + `_rowId` auto-populate
plugin + sandbox wiring. The following pieces are intentionally NOT
in this commit and will be addressed in later phases:

- **Keepalive on unmount.** When the user navigates away with pending
  unsaved changes, we don't yet flush via `keepalive: true`. The
  hand-rolled engine has this; Phase 12 cleanup will port the pattern
  to the save coordinator (or accept the loss and rely on manual
  saves via reload).
- **Compact `sort_order` floats.** The float scheme allows O(1)
  insert-between but loses precision after enough rapid inserts in
  the same gap. A compaction pass that renumbers rows back to integers
  is deferred.
- **Render-count / re-mount tests.** Per the spec, no render-count
  tests in this phase.
- **Manual sandbox verification (Scenarios A/B/C).** The project
  manager runs these in the sandbox before pushing.

## Phase 11 deferred items

The following were considered for Phase 11 and deferred. None block
Phase 12.

- **Hover-copy affordance per block.** A small "copy block" button
  visible on hover. Bundled with Phase 9b's drag-handle work — both
  rely on the same hover-target infrastructure. Phase 9b is deferred
  pending Tiptap peer-dep stabilization.

- **Paste-from-Notion / Tiptap-CDN-formatted content.** External pastes
  arriving as Tiptap-flavored HTML (with `data-type` attributes that
  could match our custom nodes) are not given parseHTML rules. They
  paste as plain text fallback. If users start needing this, add
  parseHTML rules to specific custom node specs.

- **Paste-as-plain-text shortcut.** Cmd+Shift+V to strip all formatting.
  Tiptap supports this via a built-in command but no UI surface is
  added in v0.

- **Cross-experiment paste UX feedback.** When pasting across
  experiments, the user gets no signal that `_rowId`s were stripped.
  In v0 this is silent and works correctly. If users get confused
  ("why are these new rows when I copied existing ones?"), add a
  brief toast or notification.

## Phase 12 — Migration complete (terminal phase)

**Status:** COMPLETE — landed at TBD (filled in after commit).

The Tiptap migration is functionally complete. The new editor is the
canonical experiment-page renderer at `/experiments/:id`. The
hand-rolled `BlockRenderer.tsx` and its child components have been
deleted; their parallel save mechanisms (inline `fetch()` calls in
each child) are gone with them.

Remaining tracked work:

- **Phase 9b/c — drag handles + column drag-resize.** Deferred pending
  Tiptap peer-dep stabilization (`@tiptap/extension-drag-handle-react`
  catching up to 3.22.x) OR a DIY implementation against bare
  `@tiptap/extension-drag-handle`. Tracked separately; not blocking
  any other migration work.

- **Phase 13 — configurable block frames.** Design doc landed in
  earlier MIGRATION_DEFERRED.md sections. Implementation deferred to
  whenever the block-frames feature is prioritized.

- **Phase B — IF panel target/antibody column merge.** Tracked in
  user notes. Post-migration UX work.

- **Microscope import bug.** Pre-existing bug, unrelated to migration,
  tracked separately.

The migration's branch (`migration/tiptap`) is ready to merge to main
after Phase 12's manual verification of cK009.
