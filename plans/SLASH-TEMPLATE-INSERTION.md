# Slash menu — template-aware insertion via `.` dot trigger

Status: **complete**

## Design intent

The slash menu currently inserts only blank blocks. Researchers building
experiments routinely want to insert a flow or IF panel already populated with
targets, antibodies, fluorophores, instrument, and detector assignments from a
previously designed template. Today that means inserting a blank block and
re-entering everything by hand, or using the `+` button path (the
`PanelTemplatePicker` modal — a context switch out of the keyboard-driven
editor flow).

This work adds a keyboard-only inline path: `/` → type a few letters → `.` →
searchable template omnibox → arrow + Enter. No mouse, no modal, no context
switch. The dot key is dedicated as the template trigger because (a) it is
typographically distinct from the slash, (b) users do not typically type `.`
mid-block-name, and (c) it gives a clear escape valve for "I want the template
version" without conflicting with Enter-to-insert-blank.

A registry pattern (`TemplateProvider` interface, `TEMPLATE_PROVIDERS` map keyed
by slash item title) is intentional architecture for extensibility: future
block types with template libraries (qPCR primer panels, plate layouts,
microscope acquisition presets) plug in by implementing the interface, with zero
changes to `SlashMenuList`, `SlashPopupContainer`, or the suggestion plugin
wiring.

`ARCHITECTURE.md (§ Experiment Pages)` is the authoritative source for block
content JSON. This work touches only the insertion path; the persisted block
content shape is unchanged.

## Approach: server-side snapshot-preview endpoint (Option 3a)

The node JSON for a populated panel is produced server-side by a single shared
serializer, so the slash-omnibox path, the (future-wired) modal path, and the
persistence path all emit byte-identical content. The client `buildNodeJSON`
becomes one `fetch()` to a read-only preview endpoint — no client-side field
gathering, no multi-cache reconciliation.

## Implementation steps

1. **`refactor(panels)`** — extract the panel-snapshot serializer from
   `routers/experiments.py::snapshot_panel` into `services/panel_snapshot.py`
   (`build_flow_panel_snapshot`, `build_if_panel_snapshot`), each returning the
   `{ type, attrs }` Tiptap node shape. The `snapshot_panel` route is rewired to
   call the helpers and wrap the result in an `ExperimentBlock`. Behavior
   unchanged; existing tests still pass.
2. **`feat(api)`** — `GET /api/v1/panels/{id}/snapshot-preview` and
   `GET /api/v1/if-panels/{id}/snapshot-preview`, returning the serializer
   output as `PanelSnapshotPreview { type, attrs }`. No DB writes. Pytest asserts
   the preview JSON matches what `snapshot_panel` embeds for the same template.
3. **`feat(slashMenu)`** — `TemplateProvider` interface + registry skeleton
   (`templateProviders/types.ts`, `index.ts`, stub `flowProvider`/`ifProvider`).
4. **`feat(slashMenu)`** — flow + IF providers. `buildNodeJSON` is a single
   `fetch()` to the preview endpoint. `prefetchList`/`readList`/`isListLoading`
   operate on the TanStack list caches.
5. **`feat(slashMenu)`** — thread `QueryClient` through the extension options;
   prefetch both template lists on slash-menu open.
6. **`feat(slashMenu)`** — `SlashPopupContainer` owning `'list' | 'omnibox'`
   mode, routing keys, and intercepting `.` (swallowed always; switches to
   omnibox only when the highlighted item has a provider).
7. **`feat(slashMenu)`** — `TemplateOmnibox` component. `buildNodeJSON` is async
   and fast (one HTTP round trip); a brief loading state shows on Enter/click.
8. **`test(slashMenu)`** — dot-trigger, omnibox, and provider coverage.
   Providers test against a simple `fetch` mock.
9. **`docs(conventions)`** — templateProvider registry pattern + snapshot-preview
   convention; mark this plan complete.

## Decision log

- **Option 3a (preview endpoint) chosen over client-side reimplementation.** A
  single server-side source of truth (`services/panel_snapshot.py`) eliminates
  drift risk between the persistence path and the insertion path. The detail
  endpoints (`GET /panels/{id}`, `/if-panels/{id}`) omit fields the snapshot
  embeds (dilution factors needed for volume math, antibody host/clone,
  fluorophore/detector/filter display names, the full nested
  instrument/microscope); reproducing those client-side would have meant
  gathering from multiple caches with ongoing backend-sync burden. The
  (currently unwired) `PanelTemplatePicker` modal path will adopt the same
  endpoint when it is wired up.
- This supersedes the original phase prompt's "no `snapshot-panel`" forbidden
  pattern, which was written assuming a reusable client-side transform already
  existed behind `PanelTemplatePicker`. It did not — the only live transform was
  the server-side `snapshot_panel` route.

## Lessons learned

- **The prompt's premise was wrong, and finding that out early saved the most
  time.** The phase prompt assumed a reusable client-side panel-snapshot
  transform already existed behind `PanelTemplatePicker` and forbade touching
  the `snapshot-panel` backend. Investigation showed no such client transform
  existed — the server-side `snapshot_panel` route was the only live transform.
  Surfacing this before writing code (rather than reimplementing the serializer
  client-side and silently drifting from the backend) is what made Option 3a
  possible. Validate the "ground truth" section of a prompt against the actual
  code before building on it.

- **QueryClient threading: configure-time injection over a factory.** The shared
  `tiptapExtensions` array is imported by 15+ test files and two live editor
  sites. Rather than convert it to a factory `makeExtensions(queryClient)` (which
  would have rippled into every importer), the extension declares a
  `queryClient: QueryClient | null` option defaulting to `null`, and the two live
  sites (`ExperimentPage`, `TiptapSandbox`) swap in a configured copy via
  `extensions.map(ext => ext === SlashMenu ? SlashMenu.configure({ queryClient }) : ext)`.
  Tests that never open the omnibox keep importing the array untouched. Trade-off:
  the option is nullable, so the suggestion plugin must tolerate a null client
  (prefetch is skipped) — acceptable because the omnibox can't be reached without
  a real editor mount anyway.

- **The space in `/Flow panel` is load-bearing and nearly broke teardown.**
  `@tiptap/suggestion` with `allowSpaces: false` deactivates the moment the query
  contains a space, firing `onExit`. Autocompleting the query to `/Flow panel`
  therefore tears the popup down right as we want to swap it to the omnibox. The
  fix is ordering: `onActivateOmnibox()` sets an `omniboxActive` closure flag
  *before* `expandQueryToTitle()` inserts the spaced title, and `onExit` early-
  returns while that flag is set. The omnibox then owns its own lifecycle (focused
  input owns keys; teardown via `onClose`). Any future trigger that autocompletes
  to a multi-word title must set the guard before mutating the doc.

- **One server-side serializer is the whole point.** Extracting
  `build_flow_panel_snapshot` / `build_if_panel_snapshot` into
  `services/panel_snapshot.py` and having both the persistence route and the
  preview endpoints call them means the insertion path and the persistence path
  are byte-identical by construction — verified by a pytest that strips the random
  per-row instance ids and asserts equality. The client `buildNodeJSON` collapses
  to a single `fetch()`. This is the pattern any future templated block type
  should copy.
